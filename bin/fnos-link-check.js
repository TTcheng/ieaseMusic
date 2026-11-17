
/**
 * 回归测试：fnOS 模式的歌曲数据必须带 link 字段。
 *
 * 背景：真 Windows 上选完「飞牛音乐」直接白屏。
 * Console 报 "You must specify the \"to\" property" —— react-router 的
 * <Link to={undefined}> 抛错，React 16 卸载整棵树，#root 变空。
 *
 * 根因：fnOS 的 toSong() 没有 album.link / artists[].link，
 * 而 Controller、Playing 组件直接拿它们做 <Link to={...}>。
 *
 * 这里断言：
 *   1. toSong() 产出的对象里所有会被当 <Link to> 用的字段都有值
 *   2. Controller / Playing 渲染 fnOS 歌曲时不抛错
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

const Controller = require('../src/js/components/Controller').default;
const Playing = require('../src/js/components/Playing').default;

async function main() {
    // fnOS 搜索要凭据，写进 storage（与登录页存的同一份）
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
    await stores.preferences.init();

    // ---- 1. toSong() 的字段完整性 ----
    console.log('=== fnOS 歌曲结构 ===');

    // 直接调 /api/fnos/search 的转换逻辑：起真服务器拿真实数据
    const fnosRouter = require('../server/router/fnos');

    assert.ok(fnosRouter, 'fnOS router 应可加载');

    // toSong 是 router 内部函数，通过 /api/fnos/search 验证更真实，
    // 这里直接验证最终数据结构 —— 起服务器查真实曲库
    const PORT = 10991;

    require('../config').default.api.port = PORT;

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

    const search = await get('/api/fnos/search?q=' + encodeURIComponent('晴天') + '&page=1&size=5');

    assert.ok(search && search.list && search.list.length, 'fnOS 搜索应返回结果');

    const song = search.list[0];

    console.log('  样本:', JSON.stringify({
        id: song.id,
        name: song.name,
        albumLink: song.album && song.album.link,
        artistLink: song.artists && song.artists[0] && song.artists[0].link,
    }));

    // 这些字段会被当 <Link to> 用，缺一个就白屏
    assert.ok(song.link !== undefined, '歌曲顶层必须有 link');
    assert.ok(song.album && song.album.link !== undefined, 'album 必须有 link');
    assert.ok(Array.isArray(song.artists), 'artists 必须是数组');

    for (const artist of song.artists) {
        assert.ok(artist.link !== undefined, '每个 artist 必须有 link');
    }

    console.log('✓ 所有会被当 <Link to> 用的字段都有值');

    // ---- 2. Controller 渲染 fnOS 歌曲 ----
    console.log('\n=== Controller 渲染 fnOS 歌曲 ===');

    stores.controller.song = song;
    stores.controller.playlist = {
        id: 'FNOS_HOME',
        name: '最近添加',
        link: '/',
        songs: [song],
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
                        React.createElement(Controller)
                    )
                )
            ),
            container
        );
    });

    assert.ok(container.innerHTML.length > 0, 'Controller 应渲染出内容');
    assert.ok(
        container.querySelectorAll('a[href]').length > 0,
        '应渲染出带 href 的链接'
    );
    console.log(`✓ Controller 渲染成功，${container.querySelectorAll('a[href]').length} 个链接`);

    // 检查所有 a[href] 都不是 "#"（undefined 的 to 会产生这种）
    const badLinks = Array.from(container.querySelectorAll('a'))
        .filter(a => !a.getAttribute('href') || a.getAttribute('href') === '#');

    assert.strictEqual(badLinks.length, 0, `不应有 to=undefined 产生的空链接，实际 ${badLinks.length} 个`);
    console.log('✓ 没有 to=undefined 造成的空链接');

    // ---- 3. Playing 渲染 fnOS 歌曲 ----
    console.log('\n=== Playing 渲染 fnOS 歌曲 ===');

    // Playing 默认不显示（stores.playing.show），要打开才渲染
    stores.playing.show = true;
    stores.playing.filtered = [song];

    ReactDOM.unmountComponentAtNode(container);

    try {
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
                            React.createElement(Playing)
                        )
                    )
                ),
                container
            );
        });
    } catch (ex) {
        console.error('\n=== Playing 渲染抛错 ===');
        console.error(ex.stack ? ex.stack.split('\n').slice(0, 14).join('\n') : String(ex));
        throw ex;
    }

    assert.ok(container.innerHTML.length > 0, 'Playing 应渲染出内容');

    const badLinks2 = Array.from(container.querySelectorAll('a'))
        .filter(a => !a.getAttribute('href') || a.getAttribute('href') === '#');

    assert.strictEqual(badLinks2.length, 0, `不应有空链接，实际 ${badLinks2.length} 个`);
    console.log('✓ Playing 渲染成功，没有空链接');

    console.log('\n全部通过');
    process.exit(0);
}

main().catch(ex => {
    console.error('\n✗ 失败:', ex.message);
    console.error(ex.stack && ex.stack.split('\n').slice(0, 12).join('\n'));
    process.exit(1);
});
