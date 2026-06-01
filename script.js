/* ============================================================
   script.js — 轻量分页无限滚动 · 固定上限 DOM 回收
   ============================================================ */

// ---- DOM ----
const grid     = document.getElementById('cardGrid');
const sentinel = document.getElementById('sentinel');
const loader   = document.getElementById('loader');
const scrTop   = document.getElementById('scrollTop');

// ---- Config ----
const BATCH      = 16;
const MAX_CARDS  = 60;      // 严格上限 — 超过即回收
const PRUNE_TO   = 30;      // 回收后保留 ~1.5 屏
const IMG_CACHE  = new Map();
let loading      = false;

// ═══ IndexedDB Cache — 第二次访问秒开 ═══
const DB_NAME='animeWallDB',DB_VER=1,STORE='animeData';
function openDB(){return new Promise((r,rej)=>{const req=indexedDB.open(DB_NAME,DB_VER);req.onupgradeneeded=e=>{e.target.result.createObjectStore(STORE)};req.onsuccess=e=>r(e.target.result);req.onerror=rej})}
async function cacheData(data){try{const db=await openDB();const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(data,'animeData');await new Promise(r=>{tx.oncomplete=r})}catch(e){}}
async function loadCachedData(){try{const db=await openDB();const tx=db.transaction(STORE,'readonly');const req=tx.objectStore(STORE).get('animeData');return new Promise(r=>{req.onsuccess=e=>r(e.target.result);req.onerror=()=>r(null)})}catch(e){return null}}

// ═══ Data — 动态合并所有 tier ═══
let allAnimeData = [...window.animeData];

function assignRanks(data){
  const sorted = [...data].sort((a,b) => b.score - a.score);
  sorted.forEach((a,i) => { if(i < 100) a.rank = i + 1; else delete a.rank; });
}
assignRanks(allAnimeData);

const DEFERRED_TIERS = ['data/niche.js', 'data/low-rated.js'];

async function loadDeferredTiers(){
  // Try IndexedDB first for instant load
  const cached = await loadCachedData();
  if(cached && cached.length > 1000){
    allAnimeData = cached;
    window.animeData = cached;
    assignRanks(allAnimeData);
    const el = document.getElementById('dataCount');
    if(el) el.textContent = '🌈 ' + allAnimeData.length.toLocaleString() + ' 部收录 (缓存)';
    filteredData = allAnimeData;
    // Still load fresh in background
    loadFreshTiers();
    return;
  }
  await loadFreshTiers();
}

async function loadFreshTiers(){
  for(const src of DEFERRED_TIERS){
    try{await new Promise((r,rej)=>{const s=document.createElement('script');s.src=src;s.onload=r;s.onerror=r;document.head.appendChild(s)})}catch(e){}
  }
  if(window._niche?.length){allAnimeData=allAnimeData.concat(window._niche);window.animeData=window.animeData.concat(window._niche)}
  if(window._low_rated?.length){allAnimeData=allAnimeData.concat(window._low_rated);window.animeData=window.animeData.concat(window._low_rated)}
  assignRanks(allAnimeData);
  // Cache to IndexedDB
  cacheData(allAnimeData);
  const el=document.getElementById('dataCount');
  if(el)el.textContent='🌈 '+allAnimeData.length.toLocaleString()+' 部收录';
  filteredData=allAnimeData;cursor=0;exhausted=false;
}

// ═════════════════════════════════════════════════════
//   Unified FilterState — 所有筛选统一管理
// ═════════════════════════════════════════════════════
const filterState = {
  search: '',
  tags: new Set(),     // genre/mood/vibe tags (AND logic)
  decades: new Set(),  // 1980,1990,... (OR logic)
};

// Year → decade group mapping
function getDecade(year){
  if(!year||year<1980) return null;
  return Math.floor(year/10)*10;
}

let filteredData = allAnimeData;
let cursor = 0;
let exhausted = false;

