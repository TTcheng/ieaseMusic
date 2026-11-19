
/**
 * jsdom 测试环境。
 *
 * 给渲染层的交互测试用：
 *   - 搭出 DOM 环境（window / document / navigator …）
 *   - 按 webpack resolve.alias 解析模块（ui/ components/ stores/ …）
 *   - 桩掉 electron、css 资源、ui/Modal 的 portal
 *
 * 用法：
 *   node -r babel-register -r "$PWD/bin/_jsdom-env.js" bin/xxx.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { JSDOM } = require('jsdom');

// ---- DOM 环境 ----
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
});

const win = dom.window;

global.window = win;
global.document = win.document;

// Node 21+ 的 global.navigator 是只读 getter，得用 defineProperty 覆盖
Object.defineProperty(global, 'navigator', {
    value: win.navigator,
    configurable: true,
    writable: true,
});

global.HTMLElement = win.HTMLElement;
global.Element = win.Element;
global.Node = win.Node;
global.Event = win.Event;
global.MouseEvent = win.MouseEvent;
global.KeyboardEvent = win.KeyboardEvent;
global.getComputedStyle = win.getComputedStyle.bind(win);
global.requestAnimationFrame = cb => setTimeout(cb, 0);
global.cancelAnimationFrame = id => clearTimeout(id);
global.matchMedia = win.matchMedia || (() => ({ matches: false, addListener: () => {}, removeListener: () => {} }));

// jsdom 没有实现 Notification，controller.play 会用到
if (!win.Notification) {
    win.Notification = function(title, options) {
        this.title = title;
        this.options = options;
        this.onclick = null;
    };

    win.Notification.permission = 'granted';
}

global.Notification = win.Notification;

// jsdom 不实现 Image（不会真的去加载图片），
// 但 utils/albumColors 的取色逻辑要 new Image()。
global.Image = win.Image;

// 捕获渲染期未捕获的异常（React 会把错误吞成 "Uncaught"，这里保留原始栈）
win.addEventListener('error', ev => {
    const err = ev.error;

    if (err && err.stack) {
        process.stderr.write('\n=== jsdom 未捕获异常 ===\n' + err.stack.split('\n').slice(0, 14).join('\n') + '\n');
    }
});

// ---- webpack alias ----
const ROOT = path.join(__dirname, '..');

// utils/albumColors 由 src/app.js 挂成 window.AlbumColors，
// 测试里不加载 app.js，但 helper.getPallet 会用到它 —— 缺了会抛
// "window.AlbumColors is not a constructor"。
require(path.join(ROOT, 'src', 'js', 'utils', 'albumColors'));
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

const Module = require('module');
const originalLoad = Module._load;

// 存储文件路径，供测试脚本写入初始数据
const STORAGE = path.join(os.tmpdir(), `iease-jsdom-storage-${process.pid}.json`);

exports.STORAGE = STORAGE;

// css / 图片等资源
for (const ext of ['.css', '.less', '.scss', '.png', '.jpg', '.svg', '.gif', '.woff', '.ttf']) {
    // eslint-disable-next-line node/no-deprecated-api
    require.extensions[ext] = (module) => {
        module.exports = {};
    };
}

Module._load = function(request, parent, isMain) {
    if (request === 'electron') {
        return {
            ipcRenderer: {
                on: () => {},
                send: () => {},
                removeListener: () => {},
                removeAllListeners: () => {},
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
        return {
            get: (key, cb) => {
                let data = {};

                if (fs.existsSync(STORAGE)) {
                    data = JSON.parse(fs.readFileSync(STORAGE, 'utf8'));
                }

                // 与真实实现一致：不存在的 key 返回 {} 而不是 undefined
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
    }

    const aliased = resolveAlias(request);

    if (aliased) {
        return originalLoad.call(this, aliased, parent, isMain);
    }

    return originalLoad.apply(this, arguments);
};
