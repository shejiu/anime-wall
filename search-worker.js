// search-worker.js — Strict weighted scoring + franchise expansion
let animeData=[];

self.onmessage=function(e){
  const {type,data,keyword,filters}=e.data;
  if(type==='INIT'){animeData=data;return}
  if(type==='SEARCH'){
    const q=(keyword||'').toLowerCase();
    const results=searchAll(q,filters||{});
    self.postMessage({type:'RESULTS',results,suggestions:getSuggestions(q)});
  }
};

// Strict weights: title >> aliases >> pinyin >> tags
function scoreAnime(a,q){
  let s=0;
  // cnTitle exact → 120
  if((a.cnTitle||'').toLowerCase()===q)s+=120;
  else if((a.cnTitle||'').toLowerCase().includes(q))s+=80;
  // canonicalFranchise
  if((a.canonicalFranchise||'').toLowerCase()===q)s+=80;
  // title
  if((a.title||'').toLowerCase()===q)s+=100;
  else if((a.title||'').toLowerCase().includes(q))s+=60;
  // aliases
  if((a.aliases||[]).some(t=>t.toLowerCase()===q))s+=60;
  else if((a.aliases||[]).some(t=>t.toLowerCase().includes(q)))s+=40;
  // romaji / english
  if((a.romaji||'').toLowerCase().includes(q))s+=30;
  if((a.english||'').toLowerCase().includes(q))s+=25;
  // pinyin / abbrev
  if((a.searchPinyin||[]).some(t=>t.toLowerCase().includes(q)))s+=20;
  if((a.searchAbbrev||[]).some(t=>t.toLowerCase().includes(q)))s+=15;
  if((a.pinyinTokens||[]).length>0){
    const flat=a.pinyinTokens.join('');let qi=0;
    for(let ci=0;ci<flat.length&&qi<q.length;ci++){if(flat[ci]===q[qi])qi++}
    if(qi===q.length)s+=18;
  }
  // tags — minimal weight
  if((a.tags||[]).some(t=>t.toLowerCase().includes(q)))s+=1;
  return s;
}

function searchAll(q,filters){
  const tags=filters.tags?new Set(filters.tags):new Set();
  const decades=filters.decades?new Set(filters.decades):new Set();
  if(!q&&tags.size===0&&decades.size===0)return animeData;
  if(!q)return filterOnly(tags,decades);

  // Phase 1: Score all entries
  const scored=animeData.map(a=>({a,score:scoreAnime(a,q)}));

  // Phase 2: Franchise expansion (only if primary score >= 80)
  const franchiseExpand=new Set();
  for(const item of scored){
    if(item.score>=80&&item.a.canonicalFranchise){
      franchiseExpand.add(item.a.canonicalFranchise);
    }
  }
  if(franchiseExpand.size>0){
    for(const item of scored){
      if(item.score<80&&item.a.canonicalFranchise&&franchiseExpand.has(item.a.canonicalFranchise)){
        item.score+=35; // franchise boost for siblings
      }
    }
  }

  // Apply tag/decade filters
  let filtered=scored;
  if(tags.size>0){filtered=filtered.filter(({a})=>{for(const t of tags){if(!(a.tags||[]).includes(t)&&!(a.moods||[]).includes(t)&&!(a.vibes||[]).includes(t)&&!(a.characterTags||[]).includes(t))return false}return true})}
  if(decades.size>0){filtered=filtered.filter(({a})=>{const y=a.seasonYear||parseInt((a.date||'').slice(0,4))||0;for(const d of decades){if(d===2024){if(y>=2024)return true}else{const g=Math.floor(y/10)*10;if(g===d)return true}}return false})}

  // Sort, threshold, dedup, limit
  const seen=new Set();
  return filtered
    .filter(item=>item.score>=20)
    .sort((x,y)=>y.score-x.score)
    .filter(item=>{if(seen.has(item.a.id))return false;seen.add(item.a.id);return true})
    .slice(0,200)
    .map(item=>item.a);
}

function filterOnly(tags,decades){
  let data=animeData;
  if(tags.size>0){for(const t of tags){data=data.filter(a=>(a.tags||[]).includes(t)||(a.moods||[]).includes(t)||(a.vibes||[]).includes(t)||(a.characterTags||[]).includes(t))}}
  if(decades.size>0){data=data.filter(a=>{const y=a.seasonYear||parseInt((a.date||'').slice(0,4))||0;for(const d of decades){if(d===2024){if(y>=2024)return true}else{const g=Math.floor(y/10)*10;if(g===d)return true}}return false})}
  return data;
}

function getSuggestions(q){
  if(!q)return[];
  const scored=animeData.map(a=>({a,score:scoreAnime(a,q)})).filter(item=>item.score>=20).sort((x,y)=>y.score-x.score).slice(0,8);
  return scored.map(item=>({title:item.a.cnTitle||item.a.title,score:item.a.score,id:item.a.id}));
}
