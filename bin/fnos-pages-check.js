
/**
 * fnOS 专辑页 / 艺术家页的集成测试。
 *
 * 覆盖：
 *   1. /api/fnos/album/:guid 返回专辑详情 + 曲目
 *   2. /api/fnos/artist/:guid 返回艺术家详情 + 专辑 + 曲目
 *   3. 首页卡片的 link 指向真实页面（不再是 '/'）
 *   4. 用真实数据渲染专辑页 / 艺术家页不抛错
 *   5. 非 fnOS 音源访问这些页面会重定向回首页
 */

import assert from 'assert';
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { Provider } from 'mobx-react';
import { ThemeProvider } from 'react-jss';
import { MemoryRouter, Route } from 'react-router-dom';

import stores from '../src/js/stores';
import theme from '../config/theme';

const AlbumPage = require('../src/js/pages/Fnos/Album').default;
const ArtistPage = require('../src/js/pages/Fnos/Artist').default;

async function main() {
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
    stores.source.source = 'fnos';
    stores.source.fnosProfile = {
        base: 'https://nas:5667',
        username: 'iease',
        password: 'x',
        user: { name: 'IEase' },
    };

    // ---- 起服务器 ----
    const PORT = 10988;

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

    // ---- 1. 首页卡片 link ----
    console.log('=== 首页卡片链接 ===');
    const home = await get('/api/fnos/home');

    const albumCard = home.list[1][0];
    const artistCard = home.list[2][0];

    assert.ok(
        albumCard.link.startsWith('/fnos/album/'),
        `专辑卡片 link 应指向专辑页，实际 ${albumCard.link}`
    );
    assert.ok(
        artistCard.link.startsWith('/fnos/artist/'),
        `艺术家卡片 link 应指向艺术家页，实际 ${artistCard.link}`
    );
    console.log('✓ 专辑:', albumCard.link);
    console.log('✓ 艺术家:', artistCard.link);

    // ---- 2. 专辑接口 ----
    console.log('\n=== /api/fnos/album/:guid ===');
    const album = await get('/api/fnos/album/' + albumCard.guid);

    assert.ok(album.name, '应有专辑名');
    assert.ok(album.songs && album.songs.length, '应有曲目');
    assert.ok(Array.isArray(album.artists), '应有 artists');

    console.log(`✓ 「${album.name}」${album.songs.length} 首，封面 ${album.cover ? '有' : '无'}`);

    // 曲目里的链接要指向真实页面
    const firstSong = album.songs[0];

    assert.ok(
        firstSong.album.link.startsWith('/fnos/album/'),
        `曲目 album.link 应指向专辑页，实际 ${firstSong.album.link}`
    );

    for (const artist of firstSong.artists) {
        assert.ok(
            artist.link.startsWith('/fnos/artist/'),
            `曲目 artist.link 应指向艺术家页，实际 ${artist.link}`
        );
    }

    console.log('✓ 曲目内的链接指向真实页面');

    // ---- 3. 艺术家接口 ----
    console.log('\n=== /api/fnos/artist/:guid ===');
    const artist = await get('/api/fnos/artist/' + artistCard.guid);

    assert.ok(artist.name, '应有艺术家名');
    assert.ok(artist.albums && artist.albums.length, '应有专辑列表');
    assert.ok(artist.songs && artist.songs.length, '应有曲目列表');

    console.log(`✓ 「${artist.name}」${artist.albums.length} 专辑 / ${artist.songs.length} 首`);

    assert.ok(
        artist.albums[0].link.startsWith('/fnos/album/'),
        '艺术家页的专辑应指向专辑页'
    );
    console.log('✓ 专辑指向专辑页');

    // ---- 4. 渲染专辑页 ----
    console.log('\n=== 渲染专辑页 ===');
    await renderPage(AlbumPage, '/fnos/album/' + albumCard.guid, albumCard.guid);

    let container = document.querySelector('.fnos-test-container');

    assert.ok(container.innerHTML.length > 0, '专辑页应渲染出内容');
    assert.ok(
        container.textContent.includes(album.name),
        '应显示专辑名'
    );
    assert.ok(
        container.textContent.includes(firstSong.name),
        '应显示曲目名'
    );
    console.log(`✓ 专辑页渲染成功，${container.innerHTML.length} 字节`);

    const badLinks = Array.from(container.querySelectorAll('a'))
        .filter(a => !a.getAttribute('href') && a.textContent !== 'Preferences');

    assert.strictEqual(badLinks.length, 0, `不应有空链接，实际 ${badLinks.length}`);
    console.log('✓ 无空链接');

    // ---- 5. 渲染艺术家页 ----
    console.log('\n=== 渲染艺术家页 ===');
    await renderPage(ArtistPage, '/fnos/artist/' + artistCard.guid, artistCard.guid);

    container = document.querySelector('.fnos-test-container');

    assert.ok(container.innerHTML.length > 0, '艺术家页应渲染出内容');
    assert.ok(
        container.textContent.includes(artist.name),
        '应显示艺术家名'
    );
    console.log(`✓ 艺术家页渲染成功，${container.innerHTML.length} 字节`);

    const badLinks2 = Array.from(container.querySelectorAll('a'))
        .filter(a => !a.getAttribute('href') && a.textContent !== 'Preferences');

    assert.strictEqual(badLinks2.length, 0, `不应有空链接，实际 ${badLinks2.length}`);
    console.log('✓ 无空链接');

    // ---- 6. 搜索专辑 / 歌手 ----
    console.log('\n=== 搜索专辑与歌手 ===');
    const albumSearch = await get('/api/fnos/search?q=' + encodeURIComponent('汪峰') + '&type=album&page=1&size=10');

    assert.ok(albumSearch.list && albumSearch.list.length, '应搜到专辑');
    assert.ok(
        albumSearch.list[0].link.startsWith('/fnos/album/'),
        `专辑搜索结果应指向专辑页，实际 ${albumSearch.list[0].link}`
    );
    console.log(`✓ 专辑搜索 ${albumSearch.total} 个，首个「${albumSearch.list[0].name}」`);

    const artistSearch = await get('/api/fnos/search?q=' + encodeURIComponent('汪峰') + '&type=artist&page=1&size=10');

    assert.ok(artistSearch.list && artistSearch.list.length, '应搜到歌手');
    assert.ok(
        artistSearch.list[0].link.startsWith('/fnos/artist/'),
        `歌手搜索结果应指向歌手页，实际 ${artistSearch.list[0].link}`
    );
    console.log(`✓ 歌手搜索 ${artistSearch.total} 个，首个「${artistSearch.list[0].name}」`);

    // ---- 7. 非 fnOS 音源应重定向 ----
    console.log('\n=== 非 fnOS 音源访问 ===');
    stores.source.source = 'netease';

    const out = await renderRoutes('/fnos/album/' + albumCard.guid);

    assert.strictEqual(out.context.url, '/', `非 fnOS 音源应重定向到 /，实际 ${out.context.url}`);
    console.log('✓ 非 fnOS 音源重定向回首页');

    console.log('\n全部通过');
    process.exit(0);
}

