
/**
 * fnOS（飞牛音乐）专用路由。
 *
 * fnOS 音源模式下：
 *   - 搜索走 /api/fnos/search（查 NAS 曲库）
 *   - 登录测试走 /api/fnos/test（校验 NAS 凭据）
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
 * fnOS 模式没有专辑/歌手页面，指向根路径（合法且不会跳到不存在的路由）。
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
            link: '/',
        },
        artists: (track.artists || []).map(a => ({
            id: a.guid,
            name: a.name,
            link: '/',
        })),
        // fnOS 特有字段，前端用来取封面与歌词
        guid: track.guid,
        coverId: track.coverId || null,
        format: spec.format || null,
        bitRate: spec.bitrate || null,
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
 * GET /api/fnos/search?q=&page=&size=
 *
 * 搜索 NAS 曲库，返回 ieaseMusic 的歌曲结构。
 */
router.get('/search', async(req, res) => {
    var q = (req.query.q || '').trim();
    var page = +req.query.page || 1;
    var size = +req.query.size || 24;

    if (!q) {
        res.send({ list: [], total: 0 });
        return;
    }

    var c = await resolveConf();

    if (!c) {
        res.send({ list: [], total: 0 });
        return;
    }

    try {
        var token = await fnos.login(c.base, c.username, c.password, {
            insecure: true,
            deviceId: '0123456789abcdef0123456789abcdef',
        });

        var response = await fnos.request(c.base, '/music/api/v1/search/track', {
            params: { q, page, size },
            token,
            insecure: true,
        });

        var data = response.data || {};
        var list = data.list || [];

        res.send({
            list: list.map(t => toSong(t, c.base)),
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

        var cover = id => id
            ? `${c.base}/music/api/v1/static/cover?coverId=${id}&size=300`
            : null;

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
                    link: '/',
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
                    link: '/',
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

module.exports = router;
