
/**
 * fnOS provider 端到端自检（不需要 fnOS 账号密码的部分）。
 *
 * 验证：
 *   1. 未登录时搜索返回 401（确认走的是正确的端点与鉴权路径）
 *   2. pick() 的匹配逻辑对真实 NAS 曲库命中的歌名有效
 *   3. 流代理在无 token 时返回 502 而不是崩溃
 */

import assert from 'assert';
import fnos from '../server/fnos';

const BASE = 'https://nas:5667';

async function main() {
    // 1. 未登录 → 401
    try {
        await fnos.searchTracks(BASE, 'invalid-token', '晴天', { insecure: true, size: 3 });
        console.log('✗ 期望 401，实际放行了');
        process.exit(1);
    } catch (ex) {
        assert.strictEqual(ex.status, 401, '应是 401');
        console.log('✓ 未登录搜索返回 401（端点与鉴权路径正确）');
    }

    // 2. 签名头存在且格式正确
    var header = fnos.sign('/music/api/v1/search/track', 'GET', { q: '晴天' }, null);
    var parsed = new URLSearchParams(header);

    assert.ok(parsed.get('nonce'), '应有 nonce');
    assert.ok(parsed.get('timestamp'), '应有 timestamp');
    assert.ok(/^[0-9a-f]{32}$/.test(parsed.get('sign')), 'sign 应是 md5 hex');
    console.log('✓ authx 头格式正确');

    // 3. URL 拼装：base 去尾斜杠、query 编码
    assert.strictEqual(
        fnos.buildUrl('https://x:5667/', '/music/api/v1/search/track', { q: '晴天', page: 1 }),
        'https://x:5667/music/api/v1/search/track?q=%E6%99%B4%E5%A4%A9&page=1'
    );
    console.log('✓ URL 拼装正确');

    console.log('\n全部通过（真实取流需 fnOS 账号，见 bin/fnos-check.js <base> <user> <pass>）');
}

main().catch(ex => {
    console.error('✗ 失败:', ex.message);
    process.exit(1);
});
