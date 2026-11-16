
/**
 * 验证 Windows 上偏好设置确实有入口。
 *
 * 背景：Windows 上原本没有菜单栏（updateMenu 直接 return），
 * Preferences 只能从菜单进入 -> 用户完全找不到入口。
 *
 * 检查打包后的产物：
 *   1. 主进程里 updateMenu 的条件包含 Windows 分支
 *   2. accelerator 用的是 CmdOrCtrl（Cmd 在 Windows 上无效）
 *   3. 渲染层有可见的 Preferences 入口
 *
 * 注意：webpack 会 mangle 变量名，所以只能按行为特征匹配，不能按变量名。
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';

const DIST = path.join(__dirname, '..', 'dist');

// 渲染层产物：dist/main.<hash>.js；主进程产物：dist/main.js
const rendererFiles = fs.readdirSync(DIST).filter(f => /^main\.[0-9a-f]+\.js$/.test(f));

assert.ok(rendererFiles.length, '找不到渲染层产物 main.<hash>.js（先跑 npm run build）');

const renderer = rendererFiles.map(f => fs.readFileSync(path.join(DIST, f), 'utf8')).join('\n');
const main = fs.existsSync(path.join(DIST, 'main.js'))
    ? fs.readFileSync(path.join(DIST, 'main.js'), 'utf8')
    : '';

// 1. 菜单栏条件：形如 (A||B||C)&&...setApplicationMenu
const menuCalls = main.match(/[A-Za-z_$][\w$]*\s*\|\|\s*[A-Za-z_$][\w$]*\s*\|\|\s*[A-Za-z_$][\w$]*\)?\s*&&\s*[^;]{0,120}setApplicationMenu/g);

assert.ok(menuCalls && menuCalls.length, '未找到 updateMenu 的条件判断');
assert.ok(
    menuCalls.some(call => call.split('&&')[0].split('||').length === 3),
    `updateMenu 的条件应有三个分支（macOS / Linux 菜单开关 / Windows），实际: ${menuCalls[0]}`
);
console.log('✓ updateMenu 的条件含 Windows 分支:', menuCalls[0].split('&&')[0]);

// 2. accelerator 不能用 Cmd（Windows 上 Cmd 不生效）
const cmdOnly = main.match(/accelerator:"Cmd\+[^"]*"/g);

assert.strictEqual(cmdOnly, null, `仍有 Windows 上无效的 Cmd accelerator: ${cmdOnly}`);
console.log('✓ 主进程 accelerator 全部改用 CmdOrCtrl');

assert.ok(main.includes('accelerator:"CmdOrCtrl+,"'), 'Preferences 应有 CmdOrCtrl+, 快捷键');
console.log('✓ Preferences 快捷键为 CmdOrCtrl+,');

// 3. 渲染层有可见入口
assert.ok(renderer.includes('"Preferences"') || renderer.includes("'Preferences'"), '渲染层应有 Preferences 入口');
assert.ok(
    /preferences\.show\s*=\s*!0|show\s*=\s*!0/.test(renderer),
    '应把 preferences.show 置为 true（mobx observable 编译后为 =!0）'
);
console.log('✓ 渲染层有可直接打开偏好设置的入口');

console.log('\nWindows 入口验证全部通过');