function applyFilters(){
  let data = allAnimeData;
  const {search, tags, decades} = filterState;

  // Tag AND — 每条 anime 必须包含所有选中标签
  for(const tag of tags){
    data = data.filter(a =>
      (a.tags||[]).includes(tag)||(a.moods||[]).includes(tag)||
      (a.vibes||[]).includes(tag)||(a.characterTags||[]).includes(tag)
    );
  }
  // Decade OR — 匹配任何选中年代
  if(decades.size > 0){
    data = data.filter(a => {
      const y = a.seasonYear || parseInt((a.date||'').slice(0,4)) || 0;
      for(const d of decades){
        if(d === 2024){ if(y >= 2024) return true; }     // ★ "Recent": 2024+
        else { const g = getDecade(y); if(g === d) return true; }
      }
      return false;
    });
  }
  // Search — pinyin + abbrev + token matching + franchise
  if(search){
    const q = search.toLowerCase();
    const franchiseIds = new Set();
    data = data.filter(a => {
      let hit=false;
      if((a.cnTitle||'').toLowerCase().includes(q))hit=true;
      else if((a.aliases||[]).some(t=>t.toLowerCase().includes(q)))hit=true;
      else if((a.title||'').toLowerCase().includes(q))hit=true;
      else if((a.romaji||'').toLowerCase().includes(q))hit=true;
      else if((a.english||'').toLowerCase().includes(q))hit=true;
      else if((a.tags||[]).some(t=>t.toLowerCase().includes(q)))hit=true;
      else if((a.searchPinyin||[]).some(t=>t.toLowerCase().includes(q)))hit=true;
      else if((a.searchAbbrev||[]).some(t=>t.toLowerCase().includes(q)))hit=true;
      else if((a.pinyinTokens||[]).length>0){
        const flat=a.pinyinTokens.join('');let qi2=0;
        for(let ci=0;ci<flat.length&&qi2<q.length;ci++){if(flat[ci]===q[qi2])qi2++}
        if(qi2===q.length)hit=true;
      }
      if(hit){
        const aid=parseInt(a.link.match(/anime\/(\d+)/)[1]);
        if(window._franchiseMap){
          const fIds=window._franchiseMap.get(aid);
          if(fIds)fIds.forEach(id=>franchiseIds.add(id));
        }
        return true;
      }
      return false;
    });
    // Add franchise siblings (only from explicit franchiseMap)
    if(franchiseIds.size>0){
      const existingIds=new Set(data.map(a=>parseInt(a.link.match(/anime\/(\d+)/)[1])));
      for(const fid of franchiseIds){
        if(existingIds.has(fid))continue;
        const sib=allAnimeData.find(a=>parseInt(a.link.match(/anime\/(\d+)/)[1])===fid);
        if(!sib)continue;
        // Franchise guard: verify sibling shares at least one title word with a matched entry
        const matchedTitles=data.filter(a=>{
          const aid=parseInt(a.link.match(/anime\/(\d+)/)[1]);
          const fIds=window._franchiseMap?.get(aid);
          return fIds&&fIds.includes(fid);
        });
        const sharesWord=matchedTitles.some(m=>{
          const mw=new Set(m.title.replace(/[・\sSeason\dPartFinalMovieOVAⅡⅢⅣⅤⅥ劇場版]/g,'').split(''));
          const sw=new Set(sib.title.replace(/[・\sSeason\dPartFinalMovieOVAⅡⅢⅣⅤⅥ劇場版]/g,'').split(''));
          return [...mw].filter(c=>sw.has(c)).length>=3;
        });
        if(!sharesWord)continue; // skip cross-franchise contamination
        let tagOk=true;
        for(const tag of tags){if(!(sib.tags||[]).includes(tag)&&!(sib.moods||[]).includes(tag)&&!(sib.vibes||[]).includes(tag)&&!(sib.characterTags||[]).includes(tag)){tagOk=false;break}}
        let decOk=true;
        if(decades.size>0){const y=sib.seasonYear||parseInt((sib.date||'').slice(0,4))||0;decOk=false;for(const d of decades){if(d===2024){if(y>=2024){decOk=true;break}}else{const g=Math.floor(y/10)*10;if(g===d){decOk=true;break}}}}
        if(tagOk&&decOk)data.push(sib);
      }
    }
  }
  return data;
}

