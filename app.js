/* Appearance: honour the system by default; the toggle can pin light or dark. */
(function(){try{var a=localStorage.getItem('oncamp-appearance');if(a==='light'||a==='dark')document.documentElement.setAttribute('data-theme',a);}catch(e){}})();

/* ================= parks (embedded for instant load; refreshed from network in the background) ================= */
let PARKS=[];
let PARK_BY_ID={};
function setParks(arr){ PARKS=Array.isArray(arr)?arr:[]; PARK_BY_ID=Object.fromEntries(PARKS.map(p=>[p.id,p])); }
function loadParksEmbedded(){
  try{ setParks((window.PARKS_DATA||[])); }
  catch(e){ setParks([]); }
}
async function refreshParksFromNetwork(){
  if(window.Capacitor) return; /* the app ships its data embedded; a local file can only ever be stale */
  try{
    const res=await fetch('./parks-data.json',{cache:'no-store'});
    if(!res.ok) return;
    const fresh=await res.json();
    if(!Array.isArray(fresh)||!fresh.length) return;
    const embedded=JSON.stringify(window.PARKS_DATA||[]);
    if(JSON.stringify(fresh)===embedded) return;              // identical, nothing changed
    setParks(fresh); buildSearchIndex();
    if(!document.getElementById('view-parks').hidden) renderParks();   // only redraw home; don't disturb an open park
  }catch(e){}
}
const CG_BY_ID=id=>curPark.campgrounds.find(c=>c.id===id);
function cgSites(cg){ if(cg.sites) return cg.sites.slice(); const a=[]; for(let i=cg.from;i<=cg.to;i++)a.push(String(i)); return a; }
function keyOf(pid,cgId,site){ return pid+'#'+cgId+'#'+site; }
function cidOf(pid,cgId){ return pid+'#'+cgId; }

/* ================= state ================= */
let state={site:{},campground:{},trail:{}};
const KEY='ontario-scout-v2';
/* inside the iOS app the fishing half ships bundled at fishing/, so every link stays in the app */
const IN_APP=!!window.Capacitor||location.protocol==='capacitor:';
const FISHREG_BASE=IN_APP?'fishing/index.html':'https://katsuma0.github.io/on-fishing/';
try{ history.scrollRestoration='manual'; }catch(e){} /* every open starts at the top */
function load(){ try{ const v=localStorage.getItem(KEY); if(v) state=Object.assign({site:{},campground:{},trail:{}},JSON.parse(v)); }catch(e){}
  if(!Array.isArray(state.pins)) state.pins=[]; }
function isPinned(pid){ return Array.isArray(state.pins)&&state.pins.indexOf(pid)>=0; }
const EGG_ID='queenelizabethii';
function eggFound(){ return !!state.eggQE2; }
function parkVisible(p){ return p.id!==EGG_ID||eggFound(); }
function revealEgg(){ if(eggFound()) return; state.eggQE2=true; persist(); buildSearchIndex(); renderParks(); renderRegionRows(); buzz(12);
  showThemeToast('Hidden park revealed. Welcome to the Wildlands.'); }
function togglePin(pid){ if(!Array.isArray(state.pins)) state.pins=[]; const i=state.pins.indexOf(pid); if(i>=0) state.pins.splice(i,1); else state.pins.push(pid); persist(); }
let saveTimer=null;
function persist(){ clearTimeout(saveTimer); saveTimer=setTimeout(()=>{ try{ localStorage.setItem(KEY,JSON.stringify(state)); }catch(e){} },250); }

