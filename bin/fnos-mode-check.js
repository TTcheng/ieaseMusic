
/**
 * fnOS 模式的端到端验证。
 *
 * 走真实链路：
 *   1. /api/fnos/home —— 首页拿到可播曲目
 *   2. /api/fnos/search —— 搜索命中
 *   3. /api/player/song —— 播放解析（fnOS 模式下 id 是 guid）
 *
 * 需要 fnOS 凭据（环境变量）。
 */

import assert from 'assert';
import http from 'http';

const PORT = process.env.TEST_PORT || 10996;
const BASE = `http://127.0.0.1:${PORT}`;

function get(path) {
    return new Promise((resolve, reject) => {
        http.get(`${BASE}${path}`, res => {
            const c = [];
            res.on('data', d => c.push(d));
            res.on('end', () => {
                const raw = Buffer.concat(c).toString('utf8');
                let j = null;

                try {
                    j = JSON.parse(raw);
                } catch (e) { /* ignore */ }

                resolve({ status: res.statusCode, j, raw });
            });
        }).on('error', reject);
    });
}

async function main() {
    if (!process.env.FNOS_USER || !process.env.FNOS_PASS) {
        console.log('跳过：需要 fnOS 凭据');
        return;
    }

    // 准备存储：选中 fnOS 音源 + 写入凭据
    const fs = require('fs');
    const STORAGE = require('./_stub-storage.js').STORAGE;

    fs.writeFileSync(STORAGE, JSON.stringify({
        source: 'fnos',
        'fnos-profile': {
            base: process.env.FNOS_BASE || 'https://nas:5667',
            username: process.env.FNOS_USER,
            password: process.env.FNOS_PASS,
            user: { name: process.env.FNOS_USER },
        },
    }));

    console.log('=== 启动 API 服务器 ===');
    const api = require('../server/api').default;

    await new Promise(resolve => {
        api(PORT, '', () => {
            console.log(`✓ 服务器已启动 :${PORT}`);
            resolve();
        });
    });

    // 1. 首页
    console.log('\n=== /api/fnos/home ===');
    const home = await get('/api/fnos/home');

    console.log('  status:', home.status);
    assert.strictEqual(home.status, 200);
    assert.ok(home.j.recent, '应返回 recent 播放列表');

    const recent = home.j.recent;

    console.log(`✓ 首页返回「${recent.name}」，${recent.songs.length} 首`);
    assert.ok(recent.songs.length > 0, '应有曲目');

    const first = recent.songs[0];

    console.log('  第一首:', JSON.stringify({
        id: first.id,
        name: first.name,
        artists: first.artists.map(a => a.name),
        format: first.format,
        duration: first.duration,
    }));

    assert.ok(first.id, '曲目应有 id');
    assert.ok(first.name, '曲目应有 name');
    assert.ok(Array.isArray(first.artists), '曲目应有 artists');

    // 2. 搜索
    console.log('\n=== /api/fnos/search ===');
    const search = await get('/api/fnos/search?q=' + encodeURIComponent('晴天') + '&page=1&size=10');

    console.log('  status:', search.status);
    assert.strictEqual(search.status, 200);
    console.log(`✓ 搜索返回 ${search.j.list.length} 首，总数 ${search.j.total}`);

    if (search.j.list.length) {
        const hit = search.j.list[0];

        console.log('  第一条:', JSON.stringify({
            id: hit.id,
            name: hit.name,
            artists: hit.artists.map(a => a.name),
        }));
    }

    // 3. 播放解析 —— fnOS 模式下 id 是 guid
    console.log('\n=== /api/player/song（fnOS 模式）===');
    const play = await get(`/api/player/song/${first.id}/${encodeURIComponent(first.name)}/${encodeURIComponent(first.artists.map(a => a.name).join(','))}/0`);

    console.log('  status:', play.status);
    assert.strictEqual(play.status, 200);
    assert.ok(play.j.song && play.j.song.src, '应返回播放地址');

    console.log(`✓ 播放解析成功: ${play.j.song.src.slice(0, 70)}…`);
    console.log(`  bitRate: ${play.j.song.bitRate}`);

    // 4. 代理真的能出音频
    console.log('\n=== 流代理取音频 ===');
    const bytes = await new Promise((resolve, reject) => {
        http.get(play.j.song.src, res => {
            let n = 0;

            res.on('data', chunk => {
                n += chunk.length;
                if (n >= 4096) {
                    res.destroy();
                    resolve({ n, status: res.statusCode, type: res.headers['content-type'] });
                }
            });
            res.on('end', () => resolve({ n, status: res.statusCode, type: res.headers['content-type'] }));
            res.on('error', reject);
        }).on('error', reject);
    });

    console.log(`✓ 代理返回 ${bytes.status} ${bytes.type}，读到 ${bytes.n} 字节`);
    assert.strictEqual(bytes.status, 200);
    assert.ok(bytes.n > 0, '应读到音频');

    console.log('\n全部通过');
    process.exit(0);
}

main().catch(ex => {
    console.error('✗ 失败:', ex.message);
    console.error(ex.stack && ex.stack.split('\n').slice(0, 8).join('\n'));
    process.exit(1);
});