// ═══ 分页 ═══
function nextBatch(n){
  if(exhausted) return [];
  const batch = filteredData.slice(cursor, cursor + n);
  cursor += batch.length;
  if(cursor >= filteredData.length) exhausted = true;
  return batch;
}

// ═══ 重置池 ═══
function resetPool(){
  filteredData = applyFilters();
  cursor = 0; exhausted = (filteredData.length === 0);
  const cards = grid.querySelectorAll('.card');
  cards.forEach(c => { c.style.backgroundImage = ''; c.remove(); });

  // Empty state
  let emptyEl=document.getElementById('emptyState');
  if(filteredData.length===0){
    if(!emptyEl){
      emptyEl=document.createElement('div');
      emptyEl.id='emptyState';
      emptyEl.className='empty-state';
      emptyEl.innerHTML='<span class=\"empty-icon\">🔍</span><h2>NO ANIME FOUND</h2><p>没有找到匹配的动漫</p><p class=\"empty-sub\">请尝试其他关键词或清空筛选</p>';
      grid.appendChild(emptyEl);
    }
  }else{
    if(emptyEl)emptyEl.remove();
    appendCards(BATCH);
  }
  const el = document.getElementById('dataCount');
  if(el) el.textContent = '🌈 ' + filteredData.length.toLocaleString() + ' 部';
}

// ═══ 事件委托 — 所有 chip 点击统一走 header ═══
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');

// ═══ Autocomplete ═══
const suggestionsEl=document.getElementById('suggestions');
let selectedIdx=-1;

function getSuggestions(q){
  const lo=q.toLowerCase();if(!lo)return[];
  const results=[];
  for(const a of allAnimeData){
    let score=0;
    if((a.cnTitle||'').toLowerCase().includes(lo))score+=10;
    if((a.title||'').toLowerCase().includes(lo))score+=8;
    if((a.romaji||'').toLowerCase().includes(lo))score+=6;
    if((a.english||'').toLowerCase().includes(lo))score+=6;
    if((a.aliases||[]).some(t=>t.toLowerCase().includes(lo)))score+=5;
    if((a.searchPinyin||[]).some(t=>t.toLowerCase().includes(lo)))score+=4;
    if((a.searchAbbrev||[]).some(t=>t.toLowerCase().includes(lo)))score+=3;
    if(score>0)results.push({a,score});
  }
  results.sort((x,y)=>y.score-x.score);
  return results.slice(0,8);
}

function showSuggestions(q){
  const items=getSuggestions(q);
  if(items.length===0){suggestionsEl.style.display='none';return}
  suggestionsEl.innerHTML=items.map((item,i)=>
    `<div class="suggestion-item${i===0?' active':''}" data-idx="${i}">
      <span class="sug-title">${item.a.cnTitle||item.a.title}</span>
      <span class="sug-score">⭐${item.a.score.toFixed(1)}</span>
    </div>`
  ).join('');
  suggestionsEl.style.display='block';selectedIdx=0;
}

function hideSuggestions(){suggestionsEl.style.display='none';selectedIdx=-1}

// Select suggestion
function selectSuggestion(idx){
  const items=suggestionsEl.querySelectorAll('.suggestion-item');
  if(idx<0||idx>=items.length)return;
  const item=getSuggestions(searchInput.value.trim())[idx];
  if(item){searchInput.value=item.a.cnTitle||item.a.title;filterState.search=searchInput.value.trim();hideSuggestions();resetPool()}
}

