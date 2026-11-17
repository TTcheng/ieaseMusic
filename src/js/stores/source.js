
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

        // electron-json-storage 对不存在的 key 返回 {}（不是 undefined），
        // 所以这里必须校验是不是合法音源，否则 source 会变成 {} 这种真值。
        self.source = (source === NETEASE || source === FNOS) ? source : null;
        self.fnosProfile = (fnosProfile && typeof fnosProfile === 'object' && fnosProfile.base)
            ? fnosProfile
            : {};
        self.initialized = true;

        return self.source;
    }

    /**
     * 选一个音源。
     *
     * 切换会清掉当前音源的登录态 —— 新音源必须重新登录。
     * 选同一个音源不动登录态（fnOS 重新登录时会先存凭据再调这里，
     * 如果这里把自己的凭据清了，刚存的就没了）。
     */
    @action async setSource(source) {
        if (source !== NETEASE && source !== FNOS) {
            throw Error(`Unknown source: ${source}`);
        }

        if (self.source !== source) {
            await self.clearLogin();
        }

        await storage.set(KEY_SOURCE, source);

        self.source = source;
    }

    /**
     * 清除当前音源的登录态。
     *
     * 只清当前音源的那一份 —— 切到 fnos 时不能把 netease 的 profile 删掉，
     * 反之亦然。
     */
    @action async clearLogin() {
        if (self.source === NETEASE) {
            await storage.remove('profile');
        } else if (self.source === FNOS) {
            await storage.remove(KEY_FNOS_PROFILE);
            self.fnosProfile = {};
        }
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
