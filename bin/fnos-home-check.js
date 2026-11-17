
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
 *   1. /api/fnos/home 的结构与网易云 /api/home 对齐（list[0..2] 都在）
 *   2. 用真实 fnOS 首页数据渲染 Welcome 页不抛错
 *   3. 渲染出的所有链接都有合法 to（不为 undefined）
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
    await stores.preferences.init();
    stores.me.initialized = true;

    // ---- 1. 起服务器拿真实首页数据 ----
    console.log('=== 取 fnOS 首页数据 ===');

    const PORT = 10989;

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

    const home = await get('/api/fnos/home');

    assert.ok(home && home.list, 'fnOS 首页应有 list');

    // 结构必须与网易云对齐：list[0] / list[1] / list[2] 都存在
    assert.strictEqual(home.list.length, 3, `首页应有 3 段，实际 ${home.list.length}`);
    assert.ok(home.list[0].songs && home.list[0].songs.length, 'list[0] 应有 songs');
    assert.ok(Array.isArray(home.list[1]), 'list[1] 应是数组（专辑）');
    assert.ok(Array.isArray(home.list[2]), 'list[2] 应是数组（艺术家）');
    assert.ok(home.list[1].length > 0, 'list[1] 不应为空');
    assert.ok(home.list[2].length > 0, 'list[2] 不应为空');

    console.log(`✓ 结构对齐: list[0]=${home.list[0].songs.length} 首, list[1]=${home.list[1].length} 专辑, list[2]=${home.list[2].length} 艺术家`);

    // 每张卡片都要有 renderPlaylist 需要的字段
    for (const item of home.list[1].concat(home.list[2])) {
        assert.ok(item.link !== undefined, `卡片 ${item.name} 缺 link`);
        assert.ok(item.size !== undefined, `卡片 ${item.name} 缺 size`);
        assert.ok(item.type !== undefined, `卡片 ${item.name} 缺 type`);
    }

    console.log('✓ 卡片字段完整');

    // ---- 2. 用真实数据渲染 Welcome ----
    console.log('\n=== 渲染 Welcome（fnOS 模式）===');

    stores.home.list = home.list;
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
        container.textContent.includes(home.list[0].songs[0].name),
        '应显示最近添加的曲目'
    );
    assert.ok(
        container.textContent.includes(home.list[1][0].name),
        '应显示专辑名'
    );
    console.log('✓ 曲目与专辑都渲染出来了');

    console.log('\n全部通过');
    process.exit(0);
}

main().catch(ex => {
    console.error('\n✗ 失败:', ex.message);
    console.error(ex.stack && ex.stack.split('\n').slice(0, 12).join('\n'));
    process.exit(1);
});
