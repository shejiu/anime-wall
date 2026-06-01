/* ============================================================
   scripts/enrichTags.js
   为 animeData.js 添加多维标签: moods, vibes, characterTags
   用法: node scripts/enrichTags.js
   ============================================================ */
const fs   = require('fs');
const path = require('path');
const DATA_FILE = path.join(__dirname, '..', 'data', 'animeData.js');

let raw = fs.readFileSync(DATA_FILE, 'utf8');
const evalCode = raw.replace('window.animeData', 'var animeData');
eval(evalCode);

// ── Tag derivation rules ───────────────────────────────────
const MOOD_RULES = [
  { genres:['治愈','日常','Iyashikei'],         mood:'治愈',       vibe:'温暖' },
  { genres:['喜剧','搞笑','Comedy'],             mood:'轻松欢乐',   vibe:'明快' },
  { genres:['剧情','心理','Psychological'],      mood:'深刻',       vibe:'安静' },
  { genres:['恐怖','Horror','黑暗'],             mood:'悬疑紧张',   vibe:'暗黑' },
  { genres:['恋爱','Romance'],                   mood:'浪漫',       vibe:'温柔' },
  { genres:['科幻','Sci-Fi','赛博朋克'],         mood:'科幻',       vibe:'未来感' },
  { genres:['奇幻','Fantasy','异世界'],          mood:'奇幻冒险',   vibe:'梦幻' },
  { genres:['运动','Sports'],                    mood:'热血',       vibe:'青春' },
  { genres:['音乐','Music','乐队'],              mood:'艺术',       vibe:'文艺' },
  { genres:['悬疑','Mystery','侦探'],            mood:'悬疑',       vibe:'冷峻' },
  { genres:['机战','Mecha'],                     mood:'热血',       vibe:'机械' },
  { genres:['校园','School'],                    mood:'青春日常',   vibe:'校园' },
  { genres:['日常','Slice of Life'],             mood:'悠闲',       vibe:'宁静' },
];

const CHAR_TAGS = [
  { genres:['动作','Action'], tags:['少年'],     char:'热血主角' },
  { genres:['奇幻'], tags:['异世界'],            char:'转生者' },
  { genres:['机战','Mecha'],                     char:'驾驶员' },
  { genres:['恋爱','Romance'], tags:['校园'],    char:'恋爱主角' },
  { genres:['音乐','Music'],                     char:'音乐人' },
  { genres:['运动','Sports'],                    char:'运动员' },
  { genres:['喜剧','搞笑'],                      char:'搞笑角色' },
  { genres:['心理','Psychological'],             char:'复杂人设' },
  { genres:['悬疑','Mystery','侦探'],            char:'侦探' },
  { genres:['奇幻','Fantasy'], tags:['魔法'],    char:'魔法使' },
  { genres:['动作','Action'], tags:['超自然'],   char:'能力者' },
];

// Apply to each anime
for (const a of animeData) {
  const genres = a.tags || [];
  const score  = a.score || 7;

  // ── Moods ──
  const moods = [];
  for (const rule of MOOD_RULES) {
    if (rule.genres.some(g => genres.includes(g))) {
      if (!moods.includes(rule.mood)) moods.push(rule.mood);
    }
  }

  // ── Vibes ──
  const vibes = [];
  for (const rule of MOOD_RULES) {
    if (rule.genres.some(g => genres.includes(g))) {
      if (!vibes.includes(rule.vibe)) vibes.push(rule.vibe);
    }
  }
  // Score-based vibes
  if (score >= 8.5) { if(!vibes.includes('神作')) vibes.unshift('神作'); }
  if (score >= 8.0 && !vibes.includes('好评')) vibes.push('好评');
  // Popularity-based
  if (a.popularity > 300000) { if(!vibes.includes('人气')) vibes.push('人气'); }
  // Format-based
  if (a.format === '剧场版' || a.format === 'MOVIE') { if(!vibes.includes('剧场版')) vibes.unshift('剧场版'); }
  if (a.episodes === 1 && a.format !== '剧场版') { if(!vibes.includes('短片')) vibes.push('短片'); }
  if (a.episodes > 50) { if(!vibes.includes('长篇')) vibes.push('长篇'); }
  if (a.season === 'WINTER') vibes.push('冬季');
  if (a.season === 'SUMMER') vibes.push('夏季');
  if (a.season === 'SPRING') vibes.push('春季');
  if (a.season === 'FALL')   vibes.push('秋季');
  // Year-based
  if (a.seasonYear < 2000) { if(!vibes.includes('经典')) vibes.push('经典'); }
  if (a.seasonYear >= 2020) { if(!vibes.includes('新番')) vibes.push('新番'); }

  // ── CharacterTags ──
  const chars = [];
  for (const rule of CHAR_TAGS) {
    const matchGenres = rule.genres.some(g => genres.includes(g));
    const matchTags = !rule.tags || rule.tags.some(t => genres.includes(t));
    if (matchGenres && matchTags) {
      if (!chars.includes(rule.char)) chars.push(rule.char);
    }
  }

  // ── Expanded tags (合并 genres + 衍生标签) ──
  const allTags = [...new Set([
    ...genres,
    ...moods.slice(0, 2),
    ...vibes.slice(0, 3),
  ])].slice(0, 10);

  a.moods  = moods.slice(0, 4);
  a.vibes  = vibes.slice(0, 5);
  a.characterTags = chars.slice(0, 3);
  a.tags   = allTags;  // Replace old tags with expanded set
}

// Write back
let out = raw.slice(0, raw.indexOf('window.animeData'));
out += 'window.animeData = [\n';
for (const a of animeData) {
  out += '  ' + JSON.stringify(a) + ',\n';
}
out += '];\n';
fs.writeFileSync(DATA_FILE, out);

// Stats
console.log('Entries:', animeData.length);
console.log('Avg moods:', (animeData.reduce((s,a)=>s+(a.moods||[]).length,0)/animeData.length).toFixed(1));
console.log('Avg vibes:', (animeData.reduce((s,a)=>s+(a.vibes||[]).length,0)/animeData.length).toFixed(1));
console.log('Avg charTags:', (animeData.reduce((s,a)=>s+(a.characterTags||[]).length,0)/animeData.length).toFixed(1));
console.log('Avg tags:', (animeData.reduce((s,a)=>s+(a.tags||[]).length,0)/animeData.length).toFixed(1));
const a=animeData[0];
console.log('Sample:', a.title, '| moods:', a.moods, '| vibes:', a.vibes, '| chars:', a.characterTags);
