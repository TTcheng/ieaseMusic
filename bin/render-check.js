
/**
 * 渲染层的音源分支验证。
 *
 * 验证不同音源下 UI 的真实差异：
 *   1. 搜索页：fnos 只显示 Song tab；netease 显示 4 个 tab
 *   2. Welcome 页：fnos 隐藏 歌单/榜单/推荐 入口；netease 显示
 *   3. 偏好设置：音源单选存在，旧的 enginers 开关已消失
 *
 * 用 renderToStaticMarkup（不需要 jsdom）。
 */

import assert from 'assert';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { Provider } from 'mobx-react';
import { ThemeProvider } from 'react-jss';
import { StaticRouter } from 'react-router';

import stores from '../src/js/stores';
import theme from '../config/theme';

// ui/Modal 等在 render 时碰 document/window
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
        confirm: () => false,
        location: { hash: '' },
        localStorage: { getItem: () => null, setItem: () => {} },
    };
}

// ui/Modal 的内容走 ReactDOM.createPortal，服务端渲染不支持 portal，
// 桩成直接返回 children，让整棵树能渲染出来
const ReactDOM = require('react-dom');

ReactDOM.createPortal = children => children;

function render(Component, props = {}, pathname = '/') {
    return ReactDOMServer.renderToStaticMarkup(
        React.createElement(
            ThemeProvider,
            { theme },
            React.createElement(
                Provider,
                stores,
                React.createElement(
                    StaticRouter,
                    { location: pathname, context: {} },
                    React.createElement(Component, props)
                )
            )
        )
    );
}

const Search = require('../src/js/pages/Search').default;
const Welcome = require('../src/js/pages/Welcome').default;
const Preferences = require('../src/js/components/Preferences').default;

