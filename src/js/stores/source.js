
import { observable, action } from 'mobx';

import storage from 'common/storage';

const NETEASE = 'netease';
const FNOS = 'fnos';

// 存储键
const KEY_SOURCE = 'source';
const KEY_FNOS_PROFILE = 'fnos-profile';

/**
 * 音源与登录态。
 *
 * 整个 app 同一时刻只用一个音源：
 *   - netease —— 网易云音乐，用网易云账号登录，内容与播放都来自网易云
 *   - fnos    —— 飞牛音乐（NAS 曲库），用 fnOS 账号登录，搜索与播放来自 NAS
 *
 * 两个音源的登录态各自独立存储，但同一时刻只有一个是「当前」的。
 */
class Source {
    // 当前音源，未登录时为 null
    @observable source = null;

    // fnOS 登录信息 {base, username, password}
    @observable fnosProfile = {};

    // 是否已初始化（用于路由守卫等待）
    @observable initialized = false;

    @action async init() {
        var source = await storage.get(KEY_SOURCE);
        var fnosProfile = await storage.get(KEY_FNOS_PROFILE);

        self.source = source || null;
        self.fnosProfile = fnosProfile || {};
        self.initialized = true;

        return self.source;
    }

    /**
     * 选一个音源。
     *
     * 切换会清掉当前登录态 —— 新音源必须重新登录。
     */
    @action async setSource(source) {
        if (source !== NETEASE && source !== FNOS) {
            throw Error(`Unknown source: ${source}`);
        }

        await self.clearLogin();
        await storage.set(KEY_SOURCE, source);

        self.source = source;
    }

    /**
     * 清除当前音源的登录态。
     */
    @action async clearLogin() {
        if (self.source === NETEASE) {
            await storage.remove('profile');
        } else if (self.source === FNOS) {
            await storage.remove(KEY_FNOS_PROFILE);
        }

        self.fnosProfile = {};
    }

    /**
     * 保存 fnOS 登录信息。
     */
    @action async setFnosProfile(profile) {
        var conf = {
            base: String(profile.base || '').replace(/\/+$/, ''),
            username: profile.username || '',
            password: profile.password || '',
        };

        if (profile.user) {
            conf.user = profile.user;
        }

        await storage.set(KEY_FNOS_PROFILE, conf);

        self.fnosProfile = conf;

        return conf;
    }

    isNetease() {
        return self.source === NETEASE;
    }

    isFnos() {
        return self.source === FNOS;
    }
}

const self = new Source();

export { NETEASE, FNOS, KEY_SOURCE, KEY_FNOS_PROFILE };
export default self;
