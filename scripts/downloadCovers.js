/* ============================================================
   scripts/downloadCovers.js
   下载所有动漫封面到 /covers/，更新 animeData.js 为本地路径
   用法: node scripts/downloadCovers.js [concurrency]
   ============================================================ */
const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

const DATA_FILE  = path.join(__dirname, '..', 'data', 'animeData.js');
const COVER_DIR  = path.join(__dirname, '..', 'covers');
const CONCURRENT = parseInt(process.argv[2]) || 8;

if (!fs.existsSync(COVER_DIR)) fs.mkdirSync(COVER_DIR, { recursive: true });

// Load data
let raw = fs.readFileSync(DATA_FILE, 'utf8');
const evalCode = raw.replace('window.animeData', 'var animeData');
eval(evalCode);
console.log('Anime:', animeData.length);

// Download function
function download(url, dest) {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(dest);
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve);
      }
      if (res.statusCode !== 200) { file.close(); try { fs.unlinkSync(dest) } catch(e){} return resolve(null); }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    });
    req.on('error', () => { try { fs.unlinkSync(dest) } catch(e){} resolve(null); });
    req.on('timeout', () => { req.destroy(); try { fs.unlinkSync(dest) } catch(e){} resolve(null); });
  });
}

async function processBatch(batch) {
  const results = await Promise.all(batch.map(async (a) => {
    const aid = a.link.match(/anime\/(\d+)/)[1];
    const ext = a.cover.split('.').pop().split('?')[0] || 'jpg';
    const dest = path.join(COVER_DIR, `${aid}.${ext}`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 500) return { ...a, cover: `covers/${aid}.${ext}`, ok: true };
    const result = await download(a.cover, dest);
    if (result) return { ...a, cover: `covers/${aid}.${ext}`, ok: true };
    return { ...a, ok: false };
  }));
  return results;
}

(async () => {
  let completed = 0, success = 0;
  const allResults = [];

  // Process in batches
  for (let i = 0; i < animeData.length; i += CONCURRENT) {
    const batch = animeData.slice(i, i + CONCURRENT);
    const results = await processBatch(batch);
    for (const r of results) {
      if (r.ok) success++;
      allResults.push(r);
    }
    completed += batch.length;
    process.stdout.write(`\r  ${completed}/${animeData.length}  (${success} ok)`);
  }

  console.log('\n\nDownloaded:', success, '/', animeData.length);

  // Update data file — use local covers where downloaded, keep CDN as fallback
  for (const a of animeData) {
    const aid = a.link.match(/anime\/(\d+)/)[1];
    const ext = a.cover.split('.').pop().split('?')[0] || 'jpg';
    const localPath = `covers/${aid}.${ext}`;
    const localFull = path.join(COVER_DIR, `${aid}.${ext}`);
    if (fs.existsSync(localFull) && fs.statSync(localFull).size > 500) {
      a.cover = localPath;
    }
  }

  // Write updated data
  let out = raw.slice(0, raw.indexOf('window.animeData'));
  out += 'window.animeData = [\n';
  for (const a of animeData) {
    out += '  ' + JSON.stringify(a) + ',\n';
  }
  out += '];\n';
  fs.writeFileSync(DATA_FILE, out);
  console.log('Updated', DATA_FILE);

  // Stats
  const local = animeData.filter(a => a.cover.startsWith('covers/'));
  const remote = animeData.filter(a => !a.cover.startsWith('covers/'));
  console.log('Local covers:', local.length);
  console.log('Remote covers:', remote.length);
})();