async function main() {
    const originalWarn = console.warn;
    const originalError = console.error;
    const isNoise = args => /componentWillMount|componentWillReceiveProps|Please update the following|Failed context type/.test(String(args[0] || ''));

    console.warn = (...a) => { if (!isNoise(a)) originalWarn(...a); };
    console.error = (...a) => { if (!isNoise(a)) originalError(...a); };

    try {
        await stores.source.init();
        await stores.preferences.init();

        // ---- 1. 搜索页：netease 模式 ----
        console.log('=== 搜索页 / netease 模式 ===');
        stores.source.source = 'netease';

        let html = render(Search, {}, '/search');

        for (const tab of ['Playlist', 'Album', 'Singer', 'User']) {
            assert.ok(html.includes(tab), `netease 模式应显示 ${tab} tab`);
        }
        assert.ok(!html.includes('>Song<'), 'netease 模式不应出现 Song tab');
        console.log('✓ 显示 Playlist / Album / Singer / User 四个 tab');

        // ---- 2. 搜索页：fnos 模式 ----
        console.log('\n=== 搜索页 / fnos 模式 ===');
        stores.source.source = 'fnos';

        html = render(Search, {}, '/search');

        // fnOS 模式搜曲库：歌曲 / 专辑 / 歌手，没有歌单和用户
        assert.ok(html.includes('>Song<'), 'fnos 模式应显示 Song tab');
        assert.ok(html.includes('>Album<'), 'fnos 模式应显示 Album tab');
        assert.ok(html.includes('>Singer<'), 'fnos 模式应显示 Singer tab');
        for (const tab of ['Playlist', 'User']) {
            assert.ok(!html.includes(`>${tab}<`), `fnos 模式不应出现 ${tab} tab`);
        }
        console.log('✓ 显示 Song / Album / Singer 三个 tab，歌单与用户已隐藏');

        // ---- 3. Welcome：netease 模式 ----
        console.log('\n=== Welcome / netease 模式 ===');
        stores.source.source = 'netease';
        stores.me.profile = { userId: 12345, nickname: 'tester' };
        stores.me.initialized = true;
        stores.home.list = [];

        html = render(Welcome, {}, '/');

        assert.ok(html.includes('Search'), '应有 Search 入口');
        assert.ok(html.includes('Playlist'), 'netease 模式应有 Playlist 入口');
        assert.ok(html.includes('Top podcasts'), 'netease 模式应有 Top podcasts 入口');
        assert.ok(html.includes('Made For You'), 'netease 模式应有 Made For You 入口');
        assert.ok(html.includes('Preferences'), '应有 Preferences 入口');
        console.log('✓ 显示 Search / Playlist / Top podcasts / Made For You / Preferences');

        // ---- 4. Welcome：fnos 模式 ----
        console.log('\n=== Welcome / fnos 模式 ===');
        stores.source.source = 'fnos';
        stores.source.fnosProfile = {
            base: 'https://nas:5667',
            username: 'iease',
            password: 'secret',
            user: { name: 'IEase' },
        };
        stores.me.profile = {};

        html = render(Welcome, {}, '/');

        assert.ok(html.includes('Search'), 'fnos 模式仍应有 Search 入口');
        assert.ok(html.includes('Preferences'), 'fnos 模式仍应有 Preferences 入口');
        assert.ok(!html.includes('Top podcasts'), 'fnos 模式不应有 Top podcasts');
        assert.ok(!html.includes('Made For You'), 'fnos 模式不应有 Made For You');
        // 「Playlist」会出现在 <link> 之类的地方，按入口文案精确判断
        assert.ok(!html.includes('>Playlist'), 'fnos 模式不应有 Playlist 入口');
        console.log('✓ 只留 Search / Preferences，歌单/榜单/推荐已隐藏');

        // ---- 5. 偏好设置：音源单选 ----
        console.log('\n=== 偏好设置 / 音源单选 ===');
        stores.preferences.show = true;

        html = render(Preferences, {}, '/');

        assert.ok(html.includes('sourceNetease'), '应有网易云单选');
        assert.ok(html.includes('sourceFnos'), '应有飞牛单选');
        assert.ok(html.includes('type="radio"') || html.includes('radio'), '应是 radio 形式');
        console.log('✓ 音源单选存在（sourceNetease / sourceFnos）');

        // 旧的 enginers 开关应该没了
        for (const old of ['enginerOfQQ', 'enginerOfMiGu', 'enginerOfXiami', 'enginerOfKugou', 'enginerOfKuwo', 'enginerOfBaidu', 'enginerOfFnos']) {
            assert.ok(!html.includes(old), `旧的音源开关 ${old} 应已删除`);
        }
        assert.ok(!html.includes('Music search enginers'), '旧的「Music search enginers」区块应已删除');
        console.log('✓ 旧的 7 个音源开关与区块已删除');

        // 选中项应反映当前音源（fnos）
        const fnosChecked = /id="sourceFnos"[^>]*checked/.test(html)
            || /checked[^>]*id="sourceFnos"/.test(html);

        assert.ok(fnosChecked, 'fnos 为当前音源时，对应单回应选中');
        console.log('✓ 当前音源（fnos）的单选框已选中');

        // ---- 6. 选音源页 / fnOS 登录页 ----
        console.log('\n=== 登录页渲染 ===');
        const SourcePage = require('../src/js/pages/Login/Source').default;
        const FnosPage = require('../src/js/pages/Login/Fnos').default;

        let page = render(SourcePage, {}, '/login');

        assert.ok(page.includes('Choose a source'), '选音源页应有标题');
        assert.ok(page.includes('网易云音乐'), '选音源页应有网易云卡片');
        assert.ok(page.includes('飞牛音乐'), '选音源页应有飞牛卡片');
        console.log('✓ 选音源页：两张卡片');

        page = render(FnosPage, {}, '/login/fnos');

        assert.ok(page.includes('飞牛音乐'), 'fnOS 登录页应有标题');
        assert.ok(page.includes('type="password"'), 'fnOS 登录页应有密码框');
        assert.ok(page.includes('Test connection'), 'fnOS 登录页应有测试连接按钮');
        assert.ok(page.includes('Change source'), 'fnOS 登录页应能返回选音源');

        // 地址框应带默认值，方便用户直接改
        assert.ok(
            page.includes('https://nas:5667'),
            'fnOS 登录页的服务地址应有默认值'
        );
        console.log('✓ fnOS 登录页：地址/账号/密码 + 测试连接 + 返回');

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