/* ================= photos ================= */
const DB_NAME='scout-photos', STORE='photos'; let photoKeys=new Set();
function openDB(){ return new Promise((res,rej)=>{ const r=indexedDB.open(DB_NAME,1);
  r.onupgradeneeded=()=>{ const db=r.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:'siteId'}); };
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function loadPhotoIndex(){ try{ const db=await openDB(); photoKeys=await new Promise(res=>{ const tx=db.transaction(STORE,'readonly');
  const rq=tx.objectStore(STORE).getAllKeys(); rq.onsuccess=()=>res(new Set(rq.result||[])); rq.onerror=()=>res(new Set()); }); }catch(e){ photoKeys=new Set(); } }
async function getPhotos(k){ try{ const db=await openDB(); return await new Promise(res=>{ const tx=db.transaction(STORE,'readonly');
  const rq=tx.objectStore(STORE).get(k); rq.onsuccess=()=>res(rq.result?rq.result.list:[]); rq.onerror=()=>res([]); }); }catch(e){ return []; } }
async function putPhotos(k,list){ try{ const db=await openDB(); await new Promise(res=>{ const tx=db.transaction(STORE,'readwrite');
  const st=tx.objectStore(STORE); if(list.length) st.put({siteId:k,list}); else st.delete(k); tx.oncomplete=()=>res(); tx.onerror=()=>res(); });
  if(list.length) photoKeys.add(k); else photoKeys.delete(k); }catch(e){} }
function compress(file,maxDim=1400,q=0.72){ return new Promise((res,rej)=>{ const img=new Image(),url=URL.createObjectURL(file);
  img.onload=()=>{ URL.revokeObjectURL(url); let w=img.naturalWidth,h=img.naturalHeight; const s=Math.min(1,maxDim/Math.max(w,h));
    w=Math.round(w*s); h=Math.round(h*s); const c=document.createElement('canvas'); c.width=w; c.height=h;
    c.getContext('2d').drawImage(img,0,0,w,h); res(c.toDataURL('image/jpeg',q)); };
  img.onerror=()=>{ URL.revokeObjectURL(url); rej(); }; img.src=url; }); }

/* ================= helpers ================= */
const STOPS=['#B0574A','#B27C47','#95924A','#67934F','#2E8B50','#00753A'];
function scoreColor(s){ return (typeof s==='number'&&s>=0&&s<=5)?('color-mix(in srgb, '+STOPS[s]+' 86%, var(--forest))'):null; }
function sc(type,k){ const e=state[type][k]; return (e&&typeof e.score==='number')?e.score:null; }
function noteOf(type,k){ const e=state[type][k]; return e&&e.note?e.note:''; }
function wantOf(k){ const e=state.site[k]; return !!(e&&e.want); }
let _lastBuzz=0;
function buzz(ms){
  const _n=Date.now(); if(_n-_lastBuzz<80) return; _lastBuzz=_n;
  try{ const C=window.Capacitor;
    if(C&&C.Plugins&&C.Plugins.Haptics){ C.Plugins.Haptics.impact({style:'LIGHT'}); return; }
  }catch(e){}
  try{ if(navigator.vibrate) navigator.vibrate(ms); }catch(e){} }
if(navigator.storage&&navigator.storage.persist){ try{ navigator.storage.persist(); }catch(e){} }
var DEBUG_ERRS=[];
window.addEventListener('error',function(e){ try{ DEBUG_ERRS.push((e.message||'?')+' @'+(e.lineno||'?')); }catch(x){} });
window.addEventListener('unhandledrejection',function(e){ try{ DEBUG_ERRS.push('promise: '+(e.reason&&e.reason.message||e.reason)); }catch(x){} });
document.addEventListener('click',function(e){ if(e.target&&e.target.closest&&e.target.closest('button,.site,.rrow,.fchip')) buzz(5); },{capture:true});
function cgStats(park,cg){ const ks=cgSites(cg).map(s=>keyOf(park.id,cg.id,s)); const rated=ks.filter(k=>sc('site',k)!=null);
  const avg=rated.length?rated.reduce((a,k)=>a+sc('site',k),0)/rated.length:0;
  return {total:ks.length,rated:rated.length,pct:Math.round(rated.length/ks.length*100),avg}; }
function parkStats(park){ let total=0,rated=0,sum=0;
  park.campgrounds.forEach(cg=>cgSites(cg).forEach(s=>{ total++; const v=sc('site',keyOf(park.id,cg.id,s)); if(v!=null){rated++;sum+=v;} }));
  return {total,rated,pct:total?Math.round(rated/total*100):0,avg:rated?sum/rated:0}; }

/* ================= global search ================= */
let SEARCH_CGS=[], SEARCH_TRAILS=[];
function buildSearchIndex(){ SEARCH_CGS=[]; SEARCH_TRAILS=[];
  PARKS.forEach(p=>{ p.campgrounds.forEach(cg=>{ const sites=cgSites(cg);
    SEARCH_CGS.push({parkId:p.id,parkName:p.name,cgName:cg.id,sub:cg.sub,
      siteSet:new Set(sites.map(s=>s.toLowerCase())), sitesOrig:sites}); });
    (p.trails||[]).forEach(t=>SEARCH_TRAILS.push({parkId:p.id,parkName:p.name,name:t.name,length:t.length,difficulty:t.difficulty})); }); }
function nameHit(name,q,base){ name=name.toLowerCase(); return base+(name===q?12:0)+(name.startsWith(q)?6:0); }
function searchAll(q){ q=q.trim().toLowerCase(); if(!q) return [];
  const toks=q.split(/\s+/).filter(Boolean);
  const siteTok=toks.filter(t=>/\d/.test(t)), nameTok=toks.filter(t=>!/\d/.test(t)), nameQ=nameTok.join(' ');
  const res=[];
  const STOP=['provincial','park','parks','the'];
  const pToks=nameTok.filter(t=>STOP.indexOf(t)<0);
  if(pToks.length && !siteTok.length) PARKS.forEach(p=>{ const pn=p.name.toLowerCase();
    if(pToks.every(t=>pn.includes(t)))
    res.push({type:'park',score:nameHit(p.name,pToks.join(' '),60),parkId:p.id,title:p.name,sub:((p.region||'').split(' · ').slice(1).join(' · ')||p.region)}); });
  SEARCH_CGS.forEach(c=>{ const cgN=c.cgName.toLowerCase(), hay=(c.parkName+' '+c.cgName).toLowerCase();
    if(siteTok.length){ const nameOk=!nameQ||nameTok.every(t=>hay.includes(t)); if(!nameOk) return;
      siteTok.forEach(st=>{ if(c.siteSet.has(st)){ const label=c.sitesOrig.find(s=>s.toLowerCase()===st);
        res.push({type:'site',score:(nameQ?100:40),parkId:c.parkId,cgName:c.cgName,label,title:'Site '+label,sub:c.cgName+' · '+c.parkName}); } });
    } else if(nameQ && nameTok.every(t=>cgN.includes(t))){
      res.push({type:'cg',score:nameHit(c.cgName,nameQ,80),parkId:c.parkId,cgName:c.cgName,title:c.cgName,sub:c.parkName+((c.sub||'').split(' · ')[0]?' · '+(c.sub||'').split(' · ')[0]:'')}); }
  });
  if(nameQ && !siteTok.length) SEARCH_TRAILS.forEach(t=>{ if(nameTok.every(x=>t.name.toLowerCase().includes(x)))
    res.push({type:'trail',score:nameHit(t.name,nameQ,75),parkId:t.parkId,trailName:t.name,title:t.name,sub:t.parkName+' · '+t.difficulty+' · '+fmtLen(t.length)}); });
  /* the Wildlands answers the search directly, regardless of any list filtering */
  if(!res.some(r=>r.type==='park'&&r.parkId===EGG_ID)){
    const eg=PARKS.find(p=>p.id===EGG_ID);
    if(eg){ const pn=eg.name.toLowerCase();
      const ets=nameTok.filter(t=>STOP.indexOf(t)<0);
      if(ets.length&&!siteTok.length&&ets.every(t=>pn.includes(t)))
        res.push({type:'park',score:200,parkId:eg.id,title:eg.name,
          sub:eggFound()?(((eg.region||'').split(' · ').slice(1).join(' · '))||eg.region):'Tap to discover'}); } }
  const TYPE_RANK={park:0,cg:1,site:2,trail:3};
  res.sort((a,b)=>(TYPE_RANK[a.type]-TYPE_RANK[b.type])||(b.score-a.score)); return res.slice(0,15);
}
function onGSearch(){ const gq=document.getElementById('gq'), q=gq.value;
  if(q.trim().toLowerCase()==='debugsearch'){ renderDebug(); return; }
  if(q.trim().toLowerCase()==='statsearch'){ renderStats(); return; }
  if(q.trim().toLowerCase()==='dummydata'){ renderDummyCard(''); return; }
  if(q.trim().toLowerCase()==='dummyhundop'){ renderHundCard(''); return; }
  if(q.trim().toLowerCase()==='-dummyhundop'){ renderZeroCard(''); return; }
  if(['forlaurie','for laurie','tolaurie','to laurie'].indexOf(q.trim().toLowerCase())>=0){ renderLaurie(); return; }
  document.getElementById('gsearch').classList.toggle('has',!!q.trim());
  const rbox=document.getElementById('gresults'), plist=document.getElementById('parkList'), about=document.querySelector('.about-scout');
  if(!q.trim()){ rbox.hidden=true; rbox.innerHTML=''; plist.hidden=false; if(about) about.hidden=false; return; }
  plist.hidden=true; if(about) about.hidden=true; rbox.hidden=false;
  const results=searchAll(q);
  if(!results.length){ rbox.innerHTML='<div class="gnone">No matches. Try a park, a campground, or Hemlock 112.</div>'; return; }
  const tagLabel={park:'Park',cg:'Camp',site:'Site',trail:'Trail'};
  rbox.innerHTML=results.map((r,i)=>`<button class="gresult" data-i="${i}"><span class="tag ${r.type}">${tagLabel[r.type]}</span><span class="grow"><span class="gt">${r.title}</span><span class="gs">${r.sub}</span></span></button>`).join('');
  rbox.querySelectorAll('.gresult').forEach(el=>el.addEventListener('click',()=>gotoResult(results[+el.dataset.i])));
}
function clearGSearch(){ const gq=document.getElementById('gq'); if(gq) gq.value='';
  const w=document.getElementById('gsearch'); if(w) w.classList.remove('has');
  const rb=document.getElementById('gresults'); if(rb){ rb.hidden=true; rb.innerHTML=''; }
  const pl=document.getElementById('parkList'); if(pl) pl.hidden=false;
  const ab=document.querySelector('.about-scout'); if(ab) ab.hidden=false; }
function esc(x){ return String(x).replace(/</g,'&lt;'); }
function renderConsole(cmd,pairs){
  const rbox=document.getElementById('gresults'), plist=document.getElementById('parkList'), about=document.querySelector('.about-scout');
  plist.hidden=true; if(about) about.hidden=true; rbox.hidden=false;
  rbox.innerHTML='<div class="dbg"><div class="dhead">&gt; '+esc(cmd)+'</div>'+
    pairs.map(p=>'<div class="drow"><span class="dk">'+esc(p[0])+'</span><span class="dv">'+esc(p[1])+'</span></div>').join('')+
    '</div>';
}
function renderDebug(){
  const pairs=[];
  try{ pairs.push(['parks_loaded',PARKS.length]); }catch(e){ pairs.push(['parks_loaded','ERR '+e.message]); }
  try{ pairs.push(['egg_in_data',PARKS.some(p=>p.id===EGG_ID)?'true':'FALSE']); }catch(e){ pairs.push(['egg_in_data','ERR']); }
  try{ pairs.push(['egg_found',String(eggFound())]); }catch(e){ pairs.push(['egg_found','ERR']); }
  try{ const r=searchAll('queen'); pairs.push(['searchAll("queen")',r.length+(r.length?' -> '+r[0].title:'')]); }
  catch(e){ pairs.push(['searchAll("queen")','THREW '+e.message]); }
  try{ pairs.push(['searchAll("q")',searchAll('q').length]); }catch(e){ pairs.push(['searchAll("q")','THREW']); }
  pairs.push(['capacitor',window.Capacitor?'true':'false']);
  pairs.push(['errors',DEBUG_ERRS.length?DEBUG_ERRS.slice(-3).join(' | '):'none']);
  renderConsole('debugsearch',pairs);
}
function renderDummyCard(msg){
  const rbox=document.getElementById('gresults'), plist=document.getElementById('parkList'), about=document.querySelector('.about-scout');
  plist.hidden=true; if(about) about.hidden=true; rbox.hidden=false;
  rbox.innerHTML='<div class="dbg"><div class="dhead">&gt; dummydata</div>'
    +'<div class="drow"><span class="dk">status</span><span class="dv">'+esc(msg||'ready, nothing planted')+'</span></div>'
    +'<button class="dummybtn" id="dummyGo">'+(msg?'Plant again, reshuffled':'Plant dummy data')+'</button></div>';
  const go=document.getElementById('dummyGo');
  if(go) go.addEventListener('click',()=>{ buzz(9); const m=plantDummy(); renderDummyCard(m); });
}
function renderHundCard(msg){
  const rbox=document.getElementById('gresults'), plist=document.getElementById('parkList'), about=document.querySelector('.about-scout');
  plist.hidden=true; if(about) about.hidden=true; rbox.hidden=false;
  rbox.innerHTML='<div class="dbg"><div class="dhead">&gt; dummyhundop</div>'
    +'<div class="drow"><span class="dk">status</span><span class="dv">'+esc(msg||'ready, overwrites every rating')+'</span></div>'
    +'<button class="dummybtn" id="hundGo">'+(msg?'Run again':'Max everything to 5/5')+'</button></div>';
  const go=document.getElementById('hundGo');
  if(go) go.addEventListener('click',()=>{ buzz(12); const m=plantHund(); renderHundCard(m); });
}
function renderLaurie(){
  const rbox=document.getElementById('gresults'), plist=document.getElementById('parkList'), about=document.querySelector('.about-scout');
  plist.hidden=true; if(about) about.hidden=true; rbox.hidden=false;
  rbox.innerHTML='<div class="dedic">'
    +'<div class="d-for">For Laurie</div>'
    +'<p>who introduced us to Bowser, the famous snapping turtle of Gurd Lake at Grundy.</p>'
    +'<p>You and your husband were the inspiration for this app.</p>'
    +'<p>It was a pleasure chatting with you, and I hope our paths cross again.</p>'
    +'<div class="d-sign">Katsuma</div>'
    +'</div>';
  buzz(6);
}
function renderZeroCard(msg){
  const rbox=document.getElementById('gresults'), plist=document.getElementById('parkList'), about=document.querySelector('.about-scout');
  plist.hidden=true; if(about) about.hidden=true; rbox.hidden=false;
  rbox.innerHTML='<div class="dbg"><div class="dhead">&gt; -dummyhundop</div>'
    +'<div class="drow"><span class="dk">status</span><span class="dv">'+esc(msg||'ready, the worst season imaginable')+'</span></div>'
    +'<button class="dummybtn" id="zeroGo" style="background:#B3261E">'+(msg?'Run again':'Zero everything')+'</button></div>';
  const go=document.getElementById('zeroGo');
  if(go) go.addEventListener('click',()=>{ buzz(12); const m=plantZero(); renderZeroCard(m); });
}
function plantZero(){
  let sites=0,cgs=0,trails=0,parks=0;
  PARKS.forEach(p=>{
    p.campgrounds.forEach(cg=>{ cgSites(cg).forEach(sit=>{ const k=keyOf(p.id,cg.id,sit);
        const e=state.site[k]||(state.site[k]={}); e.score=0; delete e.want; delete e.note; sites++; });
      const ck=cidOf(p.id,cg.id); const ce=state.campground[ck]||(state.campground[ck]={}); ce.score=0; delete ce.note; cgs++; });
    const pk=cidOf(p.id,p.name); const pe=state.campground[pk]||(state.campground[pk]={}); pe.score=0; delete pe.note; parks++;
    (p.trails||[]).forEach(t=>{ const k=p.id+'#'+t.name; const te=state.trail[k]||(state.trail[k]={}); te.score=0; delete te.note; trails++; });
  });
  try{ localStorage.setItem(UNLOCK_KEY,'[]'); }catch(e){}
  try{ localStorage.removeItem('site-journal-theme'); localStorage.removeItem('site-journal-theme-vars'); }catch(e){}
  try{ applyTheme('forest'); }catch(e){}
  state.eggQE2=false;
  persist(); renderParks();
  showThemeToast('Everything zeroed. A season to forget.');
  return sites+' sites, '+cgs+' cgs, '+trails+' trails, '+parks+' parks, all 0/5, nothing unlocked';
}
function plantHund(){
  let sites=0,cgs=0,trails=0,parks=0;
  PARKS.forEach(p=>{
    p.campgrounds.forEach(cg=>{ cgSites(cg).forEach(sit=>{ const k=keyOf(p.id,cg.id,sit);
        const e=state.site[k]||(state.site[k]={}); e.score=5; e.want=true; sites++; e.note='dummytext'+sites; });
      const ck=cidOf(p.id,cg.id); const ce=state.campground[ck]||(state.campground[ck]={}); ce.score=5; cgs++; ce.note='dummytext'+cgs; });
    const pk=cidOf(p.id,p.name); const pe=state.campground[pk]||(state.campground[pk]={}); pe.score=5; parks++; pe.note='dummytext'+parks;
    (p.trails||[]).forEach(t=>{ const k=p.id+'#'+t.name; const te=state.trail[k]||(state.trail[k]={}); te.score=5; trails++; te.note='dummytext'+trails; });
  });
  try{ localStorage.setItem(UNLOCK_KEY,JSON.stringify(PARK_THEMES.map(t=>t.id).filter(id=>id!==EGG_ID))); }catch(e){}
  persist(); renderParks();
  showThemeToast('Everything maxed. A perfect season.');
  return sites+' sites, '+cgs+' cgs, '+trails+' trails, '+parks+' parks, all themes';
}
function plantDummy(){
  /* clear the previous batch first so every press is a fresh randomization */
  const D=state.dummy||{site:[],campground:[],trail:[],themes:[],pins:[]};
  D.site.forEach(k=>{ delete state.site[k]; });
  D.campground.forEach(k=>{ delete state.campground[k]; });
  D.trail.forEach(k=>{ delete state.trail[k]; });
  if(Array.isArray(state.pins)) D.pins.forEach(pid=>{ const i=state.pins.indexOf(pid); if(i>=0) state.pins.splice(i,1); });
  try{ const u=getUnlocks().filter(id=>D.themes.indexOf(id)<0); localStorage.setItem(UNLOCK_KEY,JSON.stringify(u)); }catch(e){}
  const ND={site:[],campground:[],trail:[],themes:[],pins:[]};
  const MK=[43.86,-79.34];
  const skew=()=>{ const r=Math.random();
    if(r<0.02) return 0; if(r<0.06) return 1; if(r<0.15) return 2; if(r<0.35) return 3; if(r<0.75) return 4; return 5; };
  const shuffled=a=>{ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
  const distMK=p=>{ const ll=PARK_LL[p.id]||[0,0]; return havKm(MK[0],MK[1],ll[0],ll[1]); };
  const MUST=['grundy','mikisew','awenda','bonecho','silentlake','algonquincanisbay'];
  const eligible=PARKS.filter(p=>!p.dayuse&&p.id!==EGG_ID&&p.campgrounds.some(c=>cgSites(c).length)).sort((a,b)=>distMK(a)-distMK(b));
  const targetParks=Math.max(6, 5+Math.floor(Math.random()*6));
  const chosen=[]; MUST.forEach(id=>{ const p=PARK_BY_ID[id]; if(p) chosen.push(p); });
  for(const p of eligible){ if(chosen.length>=targetParks) break; if(chosen.indexOf(p)<0) chosen.push(p); }
  let siteN=0; const cgKeys=[], ratedKeys=[], perPark={};
  chosen.forEach(p=>{
    let cgs=p.campgrounds.filter(c=>cgSites(c).length&&!/backcountry/i.test(c.id));
    if(p.id==='grundy') cgs=cgs.filter(c=>/hemlock|jack/i.test(c.id));
    else if(p.id==='bonecho') cgs=cgs.filter(c=>/hardwood/i.test(c.id));
    else if(p.id==='awenda') cgs=cgs.filter(c=>/bear/i.test(c.id));
    else if(p.id==='silentlake') cgs=[shuffled(cgs)[0]];
    else if(p.id!=='algonquincanisbay') cgs=shuffled(cgs).slice(0, Math.min(cgs.length, 1+(Math.random()<0.45?1:0)));
    if(!cgs.length) return;
    const pool=[];
    cgs.forEach(cg=>{ cgKeys.push(cidOf(p.id,cg.id)); const sites=cgSites(cg); const frac=0.25+Math.random()*0.65;
      shuffled(sites).slice(0, Math.max(2, Math.round(sites.length*frac))).forEach(sit=>{
        const k=keyOf(p.id,cg.id,sit);
        if(sc('site',k)==null&&!state.site[k]){ state.site[k]={score:skew()}; ND.site.push(k); ratedKeys.push(['site',k]); siteN++;
          perPark[p.id]=(perPark[p.id]||0)+1; }
        pool.push(k); }); });
    const wc=[0,1,1,2,2,3,4][Math.floor(Math.random()*7)];
    shuffled(pool).slice(0,wc).forEach(k=>{ const e=state.site[k];
      if(e&&ND.site.indexOf(k)>=0&&!e.want) e.want=true;
      else if(!state.site[k]){ state.site[k]={want:true}; ND.site.push(k); } });
  });
  const ratedParks=Object.keys(perPark);
  /* campground level ratings, 5-10 */
  let cgN=0; shuffled(cgKeys).slice(0, 5+Math.floor(Math.random()*6)).forEach(k=>{
    if(!state.campground[k]){ state.campground[k]={score:skew()}; ND.campground.push(k); ratedKeys.push(['campground',k]); cgN++; } });
  /* trails, 5-20, from rated parks then outward */
  const trailPool=[]; eligible.forEach(p=>{ if(ratedParks.indexOf(p.id)>=0||trailPool.length<40)
    (p.trails||[]).forEach(t=>trailPool.push([p.id,p.id+'#'+t.name])); });
  let trN=0; const trTarget=5+Math.floor(Math.random()*16);
  shuffled(trailPool).slice(0,trTarget).forEach(pt=>{ const k=pt[1];
    if(!state.trail[k]){ state.trail[k]={score:skew()}; ND.trail.push(k); ratedKeys.push(['trail',k]); trN++; perPark[pt[0]]=(perPark[pt[0]]||0)+1; } });
  /* day use parks, 1-5 */
  const dayers=PARKS.filter(p=>p.dayuse&&p.id!==EGG_ID).sort((a,b)=>distMK(a)-distMK(b));
  let duN=0; dayers.slice(0, 1+Math.floor(Math.random()*5)).forEach(p=>{ const k=cidOf(p.id,p.name);
    if(!state.campground[k]){ state.campground[k]={score:skew()}; ND.campground.push(k); ratedKeys.push(['campground',k]); duN++; perPark[p.id]=(perPark[p.id]||0)+1; } });
  /* notes, 5-50, only on entries we planted */
  let ntN=0; shuffled(ratedKeys).slice(0, 5+Math.floor(Math.random()*46)).forEach(bk=>{
    const e=state[bk[0]][bk[1]]; if(e&&!e.note){ ntN++; e.note='dummytext'+ntN; } });
  /* themes 5-50: rated parks first, then random fillers, never the egg */
  const themeTarget=5+Math.floor(Math.random()*46);
  const already=getUnlocks();
  let themeIds=Object.keys(perPark).filter(id=>id!==EGG_ID&&THEME_BY_ID[id]);
  shuffled(PARK_THEMES.map(t=>t.id)).forEach(id=>{ if(themeIds.length<themeTarget&&id!==EGG_ID&&themeIds.indexOf(id)<0) themeIds.push(id); });
  themeIds=themeIds.slice(0,themeTarget);
  const newlyUnlocked=themeIds.filter(id=>already.indexOf(id)<0);
  try{ localStorage.setItem(UNLOCK_KEY,JSON.stringify(already.concat(newlyUnlocked))); }catch(e){}
  ND.themes=newlyUnlocked;
  /* pins: 3-5 of the most-rated parks */
  if(!Array.isArray(state.pins)) state.pins=[];
  const pinN=3+Math.floor(Math.random()*3);
  Object.keys(perPark).sort((a,b)=>perPark[b]-perPark[a]).slice(0,pinN).forEach(pid=>{
    if(state.pins.indexOf(pid)<0){ state.pins.push(pid); ND.pins.push(pid); } });
  state.dummy=ND; persist(); renderParks();
  showThemeToast('Dummy season planted.');
  return siteN+' sites, '+cgN+' cgs, '+trN+' trails, '+duN+' dayuse, '+ntN+' notes, '+newlyUnlocked.length+' themes, '+ND.pins.length+' pins';
}
function makeDummyDataOld(){
  const MK=[43.86,-79.34];
  const skew=()=>{ const r=Math.random();
    if(r<0.02) return 0; if(r<0.06) return 1; if(r<0.15) return 2; if(r<0.35) return 3; if(r<0.75) return 4; return 5; };
  const shuffled=a=>{ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
  const MUST=['grundy','mikisew','awenda','bonecho','silentlake','algonquincanisbay'];
  const eligible=PARKS.filter(p=>!p.dayuse&&p.id!==EGG_ID&&p.campgrounds.some(c=>cgSites(c).length));
  const byDist=eligible.slice().sort((a,b)=>{ const la=PARK_LL[a.id]||[0,0], lb=PARK_LL[b.id]||[0,0];
    return havKm(MK[0],MK[1],la[0],la[1])-havKm(MK[0],MK[1],lb[0],lb[1]); });
  const target=Math.ceil(PARKS.length*0.25);
  const chosen=[]; MUST.forEach(id=>{ const p=PARK_BY_ID[id]; if(p) chosen.push(p); });
  for(const p of byDist){ if(chosen.length>=target) break; if(chosen.indexOf(p)<0) chosen.push(p); }
  let parksTouched=0, ratings=0, wishes=0;
  chosen.forEach(p=>{
    let cgs=p.campgrounds.filter(c=>cgSites(c).length&&!/backcountry/i.test(c.id));
    if(p.id==='grundy') cgs=cgs.filter(c=>/hemlock|jack/i.test(c.id));
    else if(p.id==='bonecho') cgs=cgs.filter(c=>/hardwood/i.test(c.id));
    else if(p.id==='awenda') cgs=cgs.filter(c=>/bear/i.test(c.id));
    else if(p.id==='silentlake') cgs=[shuffled(cgs)[0]];
    else if(p.id==='algonquincanisbay'){ /* all */ }
    else cgs=shuffled(cgs).slice(0, Math.min(cgs.length, 1+(Math.random()<0.45?1:0)));
    if(!cgs.length) return;
    let touched=false; const pool=[];
    cgs.forEach(cg=>{ const sites=cgSites(cg); const frac=0.35+Math.random()*0.5;
      shuffled(sites).slice(0, Math.max(2, Math.round(sites.length*frac))).forEach(sit=>{
        const k=keyOf(p.id,cg.id,sit);
        if(sc('site',k)==null){ state.site[k]=Object.assign(state.site[k]||{},{score:skew()}); ratings++; touched=true; }
        pool.push(k); }); });
    const wc=Math.random()<0.1?(3+(Math.random()<0.5?1:0)):(1+(Math.random()<0.4?1:0));
    shuffled(pool).slice(0,wc).forEach(k=>{ const e=state.site[k]||(state.site[k]={});
      if(!e.want){ e.want=true; wishes++; } });
    if(touched) parksTouched++;
  });
  persist(); clearGSearch(); renderParks();
  showThemeToast('Dummy data planted: '+ratings+' ratings, '+wishes+' wishlists, '+parksTouched+' parks.');
  buzz(12);
}
function renderStats(){
  let sites=0,cgs=0,trails=0,dayuse=0,five=0,zero=0,notes=0,want=0,sum=0,n=0;
  const parks=new Set(), perPark={};
  ['site','campground','trail'].forEach(b=>{ const o=state[b]||{};
    for(const k in o){ const e=o[k]; if(!e) continue;
      const sv=(typeof e.score==='number')?e.score:null;
      if(e.note) notes++;
      if(b==='site'&&e.want) want++;
      if(sv==null) continue;
      const pid=k.split('#')[0], park=PARK_BY_ID[pid];
      if(b==='site') sites++;
      else if(b==='trail') trails++;
      else{ const nm=k.slice(pid.length+1); if(park&&park.dayuse&&nm===park.name) dayuse++; else cgs++; }
      parks.add(pid); perPark[pid]=(perPark[pid]||0)+1;
      sum+=sv; n++; if(sv===5) five++; if(sv===0) zero++; } });
  let topPid=null; for(const pid in perPark) if(topPid==null||perPark[pid]>perPark[topPid]) topPid=pid;
  const topName=topPid&&PARK_BY_ID[topPid]?PARK_BY_ID[topPid].name+' ('+perPark[topPid]+')':'none yet';
  const unlocked=getUnlocks().length, totalThemes=PARK_THEMES.length;
  renderConsole('statsearch',[
    ['themes_unlocked',(unlocked+1)+' / '+totalThemes],
    ['parks_rated',parks.size],
    ['campgrounds_rated',cgs],
    ['sites_rated',sites],
    ['trails_rated',trails],
    ['dayuse_rated',dayuse],
    ['notes_written',notes],
    ['photos_saved',photoKeys.size],
    ['wishlist_sites',want],
    ['parks_pinned',Array.isArray(state.pins)?state.pins.length:0],
    ['five_stars_given',five],
    ['zero_stars_given',zero],
    ['average_score',n?(sum/n).toFixed(2):'n/a'],
    ['most_scouted',topName]
  ]);
}
function gotoResult(r){ if(r.parkId===EGG_ID&&!eggFound()) revealEgg();
  clearGSearch(); openPark(r.parkId);
  if(r.type==='cg') expandCg(r.cgName);
  else if(r.type==='site'){ expandCg(r.cgName); openSheet('site',keyOf(r.parkId,r.cgName,r.label),r.cgName,r.label); }
  else if(r.type==='trail'){ openSheet('trail',trailKey(r.trailName),r.trailName); } }
function wireGlobalSearch(){ const gq=document.getElementById('gq');
  gq.addEventListener('input',onGSearch);
  document.getElementById('gclear').addEventListener('click',()=>{ clearGSearch(); gq.focus(); }); }

/* ================= parks list ================= */
var regionFilter='All';
var sortMode='Default'; try{ let sm=localStorage.getItem('site-journal-sort'); if(sm==='A to Z') sm='Default'; if(sm==='Closest to town') sm='Closest to GTA'; if(['Default','Progress','Top rated','Closest to GTA'].indexOf(sm)>=0) sortMode=sm; }catch(e){}
const SORT_MODES=['Default','Progress','Top rated','Closest to GTA'];
const GROUP_MODES=['None','Letter','Park type','Region','Rated'];
let groupMode='Region';
try{ const gm=localStorage.getItem('site-journal-group'); if(GROUP_MODES.indexOf(gm)>=0) groupMode=gm; }catch(e){}
const groupOpen={};
function groupOpenSet(){ if(!groupOpen[groupMode]) groupOpen[groupMode]=(groupMode==='Rated')?{'Rated':true}:{}; return groupOpen[groupMode]; }
function parkRatedAny(p,SM){ if(SM[p.id]&&SM[p.id].rated>0) return true;
  for(const k in state.campground){ if(k.indexOf(p.id+'#')===0&&sc('campground',k)!=null) return true; }
  for(const k in state.trail){ if(k.indexOf(p.id+'#')===0&&sc('trail',k)!=null) return true; }
  return false; }
function typeOf(p){ return p.backcountry?'Backcountry':(p.dayuse?'Day use':'Car camping'); }
function letterBuckets(parks){ const byName=parks.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const n=byName.length, per=Math.ceil(n/5), out=[];
  for(let i=0;i<n;i+=per){ const chunk=byName.slice(i,i+per);
    const a=chunk[0].name[0].toUpperCase(), z=chunk[chunk.length-1].name[0].toUpperCase();
    out.push([a===z?a:(a+' to '+z), new Set(chunk.map(p=>p.id))]); }
  return out; }

var DRIVE_H={"brontecreek":0.5,"darlington":0.75,"forksofthecredit":1.0,"monocliffs":1.25,"boynevalley":1.25,"sibbaldpoint":1.25,"earlrowe":1.25,"springwater":1.25,"shorthills":1.25,"markburnham":1.5,"wasagabeach":1.5,"mara":1.5,"mcraepoint":1.5,"basslake":1.5,"rockpoint":1.5,"devilsglen":1.75,"balsamlake":1.75,"emily":1.75,"turkeypoint":1.75,"selkirk":1.75,"presquile":1.75,"ferris":1.75,"craigleith":2.0,"awenda":2.0,"longpoint":2.0,"sixmilelake":2.0,"northbeach":2.0,"petroglyphs":2.0,"komoka":2.25,"portbruce":2.25,"portburwell":2.25,"kawarthahighlands":2.25,"pinery":2.5,"sandbanks":2.5,"silentlake":2.5,"arrowhead":2.5,"oastlerlake":2.5,"themassasauga":2.5,"johnepearce":2.5,"pointfarms":2.75,"algonquintea":2.75,"oxtongueriver":2.75,"inverhuron":3.0,"macgregorpoint":3.0,"rondeau":3.0,"bonecho":3.0,"sharbotlake":3.0,"grundy":3.0,"killbear":3.0,"mikisew":3.0,"sturgeonbay":3.0,"lakestpeter":3.0,"frontenac":3.0,"algonquincanisbay":3.0,"algonquinmew":3.0,"algonquintworivers":3.0,"saublefalls":3.25,"charlestonlake":3.25,"silverlake":3.25,"algonquinpog":3.25,"algonquinkearney":3.25,"wheatley":3.5,"murphyspoint":3.5,"restoule":3.5,"frenchriver":3.5,"algonquinraccoon":3.5,"algonquinrock":3.5,"rideauriver":3.75,"killarney":4.0,"chutes":4.0,"bonnechere":4.0,"fairbank":4.25,"fitzroy":4.25,"samueldechamplain":4.5,"martenriver":4.5,"windylake":4.5,"algonquinachray":4.5,"halfwaylake":4.75,"algonquinkiosk":4.75,"voyageur":5.0,"finlaysonpoint":5.0,"spanishriver":5.0,"driftwood":5.25,"algonquinbrent":5.5,"sturgeonriver":5.5,"obabikariver":5.75,"mississagi":6.0,"solace":6.0,"miserybay":6.0,"makobegrays":6.25,"eskerlakes":6.5,"kettlelakes":7.5,"batchawanabay":7.75,"pancakebay":8.0,"wakamilake":8.0,"lakesuperior":8.5,"ivanhoelake":8.5,"missinaibi":9.0,"potholes":9.25,"renebrunelle":9.5,"nagagamisis":10.0,"whitelake":10.5,"fushimilake":10.5,"neys":11.5,"rainbowfalls":12.0,"sleepinggiant":13.0,"macleod":13.5,"ouimetcanyon":13.5,"silverfalls":13.75,"kakabekafalls":14.0,"pigeonriver":14.5,"quetico":15.5,"sandbarlake":15.75,"aaron":16.5,"ojibway":17.0,"bluelake":17.25,"wabakimi":17.5,"pakwash":18.0,"woodlandcaribou":18.25,"siouxnarrows":18.5,"rushingriver":18.75,"caliperlake":19.25,"tidewater":null,"queenelizabethii":2.25};
var PARK_LL={"aaron":[49.77,-92.62],"algonquinachray":[45.87,-77.72],"algonquinbrent":[46.03,-78.49],"algonquincanisbay":[45.57,-78.62],"algonquinkearney":[45.54,-78.45],"algonquinkiosk":[46.09,-78.88],"algonquinmew":[45.57,-78.52],"algonquinpog":[45.57,-78.44],"algonquinraccoon":[45.53,-78.42],"algonquinrock":[45.50,-78.40],"algonquintea":[45.53,-78.70],"algonquintworivers":[45.58,-78.48],"arrowhead":[45.39,-79.20],"awenda":[44.85,-79.99],"balsamlake":[44.65,-78.93],"basslake":[44.60,-79.47],"batchawanabay":[46.93,-84.61],"bluelake":[49.86,-93.42],"bonecho":[44.90,-77.20],"bonnechere":[45.68,-77.55],"boynevalley":[44.13,-80.13],"brontecreek":[43.41,-79.77],"caliperlake":[49.06,-93.91],"charlestonlake":[44.50,-76.03],"chutes":[46.22,-81.76],"craigleith":[44.54,-80.34],"darlington":[43.87,-78.77],"devilsglen":[44.36,-80.18],"driftwood":[46.20,-77.85],"earlrowe":[44.15,-79.90],"emily":[44.38,-78.53],"eskerlakes":[48.32,-79.88],"fairbank":[46.47,-81.45],"ferris":[44.28,-77.79],"finlaysonpoint":[47.31,-79.79],"fitzroy":[45.47,-76.21],"forksofthecredit":[43.80,-80.01],"frenchriver":[46.02,-80.58],"frontenac":[44.55,-76.53],"fushimilake":[49.83,-83.92],"grundy":[45.93,-80.55],"halfwaylake":[46.90,-81.63],"inverhuron":[44.29,-81.58],"ivanhoelake":[48.13,-82.53],"johnepearce":[42.63,-81.47],"kakabekafalls":[48.40,-89.62],"kawarthahighlands":[44.73,-78.18],"kettlelakes":[48.57,-80.87],"killarney":[46.02,-81.40],"killbear":[45.36,-80.21],"komoka":[42.96,-81.42],"lakestpeter":[45.32,-78.03],"lakesuperior":[47.35,-84.63],"longpoint":[42.58,-80.39],"macgregorpoint":[44.40,-81.44],"macleod":[49.72,-86.95],"makobegrays":[47.90,-80.50],"mara":[44.60,-79.28],"markburnham":[44.31,-78.26],"martenriver":[46.73,-79.79],"mcraepoint":[44.60,-79.30],"mikisew":[45.83,-79.38],"miserybay":[45.79,-82.75],"missinaibi":[48.35,-83.68],"mississagi":[46.72,-82.66],"monocliffs":[44.03,-80.06],"murphyspoint":[44.78,-76.43],"nagagamisis":[49.47,-84.68],"neys":[48.78,-86.60],"northbeach":[43.94,-77.55],"oastlerlake":[45.29,-80.04],"obabikariver":[47.05,-80.15],"ojibway":[49.97,-92.14],"ouimetcanyon":[48.77,-88.67],"oxtongueriver":[45.41,-78.89],"pakwash":[50.77,-93.43],"pancakebay":[46.97,-84.70],"petroglyphs":[44.62,-78.05],"pigeonriver":[48.00,-89.58],"pinery":[43.25,-81.83],"pointfarms":[43.81,-81.71],"portbruce":[42.65,-81.01],"portburwell":[42.65,-80.81],"potholes":[47.96,-84.27],"presquile":[44.00,-77.73],"queenelizabethii":[44.83,-78.72],"quetico":[48.68,-91.13],"rainbowfalls":[48.84,-87.40],"renebrunelle":[49.42,-82.18],"restoule":[46.06,-79.78],"rideauriver":[45.13,-75.65],"rockpoint":[42.85,-79.54],"rondeau":[42.29,-81.85],"rushingriver":[49.68,-94.22],"samueldechamplain":[46.28,-78.92],"sandbanks":[43.90,-77.24],"sandbarlake":[49.62,-91.55],"saublefalls":[44.68,-81.26],"selkirk":[42.83,-79.94],"sharbotlake":[44.77,-76.69],"shorthills":[43.10,-79.28],"sibbaldpoint":[44.32,-79.33],"silentlake":[44.91,-78.06],"silverfalls":[48.58,-89.62],"silverlake":[44.83,-76.58],"siouxnarrows":[49.40,-94.07],"sixmilelake":[44.90,-79.77],"sleepinggiant":[48.34,-88.90],"solace":[47.10,-80.30],"spanishriver":[46.85,-81.90],"springwater":[44.43,-79.73],"sturgeonbay":[45.59,-80.42],"sturgeonriver":[46.87,-80.05],"themassasauga":[45.19,-80.05],"tidewater":[51.26,-80.63],"turkeypoint":[42.71,-80.33],"voyageur":[45.59,-74.52],"wabakimi":[50.60,-89.80],"wakamilake":[47.65,-82.80],"wasagabeach":[44.52,-80.02],"wheatley":[42.09,-82.45],"whitelake":[48.76,-85.76],"windylake":[46.61,-81.45],"woodlandcaribou":[51.10,-94.80]};
var TOWNS=[["Markham", 43.86, -79.34],["Cobourg", 43.96, -78.17],["Hamilton", 43.26, -79.87],["Newmarket", 44.06, -79.46],["Ottawa", 45.42, -75.7],["Mississauga", 43.59, -79.64],["Brampton", 43.73, -79.76],["London", 42.98, -81.25],["Vaughan", 43.84, -79.51],["Kitchener", 43.45, -80.49],["Windsor", 42.3, -83.02],["Oakville", 43.45, -79.68],["Richmond Hill", 43.88, -79.44],["Burlington", 43.33, -79.8],["Oshawa", 43.9, -78.86],["Sudbury", 46.49, -81.0],["Barrie", 44.39, -79.69],["Guelph", 43.55, -80.25],["Cambridge", 43.36, -80.31],["Whitby", 43.9, -78.94],["Kingston", 44.23, -76.49],["Ajax", 43.85, -79.02],["Milton", 43.51, -79.88],["Waterloo", 43.46, -80.52],["Thunder Bay", 48.38, -89.25],["Brantford", 43.14, -80.26],["Pickering", 43.84, -79.09],["Niagara Falls", 43.09, -79.08],["Peterborough", 44.31, -78.32],["Kanata", 45.31, -75.9],["Sault Ste. Marie", 46.52, -84.33],["Sarnia", 42.97, -82.4],["Welland", 42.99, -79.25],["Belleville", 44.16, -77.38],["North Bay", 46.31, -79.46],["Cornwall", 45.02, -74.73],["St. Catharines", 43.16, -79.25],["Woodstock", 43.13, -80.75],["St. Thomas", 42.78, -81.19],["Bowmanville", 43.91, -78.69],["Timmins", 48.48, -81.33],["Keswick", 44.24, -79.47],["Stratford", 43.37, -80.98],["Orillia", 44.61, -79.42],["Orangeville", 43.92, -80.09],["Leamington", 42.05, -82.6],["Chatham", 42.4, -82.19],["Collingwood", 44.5, -80.22],["Brockville", 44.59, -75.68],["Owen Sound", 44.57, -80.94],["Lindsay", 44.36, -78.74],["Trenton", 44.1, -77.58],["Simcoe", 42.84, -80.3],["Midland", 44.75, -79.89],["Port Hope", 43.95, -78.29],["Uxbridge", 44.11, -79.12],["Port Perry", 44.1, -78.94],["Aurora", 44.0, -79.47],["Etobicoke", 43.65, -79.57],["Scarborough", 43.77, -79.26],["North York", 43.77, -79.41],["Arnprior", 45.43, -76.36],["Atikokan", 48.76, -91.62],["Bancroft", 45.06, -77.85],["Blind River", 46.19, -82.96],["Bobcaygeon", 44.54, -78.54],["Bracebridge", 45.04, -79.31],["Brighton", 44.04, -77.73],["Carleton Place", 45.14, -76.14],["Chapleau", 47.84, -83.4],["Cochrane", 49.07, -81.02],["Colborne", 44.01, -77.89],["Dryden", 49.78, -92.84],["Elliot Lake", 46.38, -82.65],["Espanola", 46.26, -81.77],["Fenelon Falls", 44.53, -78.74],["Fort Frances", 48.61, -93.4],["Gananoque", 44.33, -76.16],["Goderich", 43.74, -81.71],["Gravenhurst", 44.92, -79.37],["Haliburton", 45.05, -78.51],["Hearst", 49.69, -83.67],["Huntsville", 45.33, -79.22],["Ignace", 49.41, -91.66],["Kapuskasing", 49.42, -82.43],["Kenora", 49.77, -94.49],["Kirkland Lake", 48.15, -80.03],["Marathon", 48.72, -86.38],["Minden", 44.93, -78.73],["Moosonee", 51.27, -80.65],["Napanee", 44.25, -76.95],["New Liskeard", 47.51, -79.68],["Nipigon", 49.02, -88.27],["Parry Sound", 45.35, -80.03],["Pembroke", 45.83, -77.11],["Perth", 44.9, -76.25],["Petawawa", 45.89, -77.28],["Picton", 44.0, -77.14],["Red Lake", 51.03, -93.83],["Renfrew", 45.47, -76.68],["Sioux Lookout", 50.1, -91.92],["Smiths Falls", 44.9, -76.02],["Sturgeon Falls", 46.37, -79.93],["Temagami", 47.06, -79.78],["Terrace Bay", 48.78, -87.1],["Tillsonburg", 42.86, -80.73],["Wasaga Beach", 44.52, -80.02],["Wawa", 47.99, -84.77]];
var ORIGIN=null; try{ ORIGIN=JSON.parse(localStorage.getItem('site-journal-origin')||'null'); }catch(e){}
function havKm(a,b,c,d){ var R=6371,dl=(c-a)*Math.PI/180,dg=(d-b)*Math.PI/180;
  var x=Math.sin(dl/2)*Math.sin(dl/2)+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dg/2)*Math.sin(dg/2);
  return 2*R*Math.asin(Math.sqrt(x)); }
function townHours(p){ if(DRIVE_H[p.id]===null) return null; var ll=PARK_LL[p.id]; if(!ll||!ORIGIN) return undefined;
  var h=havKm(ORIGIN.lat,ORIGIN.lon,ll[0],ll[1])*1.3/82; return Math.max(0.25,Math.round(h*4)/4); }
function fmtDrive(h){ var m=Math.round(h*60),Hh=Math.floor(m/60),M=m%60;
  return (Hh?Hh+' h':'')+(Hh&&M?' ':'')+(M?M+' min':'')+' drive'; }
function driveLabel(p){ const h=DRIVE_H[p.id]; if(h==null) return 'No road access';
  return fmtDrive(h); }
function townLabel(p){ var h=townHours(p); if(h===null) return 'No road access'; if(h===undefined) return ''; return fmtDrive(h); }
function broadOf(p){ return (p.region||'').split(' \u00b7 ')[0].replace(' Park','').trim()||'Other'; }
function regionOrder(){ const found=new Set(PARKS.map(broadOf));
  const order=['All','Algonquin','Central','Near North','Northern','Southeast','Southwest'].filter(r=>r==='All'||found.has(r));
  found.forEach(r=>{ if(order.indexOf(r)<0) order.push(r); }); return order; }
function renderFilters(){ const b=document.getElementById('regionPill'); if(!b) return;
  const ch=' <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="m6 9 6 6 6-6"/></svg>';
  b.innerHTML='<span class="fct">'+(regionFilter==='All'?'All regions':regionFilter)+'</span>'+ch;
  b.classList.toggle('on', regionFilter!=='All');
  const sb=document.getElementById('sortPill'); if(!sb) return;
  sb.innerHTML='<span class="fct">'+(sortMode==='Default'?'Sort':(sortMode==='Closest to GTA'&&ORIGIN?('From '+ORIGIN.name):sortMode))+'</span>'+ch;
  sb.classList.toggle('on', sortMode!=='Default');
  const gb=document.getElementById('groupPill'); if(!gb) return;
  gb.innerHTML='<span class="fct">'+(groupMode==='None'?'Group by':groupMode)+'</span>'+ch;
  gb.classList.toggle('on', groupMode!=='None');
  if(sortMode==='Closest to GTA'&&ORIGIN){
    const f=sb.querySelector('.fct');
    if(f){ void sb.offsetWidth; /* force layout so the measurement is real */
      if(f.scrollWidth>f.clientWidth) f.textContent=ORIGIN.name;
      if(f.scrollWidth>f.clientWidth) f.textContent=ORIGIN.name.split(' ')[0]; } } }
function renderSortRows(){ const box=document.getElementById('sortRows'); if(!box) return; box.innerHTML='';
  SORT_MODES.forEach(m=>{ const b=document.createElement('button'); b.className='rrow'+(m===sortMode?' on':'');
    const disp=(m==='Closest to GTA')?('Closest to '+(ORIGIN?ORIGIN.name:'GTA')):m;
    const hint=m==='Default'?'A to Z':(m==='Progress'?'Most scouted':(m==='Top rated'?'Highest average':'Driving time'));
    b.innerHTML='<span>'+disp+'</span><span class="rcount">'+hint+'</span>';
    b.addEventListener('click',()=>{ sortMode=m; try{localStorage.setItem('site-journal-sort',m);}catch(e){} buzz(9); closeSort(); renderFilters(); renderParks(); });
    box.appendChild(b); });
  const tb=document.createElement('button'); tb.className='rrow';
  tb.innerHTML='<span>Departure</span><span class="rcount">'+(ORIGIN?ORIGIN.name:'Toronto (GTA)')+'</span>';
  tb.addEventListener('click',()=>{ buzz(6); closeSort(); openTown(); });
  box.appendChild(tb); }
function openTown(){ settingsBackdrop.classList.add('on'); const ts=document.getElementById('townSheet');
  ts.classList.add('on'); ts.scrollTop=0; lockScroll();
  const q=document.getElementById('townQ'); q.value=''; renderTownList(''); setTimeout(()=>q.focus(),360); }
function closeTown(){ const ts=document.getElementById('townSheet'); settingsBackdrop.classList.remove('on');
  ts.classList.remove('on'); ts.style.transform=''; unlockScroll();
  const q=document.getElementById('townQ'); if(q) q.blur(); }
function renderTownList(q){ const list=document.getElementById('townList'); q=(q||'').trim().toLowerCase();
  const all=[['Toronto (GTA)',0,0]].concat(TOWNS);
  const hits=q?all.filter(t=>t[0].toLowerCase().indexOf(q)>=0).slice(0,20):all;
  list.innerHTML='';
  hits.forEach(t=>{ const b=document.createElement('button'); b.className='rrow';
    b.innerHTML='<span>'+t[0]+'</span>';
    b.addEventListener('click',()=>{
      if(t[0]==='Toronto (GTA)'){ ORIGIN=null; try{localStorage.removeItem('site-journal-origin');}catch(e){} }
      else{ ORIGIN={name:t[0],lat:t[1],lon:t[2]}; try{localStorage.setItem('site-journal-origin',JSON.stringify(ORIGIN));}catch(e){} }
      sortMode='Closest to GTA'; try{localStorage.setItem('site-journal-sort',sortMode);}catch(e){}
      buzz(9); closeTown(); renderFilters(); renderParks(); });
    list.appendChild(b); }); }
(function(){ const q=document.getElementById('townQ'); if(q) q.addEventListener('input',()=>renderTownList(q.value)); })();
function renderGroupRows(){ const box=document.getElementById('groupRows'); if(!box) return; box.innerHTML='';
  GROUP_MODES.forEach(m=>{ const b=document.createElement('button'); b.className='rrow'+(m===groupMode?' on':'');
    const hint=m==='None'?'One long list':(m==='Letter'?'Five alphabet sections':(m==='Park type'?'Car camp, day use, backcountry':(m==='Region'?'Six broad regions':'Rated parks first')));
    b.innerHTML='<span>'+m+'</span><span class="rcount">'+hint+'</span>';
    b.addEventListener('click',()=>{ groupMode=m; try{localStorage.setItem('site-journal-group',m);}catch(e){} buzz(9); closeGroup(); renderFilters(); renderParks(); });
    box.appendChild(b); }); }
function openGroup(){ renderGroupRows(); settingsBackdrop.classList.add('on'); const gs=document.getElementById('groupSheet'); gs.classList.add('on'); gs.scrollTop=0; lockScroll(); }
function closeGroup(){ const gs=document.getElementById('groupSheet'); settingsBackdrop.classList.remove('on'); gs.classList.remove('on'); gs.style.transform=''; unlockScroll(); }
function openSort(){ renderSortRows(); settingsBackdrop.classList.add('on'); document.getElementById('sortSheet').classList.add('on'); document.getElementById('sortSheet').scrollTop=0; lockScroll(); }
function closeSort(){ const ss=document.getElementById('sortSheet'); settingsBackdrop.classList.remove('on'); ss.classList.remove('on'); ss.style.transform=''; unlockScroll(); }
function renderRegionRows(){ const box=document.getElementById('regionRows'); if(!box) return; box.innerHTML='';
  const rows=['All','Pinned'].concat(regionOrder().filter(r=>r!=='All'));
  rows.forEach(r=>{ const n=(r==='All')?PARKS.length:(r==='Pinned')?PARKS.filter(p=>isPinned(p.id)).length:PARKS.filter(p=>broadOf(p)===r).length;
    const b=document.createElement('button'); b.className='rrow'+(r===regionFilter?' on':'');
    b.innerHTML='<span>'+(r==='All'?'All regions':r)+'</span><span class="rcount tnum">'+n+'</span>';
    b.addEventListener('click',()=>{ regionFilter=r; buzz(9); closeRegion(); renderFilters(); renderParks(); });
    box.appendChild(b); }); }
function openRegion(){ renderRegionRows(); settingsBackdrop.classList.add('on'); document.getElementById('regionSheet').classList.add('on'); document.getElementById('regionSheet').scrollTop=0; lockScroll(); }
function closeRegion(){ const rs=document.getElementById('regionSheet'); settingsBackdrop.classList.remove('on'); rs.classList.remove('on'); rs.style.transform=''; unlockScroll(); }
function metaLine(p,st){ const isAlg=(p.region||'').indexOf('Algonquin')===0;
  const town=((p.region||'').split(' · ').slice(1).join(' · ')||p.region);
  const segs=[];
  if(sortMode==='Closest to GTA') segs.push(ORIGIN?(townLabel(p)||driveLabel(p)):driveLabel(p));
  if(p.backcountry){ segs.push(town); const n=p.campgrounds.length; if(n>1) segs.push(n+' campgrounds'); if(st.total>0) segs.push(st.total+' sites'); segs.push('Backcountry'); }
  else if(p.dayuse){ segs.push(town); segs.push('Day use'); }
  else if(isAlg){ if(regionFilter!=='Algonquin') segs.push('Algonquin'); segs.push(st.total+' sites'); }
  else { segs.push(town); const n=p.campgrounds.length; segs.push(n+' campground'+(n===1?'':'s')); segs.push(st.total+' sites'); }
  return segs.map(x=>'<span>'+x+'</span>').join('<span>·</span>'); }
function renderParks(){ const box=document.getElementById('parkList'); box.innerHTML='';
  if(!PARKS.length){ box.innerHTML=`<div class="empty" style="border:1px solid var(--line);border-radius:var(--r);background:var(--card);padding:26px 18px">No park data loaded.<br>Add parks in the SQL pipeline, run <b>export_to_app.py</b>, and place <b>parks-data.json</b> next to this app.</div>`; return; }
  const idx=new Map(PARKS.map((p,i)=>[p.id,i]));
  const shown=(regionFilter==='All')?PARKS.slice():(regionFilter==='Pinned')?PARKS.filter(p=>isPinned(p.id)):PARKS.filter(p=>broadOf(p)===regionFilter);
  const SM={}; shown.forEach(p=>SM[p.id]=parkStats(p));
  const dflt=(a,b)=>a.name.localeCompare(b.name)||(idx.get(a.id)-idx.get(b.id));
  let cmp=dflt;
  if(sortMode==='Closest to GTA') cmp=(a,b)=>{ const ha=ORIGIN?townHours(a):DRIVE_H[a.id], hb=ORIGIN?townHours(b):DRIVE_H[b.id];
    return ((ha==null?999:ha)-(hb==null?999:hb))||dflt(a,b); };
  else if(sortMode==='Progress') cmp=(a,b)=>{ const x=SM[a.id],y=SM[b.id];
    const fx=x.total?x.rated/x.total:0, fy=y.total?y.rated/y.total:0;
    return (fy-fx)||(y.rated-x.rated)||dflt(a,b); };
  else if(sortMode==='Top rated') cmp=(a,b)=>{ const x=SM[a.id],y=SM[b.id];
    const ax=x.rated?x.avg:-1, ay=y.rated?y.avg:-1; return (ay-ax)||dflt(a,b); };
  shown.sort((a,b)=>((isPinned(a.id)?0:1)-(isPinned(b.id)?0:1))||cmp(a,b));
  const makeCard=p=>{ const st=SM[p.id];
    let started=st.rated>0, fracTxt=st.rated+'/'+st.total, pct=st.pct;
    if(p.dayuse){ const pr=sc('campground',cidOf(p.id,p.name));
      started=pr!=null; fracTxt='1/1'; pct=100; }
    const b=document.createElement('button'); b.className='park-card';
    b.innerHTML=`${isPinned(p.id)?'<span class="pc-pinb"><svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 16v6" fill="none"/><path d="M9 3h6v4l2 5H7l2-5z"/></svg></span>':''}<div class="pc-top"><span class="pc-name">${p.name}</span>${started?`<span class="pc-pct tnum">${fracTxt}</span>`:''}</div>
      <div class="pc-meta">${metaLine(p,st)}</div>
      ${started?`<div class="pc-bar"><i style="width:${pct}%"></i></div>`:''}`;
    if(p.id===EGG_ID&&!eggFound()) b.classList.add('ghostpark');
    b.addEventListener('click',()=>openPark(p.id)); return b; };
  if(groupMode==='None'){ shown.forEach(p=>box.appendChild(makeCard(p))); return; }
  let sections=[];
  if(groupMode==='Letter'){ const bk=letterBuckets(shown.filter(p=>p.id!==EGG_ID||eggFound()));
    sections=bk.map(b=>[b[0], shown.filter(p=>b[1].has(p.id))]); }
  else if(groupMode==='Park type'){ ['Car camping','Day use','Backcountry'].forEach(t=>sections.push([t, shown.filter(p=>typeOf(p)===t)])); }
  else if(groupMode==='Region'){ regionOrder().filter(r=>r!=='All').forEach(r=>sections.push([r, shown.filter(p=>broadOf(p)===r)])); }
  else if(groupMode==='Rated'){ const yes=shown.filter(p=>parkRatedAny(p,SM)), no=shown.filter(p=>!parkRatedAny(p,SM));
    sections=[['Rated',yes],['Not yet rated',no]]; }
  const open=groupOpenSet();
  sections.forEach(sec=>{ const label=sec[0], parks=sec[1].filter(p=>p.id!==EGG_ID||eggFound());
    if(!parks.length) return;
    const isOpen=!!open[label];
    const h=document.createElement('button'); h.className='gsec'+(isOpen?' open':'');
    h.innerHTML='<span>'+label+'</span><span class="gs-right"><span class="gs-count tnum">'+parks.length+'</span><svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg></span>';
    h.addEventListener('click',()=>{ open[label]=!open[label]; buzz(6); renderParks(); });
    box.appendChild(h);
    if(isOpen) parks.forEach(p=>box.appendChild(makeCard(p))); }); }

/* ================= single park ================= */
let curPark=null; var homeScrollY=0;
function facilChip(name){ return `<span class="facil"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l4 4 10-10"/></svg>${name}</span>`; }
function openPark(pid){
  curPark=PARK_BY_ID[pid]; const p=curPark; const st=parkStats(p);
  document.getElementById('parkBody').innerHTML=`
    <div class="park-head"><div class="titlerow"><h2 id="parkTitle" style="cursor:pointer">${(p.region||'').indexOf('Algonquin')===0?p.name+', Algonquin':p.name}</h2><button class="pinbtn${isPinned(p.id)?' on':''}" id="pinBtn" aria-label="Pin park"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 16v6"/><path d="M9 3h6v4l2 5H7l2-5z"/></svg></button></div>
      <button class="about-toggle" id="aboutToggle" aria-expanded="false">About ${p.name}<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 9 6 6 6-6"/></svg></button>
      <div class="about-body" id="aboutBody" hidden>
        <div class="blurb">${p.blurb}</div>
        <div class="facils">${p.facilities.map(facilChip).join('')}</div>
        <div class="fishing"><b>Fishing:</b> ${p.fishing}</div>
        ${(m=>m?`<a class="fmz" href="${FISHREG_BASE}#zone=${m[1]}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 12c-4 4-8 4-14 0 6-4 10-4 14 0Zm0 0 3-3m-3 3 3 3"/><circle cx="8.5" cy="11.5" r=".5" fill="currentColor"/></svg>FMZ ${m[1]} - ONfishingreg \u2197</a>`:`<div class="fmz"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 12c-4 4-8 4-14 0 6-4 10-4 14 0Zm0 0 3-3m-3 3 3 3"/><circle cx="8.5" cy="11.5" r=".5" fill="currentColor"/></svg>${p.fmz}</div>`)((p.fmz||'').match(/FMZ\s*(\d+)/))}
                <a class="fmz" href="${p.url}" target="_blank" rel="noopener"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4h6v6M20 4 10 14"/><path d="M9 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/></svg>Official park page \u2197</a>
      </div>
    </div>
    <div class="seclabel">${p.dayuse?'Rating':'Park rating'}</div>
    <button class="trail" id="parkRate"><div class="tr-left"><div class="tr-name">Rate this park</div></div><span class="tr-rate" id="prVal" hidden></span></button>
    ${p.dayuse?'':'<div class="seclabel">Campgrounds</div>'}
    <div id="cgs"></div>

    ${(p.trails&&p.trails.length)?'<div class="seclabel">Trails</div><div id="trails"></div>':''}
    <div id="wantSection" hidden><div class="seclabel">Wishlist</div><div id="wantList"></div></div>
    <div id="topSection" hidden><div class="seclabel">Top sites</div><ul class="rank" id="topSites"></ul></div>
    ${p.dayuse?'':`<div id="statsWrap" hidden><div class="seclabel">Stats</div>
    <details class="statscard"><summary>Park stats<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 9 6 6 6-6"/></svg></summary><div class="statsbody" id="statsBody"></div></details></div>`}
`;
  renderCgs(); renderTrails(); wireParkControls(); updatePark(); renderGlance();
  document.getElementById('parkTitle').addEventListener('click',function(){ onParkNameTap(p); });
  homeScrollY=window.scrollY||document.documentElement.scrollTop||0;
  document.getElementById('view-parks').hidden=true; const vp=document.getElementById('view-park'); vp.hidden=false;
  vp.classList.remove('view-anim'); void vp.offsetWidth; vp.classList.add('view-anim'); window.scrollTo(0,0);
  if(window.parkResetSync) parkResetSync();
  requestAnimationFrame(()=>{ window.scrollTo(0,0); document.documentElement.scrollTop=0; document.body.scrollTop=0; });
}
function goHome(){ const vp=document.getElementById('view-park');
  vp.classList.add('view-out');
  setTimeout(function(){ vp.classList.remove('view-out'); vp.hidden=true;
    const vh=document.getElementById('view-parks'); vh.hidden=false;
    vh.classList.remove('view-anim'); void vh.offsetWidth; vh.classList.add('view-anim');
    clearGSearch(); renderParks(); window.scrollTo(0,homeScrollY); if(window.parkResetSync) parkResetSync(); },150); }
document.getElementById('backBtn').addEventListener('click',function(){
  /* one clean slide, the same the swipe uses; never the double animation */
  if(window.sjExitPark){ window.sjExitPark(); } else { goHome(); } });
(function(){
  const rb=document.getElementById('resetBtn');
  if(rb){ let armed=false, t=null;
    rb.addEventListener('click',function(){
      if(!armed){ armed=true; rb.classList.add('armed'); rb.textContent='Tap again to erase everything';
        t=setTimeout(function(){ armed=false; rb.classList.remove('armed'); rb.textContent='Reset all data'; },4000); return; }
      clearTimeout(t);
      try{ localStorage.removeItem(KEY); }catch(e){}
      ['site-journal-theme','site-journal-theme-vars','site-journal-unlocks','site-journal-sort','site-journal-origin'].forEach(function(k){ try{ localStorage.removeItem(k); }catch(e){} });
      try{ indexedDB.deleteDatabase('scout-photos'); }catch(e){}
      /* land back at the very top, exactly like a fresh open */
      try{ history.scrollRestoration='manual'; }catch(e){}
      homeScrollY=0; window.scrollTo(0,0);
      setTimeout(function(){ location.reload(); },200); }); }
  const pb=document.getElementById('resetBtnPark');
  if(pb){ let armed=false, t=null;
    window.parkResetSync=function(){ armed=false; clearTimeout(t); pb.classList.remove('armed');
      pb.textContent=curPark?('Reset '+curPark.name+' data'):''; };
    pb.addEventListener('click',async function(){ if(!curPark) return;
      if(!armed){ armed=true; pb.classList.add('armed'); pb.textContent='Tap again to erase this park';
        t=setTimeout(function(){ window.parkResetSync(); },4000); return; }
      clearTimeout(t); await wipeParkData(curPark.id); window.parkResetSync(); });
    window.parkResetSync(); }
})();
(function(){ /* backup: the whole journal travels as one JSON file, ratings, notes, photos, themes and all */
  var BK_KEYS=['ontario-scout-v2','site-journal-theme','site-journal-theme-vars','site-journal-unlocks','site-journal-sort','site-journal-group','site-journal-origin'];
  var eb=document.getElementById('exportBtn'), ib=document.getElementById('importBtn'), fi=document.getElementById('importInput');
  if(!eb||!ib||!fi) return;
  function allPhotos(){ return openDB().then(function(db){ return new Promise(function(res){ var tx=db.transaction(STORE,'readonly');
    var rq=tx.objectStore(STORE).getAll(); rq.onsuccess=function(){ res(rq.result||[]); }; rq.onerror=function(){ res([]); }; }); }).catch(function(){ return []; }); }
  function buildBackup(){ return allPhotos().then(function(rows){
    var photos={}; rows.forEach(function(r){ if(r&&r.siteId&&Array.isArray(r.list)&&r.list.length) photos[r.siteId]=r.list; });
    var data={}; BK_KEYS.forEach(function(k){ try{ var v=localStorage.getItem(k); if(v!=null) data[k]=v; }catch(e){} });
    return {app:'site-journal',format:1,appVersion:'0.179',exported:new Date().toISOString(),data:data,photos:photos}; }); }
  function backupName(){ var d=new Date(); function p(n){ return (n<10?'0':'')+n; }
    return 'site-journal-backup-'+d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'.json'; }
  function exportDone(){ showThemeToast('Backup exported. Keep it somewhere safe.'); }
  function downloadFile(file){ if(window.Capacitor){ showThemeToast('Sharing is not available right now. Try again.'); return; }
    var url=URL.createObjectURL(file); var a=document.createElement('a'); a.href=url; a.download=file.name;
    document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); },1200); exportDone(); }
  function deliver(file){
    if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
      return navigator.share({files:[file]}).then(exportDone).catch(function(err){ if(err&&err.name==='AbortError') return; downloadFile(file); }); }
    downloadFile(file); return Promise.resolve(); }
  eb.addEventListener('click',function(){ if(eb.disabled) return; eb.disabled=true;
    buildBackup().then(function(payload){ var file=new File([JSON.stringify(payload)],backupName(),{type:'application/json'}); return deliver(file); })
      .catch(function(){ showThemeToast('Could not build the backup. Try again.'); })
      .then(function(){ eb.disabled=false; }); });
  var pendingPayload=null, armT=null;
  function disarmImport(){ pendingPayload=null; clearTimeout(armT); ib.classList.remove('armed'); ib.textContent='Import a backup'; }
  ib.addEventListener('click',function(){
    if(pendingPayload){ clearTimeout(armT); applyBackup(pendingPayload); pendingPayload=null; return; }
    fi.value=''; fi.click(); });
  fi.addEventListener('change',function(){
    var f=fi.files&&fi.files[0]; if(!f) return;
    f.text().then(function(txt){ var p=null; try{ p=JSON.parse(txt); }catch(e){}
      if(!p||p.app!=='site-journal'||!p.data||typeof p.data['ontario-scout-v2']!=='string'){ showThemeToast('That file is not a Site Journal backup.'); return; }
      var n=0; try{ var s=JSON.parse(p.data['ontario-scout-v2']);
        ['site','campground','trail'].forEach(function(t){ var m=s&&s[t]||{}; for(var k in m){ if(m[k]&&typeof m[k].score==='number') n++; } }); }catch(e){}
      pendingPayload=p; ib.classList.add('armed');
      ib.textContent='Tap again to restore '+n+(n===1?' rating':' ratings');
      armT=setTimeout(disarmImport,6000); })
      .catch(function(){ showThemeToast('Could not read that file.'); }); });
  function applyBackup(p){
    try{ clearTimeout(saveTimer); }catch(e){}
    BK_KEYS.forEach(function(k){ try{ if(typeof p.data[k]==='string') localStorage.setItem(k,p.data[k]); else localStorage.removeItem(k); }catch(e){} });
    var photos=(p.photos&&typeof p.photos==='object')?p.photos:{};
    openDB().then(function(db){ return new Promise(function(res){ var tx=db.transaction(STORE,'readwrite'); var st=tx.objectStore(STORE); st.clear();
      Object.keys(photos).forEach(function(k){ var list=photos[k]; if(Array.isArray(list)&&list.length) st.put({siteId:k,list:list}); });
      tx.oncomplete=function(){ res(); }; tx.onerror=function(){ res(); }; }); }).catch(function(){})
      .then(function(){ showThemeToast('Backup restored. Welcome back.'); setTimeout(function(){ location.reload(); },900); }); }
})();
(function(){ /* interactive drag-back: the park page follows your finger and reveals home underneath */
  var vp=document.getElementById('view-park'), vh=document.getElementById('view-parks');
  var sx=0, sy=0, dx=0, lastX=0, lastT=0, vel=0, deciding=false, dragging=false, parkScrollY=0;
  function prep(){ parkScrollY=window.scrollY||document.documentElement.scrollTop||0;
    vp.classList.remove('view-anim'); vp.classList.add('dragback'); vp.style.top=(-parkScrollY)+'px';
    vh.hidden=false; window.scrollTo(0,homeScrollY); }
  function cancel(){ vp.style.transition='transform .32s cubic-bezier(.22,1.28,.36,1)'; vp.style.transform='translateX(0)';
    setTimeout(function(){ window.scrollTo(0,parkScrollY); vh.hidden=true;
      vp.style.transition=''; vp.style.transform=''; vp.style.top=''; vp.classList.remove('dragback'); },230); }
  function complete(){ buzz(9);
    vp.style.transition='transform .26s cubic-bezier(.32,.72,.35,1)'; vp.style.transform='translateX(105%)';
    setTimeout(function(){ vp.style.transition=''; vp.style.transform=''; vp.style.top=''; vp.classList.remove('dragback'); vp.hidden=true;
      clearGSearch(); renderParks(); window.scrollTo(0,homeScrollY); if(window.parkResetSync) parkResetSync(); },190); }
  /* the back button uses this same single slide, so it never animates twice */
  window.sjExitPark=function(){ if(vp.hidden) return;
    prep();
    vp.style.transition='none'; vp.style.transform='translateX(0)';
    void vp.offsetWidth;   /* commit the start frame so the slide always animates */
    complete(); };
  vp.addEventListener('touchstart',function(e){ if(e.touches.length!==1) return;
    sx=e.touches[0].clientX; sy=e.touches[0].clientY; lastX=sx; lastT=Date.now(); vel=0; dx=0; deciding=true; dragging=false; },{passive:true});
  vp.addEventListener('touchmove',function(e){ if(!deciding&&!dragging) return;
    var x=e.touches[0].clientX, y=e.touches[0].clientY; dx=x-sx; var dy=y-sy;
    if(deciding){ if(Math.abs(dx)>8||Math.abs(dy)>8){ deciding=false;
      if(dx>0&&Math.abs(dx)>Math.abs(dy)*1.2){ dragging=true; prep(); } } }
    if(dragging){ e.preventDefault();
      var now=Date.now(); if(now>lastT) vel=(x-lastX)/(now-lastT); lastX=x; lastT=now;
      vp.style.transition='none'; vp.style.transform='translateX('+Math.max(0,dx)+'px)'; } },{passive:false});
  vp.addEventListener('touchend',function(){ if(!dragging){ deciding=false; return; }
    dragging=false;
    if(dx>window.innerWidth*0.33||vel>0.55) complete(); else cancel(); });
  vp.addEventListener('touchcancel',function(){ if(dragging){ dragging=false; cancel(); } deciding=false; });
})();

function renderCgs(){ const box=document.getElementById('cgs'); box.innerHTML=''; const p=curPark;
  p.campgrounds.forEach(cg=>{ const st=cgStats(p,cg), own=sc('campground',cidOf(p.id,cg.id)), col=scoreColor(own);
    const card=document.createElement('div'); card.className='cg'; card.dataset.cg=cg.id;
    card.innerHTML=`
      <button class="cg-row" data-toggle>
        <div class="cg-left"><div class="cg-name">${cg.id}</div><div class="cg-sub">${(cg.sub||'').split(' · ').slice(0,2).join(' · ')}</div></div>
        <div class="cg-right"><div class="cg-prog" ${st.rated>0?'':'hidden'}><div class="bar"><i style="width:${st.pct}%"></i></div><div class="lbl tnum">${st.rated}/${st.total}</div></div>
        <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 9 6 6 6-6"/></svg></div>
      </button>
      <div class="cg-body"><div class="cg-body-head"><span class="cg-desc">${cgSites(cg).length} sites</span>
        <button class="cg-rate ${col?'rated':''}" ${col?`style="background:${col}"`:''} data-cgrate>${col?`Campground · ${own}/5`:'Rate campground'}</button></div>
        <div class="grid"></div></div>`;
    card.querySelector('[data-toggle]').addEventListener('click',()=>{ const opening=!card.classList.contains('open'); card.classList.toggle('open'); if(opening) fillGrid(card); });
    card.querySelector('[data-cgrate]').addEventListener('click',e=>{ e.stopPropagation(); openSheet('campground',cidOf(p.id,cg.id),cg.id,null); });
    box.appendChild(card); });
  if(p.campgrounds.length===1){ const only=box.querySelector('.cg'); if(only){ only.classList.add('open'); fillGrid(only); } } }
function fillGrid(card){ if(card.dataset.filled) return; const cg=CG_BY_ID(card.dataset.cg); const grid=card.querySelector('.grid');
  const frag=document.createDocumentFragment(); cgSites(cg).forEach(s=>frag.appendChild(makeChip(cg,s))); grid.appendChild(frag); card.dataset.filled='1'; }
const MEDAL_SVG='<svg class="medal" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M12 1a11 11 0 1 0 .01 0z M12 4.4 13.88 9.41 19.23 9.65 15.04 12.99 16.47 18.15 12 15.2 7.53 18.15 8.96 12.99 4.77 9.65 10.12 9.41z"/></svg>';
function chipInner(cg,s){ const k=keyOf(curPark.id,cg.id,s), v=sc('site',k), c=scoreColor(v), note=!!noteOf('site',k), want=wantOf(k), photo=photoKeys.has(k);
  return `${s}`; }
function makeChip(cg,s){ const k=keyOf(curPark.id,cg.id,s), c=scoreColor(sc('site',k));
  const b=document.createElement('button'); b.className='site'+(c?' rated':'')+(wantOf(k)?' wanted':'')+((noteOf('site',k)||photoKeys.has(k))?' marked':''); b.dataset.key=k; b.dataset.site=s; if(c) b.style.background=c;
  b.innerHTML=chipInner(cg,s); b.addEventListener('click',()=>openSheet('site',k,cg.id,s)); return b; }
function refreshChip(k){ const b=document.querySelector(`.site[data-key="${CSS.escape(k)}"]`); if(!b) return;
  const parts=k.split('#'), cg=CG_BY_ID(parts[1]), s=parts.slice(2).join('#'), c=scoreColor(sc('site',k));
  b.classList.toggle('rated',!!c); b.classList.toggle('wanted',wantOf(k)); b.classList.toggle('marked',!!(noteOf('site',k)||photoKeys.has(k))); b.style.background=c||''; b.innerHTML=chipInner(cg,s); }
function refreshCgHeader(cgId){ const card=document.querySelector(`.cg[data-cg="${CSS.escape(cgId)}"]`); if(!card) return; const cg=CG_BY_ID(cgId);
  const st=cgStats(curPark,cg), own=sc('campground',cidOf(curPark.id,cgId)), col=scoreColor(own);
  const prog=card.querySelector('.cg-prog'); if(prog) prog.hidden=st.rated===0;
  card.querySelector('.cg-prog .bar i').style.width=st.pct+'%';
  card.querySelector('.cg-prog .lbl').textContent=`${st.rated}/${st.total}`;
  const rb=card.querySelector('[data-cgrate]'); rb.classList.toggle('rated',!!col); rb.style.background=col||''; rb.textContent=col?`Campground · ${own}/5`:'Rate campground'; }
function expandCg(cgId){ const card=document.querySelector(`.cg[data-cg="${CSS.escape(cgId)}"]`); if(!card) return;
  card.classList.add('open'); fillGrid(card); card.scrollIntoView({behavior:'smooth',block:'start'}); card.classList.remove('pulse'); void card.offsetWidth; card.classList.add('pulse'); }

function refreshParkRate(){ const el=document.getElementById('prVal'); if(!el||!curPark) return;
  const own=sc('campground',cidOf(curPark.id,curPark.name)), col=scoreColor(own);
  el.hidden=!col; el.classList.toggle('rated',!!col); el.style.background=col||''; el.textContent=col?own+'/5':''; }
function wireParkControls(){
  document.getElementById('aboutToggle').addEventListener('click',function(){ const b=document.getElementById('aboutBody'); const open=b.hidden; b.hidden=!open; this.setAttribute('aria-expanded',open); });
  const pr=document.getElementById('parkRate');
  if(pr){ pr.addEventListener('click',()=>openSheet('campground',cidOf(curPark.id,curPark.name),curPark.name,null)); refreshParkRate(); }
  const pb=document.getElementById('pinBtn');
  if(pb){ pb.addEventListener('click',()=>{ togglePin(curPark.id); pb.classList.toggle('on',isPinned(curPark.id)); buzz(9); renderParks(); }); }
}
async function wipeParkData(pid){
  ['site','campground','trail'].forEach(b=>{ if(!state[b]) return;
    Object.keys(state[b]).forEach(k=>{ if(k.indexOf(pid+'#')===0) delete state[b][k]; }); });
  if(Array.isArray(state.pins)){ const i=state.pins.indexOf(pid); if(i>=0) state.pins.splice(i,1); }
  persist();
  try{ const db=await openDB(); await new Promise(res=>{ const tx=db.transaction(STORE,'readwrite'); const st=tx.objectStore(STORE);
    const rq=st.getAllKeys(); rq.onsuccess=()=>{ (rq.result||[]).forEach(k=>{ if(String(k).indexOf(pid+'#')===0) st.delete(k); }); };
    tx.oncomplete=()=>res(); tx.onerror=()=>res(); }); }catch(e){}
  await loadPhotoIndex();
  showThemeToast('Cleared. Fresh start for this park.');
  openPark(pid); renderParks(); }

/* ================= sheet ================= */
/* ================= trails ================= */
function trailKey(name){ return curPark.id+'#'+name; }
function fmtLen(km){ return (km%1===0?km:km).toString()+' km'; }
function renderTrails(){
  const box=document.getElementById('trails'); if(!box) return; box.innerHTML='';
  const trails=curPark.trails||[];
  if(!trails.length){ box.innerHTML='<div class="empty" style="border:1px solid var(--line);border-radius:var(--r);background:var(--card);padding:20px 14px">No trails listed for this park yet.</div>'; return; }
  trails.forEach(t=>{
    const k=trailKey(t.name), v=sc('trail',k), col=scoreColor(v), note=!!noteOf('trail',k), photo=photoKeys.has(k);
    const card=document.createElement('button'); card.className='trail'; card.dataset.trail=t.name;
    card.innerHTML=`<div class="tr-left"><div class="tr-name">${t.name}</div>
      <div class="tr-meta">${fmtLen(t.length)} · ${t.difficulty}</div></div>
      <div class="tr-rate ${col?'rated':''}" ${col?`style="background:${col}"`:''} ${col?'':'hidden'}>${col?v+'/5':''}</div>`;
    card.addEventListener('click',()=>openSheet('trail',k,t.name));
    box.appendChild(card);
  });
}
function refreshTrailCard(name){
  const card=document.querySelector(`.trail[data-trail="${CSS.escape(name)}"]`); if(!card) return;
  const k=trailKey(name), v=sc('trail',k), col=scoreColor(v), note=!!noteOf('trail',k), photo=photoKeys.has(k);
  const r=card.querySelector('.tr-rate'); r.hidden=!col; r.classList.toggle('rated',!!col); r.style.background=col||'';
  r.textContent=col?v+'/5':'';
  card.querySelectorAll('.nstar,.medal').forEach(el=>el.remove());
}

let cur={type:null,k:null,cg:null,site:null,trailName:null};
const sheet=document.getElementById('sheet'), backdrop=document.getElementById('backdrop');
function buildDots(){ const d=document.getElementById('dots'); d.innerHTML='';
  for(let i=0;i<=5;i++){ const b=document.createElement('button'); b.className='dot'; b.textContent=i; b.dataset.v=i; b.addEventListener('click',()=>setScore(i)); d.appendChild(b); } }
function paintDots(){ const s=sc(cur.type,cur.k); document.querySelectorAll('#dots .dot').forEach(dot=>{ const v=+dot.dataset.v, on=(s!=null)&&v<=s; dot.classList.toggle('on',on); dot.style.background=on?scoreColor(s):''; }); }
function openSheet(type,k,cgId,site){ cur={type,k,cg:cgId,site,trailName:(type==='trail'?cgId:null)};
  const wb=document.getElementById('wantBtn'), pw=document.getElementById('photoWrap'), whr=document.getElementById('d-where');
  if(type==='site'){ document.getElementById('d-kind').textContent='Site'; document.getElementById('d-title').textContent='Site '+site;
    whr.textContent=(cgId===curPark.name?((curPark.region||'').split(' · ')[0]||'')+' · '+cgId:cgId+' · '+curPark.name); whr.style.display='';
    document.getElementById('d-ctx').textContent=''; wb.style.display=''; pw.style.display='';
    const w=wantOf(k); wb.setAttribute('aria-pressed',w); wb.textContent=(w?'★ ':'☆ ')+'Wishlist'; renderPhotos(k);
  } else if(type==='trail'){ const t=(curPark.trails||[]).find(x=>x.name===cgId); whr.style.display='none';
    document.getElementById('d-kind').textContent='Trail'; document.getElementById('d-title').textContent=cgId;
    document.getElementById('d-ctx').textContent=(t?fmtLen(t.length)+' · '+t.difficulty:''); wb.style.display='none'; pw.style.display=''; renderPhotos(k);
  } else { whr.style.display='none'; const isPark=(curPark.dayuse&&cgId===curPark.name);
    document.getElementById('d-kind').textContent=isPark?'Park':'Campground'; document.getElementById('d-title').textContent=cgId;
    document.getElementById('d-ctx').textContent=isPark?((curPark.region||'').split(' · ').slice(1).join(' · ')):curPark.name; wb.style.display='none'; pw.style.display=''; renderPhotos(k); }
  document.getElementById('photoNote').hidden=(type==='trail');
  document.getElementById('notesLabel').textContent='Notes';
  document.getElementById('d-kind').style.display=(type==='site')?'none':'';
  const nta=document.getElementById('d-notes'); nta.value=noteOf(type,k); autoGrowNotes(nta); paintDots();
  backdrop.classList.add('on'); sheet.classList.add('on'); sheet.scrollTop=0; lockScroll();
}
function closeSheet(){ backdrop.classList.remove('on'); sheet.classList.remove('on'); sheet.style.transform=''; unlockScroll(); }
function ensure(){ if(!state[cur.type][cur.k]) state[cur.type][cur.k]={score:null,note:''}; return state[cur.type][cur.k]; }
function flashSaved(){}
function afterChange(){ persist();
  if(cur.type==='site'){ refreshChip(cur.k); refreshCgHeader(cur.cg); updatePark(); renderGlance(); }
  else if(cur.type==='trail'){ refreshTrailCard(cur.trailName); }
  else { refreshCgHeader(cur.cg); refreshParkRate(); } }
function setScore(v){ const e=ensure(); e.score=(e.score===v?null:v); buzz(9); paintDots(); flashSaved(); afterChange(); }
document.getElementById('wantBtn').addEventListener('click',function(){ const e=ensure(); e.want=!e.want; buzz(9);
  this.setAttribute('aria-pressed',e.want); this.textContent=(e.want?'★ ':'☆ ')+'Wishlist'; if(e.want&&e.score===0) showThemeToast("That doesn't make sense... noted anyways."); flashSaved(); persist(); if(cur.site) refreshChip(cur.k); renderGlance(); });
function autoGrowNotes(el){ el.style.height='auto'; el.style.height=Math.max(106,el.scrollHeight)+'px'; }
document.getElementById('d-notes').addEventListener('input',e=>{ autoGrowNotes(e.target); const en=ensure(); en.note=e.target.value; flashSaved(); persist(); if(cur.site) refreshChip(cur.k); else if(cur.type==='trail') refreshTrailCard(cur.trailName); });
document.getElementById('clearBtn').addEventListener('click',()=>{ delete state[cur.type][cur.k]; const cnta=document.getElementById('d-notes'); cnta.value=''; autoGrowNotes(cnta);
  const wb=document.getElementById('wantBtn'); wb.setAttribute('aria-pressed',false); wb.textContent='☆ Wishlist'; paintDots(); flashSaved(); afterChange(); });
document.getElementById('doneBtn').addEventListener('click',closeSheet);
backdrop.addEventListener('click',closeSheet);
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeSheet(); document.getElementById('lightbox').classList.remove('on'); } });

async function renderPhotos(k){ const box=document.getElementById('photos'); box.innerHTML=''; const list=await getPhotos(k);
  list.forEach(p=>{ const d=document.createElement('div'); d.className='photo';
    d.innerHTML=`<img src="${p.data}" alt=""><button class="del" aria-label="Delete photo">×</button>`;
    d.querySelector('img').addEventListener('click',()=>openLightbox(p.data));
    d.querySelector('.del').addEventListener('click',async(e)=>{ e.stopPropagation(); const next=(await getPhotos(k)).filter(x=>x.id!==p.id); await putPhotos(k,next); renderPhotos(k); if(cur.site) refreshChip(k); else if(cur.type==='trail') refreshTrailCard(cur.trailName); });
    box.appendChild(d); });
}
async function handlePhotoFiles(e){ const files=Array.from(e.target.files||[]); if(!files.length) return; const k=cur.k;
  const btns=document.querySelectorAll('.pa-btn'); btns.forEach(b=>b.disabled=true);
  const list=await getPhotos(k);
  for(const f of files){ try{ const data=await compress(f); list.push({id:'p'+Date.now()+Math.random().toString(36).slice(2,6),data}); }catch(err){} }
  await putPhotos(k,list); e.target.value=''; buzz(9); renderPhotos(k); if(cur.site) refreshChip(k); else if(cur.type==='trail') refreshTrailCard(cur.trailName); renderGlance(); btns.forEach(b=>b.disabled=false); }
document.getElementById('photoInput').addEventListener('change',handlePhotoFiles);
document.getElementById('cameraInput').addEventListener('change',handlePhotoFiles);
document.getElementById('cameraBtn').addEventListener('click',()=>document.getElementById('cameraInput').click());
document.getElementById('libraryBtn').addEventListener('click',()=>document.getElementById('photoInput').click());
function openLightbox(src){ document.getElementById('lightboxImg').src=src; document.getElementById('lightbox').classList.add('on'); }
document.getElementById('lightbox').addEventListener('click',()=>document.getElementById('lightbox').classList.remove('on'));

/* ================= progress + glance ================= */
function updatePark(){ renderParkStats(); }
function renderParkStats(){ const p=curPark, box=document.getElementById('statsBody'), wrap=document.getElementById('statsWrap'); if(!p||!box) return;
  let rated=0,total=0,sum=0,want=0,notes=0,photos=0; const dist=[0,0,0,0,0,0];
  p.campgrounds.forEach(cg=>{ cgSites(cg).forEach(sit=>{ const k=keyOf(p.id,cg.id,sit); total++;
    const v=sc('site',k); if(v!=null){ rated++; sum+=v; dist[v]++; }
    if(wantOf(k)) want++; if(noteOf('site',k)) notes++; if(photoKeys.has(k)) photos++; }); });
  if(!rated){ if(wrap) wrap.hidden=true; return; }
  if(wrap) wrap.hidden=false;
  const avg=rated?(sum/rated):0, maxD=Math.max.apply(null,dist)||1;
  let h='<div class="stiles">'
    +'<div class="stile"><b>'+(rated?avg.toFixed(2):'-')+'</b><span>Average</span></div>'
    +'<div class="stile"><b>'+rated+'<i>/'+total+'</i></b><span>Rated</span></div>'
    +'<div class="stile"><b>'+want+'</b><span>Wishlist</span></div>'
    +'<div class="stile"><b>'+photos+'</b><span>Photos</span></div>'
    +'<div class="stile"><b>'+notes+'</b><span>Notes</span></div>'
    +'<div class="stile"><b>'+Math.round(rated/Math.max(1,total)*100)+'<i>%</i></b><span>Scouted</span></div>'
  +'</div>';
  if(rated){
    h+='<div class="glabel">Rating spread</div><div class="dbars">';
    for(let v=5; v>=0; v--){ const c=dist[v], w=Math.round(c/maxD*100);
      h+='<div class="dbar"><span class="dl tnum">'+v+'</span><span class="dtrack"><i style="width:'+Math.max(c?6:0,w)+'%;background:'+(scoreColor(v)||'var(--forest)')+'"></i></span><span class="dc tnum">'+c+'</span></div>'; }
    h+='</div>';
  }
  const multi=p.campgrounds.length>1;
  if(multi){
    h+='<div class="glabel">By campground</div><div class="cgbars">';
    p.campgrounds.forEach(cg=>{ const st=cgStats(p,cg);
      h+='<div class="cgbar"><span class="cn">'+cg.id+'</span><span class="ctrack"><i style="width:'+st.pct+'%"></i></span><span class="cc tnum">'+st.rated+'/'+st.total+'</span></div>'; });
    h+='</div>';
  }
  box.innerHTML=h; }

async function renderGlance(){ const p=curPark; if(!p) return;
  if(p.dayuse){ const w=document.getElementById('wantSection'); if(w) w.hidden=true; return; }
  const st=parkStats(p); const rated=[], wants=[];
  p.campgrounds.forEach(cg=>cgSites(cg).forEach(s=>{ const k=keyOf(p.id,cg.id,s), e=state.site[k]; if(e&&typeof e.score==='number') rated.push({s,k,e,cg}); if(e&&e.want) wants.push({s,k,e,cg}); }));
  void st;
  const wl=wants.sort((a,b)=>((b.e.score??-1))-((a.e.score??-1))||a.s.localeCompare(b.s,undefined,{numeric:true})).slice(0,5);
  const wantSec=document.getElementById('wantSection'); if(wantSec) wantSec.hidden = wl.length===0;
  const topSec=document.getElementById('topSection'); if(topSec) topSec.hidden = rated.length===0;
  const wlBox=document.getElementById('wantList'); if(!wlBox) return;
  wlBox.innerHTML=wl.length?wl.map(w=>`<div class="want-item" data-key="${w.k}"><div class="h"><span class="wstar">★</span><b>${w.cg.id}, Site ${w.s}</b>${(w.e.score!=null)?`<span class="tr-rate rated" style="background:${scoreColor(w.e.score)}">${w.e.score}/5</span>`:''}</div><p>${w.e.note&&w.e.note.trim()?w.e.note.replace(/</g,'&lt;'):''}</p><div class="want-thumbs" data-thumbs="${w.k}"></div></div>`).join('')
    : `<div class="empty">Star sites with “Want this one” to build your booking shortlist.</div>`;
  wl.forEach(async w=>{ const t=wlBox.querySelector(`[data-thumbs="${CSS.escape(w.k)}"]`); if(!t) return; const ph=await getPhotos(w.k); t.innerHTML=ph.slice(0,6).map(x=>`<img src="${x.data}" alt="">`).join(''); });
  wlBox.querySelectorAll('.want-item').forEach(el=>el.addEventListener('click',(ev)=>{ if(ev.target.tagName!=='IMG'){ const parts=el.dataset.key.split('#'); openSheet('site',el.dataset.key,parts[1],parts.slice(2).join('#')); } }));
  const top=rated.sort((a,b)=>b.e.score-a.e.score).slice(0,5);
  const ts=document.getElementById('topSites');
  ts.innerHTML=top.length?top.map(t=>`<li data-key="${t.k}"><div><div class="who">Site ${t.s}</div><div class="whr">${t.cg.id}</div></div><span class="tr-rate rated" style="background:${scoreColor(t.e.score)}">${t.e.score}/5</span></li>`).join('')
    : `<li class="empty">No sites rated yet.</li>`;
  ts.querySelectorAll('li[data-key]').forEach(li=>li.addEventListener('click',()=>{ const parts=li.dataset.key.split('#'); openSheet('site',li.dataset.key,parts[1],parts.slice(2).join('#')); })); }

/* ================= unlockable park themes ================= */
/* Universal token system: every theme fills the SAME variable slots, generated
   from three seed colours (paper, ink, primary) so contrast stays consistent. */
var THEME_KEY='site-journal-theme', VARS_KEY='site-journal-theme-vars', UNLOCK_KEY='site-journal-unlocks';
var FOREST={id:'forest',name:'Default',paper:'#F1F6F1',ink:'#0F1F17',primary:'#00753A'};
var PARK_THEMES=[ /* all light or medium and bold; the Wildlands alone keeps the dark */
  {id:'aaron', name:'Aaron', paper:'#F1F6F1', ink:'#0F1F17', primary:'#2E6FB0'},
  {id:'algonquinachray', name:'Achray', paper:'#F1F6F1', ink:'#0F1F17', primary:'#B2571A'},
  {id:'arrowhead', name:'Arrowhead', paper:'#F1F6F1', ink:'#0F1F17', primary:'#7A4FB0'},
  {id:'awenda', name:'Awenda', paper:'#F1F6F1', ink:'#0F1F17', primary:'#0E8A8A'},
  {id:'balsamlake', name:'Balsam Lake', paper:'#F3F4F7', ink:'#191F2E', primary:'#344E98'},
  {id:'basslake', name:'Bass Lake', paper:'#F3F4F7', ink:'#19222E', primary:'#345D98'},
  {id:'batchawanabay', name:'Batchawana Bay', paper:'#EBF2F5', ink:'#17262B', primary:'#2C738C'},
  {id:'bluelake', name:'Blue Lake', paper:'#EBF3F8', ink:'#1D2A33', primary:'#146EB8'},
  {id:'bonecho', name:'Bon Echo', paper:'#EBF0F5', ink:'#17212B', primary:'#325D85'},
  {id:'bonnechere', name:'Bonnechere', paper:'#F3F7F6', ink:'#192E29', primary:'#39937D'},
  {id:'boynevalley', name:'Boyne Valley', paper:'#F3F7F3', ink:'#1C2E19', primary:'#479339'},
  {id:'algonquinbrent', name:'Brent', paper:'#F7F5F3', ink:'#2E2519', primary:'#986B34'},
  {id:'brontecreek', name:'Bronte Creek', paper:'#F2F0F7', ink:'#20192E', primary:'#513097'},
  {id:'caliperlake', name:'Caliper Lake', paper:'#F0F2F7', ink:'#191F2E', primary:'#2448A3'},
  {id:'algonquincanisbay', name:'Canisbay', paper:'#F0F5F7', ink:'#19272E', primary:'#1E7BA9'},
  {id:'charlestonlake', name:'Charleston Lake', paper:'#F0F2F7', ink:'#19202E', primary:'#244CA3'},
  {id:'chutes', name:'Chutes', paper:'#F5F7F0', ink:'#272E19', primary:'#79A324'},
  {id:'craigleith', name:'Craigleith', paper:'#F7F0F6', ink:'#2E192C', primary:'#913686'},
  {id:'darlington', name:'Darlington', paper:'#F7F0F0', ink:'#2E1919', primary:'#9D2A2B'},
  {id:'devilsglen', name:'Devils Glen', paper:'#F6F7F0', ink:'#2D2E19', primary:'#99A324'},
  {id:'driftwood', name:'Driftwood', paper:'#F0F0F7', ink:'#1A192E', primary:'#2E2A9D'},
  {id:'earlrowe', name:'Earl Rowe', paper:'#F0F7F2', ink:'#192E1E', primary:'#1EA93B'},
  {id:'emily', name:'Emily', paper:'#F0F7F5', ink:'#192E27', primary:'#2A9D76'},
  {id:'eskerlakes', name:'Esker Lakes', paper:'#F2F0F6', ink:'#272334', primary:'#4C3E8E'},
  {id:'fairbank', name:'Fairbank', paper:'#F1F7F0', ink:'#1B2E19', primary:'#379D2A'},
  {id:'ferris', name:'Ferris', paper:'#F7F4F0', ink:'#2E2519', primary:'#A36E24'},
  {id:'finlaysonpoint', name:'Finlayson Point', paper:'#ECF6F5', ink:'#192E2C', primary:'#1C9B8E'},
  {id:'fitzroy', name:'Fitzroy', paper:'#EFEBF5', ink:'#21172B', primary:'#5A3285'},
  {id:'forksofthecredit', name:'Forks of the Credit', paper:'#F2F6EC', ink:'#262E19', primary:'#6AA216'},
  {id:'frenchriver', name:'French River', paper:'#EBF0F5', ink:'#17222B', primary:'#235E95'},
  {id:'frontenac', name:'Frontenac', paper:'#F5EBF4', ink:'#2B172B', primary:'#853283'},
  {id:'fushimilake', name:'Fushimi Lake', paper:'#EDEBF5', ink:'#1C172B', primary:'#422C8C'},
  {id:'grundy', name:'Grundy Lake', paper:'#FBF3DF', ink:'#241A08', primary:'#B4700A'},
  {id:'halfwaylake', name:'Halfway Lake', paper:'#EBEEF5', ink:'#171E2B', primary:'#294D8F'},
  {id:'inverhuron', name:'Inverhuron', paper:'#F6ECEC', ink:'#2E1919', primary:'#9B1C1F'},
  {id:'ivanhoelake', name:'Ivanhoe Lake', paper:'#ECF0F6', ink:'#19212E', primary:'#164CA2'},
  {id:'johnepearce', name:'John E. Pearce', paper:'#F3F5EB', ink:'#272B17', primary:'#7A8F29'},
  {id:'kakabekafalls', name:'Kakabeka Falls', paper:'#ECF3F6', ink:'#19292E', primary:'#1280A5'},
  {id:'kawarthahighlands', name:'Kawartha Highlands', paper:'#EBF3F5', ink:'#17272B', primary:'#327685'},
  {id:'algonquinkearney', name:'Kearney Lake', paper:'#EBEFF5', ink:'#17202B', primary:'#29568F'},
  {id:'kettlelakes', name:'Kettle Lakes', paper:'#EBF5ED', ink:'#172B1B', primary:'#328542'},
  {id:'killarney', name:'Killarney', paper:'#F6FAFA', ink:'#1D2B2E', primary:'#22A3B4'},
  {id:'killbear', name:'Killbear', paper:'#EBEBF5', ink:'#17192B', primary:'#2E348A'},
  {id:'algonquinkiosk', name:'Kiosk', paper:'#ECF6F0', ink:'#192E21', primary:'#12A54B'},
  {id:'komoka', name:'Komoka', paper:'#ECF6F2', ink:'#192E25', primary:'#1C9B64'},
  {id:'algonquintworivers', name:'Lake of Two Rivers', paper:'#EBF3F5', ink:'#17282B', primary:'#297F8F'},
  {id:'lakestpeter', name:'Lake St. Peter', paper:'#ECF0F6', ink:'#19222E', primary:'#1652A2'},
  {id:'lakesuperior', name:'Lake Superior', paper:'#EBF1F5', ink:'#17242B', primary:'#2D678B'},
  {id:'longpoint', name:'Long Point', paper:'#EBF5F3', ink:'#172B27', primary:'#2E8A77'},
  {id:'macgregorpoint', name:'MacGregor Point', paper:'#ECF6F5', ink:'#192E2D', primary:'#1C9B90'},
  {id:'macleod', name:'MacLeod', paper:'#ECF6EC', ink:'#192E19', primary:'#1F9B1C'},
  {id:'makobegrays', name:'Makobe-Grays', paper:'#F5F2EB', ink:'#2C2921', primary:'#A86224'},
  {id:'mara', name:'Mara', paper:'#F6F1EC', ink:'#2E2419', primary:'#A26016'},
  {id:'markburnham', name:'Mark S. Burnham', paper:'#EFECF6', ink:'#1F192E', primary:'#452494'},
  {id:'martenriver', name:'Marten River', paper:'#EBF3F5', ink:'#17282B', primary:'#29818F'},
  {id:'mcraepoint', name:'McRae Point', paper:'#ECF6F4', ink:'#192E2A', primary:'#1C9B84'},
  {id:'algonquinmew', name:'Mew Lake', paper:'#ECEFF6', ink:'#19202E', primary:'#1644A2'},
  {id:'mikisew', name:'Mikisew', paper:'#EFF5EB', ink:'#1F2B17', primary:'#538F29'},
  {id:'miserybay', name:'Misery Bay', paper:'#ECF2F6', ink:'#19262E', primary:'#126BA5'},
  {id:'missinaibi', name:'Missinaibi', paper:'#EBF3F5', ink:'#17282B', primary:'#2B7B8D'},
  {id:'mississagi', name:'Mississagi', paper:'#F5EBF4', ink:'#2B172A', primary:'#85327F'},
  {id:'monocliffs', name:'Mono Cliffs', paper:'#F6ECED', ink:'#2E191A', primary:'#9B1C25'},
  {id:'murphyspoint', name:'Murphys Point', paper:'#ECF6F4', ink:'#192E2B', primary:'#1C9B86'},
  {id:'nagagamisis', name:'Nagagamisis', paper:'#F3F5EB', ink:'#282B17', primary:'#7F8F29'},
  {id:'neys', name:'Neys', paper:'#ECEEF6', ink:'#191D2E', primary:'#1C329B'},
  {id:'northbeach', name:'North Beach', paper:'#F6F5EC', ink:'#2E2B19', primary:'#A48F14'},
  {id:'oastlerlake', name:'Oastler Lake', paper:'#F5EFEB', ink:'#2B2117', primary:'#99591F'},
  {id:'obabikariver', name:'Obabika River', paper:'#EBF5ED', ink:'#172B1C', primary:'#328547'},
  {id:'ojibway', name:'Ojibway', paper:'#ECF6F0', ink:'#192E21', primary:'#12A549'},
  {id:'ouimetcanyon', name:'Ouimet Canyon', paper:'#EBEFF5', ink:'#17212B', primary:'#325A85'},
  {id:'pakwash', name:'Pakwash', paper:'#ECF6F3', ink:'#192E27', primary:'#1C9B71'},
  {id:'pancakebay', name:'Pancake Bay', paper:'#F7F1E3', ink:'#33291A', primary:'#C08A2E'},
  {id:'petroglyphs', name:'Petroglyphs', paper:'#F5F1EB', ink:'#2B2417', primary:'#8E682A'},
  {id:'pigeonriver', name:'Pigeon River', paper:'#ECF4F6', ink:'#192A2E', primary:'#1683A2'},
  {id:'pinery', name:'Pinery', paper:'#ECF3EB', ink:'#1F2F1E', primary:'#2E7A3D'},
  {id:'algonquinpog', name:'Pog Lake', paper:'#EBEDF5', ink:'#171C2B', primary:'#29428F'},
  {id:'pointfarms', name:'Point Farms', paper:'#ECF6F5', ink:'#192E2C', primary:'#1C9B8A'},
  {id:'portbruce', name:'Port Bruce', paper:'#EDF6EC', ink:'#1A2E19', primary:'#259B1C'},
  {id:'portburwell', name:'Port Burwell', paper:'#F5EEEB', ink:'#2B1E17', primary:'#8F4E29'},
  {id:'potholes', name:'Potholes', paper:'#F0ECF6', ink:'#22192E', primary:'#502494'},
  {id:'queenelizabethii', name:'QE II Wildlands', paper:'#0C120E', ink:'#DDE7DF', primary:'#2F6B4F', dark:true},
  {id:'quetico', name:'Quetico', paper:'#F3F5EB', ink:'#292B17', primary:'#7A8532'},
  {id:'algonquinraccoon', name:'Raccoon Lake', paper:'#ECEEF6', ink:'#191E2E', primary:'#1636A2'},
  {id:'oxtongueriver', name:'Ragged Falls', paper:'#ECF3F6', ink:'#19282E', primary:'#127CA5'},
  {id:'rainbowfalls', name:'Rainbow Falls', paper:'#F5F1F4', ink:'#2C242B', primary:'#923A79'},
  {id:'renebrunelle', name:'Rene Brunelle', paper:'#F2F6EC', ink:'#262E19', primary:'#6CA216'},
  {id:'restoule', name:'Restoule', paper:'#F6ECF4', ink:'#2E192B', primary:'#8D2A7E'},
  {id:'rideauriver', name:'Rideau River', paper:'#EBF5F4', ink:'#172B2B', primary:'#298F8C'},
  {id:'algonquinrock', name:'Rock Lake', paper:'#ECEFF6', ink:'#191F2E', primary:'#425175'},
  {id:'rockpoint', name:'Rock Point', paper:'#F1F2F3', ink:'#26292C', primary:'#51647B'},
  {id:'rondeau', name:'Rondeau', paper:'#F5EBEC', ink:'#2B171A', primary:'#8A2E3D'},
  {id:'rushingriver', name:'Rushing River', paper:'#ECF4F6', ink:'#192A2E', primary:'#1688A2'},
  {id:'samueldechamplain', name:'Samuel de Champlain', paper:'#F5F6EC', ink:'#2D2E19', primary:'#99A216'},
  {id:'sandbanks', name:'Sandbanks', paper:'#F8F4E8', ink:'#2E2A1C', primary:'#C9A143'},
  {id:'sandbarlake', name:'Sandbar Lake', paper:'#F7F3E6', ink:'#2D2A1C', primary:'#A88024'},
  {id:'saublefalls', name:'Sauble Falls', paper:'#EBF2F5', ink:'#17252B', primary:'#2C718C'},
  {id:'selkirk', name:'Selkirk', paper:'#EBECF5', ink:'#171B2B', primary:'#2E3E8A'},
  {id:'sharbotlake', name:'Sharbot Lake', paper:'#ECEFF6', ink:'#19202E', primary:'#1646A2'},
  {id:'shorthills', name:'Short Hills', paper:'#ECF6F0', ink:'#192E22', primary:'#12A54E'},
  {id:'sibbaldpoint', name:'Sibbald Point', paper:'#EBF5F3', ink:'#172B29', primary:'#2E8A7F'},
  {id:'silentlake', name:'Silent Lake', paper:'#ECEFF6', ink:'#191F2E', primary:'#163BA2'},
  {id:'silverfalls', name:'Silver Falls', paper:'#F2F4F4', ink:'#26292B', primary:'#476985'},
  {id:'silverlake', name:'Silver Lake', paper:'#F2F3F5', ink:'#272B31', primary:'#4E6C7E'},
  {id:'siouxnarrows', name:'Sioux Narrows', paper:'#ECF6F1', ink:'#192E24', primary:'#1C9B5D'},
  {id:'sixmilelake', name:'Six Mile Lake', paper:'#ECEDF6', ink:'#191C2E', primary:'#162BA2'},
  {id:'sleepinggiant', name:'Sleeping Giant', paper:'#EBEDF5', ink:'#171C2B', primary:'#324785'},
  {id:'solace', name:'Solace', paper:'#EBEEF5', ink:'#171D2B', primary:'#304A87'},
  {id:'spanishriver', name:'Spanish River', paper:'#ECF2F6', ink:'#19272E', primary:'#166EA2'},
  {id:'springwater', name:'Springwater', paper:'#EDF5EB', ink:'#1B2B17', primary:'#3F8A2E'},
  {id:'sturgeonbay', name:'Sturgeon Bay', paper:'#ECF1F6', ink:'#19242E', primary:'#125FA5'},
  {id:'sturgeonriver', name:'Sturgeon River', paper:'#ECF6F6', ink:'#192E2E', primary:'#16A2A2'},
  {id:'algonquintea', name:'Tea Lake', paper:'#F5EFE5', ink:'#33271A', primary:'#8A5C33'},
  {id:'themassasauga', name:'The Massasauga', paper:'#F6F1EE', ink:'#31261F', primary:'#A23D2A'},
  {id:'tidewater', name:'Tidewater', paper:'#EBF2F5', ink:'#17272B', primary:'#287990'},
  {id:'turkeypoint', name:'Turkey Point', paper:'#EBF4F5', ink:'#172A2B', primary:'#2E868A'},
  {id:'voyageur', name:'Voyageur', paper:'#F7F1EA', ink:'#33241C', primary:'#B0562F'},
  {id:'wabakimi', name:'Wabakimi', paper:'#EBF5F1', ink:'#172B24', primary:'#328568'},
  {id:'wakamilake', name:'Wakami Lake', paper:'#EBEFF5', ink:'#171F2B', primary:'#29538F'},
  {id:'wasagabeach', name:'Wasaga Beach', paper:'#F7F3E8', ink:'#2E2A1F', primary:'#D9A441'},
  {id:'wheatley', name:'Wheatley', paper:'#F6EFEC', ink:'#2E2019', primary:'#A24616'},
  {id:'whitelake', name:'White Lake', paper:'#EBEEF5', ink:'#171E2B', primary:'#294B8F'},
  {id:'windylake', name:'Windy Lake', paper:'#ECEEF6', ink:'#191E2E', primary:'#1635A2'},
  {id:'woodlandcaribou', name:'Woodland Caribou', paper:'#F5F0EB', ink:'#2B2217', primary:'#8F6229'}
];
var THEME_BY_ID={}; PARK_THEMES.forEach(function(t){THEME_BY_ID[t.id]=t;});
var THEME_VAR_NAMES=['--paper','--card','--ink','--forest','--forest-2','--forest-press','--green-tint','--green-tint-2','--moss','--mist','--mist-2','--line','--amber','--amber-soft','--shadow-sm','--shadow','--shadow-btn'];
function mixhex(a,b,t){ var A=parseInt(a.slice(1),16),B=parseInt(b.slice(1),16);
  var r=Math.round(((A>>16)&255)*(1-t)+((B>>16)&255)*t), g=Math.round(((A>>8)&255)*(1-t)+((B>>8)&255)*t), c=Math.round((A&255)*(1-t)+(B&255)*t);
  return '#'+((1<<24)|(r<<16)|(g<<8)|c).toString(16).slice(1).toUpperCase(); }
function buildVars(t){ var P=t.paper,I=t.ink,F=t.primary,dark=!!t.dark;
  var amber=mixhex(dark?'#F5CE4A':'#F2C728', F, .15);
  var v={'--paper':P,'--card':dark?mixhex(P,'#FFFFFF',.05):'#FFFFFF','--ink':I,
    '--forest':F,'--forest-2':mixhex(F,'#FFFFFF',.16),'--forest-press':mixhex(F,'#000000',.22),
    '--green-tint':mixhex(F,P,dark?.86:.88),'--green-tint-2':mixhex(F,P,dark?.74:.78),
    '--moss':mixhex(I,P,dark?.35:.30),
    '--mist':mixhex(I,P,.90),'--mist-2':mixhex(I,P,.78),'--line':mixhex(I,P,.85),
    '--amber':amber,'--amber-soft':mixhex(amber,P,.82)};
  if(dark){ v['--shadow-sm']='0 1px 2px rgba(0,0,0,.40)'; v['--shadow']='0 4px 16px rgba(0,0,0,.45)'; v['--shadow-btn']='0 3px 12px rgba(0,0,0,.5)'; }
  else { v['--shadow-sm']='0 1px 2px rgba(15,31,23,.06)'; v['--shadow']='0 2px 12px rgba(15,31,23,.08)'; v['--shadow-btn']='0 3px 10px rgba(0,0,0,.22)'; }
  return v; }
function getUnlocks(){ try{ return JSON.parse(localStorage.getItem(UNLOCK_KEY)||'[]'); }catch(e){ return []; } }
function isUnlocked(id){ return getUnlocks().indexOf(id)>=0; }
function applyTheme(id){
  var d=document.documentElement, meta=document.querySelector('meta[name="theme-color"]');
  if(id!=='forest' && !THEME_BY_ID[id]) id='forest';
  if(id==='forest'){
    THEME_VAR_NAMES.forEach(function(n){ d.style.removeProperty(n); });
    if(meta) meta.setAttribute('content','#12572F');
    try{ localStorage.setItem(THEME_KEY,'forest'); localStorage.removeItem(VARS_KEY); }catch(e){}
  } else {
    var t=THEME_BY_ID[id], v=buildVars(t), tc=t.dark?t.paper:mixhex(t.primary,'#000000',.35);
    for(var k in v) d.style.setProperty(k,v[k]);
    if(meta) meta.setAttribute('content',tc);
    try{ localStorage.setItem(THEME_KEY,id); localStorage.setItem(VARS_KEY,JSON.stringify({vars:v,tc:tc,dark:!!t.dark})); }catch(e){}
  }
  document.querySelectorAll('.swatch').forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.themeName===id)); });
}
function currentThemeId(){ var t='forest'; try{ t=localStorage.getItem(THEME_KEY)||'forest'; }catch(e){}
  if(t!=='forest' && (!THEME_BY_ID[t] || !isUnlocked(t))) t='forest'; return t; }
/* Appearance: honour the system by default; the toggle can pin light or dark. */
function campAppearance(){ try{ return localStorage.getItem('oncamp-appearance')||'auto'; }catch(e){ return 'auto'; } }
function applyAppearance(){
  var a=campAppearance();
  if(a==='light'||a==='dark') document.documentElement.setAttribute('data-theme',a);
  else document.documentElement.removeAttribute('data-theme');
}
function setAppearance(mode){
  try{ if(mode==='auto') localStorage.removeItem('oncamp-appearance'); else localStorage.setItem('oncamp-appearance',mode); }catch(e){}
  applyAppearance(); renderThemePicker();
}
function renderThemePicker(){
  var row=document.getElementById('themeRow'); if(!row) return;
  var cur=campAppearance();
  var opts=[['auto','Auto'],['light','Light'],['dark','Dark']];
  row.innerHTML=opts.map(function(o){ return '<div class="seg-opt'+(o[0]===cur?' on':'')+'" data-app="'+o[0]+'" role="button" tabindex="0">'+o[1]+'</div>'; }).join('');
  row.querySelectorAll('.seg-opt').forEach(function(b){ b.addEventListener('click', function(){ setAppearance(b.dataset.app); buzz(6); }); });
}
/* ---- one-time migration: single Algonquin -> split campground parks ---- */
var ALG_CG_MAP={'Tea Lake':'algonquintea','Canisbay Lake':'algonquincanisbay','Mew Lake':'algonquinmew','Lake of Two Rivers':'algonquintworivers','Pog Lake':'algonquinpog','Kearney Lake':'algonquinkearney','Raccoon Lake':'algonquinraccoon','Rock Lake':'algonquinrock','Achray':'algonquinachray'};
var ALG_TRAIL_MAP={'Whiskey Rapids':'algonquintea','Hardwood Lookout':'algonquintea','Mizzy Lake':'algonquintea','Peck Lake':'algonquincanisbay','Track and Tower':'algonquincanisbay','Two Rivers':'algonquintworivers','Centennial Ridges':'algonquinpog','Lookout Trail':'algonquinrock',"Booth's Rock":'algonquinrock','Spruce Bog Boardwalk':'algonquinraccoon','Beaver Pond':'algonquinraccoon'};
function migrateScale5(){ if(state._s5) return;
  ['site','campground','trail'].forEach(function(t){ var m=state[t]||{}; Object.keys(m).forEach(function(k){ var e=m[k];
    if(e&&typeof e.score==='number'){ e.score = e.score>0 ? Math.max(1,Math.round(e.score/2)) : null; } }); });
  state._s5=1; persist(); }
function migrateAlgonquin(){ var changed=false;
  ['site','campground','trail'].forEach(function(type){ var m=state[type]||{};
    Object.keys(m).forEach(function(k){ if(k.indexOf('algonquin#')!==0) return;
      var parts=k.split('#'), np=(type==='trail')?ALG_TRAIL_MAP[parts[1]]:ALG_CG_MAP[parts[1]];
      if(np){ var nk=np+'#'+parts.slice(1).join('#'); if(!m[nk]) m[nk]=m[k]; }
      delete m[k]; changed=true; }); });
  if(changed) persist(); }
async function migrateAlgPhotos(){ var olds=Array.from(photoKeys).filter(function(k){return k.indexOf('algonquin#')===0;});
  for(var i=0;i<olds.length;i++){ var k=olds[i], parts=k.split('#'), np=ALG_CG_MAP[parts[1]]||ALG_TRAIL_MAP[parts[1]];
    if(!np){ continue; }
    var nk=np+'#'+parts.slice(1).join('#');
    try{ var list=await getPhotos(k); if(list&&list.length) await putPhotos(nk,list); await putPhotos(k,[]); }catch(e){} } }
/* ---- unlock by tapping a park's name on its page ---- */
var toastEl=null, toastTimer=null;
function showThemeToast(msg,onTap,ms){
  if(!toastEl){ toastEl=document.createElement('button'); toastEl.className='toast'; toastEl.type='button'; document.body.appendChild(toastEl); }
  toastEl.textContent=msg; toastEl.onclick=function(){ if(onTap) onTap(); hideThemeToast(); };
  requestAnimationFrame(function(){ toastEl.classList.add('on'); });
  clearTimeout(toastTimer); toastTimer=setTimeout(hideThemeToast, ms||3500);
}
function hideThemeToast(){ if(toastEl) toastEl.classList.remove('on'); }
function onParkNameTap(p){ /* park themes retired in favour of the shared appearance setting */ }

/* ---- settings sheet (tap the Site Journal title) ---- */
var settingsSheet=document.getElementById('settingsSheet'), settingsBackdrop=document.getElementById('settingsBackdrop');
function openSettings(){ settingsBackdrop.classList.add('on'); settingsSheet.classList.add('on'); settingsSheet.scrollTop=0; lockScroll(); }
function closeSettings(){ settingsBackdrop.classList.remove('on'); settingsSheet.classList.remove('on'); settingsSheet.style.transform=''; unlockScroll(); }
document.getElementById('appTitle').addEventListener('click',openSettings);
settingsBackdrop.addEventListener('click',closeSettings);
/* shared: body scroll lock while a sheet is open */
var _lockY=0,_locks=0;
function lockScroll(){ if(++_locks>1) return; _lockY=window.scrollY||0; var b=document.body;
  b.style.position='fixed'; b.style.top=(-_lockY)+'px'; b.style.left='0'; b.style.right='0'; b.style.width='100%'; }
function unlockScroll(){ if(_locks===0) return; if(--_locks>0) return; var b=document.body;
  b.style.position=''; b.style.top=''; b.style.left=''; b.style.right=''; b.style.width=''; window.scrollTo(0,_lockY); }
/* shared: pull down anywhere on a sheet to close it */
function makeSheetSwipe(el,closeFn){
  var sy=0,sx=0,dy=0,dragging=false,horiz=false;
  el.addEventListener('touchstart',function(e){
    if(el.scrollTop>0) return;
    if(e.target.closest('textarea')) return;
    var isc=e.target.closest('.scrolly'); if(isc && isc.scrollTop>0) return;
    sy=e.touches[0].clientY; sx=e.touches[0].clientX; dy=0; dragging=true; horiz=false; el.style.transition='none';
  },{passive:true});
  el.addEventListener('touchmove',function(e){
    if(!dragging) return;
    var ty=e.touches[0].clientY-sy, tx=e.touches[0].clientX-sx;
    if(!horiz && Math.abs(tx)>Math.abs(ty)+8) horiz=true;
    if(horiz) return;
    dy=ty;
    if(dy>0){ e.preventDefault(); el.style.transform='translateY('+dy+'px)'; }
  },{passive:false});
  el.addEventListener('touchend',function(){
    if(!dragging) return; dragging=false; el.style.transition='';
    if(dy>70){ closeFn(); } else { el.style.transform=''; }
  });
}
makeSheetSwipe(settingsSheet,closeSettings);
makeSheetSwipe(document.getElementById('regionSheet'),closeRegion);
makeSheetSwipe(document.getElementById('sortSheet'),closeSort);
settingsBackdrop.addEventListener('click',closeSort);
settingsBackdrop.addEventListener('click',closeTown);
makeSheetSwipe(document.getElementById('townSheet'),closeTown);
settingsBackdrop.addEventListener('click',closeGroup);
function openVersions(){ settingsBackdrop.classList.add('on'); const vs=document.getElementById('versionsSheet'); vs.classList.add('on'); vs.scrollTop=0; lockScroll(); }
function closeVersions(){ const vs=document.getElementById('versionsSheet'); settingsBackdrop.classList.remove('on'); vs.classList.remove('on'); vs.style.transform=''; unlockScroll(); }
settingsBackdrop.addEventListener('click',closeVersions);
makeSheetSwipe(document.getElementById('versionsSheet'),closeVersions);
document.getElementById('verBtn').addEventListener('click',function(e){ e.stopPropagation(); buzz(6); openVersions(); });
makeSheetSwipe(document.getElementById('groupSheet'),closeGroup);
document.getElementById('groupPill').addEventListener('click',function(){ buzz(6); openGroup(); });
document.getElementById('sortPill').addEventListener('click',function(){ buzz(6); openSort(); });
settingsBackdrop.addEventListener('click',closeRegion);
document.getElementById('regionPill').addEventListener('click',function(){ buzz(6); openRegion(); });
makeSheetSwipe(sheet,closeSheet);


/* ================= boot ================= */
(async function(){
  applyAppearance();
  buildDots(); load(); migrateAlgonquin(); migrateScale5();
  loadParksEmbedded(); renderFilters(); buildSearchIndex(); wireGlobalSearch(); renderThemePicker();
  (function(){ var ab=document.querySelector('.about-scout'); if(!ab) return;
    var body=ab.querySelector('.body'); if(body) body.addEventListener('click',function(){ ab.removeAttribute('open'); }); })();
  renderParks();                 /* instant first paint, no network wait */
  await loadPhotoIndex();        /* fast local IndexedDB */
  migrateAlgPhotos();
  refreshParksFromNetwork();     /* background: pick up any hosted data update */
})();
(function(){ /* #park=<id> deep links, from the map pins and the fishing app */
  function fromHash(){
    var m=(location.hash||'').match(/park=([a-z0-9]+)/); if(!m) return;
    var pid=m[1]; if(!PARK_BY_ID[pid]) return;
    if(pid===EGG_ID&&!eggFound()) revealEgg();
    if(window.sjCloseMap) sjCloseMap();
    openPark(pid);
    history.replaceState(null,'',location.pathname+location.search); }
  window.addEventListener('hashchange',fromHash);
  fromHash();
})();
if('serviceWorker' in navigator){
  if(window.Capacitor){
    /* inside the iOS app the files are local; a service worker only serves stale copies. Kill any old one. */
    try{ navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())); }catch(e){}
    try{ if(window.caches&&caches.keys) caches.keys().then(ks=>ks.forEach(k=>caches.delete(k))); }catch(e){}
  } else {
    window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
  }
}
