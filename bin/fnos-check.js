
/**
 * fnOS 音源自检。
 *
 * 用法：
 *   node -r babel-register bin/fnos-check.js --offline
 *   FNOS_BASE=https://nas:5667 FNOS_USER=xxx FNOS_PASS=xxx \
 *     node -r babel-register bin/fnos-check.js
 *
 * 凭据从环境变量读，不要写进代码或命令行历史。
 * --offline 只做本地断言，不联网。
 */

import assert from 'assert';
import fnos from '../server/fnos';

const args = process.argv.slice(2);

function checkOffline() {
    // 密码用 sha256
    assert.strictEqual(
        fnos.sha256('secret'),
        '2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b',
        'sha256 应与标准实现一致'
    );
    console.log('✓ sha256 断言通过');

    // URL 拼装：base 去尾斜杠、query 编码、空值跳过
    assert.strictEqual(
        fnos.buildUrl('https://nas:5667/', '/music/api/v1/search/track', { q: '晴天', page: 1 }),
        'https://nas:5667/music/api/v1/search/track?q=%E6%99%B4%E5%A4%A9&page=1'
    );
    assert.strictEqual(
        fnos.buildUrl('https://nas:5667', '/x', { a: null, b: undefined, c: 1 }),
        'https://nas:5667/x?c=1',
        'null/undefined 应被跳过'
    );
    console.log('✓ URL 拼装断言通过');

    // parseUrl 拆出 http.request 需要的字段
    var parsed = fnos.parseUrl('https://nas:5667/music/api/v1/track/list?page=1');

    assert.strictEqual(parsed.hostname, 'nas');
    assert.strictEqual(parsed.port, '5667');
    assert.strictEqual(parsed.path, '/music/api/v1/track/list?page=1');
    console.log('✓ parseUrl 断言通过');
}

async function checkLive(base, username, password) {
    console.log(`→ 连接 ${base} …`);

    var token = await fnos.login(base, username, password, {
        insecure: true,
        deviceId: '0123456789abcdef0123456789abcdef',
    });

    assert.ok(token, '应拿到 userToken');
    console.log('✓ 登录成功，userToken 长度', token.length);

    var tracks = await fnos.searchTracks(base, token, '晴天', { insecure: true, size: 5 });

    console.log(`✓ 搜索返回 ${tracks.length} 条`);

    if (tracks.length) {
        var first = tracks[0];

        console.log('  第一条：', JSON.stringify({
            guid: first.guid,
            title: first.title,
            artists: (first.artists || []).map(a => a.name),
            format: (first.audioSpec || {}).format,
            bitrate: (first.audioSpec || {}).bitrate,
            duration: first.duration,
        }));
    }

    // 取流：只读前 1KB，确认真的拿到音频
    if (tracks.length) {
        var stream = await fnos.openStream(base, '/music/api/v1/track/stream', {
            params: { guid: tracks[0].guid },
            token,
            insecure: true,
            range: 'bytes=0-1023',
        });

        var size = 0;

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

        console.log(`✓ 取流成功，status=${stream.statusCode} content-type=${stream.headers['content-type']} 读到 ${size} 字节`);
    }
}

async function main() {
    if (args[0] === '--offline' || args.length === 0) {
        checkOffline();
        return;
    }

    var base = process.env.FNOS_BASE || 'https://nas:5667';
    var username = process.env.FNOS_USER;
    var password = process.env.FNOS_PASS;

    if (!username || !password) {
        console.log('跳过：需要 fnOS 凭据');
        console.log('  FNOS_BASE=https://nas:5667 FNOS_USER=xxx FNOS_PASS=xxx \\');
        console.log('  node -r babel-register bin/fnos-check.js');
        return;
    }

    await checkLive(base, username, password);
    console.log('\n全部通过');
}

main().catch(ex => {
    console.error('✗ 失败:', ex.message);
    process.exit(1);
});
