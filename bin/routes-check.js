
/**
 * 路由守卫的集成测试。
 *
 * 用 MemoryRouter 真实渲染 routes.js，验证：
 *   1. 未登录访问任何内容页 -> 重定向到登录页（渲染出选音源页）
 *   2. 已登录 -> 正常渲染目标页
 *   3. 登录页本身未登录也可达
 *   4. fnos 登录态与 netease 登录态各自生效
 *
 * 用 renderToStaticMarkup（服务端渲染，不需要 jsdom）。
 */

import assert from 'assert';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { Provider } from 'mobx-react';
import { ThemeProvider } from 'react-jss';
import { StaticRouter } from 'react-router';

import stores from '../src/js/stores';
import theme from '../config/theme';

// 服务端渲染没有 DOM。个别组件（ui/Modal）render 时会碰 document.body，
// 这里补一个最小桩，足够让 render 走完。
if (typeof global.document === 'undefined') {
    global.document = {
        body: { style: {} },
        getElementById: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
        querySelector: () => null,
    };
}

if (typeof global.window === 'undefined') {
    global.window = {
        addEventListener: () => {},
        removeEventListener: () => {},
        location: { hash: '' },
        localStorage: { getItem: () => null, setItem: () => {} },
    };
}

function render(pathname) {
    // 用 StaticRouter（不是 MemoryRouter）：<Redirect> 在服务端渲染下
    // 靠 StaticRouter 把目标写进 context.url，MemoryRouter 要等
    // componentDidMount 才导航，SSR 里不会触发。
    const context = {};
    const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(
            ThemeProvider,
            { theme },
            React.createElement(
                Provider,
                stores,
                React.createElement(
                    StaticRouter,
                    { location: pathname, context },
                    routes()
                )
            )
        )
    );

    return { html, context };
}

// routes.js 导出的是 () => JSX
function routes() {
    return require('../src/js/routes').default();
}

async function main() {
    const source = stores.source;
    const me = stores.me;

    // 过滤 React 的弃用警告，但保留真正的错误输出
    const originalWarn = console.warn;
    const originalError = console.error;
    const isNoise = args => String(args[0] || '').includes('componentWillMount')
        || String(args[0] || '').includes('componentWillReceiveProps')
        || String(args[0] || '').includes('Please update the following');

    console.warn = (...args) => {
        if (!isNoise(args)) originalWarn(...args);
    };
    console.error = (...args) => {
        if (!isNoise(args)) originalError(...args);
    };

    try {
        // ---- 场景 1：未登录访问首页 ----
        console.log('=== 未登录访问 / ===');
        await source.init();
        // Preferences 组件依赖 preferences.init() 载入 backgrounds 等字段
        await stores.preferences.init();
        me.initialized = true;
        me.profile = {};

        let out = render('/');

        assert.strictEqual(
            out.context.url,
            '/login',
            `未登录应重定向到 /login，实际 ${out.context.url}`
        );
        console.log('✓ 重定向到 /login');

        // ---- 场景 2：未登录访问其他内容页 ----
        console.log('\n=== 未登录访问各内容页 ===');
        for (const path of ['/search', '/top', '/playlist/全部', '/fm', '/user/1', '/lyrics', '/singleton', '/comments']) {
            const r = render(path);

            assert.strictEqual(
                r.context.url,
                '/login',
                `${path} 未登录时应重定向到 /login，实际 ${r.context.url}`
            );
        }
        console.log('✓ 搜索/榜单/歌单/FM/用户/歌词/收藏/评论 全部重定向');

        // ---- 场景 3：登录页本身可达 ----
        console.log('\n=== 登录页本身 ===');
        const loginPage = render('/login');

        assert.strictEqual(loginPage.context.url, undefined, '/login 不应被重定向');
        assert.ok(loginPage.html.includes('Choose a source'), '/login 应渲染选音源页');
        assert.ok(loginPage.html.includes('网易云音乐'), '应显示网易云卡片');
        assert.ok(loginPage.html.includes('飞牛音乐'), '应显示飞牛卡片');
        console.log('✓ /login 可访问且渲染出两张音源卡片');

        // ---- 场景 4：netease 已登录 ----
        console.log('\n=== netease 已登录访问 / ===');
        source.source = 'netease';
        me.profile = { userId: 12345, nickname: 'tester' };

        out = render('/');

        assert.strictEqual(
            out.context.url,
            undefined,
            `已登录不应被重定向，实际 ${out.context.url}`
        );
        console.log('✓ 已登录放行（无重定向）');

        // ---- 场景 5：fnos 已登录 ----
        console.log('\n=== fnos 已登录访问 / ===');
        source.source = 'fnos';
        source.fnosProfile = {
            base: 'https://nas:5667',
            username: 'iease',
            password: 'secret',
            user: { name: 'IEase' },
        };
        me.profile = {}; // fnos 模式下不应依赖网易云 profile

        out = render('/');

        assert.strictEqual(
            out.context.url,
            undefined,
            `fnos 登录后不应被重定向，实际 ${out.context.url}`
        );
        console.log('✓ fnos 登录态也能放行');

        // ---- 场景 6：fnos 只填了部分凭据 -> 未登录 ----
        console.log('\n=== fnos 凭据不完整 ===');
        source.fnosProfile = { base: 'https://nas:5667', username: 'iease' };

        out = render('/');

        assert.strictEqual(
            out.context.url,
            '/login',
            '凭据不完整应视为未登录，重定向到 /login'
        );
        console.log('✓ 缺密码时视为未登录');

        // ---- 场景 7：hasLogin 分流 ----
        console.log('\n=== hasLogin 按音源分流 ===');
        source.source = 'netease';
        me.profile = { userId: 1 };
        assert.strictEqual(me.hasLogin(), true, 'netease + profile 应已登录');

        source.source = 'fnos';
        source.fnosProfile = {};
        assert.strictEqual(me.hasLogin(), false, 'fnos 无凭据应未登录');

        source.fnosProfile = { base: 'b', username: 'u', password: 'p' };
        assert.strictEqual(me.hasLogin(), true, 'fnos 有完整凭据应已登录');

        console.log('✓ hasLogin 各情形正确');

        console.log('\n全部通过');
        process.exit(0);
    } finally {
        console.warn = originalWarn;
        console.error = originalError;
    }
}

main().catch(ex => {
    console.error('\n✗ 失败:', ex.message);
    console.error(ex.stack && ex.stack.split('\n').slice(0, 10).join('\n'));
    process.exit(1);
});
