
/**
 * fnOS（飞牛音乐）专用路由。
 *
 * fnOS 音源模式下：
 *   - 搜索走 /api/fnos/search（查 NAS 曲库）
 *   - 登录测试走 /api/fnos/test（校验 NAS 凭据）
 *   - 首页走 /api/fnos/home
 *   - 专辑页 /api/fnos/album/:guid
 *   - 艺术家页 /api/fnos/artist/:guid
 *
 * 凭据存在 storage 的 'fnos-profile'（由 source store 管理），
 * 也接受请求里临时传入的 base/username/password（登录页测试连接用）。
 */

import express from 'express';
import _debug from 'debug';

import fnos from '../fnos';
import storage from '../../common/storage';

const error = _debug('dev:error');
const router = express();

const FNOS_PROFILE_KEY = 'fnos-profile';

/**
 * 取 fnOS 凭据：优先用请求参数，否则用已保存的。
 */
async function resolveConf(query = {}) {
    if (query.base && query.username && query.password) {
        return {
            base: String(query.base).replace(/\/+$/, ''),
            username: query.username,
            password: query.password,
        };
    }

    var saved = await storage.get(FNOS_PROFILE_KEY);

    if (!saved || !saved.base || !saved.username || !saved.password) {
        return null;
    }

    return saved;
}

/**
 * 把 fnOS 的 track 对象转成 ieaseMusic 的歌曲结构。
 *
 * album.link / artists[].link 必须有值 —— 前端 Controller、Playing 组件
 * 直接用它们做 <Link to={...}>，缺了会抛
 * "You must specify the \"to\" property"，整页白屏。
 */
function toSong(track, base) {
    var spec = track.audioSpec || {};

    return {
        id: track.guid,
        name: track.title,
        duration: track.duration,
        link: '/',
        album: {
            id: track.album && track.album.guid,
            name: track.album && track.album.name,
            cover: track.coverId
                ? `${base}/music/api/v1/static/cover?coverId=${track.coverId}&size=300`
                : null,
            link: track.album && track.album.guid
                ? `/fnos/album/${track.album.guid}`
                : '/',
        },
        artists: (track.artists || []).map(a => ({
            id: a.guid,
            name: a.name,
            link: a.guid ? `/fnos/artist/${a.guid}` : '/',
        })),
        // fnOS 特有字段，前端用来取封面与歌词
        guid: track.guid,
        coverId: track.coverId || null,
        format: spec.format || null,
        bitRate: spec.bitrate || null,
    };
}

/**
 * 封面地址。没有 coverId 时返回 null（前端会显示占位图）。
 */
function coverUrl(coverId, base, size = 300) {
    return coverId
        ? `${base}/music/api/v1/static/cover?coverId=${coverId}&size=${size}`
        : null;
}

/**
 * 登录并返回一个带 token 的请求函数，省得每个路由都写一遍。
 */
async function withSession(query) {
    var conf = await resolveConf(query);

    if (!conf) {
        return null;
    }

    var token = await fnos.login(conf.base, conf.username, conf.password, {
        insecure: true,
        deviceId: '0123456789abcdef0123456789abcdef',
    });

    return {
        conf,
        token,
        get: (path, params) => fnos.request(conf.base, path, {
            params,
            token,
            insecure: true,
        }),
    };
}

/**
 * GET /api/fnos/test
 *
 * 校验 NAS 凭据能否登录。用于登录页的「测试连接」。
 */
router.get('/test', async(req, res) => {
    var c = await resolveConf(req.query);

    if (!c) {
        res.send({
            success: false,
            error: 'fnOS 凭据未配置',
        });
        return;
    }

    try {
        var login = await fnos.loginWithUser(c.base, c.username, c.password, {
            insecure: true,
            deviceId: '0123456789abcdef0123456789abcdef',
        });

        var response = await fnos.request(c.base, '/music/api/v1/track/list', {
            params: { page: 1, size: 1 },
            token: login.token,
            insecure: true,
        });

        res.send({
            success: true,
            trackCount: (response.data && response.data.total) || 0,
            user: login.user,
        });
    } catch (ex) {
        error('fnOS test failed: %s', ex.message);
        res.send({
            success: false,
            error: ex.message,
        });
    }
});

/**
 * GET /api/fnos/search?q=&type=&page=&size=
 *
 * 搜索 NAS 曲库。
 *
 * type:
 *   track  (默认) 曲目
 *   album  专辑
 *   artist 艺术家
 *
 * 返回 ieaseMusic 的结构，link 指向对应的 fnOS 页面。
 */
