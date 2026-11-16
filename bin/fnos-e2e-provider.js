
/**
 * 端到端验证：模拟用户在偏好设置里开启飞牛音源后，
 * 走 server/provider/index.js 的真实链路能否出流。
 *
 * 覆盖：
 *   1. preferences.enginers.Fnos = true → provider 被加入插件列表
 *   2. preferences.fnos 的连接配置被正确读取
 *   3. 选中的音源返回可播放的 src（本地流代理地址）
 */

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

const STORAGE = path.join(os.tmpdir(), `iease-fnos-e2e-${Date.now()}`);
const APPDATA = path.join(STORAGE, 'storage.json');

const Module = require('module');
const originalLoad = Module._load;

Module._load = function(request) {
    if (request === 'electron-json-storage') {
        const impl = {
            get: (key, cb) => {
                let data = {};

                if (fs.existsSync(APPDATA)) {
                    data = JSON.parse(fs.readFileSync(APPDATA, 'utf8'));
                }

                cb(null, data[key]);
            },
            set: (key, data, cb) => {
                let all = {};

                if (fs.existsSync(APPDATA)) {
                    all = JSON.parse(fs.readFileSync(APPDATA, 'utf8'));
                }

                all[key] = data;
                fs.writeFileSync(APPDATA, JSON.stringify(all));
                cb(null);
            },
            remove: (key, cb) => {
                let all = {};

                if (fs.existsSync(APPDATA)) {
                    all = JSON.parse(fs.readFileSync(APPDATA, 'utf8'));
                }

                delete all[key];
                fs.writeFileSync(APPDATA, JSON.stringify(all));
                cb(null);
            },
        };

        return impl;
    }

    return originalLoad.apply(this, arguments);
};

async function main() {
    fs.mkdirSync(STORAGE, { recursive: true });

    // 写入偏好设置，模拟用户在 UI 里填好并打开了开关
    fs.writeFileSync(APPDATA, JSON.stringify({
        preferences: {
            enginers: {
                'QQ': true,
                'MiGu': false,
                'Xiami': false,
                'Kugou': false,
                'Baidu': false,
                'Kuwo': false,
                'Fnos': true,
            },
            fnos: {
                base: 'https://nas:5667',
                username: process.env.FNOS_USER || "",
                password: process.env.FNOS_PASS || "",
                insecure: true,
            },
        },
    }));

    const provider = require('../server/provider');

    console.log('✓ 偏好设置已写入（含 enginers.Fnos=true 与 fnos 连接配置）');

    // 走真实链路：getTrack 会依次尝试 Netease → Fnos
    const song = await provider.getTrack('晴天', '周杰伦', '186016');

    console.log('✓ getTrack 返回:', JSON.stringify(song));

    assert.ok(song && song.src, '应返回可播放的 src');
    assert.ok(/^http:\/\/127\.0\.0\.1:\d+\/stream\//.test(song.src), `src 应为本地流代理地址，实际 ${song.src}`);

    // 真去代理拉一段音频，确认代理链路通
    const http = require('http');
    const bytes = await new Promise((resolve, reject) => {
        http.get(song.src, res => {
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

    console.log(`✓ 流代理返回 ${bytes.status} ${bytes.type}，读到 ${bytes.n} 字节`);
    assert.strictEqual(bytes.status, 200);
    assert.ok(bytes.n > 0, '应读到音频数据');
    assert.ok(String(bytes.type).includes('audio'), `content-type 应为 audio，实际 ${bytes.type}`);

    fs.rmSync(STORAGE, { recursive: true, force: true });

    console.log('\n端到端验证全部通过');
}

main().catch(ex => {
    console.error('✗ 失败:', ex.message);
    console.error(ex.stack && ex.stack.split('\n').slice(0, 8).join('\n'));
    process.exit(1);
});
