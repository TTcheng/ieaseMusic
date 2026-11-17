
/**
 * 渲染层交互测试（jsdom）。
 *
 * 真正挂载组件、模拟点击、断言状态与路由变化 —— 覆盖 render-check
 * 覆盖不到的「点了会怎样」。
 *
 * 用法：
 *   node -r babel-register -r "$PWD/bin/_jsdom-env.js" bin/ui-check.js
 */

import assert from 'assert';
import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { Provider } from 'mobx-react';
import { ThemeProvider } from 'react-jss';
import { Router, Route } from 'react-router-dom';
import { createMemoryHistory } from 'history';

import stores from '../src/js/stores';
import theme from '../config/theme';

const SourcePage = require('../src/js/pages/Login/Source').default;
const FnosPage = require('../src/js/pages/Login/Fnos').default;
const Preferences = require('../src/js/components/Preferences').default;
const SearchPage = require('../src/js/pages/Search').default;

let container;
let history;

/**
 * 挂载一个组件，返回 { container, history }。
 *
 * 用 <Route> 包裹 —— 真实应用里 <Route component={X} /> 会注入
 * history/location/match，直接渲染组件的话 this.props.history 是 undefined。
 */
async function mount(Component, pathname = '/', props = {}, routePath = '/') {
    container = document.createElement('div');
    document.body.appendChild(container);
    history = createMemoryHistory({ initialEntries: [pathname] });

    await act(async() => {
        ReactDOM.render(
            React.createElement(
                ThemeProvider,
                { theme },
                React.createElement(
                    Provider,
                    stores,
                    React.createElement(
                        Router,
                        { history },
                        React.createElement(
                            Route,
                            {
                                path: routePath,
                                // render 的第一个参数就是路由注入的 props
                                // （history / location / match），必须传下去，
                                // 否则组件里 this.props.history 是 undefined
                                render: routeProps => React.createElement(
                                    Component,
                                    Object.assign({}, routeProps, props)
                                ),
                            }
                        )
                    )
                )
            ),
            container
        );
    });

    return { container, history };
}

function unmount() {
    if (container) {
        ReactDOM.unmountComponentAtNode(container);
        container.remove();
        container = null;
    }
}

/**
 * 按可见文本找元素。
 */
function byText(selector, text) {
    // Preferences 的内容通过 ui/Modal 的 portal 渲染在 document.body 上，
    // 不在 container 里，所以整个 body 都要找
    return Array.from(document.body.querySelectorAll(selector))
        .find(e => e.textContent.includes(text));
}

