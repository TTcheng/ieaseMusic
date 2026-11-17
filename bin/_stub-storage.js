
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

// webpack 的 css / 资源 loader 在 Node 下不认，桩成空模块
// （require.extensions 已弃用，但这是测试环境里最简单的办法）
for (const ext of ['.css', '.less', '.scss', '.png', '.jpg', '.svg', '.gif', '.woff', '.ttf']) {
    // eslint-disable-next-line node/no-deprecated-api
    require.extensions[ext] = (module) => {
        module.exports = {};
    };
}

// 供测试脚本读取同一份存储
exports.STORAGE = STORAGE;

// webpack alias 在 Node 下不认，这里按 config/webpack.config.base.js
// 的 resolve.alias 一一对应补上（前缀匹配，支持 ui/Offline 这种子路径）
const ROOT = path.join(__dirname, '..');
const CLIENT = path.join(ROOT, 'src');

const ALIAS = {
    root: ROOT,
    config: path.join(ROOT, 'config'),
    common: path.join(ROOT, 'common'),
    app: CLIENT,
    ui: path.join(CLIENT, 'js', 'ui'),
    utils: path.join(CLIENT, 'js', 'utils'),
    components: path.join(CLIENT, 'js', 'components'),
    stores: path.join(CLIENT, 'js', 'stores'),
};

const ALIAS_KEYS = Object.keys(ALIAS);

/**
 * 把 'ui/Offline' 解析成真实路径；不是别名就返回 null。
 */
function resolveAlias(request) {
    for (const key of ALIAS_KEYS) {
        if (request === key) {
            return ALIAS[key];
        }

        if (request.startsWith(key + '/')) {
            return path.join(ALIAS[key], request.slice(key.length + 1));
        }
    }

    return null;
}

Module._load = function(request, parent, isMain) {
    // ui/Modal 的内容通过 TransitionPortal 在 componentDidMount 里挂到 DOM，
    // 服务端渲染永远看不到 children。测试里桩成直通组件。
    if (request === 'ui/Modal' || request === path.join(ALIAS.ui, 'Modal')) {
        const React = require(path.join(ROOT, 'node_modules', 'react'));
        const pass = tag => props => React.createElement(tag, null, props.children);

        return {
            Modal: pass('div'),
            ModalHeader: pass('header'),
            ModalBody: pass('section'),
        };
    }

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
            // 注意：electron-json-storage 对不存在的 key 返回 {} 而不是 undefined
            // （见 lib/storage.js readFile 的 ENOENT 分支），桩要保持一致，
            // 否则 preferences.init() 之类的解构会崩。
            get: (key, cb) => {
                let data = {};

                if (fs.existsSync(STORAGE)) {
                    data = JSON.parse(fs.readFileSync(STORAGE, 'utf8'));
                }

                cb(null, data[key] === undefined ? {} : data[key]);
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

    if (ALIAS[request] || resolveAlias(request)) {
        return originalLoad.call(this, resolveAlias(request) || ALIAS[request], parent, isMain);
    }

    return originalLoad.apply(this, arguments);
};
