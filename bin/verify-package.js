
/**
 * 验证打包产物（asar）是否可用。
 *
 * 两层检查：
 *   1. 资源完整性 —— NeteaseCloudMusicApi/module/ 的接口齐全、能真实调通
 *   2. 运行时兼容性 —— 依赖链不含 Node 14+ 的 API
 *      （Electron 4.2.12 内置 Node 10，没有 fs/promises，
 *        electron-updater@4.6.5 用了它，会让主进程直接崩溃）
 *
 * 用法：
 *   node -r babel-register bin/verify-package.js [asar路径]
 * 默认 release/win-ia32-unpacked/resources/app.asar
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';
import { execFileSync } from 'child_process';

const DEFAULT_ASAR = path.join(__dirname, '..', 'release', 'win-ia32-unpacked', 'resources', 'app.asar');

// ieaseMusic 用到的接口
const REQUIRED = [
    'song_url', 'playlist_detail', 'toplist', 'search', 'top_playlist',
    'login_status', 'album', 'user_playlist', 'personal_fm',
    'recommend_songs', 'recommend_resource', 'personalized', 'album_newest',
    'simi_song', 'simi_artist', 'simi_playlist', 'simi_user',
    'daily_signin', 'fm_trash', 'scrobble', 'playlist_subscribe',
    'like', 'comment_music', 'lyric',
];

// Node 14+ 才有的 API，Electron 4 的 Node 10 跑不了
const FORBIDDEN = [
    'fs/promises',
    'reset-search-paths',
    'stream/web',
    'timers/promises',
];

function extractAsar(asarPath) {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'iease-verify-'));

    execFileSync('npx', ['--yes', '@electron/asar', 'extract', asarPath, target], {
        stdio: 'inherit',
    });

    return target;
}

/**
 * 递归扫描目录里的文本文件，找禁用 API。
 */
function scanForbidden(dir, patterns) {
    const hits = [];

    const walk = current => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);

            if (entry.isDirectory()) {
                walk(full);
                continue;
            }

            if (!/\.(js|cjs|mjs)$/.test(entry.name)) {
                continue;
            }

            let content;

            try {
                content = fs.readFileSync(full, 'utf8');
            } catch (ex) {
                continue;
            }

            for (const pattern of patterns) {
                if (content.includes(pattern)) {
                    hits.push(`${path.relative(dir, full)} → ${pattern}`);
                }
            }
        }
    };

    walk(dir);

    return hits;
}

async function main() {
    const asarPath = path.resolve(process.argv[2] || DEFAULT_ASAR);

    assert.ok(fs.existsSync(asarPath), `找不到 asar: ${asarPath}`);
    console.log('✓ asar 存在:', asarPath);

    const root = extractAsar(asarPath);
    const moduleDir = path.join(root, 'NeteaseCloudMusicApi', 'module');
    const utilRequest = path.join(root, 'NeteaseCloudMusicApi', 'util', 'request.js');

    // 1. 资源完整性
    assert.ok(fs.existsSync(moduleDir), `缺少 module 目录: ${moduleDir}`);
    const files = fs.readdirSync(moduleDir);

    assert.ok(files.length > 100, `module 应有 100+ 个文件，实际 ${files.length}`);
    console.log(`✓ module 目录存在，${files.length} 个文件`);

    assert.ok(fs.existsSync(utilRequest), `缺少 util/request.js`);
    console.log('✓ util/request.js 存在');

    const missing = REQUIRED.filter(m => !files.includes(`${m}.js`));

    assert.strictEqual(missing.length, 0, `缺少接口: ${missing.join(', ')}`);
    console.log(`✓ 依赖的 ${REQUIRED.length} 个接口全部存在`);

    // 2. 路由映射（复刻 server/api.js）
    const special = {
        'daily_signin.js': '/daily_signin',
        'fm_trash.js': '/fm_trash',
        'personal_fm.js': '/personal_fm',
    };
    const routes = files
        .filter(f => /\.js$/i.test(f))
        .map(f => (f in special) ? special[f] : '/' + f.replace(/\.js$/i, '').replace(/_/g, '/'));

    console.log(`✓ 解析出 ${routes.length} 条路由`);

    // 3. 真实调用一个接口
    const request = require(utilRequest);
    const toplist = require(path.join(moduleDir, 'toplist.js'));
    const answer = await toplist({ cookie: {} }, request);

    assert.strictEqual(answer.status, 200, `toplist 应返回 200，实际 ${answer.status}`);
    assert.ok(Array.isArray(answer.body.list), '应返回榜单列表');
    console.log(`✓ 真实调用 toplist 成功，${answer.body.list.length} 个榜单，首个: ${answer.body.list[0].name}`);

    // 4. 运行时兼容性：不能有 Node 14+ 的 API
    const hits = scanForbidden(root, FORBIDDEN);

    assert.strictEqual(hits.length, 0, `发现 Node 14+ API（Electron 4 的 Node 10 不支持）:\n  ${hits.join('\n  ')}`);
    console.log(`✓ 无 Node 14+ API（${FORBIDDEN.join(', ')}）`);

    // 5. 打包后的 electron-updater 版本
    const updaterPkg = path.join(root, 'node_modules', 'electron-updater', 'package.json');

    if (fs.existsSync(updaterPkg)) {
        const version = JSON.parse(fs.readFileSync(updaterPkg, 'utf8')).version;

        console.log(`✓ 打包的 electron-updater 版本: ${version}`);
    }

    fs.rmSync(root, { recursive: true, force: true });

    console.log('\n打包产物验证全部通过');
}

main().catch(ex => {
    console.error('✗ 失败:', ex.message);
    process.exit(1);
});