async function main() {
    await stores.source.init();
    await stores.preferences.init();

    // ---- 1. 选音源页：点飞牛 -> 路由跳到 /login/fnos ----
    console.log('=== 选音源页：点击飞牛音乐 ===');
    await mount(SourcePage, '/login', {}, '/login');

    const fnosCard = byText('h2', '飞牛音乐');

    assert.ok(fnosCard, '应找到飞牛音乐卡片');
    console.log('✓ 找到「飞牛音乐」卡片');

    await act(async() => {
        fnosCard.parentElement.click();
    });

    assert.strictEqual(history.location.pathname, '/login/fnos', '应跳到 /login/fnos');
    console.log('✓ 点击后路由跳到', history.location.pathname);

    // 点网易云
    unmount();
    await mount(SourcePage, '/login', {}, '/login');

    const neteaseCard = byText('h2', '网易云音乐');

    await act(async() => {
        neteaseCard.parentElement.click();
    });

    assert.strictEqual(history.location.pathname, '/login/netease', '应跳到 /login/netease');
    console.log('✓ 点击后路由跳到', history.location.pathname);
    unmount();

    // ---- 2. fnOS 登录页：填表 -> 测试连接 -> 登录 ----
    console.log('\n=== fnOS 登录页：填表与测试连接 ===');
    await mount(FnosPage, '/login/fnos', {}, '/login/fnos');

    const inputs = container.querySelectorAll('input');

    assert.strictEqual(inputs.length, 3, '应有地址/账号/密码三个输入框');
    console.log('✓ 三个输入框');

    // 默认地址
    assert.ok(
        inputs[0].value.includes('nas'),
        `地址应有默认值，实际 ${inputs[0].value}`
    );
    console.log('✓ 地址默认值:', inputs[0].value);

    // 填值
    await act(async() => {
        inputs[0].value = 'https://nas:5667';
        inputs[1].value = 'iease';
        inputs[2].value = 'secret';
        Simulate.change(inputs[0], { target: { value: 'https://nas:5667' } });
    });

    assert.strictEqual(inputs[1].value, 'iease', '用户名应写入');
    console.log('✓ 表单已填值');

    // 调 /api/fnos/test —— 用假的 axios 避免真实请求
    const axios = require('axios');
    const originalGet = axios.get;
    let testCall = null;

    axios.get = async(url, config) => {
        testCall = { url, params: config && config.params };

        return { data: { success: true, trackCount: 2453, user: { name: 'IEase' } } };
    };

    // 点「Test connection」
    const testBtn = byText('button', 'Test connection');

    assert.ok(testBtn, '应有测试连接按钮');

    await act(async() => {
        testBtn.click();
    });

    assert.ok(testCall, '应发出 /api/fnos/test 请求');
    assert.ok(testCall.url.includes('/api/fnos/test'), `应请求 /api/fnos/test，实际 ${testCall.url}`);
    assert.strictEqual(testCall.params.username, 'iease', '请求应带上用户名');
    console.log('✓ 测试连接请求已发出:', testCall.url, JSON.stringify(testCall.params));

    // 成功提示应出现
    assert.ok(
        document.body.textContent.includes('2453'),
        '应显示曲库数量'
    );
    console.log('✓ 显示连接成功与曲库数量');

    // 点「Login」
    const loginBtn = byText('button', 'Login');

    await act(async() => {
        loginBtn.click();
    });

    // 登录后应保存凭据并切到 fnos 音源
    assert.strictEqual(stores.source.source, 'fnos', '音源应切到 fnos');
    assert.strictEqual(stores.source.fnosProfile.username, 'iease', '应保存用户名');
    assert.strictEqual(stores.source.fnosProfile.base, 'https://nas:5667', '应保存地址');
    assert.strictEqual(history.location.pathname, '/', '应跳到首页');
    console.log('✓ 登录成功：凭据已存、音源切到 fnos、跳到首页');

    // ---- 3. 测试连接失败 ----
    console.log('\n=== fnOS 登录页：连接失败 ===');
    axios.get = async() => ({ data: { success: false, error: '账号或密码错误' } });

    unmount();
    stores.source.source = null;
    await mount(FnosPage, '/login/fnos', {}, '/login/fnos');

    // 重新填表（组件是重新挂载的，输入框是空的）
    const failInputs = container.querySelectorAll('input');

    await act(async() => {
        failInputs[0].value = 'https://nas:5667';
        failInputs[1].value = 'iease';
        failInputs[2].value = 'wrong';
    });

    const failBtn = byText('button', 'Test connection');

    await act(async() => {
        failBtn.click();
    });

    assert.ok(
        document.body.textContent.includes('账号或密码错误'),
        `应显示错误信息，实际：${document.body.textContent.slice(0, 200)}`
    );
    console.log('✓ 失败时显示错误信息');

    // 失败时不应该切音源
    assert.notStrictEqual(stores.source.source, 'fnos', '失败时不应切音源');
    console.log('✓ 失败时未切换音源');
    unmount();

    axios.get = originalGet;

    // ---- 4. 偏好设置：切换音源 ----
    console.log('\n=== 偏好设置：切换音源 ===');
    stores.source.source = 'netease';
    stores.source.fnosProfile = {};
    stores.preferences.show = true;

    // 确认弹窗：点「确定」
    const originalConfirm = window.confirm;
    let confirmResult = true;

    window.confirm = () => confirmResult;

    await mount(Preferences, '/', {}, '/');

    const fnosRadio = document.body.querySelector('#sourceFnos');

    assert.ok(fnosRadio, '应有飞牛单选框');
    console.log('✓ 找到飞牛单选框');

    await act(async() => {
        Simulate.change(fnosRadio, { target: { checked: true } });
    });

    assert.strictEqual(stores.source.source, 'fnos', '确认后应切到 fnos');
    console.log('✓ 确认后音源已切换为 fnos');

    // 取消的情况
    stores.source.source = 'netease';
    confirmResult = false;

    await act(async() => {
        Simulate.change(document.body.querySelector('#sourceFnos'), { target: { checked: true } });
    });

    assert.strictEqual(stores.source.source, 'netease', '取消后不应切换');
    console.log('✓ 取消后音源未变');

    window.confirm = originalConfirm;
    unmount();

    // ---- 5. 搜索页：点歌 -> 进播放器 ----
    console.log('\n=== 搜索页：点歌进播放器 ===');
    stores.source.source = 'fnos';

    // 桩掉搜索请求
    axios.get = async(url) => {
        if (url.includes('/api/fnos/search')) {
            return {
                data: {
                    list: [{
                        guid: '1c9a00ccce9749468dd12f5364954a9b',
                        name: '0196.周杰伦-晴天',
                        duration: 269751,
                        artists: [{ name: '周杰伦' }],
                        album: { name: '未知专辑', cover: null },
                    }],
                    total: 1,
                },
            };
        }

        return { data: {} };
    };

    await mount(SearchPage, '/search', {}, '/search');

    // 搜一下
    const searchInput = container.querySelector('input');

    await act(async() => {
        searchInput.value = '晴天';
        Simulate.change(searchInput, { target: { value: '晴天' } });
        Simulate.keyUp(searchInput, { keyCode: 13, target: { value: '晴天' } });
    });

    assert.ok(
        document.body.textContent.includes('0196.周杰伦-晴天'),
        `搜索结果应显示歌名，实际：${document.body.textContent.slice(0, 200)}`
    );
    console.log('✓ 搜索结果显示歌名');

    // 点歌
    const songEl = Array.from(document.body.querySelectorAll('span'))
        .find(e => e.textContent.includes('0196.周杰伦-晴天'));

    assert.ok(songEl, '应找到歌曲元素');

    // play() 会走完整播放链路（通知/评论/lastfm/解析地址），
    // 这里只关心「点了之后播放列表被设好」，所以不等它跑完
    await act(async() => {
        songEl.parentElement.click();
    });

    // 应进播放器：controller.playlist 被设成那首歌
    assert.strictEqual(
        stores.controller.playlist.id,
        'FNOS_1c9a00ccce9749468dd12f5364954a9b',
        `应设成播放列表，实际 ${stores.controller.playlist.id}`
    );
    assert.strictEqual(stores.controller.playlist.songs.length, 1, '播放列表应有一首');
    assert.strictEqual(
        stores.controller.playlist.songs[0].name,
        '0196.周杰伦-晴天',
        '应是点的那首'
    );
    assert.strictEqual(
        stores.controller.playlist.songs[0].artists[0].name,
        '周杰伦',
        '艺人应带过来'
    );
    console.log('✓ 点歌后播放列表已设置:', stores.controller.playlist.id);

    unmount();
    axios.get = originalGet;

    console.log('\n全部通过');
    process.exit(0);
}

main().catch(ex => {
    console.error('\n✗ 失败:', ex.message);
    console.error(ex.stack && ex.stack.split('\n').slice(0, 12).join('\n'));
    process.exit(1);
});
