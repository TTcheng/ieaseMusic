
/**
 * electron-json-storage 的桩。
 *
 * 非 electron 环境下它要求 app.getPath，会抛
 * "You must explicitly set a data path"。
 * 用 `-r` 提前注册，配合 babel 的 import 提升（require 会被提到文件顶部）。
 *
 * 用法：
 *   node -r babel-register -r "$PWD/bin/_stub-storage.js" bin/xxx.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const Module = require('module');
const originalLoad = Module._load;
const STORAGE = path.join(os.tmpdir(), `iease-stub-storage-${process.pid}.json`);

// 供测试脚本读取同一份存储
exports.STORAGE = STORAGE;

// webpack alias 在 Node 下不认，这里补上
// （对应 config/webpack.config.base.js 的 resolve.alias）
const ROOT = path.join(__dirname, '..');
const ALIAS = {
    'common/storage': path.join(ROOT, 'common', 'storage'),
    'common/cache': path.join(ROOT, 'common', 'cache'),
    'root/package.json': path.join(ROOT, 'package.json'),
    'config/index': path.join(ROOT, 'config', 'index'),
    'config/theme': path.join(ROOT, 'config', 'theme'),
    'config/theme.js': path.join(ROOT, 'config', 'theme'),
    'utils/helper': path.join(ROOT, 'src', 'js', 'utils', 'helper'),
    'utils/lastfm': path.join(ROOT, 'src', 'js', 'utils', 'lastfm'),
    'utils/colors': path.join(ROOT, 'src', 'js', 'utils', 'colors'),
};

Module._load = function(request, parent, isMain) {
    if (request === 'electron') {
        // 渲染进程用到的 electron API 桩
        return {
            ipcRenderer: {
                on: () => {},
                send: () => {},
                removeListener: () => {},
            },
            remote: {
                app: {
                    getPath: () => os.tmpdir(),
                    getName: () => 'ieaseMusic',
                },
                getCurrentWindow: () => ({
                    webContents: {
                        session: { clearStorageData: () => {} },
                    },
                }),
                process: {
                    platform: process.platform,
                },
            },
        };
    }

    if (request === 'electron-json-storage') {
        const impl = {
            get: (key, cb) => {
                let data = {};

                if (fs.existsSync(STORAGE)) {
                    data = JSON.parse(fs.readFileSync(STORAGE, 'utf8'));
                }

                cb(null, data[key]);
            },
            set: (key, data, cb) => {
                let all = {};

                if (fs.existsSync(STORAGE)) {
                    all = JSON.parse(fs.readFileSync(STORAGE, 'utf8'));
                }

                all[key] = data;
                fs.writeFileSync(STORAGE, JSON.stringify(all));
                cb(null);
            },
            remove: (key, cb) => {
                let all = {};

                if (fs.existsSync(STORAGE)) {
                    all = JSON.parse(fs.readFileSync(STORAGE, 'utf8'));
                }

                delete all[key];
                fs.writeFileSync(STORAGE, JSON.stringify(all));
                cb(null);
            },
        };

        return impl;
    }

    if (ALIAS[request]) {
        return originalLoad.call(this, ALIAS[request], parent, isMain);
    }

    return originalLoad.apply(this, arguments);
};
