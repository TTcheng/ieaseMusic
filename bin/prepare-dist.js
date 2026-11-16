
/**
 * 生成打包用的 package.json（只含运行时依赖）。
 *
 * 问题：webpack 的 CopyWebpackPlugin 把源码根的 package.json 原样拷进 dist/，
 * 里面带着 41 个 devDependencies。electron-builder 读到它后会在 dist/ 里
 * `npm install` 整套构建工具 —— 238 个包、571 MB，其中混着要求 Node 14+ 的
 * 依赖（如 electron-updater@4.6.5 用了 fs/promises），而 Electron 4.2.12
 * 内置的是 Node 10，直接在主进程崩溃。
 *
 * 这里产出两份：
 *   dist/package.json         —— 保留 dependencies + build 段（electron-builder 要读 build 配置）
 *   dist/package-lock.json    —— 删掉，让 builder 用自己的解析
 *
 * 运行时依赖其实大多已被 webpack 打进 bundle（没有 externals 配置），
 * 但 electron-updater 等有动态 require，保留 dependencies 更稳妥。
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

if (!fs.existsSync(DIST)) {
    console.error('dist/ 不存在，请先运行 npm run build');
    process.exit(1);
}

const runtime = {
    name: source.name,
    version: source.version,
    description: source.description,
    main: source.main,
    author: source.author,
    license: source.license,
    dependencies: source.dependencies,
    build: source.build,
};

// electron 本身是 devDependency（运行时由 electron 宿主提供），但
// electron-builder 需要从 package.json 读出版本号才会去下载对应的
// 预编译二进制；缺了它会去抓最新版（如 45.x），那要求 Node 18+，
// 与 Electron 4 的运行时对不上。单独补一个 electron 版本字段。
const electronVersion = (source.devDependencies || {}).electron;

if (electronVersion) {
    runtime.devDependencies = { electron: electronVersion };
}

fs.writeFileSync(
    path.join(DIST, 'package.json'),
    JSON.stringify(runtime, null, 2)
);

const lock = path.join(DIST, 'package-lock.json');

if (fs.existsSync(lock)) {
    fs.unlinkSync(lock);
}

console.log(`✓ dist/package.json 已生成：${Object.keys(runtime.dependencies).length} 个运行时依赖，${Object.keys(source.devDependencies || {}).length} 个 devDependencies 已剥离（保留 electron ${electronVersion || '无'} 供 builder 定位二进制）`);
