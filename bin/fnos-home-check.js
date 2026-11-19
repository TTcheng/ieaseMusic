
/**
 * fnOS 模式首页的渲染回归测试。
 *
 * 背景：真 Windows 上选完「飞牛音乐」白屏，第二次报
 * "Cannot read property 'size' of undefined"。
 *
 * 根因：fnOS 的 /api/fnos/home 只返回 list[0] 一项，
 * 而 Welcome 页读 list[1].size（推荐位）—— list[1] 是 undefined。
 *
 * 这里断言：
 *   1. /api/fnos/home 的具名结构（recent / albums / artists）
 *   2. 用真实 fnOS 首页数据渲染 Welcome 页不抛错
 *   3. 渲染出的所有链接都有合法 to（不为 undefined）
 *   4. fnOS 分支会设置播放列表并触发自动播放
 *      （曾因提前 return 跳过这一步：页面正常但放不出声音）
 */

import assert from 'assert';
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { Provider } from 'mobx-react';
import { ThemeProvider } from 'react-jss';
import { MemoryRouter } from 'react-router-dom';

import stores from '../src/js/stores';
import theme from '../config/theme';

const Welcome = require('../src/js/pages/Welcome').default;

async function main() {
    // fnOS 首页要凭据
    if (process.env.FNOS_USER && process.env.FNOS_PASS) {
        const fs = require('fs');
        const STORAGE = require('./_jsdom-env.js').STORAGE;

        fs.writeFileSync(STORAGE, JSON.stringify({
            source: 'fnos',
            'fnos-profile': {
                base: process.env.FNOS_BASE || 'https://nas:5667',
                username: process.env.FNOS_USER,
                password: process.env.FNOS_PASS,
            },
        }));
    }

    await stores.source.init();
    stores.me.initialized = true;

    // ---- 1. 起服务器拿真实首页数据 ----
    console.log('=== 取 fnOS 首页数据 ===');

    const PORT = 10989;

    require('../config').default.api.port = PORT;

    // preferences.init() 会把 axios 的 baseURL 设成 preferences.port，
    // 必须在定好端口之后调，否则 store 打不到这个测试服务器。
    await stores.preferences.init();

    const api = require('../server/api').default;

    await new Promise(resolve => api(PORT, '', resolve));

    const http = require('http');
    const get = p => new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${PORT}${p}`, res => {
            const c = [];
            res.on('data', d => c.push(d));
            res.on('end', () => {
                const raw = Buffer.concat(c).toString('utf8');
                let j = null;

                try {
                    j = JSON.parse(raw);
                } catch (e) { /* ignore */ }

                resolve(j);
            });
        }).on('error', reject);
    });

    const home = await get('/api/fnos/home');

    assert.ok(home, 'fnOS 首页应有响应体');
    assert.ok(home.recent, '应有 recent（最近添加的播放列表）');
    assert.ok(Array.isArray(home.albums), 'albums 应是数组');
    assert.ok(Array.isArray(home.artists), 'artists 应是数组');

    // 具名结构：三段语义不同，用字段名说清楚，不再用 list[0]/list[1]/list[2]
    assert.ok(home.recent.songs && home.recent.songs.length, 'recent 应有 songs');
    assert.ok(home.albums.length > 0, 'albums 不应为空');
    assert.ok(home.artists.length > 0, 'artists 不应为空');

    console.log(`✓ 结构对齐: recent=${home.recent.songs.length} 首, albums=${home.albums.length} 专辑, artists=${home.artists.length} 艺术家`);

    // 每张卡片都要有 renderPlaylist 需要的字段
    for (const item of home.albums.concat(home.artists)) {
        assert.ok(item.link !== undefined, `卡片 ${item.name} 缺 link`);
        assert.ok(item.size !== undefined, `卡片 ${item.name} 缺 size`);
        assert.ok(item.type !== undefined, `卡片 ${item.name} 缺 type`);
    }

    console.log('✓ 卡片字段完整');

    // ---- 2. 用真实数据渲染 Welcome ----
    console.log('\n=== 渲染 Welcome（fnOS 模式）===');

    stores.home.list = home.albums.concat(home.artists);
    stores.home.recent = home.recent;
    stores.source.source = 'fnos';
    stores.source.fnosProfile = {
        base: 'https://nas:5667',
        username: 'iease',
        password: 'x',
        user: { name: 'IEase' },
    };

    const container = document.createElement('div');

    document.body.appendChild(container);

    await act(async() => {
        ReactDOM.render(
            React.createElement(
                ThemeProvider,
                { theme },
                React.createElement(
                    Provider,
                    stores,
                    React.createElement(
                        MemoryRouter,
                        { initialEntries: ['/'] },
                        React.createElement(Welcome)
                    )
                )
            ),
            container
        );
    });

    assert.ok(container.innerHTML.length > 0, 'Welcome 应渲染出内容');
    console.log(`✓ 渲染成功，${container.innerHTML.length} 字节`);

    // 不应有 to=undefined 造成的空链接。
    // 注意：侧栏的 Preferences 是 <a href="#"> + onClick，是刻意这么写的，
    // 要排除掉 —— 它的 href 本来就是 '#'。
    const badLinks = Array.from(container.querySelectorAll('a'))
        .filter(a => !a.getAttribute('href'))
        .filter(a => a.textContent !== 'Preferences');

    assert.strictEqual(badLinks.length, 0, `不应有空链接，实际 ${badLinks.length} 个: ${badLinks.map(a => a.outerHTML.slice(0, 120)).join(' | ')}`);
    console.log(`✓ ${container.querySelectorAll('a[href]').length} 个链接，无空链接`);

    // 曲目与专辑都应出现
    assert.ok(
        container.textContent.includes(home.recent.songs[0].name),
        '应显示最近添加的曲目'
    );
    assert.ok(
        container.textContent.includes(home.albums[0].name),
        '应显示专辑名'
    );
    console.log('✓ 曲目与专辑都渲染出来了');

    // ---- 3. 自动播放 ----
    // fnOS 分支曾因为提前 return 而跳过「自动播放」这一步：
    // 页面渲染正常、封面正常，但 <audio> 没有 src，什么都放不出来。
    // 这里断言播放列表与播放状态确实被设置了。
    console.log('\n=== 自动播放 ===');

    // 验证 home.load() 的 fnOS 分支会设置播放列表。
    // 直接调 store，不依赖渲染时序。
    //
    // autoPlay 关掉：打开它会真的去 /api/player/song 取流，
    // 那个请求在 jsdom 里会挂住（axios 的 CancelToken 取消上一次请求，
    // 表现为测试不结束）。播放链路由 bin/fnos-mode-check.js 覆盖。
    stores.preferences.autoPlay = false;
    stores.controller.playlist = {};

    await stores.home.load();

    assert.ok(
        stores.controller.playlist && stores.controller.playlist.id,
        'fnOS 分支应设置播放列表'
    );
    assert.strictEqual(
        stores.controller.playlist.id,
        'FNOS_RECENT',
        `播放列表应是 FNOS_RECENT，实际 ${stores.controller.playlist.id}`
    );
    assert.ok(
        stores.controller.playlist.songs && stores.controller.playlist.songs.length,
        '播放列表应有曲目'
    );
    console.log(`✓ 播放列表已设置：${stores.controller.playlist.songs.length} 首`);

    // autoPlay 关闭时走 else 分支：应把当前歌曲设成第一首
    assert.ok(stores.controller.song && stores.controller.song.id, '应设置当前歌曲');
    assert.strictEqual(
        stores.controller.song.id,
        stores.controller.playlist.songs[0].id,
        '当前歌曲应是第一首'
    );
    console.log('✓ 当前歌曲已设置');

    assert.ok(stores.home.recent, 'home.recent 应被设置');
    assert.strictEqual(
        stores.home.list.length,
        home.albums.length + home.artists.length,
        'home.list 应是专辑与艺术家的拼接'
    );
    console.log(`✓ home.list = ${stores.home.list.length} 张卡片`);

    console.log('\n全部通过');
    process.exit(0);
}

main().catch(ex => {
    console.error('\n✗ 失败:', ex.message);
    console.error(ex.stack && ex.stack.split('\n').slice(0, 12).join('\n'));
    process.exit(1);
});
