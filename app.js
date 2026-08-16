/* Appearance is stamped pre-paint by the inline script in index.html <head>,
   from the shared 'outdoors-appearance' key. The panel wiring lives below. */

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
var APP_VERSION='0.214';

/* ================= language =================
   English is the default; French is a choice in More. The dictionary is
   keyed by the English string, so TL('Journal') is the whole API: a string
   with no entry simply stays as written. Park and campground names are
   data, never translated. Static markup carries data-i18n="<english>" and
   is walked by applyLang() at boot and on every change. */
var LANG_KEY='oncamp-lang';
var LANG='en';
try{ var _lg=localStorage.getItem(LANG_KEY); if(_lg==='fr'||_lg==='en') LANG=_lg; }catch(e){}
var FR={
  /* tabs and screens */
  'Guide':'Guide','Map':'Carte','Journal':'Journal','More':'Plus','Account':'Compte','Photos':'Photos',
  'Parks':'Parcs','Shared with you':'Partagé avec vous',
  /* map */
  'Fishing zones':'Zones de pêche',
  'Find my location':'Trouver ma position',
  /* search */
  'Search':'Recherche','Search parks and sites':'Chercher parcs et emplacements',
  'No matches. Try a park, a campground, or Hemlock 112.':'Aucun résultat. Essayez un parc, un terrain ou Hemlock 112.',
  'Campgrounds':'Terrains de camping','Sites':'Emplacements','Trails':'Sentiers','Cancel':'Annuler',
  /* account and journal */
  'Parks visited':'Parcs visités','Ratings':'Évaluations','Average rating':'Note moyenne',
  'Favourites':'Favoris','Name':'Nom','Your name':'Votre nom',
  'Legal':'Mentions légales','Privacy policy':'Politique de confidentialité',
  'What stays on this device, and what does not':'Ce qui reste sur cet appareil, et ce qui n’y reste pas',
  'Terms of use':'Conditions d’utilisation',
  'Including what this app is not safe for':'Y compris ce pour quoi cette appli n’est pas sûre',
  'Support':'Assistance','Help, and how to reach me':'Aide, et comment me joindre',
  'Not affiliated with Ontario Parks, the Government of Ontario or Apple. Book through their official channels. Map images come from CARTO using OpenStreetMap data.':'Sans lien avec Parcs Ontario, le gouvernement de l’Ontario ou Apple. Réservez par leurs canaux officiels. Les images de carte viennent de CARTO à partir des données OpenStreetMap.',
  'Parks in guide':'Parcs dans le guide','Version':'Version',
  'Browse the parks':'Parcourir les parcs',
  /* settings */
  'Appearance':'Apparence','Theme':'Thème','Auto':'Auto','Light':'Clair','Dark':'Sombre',
  'Text size':'Taille du texte','Small':'Petit','Medium':'Moyen','Large':'Grand','Extra large':'Très grand',
  'Language':'Langue','English':'English','Français':'Français',
  'Add a favourite':'Ajouter aux favoris','Remove from favourites':'Retirer des favoris',
  'Favourite':'Favori','Favourited':'En favori',
  'Loading':'Chargement',
  'of':'sur','sites rated':'emplacements évalués','average':'de moyenne',
  'Saved to your journal':'Enregistré dans votre journal','Saved to your favourites':'Ajouté à vos favoris',
  'Site':'Emplacement','Every park, campground, site and trail in the guide.':'Chaque parc, terrain, emplacement et sentier du guide.',
  /* guide and park screens */
  'All parks A to Z':'Tous les parcs de A à Z','All regions':'Toutes les régions',
  'Wishlist':'Liste de souhaits','Top sites':'Meilleurs emplacements','Stats':'Statistiques',
  'Campground review':'Avis sur le terrain','Campground':'Terrain de camping',
  'North':'Nord','Central':'Centre','South':'Sud','East':'Est','West':'Ouest',
  /* messages */
  'Backup exported. Keep it somewhere safe.':'Sauvegarde exportée. Gardez-la en lieu sûr.',
  'Backup restored. Welcome back.':'Sauvegarde restaurée. Bon retour.',
  'Add a rating or a note first':'Ajoutez d’abord une note ou un commentaire',
  'Park data could not be loaded.':'Les données des parcs n’ont pas pu être chargées.',
  /* learn */
  'Bear safety and food storage':'Sécurité avec les ours et rangement des aliments',
  'Campfire safety':'Sécurité des feux de camp'
};
function TL(s){ return (LANG==='fr'&&FR[s])||s; }
window.TL=TL;
function setLang(v){
  if(v!=='en'&&v!=='fr') return;
  LANG=v;
  try{ localStorage.setItem(LANG_KEY,v); }catch(e){}
  applyLang();
  renderAppearancePanel();
  /* redraw whatever is on screen, in place */
  try{ if(typeof renderAccount==='function') renderAccount(); }catch(e){}
  try{ if(typeof renderJournal==='function') renderJournal(); }catch(e){}
  try{ if(typeof fillAboutStats==='function') fillAboutStats(); }catch(e){}
  try{ if(window.renderCampMapChips) window.renderCampMapChips(); }catch(e){}
}
/* translate every tagged node in the static markup */
function applyLang(){
  document.documentElement.lang=LANG;
  document.querySelectorAll('[data-i18n]').forEach(function(el){
    el.textContent=TL(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(function(el){
    el.setAttribute('placeholder',TL(el.getAttribute('data-i18n-ph')));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(function(el){
    el.setAttribute('aria-label',TL(el.getAttribute('data-i18n-aria')));
  });
}
/* fishing regulations live in the sibling on-fishing app; from the iOS shell
   the link opens in Safari (the old bundled fishing/ copy no longer ships) */
const FISHREG_BASE='https://katsuma0.github.io/on-fishing/';
try{ history.scrollRestoration='manual'; }catch(e){} /* every open starts at the top */
function load(){ try{ const v=localStorage.getItem(KEY); if(v) state=Object.assign({site:{},campground:{},trail:{}},JSON.parse(v)); }catch(e){}
  /* pins are no longer shown anywhere, but the list a reader built is theirs
     and stays in the record; the stats console still counts it */
  if(!Array.isArray(state.pins)) state.pins=[];
  if(!state.touched||typeof state.touched!=='object'||Array.isArray(state.touched)) state.touched={}; }
const EGG_ID='queenelizabethii';
function eggFound(){ return !!state.eggQE2; }
function parkVisible(p){ return p.id!==EGG_ID||eggFound(); }
function revealEgg(){ if(eggFound()) return; state.eggQE2=true; persist(); buildSearchIndex(); renderParks(); buzz(12);
  showThemeToast('Hidden park revealed. Welcome to the Wildlands.'); }
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
function scoreColor(s){ return (typeof s==='number'&&s>=0&&s<=5)?('color-mix(in srgb, '+STOPS[s]+' 86%, var(--tint))'):null; }
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
  /* Universal search: typing a fish surfaces the parks that have it. */
  if(window.ECO && nameQ && !siteTok.length){
    const ECO=window.ECO, keys=Object.keys(ECO.fish);
    const matched=keys.filter(k=>{ const f=ECO.fish[k];
      return f.syn.concat([f.name.toLowerCase()]).some(n=>n===nameQ||n.startsWith(nameQ)||(nameQ.length>=4&&n.indexOf(nameQ)>=0)); });
    if(matched.length){
      const have=new Set(res.filter(r=>r.type==='park').map(r=>r.parkId));
      ECO.parks.forEach(pk=>{
        const hit=pk.fish.find(fk=>matched.indexOf(fk)>=0);
        if(!hit||have.has(pk.id)) return; have.add(pk.id);
        res.push({type:'park',score:55,parkId:pk.id,title:pk.name,
          sub:ECO.fish[hit].name+' · '+(((pk.region||'').split(' · ').slice(1).join(' · '))||pk.region)});
      });
    }
  }
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
  // Data-planting QA commands (dummydata / dummyhundop) are not wired into the
  // shipped build: they overwrite real ratings and must not be reachable by a
  // stray keystroke. The functions remain for local testing only.
  if(['forlaurie','for laurie','tolaurie','to laurie'].indexOf(q.trim().toLowerCase())>=0){ renderLaurie(); return; }
  document.getElementById('gsearch').classList.toggle('has',!!q.trim());
  const rbox=document.getElementById('gresults'), hint=document.getElementById('searchHint');
  if(!q.trim()){ rbox.hidden=true; rbox.innerHTML=''; if(hint) hint.hidden=false; return; }
  rbox.hidden=false; if(hint) hint.hidden=true;
  const results=searchAll(q);
  if(!results.length){ rbox.innerHTML='<div class="gnone">'+TL('No matches. Try a park, a campground, or Hemlock 112.')+'</div>'; return; }
  /* grouped by kind, the way Settings answers a search: a small label, then
     the rows it owns. The ranked order inside each group is left alone. */
  const groupLabel={park:'Parks',cg:'Campgrounds',site:'Sites',trail:'Trails'};
  const order=['park','cg','site','trail'];
  let ghtml='';
  order.forEach(function(kind){
    const rows=results.filter(r=>r.type===kind);
    if(!rows.length) return;
    ghtml+='<div class="seclabel">'+TL(groupLabel[kind])+'</div><div class="ios-group">';
    rows.forEach(function(r){
      const i=results.indexOf(r);
      ghtml+='<button class="gresult ios-row ios-row--plain" data-i="'+i+'">'+
        '<span class="ios-row-body"><span class="ios-row-title">'+r.title+'</span>'+
        '<span class="ios-row-sub">'+r.sub+'</span></span>'+CHEV_RIGHT+'</button>';
    });
    ghtml+='</div>';
  });
  rbox.innerHTML=ghtml;
  rbox.querySelectorAll('.gresult').forEach(el=>el.addEventListener('click',()=>gotoResult(results[+el.dataset.i])));
}
function clearGSearch(){ const gq=document.getElementById('gq'); if(gq) gq.value='';
  const w=document.getElementById('gsearch'); if(w) w.classList.remove('has');
  const rb=document.getElementById('gresults'); if(rb){ rb.hidden=true; rb.innerHTML=''; }
  const hint=document.getElementById('searchHint'); if(hint) hint.hidden=false; }
function esc(x){ return String(x).replace(/</g,'&lt;'); }
function renderConsole(cmd,pairs){
  const rbox=document.getElementById('gresults');
  rbox.hidden=false;
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
  const rbox=document.getElementById('gresults');
  rbox.hidden=false;
  rbox.innerHTML='<div class="dbg"><div class="dhead">&gt; dummydata</div>'
    +'<div class="drow"><span class="dk">status</span><span class="dv">'+esc(msg||'ready, nothing planted')+'</span></div>'
    +'<button class="dummybtn" id="dummyGo">'+(msg?'Plant again, reshuffled':'Plant dummy data')+'</button></div>';
  const go=document.getElementById('dummyGo');
  if(go) go.addEventListener('click',()=>{ buzz(9); const m=plantDummy(); renderDummyCard(m); });
}
function renderHundCard(msg){
  const rbox=document.getElementById('gresults');
  rbox.hidden=false;
  rbox.innerHTML='<div class="dbg"><div class="dhead">&gt; dummyhundop</div>'
    +'<div class="drow"><span class="dk">status</span><span class="dv">'+esc(msg||'ready, overwrites every rating')+'</span></div>'
    +'<button class="dummybtn" id="hundGo">'+(msg?'Run again':'Max everything to 5/5')+'</button></div>';
  const go=document.getElementById('hundGo');
  if(go) go.addEventListener('click',()=>{ buzz(12); const m=plantHund(); renderHundCard(m); });
}
function renderLaurie(){
  const rbox=document.getElementById('gresults');
  rbox.hidden=false;
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
  const rbox=document.getElementById('gresults');
  rbox.hidden=false;
  rbox.innerHTML='<div class="dbg"><div class="dhead">&gt; -dummyhundop</div>'
    +'<div class="drow"><span class="dk">status</span><span class="dv">'+esc(msg||'ready, the worst season imaginable')+'</span></div>'
    +'<button class="dummybtn" id="zeroGo" style="background:var(--red)">'+(msg?'Run again':'Zero everything')+'</button></div>';
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
/* has the user touched this park at all: a rating, wishlist, note or photo */
function parkTouchInfo(p){
  var rated=0,total=0,sum=0,touched=false;
  p.campgrounds.forEach(function(cg){ cgSites(cg).forEach(function(s){ total++;
    var k=keyOf(p.id,cg.id,s), e=state.site[k];
    if(e){ if(typeof e.score==='number'){ rated++; sum+=e.score; touched=true; }
      if(e.want||e.note) touched=true; } }); });
  if(!touched){ for(var ck in state.campground){ if(ck.indexOf(p.id+'#')===0){ var ce=state.campground[ck];
    if(ce&&(typeof ce.score==='number'||ce.note)){ touched=true; break; } } } }
  if(!touched){ for(var tk in state.trail){ if(tk.indexOf(p.id+'#')===0){ var te=state.trail[tk];
    if(te&&(typeof te.score==='number'||te.note)){ touched=true; break; } } } }
  if(!touched){ photoKeys.forEach(function(pk){ if(String(pk).indexOf(p.id+'#')===0) touched=true; }); }
  return {rated:rated,total:total,avg:rated?sum/rated:0,touched:touched};
}
/* recency stamp so My parks and the Journal can lead with the latest park */
function touchPark(pid){ if(!state.touched||typeof state.touched!=='object') state.touched={}; state.touched[pid]=Date.now(); }

var PARK_LL={"aaron":[49.77,-92.62],"algonquinachray":[45.87,-77.72],"algonquinbrent":[46.03,-78.49],"algonquincanisbay":[45.57,-78.62],"algonquinkearney":[45.54,-78.45],"algonquinkiosk":[46.09,-78.88],"algonquinmew":[45.57,-78.52],"algonquinpog":[45.57,-78.44],"algonquinraccoon":[45.53,-78.42],"algonquinrock":[45.50,-78.40],"algonquintea":[45.53,-78.70],"algonquintworivers":[45.58,-78.48],"arrowhead":[45.39,-79.20],"awenda":[44.85,-79.99],"balsamlake":[44.65,-78.93],"basslake":[44.60,-79.47],"batchawanabay":[46.93,-84.61],"bluelake":[49.86,-93.42],"bonecho":[44.90,-77.20],"bonnechere":[45.68,-77.55],"boynevalley":[44.13,-80.13],"brontecreek":[43.41,-79.77],"caliperlake":[49.06,-93.91],"charlestonlake":[44.50,-76.03],"chutes":[46.22,-81.76],"craigleith":[44.54,-80.34],"darlington":[43.87,-78.77],"devilsglen":[44.36,-80.18],"driftwood":[46.20,-77.85],"earlrowe":[44.15,-79.90],"emily":[44.38,-78.53],"eskerlakes":[48.32,-79.88],"fairbank":[46.47,-81.45],"ferris":[44.28,-77.79],"finlaysonpoint":[47.31,-79.79],"fitzroy":[45.47,-76.21],"forksofthecredit":[43.80,-80.01],"frenchriver":[46.02,-80.58],"frontenac":[44.55,-76.53],"fushimilake":[49.83,-83.92],"grundy":[45.93,-80.55],"halfwaylake":[46.90,-81.63],"inverhuron":[44.29,-81.58],"ivanhoelake":[48.13,-82.53],"johnepearce":[42.63,-81.47],"kakabekafalls":[48.40,-89.62],"kawarthahighlands":[44.73,-78.18],"kettlelakes":[48.57,-80.87],"killarney":[46.02,-81.40],"killbear":[45.36,-80.21],"komoka":[42.96,-81.42],"lakestpeter":[45.32,-78.03],"lakesuperior":[47.35,-84.63],"longpoint":[42.58,-80.39],"macgregorpoint":[44.40,-81.44],"macleod":[49.72,-86.95],"makobegrays":[47.90,-80.50],"mara":[44.60,-79.28],"markburnham":[44.31,-78.26],"martenriver":[46.73,-79.79],"mcraepoint":[44.60,-79.30],"mikisew":[45.83,-79.38],"miserybay":[45.79,-82.75],"missinaibi":[48.35,-83.68],"mississagi":[46.72,-82.66],"monocliffs":[44.03,-80.06],"murphyspoint":[44.78,-76.43],"nagagamisis":[49.47,-84.68],"neys":[48.78,-86.60],"northbeach":[43.94,-77.55],"oastlerlake":[45.29,-80.04],"obabikariver":[47.05,-80.15],"ojibway":[49.97,-92.14],"ouimetcanyon":[48.77,-88.67],"oxtongueriver":[45.41,-78.89],"pakwash":[50.77,-93.43],"pancakebay":[46.97,-84.70],"petroglyphs":[44.62,-78.05],"pigeonriver":[48.00,-89.58],"pinery":[43.25,-81.83],"pointfarms":[43.81,-81.71],"portbruce":[42.65,-81.01],"portburwell":[42.65,-80.81],"potholes":[47.96,-84.27],"presquile":[44.00,-77.73],"queenelizabethii":[44.83,-78.72],"quetico":[48.68,-91.13],"rainbowfalls":[48.84,-87.40],"renebrunelle":[49.42,-82.18],"restoule":[46.06,-79.78],"rideauriver":[45.13,-75.65],"rockpoint":[42.85,-79.54],"rondeau":[42.29,-81.85],"rushingriver":[49.68,-94.22],"samueldechamplain":[46.28,-78.92],"sandbanks":[43.90,-77.24],"sandbarlake":[49.62,-91.55],"saublefalls":[44.68,-81.26],"selkirk":[42.83,-79.94],"sharbotlake":[44.77,-76.69],"shorthills":[43.10,-79.28],"sibbaldpoint":[44.32,-79.33],"silentlake":[44.91,-78.06],"silverfalls":[48.58,-89.62],"silverlake":[44.83,-76.58],"siouxnarrows":[49.40,-94.07],"sixmilelake":[44.90,-79.77],"sleepinggiant":[48.34,-88.90],"solace":[47.10,-80.30],"spanishriver":[46.85,-81.90],"springwater":[44.43,-79.73],"sturgeonbay":[45.59,-80.42],"sturgeonriver":[46.87,-80.05],"themassasauga":[45.19,-80.05],"tidewater":[51.26,-80.63],"turkeypoint":[42.71,-80.33],"voyageur":[45.59,-74.52],"wabakimi":[50.60,-89.80],"wakamilake":[47.65,-82.80],"wasagabeach":[44.52,-80.02],"wheatley":[42.09,-82.45],"whitelake":[48.76,-85.76],"windylake":[46.61,-81.45],"woodlandcaribou":[51.10,-94.80]};
function havKm(a,b,c,d){ var R=6371,dl=(c-a)*Math.PI/180,dg=(d-b)*Math.PI/180;
  var x=Math.sin(dl/2)*Math.sin(dl/2)+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dg/2)*Math.sin(dg/2);
  return 2*R*Math.asin(Math.sqrt(x)); }
function broadOf(p){ return (p.region||'').split(' \u00b7 ')[0].replace(' Park','').trim()||'Other'; }
function regionOrder(){ const found=new Set(PARKS.map(broadOf));
  const order=['All','Algonquin','Central','Near North','Northern','Southeast','Southwest'].filter(r=>r==='All'||found.has(r));
  found.forEach(r=>{ if(order.indexOf(r)<0) order.push(r); }); return order; }

/* Parks tab: My parks (touched parks, most recent first), then every park in
   one A to Z list with sticky letter heads and a Contacts style letter rail. */
function regionChipsHtml(){
  return '<div class="filters">'+regionOrder().map(function(r){
    return '<button class="fchip'+(r===regionFilter?' on':'')+'" type="button" data-region="'+r+'">'+
      '<span class="fct">'+(r==='All'?'All regions':r)+'</span></button>'; }).join('')+'</div>';
}

/* ================= favourites =================
   An explicit list, kept apart from the derived Visited list: a favourite
   is something the reader chose, a visit is something the app noticed.
   Parks and individual campsites can both be favourited. */
var FAV_KEY='oncamp-favs';
var FAVS={parks:{},sites:{}};
try{
  var _fv=JSON.parse(localStorage.getItem(FAV_KEY)||'null');
  if(_fv&&typeof _fv==='object'){ FAVS.parks=_fv.parks||{}; FAVS.sites=_fv.sites||{}; }
}catch(e){}
function saveFavs(){ try{ localStorage.setItem(FAV_KEY,JSON.stringify(FAVS)); }catch(e){} }
function isFav(kind,id){ return !!(FAVS[kind]&&FAVS[kind][id]); }
function toggleFav(kind,id){
  if(!FAVS[kind]) FAVS[kind]={};
  if(FAVS[kind][id]) delete FAVS[kind][id]; else FAVS[kind][id]=1;
  saveFavs();
  return isFav(kind,id);
}
/* Favourites took the place pins used to hold, so a park pinned before this
   round arrives as a favourite instead of quietly disappearing. Once only,
   and the pin list itself is left where it is. */
var PIN_FAV_KEY='oncamp-pins-to-favs';
function migratePinsToFavs(){
  try{ if(localStorage.getItem(PIN_FAV_KEY)) return; }catch(e){ return; }
  if(Array.isArray(state.pins)) state.pins.forEach(function(pid){ if(!FAVS.parks[pid]) FAVS.parks[pid]=1; });
  saveFavs();
  try{ localStorage.setItem(PIN_FAV_KEY,'1'); }catch(e){}
}
/* the heart itself: a real button, 44px of target, filled when it is on */
function favBtnHtml(kind,id){
  var on=isFav(kind,id);
  return '<span class="favbtn'+(on?' on':'')+'" role="button" tabindex="0"'+
    ' data-fav="'+kind+'" data-favid="'+String(id).replace(/"/g,'&quot;')+'"'+
    ' aria-pressed="'+(on?'true':'false')+'"'+
    ' aria-label="'+(on?TL('Remove from favourites'):TL('Add a favourite'))+'">'+
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5 4.6 13.3a4.6 4.6 0 1 1 6.5-6.5l.9.9.9-.9a4.6 4.6 0 1 1 6.5 6.5z"/></svg></span>';
}
/* The park page is the only place a park can be favourited, so the control
   says so in words rather than leaving a bare glyph to be read. It carries
   no data-fav hook: it is wired on its own, in wireParkControls. */
function parkFavHtml(pid){
  var on=isFav('parks',pid);
  return '<button class="favpill'+(on?' on':'')+'" id="favBtn" type="button" aria-pressed="'+(on?'true':'false')+'">'+
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5 4.6 13.3a4.6 4.6 0 1 1 6.5-6.5l.9.9.9-.9a4.6 4.6 0 1 1 6.5 6.5z"/></svg>'+
    '<span class="favpill-t">'+(on?TL('Favourited'):TL('Favourite'))+'</span></button>';
}
/* one delegated listener: hearts live inside rows that are themselves buttons */
document.addEventListener('click',function(ev){
  var h=ev.target.closest?ev.target.closest('[data-fav]'):null;
  if(!h) return;
  ev.preventDefault(); ev.stopPropagation();
  toggleFav(h.getAttribute('data-fav'),h.getAttribute('data-favid'));
  buzz(6);
  renderParks();
},true);


/* favourited campsites, listed under the favourite parks. The stored id is
   the same key the ratings use, so a favourite survives every re-render. */
function favSiteRows(visible){
  var ids=Object.keys(FAVS.sites||{});
  if(!ids.length) return '';
  var rows='';
  visible.forEach(function(p){
    (p.campgrounds||[]).forEach(function(c){
      cgSites(c).forEach(function(s){
        var k=keyOf(p.id,c.id,s);
        if(!isFav('sites',k)) return;
        var score=sc('site',k);
        var val=(score!=null)?score+'/5':'';
        rows+='<button class="ios-row ios-row--plain" type="button" data-park="'+p.id+'" data-cg="'+c.id+'">'+
          '<span class="ios-row-body"><span class="ios-row-title">'+TL('Site')+' '+s+'</span>'+
          '<span class="ios-row-sub">'+p.name+' · '+c.id+'</span></span>'+
          (val?'<span class="ios-row-value tnum">'+val+'</span>':'')+
          favBtnHtml('sites',k)+CHEV_RIGHT+'</button>';
      });
    });
  });
  return rows;
}

/* No heart on a park row: the list is a long scroll and the target sat right
   under a scrolling thumb. A park is favourited on its own page. */
function parkRowHtml(p,st,sub,value){
  return '<button class="ios-row ios-row--plain" type="button" data-park="'+p.id+'">'+
    '<span class="ios-row-body"><span class="ios-row-title">'+p.name+'</span>'+
    (sub?'<span class="ios-row-sub">'+sub+'</span>':'')+'</span>'+
    (value?'<span class="ios-row-value tnum">'+value+'</span>':'')+CHEV_RIGHT+'</button>';
}
function renderParks(){ const box=document.getElementById('parkList'); if(!box) return; box.innerHTML='';
  if(!PARKS.length){ box.innerHTML=`<div class="empty" style="border:1px solid var(--separator);border-radius:var(--r);background:var(--bg-elevated);padding:26px 18px">Park data could not be loaded.<br>Check your connection and reopen the app.</div>`; renderAzRail([]); return; }
  const visible=PARKS.filter(parkVisible);
  const info={}; visible.forEach(p=>{ info[p.id]=parkTouchInfo(p); });
  const ts=state.touched||{};
  let html='';
  /* One section, not two. Favourites and Visited held the same kind of park
     and a park in both appeared twice. Everything the reader has a reason to
     come back to sits under Favourites now: the ones they picked out first,
     A to Z, then the ones they have rated or written in, most recent first,
     then their favourite campsites. The row's own line says which it is. */
  const favParks=visible.filter(p=>isFav('parks',p.id))
    .sort((a,b)=>a.name.localeCompare(b.name));
  const mine=visible.filter(p=>info[p.id].touched&&!isFav('parks',p.id))
    .sort((a,b)=>((ts[b.id]||0)-(ts[a.id]||0))||a.name.localeCompare(b.name));
  const favSites=favSiteRows(visible);
  if(favParks.length||mine.length||favSites){
    const row=(p,fallback)=>{ const st=info[p.id];
      const sub=st.rated>0
        ?st.rated+' '+TL('of')+' '+st.total+' '+TL('sites rated')+' · '+st.avg.toFixed(1)+' '+TL('average')
        :TL(fallback);
      return parkRowHtml(p,st,sub,''); };
    html+='<div class="seclabel">'+TL('Favourites')+'</div><div class="ios-group" id="favParks">'+
      favParks.map(p=>row(p,'Saved to your favourites')).join('')+
      mine.map(p=>row(p,'Saved to your journal')).join('')+
      favSites+'</div>';
  }
  /* all parks, one flat alphabetical list split by first letter */
  html+='<div class="seclabel">'+TL('All parks A to Z')+'</div>'+regionChipsHtml();
  const shown=((regionFilter==='All')?visible:visible.filter(p=>broadOf(p)===regionFilter))
    .slice().sort((a,b)=>a.name.localeCompare(b.name));
  const letters=[], byLetter={};
  shown.forEach(p=>{ const L=p.name[0].toUpperCase();
    if(!byLetter[L]){ byLetter[L]=[]; letters.push(L); } byLetter[L].push(p); });
  letters.forEach(L=>{
    html+='<div class="az-sec" id="az-'+L+'"><div class="az-head">'+L+'</div><div class="ios-group">'+
      byLetter[L].map(p=>{ const st=info[p.id];
        const town=(p.region||'').split(' · ').slice(1).join(' · ');
        const sub=broadOf(p)+(town?' · '+town:'');
        return parkRowHtml(p,st,sub,st.rated>0?st.rated+' rated':''); }).join('')+
      '</div></div>';
  });
  if(!shown.length) html+='<div class="empty">No parks in this region.</div>';
  box.innerHTML=html;
  box.querySelectorAll('[data-park]').forEach(b=>b.addEventListener('click',()=>openPark(b.dataset.park)));
  box.querySelectorAll('.fchip[data-region]').forEach(b=>b.addEventListener('click',()=>{ regionFilter=b.dataset.region; buzz(6); renderParks(); }));
  renderAzRail(letters);
}
/* the letter rail: fixed at the right edge, tap or drag to jump to a letter */
function syncAzRail(){ const rail=document.getElementById('azRail'), pl=document.getElementById('parkList');
  if(rail) rail.hidden=!rail.childElementCount||!pl||pl.hidden; }
function renderAzRail(letters){ const rail=document.getElementById('azRail'); if(!rail) return;
  rail.innerHTML=letters.map(L=>'<span data-l="'+L+'">'+L+'</span>').join('');
  syncAzRail(); }
(function(){ const rail=document.getElementById('azRail'); if(!rail) return;
  let active=false, lastL=null;
  function jump(L){ if(!L||L===lastL) return; lastL=L;
    const sec=document.getElementById('az-'+L); if(!sec) return;
    const head=document.getElementById('iosHeader');
    const off=(head&&!head.hidden?head.offsetHeight:0)+2;
    window.scrollTo(0,Math.max(0,sec.getBoundingClientRect().top+window.scrollY-off)); buzz(4); }
  function letterAt(y){ const r=rail.getBoundingClientRect();
    const el=document.elementFromPoint((r.left+r.right)/2,Math.min(r.bottom-1,Math.max(r.top+1,y)));
    return (el&&el.dataset)?el.dataset.l:null; }
  rail.addEventListener('pointerdown',function(e){ e.preventDefault(); active=true; lastL=null;
    try{ rail.setPointerCapture(e.pointerId); }catch(x){} jump(letterAt(e.clientY)); });
  rail.addEventListener('pointermove',function(e){ if(active) jump(letterAt(e.clientY)); });
  ['pointerup','pointercancel'].forEach(t=>rail.addEventListener(t,function(){ active=false; }));
})();

/* ================= single park ================= */
let curPark=null; var homeScrollY=0;
function facilChip(name){ return `<span class="facil"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l4 4 10-10"/></svg>${name}</span>`; }
function openPark(pid){
  curPark=PARK_BY_ID[pid]; const p=curPark; const st=parkStats(p);
  document.getElementById('parkBody').innerHTML=`
    <div class="park-head"><div class="titlerow"><h2 id="parkTitle" style="cursor:pointer">${(p.region||'').indexOf('Algonquin')===0?p.name+', Algonquin':p.name}</h2>${parkFavHtml(p.id)}</div>
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
    <div id="parkProg"></div>
    ${p.dayuse?'':'<div class="seclabel">'+TL('Campgrounds')+'</div>'}
    <div id="cgs"></div>

    ${(p.trails&&p.trails.length)?'<div class="seclabel">'+TL('Trails')+'</div><div id="trails"></div>':''}
    <div id="wantSection" hidden><div class="seclabel">'+TL('Wishlist')+'</div><div id="wantList"></div></div>
    <div id="topSection" hidden><div class="seclabel">'+TL('Top sites')+'</div><ul class="rank" id="topSites"></ul></div>
    ${p.dayuse?'':`<div id="statsWrap" hidden><div class="seclabel">'+TL('Stats')+'</div>
    <details class="statscard"><summary>Park stats<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 9 6 6 6-6"/></svg></summary><div class="statsbody" id="statsBody"></div></details></div>`}
`;
  renderCgs(); renderTrails(); wireParkControls(); updatePark(); renderGlance();
  document.getElementById('parkTitle').addEventListener('click',function(){ onParkNameTap(p); });
  homeScrollY=window.scrollY||document.documentElement.scrollTop||0;
  setHeaderHidden(true);
  document.getElementById('view-parks').hidden=true; const vp=document.getElementById('view-park'); vp.hidden=false;
  vp.classList.remove('view-anim'); void vp.offsetWidth; vp.classList.add('view-anim'); window.scrollTo(0,0);
  if(window.parkResetSync) parkResetSync();
  requestAnimationFrame(()=>{ window.scrollTo(0,0); document.documentElement.scrollTop=0; document.body.scrollTop=0; });
}
function goHome(){ const vp=document.getElementById('view-park');
  vp.classList.add('view-out');
  setTimeout(function(){ vp.classList.remove('view-out'); vp.hidden=true;
    setHeaderHidden(false);
    const vh=document.getElementById('view-parks'); vh.hidden=false;
    vh.classList.remove('view-anim'); void vh.offsetWidth; vh.classList.add('view-anim');
    clearGSearch(); renderParks(); window.scrollTo(0,homeScrollY); if(window.parkResetSync) parkResetSync(); },150); }
document.getElementById('backBtn').addEventListener('click',function(){
  /* one clean slide, the same the swipe uses; never the double animation */
  if(window.sjExitPark){ window.sjExitPark(); } else { goHome(); } });
(function(){
  const rb=document.getElementById('resetBtn');
  /* the row is an .ios-row, so the confirm copy goes in the title span, not on the
     button itself, or writing textContent would wipe the tile and chevron out */
  const rbT=rb&&(rb.querySelector('.ios-row-title')||rb);
  if(rb){ let armed=false, t=null;
    rb.addEventListener('click',function(){
      if(!armed){ armed=true; rb.classList.add('armed'); rbT.textContent='Tap again to erase everything';
        t=setTimeout(function(){ armed=false; rb.classList.remove('armed'); rbT.textContent='Reset all data'; },4000); return; }
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
  /* the Account view carries a second pair of rows wired to the same actions */
  var exportRows=[eb,document.getElementById('acctExportBtn')].filter(Boolean);
  var importRows=[ib,document.getElementById('acctImportBtn')].filter(Boolean);
  function allPhotos(){ return openDB().then(function(db){ return new Promise(function(res){ var tx=db.transaction(STORE,'readonly');
    var rq=tx.objectStore(STORE).getAll(); rq.onsuccess=function(){ res(rq.result||[]); }; rq.onerror=function(){ res([]); }; }); }).catch(function(){ return []; }); }
  function buildBackup(){ return allPhotos().then(function(rows){
    var photos={}; rows.forEach(function(r){ if(r&&r.siteId&&Array.isArray(r.list)&&r.list.length) photos[r.siteId]=r.list; });
    var data={}; BK_KEYS.forEach(function(k){ try{ var v=localStorage.getItem(k); if(v!=null) data[k]=v; }catch(e){} });
    return {app:'site-journal',format:1,appVersion:'0.205',exported:new Date().toISOString(),data:data,photos:photos}; }); }
  function backupName(){ var d=new Date(); function p(n){ return (n<10?'0':'')+n; }
    return 'site-journal-backup-'+d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'.json'; }
  function exportDone(){ showThemeToast(TL('Backup exported. Keep it somewhere safe.')); }
  function downloadFile(file){ if(window.Capacitor){ showThemeToast('Sharing is not available right now. Try again.'); return; }
    var url=URL.createObjectURL(file); var a=document.createElement('a'); a.href=url; a.download=file.name;
    document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); },1200); exportDone(); }
  function deliver(file){
    if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
      return navigator.share({files:[file]}).then(exportDone).catch(function(err){ if(err&&err.name==='AbortError') return; downloadFile(file); }); }
    downloadFile(file); return Promise.resolve(); }
  var exBusy=false;
  function doExport(){ if(exBusy) return; exBusy=true;
    buildBackup().then(function(payload){ var file=new File([JSON.stringify(payload)],backupName(),{type:'application/json'}); return deliver(file); })
      .catch(function(){ showThemeToast('Could not build the backup. Try again.'); })
      .then(function(){ exBusy=false; }); }
  exportRows.forEach(function(b){ b.addEventListener('click',doExport); });
  var pendingPayload=null, armT=null;
  /* keep the tile and chevron, write into the title span only */
  function importTitles(){ return importRows.map(function(b){ return b.querySelector('.ios-row-title')||b; }); }
  function setImportLabel(t){ importTitles().forEach(function(el){ el.textContent=t; }); }
  function disarmImport(){ pendingPayload=null; clearTimeout(armT);
    importRows.forEach(function(b){ b.classList.remove('armed'); }); setImportLabel('Import a backup'); }
  importRows.forEach(function(b){ b.addEventListener('click',function(){
    if(pendingPayload){ clearTimeout(armT); applyBackup(pendingPayload); pendingPayload=null; return; }
    fi.value=''; fi.click(); }); });
  fi.addEventListener('change',function(){
    var f=fi.files&&fi.files[0]; if(!f) return;
    f.text().then(function(txt){ var p=null; try{ p=JSON.parse(txt); }catch(e){}
      if(!p||p.app!=='site-journal'||!p.data||typeof p.data['ontario-scout-v2']!=='string'){ showThemeToast('That file is not a Site Journal backup.'); return; }
      var n=0; try{ var s=JSON.parse(p.data['ontario-scout-v2']);
        ['site','campground','trail'].forEach(function(t){ var m=s&&s[t]||{}; for(var k in m){ if(m[k]&&typeof m[k].score==='number') n++; } }); }catch(e){}
      pendingPayload=p; importRows.forEach(function(b){ b.classList.add('armed'); });
      setImportLabel('Tap again to restore '+n+(n===1?' rating':' ratings'));
      armT=setTimeout(disarmImport,6000); })
      .catch(function(){ showThemeToast('Could not read that file.'); }); });
  function applyBackup(p){
    try{ clearTimeout(saveTimer); }catch(e){}
    BK_KEYS.forEach(function(k){ try{ if(typeof p.data[k]==='string') localStorage.setItem(k,p.data[k]); else localStorage.removeItem(k); }catch(e){} });
    var photos=(p.photos&&typeof p.photos==='object')?p.photos:{};
    openDB().then(function(db){ return new Promise(function(res){ var tx=db.transaction(STORE,'readwrite'); var st=tx.objectStore(STORE); st.clear();
      Object.keys(photos).forEach(function(k){ var list=photos[k]; if(Array.isArray(list)&&list.length) st.put({siteId:k,list:list}); });
      tx.oncomplete=function(){ res(); }; tx.onerror=function(){ res(); }; }); }).catch(function(){})
      .then(function(){ showThemeToast(TL('Backup restored. Welcome back.')); setTimeout(function(){ location.reload(); },900); }); }
})();
(function(){ /* interactive drag-back: the park page follows your finger and reveals home underneath */
  var vp=document.getElementById('view-park'), vh=document.getElementById('view-parks');
  var sx=0, sy=0, dx=0, lastX=0, lastT=0, vel=0, deciding=false, dragging=false, parkScrollY=0;
  function prep(){ parkScrollY=window.scrollY||document.documentElement.scrollTop||0;
    vp.classList.remove('view-anim'); vp.classList.add('dragback'); vp.style.top=(-parkScrollY)+'px';
    /* a pop reveal, not a tab switch: no glass-in under the finger. the
       class rides the view until the next tab switch clears it. */
    vh.classList.add('no-anim');
    vh.hidden=false; window.scrollTo(0,homeScrollY); }
  function cancel(){ vp.style.transition='transform .32s cubic-bezier(.22,1.28,.36,1)'; vp.style.transform='translateX(0)';
    setTimeout(function(){ window.scrollTo(0,parkScrollY); vh.hidden=true;
      vp.style.transition=''; vp.style.transform=''; vp.style.top=''; vp.classList.remove('dragback'); },230); }
  function complete(){ buzz(9);
    vp.style.transition='transform .26s cubic-bezier(.32,.72,.35,1)'; vp.style.transform='translateX(105%)';
    setTimeout(function(){ vp.style.transition=''; vp.style.transform=''; vp.style.top=''; vp.classList.remove('dragback'); vp.hidden=true;
      setHeaderHidden(false);
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
/* the trailing disclosure chevron on a grouped-list row; same sprite glyph the More screen uses */
const CHEV_RIGHT='<span class="ios-chevron"><svg aria-hidden="true"><use href="assets/icons.svg#chevron-right"/></svg></span>';
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
  const fb=document.getElementById('favBtn');
  if(fb){ fb.addEventListener('click',()=>{ const on=toggleFav('parks',curPark.id);
    fb.classList.toggle('on',on); fb.setAttribute('aria-pressed',on?'true':'false');
    const lbl=fb.querySelector('.favpill-t'); if(lbl) lbl.textContent=on?TL('Favourited'):TL('Favourite');
    buzz(9); renderParks(); }); }
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
  showThemeToast('Park data cleared.');
  openPark(pid); renderParks(); }

/* ================= sheet ================= */
/* ================= trails ================= */
function trailKey(name){ return curPark.id+'#'+name; }
function fmtLen(km){ return (km%1===0?km:km).toString()+' km'; }
function renderTrails(){
  const box=document.getElementById('trails'); if(!box) return; box.innerHTML='';
  const trails=curPark.trails||[];
  if(!trails.length){ box.innerHTML='<div class="empty" style="border:1px solid var(--separator);border-radius:var(--r);background:var(--bg-elevated);padding:20px 14px">No trails listed here yet.</div>'; return; }
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
  if(window.clearBtnSync) window.clearBtnSync();
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
function afterChange(){ touchPark(cur.k.split('#')[0]); persist();
  if(cur.type==='site'){ refreshChip(cur.k); refreshCgHeader(cur.cg); updatePark(); renderGlance(); }
  else if(cur.type==='trail'){ refreshTrailCard(cur.trailName); }
  else { refreshCgHeader(cur.cg); refreshParkRate(); } }
function setScore(v){ const e=ensure(); e.score=(e.score===v?null:v); buzz(9); paintDots(); flashSaved(); afterChange(); }
document.getElementById('wantBtn').addEventListener('click',function(){ const e=ensure(); e.want=!e.want; buzz(9);
  this.setAttribute('aria-pressed',e.want); this.textContent=(e.want?'★ ':'☆ ')+'Wishlist'; if(e.want&&e.score===0) showThemeToast("Added to your wishlist."); flashSaved(); touchPark(cur.k.split('#')[0]); persist(); if(cur.site) refreshChip(cur.k); renderGlance(); });
function autoGrowNotes(el){ el.style.height='auto'; el.style.height=Math.max(106,el.scrollHeight)+'px'; }
document.getElementById('d-notes').addEventListener('input',e=>{ autoGrowNotes(e.target); const en=ensure(); en.note=e.target.value; flashSaved(); touchPark(cur.k.split('#')[0]); persist(); if(cur.site) refreshChip(cur.k); else if(cur.type==='trail') refreshTrailCard(cur.trailName); });
(function(){
  var cb=document.getElementById('clearBtn'); if(!cb) return;
  var armed=false, t=null;
  function disarm(){ armed=false; clearTimeout(t); cb.classList.remove('armed'); cb.textContent='Clear'; }
  window.clearBtnSync=disarm;   // reset when the sheet reopens on another item
  cb.addEventListener('click',()=>{
    // Nothing saved for this item, so there is nothing to clear.
    if(!state[cur.type] || !state[cur.type][cur.k]){ return; }
    if(!armed){ armed=true; cb.classList.add('armed'); cb.textContent='Tap again to clear';
      t=setTimeout(disarm,4000); return; }
    disarm();
    delete state[cur.type][cur.k];
    const cnta=document.getElementById('d-notes'); cnta.value=''; autoGrowNotes(cnta);
    const wb=document.getElementById('wantBtn'); wb.setAttribute('aria-pressed',false); wb.textContent='☆ Wishlist';
    paintDots(); flashSaved(); afterChange();
  });
})();
document.getElementById('doneBtn').addEventListener('click',closeSheet);
backdrop.addEventListener('click',closeSheet);

/* ---- share a review (park / campground / site / trail) ------------------
   Builds a self-contained item so the whole review travels inside a
   #/shared/<data> link. share.js renders the card and opens the share sheet;
   the recipient sees the same card. No server, nothing tracked. */
function fmtMonthYear(iso){ var d=new Date(iso); if(isNaN(d)) return ''; return d.toLocaleDateString(undefined,{month:'long',year:'numeric'}); }
function reviewShareItem(){
  var type=cur.type, k=cur.k, score=sc(type,k), note=noteOf(type,k), kind, title, sub='';
  if(type==='site'){ kind='site'; title=curPark.name; sub='Site '+cur.site+(cur.cg&&cur.cg!==curPark.name?(' · '+cur.cg):''); }
  else if(type==='trail'){ kind='trail'; title=cur.cg; sub=curPark.name; }
  else { var isPark=(curPark.dayuse&&cur.cg===curPark.name); kind=isPark?'park':'campground'; title=curPark.name;
    sub=isPark?((curPark.region||'').split(' · ').slice(1).join(' · ')):cur.cg; }
  return { t:'camp-review', kind:kind, title:title, sub:sub,
    score:(score!=null?score:null), note:note?(note.length>200?note.slice(0,197)+'…':note):'',
    want:(type==='site'?wantOf(k):false), when:new Date().toISOString() };
}
function campCard(it){
  var kicker=it.kind==='site'?'Site review':it.kind==='trail'?'Trail review':it.kind==='park'?'Park review':'Campground review';
  var emoji=it.kind==='trail'?'🥾':'🏕️';
  var chips=[];
  if(it.score!=null){ var s=Math.max(0,Math.min(5,it.score|0)); chips.push({label:'★'.repeat(s)+'☆'.repeat(5-s)}); }
  if(it.want) chips.push({label:'Wishlist'});
  var sub=(it.sub&&it.sub!==it.title)?it.sub:'';
  return { eyebrow:'on-site', kicker:kicker, emoji:emoji, title:it.title, subtitle:sub,
    chips:chips.slice(0,4), meta:(it.when?('Reviewed '+fmtMonthYear(it.when)):'') };
}
function shareReview(){
  if(!cur.type||!cur.k) return;
  var score=sc(cur.type,cur.k), note=noteOf(cur.type,cur.k), want=(cur.type==='site'&&wantOf(cur.k));
  if(score==null && !note && !want){ if(typeof showThemeToast==='function') showThemeToast(TL('Add a rating or a note first')); return; }
  if(!window.OnShare){ if(typeof showThemeToast==='function') showThemeToast('Sharing is not available'); return; }
  var item=reviewShareItem();
  OnShare.share({ card:campCard(item), item:item,
    text:'My review of '+item.title+((item.sub&&item.sub!==item.title)?(' ('+item.sub+')'):'')+' on on-site.' })
    .then(function(r){ if(r==='fallback' && typeof showThemeToast==='function') showThemeToast('Link copied, card saved'); });
}
(function(){ var b=document.getElementById('shareReviewBtn'); if(b) b.addEventListener('click',function(){ if(typeof buzz==='function') buzz(6); shareReview(); }); })();

/* ---- receive a shared review (#/shared/<data>) ---- */
function showShared(item){
  ['view-parks','view-park','view-map','view-journal','view-more','view-account','view-photos','view-search'].forEach(function(id){ var el=document.getElementById(id); if(el) el.hidden=true; });
  var sec=document.getElementById('view-shared'); if(!sec) return;
  sec.hidden=false;
  var tb=document.getElementById('tabbar');
  if(tb) tb.querySelectorAll('.tab').forEach(function(b){ b.classList.remove('active'); b.removeAttribute('aria-current'); });
  var body=document.getElementById('sharedBody');
  if(!item || item.t!=='camp-review'){
    body.innerHTML='<p class="empty">This shared link could not be opened. It may be from a newer version of the app.</p>';
    try{ window.scrollTo(0,0); }catch(e){} return;
  }
  body.innerHTML='<div class="shared-card-wrap"><img id="shared-card-img" class="shared-card" alt="Shared '+esc(item.title||'review')+'"></div>'
    +(item.note?'<p class="shared-note">“'+esc(item.note)+'”</p>':'')
    +'<button class="btn-share primary" id="sh-explore" type="button">Explore Ontario parks</button>';
  if(window.OnShare) OnShare.makeCard(campCard(item)).then(function(b){ if(!b) return; var img=document.getElementById('shared-card-img'); if(img) img.src=URL.createObjectURL(b); });
  var ex=document.getElementById('sh-explore'); if(ex) ex.onclick=function(){ history.replaceState(null,'',location.pathname+location.search); showTab('guide'); };
  try{ window.scrollTo(0,0); }catch(e){}
}
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
  await putPhotos(k,list); e.target.value=''; buzz(9); touchPark(k.split('#')[0]); persist(); renderPhotos(k); if(cur.site) refreshChip(k); else if(cur.type==='trail') refreshTrailCard(cur.trailName); renderGlance(); btns.forEach(b=>b.disabled=false); }
document.getElementById('photoInput').addEventListener('change',handlePhotoFiles);
document.getElementById('cameraInput').addEventListener('change',handlePhotoFiles);
document.getElementById('cameraBtn').addEventListener('click',()=>document.getElementById('cameraInput').click());
document.getElementById('libraryBtn').addEventListener('click',()=>document.getElementById('photoInput').click());
function openLightbox(src){ document.getElementById('lightboxImg').src=src; document.getElementById('lightbox').classList.add('on'); }
document.getElementById('lightbox').addEventListener('click',()=>document.getElementById('lightbox').classList.remove('on'));

/* ================= progress + glance ================= */
function updatePark(){ renderParkStats(); renderParkProgress(); }
/* How much of this park you have actually walked and rated. A real fraction of a
   real number of sites, so the gap is honest, and the gap is what brings you back
   to finish the loop. Hidden until there is something to show: "0 of 212" on
   arrival is a chore, not an invitation. */
function renderParkProgress(){
  const p=curPark, box=document.getElementById('parkProg'); if(!p||!box) return;
  const st=parkStats(p);
  if(!st.rated||!st.total){ box.innerHTML=''; return; }
  box.innerHTML='<div class="pprog"><div class="pprog-top"><span>Sites rated here</span>'
    +'<span class="pprog-n tnum">'+st.rated+' of '+st.total+'</span></div>'
    +'<span class="pprog-bar"><span class="pprog-fill" style="width:'+Math.max(2,st.pct)+'%"></span></span></div>';
}
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
      h+='<div class="dbar"><span class="dl tnum">'+v+'</span><span class="dtrack"><i style="width:'+Math.max(c?6:0,w)+'%;background:'+(scoreColor(v)||'var(--tint)')+'"></i></span><span class="dc tnum">'+c+'</span></div>'; }
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
    : `<div class="empty">Star a site to build your booking shortlist.</div>`;
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
    if(meta) meta.setAttribute('content','#F2F2F7');
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
/* ---- appearance: one shared key for every outdoors app on this origin ----
   'outdoors-appearance' = { theme, glass, palette, face, size }. Theme, glass
   and text size land on <html> as data-theme / data-glass / data-textsize;
   this app wears the parks look only, so palette and face are read (and
   preserved for the sibling apps) but never stamped here.
   The <head> script stamps pre-paint; this block keeps it live from More. */
var APPEAR_KEY='outdoors-appearance';
var APPEAR_DEFAULTS={theme:'auto',glass:'on',palette:'parks',face:'parks',size:'m'};
var APPEAR_ALLOWED={theme:['auto','light','dark'],glass:['on','off'],palette:['parks','field','granite'],
  face:['parks','system','rounded','serif','avenir','mono'],size:['s','m','l','xl']};
function getAppearance(){
  var a={}; try{ a=JSON.parse(localStorage.getItem(APPEAR_KEY))||{}; }catch(e){ a={}; }
  var save=false;
  /* one time: face "system" saved before the parks round was the old
     default, not a choice, so it moves to the new default. saves made
     from the panel write v2, so a real System pick sticks. */
  if(a.face==='system'&&!a.v2){ delete a.face; a.v2=1; save=true; }
  if(a.palette==='shore'){ a.palette='parks'; save=true; }
  if(save){ try{ localStorage.setItem(APPEAR_KEY,JSON.stringify(a)); }catch(e){} }
  var out={};
  for(var k in APPEAR_DEFAULTS) out[k]=(APPEAR_ALLOWED[k].indexOf(a[k])>=0)?a[k]:APPEAR_DEFAULTS[k];
  return out;
}
function setAppearance(key,val){
  if(!APPEAR_ALLOWED[key]||APPEAR_ALLOWED[key].indexOf(val)<0) return;
  var a=getAppearance(); a[key]=val; a.v2=1;
  try{ localStorage.setItem(APPEAR_KEY,JSON.stringify(a)); }catch(e){}
  /* a settings tap re-renders in place: the class rides the mounted view so
     the entry animation never replays; the next tab switch clears it */
  document.querySelectorAll('#views > section:not([hidden])').forEach(function(el){ el.classList.add('no-anim'); });
  applyAppearance(); renderAppearancePanel();
  /* the map is built once and lives in a hidden tab, so it is told directly */
  try{ if(window.refreshCampMapTheme) window.refreshCampMapTheme(); }catch(e){}
}
function applyAppearance(){
  var a=getAppearance(), d=document.documentElement;
  function stamp(attr,val,def){ if(val!==def) d.setAttribute(attr,val); else d.removeAttribute(attr); }
  stamp('data-theme',a.theme,'auto');
  stamp('data-glass',a.glass,'on');
  /* this app wears the parks look only: stored palettes and faces from
     the sibling apps are read but never stamped here */
  d.removeAttribute('data-palette');
  d.removeAttribute('data-face');
  stamp('data-textsize',a.size,'m');
}
function apSeg(key,opts,cur,label){
  return '<div class="segmented ap-seg" role="group" aria-label="'+label+'">'+opts.map(function(o){
    var on=o[0]===cur;
    return '<button type="button" class="seg-opt'+(on?' on':'')+'" data-ap="'+key+'" data-val="'+o[0]+'"'
      +' aria-pressed="'+(on?'true':'false')+'" aria-label="'+(o[2]||o[1])+'">'+o[1]+'</button>'; }).join('')+'</div>';
}
function renderAppearancePanel(){
  var box=document.getElementById('appearancePanel'); if(!box) return;
  var a=getAppearance();
  /* theme and text size, nothing else: the look itself is not a choice
     here, this app simply wears its own colours and type */
  var html='';
  html+='<div class="ios-row ios-row--plain ap-row"><span class="ios-row-body"><span class="ios-row-title">'+TL('Theme')+'</span></span>'
    +apSeg('theme',[['auto',TL('Auto')],['light',TL('Light')],['dark',TL('Dark')]],a.theme,TL('Theme'))+'</div>';
  html+='<div class="ios-row ios-row--plain ap-row"><span class="ios-row-body"><span class="ios-row-title">'+TL('Text size')+'</span></span>'
    +apSeg('size',[['s','S',TL('Small')],['m','M',TL('Medium')],['l','L',TL('Large')],['xl','XL',TL('Extra large')]],a.size,TL('Text size'))+'</div>';
  /* language is this app's own choice, not a shared appearance key */
  html+='<div class="ios-row ios-row--plain ap-row"><span class="ios-row-body"><span class="ios-row-title">'+TL('Language')+'</span></span>'
    +'<div class="segmented ap-seg" role="group" aria-label="'+TL('Language')+'">'
    +'<button type="button" class="seg-opt'+(LANG==='en'?' on':'')+'" data-lang="en" aria-pressed="'+(LANG==='en'?'true':'false')+'">English</button>'
    +'<button type="button" class="seg-opt'+(LANG==='fr'?' on':'')+'" data-lang="fr" aria-pressed="'+(LANG==='fr'?'true':'false')+'">Français</button>'
    +'</div></div>';
  box.innerHTML=html;
  box.querySelectorAll('[data-lang]').forEach(function(b){
    b.addEventListener('click',function(){ setLang(b.dataset.lang); buzz(6); }); });
  box.querySelectorAll('[data-ap]').forEach(function(b){
    b.addEventListener('click',function(){ setAppearance(b.dataset.ap,b.dataset.val); buzz(6); }); });
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
function fillAboutStats(){
  var el=document.getElementById('aboutStats'); if(!el) return;
  var parks=PARKS.length, cgs=0, sites=0;
  PARKS.forEach(function(p){ (p.campgrounds||[]).forEach(function(c){ cgs++; sites+=cgSites(c).length; }); });
  function row(k,v){ return '<div class="ios-row ios-row--plain"><span class="ios-row-body"><span class="ios-row-title">'+k+'</span></span>'+
    '<span class="ios-row-value tnum">'+v+'</span></div>'; }
  el.innerHTML=row(TL('Parks in guide'),parks)+row(TL('Campgrounds'),cgs)+row(TL('Sites'),sites.toLocaleString())+
    '<button class="ios-row ios-row--plain" id="aboutVerBtn" type="button"><span class="ios-row-body"><span class="ios-row-title">'+TL('Version')+'</span></span>'+
    '<span class="ios-row-value tnum">v'+APP_VERSION+'</span></button>'+
    '<a class="ios-row ios-row--plain" href="https://katsuma.ca/" target="_blank" rel="noopener">'+
    '<span class="ios-row-body"><span class="ios-row-title">katsuma.ca</span></span>'+CHEV_RIGHT+'</a>';
  var vb=document.getElementById('aboutVerBtn');
  if(vb) vb.addEventListener('click',function(){ buzz(6); openVersions(); });
}
/* ---- account + saved photos ---- */
/* One shared profile for the three outdoors apps on this origin: the display
   name lives under the JSON key 'outdoors-profile' ({name}), with a silent
   one time migration from the old per app key oncamp-name. */
var PROFILE_KEY='outdoors-profile';
(function(){ try{
  if(localStorage.getItem(PROFILE_KEY)==null){
    var old=(localStorage.getItem('oncamp-name')||'').trim();
    if(old){ localStorage.setItem(PROFILE_KEY,JSON.stringify({name:old})); localStorage.removeItem('oncamp-name'); }
  }
}catch(e){} })();
function displayName(){ try{ var p=JSON.parse(localStorage.getItem(PROFILE_KEY)||'null'); return ((p&&p.name)||'').trim(); }catch(e){ return ''; } }
function setDisplayName(v){ v=String(v==null?'':v).trim();
  try{ if(v) localStorage.setItem(PROFILE_KEY,JSON.stringify({name:v})); else localStorage.removeItem(PROFILE_KEY); }catch(e){} }
function avatarGlyph(){ var n=displayName();
  return n?esc(n[0].toUpperCase()):'<svg aria-hidden="true"><use href="assets/icons.svg#user"/></svg>'; }
function renderAvatar(){
  var el=document.getElementById('avatarBtn'); if(el) el.innerHTML=avatarGlyph();
  var big=document.getElementById('acctAvatar'); if(big) big.innerHTML=avatarGlyph();
}
(function(){ var inp=document.getElementById('displayName'); if(!inp) return;
  inp.value=displayName();
  inp.addEventListener('input',function(){ setDisplayName(inp.value); renderAvatar(); });
  inp.addEventListener('keydown',function(e){ if(e.key==='Enter') inp.blur(); });
})();
function accountStats(){ var s=journalStats(); return {parks:s.parks,sites:s.sites}; }
function countPhotosSaved(){ return openDB().then(function(db){ return new Promise(function(res){
    var tx=db.transaction(STORE,'readonly'); var rq=tx.objectStore(STORE).getAll();
    rq.onsuccess=function(){ var n=0; (rq.result||[]).forEach(function(r){ if(r&&Array.isArray(r.list)) n+=r.list.length; }); res(n); };
    rq.onerror=function(){ res(0); }; }); }).catch(function(){ return 0; }); }
function renderAccount(){
  renderAvatar();
  var st=accountStats();
  var e1=document.getElementById('stParks'); if(e1) e1.textContent=st.parks;
  var e2=document.getElementById('stSites'); if(e2) e2.textContent=st.sites;
  var av=document.getElementById('acctVersion');
  if(av) av.textContent='v'+APP_VERSION;
  countPhotosSaved().then(function(n){
    var e3=document.getElementById('stPhotos'); if(e3) e3.textContent=n;
    var pc=document.getElementById('acctPhotoCount'); if(pc) pc.textContent=n||''; });
}
function photoLabel(k){ var parts=k.split('#'), p=PARK_BY_ID[parts[0]];
  if(parts.length>=3) return 'Site '+parts.slice(2).join('#')+', '+(p?p.name:parts[0]);
  var name=parts.slice(1).join('#');
  return name+(p&&p.name!==name?', '+p.name:''); }
function openPhotoTarget(k){ var parts=k.split('#'), pid=parts[0]; if(!PARK_BY_ID[pid]) return;
  showTab('guide'); openPark(pid);
  if(parts.length>=3){ var cgId=parts[1], site=parts.slice(2).join('#');
    expandCg(cgId); openSheet('site',k,cgId,site); }
  else{ var name=parts.slice(1).join('#');
    if((curPark.trails||[]).some(function(t){ return t.name===name; })) openSheet('trail',k,name);
    else openSheet('campground',k,name); } }
async function renderPhotosScreen(){
  var box=document.getElementById('photosGrid'); if(!box) return; box.innerHTML='';
  var keys=Array.from(photoKeys).sort();
  if(!keys.length){ box.innerHTML='<div class="empty" style="grid-column:1/-1">No photos yet. Add one from a site&#39;s rating sheet.</div>'; return; }
  for(const k of keys){ const list=await getPhotos(k); const label=photoLabel(k);
    list.forEach(function(p){
      var b=document.createElement('button'); b.type='button'; b.className='pcell';
      b.setAttribute('aria-label','Open '+label);
      var img=document.createElement('img'); img.src=p.data; img.alt='';
      var cap=document.createElement('span'); cap.className='plabel'; cap.textContent=label;
      b.appendChild(img); b.appendChild(cap);
      b.addEventListener('click',function(){ buzz(6); openPhotoTarget(k); });
      box.appendChild(b); }); } }
(function(){
  var ab=document.getElementById('avatarBtn'), sb=document.getElementById('searchBtn');
  /* its own screen, the way iOS Settings does it: the field is there but
     focus stays manual, because autofocusing pans the page on iOS Safari */
  function toSearch(){ showTab('search'); }
  if(ab) ab.addEventListener('click',function(){ buzz(6); showTab('account'); });
  if(sb) sb.addEventListener('click',function(){ buzz(6); toSearch(); });
  var sc=document.getElementById('searchCancel');
  if(sc) sc.addEventListener('click',function(){ buzz(6); clearGSearch(); showTab(LAST_TAB_BEFORE_SEARCH||'guide'); });
  var pb=document.getElementById('acctPhotosBtn');
  if(pb) pb.addEventListener('click',function(){ buzz(6); showTab('photos'); });
  var bk=document.getElementById('photosBack');
  if(bk) bk.addEventListener('click',function(){ buzz(6); showTab('account'); });
})();

/* ---- journal tab: everything rated, grouped by park ---- */
function journalStats(){ var parks=new Set(), sites=0, sum=0, n=0;
  ['site','campground','trail'].forEach(function(b){ var o=state[b]||{};
    for(var k in o){ var e=o[k]; if(!e) continue; var pid=k.split('#')[0]; if(!PARK_BY_ID[pid]) continue;
      if(typeof e.score==='number'){ if(b==='site') sites++; sum+=e.score; n++; parks.add(pid); }
      if((e.note&&String(e.note).trim())||(b==='site'&&e.want)) parks.add(pid); } });
  photoKeys.forEach(function(k){ var pid=String(k).split('#')[0]; if(PARK_BY_ID[pid]) parks.add(pid); });
  return {parks:parks.size,sites:sites,n:n,avg:n?sum/n:0}; }
function journalEntries(){ var byPark={};
  function push(pid,en){ if(!PARK_BY_ID[pid]) return; (byPark[pid]=byPark[pid]||[]).push(en); }
  var o=state.site||{}, k, e;
  for(k in o){ e=o[k]; if(!e) continue; var rated=(typeof e.score==='number');
    if(!rated&&!e.want) continue; var sp=k.split('#');
    push(sp[0],{type:'site',k:k,title:'Site '+sp.slice(2).join('#'),sub:sp[1],
      score:rated?e.score:null,want:!!e.want,note:!!(e.note&&String(e.note).trim()),photo:photoKeys.has(k)}); }
  o=state.campground||{};
  for(k in o){ e=o[k]; if(!e||typeof e.score!=='number') continue; var cp=k.split('#'), pid=cp[0],
      name=cp.slice(1).join('#'), p=PARK_BY_ID[pid];
    push(pid,{type:'campground',k:k,title:name,sub:(p&&name===p.name)?'Park rating':'Campground',
      score:e.score,want:false,note:!!(e.note&&String(e.note).trim()),photo:photoKeys.has(k)}); }
  o=state.trail||{};
  for(k in o){ e=o[k]; if(!e||typeof e.score!=='number') continue; var tp=k.split('#');
    push(tp[0],{type:'trail',k:k,title:tp.slice(1).join('#'),sub:'Trail',
      score:e.score,want:false,note:!!(e.note&&String(e.note).trim()),photo:photoKeys.has(k)}); }
  return byPark; }
function openJournalEntry(k,type){ var parts=k.split('#'), pid=parts[0]; if(!PARK_BY_ID[pid]) return;
  showTab('guide'); openPark(pid);
  if(type==='site'){ expandCg(parts[1]); openSheet('site',k,parts[1],parts.slice(2).join('#')); }
  else if(type==='trail'){ openSheet('trail',k,parts.slice(1).join('#')); }
  else{ openSheet('campground',k,parts.slice(1).join('#')); } }
function renderJournal(){ var box=document.getElementById('journalBody'); if(!box) return;
  var byPark=journalEntries(), pids=Object.keys(byPark);
  if(!pids.length){
    box.innerHTML='<div class="jempty">'
      +'<svg aria-hidden="true"><use href="assets/icons.svg#tent"/></svg>'
      +'<h3>Your journal starts here</h3>'
      +'<button class="btn-share primary" id="jBrowse" type="button">Browse the parks</button></div>';
    var jb=document.getElementById('jBrowse'); if(jb) jb.addEventListener('click',function(){ buzz(6); showTab('guide'); });
    return; }
  var s=journalStats(), ts=state.touched||{};
  pids.sort(function(a,b){ return ((ts[b]||0)-(ts[a]||0))||PARK_BY_ID[a].name.localeCompare(PARK_BY_ID[b].name); });
  var PHOTO_G='<svg aria-hidden="true"><use href="assets/icons.svg#image"/></svg>';
  var html='<div class="acct-stats">'
    +'<div class="acct-stat"><b class="tnum">'+s.parks+'</b><span>'+TL('Parks visited')+'</span></div>'
    +'<div class="acct-stat"><b class="tnum">'+s.sites+'</b><span>'+TL('Ratings')+'</span></div>'
    +'<div class="acct-stat"><b class="tnum">'+(s.n?s.avg.toFixed(1):'0')+'</b><span>'+TL('Average rating')+'</span></div>'
    +'</div>';
  var ORDER={campground:0,site:1,trail:2};
  pids.forEach(function(pid){ var p=PARK_BY_ID[pid], list=byPark[pid];
    list.sort(function(a,b){ return (ORDER[a.type]-ORDER[b.type])
      ||String(a.sub).localeCompare(String(b.sub))
      ||String(a.title).localeCompare(String(b.title),undefined,{numeric:true}); });
    html+='<div class="seclabel">'+p.name+'</div><div class="ios-group">'+list.map(function(en){
      var col=(en.score!=null)?scoreColor(en.score):null;
      var glyphs=(en.photo?PHOTO_G:'');
      return '<button class="ios-row ios-row--plain jrow" type="button" data-key="'+en.k.replace(/"/g,'&quot;')+'" data-type="'+en.type+'">'
        +'<span class="ios-row-body"><span class="ios-row-title">'+(en.want?'<span class="wstar">★</span>':'')+en.title+'</span>'
        +(en.sub?'<span class="ios-row-sub">'+en.sub+'</span>':'')+'</span>'
        +(glyphs?'<span class="j-glyphs">'+glyphs+'</span>':'')
        +(col?'<span class="tr-rate rated" style="background:'+col+'">'+en.score+'/5</span>':'')
        +'</button>'; }).join('')+'</div>';
  });
  box.innerHTML=html;
  box.querySelectorAll('.jrow').forEach(function(b){ b.addEventListener('click',function(){ buzz(6); openJournalEntry(b.dataset.key,b.dataset.type); }); });
}

/* ---- shared footer tab bar ---- */
var LAST_TAB_BEFORE_SEARCH='guide';
var TAB_SECTIONS={guide:'view-parks',map:'view-map',journal:'view-journal',more:'view-more',account:'view-account',photos:'view-photos',search:'view-search'};
var ALL_VIEWS=['view-parks','view-park','view-map','view-journal','view-more','view-shared','view-account','view-photos','view-search'];
var learnRendered=false;
function setHeaderHidden(h){ var el=document.getElementById('iosHeader'); if(el) el.hidden=!!h; }
/* blended headers: transparent at rest, frosted only once content actually runs
   underneath. Every header bar on the page gets 'scrolled' past 8px of scroll
   and loses it back at the top; the appearance layer paints the difference. */
(function(){
  function stampScrolled(){
    var on=(window.scrollY||document.documentElement.scrollTop||0)>8;
    document.querySelectorAll('.ios-header,.nav,.backbar').forEach(function(el){
      el.classList.toggle('scrolled',on); });
  }
  window.addEventListener('scroll',stampScrolled,{passive:true});
  window.addEventListener('resize',stampScrolled,{passive:true});
  stampScrolled();
  window.sjStampScrolled=stampScrolled;
})();
function showTab(tab){
  if(!TAB_SECTIONS[tab]) tab='guide';
  if(tab!=='search') LAST_TAB_BEFORE_SEARCH=tab;
  ALL_VIEWS.forEach(function(id){ var el=document.getElementById(id); if(el) el.hidden=true; });
  var target=document.getElementById(tab==='guide'?'view-parks':TAB_SECTIONS[tab]);
  if(target){
    /* a tab switch is a fresh mount: shed any push, pop or no-anim class a
       previous visit left behind so the glass-in entry can play */
    target.classList.remove('view-anim','view-out','no-anim');
    target.hidden=false;
  }
  setHeaderHidden(false);
  var tb=document.getElementById('tabbar');
  if(tb) tb.querySelectorAll('.tab').forEach(function(b){ var on=b.dataset.tab===tab; b.classList.toggle('active',on);
    if(on) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  /* always land at the top; the second call catches a browser that scrolls late */
  try{ window.scrollTo(0,0); }catch(e){}
  requestAnimationFrame(function(){ try{ window.scrollTo(0,0); }catch(e){} });
  if(tab==='guide'){ renderParks(); }
  if(tab==='map' && window.initCampMap){ setTimeout(window.initCampMap,30); }
  if(tab==='more'){ if(typeof renderAppearancePanel==='function') renderAppearancePanel(); if(typeof fillAboutStats==='function') fillAboutStats();
    if(!learnRendered){ renderLearn(); learnRendered=true; } }
  if(tab==='journal'){ renderJournal(); }
  if(tab==='account'){ renderAccount(); }
  if(tab==='photos'){ renderPhotosScreen(); }
}
window.openParkFromMap=function(id){ showTab('guide'); if(typeof openPark==='function') openPark(id); };
function openSettings(){ showTab('more'); }
function closeSettings(){}
(function(){ var tb=document.getElementById('tabbar');
  if(tb) tb.addEventListener('click',function(e){ var b=e.target.closest&&e.target.closest('.tab'); if(b){ showTab(b.dataset.tab); if(typeof buzz==='function') buzz(6); } }); })();
document.getElementById('appTitle').addEventListener('click',function(){ showTab('more'); });
settingsBackdrop.addEventListener('click',closeSettings);

/* ---- learn and safety ---- */
function renderLearn(){
  var el=document.getElementById('learnBody'); if(!el) return;
  var CHEV='<span class="ios-chevron"><svg aria-hidden="true"><use href="assets/icons.svg#chevron-down"/></svg></span>';
  var A=[
    {t:'Bear safety and food storage', b:`<p>Black bears live across cottage country and the north, and most trouble comes down to food. A bear that finds a meal at a campsite comes back, and a bear that keeps coming back usually ends up dead, so a clean site protects the bear as much as you.</p><p>Store all food, garbage, coolers, and anything scented in your vehicle or a bear locker, never in the tent. Cook and eat away from where you sleep, and pack out every scrap. If you meet a bear, do not run. Make yourself look big, speak firmly, back away slowly, and give it a clear exit. Report a bear hanging around a campground to park staff or Bear Wise at 1-866-514-2327.</p>`},
    {t:'Ticks and Lyme disease', b:`<p>Blacklegged ticks carry Lyme disease and are now common across much of southern and eastern Ontario. They wait in long grass and leaf litter and latch on as you brush past.</p><p>Wear light long sleeves and pants, tuck your pants into your socks on trails, and use a repellent with DEET or icaridin. Check yourself, kids, and dogs after every walk, especially the hairline, waist, and behind the knees. If you find one, pull it straight out with fine tweezers close to the skin and do not twist. See a doctor if you cannot remove it cleanly, if a spreading rash appears, or if you feel flu-like in the weeks after.</p>`},
    {t:'Campfire safety', b:`<p>Check for a fire ban before you light anything. Bans are common in dry spells and carry real fines.</p><p>Use the existing fire pit, keep the fire small, and never leave it unattended. Keep water and a shovel within reach. Burn only clean wood, and buy or gather it locally, since moving firewood spreads tree-killing insects like the emerald ash borer. Before you sleep or leave, drown the fire, stir the ashes, and drown it again until it is cold to the touch.</p>`},
    {t:'Leave no trace', b:`<p>The idea is simple: leave the site the way you would want to find it. Pack out all your trash, including food scraps and dog waste. Use the outhouse, or bury human waste well away from water.</p><p>Keep to the trails and the tent pads so the ground around the site can recover. Do not feed wildlife, and do not carve or nail into trees. Keep the noise down after quiet hours, since sound carries a long way over water at night. A good campsite is one the next person cannot tell you used.</p>`},
    {t:'Wildlife on the roads', b:`<p>Moose and deer are most active at dawn and dusk, and a collision with a moose is dangerous because the body comes through the windshield. Slow down at night in wildlife areas and watch the shoulders for eye-shine.</p><p>If an animal is crossing, brake in a straight line rather than swerving. Turtles cross roads to nest in June, and you can move one across in the direction it was already headed, well clear of traffic. Never pick a snapping turtle up by the tail, which injures its spine.</p>`},
    {t:'Cold water and weather', b:`<p>Cold water is the real risk on Ontario lakes, even in summer. It saps your strength fast, so wear a lifejacket in any boat or canoe and keep one on children at the shore.</p><p>Watch the sky. Afternoon thunderstorms build quickly, and open water is no place to be when one arrives. If you hear thunder, get off the water and away from tall lone trees. Tell someone your route and when you will be back before a longer paddle or hike.</p>`},
    {t:'Report a bear or a hazard', b:`<p>Seeing a bear, a road hazard, or wildlife on a road? on-wildlife has a quick report that drops it on a shared map for the area, with sensitive spots coarsened for privacy.</p><p><a class="footlink" href="https://katsuma.ca/on-wildlife/#/more" target="_blank" rel="noopener">Open on-wildlife to report</a></p>`}
  ];
  el.innerHTML='<div class="ios-group">'+A.map(function(a){
    return '<details class="cell-details"><summary class="ios-row ios-row--plain"><span class="ios-row-body"><span class="ios-row-title">'+a.t+'</span></span>'+CHEV+'</summary>'+
      '<div class="cell-detail-body">'+a.b+'</div></details>'; }).join('')+'</div>';
}
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
/* ---- legal, read inside the app ----
   The privacy policy, terms and support live in a sheet rather than a link
   out to katsuma.ca, so they are readable offline and nobody is bounced to
   a browser mid-app. The full pages stay on the site; this is the same
   content, condensed to what a reader of this app needs. */
var LEGAL_PAGES={
  privacy:{t:'Privacy policy',h:''
    +'<p><b>The short version.</b> There are no accounts, no advertising and no analytics. Nothing you write, rate or photograph is sent to me. It is stored on this device and it stays here. I cannot read it and I never see that it exists.</p>'
    +'<p><b>What the app stores.</b> Your ratings, notes, wishlist marks and photos, your favourites, your display name and your settings. All of it lives in this browser\u2019s storage on this device. Your display name is used only to draw an initial in the corner of the app and is never transmitted.</p>'
    +'<p><b>What leaves this device.</b> Map images are fetched from CARTO, which renders OpenStreetMap data, when you open the Map. Like any web request, that carries your IP address and roughly which part of the map you are looking at. It does not carry your notes, ratings, photos or name. The web version is served from GitHub Pages, which keeps ordinary server logs.</p>'
    +'<p><b>Permissions.</b> Location is used only when you tap the locate button on the Map, and never in the background. The camera and photo library are used only when you attach a photo to a site. If you decline either, everything else still works.</p>'
    +'<p><b>Keeping and deleting.</b> Your data is kept until you delete it. More, then Your data, then Reset all data removes everything, and deleting the app does the same. Export a backup writes your whole journal to one readable file, and Import reads it back on any device. There is no server copy, so nothing can be recovered once it is gone.</p>'
    +'<p><b>Children.</b> The app is safe for a child to use. Nothing in it collects personal information from anyone, of any age.</p>'
    +'<p>The full policy is at katsuma.ca/privacy.html. Questions: katsuma123@gmail.com.</p>'},
  terms:{t:'Terms of use',h:''
    +'<p><b>Safety first.</b> This app is a reference, not safety equipment. It cannot call for help. Carry a way to reach emergency services where you are going, and tell someone your plan. Maps and locations are approximate, so do not navigate by them.</p>'
    +'<p><b>Your content is yours.</b> What you write, rate and photograph belongs to you. It is stored on your device and never sent to me, so I acquire no rights to it.</p>'
    +'<p><b>Acceptable use.</b> Do not use the app to break the law, to harass anyone, or to harm a park. Do not photograph occupied sites, and leave a site the way you would want to find it.</p>'
    +'<p><b>No warranty.</b> The app is provided as it is, free of charge, with no warranty of any kind. Park information can be incomplete or out of date. Book through Ontario Parks\u2019 official channels.</p>'
    +'<p><b>Data loss.</b> Everything is stored on your device and nothing is backed up to a server, so your journal can be lost if you delete the app, clear site data or lose the device. Export regularly.</p>'
    +'<p><b>Not affiliated.</b> This is an independent app, not made by or endorsed by Ontario Parks, the Government of Ontario or Apple. Map images come from CARTO, rendering OpenStreetMap data, \u00a9 OpenStreetMap contributors.</p>'
    +'<p>The full terms are at katsuma.ca/terms.html. These terms are governed by the laws of Ontario, Canada.</p>'},
  support:{t:'Support',h:''
    +'<p><b>Reach me.</b> Email katsuma123@gmail.com and I will reply. Problems can also be filed at github.com/katsuma0/on-site/issues.</p>'
    +'<p><b>Moving to a new phone.</b> On the old phone: More, then Your data, then Export a backup. Send that file to yourself. On the new phone: Import a backup and pick the file. Importing the same file twice is safe.</p>'
    +'<p><b>Deleted the app?</b> The journal went with it, because nothing is stored on a server. Export before you delete and before a phone upgrade. I have no copy and cannot recover anything.</p>'
    +'<p><b>No signal?</b> Every park, site and rating works offline. Map tiles are the one exception: parts of the map you have never opened cannot be drawn without a connection, so load the map over wifi before you leave.</p>'
    +'<p><b>Looks like the old version?</b> Close the app completely and open it again. It keeps its files on your device so it works offline, and swaps in updates on the next launch.</p>'
    +'<p><b>Accessibility.</b> The app follows the system text size and works with VoiceOver. If something is hard to read, hit or hear announced, tell me. That is a bug, not a preference.</p>'},
};
function openLegal(key){
  var pg=LEGAL_PAGES[key]; if(!pg) return;
  var t=document.getElementById('legalTitle'), b=document.getElementById('legalBody');
  if(t) t.textContent=TL(pg.t);
  if(b) b.innerHTML=pg.h;
  settingsBackdrop.classList.add('on');
  var ls=document.getElementById('legalSheet');
  ls.classList.add('on'); ls.scrollTop=0; lockScroll();
}
function closeLegal(){
  var ls=document.getElementById('legalSheet');
  settingsBackdrop.classList.remove('on'); ls.classList.remove('on'); ls.style.transform=''; unlockScroll();
}
document.querySelectorAll('[data-legal]').forEach(function(b){
  b.addEventListener('click',function(){ buzz(6); openLegal(b.getAttribute('data-legal')); });
});

/* settings is a tab screen now, not a swipe-to-close sheet */
function openVersions(){ settingsBackdrop.classList.add('on'); const vs=document.getElementById('versionsSheet'); vs.classList.add('on'); vs.scrollTop=0; lockScroll(); }
function closeVersions(){ const vs=document.getElementById('versionsSheet'); settingsBackdrop.classList.remove('on'); vs.classList.remove('on'); vs.style.transform=''; unlockScroll(); }
settingsBackdrop.addEventListener('click',closeVersions);
makeSheetSwipe(document.getElementById('versionsSheet'),closeVersions);
/* the legal pages open in their own sheet, so leaving the app to read a
   policy is never required; the same backdrop and swipe dismiss it */
settingsBackdrop.addEventListener('click',closeLegal);
makeSheetSwipe(document.getElementById('legalSheet'),closeLegal);
/* the version chip left the title; version history opens from the About row */
makeSheetSwipe(sheet,closeSheet);


/* ================= boot ================= */
(async function(){
  applyAppearance(); applyLang();
  buildDots(); load(); migrateAlgonquin(); migrateScale5(); migratePinsToFavs();
  loadParksEmbedded(); buildSearchIndex(); wireGlobalSearch(); renderAppearancePanel(); renderAvatar();
  renderParks();                 /* instant first paint, no network wait */
  await loadPhotoIndex();        /* fast local IndexedDB */
  migrateAlgPhotos();
  renderParks();                 /* photos now count toward My parks */
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
if(window.OnShare) OnShare.config({ app:'on-camp', base:'https://katsuma.ca/on-site/', accent:'#284162' });
(function(){ /* #/shared/<data> receive route */
  function fromSharedHash(){
    var m=(location.hash||'').match(/^#\/shared\/(.+)$/); if(!m) return;
    var it=window.OnShare?OnShare.decode(m[1]):null;
    if(typeof showShared==='function') showShared(it);
  }
  window.addEventListener('hashchange',fromSharedHash);
  fromSharedHash();
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
