
/**
 * fnOS 曲库匹配：把网易云歌单的「歌名 + 艺人」映射到 NAS 曲库里的一条。
 *
 * 单独成文件是为了让 bin/fnos-match.js 能直接测生产代码，而不是复制一份。
 */

const PREFERRED = {
    flac: 100,
    'flac/hires': 90,
    m4a: 70,
    mp4: 70,
    aac: 60,
    mp3: 50,
    wav: 30,
    ogg: 20,
};

/**
 * 格式偏好分：越高越优先（flac 最优）。
 */
export function scoreOf(track) {
    var spec = track.audioSpec || {};
    var format = String(spec.format || spec.extension || '').toLowerCase();

    return PREFERRED[format] || 10;
}

/**
 * 归一化标题/艺人：去括号后缀、去标点、转小写。
 */
export function normalize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[（(【[][^）】\])]*[)）】\]]/g, '')
        .replace(/[\s\-_·、,，.。!！?？'"“”‘’~]/g, '');
}

/**
 * 从搜索结果里挑最匹配的一首。
 *
 * 标题与艺人必须同时命中 —— 只靠标题会把同名歌串台
 * （网易云《无所谓》杨坤 vs 库里《无所谓》信乐团）。
 */
export function pick(track, keyword, artists) {
    var wanted = normalize(keyword);
    var names = String(artists || '').split(',').map(normalize).filter(Boolean);
    var scored = [];

    track.forEach(item => {
        var title = normalize(item.title);
        var list = (item.artists || []).map(a => normalize(a.name || a));
        var artistHit = names.some(name => list.some(n => n === name || n.includes(name) || name.includes(n)));
        var titleHit = Boolean(wanted) && (title === wanted || title.includes(wanted) || wanted.includes(title));

        if (!artistHit || !titleHit) {
            return;
        }

        var score = 0;

        if (title === wanted) score += 10;
        score += scoreOf(item) / 100;

        scored.push({ item, score });
    });

    if (!scored.length) {
        return null;
    }

    scored.sort((a, b) => b.score - a.score);

    return scored[0].item;
}

export default { PREFERRED, scoreOf, normalize, pick };
