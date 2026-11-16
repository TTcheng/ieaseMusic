
/**
 * fnOS provider 的曲库匹配逻辑自检（纯离线）。
 *
 * 直接测生产代码 server/provider/fnos-match.js，不是复制一份。
 *
 * pick() 是这个 provider 最容易出错的地方：
 *   1. NAS 曲库里的歌名/艺人写法与网易云歌单未必一致
 *   2. 有 16% 的条目 fnOS 没解析出艺人，title 就是整个文件名
 *      （例如 "0196.周杰伦-晴天"），只能从 audioSpec.path 反解
 *
 * 下面的样本全部取自真实 fnOS 曲库。
 */

import assert from 'assert';

import { pick, normalize, scoreOf, parseFilename, describe } from '../server/provider/fnos-match';

const track = (title, artists, format, path) => ({
    guid: `guid-${title}-${format}`,
    title,
    artists: artists.map(name => ({ name })),
    audioSpec: Object.assign({ format, bitrate: 320000 }, path ? { path } : {}),
});

// ---- 真实曲库样本 ----

// 有完整元数据（fnOS 解析成功）
const META = track('美丽世界的孤儿', ['汪峰'], 'flac',
    '/vol2/1000/raid/media/music/车载音乐/1抖音中文歌曲400首/美丽世界的孤儿.flac');

// 无艺人元数据：title 就是文件名，艺人要靠 path 反解
const NO_ARTIST = track('0196.周杰伦-晴天', [], 'mp3',
    '/vol2/1000/raid/media/music/车载音乐/1抖音中文歌曲400首/0196.周杰伦-晴天.mp3');

// 文件名用 "歌手 - 歌名"
const DASH = track('谢谢', ['汪峰'], 'mp3',
    '/vol2/1000/raid/media/music/车载音乐/热门华语254/汪峰 - 谢谢.mp3');

// ---- parseFilename ----

assert.deepStrictEqual(parseFilename('/x/0196.周杰伦-晴天.mp3'), { title: '晴天', artists: ['周杰伦'] });
assert.deepStrictEqual(parseFilename('/x/周杰伦 - 晴天.mp3'), { title: '晴天', artists: ['周杰伦'] });
assert.deepStrictEqual(parseFilename('/x/晴天.mp3'), { title: '晴天', artists: [] });
assert.deepStrictEqual(parseFilename('/x/0196.周杰伦-晴天'), { title: '晴天', artists: ['周杰伦'] });
assert.deepStrictEqual(parseFilename('/x/A & B - Song.mp3'), { title: 'Song', artists: ['A', 'B'] });
console.log('✓ parseFilename 正确');

assert.deepStrictEqual(describe(NO_ARTIST).artists, ['周杰伦'], '无艺人时应从 path 反解');
assert.deepStrictEqual(describe(META).artists, ['汪峰'], '有元数据时优先用元数据');
console.log('✓ describe 兜底正确');

// ---- pick ----

// 1. 完全匹配
assert.strictEqual(
    pick([track('晴天', ['周杰伦'], 'mp3')], '晴天', '周杰伦').title,
    '晴天'
);
console.log('✓ 完全匹配');

// 2. 歌名带后缀
assert.strictEqual(
    pick([track('晴天 (Live)', ['周杰伦'], 'mp3')], '晴天', '周杰伦').title,
    '晴天 (Live)'
);
console.log('✓ 歌名后缀（Live/remix）能匹配');

// 3. 多艺人
assert.strictEqual(
    pick([track('千里之外', ['周杰伦', '费玉清'], 'flac')], '千里之外', '周杰伦').title,
    '千里之外'
);
console.log('✓ 多艺人匹配');

// 4. 同名不同艺人
var picked = pick([
    track('无所谓', ['杨坤'], 'mp3'),
    track('无所谓', ['信乐团'], 'flac'),
], '无所谓', '信乐团');

assert.strictEqual(picked.artists[0].name, '信乐团', '同歌名时应按艺人区分');
console.log('✓ 同名歌曲按艺人区分');

// 5. 格式优先级
picked = pick([
    track('青花瓷', ['周杰伦'], 'mp3'),
    track('青花瓷', ['周杰伦'], 'flac'),
], '青花瓷', '周杰伦');

assert.strictEqual(picked.audioSpec.format, 'flac', '应优先选 flac');
console.log('✓ 格式优先级（flac > mp3）');

// 6. 完全不匹配
assert.strictEqual(pick([track('晴天', ['周杰伦'], 'mp3')], '稻香', '林俊杰'), null);
console.log('✓ 不匹配返回 null');

// 7. 同歌名不同艺人 → 不误命中
assert.strictEqual(pick([track('晴天', ['周杰伦'], 'mp3')], '晴天', '林俊杰'), null);
console.log('✓ 艺人不同不误命中');

// 8. 中文括号后缀
assert.strictEqual(
    pick([track('告白气球【官方完整版】', ['周杰伦'], 'mp3')], '告白气球', '周杰伦').title,
    '告白气球【官方完整版】'
);
console.log('✓ 中文括号后缀能匹配');

// 9. 真实样本：无艺人元数据，靠 path 反解命中
picked = pick([NO_ARTIST], '晴天', '周杰伦');
assert.ok(picked, '无艺人元数据时应靠文件名反解命中');
assert.strictEqual(picked.guid, NO_ARTIST.guid);
console.log('✓ 真实样本：无艺人元数据靠文件名反解命中');

// 10. 真实样本：有元数据
picked = pick([META], '美丽世界的孤儿', '汪峰');
assert.ok(picked && picked.guid === META.guid);
console.log('✓ 真实样本：有元数据直接命中');

// 10b. 真实样本：文件名用 "歌手 - 歌名"，且元数据无艺人
picked = pick([DASH], '谢谢', '汪峰');
assert.ok(picked && picked.guid === DASH.guid, '应从 path 反解出歌手');
console.log('✓ 真实样本：path 用「歌手 - 歌名」格式也能命中');

// 11. 真实样本：文件名反解出来的艺人要与请求艺人一致才命中
assert.strictEqual(pick([NO_ARTIST], '晴天', '林俊杰'), null, '艺人不同仍不误命中');
console.log('✓ 文件名兜底后仍按艺人校验');

// 12. normalize
assert.strictEqual(normalize('晴天（Live版）[HQ]'), '晴天');
assert.strictEqual(normalize('A-B_C'), 'abc');
assert.strictEqual(normalize(''), '');
console.log('✓ normalize 行为正确');

// 13. scoreOf
assert.ok(scoreOf(track('x', ['y'], 'flac')) > scoreOf(track('x', ['y'], 'mp3')));
assert.strictEqual(scoreOf(track('x', ['y'], 'ncm')), 10, '未知格式应得基础分');
console.log('✓ scoreOf 行为正确');

console.log('\n全部通过');
