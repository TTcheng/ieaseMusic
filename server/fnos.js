
/**
 * fnOS (飞牛) 音乐服务 API 客户端。
 *
 * 协议逆向自 NAS 上安装的官方「飞牛音乐」前端 bundle
 * (/var/apps/trim.music/target/static/assets/*.js)：
 *   - 网关前缀   {origin}/music/api/v1
 *   - 认证       Cookie: music-token={userToken}
 *   - 登录       POST /user/password-login，密码传 sha256
 *
 * 关于官方前端那套 authx 签名：
 *   官方 bundle 会给每个请求加一个 authx 头，形如
 *     authx: nonce={6位}&timestamp={毫秒}&sign={md5}
 *   签名用两个写死在 bundle 里的常量拼 md5 算出来。
 *
 *   但实测服务端根本不校验它 —— 带有效 music-token 时，
 *   正确签名 / 错误签名 / 空签名 / 完全不带 authx 头，
 *   返回结果完全一致，连写端点（POST /playlist/create）也一样。
 *   那两个常量在官方 bundle 里是明文可见的（浏览器打开飞牛音乐就能读到），
 *   本质上是装饰。
 *
 *   所以这里不实现签名，只保留真正起作用的 music-token 鉴权。
 *   如果将来 fnOS 真的开始校验签名，再照上面那段补回来即可。
 *
 * 本文件只依赖 node 内置模块，方便离线自检（bin/fnos-check.js）。
 */

import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { URL, URLSearchParams } from 'url';

const sha256 = value => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');

function buildUrl(base, pathname, params) {
    var search = new URLSearchParams();

    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            search.append(key, String(value));
        }
    });

    var query = search.toString();

    return `${String(base).replace(/\/+$/, '')}${pathname}${query ? `?${query}` : ''}`;
}

/**
 * 把 URL 拆成 http.request 认识的 options。
 */
function parseUrl(url) {
    var parsed = new URL(url);

    return {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        href: url,
    };
}

/**
 * 发一个 JSON 请求，返回 { status, data, raw, headers }。
 * data 为已解信封的 data 字段；非 JSON 响应时为原始字符串。
 *
 * 401 会抛出带 status 属性的错误，便于上层重新登录后重试。
 */
function request(base, pathname, options = {}) {
    var { method = 'GET', params, body, token, insecure } = options;
    var url = buildUrl(base, pathname, params);
    var payload = body === undefined || body === null ? undefined : JSON.stringify(body);
    var transport = url.startsWith('https:') ? https : http;

    return new Promise((resolve, reject) => {
        // 注意：只能传两个参数。
        // agent-base 的 patch-core.js 会把 https.request 换成
        // function(_options, cb) 的两参版本（用来判断是否 https），
        // 传第三个参数时它会被当成 cb，最终报
        // "The listener argument must be of type function"。
        // 所以把 url 拆进 options，整体传。
        var reqOptions = Object.assign(parseUrl(url), {
            method,
            headers: headersOf(token),
            rejectUnauthorized: !insecure,
            timeout: 15000,
        });

        var req = transport.request(reqOptions, res => {
            var chunks = [];

            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                var raw = Buffer.concat(chunks).toString('utf8');
                var data = raw;

                try {
                    var envelope = JSON.parse(raw);

                    data = envelope && typeof envelope === 'object' && 'data' in envelope
                        ? envelope.data
                        : envelope;
                } catch (ex) {
                    // 非 JSON 响应，保持原文
                }

                if (res.statusCode === 401) {
                    var unauthorized = Error(`fnOS unauthorized: ${pathname}`);

                    unauthorized.status = 401;
                    reject(unauthorized);
                    return;
                }

                resolve({ status: res.statusCode, data, raw, headers: res.headers });
            });
        });

        req.on('timeout', () => {
            req.destroy(Error(`fnOS request timeout: ${pathname}`));
        });
        req.on('error', reject);

        if (payload !== undefined) {
            req.write(payload);
        }

        req.end();
    });
}

/**
 * 请求头。只有 Cookie 里的 music-token 是服务端真正校验的。
 */
