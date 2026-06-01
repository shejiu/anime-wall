// search-worker.js — Off-main-thread search engine
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

function searchAll(q,filters){
  if(!q&&(!filters.tags||filters.tags.size===0)&&(!filters.decades||filters.decades.size===0)){
    return animeData;
  }
  let data=animeData;
  // Tag AND
  if(filters.tags&&filters.tags.size>0){
    for(const tag of filters.tags){
      data=data.filter(a=>(a.tags||[]).includes(tag)||(a.moods||[]).includes(tag)||(a.vibes||[]).includes(tag)||(a.characterTags||[]).includes(tag));
    }
  }
  // Decade OR
  if(filters.decades&&filters.decades.size>0){
    data=data.filter(a=>{
      const y=a.seasonYear||parseInt((a.date||'').slice(0,4))||0;
      for(const d of filters.decades){if(d===2024){if(y>=2024)return true}else{const g=Math.floor(y/10)*10;if(g===d)return true}}
      return false;
    });
  }
  // Search
  if(q){
    data=data.filter(a=>{
      if((a.cnTitle||'').toLowerCase().includes(q))return true;
      if((a.aliases||[]).some(t=>t.toLowerCase().includes(q)))return true;
      if((a.title||'').toLowerCase().includes(q))return true;
      if((a.romaji||'').toLowerCase().includes(q))return true;
      if((a.english||'').toLowerCase().includes(q))return true;
      if((a.tags||[]).some(t=>t.toLowerCase().includes(q)))return true;
      if((a.searchPinyin||[]).some(t=>t.toLowerCase().includes(q)))return true;
      if((a.searchAbbrev||[]).some(t=>t.toLowerCase().includes(q)))return true;
      if((a.pinyinTokens||[]).length>0){
        const flat=a.pinyinTokens.join('');let qi=0;
        for(let ci=0;ci<flat.length&&qi<q.length;ci++){if(flat[ci]===q[qi])qi++}
        if(qi===q.length)return true;
      }
      return false;
    });
  }
  return data;
}

function getSuggestions(q){
  if(!q)return[];
  const results=[];
  for(const a of animeData){
    let score=0;
    if((a.cnTitle||'').toLowerCase().includes(q))score+=10;
    if((a.title||'').toLowerCase().includes(q))score+=8;
    if((a.romaji||'').toLowerCase().includes(q))score+=6;
    if((a.searchPinyin||[]).some(t=>t.toLowerCase().includes(q)))score+=4;
    if(score>0)results.push({title:a.cnTitle||a.title,score:a.score,link:a.link});
  }
  results.sort((x,y)=>y.score-x.score);
  return results.slice(0,8);
}