let searchDebounce=null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce=setTimeout(()=>{
    filterState.search = searchInput.value.trim();
    searchClear.style.display = filterState.search ? 'block' : 'none';
    showSuggestions(filterState.search);
    if(!filterState.search)hideSuggestions();
    resetPool();
  },150);
});
// Keyboard nav
searchInput.addEventListener('keydown',e=>{
  const items=suggestionsEl.querySelectorAll('.suggestion-item');
  if(e.key==='ArrowDown'){e.preventDefault();selectedIdx=Math.min(selectedIdx+1,items.length-1);updateSuggestionHighlight()}
  else if(e.key==='ArrowUp'){e.preventDefault();selectedIdx=Math.max(selectedIdx-1,0);updateSuggestionHighlight()}
  else if(e.key==='Enter'){e.preventDefault();selectSuggestion(selectedIdx)}
  else if(e.key==='Escape'){hideSuggestions();searchInput.blur()}
});
function updateSuggestionHighlight(){
  suggestionsEl.querySelectorAll('.suggestion-item').forEach((el,i)=>el.classList.toggle('active',i===selectedIdx));
}
// Click suggestion
suggestionsEl.addEventListener('click',e=>{
  const item=e.target.closest('.suggestion-item');if(!item)return;
  selectSuggestion(parseInt(item.dataset.idx));
});
// Click outside
document.addEventListener('click',e=>{if(!e.target.closest('#searchBar'))hideSuggestions()});

searchClear.addEventListener('click', () => {
  searchInput.value = ''; filterState.search = '';
  searchClear.style.display = 'none'; hideSuggestions();
  clearTimeout(searchDebounce);
  resetPool();
});

// Unified chip click via event delegation on header
const siteHeader = document.querySelector('.site-header');
if(siteHeader){
  siteHeader.addEventListener('click', e => {
    const chip = e.target.closest('.tag-chip'); if(!chip) return;
    e.stopPropagation();

    // ── Decade chips ──
    const decade = chip.dataset.decade;
    if(decade !== undefined){
      const d = parseInt(decade);
      chip.classList.toggle('active');
      if(chip.classList.contains('active')) filterState.decades.add(d);
      else filterState.decades.delete(d);
      resetPool();
      return;
    }

    // ── Tag chips ──
    const tag = chip.dataset.tag;
    if(tag !== undefined){
      const group = chip.closest('.tag-filters');
      if(tag === ''){
        // "全部" — clear group
        group.querySelectorAll('.tag-chip').forEach(c => {
          c.classList.remove('active');
          if(c.dataset.tag) filterState.tags.delete(c.dataset.tag);
        });
        chip.classList.add('active');
      } else {
        chip.classList.toggle('active');
        if(chip.classList.contains('active')) filterState.tags.add(tag);
        else filterState.tags.delete(tag);
        // Update "全部" state
        const allBtn = group.querySelector('.tag-chip[data-tag=""]');
        if(allBtn){
          const anyActive = group.querySelectorAll('.tag-chip:not([data-tag=""]).active').length;
          allBtn.classList.toggle('active', !anyActive);
        }
      }
      resetPool();
    }
  });
}

// ---- Score helpers ----
function scoreClass(s){if(s>=8.5)return's-s';if(s>=8)return's-a';if(s>=7)return's-b';if(s>=6)return's-c';return's-d'}
function scoreLabel(s){if(s>=9)return'神作';if(s>=8.5)return'力荐';if(s>=8)return'推荐';if(s>=7)return'不错';if(s>=6)return'还行';return'一般'}

// ---- Tag colors ----
const tagColors=['#f8bbd0','#b3e5fc','#c8e6c9','#ffe082','#d1c4e9','#ffccbc','#b2dfdb','#f0f4c3','#bbdefb','#e1bee7','#ffab91','#80cbc4','#a5d6a7','#ef9a9a','#80deea','#ce93d8','#ffcc80','#90caf9','#aed581','#ff8a80'];
function tagColor(i){return tagColors[i%tagColors.length]}

