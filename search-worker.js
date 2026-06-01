// search-worker.js — Weighted scoring search engine
let animeData=[];

self.onmessage=function(e){
  const {type,data,keyword,filters}=e.data;
  if(type==='INIT'){animeData=data;return}
  if(type==='SEARCH'){
    const q=(keyword||'').toLowerCase();
    const results=searchAll(q,filters||{});
    self.postMessage({type:'RESULTS',results,suggestions:getSuggestions(q,filters||{})});
  }
};

// Weighted scoring: higher weight = more relevant
// Title > aliases > romaji > english > pinyin > abbrev >> tags
function scoreAnime(a,q,qTokens){
  let s=0;
  // Exact title match (highest)
  if((a.cnTitle||'').toLowerCase()===q)s+=100;
  else if((a.cnTitle||'').toLowerCase().includes(q))s+=70;
  if((a.title||'').toLowerCase()===q)s+=90;
  else if((a.title||'').toLowerCase().includes(q))s+=60;
  // Aliases
  if((a.aliases||[]).some(t=>t.toLowerCase()===q))s+=80;
  else if((a.aliases||[]).some(t=>t.toLowerCase().includes(q)))s+=50;
  // Romaji / English
  if((a.romaji||'').toLowerCase().includes(q))s+=30;
  if((a.english||'').toLowerCase().includes(q))s+=25;
  // Pinyin
  if((a.searchPinyin||[]).some(t=>t.toLowerCase().includes(q)))s+=20;
  // Abbrev
  if((a.searchAbbrev||[]).some(t=>t.toLowerCase().includes(q)))s+=15;
  // Pinyin char-level
  if((a.pinyinTokens||[]).length>0){
    const flat=a.pinyinTokens.join('');let qi=0;
    for(let ci=0;ci<flat.length&&qi<q.length;ci++){if(flat[ci]===q[qi])qi++}
    if(qi===q.length)s+=18;
  }
  // Token-level match
  if(qTokens&&(a.searchTokens||[]).length>0){
    const matched=qTokens.filter(qt=>(a.searchTokens||[]).some(st=>st.includes(qt))).length;
    s+=matched*5; // bonus for each matching token
  }
  // Tags — low weight to prevent串台
  if((a.tags||[]).some(t=>t.toLowerCase().includes(q)))s+=3;
  // Canonical title match
  if((a.canonicalTitle||'').toLowerCase().includes(q))s+=25;
  return s;
}

function searchAll(q,filters){
  const tags=filters.tags?new Set(filters.tags):new Set();
  const decades=filters.decades?new Set(filters.decades):new Set();

  if(!q&&tags.size===0&&decades.size===0)return animeData;
  if(!q&&(tags.size>0||decades.size>0)){
    // Only tag/decade filters, no search
    let data=animeData;
    if(tags.size>0){for(const tag of tags){data=data.filter(a=>(a.tags||[]).includes(tag)||(a.moods||[]).includes(tag)||(a.vibes||[]).includes(tag)||(a.characterTags||[]).includes(tag))}}
    if(decades.size>0){data=data.filter(a=>{const y=a.seasonYear||parseInt((a.date||'').slice(0,4))||0;for(const d of decades){if(d===2024){if(y>=2024)return true}else{const g=Math.floor(y/10)*10;if(g===d)return true}}return false})}
    return data;
  }

  const qTokens=q.split(/[\s・\-:]+/).filter(t=>t.length>=1);

  // Score all anime
  let scored=animeData.map(a=>({a,score:scoreAnime(a,q,qTokens)}));
  // Franchise bonus: if one entry scored high, boost whole franchise
  const franchiseBoost=new Map();
  for(const item of scored){
    if(item.score>=50){
      const aid=parseInt(item.a.link.match(/anime\/(\d+)/)[1]);
      // We don't have franchiseMap in worker, but we can boost by canonicalTitle
      if(item.a.canonicalTitle){
        const ct=item.a.canonicalTitle.toLowerCase();
        if(!franchiseBoost.has(ct))franchiseBoost.set(ct,0);
        franchiseBoost.set(ct,Math.max(franchiseBoost.get(ct),item.score));
      }
    }
  }
  // Apply franchise boost
  for(const item of scored){
    if(item.score>=10&&item.a.canonicalTitle){
      const ct=item.a.canonicalTitle.toLowerCase();
      const boost=franchiseBoost.get(ct);
      if(boost&&boost>=50)item.score+=30;
    }
  }

  // Apply tag/decade filters (must-pass)
  if(tags.size>0){
    scored=scored.filter(item=>{
      const a=item.a;
      for(const tag of tags){if(!(a.tags||[]).includes(tag)&&!(a.moods||[]).includes(tag)&&!(a.vibes||[]).includes(tag)&&!(a.characterTags||[]).includes(tag))return false}
      return true;
    });
  }
  if(decades.size>0){
    scored=scored.filter(item=>{
      const a=item.a;const y=a.seasonYear||parseInt((a.date||'').slice(0,4))||0;
      for(const d of decades){if(d===2024){if(y>=2024)return true}else{const g=Math.floor(y/10)*10;if(g===d)return true}}
      return false;
    });
  }

  // Sort by score DESC, filter min threshold, limit
  scored=scored.filter(item=>item.score>0).sort((x,y)=>y.score-x.score);
  return scored.slice(0,200).map(item=>item.a);
}

function getSuggestions(q,filters){
  if(!q)return[];
  const qTokens=q.split(/[\s・\-:]+/).filter(t=>t.length>=1);
  const scored=animeData.map(a=>({a,score:scoreAnime(a,q,qTokens)})).filter(item=>item.score>0).sort((x,y)=>y.score-x.score);
  return scored.slice(0,8).map(item=>({title:item.a.cnTitle||item.a.title,score:item.a.score,link:item.a.link}));
}
