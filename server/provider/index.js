
import fs from 'fs';
import PacProxyAgent from 'pac-proxy-agent';
import Netease from './Netease';
import Fnos from './Fnos';
import storage from '../../common/storage';
import cache from '../../common/cache';

// 音源标识（与 src/js/stores/source.js 保持一致）
const NETEASE = 'netease';
const FNOS = 'fnos';

async function getPreferences() {
    return await storage.get('preferences') || {};
}

/**
 * 当前音源。
 *
 * 单一音源模式：整个 app 同一时刻只用一个音源，
 * 音源由用户在登录时选定，存在 storage 的 'source' 键。
 */
async function getSource() {
    return await storage.get('source') || NETEASE;
}

/**
 * 按当前音源取插件列表。
 *
 * 只返回一个 —— 不做多源回退。
 */
async function getPlugins(source) {
    if (source === FNOS) {
        return [{
            enginner: Fnos,
            proxy: true,
        }];
    }

    return [{
        enginner: Netease,
        proxy: false,
    }];
}

/**
 * 并发跑插件，首个成功的返回。
 *
 * 只有一个插件时就是「成功即返回，失败即 reject」。
 */
async function exe(plugins, ...args) {
    var preferences = await getPreferences();
    var rpOptions = {
        timeout: 10000,
        json: true,
        jar: true,
    };
    var proxy = preferences.proxy;
    var rp = require('request-promise-native').defaults(rpOptions);

    return Promise.all(
        plugins.map(e => {
            if (proxy && e.proxy) {
                if (proxy.endsWith('.pac')) {
                    Object.assign(
                        rpOptions,
                        {
                            agent: new PacProxyAgent(proxy)
                        }
                    );
                } else {
                    Object.assign(
                        rpOptions,
                        {
                            proxy,
                        }
                    );
                }
            }
            // If a request failed will keep waiting for other possible successes, if a request successed,
            // treat it as a rejection so Promise.all immediate break.
            return e.enginner(rp, ...args).then(
                val => Promise.reject(val),
                err => Promise.resolve(err)
            );
        })
    ).then(
        errs => Promise.reject(errs),
        val => Promise.resolve(val),
    );
}

async function getFlac(keyword, artists, id) {
    try {
        var song = cache.get(id);
        if (!song) {
            var plugins = await getPlugins(await getSource());

            song = (await exe(plugins, keyword, artists, true)) || {};
            if (song.src) {
                cache.set(id, song);
            }
        }

        return song;
    } catch (ex) {
        // 404
    }
}

async function loadFromLocal(id) {
    var downloaded = await storage.get('downloaded') || {};
    var task = downloaded[id];

    if (task) {
        if (fs.existsSync(task.path) === false) {
            delete downloaded[id];
            await storage.set('downloaded', downloaded);
            return;
        }

        return {
            src: encodeURI(`file://${task.path}`)
        };
    }
}

async function getTrack(keyword, artists, id /** This id is only work for netease music */) {
    var source = await getSource();
    var plugins = await getPlugins(source);

    var key = source + '#' + id;
    var song = cache.get(key);
    if (!song) {
        song = (await exe(plugins, keyword, artists, id)) || {};
        // Cache the search result
        if (song.src) {
            cache.set(key, song);
        }
    }

    return song;
}

export {
    loadFromLocal,
    getFlac,
    getTrack,
    getSource,
    getPlugins,
    NETEASE,
    FNOS,
};
