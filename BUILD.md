# 构建与打包

## 前置

- Node 8–12（项目用 babel 6 / webpack 4，Node 14+ 会因 `webpack-cli@3` 报
  `Cannot use import statement outside a module`；Node 16+ 还会因 `core-js@2`
  的 postinstall 失败）
- `git submodule update --init --recursive`（API 模块在 submodule 里）

## 开发

```bash
npm install
npm run dev
```

## 打包 Windows

在 Linux 上交叉打包需要 wine，用 electronuserland/builder 官方镜像：

```bash
docker run --rm -i -v "$PWD:/project" -v /tmp/npmcache:/root/.npm \
  --shm-size=2g electronuserland/builder:wine bash <<'EOF'
set -e
cd /project
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
export npm_config_registry="https://registry.npmmirror.com"
npm install --no-audit --no-fund
npm run build
npx electron-builder --win --ia32 --projectDir ./dist --publish never
EOF
```

产物在 `release/`：

- `ieaseMusic-1.3.4-win.exe` —— NSIS 安装包
- `win-ia32-unpacked/` —— 免安装目录

## 验证产物

```bash
node -r babel-register bin/verify-package.js
```

会解开 `app.asar`，确认 `NeteaseCloudMusicApi/module/` 的 106 个接口都在，
并真实调一次 `/toplist` 验证网络与加密链路通。

## 已知坑

| 现象 | 原因 | 处理 |
|---|---|---|
| `npm install` ERESOLVE | `react-addons-css-transition-group@15` 要 `react@^15`，项目用 `react@16` | 仓库根 `.npmrc` 已设 `legacy-peer-deps=true` |
| electron-builder 内部二次安装仍报 ERESOLVE | 子进程不读环境变量 | 靠 `.npmrc` 生效 |
| `cannot resolve .../electron-v4.0.1-win32-ia32.zip: 404` | `package.json` 里 `electron: ^4.0.1`，builder 自解版本 | 已固定为 `4.2.12` |
| `npm run build` 在 Node 14+ 失败 | webpack-cli 3 不支持 ESM config | 用 Node 8–12，或 `node -r babel-register node_modules/webpack/bin/webpack --config ...` |
| 运行时报 `ENOENT ... NeteaseCloudMusicApi/module` | submodule 指针指向 `router/` 结构的旧提交 | 已固定为 `9bd7637`（含 `module/`） |

## 打包与源码的差异

- `package.json` 的 `build.files` 未显式配置，用默认 `**/*`。
- `NeteaseCloudMusicApi/module/*.js` 由 webpack 的 `CopyWebpackPlugin` 从
  submodule 拷进 `dist/NeteaseCloudMusicApi/module/`，asar 内路径与
  `server/api.js` 的运行时解析一致（`__dirname` + `/NeteaseCloudMusicApi/module`）。
