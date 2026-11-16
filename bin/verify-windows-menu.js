
/**
 * 验证菜单栏开关在 Linux 与 Windows 上行为一致。
 *
 * 约定：
 *   - 统一用一个 showMenuBar 标识控制 Linux 与 Windows
 *   - macOS 始终有菜单栏（系统惯例），不受开关影响
 *   - 默认不展示菜单栏（showMenuBar = false）
 *   - 开关切换后立即生效，不必重启
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

// 1. 旧的平台专用标识要彻底消失（不考虑老版本兼容）
assert.ok(!main.includes('showMenuBarOnLinux'), '主进程不应再有 showMenuBarOnLinux');
assert.ok(!renderer.includes('showMenuBarOnLinux'), '渲染层不应再有 showMenuBarOnLinux');
console.log('✓ 旧标识 showMenuBarOnLinux 已完全移除');

// 2. 统一标识存在
assert.ok(main.includes('showMenuBar'), '主进程应使用 showMenuBar');
assert.ok(renderer.includes('showMenuBar'), '渲染层应使用 showMenuBar');
console.log('✓ 统一使用 showMenuBar 标识');

// 3. 默认关闭
const storeSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'stores', 'preferences.js'), 'utf8');

assert.ok(
    /@observable showMenuBar\s*=\s*false/.test(storeSrc),
    'showMenuBar 默认应为 false（默认不展示菜单栏）'
);
console.log('✓ 默认不展示菜单栏');

// 4. macOS 不受开关影响（读源码，webpack 会 mangle 变量名）
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const prefSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'stores', 'preferences.js'), 'utf8');
const prefUiSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'components', 'Preferences', 'index.js'), 'utf8');

assert.ok(
    /if \(isOsx\) \{\s*updateMenu\(\);/.test(mainSrc),
    'applyMenuBar 里 macOS 应无条件调用 updateMenu'
);
assert.ok(
    /if \(!isOsx && !showMenuBar\) \{/.test(mainSrc),
    'updateMenu 应受 showMenuBar 控制'
);
console.log('✓ macOS 始终有菜单栏，Linux/Windows 由 showMenuBar 控制');

// 4b. macOS 上 UI 隐藏该开关
assert.ok(
    /isMacOS/.test(prefSrc),
    'preferences store 应提供 isMacOS'
);
assert.ok(
    /isMacOS\s*\?\s*false\s*:\s*\(/.test(prefUiSrc),
    'UI 应在 macOS 上隐藏菜单栏开关'
);
console.log('✓ macOS 上菜单栏开关不可见');

// 5. 开关切换后立即生效：update-preferences 要带上 showMenuBar
assert.ok(
    /showMenuBar/.test(renderer),
    '渲染层应把 showMenuBar 传给主进程'
);
assert.ok(
    /showMenuBar/.test(main) && /applyMenuBar/.test(main),
    '主进程应处理 showMenuBar 变化'
);
console.log('✓ 开关切换立即生效（applyMenuBar）');

// 6. accelerator 跨平台
const cmdOnly = main.match(/accelerator:"Cmd\+[^"]*"/g);

assert.strictEqual(cmdOnly, null, `仍有 Windows 上无效的 Cmd accelerator: ${cmdOnly}`);
assert.ok(main.includes('accelerator:"CmdOrCtrl+,"'), 'Preferences 应有 CmdOrCtrl+, 快捷键');
console.log('✓ accelerator 全部改用 CmdOrCtrl');

// 7. 不显示菜单栏时仍能打开偏好设置
assert.ok(renderer.includes('"Preferences"'), '渲染层应有 Preferences 入口');
assert.ok(
    /preferences\.show\s*=\s*!0|show\s*=\s*!0/.test(renderer),
    '应能直接打开偏好设置'
);
console.log('✓ 菜单栏关闭时仍有可见的偏好设置入口');

console.log('\n菜单栏开关验证全部通过');
