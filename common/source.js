
/**
 * 音源模型的唯一权威。
 *
 * 主进程（server/provider）与渲染进程（src/js/stores）都要读「当前是哪个音源」，
 * 之前两边各写一份校验，兜底语义还不一样：
 *   - store 侧：非法值 -> null（未选音源）
 *   - provider 侧：非法值 -> 'netease'（当成网易云用户）
 * 同一份磁盘数据被读成两种语义，改一边不会改到另一边。
 *
 * 这里收敛成一份，非法值一律当「未选音源」——与渲染层的路由守卫一致。
 *
 * 放在 common/ 是因为主进程与渲染进程都要用（webpack alias: common -> ../common），
 * 和 common/storage.js 同一个模式。
 */

import storage from './storage';

export const NETEASE = 'netease';
export const FNOS = 'fnos';

export const KEY_SOURCE = 'source';
export const KEY_FNOS_PROFILE = 'fnos-profile';

/**
 * 读当前音源。
 *
 * 注意：electron-json-storage 对不存在的 key 返回 {}（不是 undefined），
 * 所以必须显式校验，不能用 `|| 默认值`。
 *
 * @returns {Promise<string|null>} 'netease' | 'fnos' | null（未选音源）
 */
export async function readSource() {
    var saved = await storage.get(KEY_SOURCE);

    return (saved === NETEASE || saved === FNOS) ? saved : null;
}

/**
 * 读 fnOS 登录信息。
 *
 * @returns {Promise<object|null>} {base, username, password, user?} | null
 */
export async function readFnosProfile() {
    var saved = await storage.get(KEY_FNOS_PROFILE);

    return (saved && typeof saved === 'object' && saved.base) ? saved : null;
}
