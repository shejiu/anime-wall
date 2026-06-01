/* ============================================================
   addCnTitles.js — 为所有 tier 数据添加 cnTitle + aliases
   ============================================================ */
const fs=require('fs'),path=require('path');
const CN_MAP=JSON.parse(fs.readFileSync(path.join(__dirname,'cnTitles.json'),'utf8'));
const DATA_DIR=path.join(__dirname,'..','data');
const TIERS=['top-rated.js','mainstream.js','niche.js','low-rated.js'];

let total=0,withCN=0;
for(const file of TIERS){
  const fp=path.join(DATA_DIR,file);
  if(!fs.existsSync(fp))continue;
  let raw=fs.readFileSync(fp,'utf8');
  // Extract variable name
  const vnMatch=raw.match(/window\.(_\w+)\s*=/);
  if(!vnMatch){console.log('Skip:',file);continue}
  const vn=vnMatch[1];
  // Replace with var for eval
  let code=raw.replace('window.'+vn+'=','var data=');
  eval(code);

  for(const a of data){
    const aid=a.link.match(/anime\/(\d+)/)[1];
    const cn=CN_MAP[aid];
    if(cn){
      a.cnTitle=cn.cn;
      a.aliases=cn.aliases;
      withCN++;
    }else{
      // Auto generate aliases from available titles
      const aliases=[];
      if(a.romaji){aliases.push(a.romaji);a.romaji.split(' ').filter(w=>w.length>2).forEach(w=>aliases.push(w))}
      if(a.english)aliases.push(a.english);
      if(a.title&&a.title.length>=2)aliases.push(a.title);
      a.cnTitle='';
      a.aliases=[...new Set(aliases)].slice(0,8);
    }
    total++;
  }

  // Rewrite
  let out=raw.slice(0,raw.indexOf('window.'+vn+'='));
  out+='window.'+vn+'=[\n';
  for(const a of data)out+='  '+JSON.stringify(a)+',\n';
  out+='];\n';
  fs.writeFileSync(fp,out);
  console.log(file+': '+data.length+' entries');
}
console.log('Total:',total,'| with CN:',withCN);
