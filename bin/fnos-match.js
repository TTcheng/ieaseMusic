
/**
 * fnOS provider 的曲库匹配逻辑自检（纯离线）。
 *
 * 直接测生产代码 server/provider/fnos-match.js，不是复制一份。
 *
 * pick() 是这个 provider 最容易出错的地方：NAS 曲库里的歌名/艺人写法
 * 与网易云歌单里的未必一致。这里用真实曲库里出现过的样本做断言。
 */

import assert from 'assert';

import { pick, normalize, scoreOf } from '../server/provider/fnos-match';

const track = (title, artists, format) => ({
    guid: `guid-${title}-${format}`,
    title,
    artists: artists.map(name => ({ name })),
    audioSpec: { format, bitrate: 320000 },
});

// 1. 完全匹配
assert.strictEqual(
    pick([track('晴天', ['周杰伦'], 'mp3')], '晴天', '周杰伦').title,
    '晴天'
);
console.log('✓ 完全匹配');

// 2. 歌名带后缀，网易云叫「晴天」，库里叫「晴天 (Live)」
assert.strictEqual(
    pick([track('晴天 (Live)', ['周杰伦'], 'mp3')], '晴天', '周杰伦').title,
    '晴天 (Live)'
);
console.log('✓ 歌名后缀（Live/remix）能匹配');

// 3. 多艺人：网易云给「周杰伦」，库里给「周杰伦 / 费玉清」
assert.strictEqual(
    pick([track('千里之外', ['周杰伦', '费玉清'], 'flac')], '千里之外', '周杰伦').title,
    '千里之外'
);
console.log('✓ 多艺人匹配');

// 4. 同名不同艺人 —— 艺人必须参与判定
var picked = pick([
    track('无所谓', ['杨坤'], 'mp3'),
    track('无所谓', ['信乐团'], 'flac'),
], '无所谓', '信乐团');

assert.strictEqual(picked.artists[0].name, '信乐团', '同歌名时应按艺人区分');
console.log('✓ 同名歌曲按艺人区分');

// 5. 格式优先级：同条件下优先 FLAC
picked = pick([
    track('青花瓷', ['周杰伦'], 'mp3'),
    track('青花瓷', ['周杰伦'], 'flac'),
], '青花瓷', '周杰伦');

assert.strictEqual(picked.audioSpec.format, 'flac', '应优先选 flac');
console.log('✓ 格式优先级（flac > mp3）');

// 6. 完全不匹配 → null
assert.strictEqual(pick([track('晴天', ['周杰伦'], 'mp3')], '稻香', '林俊杰'), null);
console.log('✓ 不匹配返回 null');

// 7. 库里有同名但艺人不同 → 不应误命中
assert.strictEqual(pick([track('晴天', ['周杰伦'], 'mp3')], '晴天', '林俊杰'), null);
console.log('✓ 艺人不同不误命中');

// 8. 中文括号后缀
assert.strictEqual(
    pick([track('告白气球【官方完整版】', ['周杰伦'], 'mp3')], '告白气球', '周杰伦').title,
    '告白气球【官方完整版】'
);
console.log('✓ 中文括号后缀能匹配');

// 9. 归一化本身
assert.strictEqual(normalize('晴天（Live版）[HQ]'), '晴天');
assert.strictEqual(normalize('A-B_C'), 'abc');
assert.strictEqual(normalize(''), '');
console.log('✓ normalize 行为正确');

// 10. 格式打分
assert.ok(scoreOf(track('x', ['y'], 'flac')) > scoreOf(track('x', ['y'], 'mp3')));
assert.strictEqual(scoreOf(track('x', ['y'], 'ncm')), 10, '未知格式应得基础分');
console.log('✓ scoreOf 行为正确');

console.log('\n全部通过');
