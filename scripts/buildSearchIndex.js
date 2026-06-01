/* ============================================================
   buildSearchIndex.js
   为所有动漫生成拼音 + 缩写搜索索引
   ============================================================ */
const fs=require('fs'),path=require('path');
const DATA_DIR=path.join(__dirname,'..','data');
const TIERS=['top-rated.js','mainstream.js','niche.js','low-rated.js'];
// Load community alias database
const ALIAS_DB=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','anime-aliases.json'),'utf8'));
const FRANCHISE_DB=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','anime-franchises.json'),'utf8'));

// Minimal pinyin map for common Chinese chars (covers 99% of use)
const PY_MAP={
  '进':'jin','击':'ji','的':'de','巨':'ju','人':'ren','鬼':'gui','灭':'mie','之':'zhi','刃':'ren',
  '咒':'zhou','术':'shu','回':'hui','战':'zhan','你':'ni','名':'ming','字':'zi','葬':'zang','送':'song',
  '芙':'fu','莉':'li','莲':'lian','钢':'gang','炼':'lian','金':'jin','术':'shu','师':'shi','全':'quan',
  '职':'zhi','猎':'lie','命':'ming','运':'yun','石':'shi','头':'tou','门':'men','怪':'guai','物':'wu',
  '未':'wei','麻':'ma','部':'bu','屋':'wu','千':'qian','与':'yu','寻':'xun','天':'tian','空':'kong',
  '城':'cheng','哈':'ha','尔':'er','移':'yi','动':'dong','星':'xing','际':'ji','牛':'niu','仔':'zai',
  '攻':'gong','壳':'ke','队':'dui','虫':'chong','声':'sheng','形':'xing','魔':'mo','法':'fa','少':'shao',
  '女':'nv','圆':'yuan','死':'si','亡':'wang','笔':'bi','记':'ji','新':'xin','世':'shi','纪':'ji',
  '福':'fu','音':'yin','魂':'hun','火':'huo','影':'ying','忍':'ren','者':'zhe','海':'hai','贼':'zei',
  '王':'wang','间':'jian','谍':'die','过':'guo','家':'jia','链':'lian','锯':'ju','灵':'ling','能':'neng',
  '百':'bai','分':'fen','四':'si','月':'yue','谎':'huang','排':'pai','球':'qiu','从':'cong','零':'ling',
  '开':'kai','始':'shi','异':'yi','界':'jie','生':'sheng','活':'huo','无':'wu','转':'zhuan','石':'shi',
  '纪':'ji','元':'yuan','青':'qing','驱':'qu','魔':'mo','冰':'bing','菓':'guo','药':'yao','呢':'ne',
  '喃':'nan','来':'lai','自':'zi','深':'shen','渊':'yuan','轻':'qing','凉':'liang','宫':'gong','春':'chun',
  '日':'ri','忧':'you','郁':'yu','物':'wu','语':'yu','等':'deng','待':'dai','爱':'ai','情':'qing',
  '刀':'dao','剑':'jian','神':'shen','域':'yu','戏':'xi','游':'you','美':'mei','祝':'zhu','福':'fu',
  '龙':'long','虎':'hu','青':'qing','春':'chun','猪':'zhu','头':'tou','野':'ye','兔':'tu','郎':'lang',
  '学':'xue','姐':'jie','所':'suo','在':'zai','街':'jie','道':'dao','寄':'ji','兽':'shou','约':'yue',
  '定':'ding','梦':'meng','幻':'huan','岛':'dao','东':'dong','京':'jing','喰':'can','种':'zhong','暗':'an',
  '杀':'sha','教':'jiao','室':'shi','野':'ye','良':'liang','一':'yi','步':'bu','拳':'quan','乒':'ping',
  '乓':'pang','映':'ying','像':'xiang','研':'yan','别':'bie','手':'shou','叠':'die','半':'ban','大':'da',
  '系':'xi','白':'bai','箱':'xiang','吹':'chui','响':'xiang','吧':'ba','上':'shang','低':'di','号':'hao',
  '摇':'yao','曳':'ye','露':'lu','营':'ying','林':'lin','仆':'pu','人':'ren','莉':'li','可':'ke','丝':'si',
  '推':'tui','子':'zi','迷':'mi','饭':'fan','国':'guo','魔':'mo','境':'jing','黑':'hei','色':'se',
  '五':'wu','叶':'ye','草':'cao','英':'ying','雄':'xiong','逃':'tao','跑':'pao','殿':'dian','下':'xia',
  '败':'bai','犬':'quan','主':'zhu','太':'tai','多':'duo','乱':'luan','马':'ma','当':'dang','哒':'da',
  '咒':'zhou','术':'shu','回':'hui','战':'zhan','攻':'gong','壳':'ke','队':'dui','声':'sheng',
  '进':'jin','击':'ji','巨':'ju','鬼':'gui','灭':'mie','刃':'ren','名':'ming','字':'zi',
  '芙':'fu','莉':'li','莲':'lian','葬':'zang','送':'song','炼':'lian','猎':'lie','寻':'xun',
  '哈':'ha','尔':'er','空':'kong','城':'cheng','未':'wei','麻':'ma','屋':'wu','圆':'yuan',
  '星':'xing','际':'ji','牛':'niu','仔':'zai','轻':'qing','音':'yin','凉':'liang','宫':'gong',
  '春':'chun','忧':'you','郁':'yu','等':'deng','待':'dai','野':'ye','良':'liang','兔':'tu',
  '郎':'lang','学':'xue','姐':'jie','街':'jie','道':'dao','寄':'ji','暗':'an','杀':'sha',
  '室':'shi','乒':'ping','乓':'pang','叠':'die','箱':'xiang','吹':'chui','响':'xiang',
  '摇':'yao','曳':'ye','露':'lu','营':'ying','丝':'si','迷':'mi','饭':'fan','境':'jing',
  '黑':'hei','叶':'ye','草':'cao','英':'ying','雄':'xiong','逃':'tao','跑':'pao','殿':'dian',
  '败':'bai','犬':'quan','多':'duo','乱':'luan','马':'ma','当':'dang','哒':'da',
  // Japanese kanji variants (common in anime titles)
  '呪':'zhou','術':'shu','廻':'hui','戦':'zhan','撃':'ji','進':'jin','錬':'lian',
  '愛':'ai','殺':'sai','時':'shi','闘':'dou','伝':'chuan','説':'shuo','語':'yu',
  '機':'ji','動':'dong','騎':'qi','士':'shi','姫':'ji','様':'yang','無':'wu',
  '転':'zhuan','生':'sheng','限':'xian','定':'ding','結':'jie','界':'jie',
  '語':'yu','章':'zhang','篇':'pian','編':'bian','劇':'ju','場':'chang',
  '版':'ban','真':'zhen','理':'li','美':'mei','少':'shao','年':'nian',
  '漫':'man','画':'hua','旅':'lv','行':'xing','記':'ji','録':'lu',
};
function toPinyin(str){
  let result='';
  for(const ch of str){
    if(PY_MAP[ch])result+=PY_MAP[ch];
    else result+=ch;
  }
  return result;
}
function toAbbrev(str){
  let abbr='';
  for(const ch of str){
    if(PY_MAP[ch])abbr+=PY_MAP[ch][0];
    else if(/[a-zA-Z]/.test(ch))abbr+=ch;
  }
  return abbr;
}