router.get('/search', async(req, res) => {
    var q = (req.query.q || '').trim();
    var type = req.query.type || 'track';
    var page = +req.query.page || 1;
    var size = +req.query.size || 24;

    if (!q) {
        res.send({ list: [], total: 0 });
        return;
    }

    var session = await withSession();

    if (!session) {
        res.send({ list: [], total: 0 });
        return;
    }

    try {
        if (type === 'album') {
            var albums = await session.get('/music/api/v1/search/album', { q, page, size });
            var albumData = albums.data || {};
            var albumList = albumData.list || [];

            res.send({
                list: albumList.map(item => ({
                    id: item.guid,
                    name: item.name,
                    type: 1,
                    size: item.trackCount,
                    link: `/fnos/album/${item.guid}`,
                    cover: coverUrl(item.coverId, session.conf.base),
                    background: coverUrl(item.coverId, session.conf.base),
                    artists: (item.artists || []).map(a => ({ name: a.name })),
                    guid: item.guid,
                })),
                total: albumData.total || 0,
                page,
                size,
            });

            return;
        }

        if (type === 'artist') {
            var artists = await session.get('/music/api/v1/search/artist', { q, page, size });
            var artistData = artists.data || {};
            var artistList = artistData.list || [];

            res.send({
                list: artistList.map(item => ({
                    id: item.guid,
                    name: item.name,
                    type: 1,
                    size: item.trackCount,
                    link: `/fnos/artist/${item.guid}`,
                    cover: coverUrl(item.coverId, session.conf.base),
                    background: coverUrl(item.coverId, session.conf.base),
                    artists: [{ name: item.name }],
                    guid: item.guid,
                })),
                total: artistData.total || 0,
                page,
                size,
            });

            return;
        }

        var response = await session.get('/music/api/v1/search/track', { q, page, size });
        var data = response.data || {};
        var list = data.list || [];

        res.send({
            list: list.map(t => toSong(t, session.conf.base)),
            total: data.total || 0,
            page,
            size,
        });
    } catch (ex) {
        error('fnOS search failed: %s', ex.message);
        res.send({ list: [], total: 0 });
    }
});

/**
 * GET /api/fnos/track/:guid
 *
 * 取单曲详情（含封面与歌词 guid）。
 */
router.get('/track/:guid', async(req, res) => {
    var guid = req.params.guid;
    var c = await resolveConf();

    if (!c) {
        res.send({});
        return;
    }

    try {
        var token = await fnos.login(c.base, c.username, c.password, {
            insecure: true,
            deviceId: '0123456789abcdef0123456789abcdef',
        });

        var response = await fnos.request(c.base, '/music/api/v1/track/metadata', {
            params: { guid },
            token,
            insecure: true,
        });

        var track = response.data && response.data.track;

        if (!track) {
            res.send({});
            return;
        }

        res.send(toSong(track, c.base));
    } catch (ex) {
        error('fnOS track failed: %s', ex.message);
        res.send({});
    }
});

/**
 * GET /api/fnos/home
 *
 * fnOS 模式的首页。
 *
 * 返回结构与网易云的 /api/home 对齐（list[0]=我的音乐、list[1]=推荐、
 * list[2]=兜底），前端按索引取 list[0]/list[1] 才不会读到 undefined。
 *
 * fnOS 没有「收藏」「每日推荐」，所以：
 *   list[0] = 最近添加的曲目（可直接播）
 *   list[1] = 最近添加的专辑
 *   list[2] = 曲目最多的艺术家
 *
 * 专辑/艺术家没有对应页面，link 指向 '/'（能点，回到首页）。
 */