// ---- Build card HTML (innerHTML, 一次性) ----
function buildCard(a){
  const sc=scoreClass(a.score),sl=scoreLabel(a.score);
  const d=a.date?.slice(0,7)||'---',ep=a.episodes===1?'剧场版':`${a.episodes}话`;
  const tagsHTML=(a.tags||[]).map((t,i)=>`<span class="tag" style="color:${tagColor(i)};border-color:${tagColor(i)}44;background:${tagColor(i)}11">${t}</span>`).join('');
  const rankBadge=a.rank?`<span class="rank-badge${a.rank<=3?' rank-top3':''}">${a.rank<=3?'👑':''} TOP ${a.rank}</span>`:'';
  return `<article class="card" data-src="${a.cover}">
    ${rankBadge}
    <div class="card-overlay"></div><div class="card-body">
    <h3 class="card-title">${a.title}</h3>
    ${a.romaji?`<p class="card-romaji">${a.romaji}</p>`:''}
    <div class="card-meta"><span>📅 ${d}</span><span>📺 ${ep}</span></div>
    <span class="card-score ${sc}">⭐ ${Number(a.score).toFixed(1)}</span>
    ${a.popularity ? `<span class="card-pop">${(a.popularity/1000).toFixed(0)}k users</span>` : ''}
    ${tagsHTML?`<div class="card-tags">${tagsHTML}</div>`:''}
    ${a.moods&&a.moods.length?`<div class="card-moods">${a.moods.slice(0,2).map(m=>`<span class="mood-tag">${m}</span>`).join('')}</div>`:''}
    <div class="card-footer"><span style="font-size:11px;color:var(--text-muted)">${sl}</span><a href="${a.link}" target="_blank" rel="noopener" class="anilist-link">🔗 AniList</a></div>
    </div></article>`;
}

// ---- Append cards ----
function appendCards(n){
  const batch=nextBatch(n),frag=document.createDocumentFragment();
  for(const a of batch){const div=document.createElement('div');div.innerHTML=buildCard(a);frag.appendChild(div.firstElementChild)}
  grid.insertBefore(frag,sentinel);
  // 懒加载封面
  for(const a of batch){
    const card=grid.querySelector(`.card[data-src="${a.cover}"]:not([data-loaded])`);
    if(card) loadCardBg(card);
  }
}

// ---- Prune old cards (简单 FIFO) ----
function pruneOld(){
  const cards=grid.querySelectorAll('.card');
  if(cards.length<=MAX_CARDS)return;
  const removeCount=cards.length-PRUNE_TO;
  for(let i=0;i<removeCount;i++){
    const f=grid.firstElementChild;
    if(!f||!f.classList.contains('card'))break;
    f.style.backgroundImage=''; // free GPU texture
    f.remove();
  }
}

// ═══ Cover loading — 三级降级 + 缓存 ═══
const FALLBACK_FILE='assets/fallback-cover.svg';
const FALLBACK_INLINE='data:image/svg+xml,'+encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="840" viewBox="0 0 600 840">'+
  '<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#08081a"/><stop offset="100%" style="stop-color:#0a0818"/></linearGradient>'+
  '<filter id="f"><feGaussianBlur stdDeviation="3"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'+
  '<rect width="600" height="840" fill="url(#g)"/>'+
  '<rect x="20" y="20" width="560" height="800" rx="20" fill="none" stroke="#ff2d95" stroke-width="1.2" opacity="0.3" stroke-dasharray="12 6"/>'+
  '<ellipse cx="300" cy="285" rx="35" ry="40" fill="none" stroke="#00e5ff" stroke-width="2.5" opacity="0.55"/>'+
  '<ellipse cx="286" cy="278" rx="9" ry="11" fill="none" stroke="#00e5ff" stroke-width="2.2" opacity="0.7"/><circle cx="286" cy="278" r="3.5" fill="#00e5ff" opacity="0.8"/>'+
  '<ellipse cx="314" cy="278" rx="9" ry="11" fill="none" stroke="#00e5ff" stroke-width="2.2" opacity="0.7"/><circle cx="314" cy="278" r="3.5" fill="#00e5ff" opacity="0.8"/>'+
  '<path d="M 293 300 Q 300 306 307 300" fill="none" stroke="#ff2d95" stroke-width="1.5" opacity="0.5" stroke-linecap="round"/>'+
  '<text x="300" y="430" text-anchor="middle" fill="#ff2d95" font-size="28" font-weight="900" font-family="sans-serif" filter="url(#f)" letter-spacing="4">NO COVER</text>'+
  '<text x="300" y="515" text-anchor="middle" fill="#8a7fa0" font-size="13" font-family="sans-serif">封面图片暂时不可用</text>'+
  '</svg>');

