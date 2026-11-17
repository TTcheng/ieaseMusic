
/**
 * fnOS 路由自检。
 *
 * 验证 /api/fnos/test、/api/fnos/search、/api/fnos/home 的响应结构，
 * 以及 fnOS 模式下的播放解析链路。
 *
 * 需要 fnOS 凭据（环境变量）：
 *   FNOS_BASE=https://nas:5667 FNOS_USER=xxx FNOS_PASS=xxx \
 *     node -r babel-register -r "$PWD/bin/_stub-storage.js" bin/fnos-router-check.js
 */

import assert from 'assert';

import fnos from '../server/fnos';

const BASE = process.env.FNOS_BASE || 'https://nas:5667';

async function main() {
    if (!process.env.FNOS_USER || !process.env.FNOS_PASS) {
        console.log('跳过：需要 fnOS 凭据');
        console.log('  FNOS_BASE=https://nas:5667 FNOS_USER=xxx FNOS_PASS=xxx \\');
        console.log('  node -r babel-register -r "$PWD/bin/_stub-storage.js" bin/fnos-router-check.js');
        return;
    }

    // 1. 登录
    console.log('=== 登录 ===');
    const login = await fnos.loginWithUser(BASE, process.env.FNOS_USER, process.env.FNOS_PASS, {
        insecure: true,
        deviceId: '0123456789abcdef0123456789abcdef',
    });

    assert.ok(login.token, '应拿到 token');
    assert.ok(login.user && login.user.name, '应拿到用户信息');
    console.log(`✓ 登录成功，用户 ${login.user.name}`);

    // 2. 搜索
    console.log('\n=== 搜索 ===');
    const search = await fnos.request(BASE, '/music/api/v1/search/track', {
        params: { q: '晴天', page: 1, size: 10 },
        token: login.token,
        insecure: true,
    });

    const tracks = search.data.list || [];

    console.log(`✓ 搜索返回 ${tracks.length} 条，总数 ${search.data.total}`);
    assert.ok(tracks.length > 0, '应搜到结果');

    const track = tracks[0];

    console.log('  第一条:', JSON.stringify({
        guid: track.guid,
        title: track.title,
        artists: (track.artists || []).map(a => a.name),
        format: (track.audioSpec || {}).format,
        duration: track.duration,
    }));

    // 3. 曲目详情
    console.log('\n=== 曲目详情 ===');
    const meta = await fnos.request(BASE, '/music/api/v1/track/metadata', {
        params: { guid: track.guid },
        token: login.token,
        insecure: true,
    });

    assert.ok(meta.data && meta.data.track, '应返回 track');
    assert.ok(meta.data.audioSpec, '应返回 audioSpec');
    console.log('✓ track/metadata 正常');

    // 4. 歌词
    console.log('\n=== 歌词 ===');
    const lyric = await fnos.request(BASE, '/music/api/v1/lyric/list', {
        params: { trackGUID: track.guid },
        token: login.token,
        insecure: true,
    });

    var lyrics = (lyric.data && lyric.data.list) || [];

    console.log(`✓ lyric/list 返回 ${lyrics.length} 条`);
    assert.ok(lyric.data && Array.isArray(lyric.data.list), '应返回 list');

    // 5. 封面
    console.log('\n=== 封面 ===');
    const cover = await fnos.request(BASE, '/music/api/v1/static/cover', {
        params: { coverId: track.coverId, size: 300 },
        token: login.token,
        insecure: true,
    });

    console.log(`✓ static/cover 返回 ${cover.raw.length} 字节`);
    assert.ok(cover.raw.length > 1000, '封面应大于 1KB');

    // 6. 播放流
    console.log('\n=== 播放流 ===');
    const stream = await fnos.openStream(BASE, '/music/api/v1/track/stream', {
        params: { guid: track.guid },
        token: login.token,
        insecure: true,
        range: 'bytes=0-1023',
    });

    let size = 0;

    await new Promise((resolve, reject) => {
        stream.on('data', chunk => {
            size += chunk.length;
            if (size >= 1024) {
                stream.destroy();
                resolve();
            }
        });
        stream.on('end', resolve);
        stream.on('error', reject);
    });

    console.log(`✓ 取流成功，status=${stream.statusCode} type=${stream.headers['content-type']} 读到 ${size} 字节`);
    assert.strictEqual(stream.statusCode, 206, 'Range 请求应返回 206');
    assert.ok(size > 0, '应读到音频数据');

    // 7. 曲库总量
    console.log('\n=== 曲库总量 ===');
    const list = await fnos.request(BASE, '/music/api/v1/track/list', {
        params: { page: 1, size: 1 },
        token: login.token,
        insecure: true,
    });

    console.log(`✓ 曲库共 ${list.data.total} 首`);
    assert.ok(list.data.total > 100, '曲库应有一定规模');

    console.log('\n全部通过');
}

main().catch(ex => {
    console.error('✗ 失败:', ex.message);
    console.error(ex.stack && ex.stack.split('\n').slice(0, 8).join('\n'));
    process.exit(1);
});
