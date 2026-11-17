
/**
 * 音源模型自检。
 *
 * 验证单一音源模式的核心约定：
 *   1. 切换音源会清掉当前音源的登录态
 *   2. 两个音源的登录态各自独立
 *   3. hasLogin 按当前音源判断
 *
 * 依赖 bin/_stub-storage.js 打桩 electron-json-storage。
 */

import assert from 'assert';
import fs from 'fs';

// 与 stub 共用同一份存储文件
const STORAGE = require('./_stub-storage.js').STORAGE;

// me.init() 会调 /login/refresh 验证 cookie，测试里不发真实请求
const axios = require('axios');

axios.get = async() => ({ data: { code: 200 } });
axios.defaults = axios.defaults || {};

function readStore() {
    if (!fs.existsSync(STORAGE)) {
        return {};
    }

    return JSON.parse(fs.readFileSync(STORAGE, 'utf8'));
}

async function main() {
    // 每次跑之前清干净
    if (fs.existsSync(STORAGE)) {
        fs.unlinkSync(STORAGE);
    }

    const source = require('../src/js/stores/source').default;
    const { NETEASE, FNOS } = require('../src/js/stores/source');

    console.log('=== 初始状态 ===');
    await source.init();

    assert.strictEqual(source.source, null, '初始应没有音源');
    assert.strictEqual(source.isNetease(), false);
    assert.strictEqual(source.isFnos(), false);
    console.log('✓ 初始无音源');

    // 1. 选网易云
    console.log('\n=== 选网易云 ===');
    await source.setSource(NETEASE);

    assert.strictEqual(source.source, NETEASE);
    assert.strictEqual(source.isNetease(), true);
    assert.strictEqual(readStore().source, NETEASE, '音源应持久化');
    console.log('✓ 音源已持久化');

    // 2. 网易云登录态
    console.log('\n=== 网易云登录态 ===');
    const me = require('../src/js/stores/me').default;

    await storageSet('profile', { userId: 12345, nickname: 'tester' });

    await me.init();

    assert.strictEqual(me.hasLogin(), true, '网易云模式应认 profile');
    console.log('✓ 网易云模式认 profile');

    // 3. 切到 fnOS —— 网易云登录态应被清掉
    console.log('\n=== 切到 fnOS（应清掉网易云登录态）===');
    await source.setSource(FNOS);

    assert.strictEqual(source.source, FNOS);
    assert.strictEqual(readStore().profile, undefined, '网易云 profile 应被清掉');
    console.log('✓ 网易云登录态已清掉');

    // 4. fnOS 登录态独立
    console.log('\n=== fnOS 登录态 ===');
    await source.setFnosProfile({
        base: 'https://nas:5667/',
        username: 'iease',
        password: 'secret',
        user: { name: 'IEase' },
    });

    await me.init();

    assert.strictEqual(me.hasLogin(), true, 'fnOS 模式应认 fnos-profile');
    assert.strictEqual(source.fnosProfile.base, 'https://nas:5667', '尾斜杠应被去掉');
    assert.strictEqual(source.fnosProfile.user.name, 'IEase', '用户信息应保留');
    console.log('✓ fnOS 登录态独立且归一化正确');

    // 5. 切回网易云 —— fnOS 登录态应被清掉
    console.log('\n=== 切回网易云（应清掉 fnOS 登录态）===');
    await source.setSource(NETEASE);

    assert.strictEqual(readStore()['fnos-profile'], undefined, 'fnOS 登录态应被清掉');
    assert.strictEqual(source.fnosProfile.username, undefined);
    console.log('✓ fnOS 登录态已清掉');

    // 6. 重新登录网易云
    await storageSet('profile', { userId: 999, nickname: 'again' });
    await me.init();

    assert.strictEqual(me.hasLogin(), true);
    console.log('✓ 切回后可重新登录');

    // 7. 未知音源要报错
    console.log('\n=== 非法音源 ===');
    await assert.rejects(
        () => source.setSource('unknown'),
        /Unknown source/
    );
    console.log('✓ 非法音源被拒绝');

    fs.unlinkSync(STORAGE);
    console.log('\n全部通过');
    // me 会连带加载 home，home 里有 CronJob 定时器，不主动退出会挂住
    process.exit(0);
}

function storageSet(key, value) {
    const store = readStore();

    store[key] = value;
    fs.writeFileSync(STORAGE, JSON.stringify(store));
}

main().catch(ex => {
    console.error('✗ 失败:', ex.message);
    console.error(ex.stack && ex.stack.split('\n').slice(0, 8).join('\n'));
    process.exit(1);
});