function loadCardBg(card){
  const url=card.dataset.src;
  if(!url||card.dataset.loaded==='1')return;
  card.dataset.loaded='1';

  function applyBg(bgUrl){
    card.style.backgroundImage=`linear-gradient(180deg,transparent 55%,rgba(6,6,15,0.18) 100%),url("${bgUrl}")`;
    card.style.backgroundSize='cover';card.style.backgroundPosition='center';card.style.backgroundRepeat='no-repeat';
    card.classList.add('bg-loaded');
  }
  if(IMG_CACHE.has(url)){ if(IMG_CACHE.get(url))applyBg(url);else applyBg(FALLBACK_FILE);return }
  const img=new Image();
  img.onload=()=>{IMG_CACHE.set(url,true);applyBg(url)};
  img.onerror=()=>{IMG_CACHE.set(url,false);const fb=new Image();fb.onload=()=>applyBg(FALLBACK_FILE);fb.onerror=()=>applyBg(FALLBACK_INLINE);fb.src=FALLBACK_FILE};
  img.src=url;
}

// ═══ Infinite Scroll ═══
function loadMore(){
  if(loading || exhausted) return;
  loading = true;
  loader.classList.add('visible');
  requestAnimationFrame(() => {
    pruneOld();
    appendCards(BATCH);
    loading = false;
    loader.classList.remove('visible');
    if(!exhausted && sentinel.getBoundingClientRect().top < window.innerHeight + 400){
      requestAnimationFrame(() => loadMore());
    }
  });
}
new IntersectionObserver(e => {
  for(const x of e) if(x.isIntersecting) loadMore();
}, { rootMargin: '400px' }).observe(sentinel);

// ═══════════════════════════════════════════════════════
//   Sakura Canvas — 樱花飘落粒子系统
// ═══════════════════════════════════════════════════════
const sakuraCanvas=document.getElementById('sakuraCanvas');
const sakuraCtx=sakuraCanvas.getContext('2d');
function resizeSakura(){sakuraCanvas.width=window.innerWidth;sakuraCanvas.height=window.innerHeight}
window.addEventListener('resize',resizeSakura);resizeSakura();

let mouseX=-300,mouseY=-300;
document.addEventListener('mousemove',e=>{mouseX=e.clientX;mouseY=e.clientY},{passive:true});
document.addEventListener('mouseleave',()=>{mouseX=-300;mouseY=-300});

