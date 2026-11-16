
/**
 * fnOS 曲库匹配：把网易云歌单的「歌名 + 艺人」映射到 NAS 曲库里的一条。
 *
 * 单独成文件是为了让 bin/fnos-match.js 能直接测生产代码，而不是复制一份。
 *
 * 现实情况：fnOS 曲库里相当一部分条目没有解析出艺人，track.title 直接就是
 * 文件名（例如 "0196.周杰伦-晴天"，artists 为空数组）。这类条目的歌名/艺人
 * 只能从 audioSpec.path 的文件名反解，所以这里做了兜底。
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
 * 从路径末段的文件名反解歌名与艺人。
 *
 * 覆盖 NAS 上常见的几种命名：
 *   "0196.周杰伦-晴天.mp3"   -> { title: '晴天', artists: ['周杰伦'] }
 *   "周杰伦 - 晴天.mp3"      -> { title: '晴天', artists: ['周杰伦'] }
 *   "晴天.mp3"              -> { title: '晴天', artists: [] }
 *   "0196.周杰伦-晴天"      -> 同上（无扩展名）
 */
export function parseFilename(path) {
    var name = String(path || '').split('/').pop() || '';
    var ext = name.indexOf('.') > -1 ? name.slice(name.lastIndexOf('.') + 1) : '';

    if (ext && /^[a-z0-9]{2,5}$/i.test(ext)) {
        name = name.slice(0, name.lastIndexOf('.'));
    }

    // 前导序号：0196. / 01 - / 12、
    name = name.replace(/^\d+\s*[.、,，\-_]\s*/, '');

    var artists = [];
    var title = name;

    // "歌手 - 歌名"
    var dash = name.match(/^(.+?)\s*[-–—]\s*(.+)$/);

    if (dash) {
        artists = dash[1].split(/\s*[&/、,，]\s*|\s+feat\.?\s+/i).filter(Boolean);
        title = dash[2];
    }

    return { title: title.trim(), artists };
}

/**
 * 取一条 track 的标题与艺人候选。
 *
 * 优先用 fnOS 解析出的元数据；缺失时从文件名兜底。
 */
export function describe(track) {
    var titles = [track.title];
    var artists = (track.artists || []).map(a => a.name || a).filter(Boolean);

    var parsed = parseFilename((track.audioSpec || {}).path);

    if (parsed.title) {
        titles.push(parsed.title);
    }

    if (!artists.length && parsed.artists.length) {
        artists = parsed.artists;
    }

    return { titles, artists };
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
        var info = describe(item);
        var list = info.artists.map(normalize).filter(Boolean);
        var artistHit = names.some(name => list.some(n => n === name || n.includes(name) || name.includes(n)));
        var titleHit = false;
        var exact = false;

        info.titles.forEach(title => {
            var normalized = normalize(title);

            if (!normalized) {
                return;
            }

            if (normalized === wanted) {
                exact = true;
            }

            if (!titleHit && (normalized === wanted || normalized.includes(wanted) || wanted.includes(normalized))) {
                titleHit = true;
            }
        });

        if (!artistHit || !titleHit) {
            return;
        }

        var score = 0;

        if (exact) score += 10;
        score += scoreOf(item) / 100;

        scored.push({ item, score });
    });

    if (!scored.length) {
        return null;
    }

    scored.sort((a, b) => b.score - a.score);

    return scored[0].item;
}

export default { PREFERRED, scoreOf, normalize, parseFilename, describe, pick };