router.get('/home', async(req, res) => {
    var c = await resolveConf();

    if (!c) {
        res.send({ list: [] });
        return;
    }

    try {
        var token = await fnos.login(c.base, c.username, c.password, {
            insecure: true,
            deviceId: '0123456789abcdef0123456789abcdef',
        });

        var [tracks, albums, artists] = await Promise.all([
            fnos.request(c.base, '/music/api/v1/track/list', {
                params: { page: 1, size: 30, sort: 'createdAt,desc' },
                token,
                insecure: true,
            }),
            fnos.request(c.base, '/music/api/v1/album/list', {
                params: { page: 1, size: 12, sort: 'newTrackAddedAt,desc' },
                token,
                insecure: true,
            }),
            fnos.request(c.base, '/music/api/v1/artist/list', {
                params: { page: 1, size: 12, sort: 'albumCount,desc' },
                token,
                insecure: true,
            }),
        ]);

        var trackList = (tracks.data && tracks.data.list) || [];
        var albumList = (albums.data && albums.data.list) || [];
        var artistList = (artists.data && artists.data.list) || [];

        var cover = id => coverUrl(id, c.base);

        res.send({
            list: [
                // list[0] —— 最近添加的曲目，首页直接可播
                {
                    id: 'FNOS_RECENT',
                    name: '最近添加',
                    type: 0,
                    size: trackList.length,
                    link: '/',
                    songs: trackList.map(t => toSong(t, c.base)),
                },
                // list[1] —— 最近添加的专辑
                albumList.map(item => ({
                    id: item.guid,
                    name: item.name,
                    type: 1,
                    size: item.trackCount,
                    link: `/fnos/album/${item.guid}`,
                    cover: cover(item.coverId),
                    background: cover(item.coverId),
                    artists: (item.artists || []).map(a => ({ name: a.name })),
                    guid: item.guid,
                })),
                // list[2] —— 曲目最多的艺术家
                artistList.map(item => ({
                    id: item.guid,
                    name: item.name,
                    type: 1,
                    size: item.trackCount,
                    link: `/fnos/artist/${item.guid}`,
                    cover: cover(item.coverId),
                    background: cover(item.coverId),
                    artists: [{ name: item.name }],
                    guid: item.guid,
                })),
            ],
        });
    } catch (ex) {
        error('fnOS home failed: %s', ex.message);
        res.send({ list: [] });
    }
});

/**
 * GET /api/fnos/album/:guid
 *
 * fnOS 专辑页：专辑详情 + 曲目列表。
 */
router.get('/album/:guid', async(req, res) => {
    var guid = req.params.guid;
    var session = await withSession(req.query);

    if (!session) {
        res.send({});
        return;
    }

    try {
        var [detail, tracks] = await Promise.all([
            session.get('/music/api/v1/album/detail', { guid }),
            session.get('/music/api/v1/track/album-detail/list', {
                albumGUID: guid,
                sort: 'trackNo,asc',
                page: 1,
                size: 200,
            }),
        ]);

        var album = detail.data || {};
        var list = (tracks.data && tracks.data.list) || [];

        res.send({
            id: album.guid || guid,
            name: album.name || '',
            cover: coverUrl(album.coverId, session.conf.base, 500),
            background: coverUrl(album.coverId, session.conf.base, 800),
            releaseDate: album.releaseDate || null,
            trackCount: album.trackCount || list.length,
            artists: (album.artists || []).map(a => ({
                id: a.guid,
                name: a.name,
                link: a.guid ? `/fnos/artist/${a.guid}` : '/',
            })),
            songs: list.map(t => toSong(t, session.conf.base)),
        });
    } catch (ex) {
        error('fnOS album failed: %s', ex.message);
        res.send({});
    }
});

/**
 * GET /api/fnos/artist/:guid
 *
 * fnOS 艺术家页：艺术家详情 + 专辑列表 + 曲目列表。
 */
router.get('/artist/:guid', async(req, res) => {
    var guid = req.params.guid;
    var session = await withSession(req.query);

    if (!session) {
        res.send({});
        return;
    }

    try {
        var [detail, albums, tracks] = await Promise.all([
            session.get('/music/api/v1/artist/detail', { guid }),
            session.get('/music/api/v1/album/artist-detail/list', {
                artistGUID: guid,
                page: 1,
                size: 100,
            }),
            session.get('/music/api/v1/track/artist-detail/list', {
                artistGUID: guid,
                page: 1,
                size: 200,
            }),
        ]);

        var artist = detail.data || {};
        var albumList = (albums.data && albums.data.list) || [];
        var trackList = (tracks.data && tracks.data.list) || [];

        res.send({
            id: artist.guid || guid,
            name: artist.name || '',
            cover: coverUrl(artist.coverId, session.conf.base, 500),
            background: coverUrl(artist.coverId, session.conf.base, 800),
            albumCount: artist.albumCount || albumList.length,
            trackCount: artist.trackCount || trackList.length,
            albums: albumList.map(item => ({
                id: item.guid,
                name: item.name,
                type: 1,
                size: item.trackCount,
                link: `/fnos/album/${item.guid}`,
                cover: coverUrl(item.coverId, session.conf.base),
                background: coverUrl(item.coverId, session.conf.base),
                artists: (item.artists || []).map(a => ({ name: a.name })),
                guid: item.guid,
            })),
            songs: trackList.map(t => toSong(t, session.conf.base)),
        });
    } catch (ex) {
        error('fnOS artist failed: %s', ex.message);
        res.send({});
    }
});

module.exports = router;