function createPetalSprite(size,color){
  const c=document.createElement('canvas');c.width=c.height=size;
  const ctx=c.getContext('2d'),r=size/2;
  ctx.shadowColor=color;ctx.shadowBlur=size*0.35;ctx.fillStyle=color;
  for(let i=0;i<5;i++){const a=(i/5)*Math.PI*2-Math.PI/2;const px=r+Math.cos(a)*r*0.46;const py=r+Math.sin(a)*r*0.46;ctx.beginPath();ctx.ellipse(px,py,r*0.37,r*0.15,a,0,Math.PI*2);ctx.fill()}
  ctx.shadowBlur=0;ctx.beginPath();ctx.arc(r,r,r*0.08,0,Math.PI*2);ctx.fill();
  return c;
}
const SAKURA_COLORS=['#ffb3c1','#ffc2d1','#fbb1c2','#ffd0dc','#ffe0e8','#f8bbd0','#ffccd5','#ffb7c5','#ffd6e0','#fce4ec'];
const SAKURA_LAYERS=[
  {count:8, sizeMin:5,sizeMax:10,speedMin:0.25,speedMax:0.55,opMin:0.12,opMax:0.25,blur:2},
  {count:12,sizeMin:10,sizeMax:18,speedMin:0.45,speedMax:0.80,opMin:0.22,opMax:0.38,blur:0},
  {count:5, sizeMin:18,sizeMax:26,speedMin:0.65,speedMax:1.10,opMin:0.32,opMax:0.52,blur:0},
];
let petals=[],sprites=[],windForce=0,windTarget=0;
function initPetals(){
  petals=[];sprites=[];
  SAKURA_COLORS.forEach(color=>{[18,32,50].forEach(sz=>sprites.push({img:createPetalSprite(sz,color),size:sz}))});
  let id=0;
  for(const L of SAKURA_LAYERS){for(let i=0;i<L.count;i++){const spr=sprites[Math.floor(Math.random()*sprites.length)];petals.push({id:id++,x:Math.random()*window.innerWidth,y:Math.random()*window.innerHeight,size:L.sizeMin+Math.random()*(L.sizeMax-L.sizeMin),speed:L.speedMin+Math.random()*(L.speedMax-L.speedMin),swayAmp:0.6+Math.random()*1.2,swaySpeed:0.3+Math.random()*0.6,opacity:L.opMin+Math.random()*(L.opMax-L.opMin),blur:L.blur,rotation:Math.random()*Math.PI*2,rotSpeed:(Math.random()-0.5)*0.015,phase:Math.random()*Math.PI*2,sprite:spr})}}
}
initPetals();
let sakuraLast=performance.now();
const SAKURA_FPS=30,SAKURA_INTERVAL=1000/SAKURA_FPS;
function drawSakura(now){
  if(now-sakuraLast<SAKURA_INTERVAL){requestAnimationFrame(drawSakura);return}
  const dt=Math.min((now-sakuraLast)/1000,0.1);sakuraLast=now;
  const w=sakuraCanvas.width,h=sakuraCanvas.height;
  sakuraCtx.clearRect(0,0,w,h);
  if(Math.random()<0.003)windTarget=(Math.random()-0.5)*0.6;
  windForce+=(windTarget-windForce)*0.01;
  for(const p of petals){
    p.y+=p.speed*50*dt;const sway=Math.sin(now*0.0008*p.swaySpeed+p.phase)*p.swayAmp;p.x+=sway*dt*25+windForce*dt*35;
    const dx=p.x-mouseX,dy=p.y-mouseY,dist=Math.sqrt(dx*dx+dy*dy);
    if(dist<180){const push=(1-dist/180)*3,angle=Math.atan2(dy,dx);p.x+=Math.cos(angle)*push*dt*50;p.y+=Math.sin(angle)*push*dt*30}
    p.rotation+=p.rotSpeed*dt*25;
    if(p.y>h+p.size*2){p.y=-p.size*2;p.x=Math.random()*w}if(p.x>w+p.size*2)p.x=-p.size*2;if(p.x<-p.size*2)p.x=w+p.size*2;
    const spr=p.sprite,s=p.size;sakuraCtx.save();sakuraCtx.globalAlpha=p.opacity;if(p.blur>0)sakuraCtx.filter=`blur(${p.blur}px)`;sakuraCtx.translate(p.x,p.y);sakuraCtx.rotate(p.rotation);sakuraCtx.drawImage(spr.img,-s/2,-s/2,s,s);sakuraCtx.restore();
  }
  requestAnimationFrame(drawSakura);
}
requestAnimationFrame(drawSakura);
window.addEventListener('resize',()=>{resizeSakura();for(const p of petals){p.x=Math.random()*sakuraCanvas.width;p.y=Math.random()*sakuraCanvas.height}});

