/* ============================================================
   scripts/optimizeCovers.js
   Resize all covers to 300px width + convert to WebP
   用法: node scripts/optimizeCovers.js
   ============================================================ */
const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');

const DATA_FILE = path.join(__dirname, '..', 'data', 'animeData.js');
const COVER_DIR = path.join(__dirname, '..', 'covers');
const MAX_WIDTH = 300;
const QUALITY   = 75;

if (!fs.existsSync(COVER_DIR)) { console.log('No covers/ directory'); process.exit(0); }

// Load data
let raw = fs.readFileSync(DATA_FILE, 'utf8');
const evalCode = raw.replace('window.animeData', 'var animeData');
eval(evalCode);

const files = fs.readdirSync(COVER_DIR).filter(f => !f.endsWith('.webp'));
console.log('Files to optimize:', files.length);
if (files.length === 0) { console.log('All already WebP.'); process.exit(0); }

let done = 0, skipped = 0;

async function processFile(file) {
  const src = path.join(COVER_DIR, file);
  const name = file.replace(/\.[^.]+$/, '');
  const dest = path.join(COVER_DIR, name + '.webp');
  if (fs.existsSync(dest)) { skipped++; return; }

  try {
    const stat = fs.statSync(src);
    if (stat.size < 1000) { fs.unlinkSync(src); return; } // skip tiny/broken

    await sharp(src)
      .resize(MAX_WIDTH, null, { withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(dest);

    // Only delete original if new file is valid
    if (fs.existsSync(dest) && fs.statSync(dest).size > 500) {
      if (file.endsWith('.webp')) return; // already webp
      fs.unlinkSync(src);
    }
  } catch (e) {
    // keep original on error
  }
}

(async () => {
  // Process in parallel
  const CONCURRENT = 6;
  for (let i = 0; i < files.length; i += CONCURRENT) {
    const batch = files.slice(i, i + CONCURRENT);
    await Promise.all(batch.map(processFile));
    done += batch.length;
    process.stdout.write(`\r  ${done}/${files.length}`);
  }

  console.log('\n\nOptimized:', done - skipped, '| Skipped:', skipped);

  // Update animeData.js — change cover paths to .webp
  const webpFiles = new Set(fs.readdirSync(COVER_DIR).filter(f => f.endsWith('.webp')).map(f => f.replace('.webp', '')));

  for (const a of animeData) {
    const aid = a.link.match(/anime\/(\d+)/)[1];
    const webpPath = `covers/${aid}.webp`;
    const webpFull = path.join(COVER_DIR, aid + '.webp');
    if (fs.existsSync(webpFull) && fs.statSync(webpFull).size > 500) {
      a.cover = webpPath;
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

  const webpCount = animeData.filter(a => a.cover.endsWith('.webp')).length;
  const totalSize = fs.readdirSync(COVER_DIR)
    .filter(f => f.endsWith('.webp'))
    .reduce((s, f) => s + fs.statSync(path.join(COVER_DIR, f)).size, 0);
  console.log('WebP covers:', webpCount, '/', animeData.length);
  console.log('Total size:', (totalSize / 1024 / 1024).toFixed(1), 'MB');
})();
