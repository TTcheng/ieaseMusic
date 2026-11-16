
/**
 * fnOS 音源自检。
 *
 * 用法：
 *   node -r babel-register bin/fnos-check.js <base> <username> <password>
 *   node -r babel-register bin/fnos-check.js --sign
 *
 * --sign 只做签名算法的离线断言，不联网。
 */

import assert from 'assert';
import fnos from '../server/fnos';

const args = process.argv.slice(2);

function checkSign() {
    // 签名算法：md5(SECRET_pathname_nonce_timestamp_bodyHash_KEY)
    var nonce = '123456';
    var timestamp = '1700000000000';
    var header = fnos.sign('/music/api/v1/search/track', 'GET', { q: '晴天' }, null, { nonce, timestamp });
    var parsed = new URLSearchParams(header);

    assert.strictEqual(parsed.get('nonce'), nonce);
    assert.strictEqual(parsed.get('timestamp'), timestamp);

    var expected = fnos.md5([
        fnos.API_SECRET,
        '/music/api/v1/search/track',
        nonce,
        timestamp,
        fnos.md5('q=晴天'),
        fnos.API_KEY,
    ].join('_'));

    assert.strictEqual(parsed.get('sign'), expected, 'sign 应为 md5(SECRET_path_nonce_ts_bodyHash_KEY)');

    // GET 的 bodyHash 走 decodeURIComponent 后的排序串
    var canonical = fnos.canonicalQuery({ b: '2', a: '1' });

    assert.strictEqual(canonical, 'a=1&b=2', 'query 应按键名排序');
    assert.strictEqual(
        fnos.canonicalQuery({ q: '晴天' }),
        'q=%E6%99%B4%E5%A4%A9',
        '非 ASCII 应被百分号编码'
    );

    // POST 的 bodyHash 走 JSON.stringify
    var postHeader = fnos.sign('/music/api/v1/user/password-login', 'POST', null, { a: 1 }, { nonce, timestamp });
    var postParsed = new URLSearchParams(postHeader);
    var postExpected = fnos.md5([
        fnos.API_SECRET,
        '/music/api/v1/user/password-login',
        nonce,
        timestamp,
        fnos.md5('{"a":1}'),
        fnos.API_KEY,
    ].join('_'));

    assert.strictEqual(postParsed.get('sign'), postExpected, 'POST 签名应基于 JSON.stringify(body)');

    // 密码用 sha256
    assert.strictEqual(
        fnos.sha256('secret'),
        '2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b',
        'sha256 应与标准实现一致'
    );

    console.log('✓ 签名算法断言通过');
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
    if (args[0] === '--sign' || args.length === 0) {
        checkSign();
        return;
    }

    var base = args[0];
    var username = args[1];
    var password = args[2];

    await checkLive(base, username, password);
    console.log('\n全部通过');
}

main().catch(ex => {
    console.error('✗ 失败:', ex.message);
    process.exit(1);
});