function headersOf(token, accept) {
    var headers = {
        Accept: accept || 'application/json',
    };

    if (token) {
        headers.Cookie = `music-token=${encodeURIComponent(token)}`;
    }

    return headers;
}

/**
 * 打开一个二进制流（音频），返回上游 IncomingMessage，由调用方 pipe。
 *
 * 只在 401 时抛错，其余状态码交由调用方判断（404 的 JSON 错误体也可能是业务错误）。
 */
function openStream(base, pathname, options = {}) {
    var { params, token, insecure, range } = options;
    var url = buildUrl(base, pathname, params);
    var transport = url.startsWith('https:') ? https : http;

    return new Promise((resolve, reject) => {
        var headers = headersOf(token, '*/*');

        if (range) {
            headers.Range = range;
        }

        var reqOptions = Object.assign(parseUrl(url), {
            method: 'GET',
            headers,
            rejectUnauthorized: !insecure,
            timeout: 20000,
        });

        var req = transport.request(reqOptions, res => {
            if (res.statusCode === 401) {
                res.resume();
                var unauthorized = Error(`fnOS unauthorized: ${pathname}`);

                unauthorized.status = 401;
                reject(unauthorized);
                return;
            }

            resolve(res);
        });

        req.on('timeout', () => {
            req.destroy(Error(`fnOS stream timeout: ${pathname}`));
        });
        req.on('error', reject);
        req.end();
    });
}

/**
 * 搜索 NAS 曲库，返回 track 列表。
 */
async function searchTracks(base, token, keyword, options = {}) {
    var { insecure, page = 1, size = 24 } = options;
    var response = await request(base, '/music/api/v1/search/track', {
        params: { q: keyword, page, size },
        token,
        insecure,
    });

    if (response.status !== 200) {
        throw Error(`fnOS search failed: ${response.status}`);
    }

    return (response.data && response.data.list) || [];
}

/**
 * 密码登录，取回 userToken。
 */

/**
 * 把 music-token 同步进 Chromium 的 cookie 罐。
 *
 * 渲染进程直接 <img src="https://nas:.../static/cover"> 加载封面，
 * 没法自己带 token，不带就是 401，封面全裂。
 * 登录后由主进程写一条 cookie，之后同主机的请求自动带上。
 *
 * 纯 Node 环境（bin/fnos-check.js 自检）没有 electron，直接跳过。
 */
async function syncTokenCookie(base, token) {
    if (!token) {
        return;
    }

    try {
        var electron = require('electron');
        var ses = electron.session || (electron.remote && electron.remote.session);

        if (!ses || !ses.defaultSession) {
            return;
        }

        // Electron 4 的 cookies API 是回调式的
        await new Promise((resolve, reject) => {
            ses.defaultSession.cookies.set({
                url: base,
                name: 'music-token',
                value: token,
                secure: /^https/i.test(base),
            }, err => (err ? reject(err) : resolve()));
        });
    } catch (ex) {
        // 自检 / 测试环境忽略
    }
}

async function login(base, username, password, options = {}) {
    var { insecure, deviceId } = options;
    var response = await request(base, '/music/api/v1/user/password-login', {
        method: 'POST',
        body: {
            username,
            password: sha256(password),
            deviceId,
        },
        insecure,
    });

    var data = response.data || {};

    if (!data.userToken) {
        throw Error(`fnOS login failed: ${data.msg || response.status}`);
    }

    await syncTokenCookie(base, data.userToken);

    return data.userToken;
}

/**
 * 密码登录，取回 userToken 与用户信息。
 */
async function loginWithUser(base, username, password, options = {}) {
    var { insecure, deviceId } = options;
    var response = await request(base, '/music/api/v1/user/password-login', {
        method: 'POST',
        body: {
            username,
            password: sha256(password),
            deviceId,
        },
        insecure,
    });

    var data = response.data || {};

    if (!data.userToken) {
        throw Error(`fnOS login failed: ${data.msg || response.status}`);
    }

    await syncTokenCookie(base, data.userToken);

    return {
        token: data.userToken,
        user: data.user || {},
    };
}

export default {
    sha256,
    buildUrl,
    parseUrl,
    request,
    openStream,
    searchTracks,
    login,
    loginWithUser,
};