// ═══ Kaomoji Danmaku ═══
const dmLayer=document.getElementById('danmakuLayer'),MAX_DM=7;
function spawnDanmaku(){
  if(document.hidden||dmLayer.children.length>=MAX_DM)return;
  const el=document.createElement('span');el.className='danmaku';
  el.textContent=kaomojiPool[Math.floor(Math.random()*kaomojiPool.length)];
  el.style.top=(6+Math.random()*80)+'%';el.style.fontSize=(14+Math.random()*18)+'px';
  el.style.setProperty('--dm-opacity',(0.35+Math.random()*0.35).toFixed(2));
  el.style.animationDuration=(10+Math.random()*14)+'s';
  dmLayer.appendChild(el);setTimeout(()=>el.remove(),26000);
}
let dmTimer=null;
function scheduleDM(){if(dmTimer)clearTimeout(dmTimer);if(document.hidden)return;spawnDanmaku();dmTimer=setTimeout(scheduleDM,2200+Math.random()*3000)}
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(dmTimer){clearTimeout(dmTimer);dmTimer=null}}else scheduleDM()});

// ═══ Scroll Top ═══
window.addEventListener('scroll',()=>scrTop.classList.toggle('visible',scrollY>500),{passive:true});
scrTop.addEventListener('click',()=>scrollTo({top:0,behavior:'smooth'}));

// ═══ Web Worker Search ═══
let searchWorker=null;
function initWorker(){
  try{
    searchWorker=new Worker('search-worker.js');
    searchWorker.onmessage=e=>{
      if(e.data.type==='RESULTS'){
        filteredData=e.data.results;
        cursor=0;exhausted=(filteredData.length===0);
        const cards=grid.querySelectorAll('.card');
        cards.forEach(c=>{c.style.backgroundImage='';c.remove()});
        let emptyEl=document.getElementById('emptyState');
        if(filteredData.length===0){
          if(!emptyEl){emptyEl=document.createElement('div');emptyEl.id='emptyState';emptyEl.className='empty-state';emptyEl.innerHTML='<span class=\"empty-icon\">🔍</span><h2>NO ANIME FOUND</h2><p>没有找到匹配的动漫</p>';grid.appendChild(emptyEl)}
        }else{if(emptyEl)emptyEl.remove();appendCards(BATCH)}
        const el=document.getElementById('dataCount');
        if(el)el.textContent='🌈 '+filteredData.length.toLocaleString()+' 部';
      }
    };
  }catch(e){searchWorker=null}
}

// ═══ Perf Overlay (dev only — ?perf=1) ═══
if(location.search.includes('perf=1')){
  const perf=document.createElement('div');
  perf.id='perfOverlay';
  perf.style.cssText='position:fixed;bottom:10px;left:10px;z-index:999;background:rgba(0,0,0,.8);color:#0f0;font:11px monospace;padding:6px 10px;border-radius:8px;pointer-events:none';
  document.body.appendChild(perf);
  let frames=0,lastPerf=performance.now();
  function updatePerf(){
    frames++;const now=performance.now();
    if(now-lastPerf>=1000){
      const fps=Math.round(frames/((now-lastPerf)/1000));
      perf.textContent='FPS:'+fps+' | DOM:'+grid.querySelectorAll('.card').length+' | Data:'+allAnimeData.length;
      frames=0;lastPerf=now;
    }
    requestAnimationFrame(updatePerf);
  }
  requestAnimationFrame(updatePerf);
}

// ═══ Load franchise map ═══
(function loadFranchise(){
  const s=document.createElement('script');
  s.src='data/anime-franchises.js';
  s.onload=()=>{
    if(window._franchiseDB){
      window._franchiseMap=new Map();
      for(const [key,ids] of Object.entries(window._franchiseDB)){
        for(const id of ids)window._franchiseMap.set(id,ids);
      }
    }
  };
  s.onerror=()=>{};
  document.head.appendChild(s);
})();

// ═══ Init ═══
(function init(){
  const el = document.getElementById('dataCount');
  if(el) el.textContent = '🌈 ' + allAnimeData.length.toLocaleString() + ' 部收录';
  filteredData = allAnimeData;
  appendCards(BATCH);
  scheduleDM();
  initWorker();

  loadDeferredTiers();

  // Register Service Worker (PWA)
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  requestAnimationFrame(() => requestAnimationFrame(() => {
    if(!exhausted && sentinel.getBoundingClientRect().top < window.innerHeight + 400) loadMore();
  }));
})();
