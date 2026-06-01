/* ============================================================
   generateAnimeData.js
   统一抓取 → 抓完再分层（避免 tier 间 dedup 吃掉低分条目）
   用法: node scripts/generateAnimeData.js
   ============================================================ */
const fs=require('fs'),path=require('path'),https=require('https');
const API='https://graphql.anilist.co',PER_PAGE=50,DELAY=280;
const DATA_DIR=path.join(__dirname,'..','data');
const EXCLUDED=new Set(['MUSIC','CM','PV','NOVEL']);

const TAG_MAP={Action:'动作',Adventure:'冒险',Comedy:'喜剧',Drama:'剧情',Fantasy:'奇幻',Horror:'恐怖',Mystery:'悬疑',Psychological:'心理',Romance:'恋爱','Sci-Fi':'科幻','Slice of Life':'日常',Sports:'运动',Supernatural:'超自然',Thriller:'惊悚',Mecha:'机战',Music:'音乐',Ecchi:'搞笑',School:'校园',Military:'军事',Historical:'历史',Parody:'恶搞','Mahou Shoujo':'魔法少女','Martial Arts':'武术',Game:'游戏',Shounen:'少年',Seinen:'青年',Shoujo:'少女',Space:'太空',Police:'公安',Samurai:'武士',Demons:'恶魔',Magic:'魔法',Iyashikei:'治愈',Gourmet:'美食',Cyberpunk:'赛博朋克',Idols:'偶像','Work Life':'职场',Racing:'竞速','Performing Arts':'表演',Pets:'宠物',Food:'美食','Visual Arts':'美术','Video Game':'电子游戏',MMO:'网游','Otaku Culture':'御宅',CGDCT:'萌系',Detective:'侦探',Survival:'生存','Time Travel':'穿越',Reincarnation:'转生',Isekai:'异世界',Band:'乐队'};
const FORMAT_MAP={TV:'TV',MOVIE:'剧场版',OVA:'OVA',ONA:'ONA',SPECIAL:'特别篇'};
function tr(en){return TAG_MAP[en]||en}

// ── 统一抓取：最宽松条件 ──
const MIN_SCORE=20; // 2.0+
const MIN_POP=100;
const SORTS=['SCORE_DESC','POPULARITY_DESC','ID_DESC','FAVOURITES_DESC'];

function apiPost(body){return new Promise(r=>{const u=new URL(API);const req=https.request({hostname:u.hostname,path:u.pathname,method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},timeout:20000},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{r(JSON.parse(d))}catch(e){r(null)}})});req.on('error',()=>r(null));req.write(body);req.end()})}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

function gql(page,sort){return JSON.stringify({query:`{Page(page:${page},perPage:${PER_PAGE}){pageInfo{hasNextPage}media(type:ANIME,format_in:[TV,MOVIE,OVA,ONA,SPECIAL],sort:${sort},countryOfOrigin:JP){id title{romaji english native}coverImage{large}averageScore episodes season seasonYear startDate{year month day}genres popularity favourites isAdult format}}}`})}

