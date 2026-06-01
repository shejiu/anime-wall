/* ============================================================
   scripts/addCnTitles.js
   为 animeData.js 中的每部动漫添加中文标题 + 别名
   用法: node scripts/addCnTitles.js
   ============================================================ */
const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'animeData.js');
const CN_MAP    = JSON.parse(fs.readFileSync(path.join(__dirname, 'cnTitles.json'), 'utf8'));

// Read data
let raw = fs.readFileSync(DATA_FILE, 'utf8');
const evalCode = raw.replace('window.animeData', 'var animeData');
eval(evalCode);

let updated = 0;
for (const a of animeData) {
  const aid = a.link.match(/anime\/(\d+)/)[1];
  const cn = CN_MAP[aid];
  if (cn) {
    a.cnTitle = cn.cn;
    a.aliases = cn.aliases;
    updated++;
  } else {
    // Auto-generate basic aliases from title words
    const aliases = [];
    // Add romaji as alias
    if (a.romaji) aliases.push(a.romaji);
    // Add first 3 chars of native title as search hint
    if (a.title && a.title.length >= 2) {
      const first2 = a.title.substring(0, 2);
      if (!aliases.includes(first2)) aliases.push(first2);
    }
    // Add tags as searchable
    if (a.tags) a.tags.forEach(t => { if (!aliases.includes(t)) aliases.push(t); });
    a.cnTitle = '';
    a.aliases = aliases.slice(0, 8);
  }
}

// Write back
let out = raw.slice(0, raw.indexOf('window.animeData'));
out += 'window.animeData = [\n';
for (const a of animeData) {
  out += '  ' + JSON.stringify(a) + ',\n';
}
out += '];\n';
fs.writeFileSync(DATA_FILE, out);

console.log('中文标题映射:', updated, '/', animeData.length);
console.log('已写入:', DATA_FILE);
