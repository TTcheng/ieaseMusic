
import crypto from 'crypto';
import http from 'http';
import _debug from 'debug';
import chalk from 'chalk';

import fnos from '../fnos';
import { pick, PREFERRED } from './fnos-match';
import storage from '../../common/storage';
import { readFnosProfile } from '../../common/source';

const debug = _debug('dev:plugin:Fnos');
const error = _debug('dev:plugin:Fnos:error');

/**
 * 飞牛音乐（fnOS）音源。
 *
 * 用 NAS 上「飞牛音乐」应用自建的曲库作为音源：按歌名/艺术家搜索本机曲库，
 * 命中后经本地流代理回源播放。
 *
 * 之所以需要代理：fnOS 的音频流接口要求 Cookie(music-token) + authx 签名头，
 * 渲染进程的 <audio src> 无法携带自定义请求头，只能由主进程转发。
 */

// 登录态缓存：{ base, token, fingerprint }
let session = null;

// 本地流代理
let proxyServer = null;
let proxyPort = 0;

/**
 * 读取 fnOS 连接信息。
 *
 * 存在 storage 的 'fnos-profile'（由 source store 写入），
 * 兼容旧的 preferences.fnos。
 */
async function getConfig() {
    var saved = await readFnosProfile();

    if (!saved) {
        // 兼容旧的 preferences.fnos（老版本把 fnOS 配置放在 preferences 里）
        var preferences = await storage.get('preferences') || {};
        saved = preferences.fnos || {};
    }

    if (!saved.base || !saved.username || !saved.password) {
        throw Error('fnOS is not configured');
    }

    return {
        base: String(saved.base).replace(/\/+$/, ''),
        username: saved.username,
        password: saved.password,
        insecure: true,
    };
}

function deviceId() {
    // 与官方前端一致：32 位十六进制
    return crypto.randomBytes(16).toString('hex');
}

/**
 * 取一个可用的 userToken，必要时重新登录。
 */
async function getToken(config, force) {
    var fingerprint = `${config.base}|${config.username}`;

    if (!force && session && session.fingerprint === fingerprint && session.token) {
        return session.token;
    }

    var token = await fnos.login(config.base, config.username, config.password, {
        insecure: config.insecure,
        deviceId: deviceId(),
    });

    session = { base: config.base, token, fingerprint };

    debug('fnOS logged in as %s', config.username);

    return token;
}

/**
 * 本地流代理：把渲染进程的无头 GET 转发成带签名与 Cookie 的 fnOS 流请求。
 */
function createProxy() {
    if (proxyServer) {
        return Promise.resolve(proxyPort);
    }

    return new Promise(resolve => {
        proxyServer = http.createServer(async(req, res) => {
            var match = /^\/stream\/([a-zA-Z0-9]+)/.exec(req.url || '');

            if (!match) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('not found');
                return;
            }

            var guid = match[1];

            try {
                var config = await getConfig();
                var token = await getToken(config);

                var upstream = await fnos.openStream(config.base, '/music/api/v1/track/stream', {
                    params: { guid },
                    token,
                    insecure: config.insecure,
                    range: req.headers.range,
                });

                var headers = {
                    'Content-Type': upstream.headers['content-type'] || 'application/octet-stream',
                    'Accept-Ranges': upstream.headers['accept-ranges'] || 'bytes',
                };

                if (upstream.headers['content-length']) {
                    headers['Content-Length'] = upstream.headers['content-length'];
                }

                if (upstream.headers['content-range']) {
                    headers['Content-Range'] = upstream.headers['content-range'];
                }

                res.writeHead(upstream.statusCode || 200, headers);
                upstream.pipe(res);

                upstream.on('error', err => {
                    error('fnOS stream error: %s', err.message);
                    res.destroy();
                });
            } catch (ex) {
                error('fnOS proxy error: %s', ex.message);
                if (!res.headersSent) {
                    res.writeHead(502, { 'Content-Type': 'text/plain' });
                }
                res.end('fnOS proxy error');
            }
        });

        proxyServer.on('error', err => {
            error('fnOS proxy server error: %s', err.message);
        });

        proxyServer.listen(0, '127.0.0.1', () => {
            proxyPort = proxyServer.address().port;
            debug('fnOS stream proxy listening on 127.0.0.1:%d', proxyPort);
            resolve(proxyPort);
        });
    });
}

export default async(request, keyword, artists, idOrFlac) => {
    debug(chalk.black.bgGreen('💊  Loaded fnOS music.'));

    // getTrack 传的是网易歌曲 id，getFlac 传的是 true
    var wantFlac = idOrFlac === true;

    try {
        var config = await getConfig();
        var token = await getToken(config);
        var tracks;
        var match = null;

        // fnOS 模式下 id 就是曲库的 guid，直接取详情最准；
        // 失败再退回「按歌名搜索 + 匹配」。
        if (idOrFlac !== true && typeof idOrFlac === 'string' && idOrFlac.length === 32) {
            try {
                var meta = await fnos.request(config.base, '/music/api/v1/track/metadata', {
                    params: { guid: idOrFlac },
                    token,
                    insecure: config.insecure,
                });

                if (meta.data && meta.data.track) {
                    match = meta.data.track;
                }
            } catch (ex) {
                debug('fnOS metadata failed, fallback to search: %s', ex.message);
            }
        }

        if (!match) {
            try {
                tracks = await fnos.searchTracks(config.base, token, keyword, {
                    insecure: config.insecure,
                    size: 24,
                });
            } catch (ex) {
                // 登录态过期，重登一次再试
                if (ex.status !== 401) {
                    throw ex;
                }

                token = await getToken(config, true);
                tracks = await fnos.searchTracks(config.base, token, keyword, {
                    insecure: config.insecure,
                    size: 24,
                });
            }

            if (!tracks || !tracks.length) {
                return Promise.reject(Error(404));
            }

            match = pick(tracks, keyword, artists);

            if (!match) {
                return Promise.reject(Error(404));
            }
        }

        var spec = match.audioSpec || {};
        var format = String(spec.format || spec.extension || '').toLowerCase();

        if (wantFlac && format !== 'flac') {
            return Promise.reject(Error(404));
        }

        if (!PREFERRED[format]) {
            // 浏览器放不了的格式（如 ncm）
            return Promise.reject(Error(404));
        }

        var port = await createProxy();
        var song = {
            src: `http://127.0.0.1:${port}/stream/${match.guid}`,
        };

        if (spec.bitrate) {
            song.bitRate = spec.bitrate;
        }

        if (format === 'flac') {
            song.isFlac = true;
        }

        return song;
    } catch (ex) {
        error('Fnos provider failed: %s', ex && ex.message ? ex.message : ex);
        return Promise.reject(ex);
    }
};

export const closeProxy = () => {
    if (proxyServer) {
        proxyServer.close();
        proxyServer = null;
        proxyPort = 0;
    }
};
