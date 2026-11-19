
/**
 * 音源判定的一致性自检。
 *
 * 背景：架构审计发现「当前是哪个音源」这个决策被写了两遍，
 * 而且兜底语义不一样：
 *   - 渲染层 store：非法值 -> null（未选音源）
 *   - 主进程 provider：非法值 -> 'netease'（当成网易云用户）
 *
 * 后果：同一份磁盘数据，两端读出不同结论。渲染层把用户赶去登录页，
 * 服务端却已经在用网易云 provider 搜歌了 —— 两件事同时为真且互不知情。
 *
 * 这里断言：
 *   1. 未选音源（storage 里没有 source 键）-> readSource() 返回 null
 *   2. 非法音源值（'garbage'）-> readSource() 返回 null
 *   3. 渲染层 store 与 provider 侧读同一份 storage 结果一致
 *   4. provider 在未选音源时不猜：插件列表为空、getTrack 明确报错
 *
 * 依赖 bin/_stub-storage.js 打桩 electron-json-storage。
 */

import assert from 'assert';
import fs from 'fs';

// 与 stub 共用同一份存储文件
const STORAGE = require('./_stub-storage.js').STORAGE;

function writeStore(store) {
    fs.writeFileSync(STORAGE, JSON.stringify(store));
}

async function main() {
    if (fs.existsSync(STORAGE)) {
        fs.unlinkSync(STORAGE);
    }

    const { readSource, readFnosProfile, NETEASE, FNOS } = require('../common/source');

    // ---- 1. 未选音源 ----
    console.log('=== 未选音源 ===');
    writeStore({});

    assert.strictEqual(await readSource(), null, '没有 source 键时应为 null');
    console.log('✓ 没有 source 键 -> null');

    // ---- 2. 非法音源值 ----
    console.log('\n=== 非法音源值 ===');
    writeStore({ source: 'garbage' });

    assert.strictEqual(await readSource(), null, '非法音源值应为 null');
    console.log('✓ 非法值 -> null');

    // electron-json-storage 对不存在的 key 返回 {} 而不是 undefined，
    // 这里显式构造这个情形，确认不会被当成真值。
    writeStore({ source: {} });

    assert.strictEqual(await readSource(), null, '{} 应为 null');
    console.log('✓ {} -> null');

    // ---- 3. 合法音源 ----
    console.log('\n=== 合法音源 ===');
    writeStore({ source: FNOS });

    assert.strictEqual(await readSource(), FNOS);
    writeStore({ source: NETEASE });

    assert.strictEqual(await readSource(), NETEASE);
    console.log('✓ netease / fnos 都能正确读出');

    // ---- 4. 渲染层与 provider 侧读同一份 storage，结果必须一致 ----
    console.log('\n=== 渲染层与 provider 侧一致性 ===');
    const store = require('../src/js/stores/source').default;

    for (const raw of [undefined, 'garbage', NETEASE, FNOS]) {
        if (raw === undefined) {
            writeStore({});
        } else {
            writeStore({ source: raw });
        }

        await store.init();

        const fromStore = store.source;
        const fromCommon = await readSource();

        assert.strictEqual(
            fromStore,
            fromCommon,
            `storage.source=${JSON.stringify(raw)} 时两端读出不同结果：store=${fromStore} common=${fromCommon}`
        );
    }

    console.log('✓ 四种取值下两端完全一致');

    // ---- 5. provider 在未选音源时不猜 ----
    console.log('\n=== provider 未选音源时明确报错 ===');
    const provider = require('../server/provider');

    assert.deepStrictEqual(provider.getPlugins(null), [], '未选音源时插件列表应为空');
    assert.strictEqual(provider.getPlugins(FNOS).length, 1, 'fnOS 应有且只有一个插件');
    assert.strictEqual(provider.getPlugins(NETEASE).length, 1, 'netease 应有且只有一个插件');
    console.log('✓ getPlugins(null) 返回空数组');

    writeStore({});

    await assert.rejects(
        () => provider.getTrack('晴天', '周杰伦', 'some-id'),
        /音源/,
        '未选音源时 getTrack 应拒绝并提到音源'
    );
    console.log('✓ getTrack 明确报错（不猜音源）');

    // ---- 6. fnOS 登录信息读取 ----
    console.log('\n=== fnOS 登录信息 ===');
    writeStore({});

    assert.strictEqual(await readFnosProfile(), null, '没有 fnos-profile 时应为 null');

    writeStore({ 'fnos-profile': { base: 'https://nas:5667', username: 'u', password: 'p' } });

    const profile = await readFnosProfile();

    assert.ok(profile && profile.base, '应读出 fnOS 配置');
    assert.strictEqual(profile.username, 'u');
    console.log('✓ fnOS 配置读取正常');

    fs.unlinkSync(STORAGE);
    console.log('\n全部通过');
    process.exit(0);
}

main().catch(ex => {
    console.error('\n✗ 失败:', ex.message);
    console.error(ex.stack && ex.stack.split('\n').slice(0, 10).join('\n'));
    process.exit(1);
});
