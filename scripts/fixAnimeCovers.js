/* ============================================================
   scripts/fixAnimeCovers.js
   扫描 animeData.js → AniList API 批量验证 → 修复失效封面
   用法: node scripts/fixAnimeCovers.js
   ============================================================ */
const fs   = require('fs');
const path = require('path');
const https = require('https');

const DATA_FILE = path.join(__dirname, '..', 'data', 'animeData.js');
const BATCH     = 50;
const DELAY_MS  = 400;
const API       = 'https://graphql.anilist.co';

function apiPost(ids) {
  return new Promise((resolve, reject) => {
    const query = JSON.stringify({
      query: `{Page(page:1,perPage:${BATCH}){media(id_in:[${ids.join(',')}],type:ANIME){id coverImage{large}}}}`,
    });
    const u = new URL(API);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      timeout: 20000,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(query);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  AniList Cover Fixer                ║');
  console.log('╚══════════════════════════════════════╝');

  // Read data
  let raw = fs.readFileSync(DATA_FILE, 'utf8');
  const evalCode = raw.replace('window.animeData', 'var animeData');
  eval(evalCode);
  console.log('读取:', animeData.length, '部');

  // Extract unique AniList IDs
  const entries = animeData.map(a => ({
    id: a.id,
    anilistId: parseInt(a.link.match(/anime\/(\d+)/)[1]),
    oldCover: a.cover,
  }));

  const ids = [...new Set(entries.map(e => e.anilistId))];
  console.log('唯一 ID:', ids.length);

  // Batch query
  const coverMap = new Map();
  let fixed = 0, checked = 0;
  const batches = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    batches.push(ids.slice(i, i + BATCH));
  }

  console.log('查询中... (', batches.length, '批 )');
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    process.stdout.write(`  ${bi + 1}/${batches.length} `);
    const json = await apiPost(batch);
    const media = json?.data?.Page?.media || [];
    for (const m of media) {
      const url = (m.coverImage?.large || '').replace('/medium/', '/large/');
      if (url) coverMap.set(m.id, url);
    }
    checked += batch.length;
    console.log(`→ ${media.length} covers  | ${coverMap.size} total`);
    await sleep(DELAY_MS);
  }

  // Build fixed data
  for (const a of animeData) {
    const aid = parseInt(a.link.match(/anime\/(\d+)/)[1]);
    const newCover = coverMap.get(aid);
    if (newCover && newCover !== a.cover) {
      a.cover = newCover;
      fixed++;
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

  const missing = ids.filter(id => !coverMap.has(id));
  console.log('\n╔══════════════════════════════════════╗');
  console.log(`║  已验证: ${coverMap.size}/${ids.length} IDs        ║`);
  console.log(`║  已修复: ${fixed} covers              ║`);
  if (missing.length > 0) {
    console.log(`║  缺失: ${missing.length} IDs (保留原封面)║`);
  }
  console.log('╚══════════════════════════════════════╝');
})();
