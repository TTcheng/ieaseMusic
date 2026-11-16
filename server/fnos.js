
/**
 * fnOS (飞牛) 音乐服务 API 客户端。
 *
 * 协议逆向自 NAS 上安装的官方「飞牛音乐」前端 bundle
 * (/var/apps/trim.music/target/static/assets/*.js)：
 *   - 网关前缀   {origin}/music/api/v1
 *   - 认证       Cookie: music-token={userToken}
 *   - 签名       authx: nonce={6位}&timestamp={毫秒}&sign={md5}
 *     sign = md5(SECRET + "_" + pathname + "_" + nonce + "_" + timestamp + "_" + bodyHash + "_" + KEY)
 *     bodyHash(GET)  = md5(decodeURIComponent(排序后的 query string))
 *     bodyHash(POST) = md5(JSON.stringify(body))
 *
 * 本文件只依赖 node 内置模块 + debug，方便离线自检（bin/fnos-check.js）。
 */

import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { URLSearchParams } from 'url';

const API_SECRET = 'REMOVED_SECRET';
const API_KEY = 'REMOVED_KEY';

const md5 = value => crypto.createHash('md5').update(String(value), 'utf8').digest('hex');
const sha256 = value => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');

/**
 * 与官方前端一致的 query 规范化：按键名排序，空格转 %20。
 */
function canonicalQuery(params) {
    var search = new URLSearchParams();

    Object.keys(params || {}).sort().forEach(key => {
        if (params[key] !== undefined && params[key] !== null) {
            search.append(key, String(params[key]));
        }
    });

    return search.toString().replace(/\+/g, '%20');
}

/**
 * 生成 authx 请求头。
 *
 * nonce / timestamp 可注入，仅为让自检可复现。
 */
function sign(pathname, method, params, body, options = {}) {
    var source;

    if (String(method).toUpperCase() === 'GET') {
        var canonical = canonicalQuery(params);

        try {
            source = decodeURIComponent(canonical);
        } catch (ex) {
            source = canonical;
        }
    } else {
        source = body === undefined || body === null ? '' : JSON.stringify(body);
    }

    var nonce = options.nonce || String(Math.floor(Math.random() * 9e5) + 1e5);
    var timestamp = options.timestamp || String(Date.now());
    var hash = md5([API_SECRET, pathname, nonce, timestamp, md5(source), API_KEY].join('_'));

    return `nonce=${nonce}&timestamp=${timestamp}&sign=${hash}`;
}

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

function headersOf(pathname, method, params, body, token, accept) {
    var headers = {
        Accept: accept || 'application/json',
        authx: sign(pathname, method, params, body),
    };

    if (token) {
        headers.Cookie = `music-token=${encodeURIComponent(token)}`;
    }

    if (body !== undefined && body !== null) {
        headers['Content-Type'] = 'application/json';
    }

    return headers;
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
        var req = transport.request(url, {
            method,
            headers: headersOf(pathname, method, params, body, token),
            rejectUnauthorized: !insecure,
            timeout: 15000,
        }, res => {
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
 * 打开一个二进制流（音频），返回上游 IncomingMessage，由调用方 pipe。
 *
 * 只在 401 时抛错，其余状态码交由调用方判断（404 的 JSON 错误体也可能是业务错误）。
 */
function openStream(base, pathname, options = {}) {
    var { params, token, insecure, range } = options;
    var url = buildUrl(base, pathname, params);
    var transport = url.startsWith('https:') ? https : http;

    return new Promise((resolve, reject) => {
        var headers = headersOf(pathname, 'GET', params, null, token, '*/*');

        if (range) {
            headers.Range = range;
        }

        var req = transport.request(url, {
            method: 'GET',
            headers,
            rejectUnauthorized: !insecure,
            timeout: 20000,
        }, res => {
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

    return data.userToken;
}

export default {
    API_SECRET,
    API_KEY,
    md5,
    sha256,
    canonicalQuery,
    sign,
    buildUrl,
    request,
    openStream,
    searchTracks,
    login,
};
