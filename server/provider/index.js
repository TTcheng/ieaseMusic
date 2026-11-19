
import fs from 'fs';
import PacProxyAgent from 'pac-proxy-agent';
import Netease from './Netease';
import Fnos from './Fnos';
import storage from '../../common/storage';
import cache from '../../common/cache';
import { NETEASE, FNOS, readSource } from '../../common/source';

async function getPreferences() {
    return await storage.get('preferences') || {};
}

/**
 * 按当前音源取插件列表。
 *
 * 只返回一个 —— 不做多源回退。
 * 未选音源（source 为 null）返回空数组：宁可明确报错，
 * 也不要悄悄当成网易云用户去搜。
 */
function getPlugins(source) {
    if (source === FNOS) {
        return [{
            enginner: Fnos,
            proxy: true,
        }];
    }

    if (source === NETEASE) {
        return [{
            enginner: Netease,
            proxy: false,
        }];
    }

    return [];
}

/**
 * 跑插件。
 *
 * 单一音源模式：插件列表最多一个，成功即返回，失败即 reject。
 * 插件列表为空 = 未选音源，直接报错（不猜用户想听哪个源）。
 */
async function exe(plugins, ...args) {
    if (!plugins || !plugins.length) {
        throw Error('音源未选择，请先在登录页选择音源');
    }

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
            var plugins = getPlugins(await readSource());

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
    var source = await readSource();
    var plugins = getPlugins(source);

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
    getPlugins,
    NETEASE,
    FNOS,
};
