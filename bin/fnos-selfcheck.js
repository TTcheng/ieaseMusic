
/**
 * 用 fnOS 曲库自己的条目反查，验证 provider 的端到端匹配能力。
 *
 * 上一个脚本拿网易云榜单去查，覆盖率受曲库重合度限制；
 * 这个脚本反过来：从曲库里取条目，用它自己的歌名/艺人去搜自己，
 * 验证 provider 的搜索+匹配链路是否正确。
 */

import assert from 'assert';

import fnos from '../server/fnos';
import { pick, describe } from '../server/provider/fnos-match';

const BASE = 'https://nas:5667';
const USER = process.env.FNOS_USER || "";
const PASS = process.env.FNOS_PASS || "";

async function main() {
    const token = await fnos.login(BASE, USER, PASS, {
        insecure: true,
        deviceId: '0123456789abcdef0123456789abcdef',
    });

    console.log('✓ 登录成功');

    // 拉全量曲库
    const all = [];
    let page = 1;

    while (true) {
        const res = await fnos.request(BASE, '/music/api/v1/track/list', {
            params: { page, size: 200, sort: 'createdAt,desc' },
            token,
            insecure: true,
        });

        const list = (res.data && res.data.list) || [];

        if (!list.length) break;

        all.push(...list);

        if (all.length >= (res.data.total || 0)) break;

        page++;
    }

    console.log(`✓ 拉取曲库 ${all.length} 首`);

    const noArtist = all.filter(t => !(t.artists || []).length);

    console.log(`  其中无艺人元数据: ${noArtist.length} 首 (${(100 * noArtist.length / all.length).toFixed(0)}%)`);

    // 随机抽 25 条，用它自己的歌名+艺人去搜索
    const sample = [];
    const step = Math.floor(all.length / 25);

    for (let i = 0; i < 25; i++) {
        sample.push(all[i * step]);
    }

    let ok = 0;
    let okByFilename = 0;
    const fails = [];

    for (const t of sample) {
        const info = describe(t);
        const title = info.titles[0];
        const artists = info.artists.join(',');

        let results;

        try {
            results = await fnos.searchTracks(BASE, token, title, { insecure: true, size: 10 });
        } catch (ex) {
            fails.push(`${title} —— 搜索异常 ${ex.message}`);
            continue;
        }

        if (!results.length) {
            fails.push(`${title} —— 搜索无结果`);
            continue;
        }

        const matched = pick(results, title, artists);

        if (matched) {
            if (matched.guid === t.guid) {
                ok++;
            } else {
                okByFilename++;
            }
            continue;
        }

        fails.push(`${title} / ${artists} —— ${results.length} 条结果匹配不上: ${JSON.stringify(results.slice(0, 2).map(r => ({ title: r.title, artists: (r.artists || []).map(a => a.name) })))}`);
    }

    console.log(`\n  精确命中(同一 guid): ${ok}/${sample.length}`);
    console.log(`  命中但 guid 不同: ${okByFilename}/${sample.length}`);
    console.log(`  合计命中率: ${(100 * (ok + okByFilename) / sample.length).toFixed(0)}%`);

    if (fails.length) {
        console.log('\n失败明细:');
        fails.slice(0, 8).forEach(f => console.log('  -', f));
    }

    assert.ok(ok + okByFilename >= sample.length * 0.8, '命中率应 ≥80%');
    console.log('\n✓ provider 匹配链路正常');
}

main().catch(ex => {
    console.error('✗ 失败:', ex.message);
    process.exit(1);
});