(async()=>{
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  Unified Fetch → Split into Tiers       ║');
  console.log('║  Score≥2.0 | Pop≥100                   ║');
  console.log('╚══════════════════════════════════════════╝');

  const seenIds=new Set(),seenTitles=new Set();
  const all=[];

  for(const sort of SORTS){
    let page=1,emptyPages=0;
    console.log('\n▶ Sort: '+sort);
    while(page<=80&&emptyPages<4){
      process.stdout.write('  p'+String(page).padStart(3)+' ');
      const json=await apiPost(gql(page,sort));if(!json){console.log('ERR');page++;await sleep(DELAY);continue}
      const media=json?.data?.Page?.media||[];const hasNext=json?.data?.Page?.pageInfo?.hasNextPage;
      let added=0;
      for(const m of media){
        if(m.isAdult)continue;if(!m.coverImage?.large)continue;
        if((m.averageScore||0)<MIN_SCORE)continue;if((m.popularity||0)<MIN_POP)continue;
        if(EXCLUDED.has(m.format||''))continue;if(seenIds.has(m.id))continue;
        const key=(m.title?.romaji||m.title?.native||'').toLowerCase();
        if(seenTitles.has(key))continue;
        const date=m.startDate?.year?`${m.startDate.year}-${String(m.startDate.month||1).padStart(2,'0')}-${String(m.startDate.day||1).padStart(2,'0')}`:'----';
        const tags=(m.genres||[]).map(tr).filter(Boolean).slice(0,6);
        all.push({id:m.id,title:m.title?.native||m.title?.romaji||'---',romaji:m.title?.romaji||'',english:m.title?.english||'',date,season:m.season||null,seasonYear:m.seasonYear||null,format:FORMAT_MAP[m.format]||m.format||'TV',episodes:m.episodes||0,score:(m.averageScore||50)/10,popularity:m.popularity||0,favourites:m.favourites||0,tags,link:'https://anilist.co/anime/'+m.id,cover:m.coverImage.large.replace('/medium/','/large/')});
        seenIds.add(m.id);seenTitles.add(key);added++;
      }
      console.log('+'+added+' ('+all.length+')'+(hasNext?'→':'✗'));
      if(added===0)emptyPages++;else emptyPages=0;page++;await sleep(DELAY);
    }
  }

  all.sort((a,b)=>b.score-a.score);
  console.log('\nTotal fetched:',all.length);

  // ── Enrich + Split into tiers (data-driven boundaries) ──
  // Sort ascending to find percentiles
  const scores=all.map(a=>a.score||0).sort((a,b)=>a-b);
  const p25=scores[Math.floor(scores.length*0.25)];
  const p50=scores[Math.floor(scores.length*0.50)];
  const p75=scores[Math.floor(scores.length*0.75)];
  console.log('Score percentiles: P25='+p25.toFixed(1)+' P50='+p50.toFixed(1)+' P75='+p75.toFixed(1));

  const tiers=[
    {name:'top-rated',  min:p75,  items:[]},  // top 25%
    {name:'mainstream', min:p50,  items:[]},  // 50-75%
    {name:'niche',      min:p25,  items:[]},  // 25-50%
    {name:'low-rated',  min:0,     items:[]},  // bottom 25%
  ];

  for(const a of all){
    // Enrich
    const gs=a.tags||[];const moods=[],vibes=[],chars=[];
    if(gs.some(g=>['治愈','日常','Iyashikei'].includes(g))){moods.push('治愈');vibes.push('温暖')}
    if(gs.some(g=>['喜剧','搞笑'].includes(g))){moods.push('轻松欢乐');vibes.push('明快')}
    if(gs.some(g=>['剧情','心理'].includes(g))){moods.push('深刻');vibes.push('安静')}
    if(gs.some(g=>['恋爱','Romance'].includes(g))){moods.push('浪漫');vibes.push('温柔')}
    if(gs.some(g=>['科幻','Sci-Fi'].includes(g)))vibes.push('未来感');
    if(gs.some(g=>['奇幻','Fantasy','异世界'].includes(g)))vibes.push('梦幻');
    if(gs.some(g=>['运动','Sports'].includes(g))){moods.push('热血');vibes.push('青春')}
    if(gs.some(g=>['悬疑','Mystery'].includes(g))){moods.push('悬疑');vibes.push('冷峻')}
    if(gs.some(g=>['动作','Action'].includes(g))&&gs.some(g=>['少年'].includes(g)))chars.push('热血主角');
    if(gs.some(g=>['异世界'].includes(g)))chars.push('转生者');
    if(gs.some(g=>['音乐','Music'].includes(g)))chars.push('音乐人');
    if(a.score>=8.5)vibes.unshift('神作');else if(a.score>=8.0)vibes.unshift('好评');
    if(a.popularity>200000)vibes.push('人气');
    if((a.seasonYear||0)<2000)vibes.push('经典');
    if((a.seasonYear||0)>=2022)vibes.push('新番');
    if(a.format==='剧场版')vibes.push('剧场版');
    if(a.episodes>50)vibes.push('长篇');
    a.moods=moods.slice(0,4);a.vibes=vibes.slice(0,5);a.characterTags=chars.slice(0,3);
    a.tags=[...new Set([...gs,...moods.slice(0,2),...vibes.slice(0,3)])].slice(0,10);

    // Assign to tier (null scores → niche)
    const s=a.score||0;
    let placed=false;
    for(const t of tiers){if(s>=t.min&&t.min>0){t.items.push(a);placed=true;break}}
    if(!placed)tiers[2].items.push(a); // fallback → niche
  }

  // ── Link local covers ──
  const coversDir=path.join(__dirname,'..','covers');
  const existing=new Set();
  if(fs.existsSync(coversDir))fs.readdirSync(coversDir).forEach(f=>existing.add(f.replace('.webp','')));
  let localCount=0;
  for(const a of all){
    const aid=a.link.match(/anime\/(\d+)/)[1];
    if(existing.has(aid)){a.cover='covers/'+aid+'.webp';localCount++}
  }

  // ── Write tier files ──
  const varNames={};
  for(const t of tiers){
    const vn='_'+t.name.replace(/-/g,'_');
    varNames[t.name]=vn;
    let out='/* '+t.name+' — '+t.items.length+' 部 | score≥'+t.min.toFixed(1)+' */\n';
    out+='window.'+vn+' = [\n';
    for(const a of t.items)out+='  '+JSON.stringify(a)+',\n';
    out+='];\n';
    fs.writeFileSync(path.join(DATA_DIR,t.name+'.js'),out);
    console.log('  '+t.name+'.js: '+t.items.length+' 部 ('+(fs.statSync(path.join(DATA_DIR,t.name+'.js')).size/1024).toFixed(0)+' KB)');
  }

  // ── Loader ──
  let loader='/* animeData loader — '+all.length+' 部 */\nwindow.animeData=[];\n';
  for(const t of tiers) loader+='if(window.'+varNames[t.name]+')window.animeData=window.animeData.concat(window.'+varNames[t.name]+');\n';
  fs.writeFileSync(path.join(DATA_DIR,'animeData.js'),loader);

  // ── Update index.html ──
  const htmlPath=path.join(__dirname,'..','index.html');
  let html=fs.readFileSync(htmlPath,'utf8');
  const scripts='<script src=\"data/top-rated.js\"></script>\n<script src=\"data/mainstream.js\"></script>\n<script src=\"data/niche.js\" defer></script>\n<script src=\"data/low-rated.js\" defer></script>\n<script src=\"data/animeData.js\"></script>';
  html=html.replace(/<script src="data\/top-rated\.js"><\/script>[\s\S]*?<script src="data\/animeData\.js"><\/script>/,scripts);
  fs.writeFileSync(htmlPath,html);

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  ✅ '+String(all.length).padStart(4)+' 部 | local:'+localCount+' | remote:'+(all.length-localCount)+'   ║');
  for(const t of tiers) console.log('║  '+t.name.padEnd(12)+String(t.items.length).padStart(4)+' 部                 ║');
  console.log('╚══════════════════════════════════════════╝');
})();