let container;

async function renderPage(Component, pathname, guid) {
    // 清掉上一个页面留下的容器
    Array.from(document.querySelectorAll('.fnos-test-container'))
        .forEach(e => {
            ReactDOM.unmountComponentAtNode(e);
            e.remove();
        });

    container = document.createElement('div');
    container.className = 'fnos-test-container';
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
                        { initialEntries: [pathname] },
                        React.createElement(
                            Route,
                            {
                                path: '/fnos/:type/:guid',
                                render: routeProps => React.createElement(
                                    Component,
                                    Object.assign({}, routeProps, { match: { params: { guid } } })
                                ),
                            }
                        )
                    )
                )
            ),
            container
        );
    });

    // componentDidMount 里是异步加载，要等它完成并触发重渲染
    await act(async() => {
        await new Promise(resolve => setTimeout(resolve, 300));
    });
}

/**
 * 用完整 routes 渲染，检查重定向。
 */
async function renderRoutes(pathname) {
    const { StaticRouter } = require('react-router');
    const ReactDOMServer = require('react-dom/server');
    const context = {};

    ReactDOMServer.renderToStaticMarkup(
        React.createElement(
            ThemeProvider,
            { theme },
            React.createElement(
                Provider,
                stores,
                React.createElement(
                    StaticRouter,
                    { location: pathname, context },
                    require('../src/js/routes').default()
                )
            )
        )
    );

    return { context };
}

main().catch(ex => {
    console.error('\n✗ 失败:', ex.message);
    console.error(ex.stack && ex.stack.split('\n').slice(0, 12).join('\n'));
    process.exit(1);
});