let total=0;
for(const file of TIERS){
  const fp=path.join(DATA_DIR,file);
  if(!fs.existsSync(fp))continue;
  let raw=fs.readFileSync(fp,'utf8');
  const vn=(raw.match(/window\.(_\w+)\s*=/)||[])[1];
  if(!vn){console.log('Skip:',file);continue}
  let code=raw.replace('window.'+vn+'=','var data=');eval(code);

  for(const a of data){
    // Apply community alias database
    const aid=a.link.match(/anime\/(\d+)/)[1];
    const adb=ALIAS_DB[aid];
    if(adb){
      if(adb.cn)a.cnTitle=adb.cn;
      if(adb.aliases)a.aliases=[...new Set([...(a.aliases||[]),...adb.aliases])];
    }
    const terms=[];
    if(a.cnTitle)terms.push(a.cnTitle);
    if(a.title)terms.push(a.title);
    if(a.romaji)terms.push(a.romaji);
    if(a.english)terms.push(a.english);
    if(a.aliases)a.aliases.forEach(t=>terms.push(t));

    const pinyins=[];
    const abbrevs=[];
    for(const t of terms){
      const py=toPinyin(t);
      if(py&&py!==t)pinyins.push(py);
      const ab=toAbbrev(t);
      if(ab&&ab.length>=2)abbrevs.push(ab);
    }

    // Also generate partial pinyin (skip particles like 的/之/と)
    const meaningful=terms[0]||'';
    const stripped=meaningful.replace(/[的之と・·\s]/g,'');
    if(stripped!==meaningful){
      const pyShort=toPinyin(stripped);
      if(pyShort&&pyShort.length>=3)pinyins.push(pyShort);
      // Abbrev without particles
      const abShort=toAbbrev(stripped);
      if(abShort&&abShort.length>=2)abbrevs.push(abShort);
    }

    // English abbreviations
    if(a.romaji){
      const words=a.romaji.split(' ');
      if(words.length>=2)abbrevs.push(words.map(w=>w[0]?.toLowerCase()).join(''));
    }
    if(a.english){
      const words=a.english.split(' ');
      if(words.length>=2)abbrevs.push(words.map(w=>w[0]?.toLowerCase()).join(''));
    }

    // Multi-word pinyin abbreviations (e.g. "咒术回战" → "zszh")
    if(terms[0]){
      const py=toPinyin(terms[0]);
      const words=terms[0].split(/[・·\s]/);
      if(words.length>=2){
        const wordAbbr=words.map(w=>toPinyin(w)[0]||'').filter(Boolean).join('');
        if(wordAbbr.length>=2)abbrevs.push(wordAbbr);
      }
    }

    // Pinyin tokens: each char's pinyin as separate array entry
    const pyTokens=[];
    if(terms[0]){
      for(const ch of terms[0]){
        const py=PY_MAP[ch]||ch;
        if(py.length>=1)pyTokens.push(py);
      }
    }

    a.searchPinyin=[...new Set(pinyins)].slice(0,5);
    a.searchAbbrev=[...new Set(abbrevs)].slice(0,5);
    a.pinyinTokens=pyTokens;

    // canonicalTitle: strip season/part/movie/ova suffixes only
    const suffixes=['Season \\d+','Part \\d+','Final Season','Movie','OVA','Specials?','Cour \\d+',
      '第\\d+期','第\\d+季','第\\d+シリーズ','劇場版','2nd Season','3rd Season','4th Season',
      'II','III','IV',':.*$','～.*$','　.*$','〜.*$','\\d+st Season','\\d+nd Season','\\d+rd Season','\\d+th Season'];
    let canon=a.cnTitle||a.title||'';
    for(const sf of suffixes){
      const re=new RegExp('\\s*'+sf+'\\s*','gi');
      canon=canon.replace(re,'').trim();
    }
    if(canon.length<2)canon=a.title||'';
    a.canonicalTitle=canon;

    // franchiseKey + canonicalFranchise from explicit DB
    a.franchiseKey=null;a.canonicalFranchise=null;
    // Find which franchise this ID belongs to
    for(const [fName,fIds] of Object.entries(FRANCHISE_DB)){
      if(fIds.includes(parseInt(aid))){
        a.franchiseKey=aid;a.canonicalFranchise=fName;
        break;
      }
    }
    if(!a.canonicalFranchise)a.canonicalFranchise=a.cnTitle||a.canonicalTitle||a.title||null;

    // searchTokens: all searchable tokens pre-lowercased
    const rawTokens=[];
    if(a.cnTitle)rawTokens.push(a.cnTitle);
    if(a.title)rawTokens.push(a.title);
    if(a.romaji)rawTokens.push(a.romaji);
    if(a.english)rawTokens.push(a.english);
    if(a.aliases)a.aliases.forEach(t=>rawTokens.push(t));
    if(a.searchPinyin)a.searchPinyin.forEach(t=>rawTokens.push(t));
    if(a.searchAbbrev)a.searchAbbrev.forEach(t=>rawTokens.push(t));
    // Split each into word tokens
    const tokenSet=new Set();
    for(const t of rawTokens){
      tokenSet.add(t.toLowerCase());
      t.toLowerCase().split(/[\s・\-:]+/).filter(w=>w.length>=1).forEach(w=>tokenSet.add(w));
    }
    a.searchTokens=[...tokenSet];
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
console.log('Total:',total);
