'use strict';
/* ---------- data ----------
   Gerçek build: stores EVO sync'ten gelir (format/kategori/koordinat dahil,
   manuel kurulum yok). visits = PlannedVisit tablosu (motor üretir).
   Rut = koltuk YOK; Assignment(route↔person, tarihli) ile doğrudan atama. */
const DAY_START=360, DAY_END=1380, CELL_H=510, PXMIN=CELL_H/(DAY_END-DAY_START);
const TODAY='2026-07-10'; /* v0.5.4: süreli görev karşılaştırması için (ISO) */
const DAYS=['Pzt','Sal','Çar','Per','Cum'];
const BREAKS=[];
let QUOTA=450; /* ayarlar sayfasından değiştirilebilir (settingsData.quota) */
const people=[
  {id:'p1',name:'Ayşe K.',active:true},
  /* v0.5: leave = mock izin — Onarım tetikleyicisi + olay-bazlı yama penceresi.
     Gerçek build: leave tablosu İK/mobilden senkron. days = bu haftadaki günler. */
  {id:'p2',name:'Mehmet D.',active:true,leave:{from:'7 Tem',to:'9 Tem',days:[1,2,3]}},
  {id:'p3',name:'Zeynep A.',active:true} /* henüz rutu yok — yeni rut kurulumu için aday */
];
const routes=[
  {id:'r1',code:'ANK-01',name:'Çankaya Merkez',person:'p1',color:'#185FA5',target:1250,active:true},
  {id:'r2',code:'ANK-02',name:'Keçiören Hattı',person:'p2',color:'#0F6E56',target:1250,active:true}
];
/* v0.5: perf = mock yürütme verisi (uyum %, plan vs gerçekleşen dk, raf skoru
   önce→sonra, 8 haftalık satış trendi %, ROI 1–5). Gerçek build: mobil
   check-in/out + foto skorlama + satış senkronundan beslenir. closedUntil =
   mock geçici kapanış (olay-bazlı yama penceresi + Onarım tetikleyicisi). */
const stores=[
  {id:'s1',name:'Migros 4M Çankaya',chain:'Migros',format:'4M',cat:'V',rev:412,x:150,y:140,route:'r1',active:true,perf:{comp:96,act:47,shelf:[72,91],sales:12,roi:4}},
  {id:'s2',name:'Carrefour Kızılay',chain:'Carrefour',format:'3M',cat:'V',rev:365,x:210,y:210,route:'r1',active:true,perf:{comp:88,act:52,shelf:[68,74],sales:-4,roi:2}},
  {id:'s3',name:'Kantin A (lojman)',chain:'—',format:'Jet',cat:'S',rev:22,x:120,y:250,route:'r1',active:true,perf:{comp:98,act:28,shelf:[80,82],sales:1,roi:3}},
  {id:'s4',name:'ŞOK Etlik',chain:'ŞOK',format:'M',cat:'P',rev:158,x:260,y:120,route:'r1',active:true,closedUntil:'24 Tem',perf:{comp:71,act:31,shelf:[64,70],sales:6,roi:3}},
  {id:'s5',name:'Kantin B (askeri)',chain:'—',format:'Jet',cat:'S',rev:15,x:380,y:300,route:'r2',active:true},
  {id:'s6',name:'A101 Batı',chain:'A101',format:'M',cat:'P',rev:190,x:430,y:220,route:'r2',active:true,perf:{comp:93,act:44,shelf:[70,85],sales:9,roi:4}},
  {id:'s7',name:'Kantin C',chain:'—',format:'Jet',cat:'S',rev:18,x:470,y:330,route:'r2',active:true},
  {id:'s8',name:'BİM Sincan',chain:'BİM',format:'MM',cat:'P',rev:205,x:520,y:260,route:'r2',active:true,perf:{comp:84,act:49,shelf:[66,79],sales:5,roi:3}},
  {id:'s9',name:'Migros MM Bahçeli',chain:'Migros',format:'MM',cat:'V',rev:388,x:90,y:340,route:null,active:true,perf:{comp:0,act:0,shelf:[61,61],sales:-7,roi:1}},
  {id:'s10',name:'A101 Keçiören',chain:'A101',format:'M',cat:'P',rev:176,x:330,y:80,route:null,active:true},
  {id:'s11',name:'Lojman kantini D',chain:'—',format:'Jet',cat:'S',rev:12,x:250,y:400,route:null,active:true}
];
let vseq=0;
function V(st,p,day,start,dur){return {id:'v'+(++vseq),storeId:st,personId:p,day,start,dur,patched:false};}
let visits=[
  V('s1','p1',0,540,45),V('s2','p1',0,660,60),V('s3','p1',1,600,30),V('s1','p1',3,540,45),
  V('s4','p1',4,840,40),V('s2','p1',2,900,60),V('s3','p1',3,660,30),V('s4','p1',1,900,40),
  V('s5','p2',0,570,30),V('s6','p2',1,690,45),V('s7','p2',1,540,30),V('s5','p2',3,570,30),
  V('s8','p2',2,600,45),V('s6','p2',4,540,45)
];
/* ===== HAFTA MODELİ =====
   baseVisits = Baz (kalıcı haftalık patern, "Kalıcı yap" buraya yazar).
   weekData[h] = o haftanın efektif kopyası (Baz projeksiyonu + o haftanın
   yamaları). Hafta ilk açıldığında Baz'dan üretilir; 2 haftada bir
   mağazalar tek haftalarda düşer. Geçmiş haftalar salt okunur. */
let baseVisits=JSON.parse(JSON.stringify(visits));
let currentWeek=28, weekData={28:visits};
const WEEK_RO_BEFORE=28;
function isRO(){return currentWeek<WEEK_RO_BEFORE;}
function projectWeek(w){
  return JSON.parse(JSON.stringify(baseVisits)).filter(v=>{
    const s=stores.find(x=>x.id===v.storeId);
    if(!s||s.active===false)return false;                 // pasif mağaza plandan düşer
    if(s.route){const r=routes.find(x=>x.id===s.route);if(r&&r.active===false)return false;} // pasif rut düşer
    if((s.freq||'hf')==='2hf'&&w%2===1)return false;
    return true;
  });
}
/* v0.4.1 DÜZELTME (kaskad hatası): Baz değişince gelecek haftalar önbellekten
   SİLİNİYORDU — o haftalarda yapılmış yamalar da yok oluyordu. Kural:
   Override (yama) > Baz; Baz düzenlemesi mevcut yamaları asla ezmez.
   Artık gelecek haftalar Baz'dan yeniden projeksiyon alır, yamalar korunur.
   Ayrıca visits'i yeniden atayan akışlar (pasifleştir, havuza taşı, rut sil)
   önbelleğe geri yazmıyordu → hafta değiştirip dönünce eski ziyaretler
   hortluyordu; ilk satır bu desync'i kapatır. Geçmiş haftalara dokunulmaz. */
function clearFutureWeeks(){
  weekData[currentWeek]=visits;
  for(const k of Object.keys(weekData)){
    const w=+k;if(w<=currentWeek)continue;
    const fresh=projectWeek(w);
    for(const p of weekData[k].filter(v=>v.patched)){
      const i=fresh.findIndex(v=>v.id===p.id);
      if(i>=0)fresh[i]=p;else fresh.push(p);
    }
    weekData[k]=fresh;
  }
}
/* v0.4.1: Sıklık değişiminde Baz deseni yeniden kurulan mağazanın ziyaretlerini
   SADECE bu haftada yeniden üretir. Önceki davranış (weekData={}) tüm haftaların
   yamalarını ve geçmiş hafta önbelleğini siliyordu — artık diğer mağazaların
   yamaları korunur; sadece ilgili mağazanın eski ziyaretleri/yamaları düşer. */
function rebaseStoreWeek(sid){
  for(let i=visits.length-1;i>=0;i--)if(visits[i].storeId===sid)visits.splice(i,1);
  for(const f of projectWeek(currentWeek))if(f.storeId===sid)visits.push(f);
}
function setWeek(w){
  w=Math.max(26,Math.min(34,w));
  if(w===currentWeek)return;
  currentWeek=w;
  if(!weekData[w])weekData[w]=projectWeek(w);
  visits=weekData[w];
  renderAll();
  if(isRO())toast('Geçmiş hafta — salt okunur (plan vs gerçekleşen burada raporlanır)',[]);
}
function weekLabel(w){if(window.__evoWeekLabelText)return window.__evoWeekLabelText;
  const mon=new Date(2026,6,6+(w-28)*7),fri=new Date(mon);fri.setDate(mon.getDate()+4);
  const ay=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  return `Hafta ${w} · ${mon.getDate()}–${fri.getDate()} ${ay[fri.getMonth()]}`;
}
function makePermanent(v){
  const bv=baseVisits.find(x=>x.id===v.id);
  if(bv)Object.assign(bv,{day:v.day,start:v.start,dur:v.dur,personId:v.personId});
  else baseVisits.push({...v,patched:false});
  clearFutureWeeks();
}
/* ---------- state ---------- */
let filter=null;            // {type:'route'|'person', id}
let focus=null;             // {type:'store'|'route'|'person', id}
let panelTab='info';
let selection=new Set();    // store ids
let changes=[];             // {id,desc,personId,day,undo:fn,patch:bool}
let mode='eff', layout='split', railTab='routes';
let expandedRoutes=new Set();
let chgSeq=0;
/* ---------- helpers ---------- */
const $=q=>document.querySelector(q);
const store=id=>stores.find(s=>s.id===id);
const route=id=>routes.find(r=>r.id===id);
const person=id=>people.find(p=>p.id===id);
const fmtT=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
function personRoute(pid){return routes.find(r=>r.person===pid);}
function dayVisits(pid,day,list){return (list||visits).filter(v=>v.personId===pid&&v.day===day).sort((a,b)=>a.start-b.start);}
function dayTotal(pid,day){return dayVisits(pid,day).reduce((s,v)=>s+v.dur,0);}
function weekTotal(pid){return visits.filter(v=>v.personId===pid).reduce((s,v)=>s+v.dur,0);}
function skipBreaks(t){for(const b of BREAKS){if(t>=b.s&&t<b.e)return b.e;}return t;}
function reflow(pid,day){
  const list=dayVisits(pid,day);let cur=DAY_START;
  for(const v of list){
    let st=Math.max(v.start,cur);st=skipBreaks(st);
    for(const b of BREAKS){if(st<b.s&&st+v.dur>b.s){st=b.e;}}
    v.start=st;cur=st+v.dur;
  }
}
/* ---------- sıra numaraları ----------
   Sıra = haftadaki İLK ziyaretin (gün*10000+dakika) sırası. Tek kaynak
   visits olduğundan takvim/harita/sidebar otomatik senkron kalır.
   resequenceRoute: sidebar'da sürükle-sırala → her günün ziyaretleri
   yeni sıraya göre aynı ilk saatten itibaren yeniden dizilir. */
function routeStoreOrder(rid){
  const r=route(rid);if(!r)return [];
  const pts=stores.filter(s=>s.route===rid&&s.active!==false);
  const key=s=>{
    const vs=r.person?visits.filter(v=>v.storeId===s.id&&v.personId===r.person):[];
    if(!vs.length)return 1e6+(s.draftSeq||999);
    return Math.min(...vs.map(v=>v.day*10000+v.start));
  };
  return pts.slice().sort((a,b)=>key(a)-key(b)).map(s=>s.id);
}
/* ===== YENİ RUT KURULUMU =====
   Küçük kimlik modalı → çalışma alanı "taslak modu": harita kapsama
   kilitlenir, atanmamışlar eklenir, sağ panel kurulum kartına döner.
   Kişi seçilince hafta otomatik üretilir (görev sürelerinden, kota
   gözetilerek). Aktifleştir = normal rut; Vazgeç = tam geri alma.
   Taslak gerçek build'de DRAFT statüslü rut satırıdır (kalıcı). */
let draftMode=null, draftSeqC=0;
function storeDur(s){return storeTaskList(s).reduce((a,t)=>a+resolveTaskMin(s,t).m,0);}
window.openNewRouteModal=function(){
  const code=(window.__evoCityPrefix?window.__evoCityPrefix():'RUT')+'-'+String(routes.length+1).padStart(2,'0');
  const bg=document.createElement('div');bg.className='modal-bg';bg.id='nrModal';
  bg.innerHTML=`<div class="modal" style="width:360px;">
    <div class="modal-head">Yeni rut</div>
    <div class="modal-body">
      <div class="frow"><label>Rut kodu</label><b>${code}</b> <span style="font-size:10px;color:var(--tx3);">(otomatik)</span></div>
      <div class="frow"><label>Ad</label><input type="text" id="nrName" value="Sincan Hattı" style="width:170px;"></div>
      <div class="frow"><label>Coğrafi kapsam</label><span>${window.__evoProvince||'Ankara'} ▾ · <span style="color:var(--tx3);">ilçe seç (prototipte tümü)</span></span></div>
      <div class="frow"><label>Ciro hedefi (bin ₺)</label><input type="number" id="nrTarget" value="${settingsData.target}" step="50" style="width:80px;"></div>
    </div>
    <div class="modal-foot">
      <button onclick="document.getElementById('nrModal').remove()">Vazgeç</button>
      <button class="primary" id="nrGo">Haritada kur →</button>
    </div></div>`;
  document.body.appendChild(bg);
  $('#nrGo').onclick=()=>{
    const r={id:'r'+Date.now(),code,name:$('#nrName').value||code,person:null,color:'#993C1D',target:+$('#nrTarget').value||settingsData.target,draft:true};
    routes.push(r);draftMode=r.id;draftSeqC=0;
    filter={type:'routes',ids:new Set([r.id])};focus=null;
    bg.remove();renderAll();
    toast('Taslak modu: haritadan atanmamış noktalara tıkla veya lasso ile seç',[]);
  };
};
function draftRoute(){return draftMode?route(draftMode):null;}
/* Havuz seçici: haritaya alternatif — aranabilir liste ile ruta ekleme */
window.openPoolPicker=function(rid){
  const r=route(rid);
  const bg=document.createElement('div');bg.className='modal-bg';bg.id='ppModal';
  bg.innerHTML=`<div class="modal" style="width:430px;">
    <div class="modal-head">Havuzdan mağaza ekle → ${r.code}${r.draft?' 📝':''}</div>
    <div class="modal-body">
      <input type="text" id="ppSearch" placeholder="🔍 mağaza ara…" style="width:100%;border:1px solid var(--border2);border-radius:6px;padding:5px 9px;font-size:12px;margin-bottom:8px;background:var(--card);color:var(--tx);">
      <div id="ppList"></div>
    </div>
    <div class="modal-foot"><button class="primary" onclick="document.getElementById('ppModal').remove()">Bitti</button></div></div>`;
  document.body.appendChild(bg);
  const renderList=()=>{
    const q=$('#ppSearch').value.trim().toLowerCase();
    const pool=stores.filter(s=>!s.route&&s.active!==false&&(!q||s.name.toLowerCase().includes(q)||s.chain.toLowerCase().includes(q)));
    $('#ppList').innerHTML=pool.length?pool.map(s=>`<div class="task-row">
      <span><b>${s.name}</b><br><span style="font-size:10.5px;color:var(--tx3);">${s.chain} · ${s.format} · <span class="badge ${s.cat}">${catL(s.cat)}</span> · ${s.rev}K/6ay</span></span>
      <button class="ppAdd" data-s="${s.id}" style="font-size:11px;">+ Ekle</button></div>`).join(''):
      `<div class="empty">${q?'Eşleşen mağaza yok':'Havuz boş 🎉'}</div>`;
    $('#ppList').querySelectorAll('.ppAdd').forEach(b=>b.onclick=()=>{
      assignStore(b.dataset.s,rid);renderList();
      toast(store(b.dataset.s).name+' → '+r.code,[]);
    });
  };
  $('#ppSearch').oninput=renderList;
  renderList();$('#ppSearch').focus();
};
/* Yeni mağaza modalı: havuza manuel ekleme (gerçekte EVO sync/import;
   bu manuel yol istisnadır). Kaydet → haritada konum tıklanır. */
let pendingNewStore=null;
window.openNewStoreModal=function(){
  const bg=document.createElement('div');bg.className='modal-bg';bg.id='nsModal';
  bg.innerHTML=`<div class="modal" style="width:380px;">
    <div class="modal-head">Yeni mağaza (havuza)</div>
    <div class="modal-body">
      <div class="frow"><label>Ad</label><input type="text" id="nsName" placeholder="örn. BİM Etimesgut" style="width:190px;"></div>
      <div class="frow"><label>Zincir</label><input type="text" id="nsChain" placeholder="BİM" style="width:110px;">
        <label style="min-width:auto;">Tip</label><select id="nsType">${STORE_TYPES.map(t=>`<option value="${t.key}">${t.key}</option>`).join('')}</select></div>
      <div class="frow"><label>Kategori</label><select id="nsCat"><option value="P">Potansiyel</option><option value="V">Değerli</option><option value="S">Servis</option></select>
        <label style="min-width:auto;">Ciro (6 ay, bin ₺)</label><input type="number" id="nsRev" value="100" style="width:70px;"></div>
      <div style="font-size:11px;color:var(--tx3);">Kaydet'ten sonra haritada konumuna tıkla. Gerçek sistemde mağazalar EVO'dan senkronize gelir; bu manuel yol istisnadır ve denetim kaydına yazılır.</div>
    </div>
    <div class="modal-foot">
      <button onclick="document.getElementById('nsModal').remove()">Vazgeç</button>
      <button class="primary" id="nsSave">Kaydet → konum seç</button>
    </div></div>`;
  document.body.appendChild(bg);
  $('#nsSave').onclick=()=>{
    if(!$('#nsName').value.trim()){toast('Mağaza adı gerekli',[]);return;}
    pendingNewStore={name:$('#nsName').value.trim(),chain:$('#nsChain').value.trim()||'—',format:$('#nsType').value,cat:$('#nsCat').value,rev:+$('#nsRev').value||0};
    bg.remove();
    toast('📍 Şimdi haritada mağazanın konumuna tıkla',[]);
  };
};
function generateDraftSchedule(r){
  /* aday listesi rutu olmayanlarla sınırlı → kişinin eski ziyareti yok */
  visits=visits.filter(v=>!(r.person&&v.personId===r.person));
  baseVisits=baseVisits.filter(v=>!(r.person&&v.personId===r.person));
  let day=0,cur=DAY_START;
  for(const sid of routeStoreOrder(r.id)){
    const s=store(sid),d=storeDur(s)||45;
    if(cur+d-DAY_START>QUOTA&&day<4){day++;cur=DAY_START;}
    const nv=V(sid,r.person,day,cur,d);
    visits.push(nv);baseVisits.push({...nv});
    cur+=d+10;
  }
  clearFutureWeeks();
}
/* Mağazayı ruta ekle / başka ruta taşı / havuza çıkar — panelden.
   Gerçek build: aranabilir combobox (yüzlerce rut), atomik taşıma
   (eski üyelik kapat + yeni aç), her iki rutun etkisi onayda gösterilir. */
/* Ziyaret sıklığı: günlük / haftada 2 / haftalık / 2 haftada bir.
   Değişince Baz'da mağazanın ziyaret deseni yeniden üretilir;
   2 haftada bir = tek haftalarda düşer (projectWeek filtreler). */
const FREQS=[{k:'g',l:'Günlük'},{k:'2x',l:'Haftada 2 (Pzt+Per)'},{k:'hf',l:'Haftalık'},{k:'2hf',l:'2 haftada bir'}];
window.setStoreFreq=function(sid,f){
  const s=store(sid);if(!s.route||(s.freq||'hf')===f)return;
  const r=route(s.route);if(!r.person){s.freq=f;renderPanel();return;}
  const oldF=s.freq||'hf';
  const oldBase=baseVisits.filter(v=>v.storeId===sid).map(v=>({...v}));
  baseVisits=baseVisits.filter(v=>v.storeId!==sid);
  const days=f==='g'?[0,1,2,3,4]:f==='2x'?[0,3]:[0];
  const d=storeDur(s);
  for(const day of days){
    const dayEnd=baseVisits.filter(v=>v.personId===r.person&&v.day===day).reduce((m,v)=>Math.max(m,v.start+v.dur),DAY_START);
    baseVisits.push(V(sid,r.person,day,skipBreaks(dayEnd),d));
  }
  s.freq=f;
  rebaseStoreWeek(sid);clearFutureWeeks();
  logChange(`${s.name}: sıklık ${FREQS.find(x=>x.k===oldF).l} → ${FREQS.find(x=>x.k===f).l}`,r.person,null,
    ()=>{s.freq=oldF;baseVisits=baseVisits.filter(v=>v.storeId!==sid);for(const o of oldBase)baseVisits.push({...o});rebaseStoreWeek(sid);clearFutureWeeks();});
  renderAll();
  toast(`Sıklık güncellendi — Baz deseni yeniden üretildi${f==='2hf'?' (tek haftalarda görünmez)':''}`,[]);
};
/* Yama yönetimi: tek yamayı veya rutun tüm haftasını Baz'a döndür */
window.revertPatch=function(vid){
  const v=visits.find(x=>x.id===vid);if(!v)return;
  const before=snapshotVisit(v);
  const bv=baseVisits.find(x=>x.id===vid);
  if(bv){Object.assign(v,{day:bv.day,start:bv.start,dur:bv.dur,personId:bv.personId});v.patched=false;}
  else {visits=visits.filter(x=>x.id!==vid);weekData[currentWeek]=visits;} // v0.4.1: önbellek senkronu
  logChange(`Yama geri alındı: ${store(before.storeId).name}`,before.personId,before.day,
    ()=>{const vv=visits.find(x=>x.id===vid);if(vv){restoreVisit(vv,before);}else visits.push(before);});
  renderAll();
};
window.revertWeekRoute=function(rid){
  const r=route(rid);if(!r.person)return;
  const patched=visits.filter(v=>v.patched&&v.personId===r.person);
  if(!patched.length){toast('Bu haftada yama yok',[]);return;}
  const snaps=patched.map(v=>({id:v.id,s:snapshotVisit(v)}));
  for(const v of patched){
    const bv=baseVisits.find(x=>x.id===v.id);
    if(bv){Object.assign(v,{day:bv.day,start:bv.start,dur:bv.dur,personId:bv.personId});v.patched=false;}
  }
  logChange(`${r.code}: H${currentWeek} Baz'a döndürüldü (${patched.length} yama)`,r.person,null,
    ()=>{for(const {id,s} of snaps){const vv=visits.find(x=>x.id===id);if(vv)restoreVisit(vv,s);}});
  renderAll();
  toast(`H${currentWeek} Baz'a döndürüldü — ${patched.length} yama kaldırıldı`,[]);
};
/* Kişi değiştir: aranabilir kişi listesi + zorunlu sebep (atama geçmişi
   ve devir analitiği bu sebeplerden beslenir). Meşgul kişiler devre dışı
   gösterilir — çift atama imkânsız (DB kısıtıyla uyumlu). */
window.openPersonPicker=function(rid){
  const r=route(rid);
  const bg=document.createElement('div');bg.className='modal-bg';bg.id='pkModal';
  bg.innerHTML=`<div class="modal" style="width:400px;">
    <div class="modal-head">Kişi değiştir — ${r.code} <span style="font-size:11px;color:var(--tx3);font-weight:400;">şu an: ${r.person?person(r.person).name:'kimse'}</span></div>
    <div class="modal-body">
      <input type="text" id="pkSearch" placeholder="🔍 kişi ara…" style="width:100%;border:1px solid var(--border2);border-radius:6px;padding:5px 9px;font-size:12px;margin-bottom:8px;background:var(--card);color:var(--tx);">
      <div id="pkList"></div>
      <div class="frow" style="margin-top:10px;"><label>Sebep (zorunlu)</label>
        <select id="pkReason" style="flex:1;">
          <option value="">seç…</option>
          <option>İstifa / işten ayrılma</option>
          <option>Bölge değişimi</option>
          <option>Geçici kapsama</option>
          <option>Yeniden yapılanma</option>
          <option>Performans</option>
        </select></div>
      <div style="font-size:10.5px;color:var(--tx3);">Sebep, atama geçmişine yazılır — devir/stabilite analitiği buradan beslenir ("koltuk yılda 6 kez değişti" sinyali).</div>
    </div>
    <div class="modal-foot"><button onclick="document.getElementById('pkModal').remove()">Vazgeç</button></div></div>`;
  document.body.appendChild(bg);
  let selP=null;
  const renderList=()=>{
    const q=$('#pkSearch').value.trim().toLowerCase();
    const list=people.filter(p=>p.id!==r.person&&p.active!==false&&(!q||p.name.toLowerCase().includes(q)));
    $('#pkList').innerHTML=list.map(p=>{
      const pr=personRoute(p.id);
      const busy=pr&&pr.id!==rid;
      return `<div class="pkRow" data-p="${p.id}" style="padding:5px 8px;border:1px solid ${selP===p.id?'var(--blue-d)':'var(--gray-l)'};border-radius:5px;margin-bottom:3px;font-size:11.5px;display:flex;justify-content:space-between;${busy?'opacity:.45;':'cursor:pointer;'}${selP===p.id?'background:var(--blue-l);':''}">
        <span><b>${p.name}</b></span>
        <span style="color:var(--tx3);">${busy?'meşgul: '+pr.code:'uygun · yük %'+Math.round(weekTotal(p.id)/(QUOTA*5)*100)}${busy?'':' · seç'}</span>
      </div>`;
    }).join('')||'<div class="empty">Kişi yok</div>';
    $('#pkList').querySelectorAll('.pkRow').forEach(el2=>{
      const p=people.find(x=>x.id===el2.dataset.p);
      const pr=personRoute(p.id);
      if(pr&&pr.id!==rid)return;
      el2.onclick=()=>{selP=el2.dataset.p;renderList();tryCommit();};
    });
  };
  const tryCommit=()=>{
    const reason=$('#pkReason').value;
    if(!selP)return;
    if(!reason){toast('Sebep seçmeden atama yapılamaz',[]);return;}
    const oldP=r.person;const np=selP;
    const retarget=arr=>{for(const v of arr)if(oldP&&v.personId===oldP)v.personId=np;};
    retarget(visits);retarget(baseVisits);
    for(const k of Object.keys(weekData))retarget(weekData[k]);
    r.person=np;
    logChange(`${r.code}: ${oldP?person(oldP).name:'—'} → ${person(np).name} (${reason})`,np,null,
      ()=>{const back=arr=>{for(const v of arr)if(v.personId===np)v.personId=oldP;};back(visits);back(baseVisits);for(const k of Object.keys(weekData))back(weekData[k]);r.person=oldP;});
    bg.remove();renderAll();
    toast(`${r.code} → ${person(np).name} · sebep kayıtlı — Yayınla ile bildirilir`,[]);
  };
  $('#pkSearch').oninput=renderList;
  $('#pkReason').onchange=()=>tryCommit();
  renderList();$('#pkSearch').focus();
};
/* Rut yaşam döngüsü */
window.renameRoute=function(rid){
  const r=route(rid);const n=prompt('Yeni rut adı:',r.name);
  if(n&&n.trim()){const old=r.name;r.name=n.trim();logChange(`${r.code}: ad "${old}" → "${r.name}"`,null,null,()=>{r.name=old;});renderAll();}
};
window.setRouteTarget=function(rid){
  const r=route(rid);const n=prompt('Ciro hedefi (bin ₺):',r.target);
  if(n&&+n){const old=r.target;r.target=+n;logChange(`${r.code}: hedef ${old}K → ${r.target}K`,null,null,()=>{r.target=old;});renderAll();}
};
/* v0.4: rename+target tek modalda — panel ve tablo ortak kullanır.
   Aynı logChange kayıtlarını üretir (rename/target prompt'larıyla birebir). */
window.openRouteEditModal=function(rid){
  const r=route(rid);if(!r)return;
  if(isRO()){toast('Geçmiş hafta — salt okunur',[]);return;}
  const bg=document.createElement('div');bg.className='modal-bg';bg.id='rteModal';
  bg.innerHTML=`<div class="modal" style="width:360px;">
    <div class="modal-head">✎ Rut düzenle — ${r.code}</div>
    <div class="modal-body">
      <div class="frow"><label>Ad</label><input type="text" id="rteName" value="${(r.name||'').replace(/"/g,'&quot;')}" style="width:200px;"></div>
      <div class="frow"><label>Ciro hedefi (bin ₺)</label><input type="number" id="rteTarget" value="${r.target||0}" style="width:110px;"></div>
    </div>
    <div class="modal-foot">
      <button onclick="document.getElementById('rteModal').remove()">Vazgeç</button>
      <button class="primary" id="rteSave">Kaydet</button>
    </div></div>`;
  document.body.appendChild(bg);
  bg.onclick=e=>{if(e.target===bg)bg.remove();};
  $('#rteSave').onclick=()=>{
    const nn=$('#rteName').value.trim(), nt=+$('#rteTarget').value;
    if(nn&&nn!==r.name){const old=r.name;r.name=nn;logChange(`${r.code}: ad "${old}" → "${r.name}"`,null,null,()=>{r.name=old;});}
    if(nt&&nt!==r.target){const old=r.target;r.target=nt;logChange(`${r.code}: hedef ${old}K → ${r.target}K`,null,null,()=>{r.target=old;});}
    bg.remove();renderAll();
  };
};
/* v0.4: mağaza panelindeki aranabilir rut seçici standalone modal olarak.
   moveStoreTo çağırır — panel inline sürümüyle aynı davranış. Tablo ⇄ Rut kullanır. */
window.openRoutePickerModal=function(sid){
  const s=store(sid);if(!s)return;
  if(isRO()){toast('Geçmiş hafta — salt okunur',[]);return;}
  const r=s.route?route(s.route):null;
  const bg=document.createElement('div');bg.className='modal-bg';bg.id='rpkModal';
  bg.innerHTML=`<div class="modal" style="width:360px;">
    <div class="modal-head">⇄ Rut ata — ${s.name}</div>
    <div class="modal-body">
      <div style="font-size:11px;color:var(--tx2);margin-bottom:5px;">${r?`Mevcut: <b>${r.code}</b> — taşımak için ara`:'Havuzda — bir rut seç'}</div>
      <input id="rpkSearch" placeholder="🔍 rut ara (kod / ad / kişi)…" style="width:100%;font-size:12px;border:1px solid var(--border2);border-radius:5px;padding:5px 9px;background:var(--card);color:var(--tx);">
      <div id="rpkList" style="margin-top:6px;"></div>
    </div>
    <div class="modal-foot"><button onclick="document.getElementById('rpkModal').remove()">Kapat</button></div></div>`;
  document.body.appendChild(bg);
  bg.onclick=e=>{if(e.target===bg)bg.remove();};
  const inp=$('#rpkSearch'),listEl=$('#rpkList');
  const paint=()=>{
    const q=trLow(inp.value).trim();
    let list=routes.filter(x=>x.id!==(r?r.id:null)&&x.active!==false);
    if(q)list=list.filter(rt=>trLow(rt.code+' '+rt.name+' '+(rt.person?person(rt.person).name:'')).includes(q));
    listEl.innerHTML=list.slice(0,8).map(rt=>`<div class="rpkRow" data-r="${rt.id}" style="padding:6px 9px;border:1px solid var(--gray-l);border-radius:5px;margin-bottom:3px;cursor:pointer;font-size:12px;display:flex;justify-content:space-between;gap:6px;">
        <span><b>${rt.code}</b>${rt.draft?' 📝':''} · ${rt.name}</span>
        <span style="color:var(--tx3);white-space:nowrap;">${rt.person?person(rt.person).name:'kişi yok'} ${r?'· taşı →':'· ekle →'}</span></div>`).join('')+
      (list.length>8?`<div style="font-size:10px;color:var(--tx3);padding:2px 4px;">+${list.length-8} rut daha — aramayı daralt</div>`:'')+
      (!list.length&&q?'<div style="font-size:11px;color:var(--tx3);padding:4px;">Eşleşen rut yok</div>':'')+
      (r?`<div class="rpkRow" data-r="POOL" style="padding:6px 9px;border:1px solid var(--gray-l);border-radius:5px;margin-top:5px;cursor:pointer;font-size:12px;color:var(--red-d);">✕ Havuza çıkar</div>`:'');
    listEl.querySelectorAll('.rpkRow').forEach(el=>{
      el.onmouseenter=()=>el.style.background='var(--gray-l)';
      el.onmouseleave=()=>el.style.background='';
      el.onclick=()=>{bg.remove();moveStoreTo(sid,el.dataset.r);};
    });
  };
  inp.oninput=paint;paint();inp.focus();
};
/* v0.4: arşiv/silme YOK — sadece aktif/pasif. Pasifleştirme rutu plandan
   ve takvimden çıkarır, mağazalarını havuza taşır (böylece "kapalıyken"
   başka rutlara atanabilirler). Yeniden aktifleştirme rutu BOŞ getirir —
   kullanıcı mağazaları elle yeniden atar. Kayıt asla silinmez. */
window.deactivateRoute=function(rid){
  const r=route(rid);if(!r||r.active===false)return;
  if(isRO()){toast('Geçmiş hafta — salt okunur',[]);return;}
  if(!confirm(`${r.code} pasifleştirilsin mi? Plandan ve takvimden çıkar, mağazaları havuza taşınır. Kayıt korunur, sonra yeniden aktifleştirilebilir.`))return;
  const pts=stores.filter(s=>s.route===rid);
  const snap=pts.map(s=>({id:s.id,route:s.route,draftSeq:s.draftSeq}));
  const oldV=(r.person?visits.filter(v=>v.personId===r.person):[]).map(v=>({...v}));
  const oldB=(r.person?baseVisits.filter(v=>v.personId===r.person):[]).map(v=>({...v}));
  for(const s of pts){s.route=null;delete s.draftSeq;}
  if(r.person){visits=visits.filter(v=>v.personId!==r.person);baseVisits=baseVisits.filter(v=>v.personId!==r.person);}
  r.active=false;
  clearFutureWeeks();
  if(filter&&filter.type==='routes'&&filter.ids.has(rid))filter=null;
  if(focus&&focus.type==='route'&&focus.id===rid)focus=null;
  logChange(`${r.code} pasifleştirildi (${pts.length} mağaza havuza taşındı)`,r.person,null,
    ()=>{r.active=true;for(const sn of snap){const s=store(sn.id);if(s){s.route=sn.route;if(sn.draftSeq!=null)s.draftSeq=sn.draftSeq;}}for(const o of oldV)visits.push({...o});for(const o of oldB)baseVisits.push({...o});clearFutureWeeks();});
  renderAll();
  toast(`${r.code} pasifleştirildi — mağazalar havuza taşındı`,[]);
};
window.reactivateRoute=function(rid){
  const r=route(rid);if(!r||r.active!==false)return;
  if(isRO()){toast('Geçmiş hafta — salt okunur',[]);return;}
  r.active=true;
  logChange(`${r.code} yeniden aktifleştirildi (boş — mağazaları elle ata)`,r.person,null,()=>{r.active=false;});
  renderAll();
  toast(`${r.code} aktif ✓ — mağazaları elle ekle (kapalıyken başka rutlara geçmiş olabilirler)`,[]);
};
/* geriye dönük uyumluluk: eski çağrılar pasifleştirmeye yönlenir */
window.archiveRoute=window.deactivateRoute;

/* v0.4: MAĞAZA aktif/pasif. Havuza çıkarma (rut üyeliği) tamamen ayrı bir
   kavramdır — pasifleştirme rut üyeliğini korur, sadece plandan/takvimden
   çıkarır. Yeniden aktifleştirme, rutu varsa ziyaretlerini yeniden üretir. */
window.deactivateStore=function(sid){
  const s=store(sid);if(!s||s.active===false)return;
  if(isRO()){toast('Geçmiş hafta — salt okunur',[]);return;}
  const oldV=visits.filter(v=>v.storeId===sid).map(v=>({...v}));
  const oldB=baseVisits.filter(v=>v.storeId===sid).map(v=>({...v}));
  visits=visits.filter(v=>v.storeId!==sid);
  baseVisits=baseVisits.filter(v=>v.storeId!==sid);
  s.active=false;clearFutureWeeks();
  const pid=s.route?route(s.route).person:null;
  logChange(`${s.name}: pasifleştirildi`,pid,null,
    ()=>{s.active=true;for(const o of oldV)visits.push({...o});for(const o of oldB)baseVisits.push({...o});clearFutureWeeks();});
  renderAll();toast(`${s.name} pasifleştirildi`,[]);
};
window.reactivateStore=function(sid){
  const s=store(sid);if(!s||s.active!==false)return;
  if(isRO()){toast('Geçmiş hafta — salt okunur',[]);return;}
  s.active=true;
  const added=[];
  if(s.route){const r=route(s.route);if(r&&r.active!==false&&r.person){
    const d=storeDur(s);
    let best=0,min=1e9;for(let dd=0;dd<5;dd++){const t=dayTotal(r.person,dd);if(t<min){min=t;best=dd;}}
    const dv=dayVisits(r.person,best);
    const st=dv.length?dv[dv.length-1].start+dv[dv.length-1].dur:DAY_START;
    const nv=V(sid,r.person,best,skipBreaks(st),d);
    visits.push(nv);baseVisits.push({...nv});clearFutureWeeks();reflow(r.person,best);added.push(nv.id);
  }}
  const pid=s.route?route(s.route).person:null;
  logChange(`${s.name}: yeniden aktifleştirildi`,pid,null,
    ()=>{s.active=false;visits=visits.filter(v=>!added.includes(v.id));baseVisits=baseVisits.filter(v=>!added.includes(v.id));clearFutureWeeks();});
  renderAll();toast(`${s.name} aktif`,[]);
};

/* v0.4: KİŞİ aktif/pasif. Kişi bir rutta ise önce yerine başka biri
   atanmalı — o zamana kadar pasifleştirme engellenir (uyarı). */
window.deactivatePerson=function(pid){
  const p=person(pid);if(!p||p.active===false)return;
  const r=personRoute(pid);
  if(r){toast(`${p.name} bir rutta (${r.code}) — önce o rutta yerine başka birini ata, sonra pasifleştir`,[]);return;}
  p.active=false;
  logChange(`${p.name}: pasifleştirildi`,null,null,()=>{p.active=true;});
  renderAll();toast(`${p.name} pasifleştirildi`,[]);
};
window.reactivatePerson=function(pid){
  const p=person(pid);if(!p||p.active!==false)return;
  p.active=true;
  logChange(`${p.name}: yeniden aktifleştirildi`,null,null,()=>{p.active=false;});
  renderAll();toast(`${p.name} aktif`,[]);
};

/* v0.4: ŞABLON aktif/pasif tablodan — Yönetim taslağına yazılır (silme yok).
   Onay Yönetim > Kaydet ile; araç çubuğunda bekleyen-değişiklik çipi görünür. */
window.toggleTemplateActive=function(id){
  ensureDraft();
  const dt=adminDraft.tpls.find(x=>x.id===id);if(!dt)return;
  dt.active=!dt.active;
  renderAll();
  toast(`${dt.name}: ${dt.active?'aktifleştirme':'pasifleştirme'} taslağa yazıldı — Yönetim'de Kaydet ile onayla`,[]);
};

/* v0.4: KAMPANYA iptal = pasifleştirme (kayıt korunur, yeniden açılabilir). */
/* v0.5.4: KAMPANYA KAVRAMI KALDIRILDI. Kampanya = süreli görev'den başka
   bir şey değildi; görev şablonu artık hedef (tip/zincir) + son tarih
   taşıyabiliyor. Tek kavram, tek modal, tek kural merdiveni. */
window.moveStoreTo=function(sid,val){
  if(!val)return;
  const s=store(sid);const prev=s.route;
  const oldVisits=visits.filter(v=>v.storeId===sid).map(v=>({...v}));
  const oldBase=baseVisits.filter(v=>v.storeId===sid).map(v=>({...v}));
  visits=visits.filter(v=>v.storeId!==sid);
  baseVisits=baseVisits.filter(v=>v.storeId!==sid);
  clearFutureWeeks();
  delete s.draftSeq;
  if(val==='POOL'){
    s.route=null;
    logChange(`${s.name}: ${prev?route(prev).code:''} → havuz`,null,null,
      ()=>{s.route=prev;for(const o of oldVisits)visits.push({...o});for(const o of oldBase)baseVisits.push({...o});});
    renderAll();toast(s.name+' havuza çıkarıldı',[]);
  } else {
    s.route=null;
    assignStore(sid,val);
    if(prev)changes[changes.length-1].desc=`${s.name}: ${route(prev).code} → ${route(val).code} (taşındı)`;
    setFocus({type:'store',id:sid});
  }
};
window.setDraftPerson=function(pid){
  const r=draftRoute();if(!r)return;
  r.person=pid||null;
  if(r.person)generateDraftSchedule(r);
  renderAll();
  if(r.person)toast(person(pid).name+' atandı — hafta önizlemesi takvimde oluşturuldu',[]);
};
window.activateDraft=function(){
  const r=draftRoute();if(!r)return;
  const pts=stores.filter(s=>s.route===r.id&&s.active!==false);
  if(!pts.length){toast('En az bir mağaza ekle',[]);return;}
  if(!r.person){toast('Önce kişi ata',[]);return;}
  delete r.draft;
  const rid=r.id;
  logChange(`${r.code} aktifleştirildi (${pts.length} nokta · ${person(r.person).name})`,r.person,null,
    ()=>{const rr=route(rid);if(rr){for(const s of stores)if(s.route===rid)s.route=null;visits=visits.filter(v=>v.personId!==rr.person);routes.splice(routes.indexOf(rr),1);}});
  draftMode=null;
  renderAll();
  toast(`${r.code} aktif ✓ — Yayınla ile sahaya bildirilir`,[]);
};
window.cancelDraft=function(){
  const r=draftRoute();if(!r)return;
  if(!confirm('Taslak silinsin mi? Eklenen noktalar havuza döner.'))return;
  for(const s of stores)if(s.route===r.id){s.route=null;delete s.draftSeq;}
  if(r.person)visits=visits.filter(v=>v.personId!==r.person);
  routes.splice(routes.indexOf(r),1);
  draftMode=null;filter=null;
  renderAll();
};
function renderDraftBanner(){
  const b=$('#draftBanner');
  const r=draftRoute();
  if(!r){b.style.display='none';return;}
  const pts=stores.filter(s=>s.route===r.id&&s.active!==false);
  b.style.display='flex';
  b.innerHTML=`⬤ <b>TASLAK: ${r.code} kuruluyor</b> — ${pts.length} nokta · atanmamışlara tıkla/lasso ile ekle
    <span class="spacer" style="flex:1"></span>
    <button onclick="cancelDraft()" style="font-size:11px;">Vazgeç</button>`;
}
function storeOrderNum(sid){
  const s=store(sid);if(!s||!s.route)return null;
  const i=routeStoreOrder(s.route).indexOf(sid);
  return i<0?null:i+1;
}
function resequenceRoute(rid,newOrder){
  const r=route(rid);
  const snaps=visits.filter(v=>v.personId===r.person).map(v=>({v,s:snapshotVisit(v)}));
  for(let d=0;d<5;d++){
    const dv=dayVisits(r.person,d);
    if(dv.length<2)continue;
    const first=Math.min(...dv.map(v=>v.start));
    dv.sort((a,b)=>newOrder.indexOf(a.storeId)-newOrder.indexOf(b.storeId));
    let cur=first;
    for(const v of dv){v.start=skipBreaks(cur);cur=v.start+v.dur;}
  }
  for(const {v} of snaps){const bv=baseVisits.find(x=>x.id===v.id);if(bv){bv.start=v.start;bv.day=v.day;}}
  clearFutureWeeks();
  logChange(`${r.code}: ziyaret sırası değiştirildi (Baz)`,r.person,null,
    ()=>{for(const {v,s} of snaps){restoreVisit(v,s);const bv=baseVisits.find(x=>x.id===v.id);if(bv){bv.start=s.start;bv.day=s.day;}}});
}
function logChange(desc,pid,day,undoFn,patch){
  changes.push({id:'c'+(++chgSeq),desc,personId:pid,day,undo:undoFn,patch:!!patch});
  renderAll();
}
function snapshotVisit(v){return {...v};}
function restoreVisit(v,snap){Object.assign(v,snap);}
/* ---------- filtering ---------- */
function filterRouteIds(){
  if(!filter)return null;
  if(filter.type==='routes')return filter.ids;
  if(filter.type==='person'){const r=personRoute(filter.id);return new Set(r?[r.id]:[]);}
  return null;
}
function visibleStores(){
  const ids=filterRouteIds();
  if(!ids)return stores;
  return stores.filter(s=>(s.route&&ids.has(s.route))||!s.route);
}
function visiblePeople(){
  if(!filter)return people.filter(function(p){return routes.some(function(r){return r.person===p.id;})||visits.some(function(v){return v.personId===p.id;});});
  if(filter.type==='person')return people.filter(p=>p.id===filter.id);
  const ids=filterRouteIds();
  if(ids){const ps=new Set([...ids].map(id=>route(id).person));return people.filter(p=>ps.has(p.id));}
  return people;
}
function toggleRouteFilter(rid,additive){
  let ids=(filter&&filter.type==='routes')?new Set(filter.ids):new Set();
  if(!additive){
    if(ids.size===1&&ids.has(rid)){setFilter(null);return;}
    ids=new Set([rid]);
  } else {
    if(ids.has(rid))ids.delete(rid);else ids.add(rid);
  }
  if(!ids.size){setFilter(null);return;}
  setFilter({type:'routes',ids});
  setFocus(ids.size===1?{type:'route',id:[...ids][0]}:{type:'routes'});
}
function setFilter(f){filter=f;renderAll();}
function setFocus(f){focus=f;panelTab='info';renderPanel();}
/* ---------- rail ---------- */
function renderRail(){
  const el=$('#railList');el.innerHTML='';
  $('#poolCount').textContent=stores.filter(s=>!s.route&&s.active!==false).length;
  document.querySelectorAll('.rail .tabs div').forEach(t=>t.classList.toggle('on',t.dataset.t===railTab));
  if(railTab==='routes'){
    for(const r of routes){if(r.active===false)continue;
      const rev=stores.filter(s=>s.route===r.id&&s.active!==false).reduce((a,s)=>a+s.rev,0);
      const ok=rev>=r.target;
      const d=document.createElement('div');
      const fids=filterRouteIds();
      const exp=expandedRoutes.has(r.id);
      const pts=stores.filter(s=>s.route===r.id&&s.active!==false);
      d.className='route-item'+(fids&&fids.has(r.id)?' on':'');
      d.innerHTML=`<div class="code"><span class="dot" style="background:${r.color}"></span>${r.code}${r.draft?' <span class="pill" style="background:var(--amber-l);color:var(--amber-d);">taslak</span>':''}
          <span class="spacer"></span><span class="exp" style="cursor:pointer;color:var(--tx3);padding:0 3px;">${exp?'▾':'▸'}</span></div>
        <div class="sub">${r.person?person(r.person).name:'kişi yok'} · ${rev}K ${ok?'✅':'⚠️'} · ${pts.length} nokta</div>
        ${exp?`<div style="margin-top:6px;border-top:1px solid var(--border);padding-top:4px;">
          ${routeStoreOrder(r.id).map((sid,i)=>{const s=store(sid);return `<div class="rstore" draggable="true" data-s="${s.id}" data-r="${r.id}" style="padding:3px 2px;font-size:11px;display:flex;align-items:center;gap:5px;color:${focus&&focus.type==='store'&&focus.id===s.id?'var(--blue-d)':'var(--tx2)'};cursor:grab;${focus&&focus.type==='store'&&focus.id===s.id?'font-weight:700;':''}"><span style="min-width:16px;height:16px;border-radius:50%;background:${r.color};color:#fff;font-size:9px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;">${i+1}</span>${s.name}</div>`;}).join('')}
          <div style="font-size:9px;color:var(--tx3);padding:2px;">sıralamak için sürükle</div>
        </div>`:''}`;
      d.querySelector('.exp').onclick=e=>{e.stopPropagation();exp?expandedRoutes.delete(r.id):expandedRoutes.add(r.id);renderRail();};
      d.querySelectorAll('.rstore').forEach(rs=>{
        rs.onclick=e=>{e.stopPropagation();setFocus({type:'store',id:rs.dataset.s});renderAll();};
        rs.ondragstart=e=>{e.stopPropagation();e.dataTransfer.setData('text/reorder',rs.dataset.s+'|'+rs.dataset.r);};
        rs.ondragover=e=>{e.preventDefault();rs.style.borderTop='2px solid var(--blue-d)';};
        rs.ondragleave=()=>rs.style.borderTop='';
        rs.ondrop=e=>{
          e.preventDefault();e.stopPropagation();rs.style.borderTop='';
          const dt=e.dataTransfer.getData('text/reorder');if(!dt)return;
          const [srcId,srcR]=dt.split('|');
          if(srcR!==rs.dataset.r||srcId===rs.dataset.s)return;
          const ord=routeStoreOrder(srcR).filter(x=>x!==srcId);
          ord.splice(ord.indexOf(rs.dataset.s),0,srcId);
          resequenceRoute(srcR,ord);
          toast('Ziyaret sırası güncellendi — takvim saatleri yeniden dizildi',[{t:'Geri al',f:undoLast}]);
        };
      });
      d.onclick=e=>toggleRouteFilter(r.id,e.shiftKey);
      el.appendChild(d);
    }
    const nb=document.createElement('div');
    nb.className='pool-item';nb.style.textAlign='center';nb.style.cursor='pointer';
    nb.innerHTML='<span style="color:var(--tx2)">+ Yeni rut</span>';
    nb.onclick=()=>{if(draftMode){toast('Önce mevcut taslağı bitir veya iptal et',[]);return;}openNewRouteModal();};
    el.appendChild(nb);
  } else {
    for(const s of stores.filter(s=>!s.route&&s.active!==false)){
      const d=document.createElement('div');
      d.className='pool-item';d.draggable=true;
      d.innerHTML=`<div class="nm">${s.name}</div><div class="sub"><span class="badge ${s.cat}">${catL(s.cat)}</span> ${s.rev}K/6ay</div>`;
      d.ondragstart=e=>{e.dataTransfer.setData('text/pool',s.id);};
      d.onclick=()=>setFocus({type:'store',id:s.id});
      el.appendChild(d);
    }
    const na=document.createElement('div');
    na.className='pool-item';na.style.textAlign='center';na.style.cursor='pointer';
    na.innerHTML='<span style="color:var(--tx2)">+ Yeni mağaza</span>';
    na.onclick=openNewStoreModal;
    el.appendChild(na);
    if(!stores.filter(s=>!s.route&&s.active!==false).length&&el.children.length===1)el.insertAdjacentHTML('afterbegin','<div class="empty">Havuz boş 🎉</div>');
  }
}
function catL(c){return c==='P'?'Potansiyel':c==='V'?'Değerli':'Servis';}
/* ---------- map ---------- */
const MAP_BG=`<g pointer-events="none">
  <rect x="0" y="0" width="600" height="520" fill="#EDEFE6"/>
  <path d="M-10 470 C 120 430, 200 480, 330 445 S 540 470, 620 430 L 620 530 L -10 530 Z" fill="#C9DFF0"/>
  <path d="M-10 470 C 120 430, 200 480, 330 445 S 540 470, 620 430" fill="none" stroke="#AECBE4" stroke-width="3"/>
  <rect x="330" y="30" width="110" height="80" rx="6" fill="#D9E8CF"/>
  <rect x="40" y="290" width="90" height="70" rx="6" fill="#D9E8CF"/>
  <rect x="490" y="120" width="80" height="60" rx="6" fill="#D9E8CF"/>
  <g stroke="#FFFFFF" stroke-width="7" stroke-linecap="round">
    <path d="M0 100 H600"/><path d="M0 190 H600"/><path d="M0 275 H600"/><path d="M0 365 H600"/>
    <path d="M80 0 V520"/><path d="M185 0 V520"/><path d="M295 0 V520"/><path d="M405 0 V520"/><path d="M510 0 V520"/>
  </g>
  <g stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" opacity="0.9">
    <path d="M0 55 H600"/><path d="M0 145 H600"/><path d="M0 232 H600"/><path d="M0 320 H600"/><path d="M0 410 H600"/>
    <path d="M35 0 V520"/><path d="M132 0 V520"/><path d="M240 0 V520"/><path d="M350 0 V520"/><path d="M460 0 V520"/><path d="M558 0 V520"/>
    <path d="M80 100 L 295 275"/><path d="M405 190 L 510 365"/>
  </g>
  <g fill="#E3E4DA">
    <rect x="90" y="110" width="35" height="28" rx="2"/><rect x="195" y="112" width="30" height="24" rx="2"/>
    <rect x="92" y="200" width="28" height="22" rx="2"/><rect x="305" y="200" width="34" height="26" rx="2"/>
    <rect x="415" y="112" width="30" height="24" rx="2"/><rect x="415" y="285" width="32" height="24" rx="2"/>
    <rect x="195" y="288" width="30" height="22" rx="2"/><rect x="520" y="200" width="28" height="22" rx="2"/>
    <rect x="92" y="375" width="30" height="22" rx="2"/><rect x="305" y="375" width="32" height="24" rx="2"/>
  </g>
  <g font-size="9" fill="#A9A79D" font-style="italic">
    <text x="345" y="75">Gençlik Parkı</text><text x="55" y="325">Kuğulu Park</text>
    <text x="250" y="500">Ankara Çayı</text>
  </g>
</g>`;
function renderMap(){if(window.__evoRenderMap){window.__evoRenderMap();return;}
  const svg=$('#mapSvg');svg.innerHTML=MAP_BG;
  const vs=new Set(visibleStores().map(s=>s.id));
  const fids=filterRouteIds();
  for(const r of routes){if(r.active===false)continue;
    const pts=stores.filter(s=>s.route===r.id&&s.active!==false);
    const ptsStr=pts.map(p=>p.x+','+p.y).join(' ');
    const active=!fids||fids.has(r.id);
    const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');
    line.setAttribute('points',ptsStr);
    line.setAttribute('fill','none');line.setAttribute('stroke',r.color);
    line.setAttribute('stroke-width',active?3:1.5);line.setAttribute('opacity',active?0.9:0.25);
    svg.appendChild(line);
    const hit=document.createElementNS('http://www.w3.org/2000/svg','polyline');
    hit.setAttribute('points',ptsStr);
    hit.setAttribute('fill','none');hit.setAttribute('stroke','rgba(0,0,0,0)');
    hit.setAttribute('stroke-width',14);hit.style.cursor='pointer';
    hit.addEventListener('click',e=>{e.stopPropagation();hidePopover();toggleRouteFilter(r.id,e.shiftKey);});
    hit.addEventListener('pointerdown',e=>e.stopPropagation());
    svg.appendChild(hit);
  }
  for(const s of stores){if(s.active===false)continue;
    const g=document.createElementNS('http://www.w3.org/2000/svg','g');
    const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('cx',s.x);c.setAttribute('cy',s.y);
    c.setAttribute('r',selection.has(s.id)?10:7);
    if(s.route){
      const r=route(s.route);const active=!filter||vs.has(s.id);
      c.setAttribute('fill',r.color);c.setAttribute('opacity',active?1:0.25);
      if(visits.some(v=>v.storeId===s.id&&v.patched)){c.setAttribute('stroke','#378ADD');c.setAttribute('stroke-width',2);c.setAttribute('stroke-dasharray','3,2');}
    } else {
      c.setAttribute('fill','#FAFAF7');c.setAttribute('stroke','#6B6A64');c.setAttribute('stroke-width',2);
    }
    if(selection.has(s.id)){c.setAttribute('stroke','#185FA5');c.setAttribute('stroke-width',3);c.setAttribute('stroke-dasharray','');}
    if(focus&&focus.type==='store'&&focus.id===s.id){c.setAttribute('r',11);c.setAttribute('stroke','#2C2C2A');c.setAttribute('stroke-width',3);c.setAttribute('stroke-dasharray','');}
    c.style.cursor='pointer';
    c.onclick=e=>{e.stopPropagation();showPopover(s,e);};
    g.appendChild(c);
    const num=storeOrderNum(s.id);
    if(num!==null){
      const nt=document.createElementNS('http://www.w3.org/2000/svg','text');
      nt.setAttribute('x',s.x);nt.setAttribute('y',s.y+3);
      nt.setAttribute('text-anchor','middle');nt.setAttribute('font-size','9');
      nt.setAttribute('font-weight','bold');nt.setAttribute('fill','#FFFFFF');
      nt.setAttribute('pointer-events','none');
      nt.textContent=num;g.appendChild(nt);
    }
    const t=document.createElementNS('http://www.w3.org/2000/svg','text');
    t.setAttribute('x',s.x+11);t.setAttribute('y',s.y+4);
    t.setAttribute('font-size','10');t.setAttribute('fill','#6B6A64');
    t.textContent=s.name.split(' ').slice(0,2).join(' ');
    g.appendChild(t);
    svg.appendChild(g);
  }
  $('#mapInfo').textContent=`${stores.filter(s=>!s.route&&s.active!==false).length} atanmamış nokta`;
}
function showPopover(s,e){
  hidePopover();
  const wrap=$('#mapSvgWrap');const rect=wrap.getBoundingClientRect();
  const d=document.createElement('div');d.className='popover';d.id='mapPopover';
  const r=s.route?route(s.route):null;
  d.innerHTML=`<div class="nm">${s.name}</div>
    <div class="row"><span class="badge ${s.cat}">${catL(s.cat)}</span> ${s.chain} · ${s.format}</div>
    <div class="row">Ciro (6 ay): <b>${s.rev}K ₺</b> ▁▂▄▃▅▆</div>
    <div class="row">Rut: ${r?r.code+' · '+person(r.person).name:'<b style="color:var(--amber-d)">atanmamış</b>'}</div>
    <div class="actions">
      ${r?'':`<select onchange="if(this.value)assignStore('${s.id}',this.value)" style="font-size:11px;border:1px solid var(--border2);border-radius:5px;padding:3px;max-width:120px;">
        <option value="">→ Ruta ekle…</option>
        ${routes.filter(rt=>rt.active!==false).map(rt=>`<option value="${rt.id}">${rt.code}${rt.draft?' 📝':''} · ${rt.name}</option>`).join('')}
      </select>`}
      <button onclick="expandStore('${s.id}')">Genişlet →</button>
    </div>`;
  let x=e.clientX-rect.left+12,y=e.clientY-rect.top-10;
  if(x>rect.width-240)x=rect.width-240; if(y>rect.height-150)y=rect.height-150;
  d.style.left=x+'px';d.style.top=y+'px';
  wrap.appendChild(d);
}
function hidePopover(){const p=$('#mapPopover');if(p)p.remove();}
window.expandStore=id=>{hidePopover();setFocus({type:'store',id});};
window.assignStore=(sid,rid)=>{
  hidePopover();
  const s=store(sid);const r=route(rid);const prev=s.route;
  if(r.draft){
    s.route=rid;s.draftSeq=++draftSeqC;
    if(r.person)generateDraftSchedule(r);
    renderAll();
    return;
  }
  s.route=rid;
  let best=0,min=1e9;
  for(let d=0;d<5;d++){const t=dayTotal(r.person,d);if(t<min){min=t;best=d;}}
  const dv=dayVisits(r.person,best);
  const st=dv.length?dv[dv.length-1].start+dv[dv.length-1].dur:DAY_START;
  const nv=V(sid,r.person,best,skipBreaks(st),30);
  visits.push(nv);baseVisits.push({...nv});clearFutureWeeks();reflow(r.person,best);
  logChange(`${s.name} → ${r.code} (${DAYS[best]} eklendi)`,r.person,best,
    ()=>{s.route=prev;visits=visits.filter(v=>v.id!==nv.id);baseVisits=baseVisits.filter(v=>v.id!==nv.id);});
  toast(`${s.name} ${r.code} rutuna eklendi (${DAYS[best]})`,[]);
};
/* ---------- marquee selection ---------- */
(function(){
  const svg=$('#mapSvg'),wrap=$('#mapSvgWrap');let mq=null,sx=0,sy=0;
  svg.addEventListener('pointerdown',e=>{
    if(e.target.tagName==='circle')return;
    hidePopover();
    const r=wrap.getBoundingClientRect();sx=e.clientX-r.left;sy=e.clientY-r.top;
    mq=document.createElement('div');mq.className='marquee';wrap.appendChild(mq);
    const move=ev=>{
      const x=ev.clientX-r.left,y=ev.clientY-r.top;
      mq.style.left=Math.min(x,sx)+'px';mq.style.top=Math.min(y,sy)+'px';
      mq.style.width=Math.abs(x-sx)+'px';mq.style.height=Math.abs(y-sy)+'px';
    };
    const up=ev=>{
      document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);
      const x=ev.clientX-r.left,y=ev.clientY-r.top;
      const box=svg.getBoundingClientRect();
      const scaleX=600/box.width, scaleY=520/box.height;
      const x1=Math.min(x,sx)*scaleX,x2=Math.max(x,sx)*scaleX,y1=Math.min(y,sy)*scaleY,y2=Math.max(y,sy)*scaleY;
      mq.remove();mq=null;
      if(Math.abs(x-sx)<6&&Math.abs(y-sy)<6){
        if(pendingNewStore){
          const ns={id:'s'+Date.now(),...pendingNewStore,x:Math.round(x*scaleX),y:Math.round(y*scaleY),route:null};
          stores.push(ns);pendingNewStore=null;
          renderAll();setFocus({type:'store',id:ns.id});
          toast(ns.name+' havuza eklendi ✓ (denetim kaydına yazıldı)',[]);
          return;
        }
        selection.clear();renderAll();return;
      }
      selection.clear();
      for(const s of stores){if(s.active===false)continue;if(s.x>=x1&&s.x<=x2&&s.y>=y1&&s.y<=y2)selection.add(s.id);}
      if(selection.size){focus={type:'selection'};panelTab='info';}
      else if(focus&&focus.type==='selection')focus=null;
      renderAll();
    };
    document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);
  });
})();
/* ---------- action bar ---------- */
function renderActionBar(){
  let bar=$('#actionBar');if(bar)bar.remove();
  if(!selection.size)return;
  bar=document.createElement('div');bar.className='actionbar';bar.id='actionBar';
  bar.innerHTML=`<b>${selection.size} nokta seçili</b>
    ${routes.filter(rt=>rt.active!==false).map(rt=>`<button onclick="bulkAssign('${rt.id}')">→ ${rt.code}${rt.draft?' 📝':''}</button>`).join('')}
    <button onclick="openDrawer(true)">▤ Tabloda gör</button>
    <button onclick="clearSel()">✕</button>`;
  $('#mapPane').appendChild(bar);
}
window.clearSel=()=>{selection.clear();if(focus&&focus.type==='selection')focus=null;renderAll();};
window.bulkAssign=rid=>{
  const ids=[...selection].filter(id=>!store(id).route);
  if(!ids.length){toast('Seçimde atanmamış nokta yok',[]);return;}
  for(const id of ids)assignStore(id,rid);
  selection.clear();renderAll();
};
/* ---------- schedule ---------- */
function renderSched(){
  const el=$('#schedScroll');el.innerHTML='';
  if(isRO())el.innerHTML='<div style="background:var(--gray-l);color:var(--tx2);border-radius:6px;padding:5px 10px;font-size:11px;margin-bottom:8px;">🔒 Geçmiş hafta — salt okunur. Gerçek sistemde burada plan vs gerçekleşen (sonuç kodlarıyla) görünür.</div>';
  computeIssues(); /* v0.5: kart durumu + gün başlığı sayaçları için */
  const grid=document.createElement('div');grid.className='sched-grid';
  grid.appendChild(document.createElement('div'));
  /* v0.5.1: gün başlığı sayaçları kişi satırına taşındı (kapsam-bazlı yerleşim: kişi+gün) —
     başlıkta yalnızca gün adları kalır; rozetler her kişinin ilgili gün sütununda görünür. */
  DAYS.forEach(d=>{
    const h=document.createElement('div');h.className='day-head';h.textContent=d;
    grid.appendChild(h);
  });
  const src=mode==='base'?baseVisits:visits;
  for(const p of visiblePeople()){
    const pc=document.createElement('div');pc.className='person-cell';
    const wk=weekTotal(p.id),cap=QUOTA*5,pct=Math.round(wk/cap*100);
    const r=personRoute(p.id);
    const val=visits.filter(v=>v.personId===p.id&&store(v.storeId).cat!=='S').reduce((s,v)=>s+v.dur,0);
    const valPct=wk?Math.round(val/wk*100):0;
    pc.innerHTML=`<div class="nm">${p.name} <button title="Aylık genel bakış" style="border:1px solid var(--border2);background:var(--card);color:var(--tx2);border-radius:10px;cursor:pointer;font-size:10px;padding:1px 8px;margin-left:6px;vertical-align:middle;" onclick="event.stopPropagation();if(window.__evoPersonOverview)window.__evoPersonOverview('${p.id}')">📅 Aylık</button></div>
      <div class="meta">${r?r.code:'—'} · %${valPct} değerli</div>
      <div class="loadbar"><div style="width:${Math.min(pct,100)}%;background:${pct>100?'var(--red)':pct<80?'var(--amber)':'var(--green)'}"></div></div>
      <div class="meta">%${pct} yük</div>`;
    pc.querySelector('.nm').onclick=()=>{ if(filter&&filter.type==='person'&&filter.id===p.id){setFilter(null);}else{setFilter({type:'person',id:p.id});setFocus({type:'person',id:p.id});} };
    grid.appendChild(pc);
    /* v0.5.1: boş takvim çizme — bu hafta ziyareti olmayan kişi yalnızca bilgi satırı olarak
       görünür (bir filtre aktifken tam ızgara kalır: seçilen rut/kişi için plan kurulabilsin). */
    if(!filter&&!visits.some(v=>v.personId===p.id)){
      const nn=document.createElement('div');nn.className='meta';nn.style.color='var(--tx3)';
      nn.textContent='Bu hafta planlanmış ziyaret yok';pc.appendChild(nn);
      continue;
    }
    const ax=document.createElement('div');ax.className='time-axis';
    for(let h=DAY_START;h<=DAY_END;h+=60){
      const sp=document.createElement('span');
      sp.style.top=((h-DAY_START)*PXMIN)+'px';sp.textContent=fmtT(h);ax.appendChild(sp);
    }
    grid.appendChild(ax);
    for(let day=0;day<5;day++){
      const cell=document.createElement('div');cell.className='day-cell';cell.dataset.p=p.id;cell.dataset.d=day;
      for(let h=DAY_START+60;h<DAY_END;h+=60){
        const hl=document.createElement('div');hl.className='hline';
        hl.style.top=((h-DAY_START)*PXMIN)+'px';cell.appendChild(hl);
      }
      for(const b of BREAKS){
        const bd=document.createElement('div');bd.className='brk';
        bd.style.top=((b.s-DAY_START)*PXMIN)+'px';bd.style.height=((b.e-b.s)*PXMIN)+'px';
        bd.textContent=b.l;cell.appendChild(bd);
      }
      const tot=dayVisits(p.id,day,src).reduce((s,v)=>s+v.dur,0);
      const td=document.createElement('div');td.className='day-total '+(tot>QUOTA?'over':tot<QUOTA*0.6?'under':'ok');
      td.textContent=tot+"'";cell.appendChild(td);
      /* v0.5.1: kişi+gün problem rozetleri — Sorun Merkezi sayaçları ilgili günün üstünde */
      const pe=curIssues.filter(i=>i.personId===p.id&&i.day===day&&i.sev==='err').length;
      const pw=curIssues.filter(i=>i.personId===p.id&&i.day===day&&i.sev==='warn').length;
      if(pe||pw){
        const ic=document.createElement('div');ic.className='day-issues';ic.title='Sorun Merkezi';
        ic.innerHTML=(pe?`<span style="color:var(--red-d)">🔴${pe}</span>`:'')+(pw?`<span style="color:var(--amber-d)">🟡${pw}</span>`:'');
        ic.onclick=openConflictCenter;cell.appendChild(ic);
      }
      for(const v of dayVisits(p.id,day,src)){
        const s=store(v.storeId);
        const b=document.createElement('div');
        b.className='vblock cat'+s.cat+(v.patched&&mode==='eff'?' patched':'')+(focus&&focus.type==='store'&&focus.id===s.id?' sel':'');
        b.dataset.vid=v.id;b.dataset.sid=s.id; /* v0.5: atla-ve-vurgula için */
        b.style.top=((v.start-DAY_START)*PXMIN)+'px';
        b.style.height=Math.max(v.dur*PXMIN-2,14)+'px';
        /* v0.5: değer şeridi (Q8) — satır içi minik: ▲%12 ★★★★. Grafik değil,
           bakış hızında sinyal; detay Planlama Kanıtı panelinde. */
        const vs=(mode==='eff'&&s.perf&&v.dur*PXMIN>=18)?` <span class="vs">${s.perf.sales>=0?'▲':'▼'}${Math.abs(s.perf.sales)}% ${'★'.repeat(s.perf.roi)}</span>`:'';
        b.innerHTML=`<div class="t">${s.name}</div><div class="s">${fmtT(v.start)} · ${v.dur}dk${vs}</div><div class="rz"></div><div class="rzT"></div>`;
        b.title=`${s.name} · Amaç: ${storePurpose(s)}${v.patchUntil?` · yama: ${v.patchUntil}`:v.patched?` · yama: H${currentWeek}`:''}`;
        /* v0.5: kart başına TEK durum işareti (önem önceliği — ışıklandırma yok) */
        if(mode==='eff'){
          const w=visitWorst(v.id);
          if(w){const d2=document.createElement('span');d2.className='vst '+w;d2.textContent='●';b.appendChild(d2);}
        }
        if(mode==='eff'&&!isRO())attachBlock(b,v);
        else{b.style.cursor='default';b.style.opacity='.7';
          if(isRO())b.onclick=()=>setFocus({type:'store',id:v.storeId});}
        cell.appendChild(b);
      }
      /* v0.5: seyahat bağlacı (Q4) — zaman çizelgesinde görünmez değil ama
         neredeyse: tek çizgi + 🚗 etiketi. İmkânsız = kırmızı, düşük güven = amber.
         Dikey alan TÜKETMEZ — boşluğun içine çizilir. */
      if(mode==='eff'){
        const dvs=dayVisits(p.id,day,src);
        for(let i=1;i<dvs.length;i++){
          const a=dvs[i-1],b2=dvs[i],gap=b2.start-(a.start+a.dur);
          if(gap<=0)continue; /* çakışma zaten kartta 🔴 */
          const sa=store(a.storeId),sb=store(b2.storeId);
          const t=travelMin(sa,sb),conf=travelConf(sa,sb),man=conf==='elle';
          const cd=document.createElement('div');
          cd.className='conn'+(gap<t?' bad':conf==='düşük'?' low':'');
          cd.style.top=((a.start+a.dur-DAY_START)*PXMIN)+'px';
          cd.style.height=Math.max(gap*PXMIN,9)+'px';
          cd.title=`${sa.name} → ${sb.name}: 🚗 ${man?'':'~'}${t}dk (kaynak: ${man?'elle girildi':'tahmin · '+conf+' güven'}${conf==='düşük'?' — ~5dk tampon önerilir':''})${gap<t?` · ⚠ İMKÂNSIZ — ${t-gap}dk eksik`:` · boşluk ${gap}dk`} · tıkla: süreyi düzenle`;
          if(gap*PXMIN>=13)cd.innerHTML=`<span>🚗${gap<t?'⚠'+(t-gap)+'dk eksik':(conf==='düşük'?'~':'')+t+'dk'}${man?'✎':''}</span>`;
          /* v0.5.5: bağlaca tıkla → yol süresini elle düzelt (Elle > GPS > Tahmin) */
          if(!isRO()){cd.style.cursor='pointer';cd.onclick=e=>{e.stopPropagation();openTravelEdit(sa.id,sb.id);};}
          cell.appendChild(cd);
        }
      }
      if(mode==='eff'&&!isRO()){
        cell.ondragover=e=>{e.preventDefault();cell.classList.add('dragover');};
        cell.ondragleave=()=>cell.classList.remove('dragover');
        cell.ondrop=e=>{
          e.preventDefault();cell.classList.remove('dragover');
          const sid=e.dataTransfer.getData('text/pool');if(!sid)return;
          const s=store(sid);const prev=s.route;
          const r=personRoute(p.id);if(!r){toast('Bu kişiye atanmış rut yok',[]);return;}
          s.route=r.id;
          const dv=dayVisits(p.id,day);
          const st=dv.length?dv[dv.length-1].start+dv[dv.length-1].dur:DAY_START;
          const nv=V(sid,p.id,day,skipBreaks(st),30);
          visits.push(nv);baseVisits.push({...nv});clearFutureWeeks();reflow(p.id,day);
          logChange(`${s.name} → ${r.code} (${DAYS[day]})`,p.id,day,()=>{s.route=prev;visits=visits.filter(x=>x.id!==nv.id);baseVisits=baseVisits.filter(x=>x.id!==nv.id);});
          toast(`${s.name} havuzdan eklendi → ${p.name} · ${DAYS[day]}`,[]);
        };
      }
      grid.appendChild(cell);
    }
  }
  el.appendChild(grid);
}
/* ---------- blok sürükle + boyutlandır ----------
   Sürükleme = varsayılan YAMA (bu hafta), toast'tan kalıcıya çevrilir.
   Kenar sürükleme = süre (5dk snap) + canlı reflow; bırakınca kapsam
   toast'ı: ziyaret(tarihli) / mağaza / rut / format. Format seçeneği
   GERÇEKTEN tüm aynı zincir+format ziyaretlerini günceller (kural). */
function attachBlock(el,v){
  el.addEventListener('pointerdown',e=>{
    if(e.target.classList.contains('rz')){startResize(e,el,v);return;}
    if(e.target.classList.contains('rzT')){startResizeTop(e,el,v);return;}
    startMove(e,el,v);
  });
}
/* Üst kenar: başlangıç saatini kaydırır, BİTİŞ sabit kalır (takvim standardı). */
function startResizeTop(e,el,v){
  e.preventDefault();e.stopPropagation();
  const startY=e.clientY,origStart=v.start,end=v.start+v.dur;const before=snapshotVisit(v);
  const move=ev=>{
    let ns=origStart+Math.round((ev.clientY-startY)/PXMIN/5)*5;
    ns=Math.max(DAY_START,Math.min(ns,end-10));
    if(ns!==v.start){v.start=ns;v.dur=end-ns;renderSched();}
  };
  const up=()=>{
    document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);
    if(v.start===origStart)return;
    const s=store(v.storeId);
    v.patched=true;
    logChange(`${s.name}: başlangıç ${fmtT(origStart)} → ${fmtT(v.start)} (${v.dur}dk)`,v.personId,v.day,
      ()=>{restoreVisit(v,before);reflow(v.personId,v.day);},true);
    /* v0.5: kalıcı = etki onaylı; pencere = olay-bazlı seçenekler */
    toast(`${s.name}: ${fmtT(v.start)}–${fmtT(end)} — sadece H${currentWeek}`,
      [{t:'Kalıcı yap (Baz)',f:()=>makePermanentUI(v)}]
      .concat(patchWindows(v).map(w=>({t:w.t,f:()=>applyPatchWindow(v,w)})))
      .concat([{t:'Geri al',f:undoLast}]));
  };
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);
}
function startMove(e,el,v){
  e.preventDefault();
  const startX=e.clientX,startY=e.clientY;let moved=false,ghost=null,dropInd=null;
  /* Drop göstergesi: gün DEĞİL, tam saat hedeflenir — imlecin altındaki
     5dk'ya yuvarlanmış yeni saat, çizgi + etiketle canlı gösterilir. */
  const snapAt=(cell,clientY)=>{
    const rect=cell.getBoundingClientRect();
    let m=DAY_START+Math.round(((clientY-rect.top)/PXMIN)/5)*5;
    return Math.max(DAY_START,Math.min(m,DAY_END-v.dur));
  };
  const move=ev=>{
    if(!moved&&(Math.abs(ev.clientX-startX)>5||Math.abs(ev.clientY-startY)>5)){
      moved=true;el.classList.add('dragging');
      ghost=el.cloneNode(true);ghost.style.position='fixed';ghost.style.width=el.offsetWidth+'px';
      ghost.style.pointerEvents='none';ghost.style.zIndex=100;ghost.style.opacity=.85;document.body.appendChild(ghost);
      dropInd=document.createElement('div');
      dropInd.style.cssText='position:absolute;left:2px;right:2px;border-radius:4px;border:2px dashed var(--blue-d);background:rgba(55,138,221,.12);z-index:4;pointer-events:none;display:none;';
      dropInd.innerHTML='<span style="position:absolute;top:-1px;left:3px;font-size:9px;font-weight:700;color:var(--blue-d);background:var(--card);border-radius:3px;padding:0 3px;"></span>';
    }
    if(ghost){ghost.style.left=(ev.clientX+8)+'px';ghost.style.top=(ev.clientY+8)+'px';}
    document.querySelectorAll('.day-cell').forEach(c=>c.classList.remove('dragover'));
    const t=document.elementFromPoint(ev.clientX,ev.clientY);
    const cell=t&&t.closest?t.closest('.day-cell'):null;
    if(cell&&moved){
      cell.classList.add('dragover');
      if(dropInd){
        if(dropInd.parentElement!==cell)cell.appendChild(dropInd);
        const m=snapAt(cell,ev.clientY);
        dropInd.style.display='block';
        dropInd.style.top=((m-DAY_START)*PXMIN)+'px';
        dropInd.style.height=Math.max(v.dur*PXMIN-2,12)+'px';
        dropInd.querySelector('span').textContent=fmtT(m)+'–'+fmtT(m+v.dur)+' · '+v.dur+'dk';
      }
    } else if(dropInd){dropInd.style.display='none';}
  };
  const up=ev=>{
    document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);
    if(ghost)ghost.remove();if(dropInd)dropInd.remove();el.classList.remove('dragging');
    document.querySelectorAll('.day-cell').forEach(c=>c.classList.remove('dragover'));
    if(!moved){setFocus({type:'store',id:v.storeId});return;}
    const t=document.elementFromPoint(ev.clientX,ev.clientY);
    const cell=t&&t.closest?t.closest('.day-cell'):null;
    if(!cell)return;
    const np=cell.dataset.p,nd=+cell.dataset.d;
    const before=snapshotVisit(v);
    const ns=snapAt(cell,ev.clientY);
    if(np===v.personId&&nd===v.day&&ns===v.start)return;
    v.personId=np;v.day=nd;v.start=skipBreaks(ns);v.patched=true;
    reflow(np,nd);
    const s=store(v.storeId);
    logChange(`${s.name}: ${DAYS[before.day]}→${DAYS[nd]}${np!==before.personId?' · '+person(np).name:''}`,np,nd,
      ()=>restoreVisit(v,before),true);
    /* v0.5: kalıcı = etki onaylı; pencere = olay-bazlı seçenekler */
    toast(`${s.name} taşındı — sadece H${currentWeek}`,
      [{t:'Kalıcı yap (Baz)',f:()=>makePermanentUI(v)}]
      .concat(patchWindows(v).map(w=>({t:w.t,f:()=>applyPatchWindow(v,w)})))
      .concat([{t:'Geri al',f:()=>{undoLast();}}]));
  };
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);
}
function startResize(e,el,v){
  e.preventDefault();e.stopPropagation();
  const startY=e.clientY,origDur=v.dur;const before=snapshotVisit(v);
  const move=ev=>{
    let nd=origDur+Math.round((ev.clientY-startY)/PXMIN/5)*5;
    nd=Math.max(10,Math.min(nd,240));
    if(nd!==v.dur){v.dur=nd;reflow(v.personId,v.day);renderSched();}
  };
  const up=()=>{
    document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);
    if(v.dur===origDur)return;
    const s=store(v.storeId);
    logChange(`${s.name}: ${origDur}dk → ${v.dur}dk`,v.personId,v.day,()=>{restoreVisit(v,before);reflow(v.personId,v.day);});
    const vr=personRoute(v.personId);
    /* v0.5: kural kapsamları önce ETKİ ÖNİZLEME gösterir (Q7) — dalga
       etkisini görmeden 147 mağazayı değiştiremezsin. */
    toast(`${s.name}: ${origDur}dk → ${v.dur}dk. Nereye uygulansın?`,[
      {t:'Sadece bu ziyaret (tarihli)',f:()=>{v.patched=true;changes[changes.length-1].patch=true;renderAll();}},
      {t:'Bu mağaza hep',f:()=>{previewApply(x=>x.storeId===v.storeId,v.dur,`${s.name} tüm ziyaretler → ${v.dur}dk (mağaza kuralı)`);}},
      {t:vr?`Bu rutta (${vr.code})`:'Bu rutta',f:()=>{if(vr)previewApply(x=>{const xr=personRoute(x.personId);return xr&&xr.id===vr.id;},v.dur,`${vr.code} tüm ziyaretler → ${v.dur}dk (rut kuralı)`);}},
      {t:`Tüm ${s.format} tipi`,f:()=>{previewApply(x=>{const xs=store(x.storeId);return xs.format===s.format;},v.dur,`Tüm ${s.format} tipi → ${v.dur}dk (tip kuralı)`);}}
    ]);
  };
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);
}
function applyDur(pred,dur,desc){
  const snaps=visits.filter(pred).map(v=>({v,s:snapshotVisit(v)}));
  for(const {v} of snaps){v.dur=dur;const bv=baseVisits.find(x=>x.id===v.id);if(bv)bv.dur=dur;}
  clearFutureWeeks();
  const days=new Set(snaps.map(({v})=>v.personId+'|'+v.day));
  for(const k of days){const [p,d]=k.split('|');reflow(p,+d);}
  logChange(desc,null,null,()=>{for(const {v,s} of snaps){restoreVisit(v,s);const bv=baseVisits.find(x=>x.id===v.id);if(bv)bv.dur=s.dur;}});
}
/* ---------- panel ---------- */
function renderPanel(){
  const head=$('#panelHead'),body=$('#panelBody');
  const dr=draftRoute();
  if(dr){
    const pts=stores.filter(s=>s.route===dr.id);
    const rev=pts.reduce((a,s)=>a+s.rev,0);
    const mix={P:0,V:0,S:0};pts.forEach(s=>mix[s.cat]++);
    const mins=pts.reduce((a,s)=>a+storeDur(s),0);
    const cands=people.filter(p=>p.active!==false&&(!personRoute(p.id)||personRoute(p.id).id===dr.id));
    const ck=(ok,txt)=>`<div style="padding:4px 0;font-size:12px;">${ok===true?'<span style="color:var(--green)">✓</span>':ok===false?'<span style="color:var(--amber-d)">⚠</span>':'<span style="color:var(--tx3)">○</span>'} ${txt}</div>`;
    head.innerHTML=`<div class="ttl">📝 ${dr.code} · ${dr.name}</div><div class="sub">kurulum kartı — taslak</div>`;
    body.innerHTML=
      ck(pts.length>0,`<b>${pts.length}</b> nokta ${pts.length?'seçildi':'— haritadan ekle (tık / lasso)'}`)+
      ck(pts.length?rev>=dr.target:null,`Ciro <b>${rev}K</b> / ${dr.target}K`)+
      ck(pts.length?(mins<=QUOTA*5):null,`Tahmini <b>${mins}dk</b>/hafta (görev sürelerinden)`)+
      ck(pts.length?mix.S/Math.max(pts.length,1)<=0.4:null,`Karışım 🟢${mix.P} 🟡${mix.V} ⚪${mix.S}`)+
      `<div style="padding:6px 0;font-size:12px;">${dr.person?'<span style="color:var(--green)">✓</span>':'<span style="color:var(--tx3)">○</span>'} Kişi:
        <select onchange="setDraftPerson(this.value)" style="font-size:11px;border:1px solid var(--border2);border-radius:5px;padding:2px;">
          <option value="">seç…</option>
          ${cands.map(p=>`<option value="${p.id}" ${dr.person===p.id?'selected':''}>${p.name} (yük %${Math.round(weekTotal(p.id)/(QUOTA*5)*100)})</option>`).join('')}
        </select></div>`+
      ck(dr.person?true:null,dr.person?'Hafta önizlemesi takvimde — blokları düzenleyebilirsin':'Hafta önizleme (kişi seçince otomatik)')+
      `<div style="margin-top:8px;"><button onclick="openPoolPicker('${dr.id}')" style="font-size:11px;width:100%;">🔍 Havuzdan listeyle ekle (haritaya alternatif)</button></div>`+
      `<div style="margin-top:12px;display:flex;flex-direction:column;gap:6px;">
        <button class="primary" onclick="activateDraft()">Aktifleştir</button>
        <button onclick="cancelDraft()">Vazgeç (taslağı sil)</button>
      </div>
      <div style="margin-top:10px;font-size:10.5px;color:var(--tx3);">Ciro/karışım uyarıları engellemez (450 kuralı gibi). Aktifleşince normal rut olur ve Yayınla akışına girer.</div>`;
    return;
  }
  document.querySelectorAll('#panelTabs div').forEach(t=>t.classList.toggle('on',t.dataset.t===panelTab));
  if(!focus){head.innerHTML='<div class="ttl">Detay</div><div class="sub">Bir mağaza, rut veya kişi seç</div>';body.innerHTML='<div class="empty">Haritadan bir pine, takvimden bir bloğa veya soldan bir ruta tıkla.</div>';return;}
  if(focus.type==='selection'){
    const sel=[...selection].map(store);
    const rev=sel.reduce((a,s)=>a+s.rev,0);
    const un=sel.filter(s=>!s.route);
    const mix={P:0,V:0,S:0};sel.forEach(s=>mix[s.cat]++);
    head.innerHTML=`<div class="ttl">${sel.length} nokta seçili</div><div class="sub">toplu görünüm</div>`;
    if(panelTab==='info'){
      body.innerHTML=`
        <div class="kv"><span class="k">Toplam ciro (6 ay)</span><b>${rev}K ₺</b></div>
        <div class="kv"><span class="k">Karışım</span><span>🟢${mix.P} 🟡${mix.V} ⚪${mix.S}</span></div>
        <div class="kv"><span class="k">Atanmamış</span><b style="color:${un.length?'var(--amber-d)':'var(--green)'}">${un.length} / ${sel.length}</b></div>
        <div style="margin:10px 0 6px;font-weight:600;font-size:12px;">Noktalar</div>
        ${sel.map(s=>`<div class="task-row"><span style="cursor:pointer" onclick="expandStore('${s.id}')">${s.name}</span><span>${s.rev}K ${s.route?route(s.route).code:'<b style=color:var(--amber-d)>—</b>'}</span></div>`).join('')}
        ${un.length?`<div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap;">
          <button onclick="bulkAssign('r1')">${un.length} atanmamışı → ANK-01</button>
          <button onclick="bulkAssign('r2')">→ ANK-02</button></div>`:''}`;
    } else if(panelTab==='tasks'){
      body.innerHTML=sel.map(s=>`<div class="task-row"><span>${s.name}</span><span>${s.format==='MM'?'80dk':'65dk'} görev</span></div>`).join('')+
        `<div style="margin-top:8px;color:var(--tx2);font-size:11px;">Süreler kurallardan türetildi (format bazlı).</div>`;
    } else {
      body.innerHTML=`<div class="empty">Toplu geçmiş yok — tek nokta seç.</div>`;
    }
  } else if(focus.type==='store'){
    const s=store(focus.id);const r=s.route?route(s.route):null;
    head.innerHTML=`<div class="ttl">${s.name}</div><div class="sub">${s.chain} · ${s.format} · <span class="badge ${s.cat}">${catL(s.cat)}</span></div>`;
    if(panelTab==='info'){
      body.innerHTML=`
        <div class="kv"><span class="k">Ciro (6 ay)</span><b>${s.rev}K ₺</b></div>
        <div class="kv"><span class="k">Trend</span><span>▁▂▄▃▅▆</span></div>
        <div class="kv"><span class="k">Rut</span><span>${r?r.code:'atanmamış'}</span></div>
        <div class="kv"><span class="k">Sorumlu</span><span>${r?person(r.person).name:'—'}</span></div>
        <div class="kv"><span class="k">Haftalık ziyaret</span><span>${visits.filter(v=>v.storeId===s.id).length}</span></div>
        ${s.closedUntil?`<div class="kv"><span class="k">Durum</span><b style="color:var(--red-d)">🏪 Kapalı — ${s.closedUntil}'e dek</b></div>`:''}
        <div style="margin-top:6px;display:flex;align-items:center;gap:6px;font-size:11.5px;">
          <span style="color:var(--tx2);">Ziyaret amacı</span>
          <select onchange="setStorePurpose('${s.id}',this.value)" style="font-size:11px;border:1px solid var(--border2);border-radius:5px;padding:3px;background:var(--card);color:var(--tx);">
            ${PURPOSES.map(p2=>`<option ${storePurpose(s)===p2?'selected':''}>${p2}</option>`).join('')}
          </select></div>
        ${r?`<div style="margin-top:8px;display:flex;align-items:center;gap:6px;font-size:11.5px;">
          <span style="color:var(--tx2);">Ziyaret sıklığı</span>
          <select onchange="setStoreFreq('${s.id}',this.value)" style="font-size:11px;border:1px solid var(--border2);border-radius:5px;padding:3px;background:var(--card);color:var(--tx);">
            ${FREQS.map(f=>`<option value="${f.k}" ${(s.freq||'hf')===f.k?'selected':''}>${f.l}</option>`).join('')}
          </select></div>`:''}
        ${s.perf?(()=>{const p2=s.perf,rec=evidenceRec(s);return `
        <div class="pe">
          <div class="pe-h">📊 Planlama Kanıtı <span class="conf">${rec?rec.conf+' güven':''}</span></div>
          <div class="kv"><span class="k">Ziyaret uyumu</span><b style="color:${p2.comp>=90?'var(--green)':p2.comp>=75?'var(--amber-d)':'var(--red-d)'}">%${p2.comp}</b></div>
          <div class="kv"><span class="k">Plan vs gerçekleşen</span><span>${(()=>{const pv=visits.find(v=>v.storeId===s.id);return pv?pv.dur:'—';})()}dk → ort. <b>${p2.act}dk</b></span></div>
          <div class="kv"><span class="k">Raf skoru (önce→sonra)</span><span>${p2.shelf[0]} → <b style="color:${p2.shelf[1]>p2.shelf[0]?'var(--green)':'var(--red-d)'}">${p2.shelf[1]}</b></span></div>
          <div class="kv"><span class="k">Satış trendi (8 hf)</span><b style="color:${p2.sales>=0?'var(--green)':'var(--red-d)'}">${p2.sales>=0?'▲':'▼'} %${Math.abs(p2.sales)}</b></div>
          <div class="kv"><span class="k">Yatırım getirisi</span><span>${'★'.repeat(p2.roi)}${'☆'.repeat(5-p2.roi)}</span></div>
          <div class="kv"><span class="k">Önce/Sonra</span><span style="cursor:pointer;" onclick="alert('Prototip: son ziyaretin önce/sonra raf fotoğrafları — planlama yüzeyinde, ayrı BI ekranında değil.')">📷 📷 görüntüle</span></div>
          ${rec?`<div class="pe-rec">Öneri: ${rec.rec}</div>`:''}
          <div class="pe-note">Kanıt zinciri: planlanan iş → gerçekleşen uygulama → raf durumu → satış trendi. Nedensellik iddiası değil — karar senin.</div>
        </div>`;})():''}
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--gray-l);">
          <div style="font-size:11px;color:var(--tx2);margin-bottom:4px;">${r?`Rut üyeliği: <b>${r.code}</b> — taşımak için ara`:'Ruta ekle — ara'}</div>
          <input id="rmSearch" placeholder="🔍 rut ara (kod / ad / kişi)…" style="width:100%;font-size:11.5px;border:1px solid var(--border2);border-radius:5px;padding:4px 8px;background:var(--card);color:var(--tx);">
          <div id="rmList" style="margin-top:3px;"></div>
        </div>
        <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
          ${r?`<button onclick="openPatchModal('${s.id}')">+ Yama</button>`:''}
          <button onclick="alert('Prototip: mağazaya not ekle.')">+ Not</button>
        </div>`;
      /* Aranabilir rut seçici — yüzlerce rutta dropdown yerine arama.
         Boşken ilk 6 rut, yazınca kod/ad/kişi ile filtre. */
      const rmS=$('#rmSearch'),rmL=$('#rmList');
      const renderRm=()=>{
        const q=rmS.value.trim().toLowerCase();
        let list=routes.filter(x=>x.id!==(r?r.id:null)&&x.active!==false);
        if(q)list=list.filter(rt=>(rt.code+' '+rt.name+' '+(rt.person?person(rt.person).name:'')).toLowerCase().includes(q));
        rmL.innerHTML=list.slice(0,6).map(rt=>`<div class="rmRow" data-r="${rt.id}" style="padding:4px 7px;border:1px solid var(--gray-l);border-radius:5px;margin-bottom:2px;cursor:pointer;font-size:11px;display:flex;justify-content:space-between;gap:6px;">
            <span><b>${rt.code}</b>${rt.draft?' 📝':''} · ${rt.name}</span>
            <span style="color:var(--tx3);white-space:nowrap;">${rt.person?person(rt.person).name:'kişi yok'} ${r?'· taşı →':'· ekle →'}</span></div>`).join('')+
          (list.length>6?`<div style="font-size:10px;color:var(--tx3);padding:2px 4px;">+${list.length-6} rut daha — aramayı daralt</div>`:'')+
          (!list.length&&q?'<div style="font-size:10.5px;color:var(--tx3);padding:3px;">Eşleşen rut yok</div>':'')+
          (r?`<div class="rmRow" data-r="POOL" style="padding:4px 7px;border:1px solid var(--gray-l);border-radius:5px;margin-top:4px;cursor:pointer;font-size:11px;color:var(--red-d);">✕ Havuza çıkar</div>`:'');
        rmL.querySelectorAll('.rmRow').forEach(el2=>{
          el2.onmouseenter=()=>el2.style.background='var(--gray-l)';
          el2.onmouseleave=()=>el2.style.background='';
          el2.onclick=()=>moveStoreTo(s.id,el2.dataset.r);
        });
      };
      rmS.oninput=renderRm;renderRm();
    } else if(panelTab==='tasks'){
      /* Görev listesi kataloğdan türetilir: şablon varsayılanı + kurallar.
         Katalog sayfasında yapılan düzenleme burayı anında etkiler. */
      /* Mağazaya özel görev yönetimi: ekle / düzenle / kaldır / SIRALA.
         Hepsi mağaza kapsamında istisna üretir; ziyaret süreleri delta ile
         güncellenir ve normal taslak→Yayınla akışına girer. Sıra = sahada
         uygulama sırası. */
      const rows=storeTaskList(s).map(t=>{
        const rr=resolveTaskMin(s,t);
        return {id:t.id,name:t.name,m:rr.m,src:rr.src,ins:t.ins};
      });
      const tot=rows.reduce((a,r)=>a+r.m,0);
      const excludedTpls=taskTemplates.filter(t=>t.active&&taskOverrides.some(o=>o.scope==='store'&&o.id===s.id&&o.tpl===t.id&&o.excluded));
      body.innerHTML=rows.map((r,i)=>`<div class="task-row ptRow" draggable="true" data-tpl="${r.id}" title="${r.ins}" style="cursor:grab;">
        <span style="display:flex;align-items:center;gap:6px;"><span style="color:var(--tx3);">⠿</span><b style="font-weight:600;font-size:11px;color:var(--tx3);">${i+1}.</b> ${r.name}</span>
        <span style="display:flex;align-items:center;gap:6px;">${r.m}dk <div class="src">${r.src}</div>
        <span class="ptEdit" data-tpl="${r.id}" style="cursor:pointer;color:var(--blue-d);" title="Süreyi bu mağaza/rut için düzenle">✎</span>
        <span class="ptMods" data-tpl="${r.id}" style="cursor:pointer;" title="Modül yığınını bu mağaza için özelleştir">🧩</span>
        <span class="ptDel" data-tpl="${r.id}" style="cursor:pointer;color:var(--red-d);" title="Bu mağazada bu görevi kaldır">🗑</span></span></div>`).join('')+
        `<div style="margin:8px 0;display:flex;gap:6px;align-items:center;">
          ${excludedTpls.length?`<select id="ptAddSel" style="font-size:11px;border:1px solid var(--border2);border-radius:5px;padding:3px;">${excludedTpls.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}</select>
          <button id="ptAdd" style="font-size:11px;">+ Görev ekle</button>`:
          `<span style="font-size:10.5px;color:var(--tx3);">Tüm aktif görevler bu mağazada tanımlı. Kaldırılanlar buradan geri eklenir; yeni görev türü Yönetim'de açılır.</span>`}
        </div>
        <div style="color:var(--tx2);font-size:11px;">Toplam: <b>${tot}dk</b> · ⠿ sürükle = saha uygulama sırası · ✎ süre · 🗑 bu mağazada kaldır — hepsi sadece bu mağazayı etkiler.</div>`+
        /* v0.5: Kural Denetçisi (Q7) — dev-tools gibi: her sürenin kaynağı,
           neyin ezdiği ve aritmetik. "Bu mağaza neden farklı?"nın tek cevabı. */
        (()=>{
          const tplTot=storeTaskList(s).reduce((a,t)=>a+t.min,0);
          const exc=taskTemplates.filter(t=>t.active&&taskOverrides.some(o=>o.scope==='store'&&o.id===s.id&&o.tpl===t.id&&o.excluded));
          return `<div class="ri">
          <div class="ri-h">🔍 Kural Denetçisi — süreler neden böyle?</div>
          ${storeTaskList(s).map(t=>{
            const ch=taskChain(s,t);
            return `<div class="chain">${t.name}: ${ch.map((c,i)=>i<ch.length-1?`<s>${c.src} ${c.m}dk</s>`:`<b>${c.m}dk</b> <span style="color:var(--tx3)">(${c.src})</span>`).join(' → ')}</div>`;
          }).join('')}
          ${exc.map(t=>`<div class="chain"><s>${t.name} (şablon ${t.min}dk)</s> — <span style="color:var(--red-d)">mağaza istisnasıyla kaldırıldı</span></div>`).join('')}
          <div class="chain" style="margin-top:5px;border-top:1px dashed var(--gray-l);padding-top:4px;">Şablon toplamı ${tplTot}dk → kurallarla <b>${tot}dk</b> (${tot-tplTot>=0?'+':''}${tot-tplTot}dk)</div>
          </div>`;
        })();
      body.querySelectorAll('.ptEdit').forEach(e2=>e2.onclick=ev=>{ev.stopPropagation();openTaskEdit(s.id,null,e2.dataset.tpl);});
      body.querySelectorAll('.ptMods').forEach(e2=>e2.onclick=ev=>{ev.stopPropagation();openModsEdit(s.id,e2.dataset.tpl);});
      body.querySelectorAll('.ptDel').forEach(e2=>e2.onclick=ev=>{
        ev.stopPropagation();
        const t=taskTemplates.find(x=>x.id===e2.dataset.tpl);
        const m=resolveTaskMin(s,t).m;
        taskOverrides.push({scope:'store',id:s.id,tpl:t.id,excluded:true,date:'kalıcı'});
        rulesData.push({id:'r'+Date.now(),scope:'Mağaza',cond:s.name,eff:t.name+' yapılmaz',date:'kalıcı',active:true});
        applyDelta(v=>v.storeId===s.id,-m,`${s.name}: ${t.name} kaldırıldı (−${m}dk)`);
        renderAll();toast(`${t.name} bu mağazada kaldırıldı — istisna olarak kaydedildi`,[]);
      });
      const addBtn=body.querySelector('#ptAdd');
      if(addBtn)addBtn.onclick=()=>{
        const tid=body.querySelector('#ptAddSel').value;
        const t=taskTemplates.find(x=>x.id===tid);
        taskOverrides=taskOverrides.filter(o=>!(o.scope==='store'&&o.id===s.id&&o.tpl===tid&&o.excluded));
        rulesData=rulesData.filter(r=>!(r.cond===s.name&&r.eff===t.name+' yapılmaz'));
        const m=resolveTaskMin(s,t).m;
        applyDelta(v=>v.storeId===s.id,m,`${s.name}: ${t.name} eklendi (+${m}dk)`);
        renderAll();toast(`${t.name} bu mağazaya eklendi`,[]);
      };
      body.querySelectorAll('.ptRow').forEach(rw=>{
        rw.ondragstart=ev=>ev.dataTransfer.setData('text/ptask',rw.dataset.tpl);
        rw.ondragover=ev=>{ev.preventDefault();rw.style.borderTop='2px solid var(--blue-d)';};
        rw.ondragleave=()=>rw.style.borderTop='';
        rw.ondrop=ev=>{
          ev.preventDefault();rw.style.borderTop='';
          const src=ev.dataTransfer.getData('text/ptask');
          if(!src||src===rw.dataset.tpl)return;
          const prev=storeTaskOrder[s.id]?storeTaskOrder[s.id].slice():null;
          const cur=storeTaskList(s).map(t=>t.id).filter(x=>x!==src);
          cur.splice(cur.indexOf(rw.dataset.tpl),0,src);
          storeTaskOrder[s.id]=cur;
          logChange(`${s.name}: görev sırası değiştirildi`,null,null,
            ()=>{if(prev)storeTaskOrder[s.id]=prev;else delete storeTaskOrder[s.id];});
          renderPanel();
          toast('Görev sırası güncellendi — sahada bu sırayla uygulanır',[{t:'Geri al',f:undoLast}]);
        };
      });
    } else {
      body.innerHTML=`
        <div class="hist-item"><div class="d">Mar–Tem 2026</div><b>${r?r.code:'—'}</b> · ${r?person(r.person).name:''}<br>34 ziyaret · %96 tamamlama</div>
        <div class="hist-item"><div class="d">12 May</div>SKT sorunu işaretlendi 📷</div>
        <div class="hist-item"><div class="d">Oca–Mar 2026</div>ANK-02 · Mehmet D. · 21 ziyaret</div>
        <div class="hist-item"><div class="d">Eki 2025</div>EVO'dan senkronize edildi</div>`;
    }
  } else if(focus.type==='routes'){
    const ids=(filter&&filter.type==='routes')?[...filter.ids]:[];
    const rs=ids.map(route);
    const pts=stores.filter(s=>s.route&&filter.ids.has(s.route));
    const rev=pts.reduce((a,s)=>a+s.rev,0);
    const target=rs.reduce((a,r)=>a+r.target,0);
    head.innerHTML=`<div class="ttl">${rs.map(r=>r.code).join(' + ')}</div><div class="sub">${rs.length} rut · birleşik görünüm</div>`;
    body.innerHTML=`
      <div class="kv"><span class="k">Toplam nokta</span><b>${pts.length}</b></div>
      <div class="kv"><span class="k">Toplam ciro (6 ay)</span><b style="color:${rev>=target?'var(--green)':'var(--red-d)'}">${rev}K / ${target}K</b></div>
      <div class="kv"><span class="k">Kişiler</span><span>${rs.map(r=>person(r.person).name).join(', ')}</span></div>
      <div class="kv"><span class="k">Kesişim kontrolü</span><span>çakışma yok ✓</span></div>
      <div style="margin-top:10px;color:var(--tx2);font-size:11px;">Tek rut detayı için haritada çizgisine tıkla (Shift olmadan).</div>
      <div style="margin-top:10px;"><button onclick="alert('Prototip: birleşik bölgeye yeni kişi simülasyonu — toplam ciro ve dakika yeterliliği hesaplanır.')">⚗ Bu bölgeye kişi ekle?</button></div>`;
  } else if(focus.type==='route'){
    const r=route(focus.id);
    const pts=stores.filter(s=>s.route===r.id&&s.active!==false);
    const rev=pts.reduce((a,s)=>a+s.rev,0);
    const mix={P:0,V:0,S:0};pts.forEach(s=>mix[s.cat]++);
    head.innerHTML=`<div class="ttl">${r.code} · ${r.name}</div><div class="sub">${person(r.person).name} · ${pts.length} nokta</div>`;
    if(panelTab==='info'){
      body.innerHTML=`
        <div class="kv"><span class="k">Ciro (6 ay)</span><b style="color:${rev>=r.target?'var(--green)':'var(--red-d)'}">${rev}K / ${r.target}K</b></div>
        <div class="kv"><span class="k">Karışım</span><span>🟢${mix.P} 🟡${mix.V} ⚪${mix.S}</span></div>
        <div class="kv"><span class="k">Stabilite</span><b>91</b></div>
        <div class="kv"><span class="k">Aktif yama</span><span>${visits.filter(v=>v.patched&&v.personId===r.person).length}</span></div>
        <div class="kv"><span class="k">Atama geçmişi</span><span>2 değişim/yıl</span></div>
        ${(()=>{
          const patches=r.person?visits.filter(v=>v.patched&&v.personId===r.person):[];
          return patches.length?`<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--gray-l);">
            <div style="font-size:11px;font-weight:600;margin-bottom:4px;">H${currentWeek} yamaları (${patches.length})</div>
            ${patches.map(v=>{const vs=store(v.storeId);return `<div class="task-row" style="font-size:11px;"><span>${DAYS[v.day]} ${fmtT(v.start)} · ${vs.name} (${v.dur}dk)${v.patchUntil?` <span class="pill" title="Pencere dolunca otomatik Baz'a döner">${v.patchUntil}</span>`:''}</span><button onclick="revertPatch('${v.id}')" style="font-size:10px;">✕ Baz'a dön</button></div>`;}).join('')}
            <button onclick="revertWeekRoute('${r.id}')" style="font-size:11px;margin-top:4px;width:100%;">↺ Haftayı Baz'a döndür</button>
          </div>`:'';
        })()}
        <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap;">
          <button onclick="openPoolPicker('${r.id}')">+ Havuzdan mağaza</button>
          <button onclick="openPersonPicker('${r.id}')">Kişi değiştir</button>
          <button onclick="openRouteEditModal('${r.id}')">✎ Ad / Hedef</button>
          ${r.active===false?`<button onclick="reactivateRoute('${r.id}')" style="color:var(--green,#1a7f4b);">▶ Aktifleştir</button>`:`<button onclick="deactivateRoute('${r.id}')" style="color:var(--red-d);">⏸ Pasifleştir</button>`}
        </div>`;
    } else if(panelTab==='tasks'){
      const rOv=taskOverrides.filter(o=>o.scope==='route'&&o.id===r.id);
      body.innerHTML=(rOv.length?`<div style="font-size:11px;font-weight:600;margin-bottom:4px;">Rut görev kuralları</div>`+
        rOv.map(o=>{const t=taskTemplates.find(x=>x.id===o.tpl);return `<div class="task-row"><span>${t.name}</span><span>${o.min}dk <div class="src">${o.date}</div></span></div>`;}).join('')+'<div style="height:8px"></div>':'')+
        `<button onclick="openTaskEdit(null,'${r.id}',null)" style="margin-bottom:10px;font-size:11px;">+ Rut görev kuralı ekle</button>`+
        `<div style="font-size:11px;font-weight:600;margin-bottom:4px;">Noktalar</div>`+
        pts.map(s=>`<div class="task-row"><span>${s.name}</span><span class="badge ${s.cat}">${catL(s.cat)}</span></div>`).join('');
    } else {
      body.innerHTML=`
        <div class="hist-item"><div class="d">Bu hafta</div>${visits.filter(v=>v.patched).length} yama aktif</div>
        <div class="hist-item"><div class="d">Mar 2026</div>Ayşe K. atandı (sebep: yeniden yapılanma)</div>
        <div class="hist-item"><div class="d">Şub 2026</div>2 nokta eklendi, 1 çıkarıldı</div>
        <div class="hist-item"><div class="d">Oca 2026</div>Rut oluşturuldu (preset: il merkezi)</div>`;
    }
  } else {
    const p=person(focus.id);const r=personRoute(p.id);
    const wk=weekTotal(p.id);
    head.innerHTML=`<div class="ttl">${p.name}</div><div class="sub">${r?r.code:'—'} · saha temsilcisi</div>`;
    if(panelTab==='info'){
      body.innerHTML=`
        <div class="kv"><span class="k">Haftalık yük</span><b>${wk} / ${QUOTA*5} dk</b></div>
        <div class="kv"><span class="k">Rut</span><span>${r?r.code:'—'}</span></div>
        <div class="kv"><span class="k">Bu yıl rut değişimi</span><span>1</span></div>
        <div class="kv"><span class="k">Görev uyumu</span><span>%94</span></div>`;
    } else if(panelTab==='tasks'){
      body.innerHTML=`<div class="task-row"><span>Süt reyonu anketi</span><span style="color:var(--red-d)">⏰ 12 Tem</span></div>
        <div class="task-row"><span>Fiyat toplama (haftalık)</span><span>rutin</span></div>`;
    } else {
      body.innerHTML=`
        <div class="hist-item"><div class="d">Dün 14:32</div>📝 Not: "Kantin B müdürü perşembe servis istemiyor"</div>
        <div class="hist-item"><div class="d">Mar 2026</div>${r?r.code:''} rutuna atandı</div>
        <div class="hist-item"><div class="d">Oca 2026</div>İşe başladı</div>`;
    }
  }
}
document.querySelectorAll('#panelTabs div').forEach(t=>t.onclick=()=>{panelTab=t.dataset.t;renderPanel();});
/* ---------- table drawer ---------- */
let drawerOpen=false;
window.openDrawer=v=>{drawerOpen=v===undefined?!drawerOpen:v;$('#drawer').classList.toggle('open',drawerOpen);renderTable();};
$('#drawerBtn').onclick=()=>openDrawer();
function renderTable(){
  if(!drawerOpen)return;
  const tbl=$('#tbl');
  const vp=new Set(visiblePeople().map(p=>p.id));
  let rows=visits.filter(v=>vp.has(v.personId));
  if(selection.size)rows=visits.filter(v=>selection.has(v.storeId));
  rows.sort((a,b)=>a.day-b.day||a.start-b.start);
  tbl.innerHTML=`<tr><th>Mağaza</th><th>Kategori</th><th>Kişi</th><th>Gün</th><th>Saat</th><th>Süre (dk)</th><th>Yama</th></tr>`+
    rows.map(v=>{const s=store(v.storeId);return `<tr data-s="${s.id}">
      <td>${s.name}</td><td><span class="badge ${s.cat}">${catL(s.cat)}</span></td>
      <td>${person(v.personId).name}</td><td>${DAYS[v.day]}</td><td>${fmtT(v.start)}</td>
      <td><input type="number" step="5" min="10" value="${v.dur}" data-v="${v.id}"></td>
      <td>${v.patched?'<span class="pill">yama</span>':''}</td></tr>`;}).join('');
  tbl.querySelectorAll('input').forEach(inp=>{
    inp.onclick=e=>e.stopPropagation();
    inp.onchange=()=>{
      const v=visits.find(x=>x.id===inp.dataset.v);const before=snapshotVisit(v);
      const nd=Math.max(10,Math.round(+inp.value/5)*5);
      const s=store(v.storeId);
      v.dur=nd;reflow(v.personId,v.day);
      logChange(`${s.name}: ${before.dur}dk → ${nd}dk (tablo)`,v.personId,v.day,()=>{restoreVisit(v,before);reflow(v.personId,v.day);});
    };
  });
  tbl.querySelectorAll('tr[data-s]').forEach(tr=>tr.onclick=()=>setFocus({type:'store',id:tr.dataset.s}));
}
/* ---------- toast ---------- */
let toastTimer=null;
function toast(msg,btns){
  const old=$('#toast');if(old)old.remove();clearTimeout(toastTimer);
  const d=document.createElement('div');d.className='toast';d.id='toast';
  d.innerHTML=`<span>${msg}</span>`;
  for(const b of btns){
    const bt=document.createElement('button');bt.textContent=b.t;bt.className='act';
    bt.onclick=()=>{b.f();d.remove();};d.appendChild(bt);
  }
  const x=document.createElement('button');x.textContent='✕';x.onclick=()=>d.remove();d.appendChild(x);
  document.body.appendChild(d);
  toastTimer=setTimeout(()=>d.remove(),7000);
}
/* ===================== v0.5 MOTOR ===================== */
/* İlke (tasarım dokümanına da eklendi): ödünleşimi/kanıtı YÜZEYE ÇIKAR,
   her kararı savunulabilir yap — asla otomatik karar verme.
   Hata (🔴) yayını DURDURMAZ; gerekçe ister (override-with-reason).
   "Uyar, asla engelleme" DNA'sı + karar hesap verebilirliği tek mekanizmada. */

/* ---- Yol süresi katmanı (v0.5.5): Elle > (gerçek build: GPS gerçekleşen) > Tahmin.
   Tahmin bugün Öklid mesafeden; gerçek build'de çekout→çekin GPS ortalamasından
   gelir. Elle girilen değer HER ZAMAN kazanır ve mağaza ÇİFTİNE aittir — aynı
   çift takvimde nerede yan yana gelirse gelsin bağlaç, doğrulama ve ⚡ düzeltme
   aynı değeri kullanır. Düzenleme: takvimde 🚗 bağlacına tıkla.
   Gerçek build notları: yön ayrışabilir (A→B ≠ B→A), saat dilimi (sabah/akşam
   trafiği) tahmin katmanına girer; elle değer denetim kaydına yazılır. */
let travelOverrides={}; /* 'sA|sB' (id'ler sıralı) → dk */
const travelKey=(a,b)=>[a.id,b.id].sort().join('|');
function travelEst(sa,sb){return Math.max(3,Math.round(Math.hypot(sa.x-sb.x,sa.y-sb.y)*0.08));}
function travelMan(sa,sb){return travelOverrides[travelKey(sa,sb)];}
function travelMin(sa,sb){
  if(!sa||!sb)return 0;
  const o=travelMan(sa,sb);
  return o!==undefined?o:travelEst(sa,sb);
}
function travelConf(sa,sb){
  if(travelMan(sa,sb)!==undefined)return 'elle';
  const d=Math.hypot(sa.x-sb.x,sa.y-sb.y);
  return d>250?'düşük':d>120?'orta':'yüksek';
}
window.openTravelEdit=function(said,sbid){
  if(isRO()){toast('Geçmiş hafta — salt okunur',[]);return;}
  const sa=store(said),sb=store(sbid);
  const key=travelKey(sa,sb),est=travelEst(sa,sb),man=travelMan(sa,sb);
  const old=document.getElementById('tvModal');if(old)old.remove();
  const bg=document.createElement('div');bg.className='modal-bg';bg.id='tvModal';
  bg.innerHTML=`<div class="modal" style="width:400px;">
    <div class="modal-head">🚗 Yol süresi — ${sa.name} ↔ ${sb.name}</div>
    <div class="modal-body">
      <div class="kv"><span class="k">Tahmin</span><span>${est}dk <span style="color:var(--tx3);font-size:10.5px;">(koordinattan — gerçek sistemde GPS gerçekleşen ortalaması)</span></span></div>
      <div class="kv"><span class="k">Kullanılan</span><b>${travelMin(sa,sb)}dk (${man!==undefined?'elle':'tahmin'})</b></div>
      <div class="frow" style="margin-top:8px;"><label>Elle süre (dk)</label>
        <input type="number" id="tvMin" value="${travelMin(sa,sb)}" min="0" step="1" style="width:70px;"></div>
      <div style="font-size:10.5px;color:var(--tx3);">Elle değer tahmini ezer ve bu mağaza çiftinin <b>tüm</b> bağlaçlarında, doğrulamada ve ⚡ düzeltmede kullanılır. Kural: Elle &gt; GPS &gt; Tahmin — en yakın kural kazanır.</div>
    </div>
    <div class="modal-foot">
      <button onclick="document.getElementById('tvModal').remove()">Vazgeç</button>
      ${man!==undefined?'<button id="tvReset">Tahmine dön</button>':''}
      <button class="primary" id="tvSave">Kaydet</button>
    </div></div>`;
  document.body.appendChild(bg);
  $('#tvSave').onclick=()=>{
    const v=Math.max(0,Math.round(+$('#tvMin').value||0));
    const prev=travelOverrides[key];
    if(v===travelMin(sa,sb)&&prev!==undefined){bg.remove();return;}
    travelOverrides[key]=v;
    logChange(`Yol süresi (elle): ${sa.name} ↔ ${sb.name} → ${v}dk (${prev!==undefined?'önceki elle '+prev+'dk':'tahmin '+est+'dk'})`,null,null,
      ()=>{if(prev===undefined)delete travelOverrides[key];else travelOverrides[key]=prev;});
    bg.remove();renderAll();
    toast(`Yol süresi elle ayarlandı: ${v}dk — çiftin tüm bağlaçlarında geçerli`,[{t:'Geri al',f:undoLast}]);
  };
  const rs=$('#tvReset');
  if(rs)rs.onclick=()=>{
    const prev=travelOverrides[key];
    delete travelOverrides[key];
    logChange(`Yol süresi tahmine döndü: ${sa.name} ↔ ${sb.name} (elle ${prev}dk kaldırıldı, tahmin ${est}dk)`,null,null,
      ()=>{travelOverrides[key]=prev;});
    bg.remove();renderAll();
    toast(`Tahmine dönüldü: ${est}dk`,[{t:'Geri al',f:undoLast}]);
  };
};

/* ---- Doğrulama motoru: her kural bir önem derecesine sahip (derleyici modeli).
   🔴 err = fiziksel/yasal imkânsızlık — yayın için GEREKÇE ister.
   🟡 warn = izinli ama optimal değil. 🔵 info = bakmaya değer. ---- */
let curIssues=[];
function validate(){
  const issues=[];
  for(const p of people){
    if(p.active===false)continue;
    for(let d=0;d<5;d++){
      const dv=dayVisits(p.id,d);
      if(!dv.length)continue;
      const tot=dv.reduce((s,v)=>s+v.dur,0);
      if(tot>QUOTA)issues.push({sev:'err',code:'quota',msg:`${p.name} ${DAYS[d]}: ${tot}dk > günlük sınır ${QUOTA}dk`,personId:p.id,day:d,fix:'repair'});
      else if(tot<QUOTA*0.6)issues.push({sev:'warn',code:'lowfill',msg:`${p.name} ${DAYS[d]}: düşük doluluk (${tot}dk)`,personId:p.id,day:d});
      for(let i=1;i<dv.length;i++){
        const a=dv[i-1],b=dv[i],gap=b.start-(a.start+a.dur);
        if(gap<0){issues.push({sev:'err',code:'overlap',msg:`${p.name} ${DAYS[d]}: ${store(a.storeId).name} ↔ ${store(b.storeId).name} çakışıyor (${-gap}dk)`,personId:p.id,day:d,visitId:b.id,fix:'day'});continue;}
        const t=travelMin(store(a.storeId),store(b.storeId));
        if(gap<t)issues.push({sev:'err',code:'travel',msg:`${p.name} ${DAYS[d]}: ${store(b.storeId).name}'e yol ~${t}dk, boşluk ${gap}dk — ${t-gap}dk eksik`,personId:p.id,day:d,visitId:b.id,fix:'day'});
        else if(gap-t>90)issues.push({sev:'warn',code:'idle',msg:`${p.name} ${DAYS[d]}: ${gap}dk boşluk (${store(a.storeId).name} → ${store(b.storeId).name})`,personId:p.id,day:d,visitId:b.id});
      }
      const last=dv[dv.length-1];
      if(last.start+last.dur>DAY_END)issues.push({sev:'err',code:'dayend',msg:`${p.name} ${DAYS[d]}: gün ${fmtT(DAY_END)} sonrasına taşıyor`,personId:p.id,day:d,visitId:last.id,fix:'day'});
      if(p.leave&&p.leave.days&&p.leave.days.includes(d)&&dv.length)
        issues.push({sev:'err',code:'leave',msg:`${p.name} ${DAYS[d]} izinli (${p.leave.from}–${p.leave.to}) ama ${dv.length} ziyaret planlı`,personId:p.id,day:d,visitId:dv[0].id,fix:'repair'});
    }
    const patches=visits.filter(v=>v.patched&&v.personId===p.id).length;
    if(patches>=5)issues.push({sev:'warn',code:'churn',msg:`${p.name}: bu hafta ${patches} yama — sık değişiklik saha güvenini yıpratır`,personId:p.id});
  }
  for(const s of stores){
    if(s.active===false)continue;
    if(s.closedUntil&&visits.some(v=>v.storeId===s.id))
      issues.push({sev:'err',code:'closed',msg:`${s.name} kapalı (${s.closedUntil}'e dek) ama ziyaret planlı`,storeId:s.id,visitId:(visits.find(v=>v.storeId===s.id)||{}).id,fix:'repair'});
    if(!s.route&&s.cat==='V')issues.push({sev:'info',code:'pool',msg:`${s.name} (değerli, ${s.rev}K₺) havuzda — plana alınmadı`,storeId:s.id});
  }
  /* v0.5.4: süreli görevler (eski "kampanya") — son tarih yaklaşınca bilgi */
  for(const t of taskTemplates)
    if(t.active&&t.until&&t.until>=TODAY)
      issues.push({sev:'info',code:'due',msg:`Süreli görev "${t.name}" — son tarih ${t.until}${t.target&&(t.target.type||t.target.chain)?` · hedef: ${[t.target.type,t.target.chain].filter(Boolean).join(' · ')}`:''}`});
  return issues;
}
function computeIssues(){curIssues=validate();return curIssues;}
function visitWorst(vid){
  let w=null;
  for(const i of curIssues)if(i.visitId===vid){if(i.sev==='err')return 'E';if(i.sev==='warn')w='W';}
  return w;
}

/* ---- Sorun Merkezi: problemler sana gelir, 400 mağazayı avlamazsın.
   Tıkla → ziyarete atla + vurgula. Kapsam-bazlı yerleşimin merkez ayağı. ---- */
function flashEl(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),1800);}
function scrollToVisit(vid){
  const el=document.querySelector(`.vblock[data-vid="${vid}"]`);
  if(el){el.scrollIntoView({behavior:'smooth',block:'center'});flashEl(el);}
}
function scrollToStore(sid){
  const el=document.querySelector(`.vblock[data-sid="${sid}"]`);
  if(el){el.scrollIntoView({behavior:'smooth',block:'center'});flashEl(el);}
}
window.openConflictCenter=function(){
  /* v0.5.6: Sorun Merkezi ayrı bir modal değil — Gelen kutusunun "Sorunlar"
     sekmesi. Tek bildirim evi: saha mesajları ve plan sorunları yan yana,
     ikisi de "ilgilenilmesi gerekenler"dir. Alt bar sayaçları ve gün başlığı
     rozetleri buraya açılır. */
  inboxTab='issues';
  if(currentPage!=='inbox')showPage('inbox');else renderInbox();
};

/* ---- Otomatik düzeltme: SADECE aşağı akışı kaydırır (öngörülebilirlik >
   optimizasyon — asla tüm günü yeniden kurmaz). Mini "Schedule Repair". ---- */
function autoFixDay(pid,day){
  const dv=dayVisits(pid,day);
  const snaps=dv.map(v=>({v,s:snapshotVisit(v)}));
  let prev=null,changed=0;
  for(const v of dv){
    if(prev){
      const t=travelMin(store(prev.storeId),store(v.storeId));
      const min=prev.start+prev.dur+t;
      if(v.start<min){v.start=skipBreaks(min);v.patched=true;changed++;}
    }
    prev=v;
  }
  if(changed){
    logChange(`${person(pid).name} ${DAYS[day]}: otomatik düzeltme — ${changed} ziyaret kaydırıldı (çakışma/yol açıldı)`,pid,day,
      ()=>{for(const {v,s} of snaps)restoreVisit(v,s);},true);
    renderAll();toast(`⚡ ${changed} ziyaret kaydırıldı — sadece H${currentWeek}. Hâlâ sığmıyorsa ✨ Onarım dene.`,[{t:'Geri al',f:undoLast}]);
  } else toast('Kaydırarak düzeltilecek bir şey yok — ✨ Onarım dene',[]);
}

/* ---- Karar Günlüğü: aktivite logu DEĞİL — kim/ne/ne zaman/NEDEN + hedef.
   "Sistem önerdi" savunulamaz; "Amir, ciroyu korumak için, gerekçesiyle" savunulur. ---- */
let decisionJournal=[];
const OBJECTIVES=['Ciroyu koru','Kapsamayı (uyumu) koru','Çalışanı koru','Maliyeti düşür','Diğer'];
function logDecision(e){decisionJournal.unshift({ts:new Date().toLocaleString('tr-TR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}),by:'Planlayıcı (Parham)',...e});}
window.openJournal=function(){
  const bg=document.createElement('div');bg.className='modal-bg';bg.id='jrModal';
  bg.innerHTML=`<div class="modal" style="width:560px;">
    <div class="modal-head">📖 Karar Günlüğü</div>
    <div class="modal-body">${decisionJournal.length?decisionJournal.map(j=>`
      <div class="jr-item">
        <b>${j.kind==='publish'?'📤 Yayın':j.kind==='repair'?'✨ Onarım':j.kind==='perm'?'📌 Kalıcı değişiklik':'📝 Karar'}</b> — ${j.desc}
        ${j.reason?`<div class="jr-reason">Gerekçe: ${j.reason}</div>`:''}
        <div class="jm">${j.ts} · ${j.by}${j.objective?` · hedef: <b>${j.objective}</b>`:''}${j.errors&&j.errors.length?` · 🔴 ${j.errors.length} hata gerekçeyle geçildi`:''}</div>
        ${j.errors&&j.errors.length?`<div class="jm" style="margin-top:2px;">${j.errors.map(e=>'· '+e).join('<br>')}</div>`:''}
      </div>`).join(''):'<div style="color:var(--tx3);font-size:12px;padding:10px;">Henüz kayıtlı karar yok. Yayınlar, onarımlar ve gerekçeli hata geçişleri burada birikir.</div>'}
      <div style="font-size:10.5px;color:var(--tx3);margin-top:6px;">Gerçek build: onaylayan (bölge müdürü), değerlendirilen alternatifler ve sonradan gerçekleşen etki de bu kayda bağlanır.</div>
    </div>
    <div class="modal-foot"><button onclick="document.getElementById('jrModal').remove()">Kapat</button></div></div>`;
  document.body.appendChild(bg);
};

/* ---- Kalıcı yap: etki sayısı göstermeden Baz'a yazma (Q2). ---- */
function makePermanentUI(v,after){
  const s=store(v.storeId),wl=34-currentWeek;
  toast(`📌 Kalıcı değişiklik: ${s.name} — Baz desene yazılır, önümüzdeki ${wl} haftada ~${wl} ziyareti etkiler (H${currentWeek+1}–H34).`,[
    {t:'Onayla — kalıcı yap',f:()=>{
      v.patched=false;delete v.patchUntil;makePermanent(v);
      const c=changes[changes.length-1];if(c){c.patch=false;c.desc+=' (kalıcı→Baz)';}
      logDecision({kind:'perm',desc:`${s.name}: yama Baz desene yazıldı (~${wl} gelecek ziyaret)`});
      if(after)after();renderAll();toast('Baz desene yazıldı ✓',[]);
    }},
    {t:'Vazgeç (yama kalsın)',f:()=>{}}
  ]);
}

/* ---- Kural değişikliği etki önizleme (Q7): dalga etkisini uygulamadan göster. ---- */
function ruleImpact(pred,val,isDelta){
  const affected=visits.filter(pred);
  const st=new Set(affected.map(v=>v.storeId)),pp=new Set(affected.map(v=>v.personId));
  const dWeek=affected.reduce((s,v)=>s+(isDelta?val:val-v.dur),0);
  let overNew=0;
  const days=new Set(affected.map(v=>v.personId+'|'+v.day));
  for(const k of days){
    const [p,d]=k.split('|');
    const cur=dayTotal(p,+d);
    const nt=dayVisits(p,+d).reduce((s,v)=>s+(pred(v)?(isDelta?v.dur+val:val):v.dur),0);
    if(nt>QUOTA&&cur<=QUOTA)overNew++;
  }
  return {n:affected.length,stores:st.size,people:pp.size,dWeek,overNew};
}
function impactLabel(im){
  return `${im.stores} mağaza · ${im.n} ziyaret/hafta · ${im.dWeek>0?'+':''}${im.dWeek}dk/hafta`+
    (im.overNew?` · <b style="color:var(--red-d)">${im.overNew} gün kota ÜSTÜNE çıkar</b>`:'');
}
function previewApply(pred,dur,desc){
  const im=ruleImpact(pred,dur,false);
  toast(`Etki önizleme: ${impactLabel(im)} — uygulansın mı?`,[
    {t:'Uygula',f:()=>{applyDur(pred,dur,desc);renderAll();toast('Kural uygulandı — taslakta, Yayınla ile gider',[{t:'Geri al',f:undoLast}]);}},
    {t:'Vazgeç',f:()=>{renderAll();}}
  ]);
}

/* ---- Ziyaret amacı (Q8): ziyaret "45dk" değil, "45dk · şu amaçla". ---- */
const PURPOSES=['Raf kalitesini koru','Raf kalitesini geri kazan','Potansiyeli büyüt','Fiyat takibi','Promosyon denetimi','Standart servis'];
function storePurpose(s){
  if(s.purpose)return s.purpose;
  if(s.perf&&s.perf.sales<0)return 'Raf kalitesini geri kazan';
  return s.cat==='V'?'Raf kalitesini koru':s.cat==='P'?'Potansiyeli büyüt':'Standart servis';
}
window.setStorePurpose=function(sid,p){const s=store(sid);s.purpose=p;renderAll();};

/* ---- Kanıt paneli önerisi: veri ÖNERİR + güven gösterir, karar planlayıcının. ---- */
function evidenceRec(s){
  const p=s.perf;if(!p)return null;
  if(!s.route)return {rec:'Plana almayı değerlendir — ciro yüksek, hiç servis almıyor',conf:'orta'};
  if(p.comp<80)return {rec:'Önce uyum sorununu araştır — süre artırmak uyumu düzeltmez',conf:'yüksek'};
  if(p.sales<0&&p.shelf[1]<=p.shelf[0]+3)return {rec:'+15dk/ziyaret değerlendir — raf skoru ve satış birlikte düşüyor',conf:'orta'};
  if(p.sales>5&&p.shelf[1]>p.shelf[0])return {rec:'Süreyi koru — kanıt yatırımın karşılık verdiğini gösteriyor',conf:'yüksek'};
  return {rec:'Mevcut planı koru, gelecek ay tekrar bak',conf:'orta'};
}

/* ---- Olay-bazlı yama pencereleri (Q2): sistemin zaten bildiği gerçek
   seçenekler — ham tarih yerine "mağaza açılana dek", "izin boyunca". ---- */
function patchWindows(v){
  const s=store(v.storeId),p=person(v.personId),wins=[];
  if(s.closedUntil)wins.push({t:`🏪 Mağaza açılana dek (${s.closedUntil})`,label:`açılana dek · ${s.closedUntil}`});
  if(p&&p.leave)wins.push({t:`🏖 ${p.name.split(' ')[0]} izni boyunca (${p.leave.from}–${p.leave.to})`,label:`izin · ${p.leave.from}–${p.leave.to}`});
  wins.push({t:'📅 Tarih aralığı…',label:null});
  return wins;
}
function applyPatchWindow(v,w){
  if(w.label===null){
    const d=prompt('Yama bitiş tarihi (örn. 24 Tem):','24 Tem');
    if(!d)return;
    v.patchUntil=`H${currentWeek} → ${d}`;
  } else v.patchUntil=w.label;
  const c=changes[changes.length-1];if(c&&c.patch)c.desc+=` [${v.patchUntil}]`;
  renderAll();toast(`Yama penceresi: ${v.patchUntil} — süresi dolunca otomatik Baz'a döner`,[]);
}

/* ---- + Yama modalı: mağaza panelindeki alert'in gerçek hali. ---- */
window.openPatchModal=function(sid){
  const s=store(sid);
  const sv=visits.filter(v=>v.storeId===sid);
  if(!sv.length){toast('Bu hafta bu mağazaya ziyaret yok',[]);return;}
  const winOpts=[];
  if(s.closedUntil)winOpts.push(`Mağaza açılana dek (${s.closedUntil})`);
  const pids=new Set(sv.map(v=>v.personId));
  for(const pid of pids){const p=person(pid);if(p&&p.leave)winOpts.push(`${p.name} izni boyunca (${p.leave.from}–${p.leave.to})`);}
  winOpts.push('Sadece bu hafta (H'+currentWeek+')','Tarih aralığı…');
  const bg=document.createElement('div');bg.className='modal-bg';bg.id='pwModal';
  bg.innerHTML=`<div class="modal" style="width:420px;">
    <div class="modal-head">+ Yama — ${s.name}</div>
    <div class="modal-body">
      <div class="frow"><label>Tür</label><select id="pwType">
        <option value="pause">Ziyaretleri durdur (${sv.length} ziyaret bu hafta)</option>
      </select></div>
      <div class="frow"><label>Pencere</label><select id="pwWin">${winOpts.map(o=>`<option>${o}</option>`).join('')}</select></div>
      <div style="font-size:11px;color:var(--tx3);">Yama Baz'a dokunmaz; penceresi dolunca plan kendiliğinden normale döner. Sistemin bildiği olaylar (kapanış, izin) hazır pencere olarak sunulur.</div>
    </div>
    <div class="modal-foot">
      <button onclick="document.getElementById('pwModal').remove()">Vazgeç</button>
      <button class="primary" id="pwApply">Uygula</button>
    </div></div>`;
  document.body.appendChild(bg);
  $('#pwApply').onclick=()=>{
    let win=$('#pwWin').value;
    if(win==='Tarih aralığı…'){const d=prompt('Bitiş tarihi (örn. 24 Tem):','24 Tem');if(!d)return;win=`H${currentWeek} → ${d}`;}
    const snaps=sv.map(v=>({...v}));
    visits=visits.filter(v=>v.storeId!==sid);weekData[currentWeek]=visits;
    const days=new Set(snaps.map(v=>v.personId+'|'+v.day));
    for(const k of days){const [p,d]=k.split('|');reflow(p,+d);}
    logChange(`${s.name}: ziyaretler durduruldu [${win}]`,snaps[0].personId,null,
      ()=>{for(const o of snaps)visits.push({...o});weekData[currentWeek]=visits;},true);
    logDecision({kind:'patch',desc:`${s.name}: ${snaps.length} ziyaret durduruldu`,reason:win});
    bg.remove();renderAll();
    toast(`${s.name}: ${snaps.length} ziyaret durduruldu — ${win}`,[{t:'Geri al',f:undoLast}]);
  };
};

/* ---- ✨ Onarım (Q3 mock kabuğu): bozulma → 3 plan → diff → seçerek kabul.
   Gerçek build: kısıt çözücü. Burada sezgisel ama GERÇEK hesap (canned değil):
   hedef kişi/gün gerçekten en az yüklü olana göre seçilir. Güven NİTEL
   (yüksek/orta) — yüzde güven sahte kesinliktir, kullanmıyoruz. ---- */
function repairDisruptions(){
  const list=[];
  for(const p of people){
    if(p.active===false||!p.leave)continue;
    const aff=visits.filter(v=>v.personId===p.id&&p.leave.days&&p.leave.days.includes(v.day));
    if(aff.length)list.push({k:'leave',id:p.id,label:`${p.name} izinli (${p.leave.from}–${p.leave.to})`,aff,win:`izin · ${p.leave.from}–${p.leave.to}`});
  }
  for(const s of stores){
    if(s.active===false||!s.closedUntil)continue;
    const aff=visits.filter(v=>v.storeId===s.id);
    if(aff.length)list.push({k:'closed',id:s.id,label:`${s.name} kapalı (${s.closedUntil}'e dek)`,aff,win:`açılana dek · ${s.closedUntil}`});
  }
  return list;
}
/* v0.5.2: Onarım'ın TEK girişi Sorun Merkezi (kapsam-bazlı yerleşim —
   aynı bozulma için üçüncü bir bildirim yüzeyi/banner tutmuyoruz).
   İzin/kapanış zaten 🔴 hata olarak düşer, satırındaki ✨ Onarım tezgâhı açar. */
/* v0.5.1 — ONARIM = ELLE KARAR TEZGÂHI (otomatik plan YOK).
   Karar: binlerce ajan/mağazada "uygun kişiyi sistem bulsun" güven
   kaybettirir; tek kötü öneri elli iyi öneriden pahalı. Sistem yalnızca
   DARALTIR ve SIRALAR (o gün müsait + kota durumu + bölge yakınlığı),
   kişiyi ve günü PLANLAYICI seçer. Hiçbir satır önceden doldurulmaz;
   karar verilmeyen satır uygulanmaz, Sorun Merkezi'nde kalmaya devam eder.
   Gerçek build: aday listesi sunucudan sayfalı/aramalı gelir (bölge indeksi),
   sıralama ölçütleri aynı kalır. */
function candidatesFor(v,exceptPid,day){
  const s=store(v.storeId),out=[];
  for(const p of people){
    if(p.active===false||p.id===exceptPid)continue;
    if(p.leave&&p.leave.days&&p.leave.days.includes(day))continue;
    const r=personRoute(p.id);
    const load=dayTotal(p.id,day),after=load+v.dur;
    let prox=9999;
    if(r){
      const pts=stores.filter(x=>x.route===r.id&&x.active!==false);
      if(pts.length){
        const cx=pts.reduce((a,x)=>a+x.x,0)/pts.length,cy=pts.reduce((a,x)=>a+x.y,0)/pts.length;
        prox=Math.hypot(cx-s.x,cy-s.y);
      }
    }
    out.push({p,r,load,after,prox,over:after>QUOTA,
      why:`${r?r.code:'rutsuz'} · ${DAYS[day]}: ${load}dk → ${after}dk (${after>QUOTA?'kota ÜSTÜ ⚠':'kota altı ✓'}) · ${prox<150?'yakın bölge':prox<300?'orta uzaklık':'uzak bölge'}`});
  }
  return out.sort((a,b)=>(a.over-b.over)||(a.prox-b.prox)||(a.after-b.after));
}
window.openRepair=function(preSel){
  if(isRO()){toast('Geçmiş hafta — salt okunur',[]);return;}
  const old=document.getElementById('rpModal');if(old)old.remove(); /* modal yığılmasın */
  const ds=repairDisruptions();
  let sel=typeof preSel==='number'&&ds[preSel]?preSel:(ds.length===1?0:null);
  const bg=document.createElement('div');bg.className='modal-bg';bg.id='rpModal';
  const dec={}; /* vid → {act:'move',toP,toDay} | {act:'skip'} */
  const render=()=>{
    let inner='';
    const decided=Object.keys(dec).length;
    if(sel===null){
      inner=`<div style="font-size:12px;margin-bottom:6px;">Onarılacak bozulmayı seç:</div>`+
        (ds.length?ds.map((d,i)=>`<div class="rp-plan" data-d="${i}"><div class="rp-t">${d.label}</div><div class="rp-m">${d.aff.length} ziyaret etkileniyor</div></div>`).join(''):
        '<div style="color:var(--tx3);font-size:12px;padding:10px;">Bilinen bozulma yok (izin/kapanış). Gerçek build: manuel bozulma da girilebilir.</div>');
    } else {
      const d=ds[sel];
      inner=`<div style="font-size:12px;margin-bottom:2px;"><b>${d.label}</b> — ${d.aff.length} ziyaret. Her satırda kararı <b>sen</b> ver:</div>
      <div style="font-size:10.5px;color:var(--tx3);margin-bottom:8px;">Sistem aday listesini daraltır ve sıralar (müsaitlik · kota · bölge yakınlığı) — kişiyi ve günü sen seçersin. Karar verilmeyen satır uygulanmaz, Sorun Merkezi'nde kalır.${d.k==='closed'?' Mağaza kapalıyken taşımak yerine atlamak mantıklı — yine de karar senin.':''}</div>
      ${d.k==='closed'?`<div style="margin-bottom:6px;"><button id="rpSkipAll" style="font-size:11px;">Tümünü atla (${d.aff.length})</button></div>`:''}
      ${d.aff.map(v=>{
        const s=store(v.storeId);
        const cur=dec[v.id];
        const day=cur&&cur.act==='move'?cur.toDay:v.day;
        const cands=candidatesFor(v,d.k==='leave'?d.id:null,day);
        return `<div class="rp-row ${cur?(cur.act==='skip'?'sk':'mv'):''}" data-vid="${v.id}">
          <div class="rp-row-l">
            <b style="cursor:pointer;" class="rpJump" data-vid="${v.id}" title="Takvimde göster">${s.name}</b>
            <span style="color:var(--tx3);font-size:10.5px;">${DAYS[v.day]} ${fmtT(v.start)} · ${v.dur}dk · ${person(v.personId).name}</span>
          </div>
          <div class="rp-row-r">
            <select class="rpDay" data-vid="${v.id}" title="Yeni gün — seçim senin">${DAYS.map((dn,di)=>`<option value="${di}" ${di===day?'selected':''}>${dn}</option>`).join('')}</select>
            <select class="rpWho" data-vid="${v.id}" title="Yeni kişi — liste daraltılmış ve sıralı; seçim senin">
              <option value="">kişi seç…</option>
              <optgroup label="Önerilen — müsait, sıralı (kota · yakınlık)">
                ${cands.slice(0,6).map(c=>`<option value="${c.p.id}" ${cur&&cur.act==='move'&&cur.toP===c.p.id?'selected':''} title="${c.why}">${c.p.name} — ${c.why}</option>`).join('')}
              </optgroup>
              ${cands.length>6?`<optgroup label="Diğerleri">${cands.slice(6).map(c=>`<option value="${c.p.id}" title="${c.why}">${c.p.name} — ${c.why}</option>`).join('')}</optgroup>`:''}
            </select>
            <button class="rpSkip" data-vid="${v.id}" style="font-size:10.5px;${cur&&cur.act==='skip'?'background:var(--red-l,#fde8e8);color:var(--red-d);':''}">Atla</button>
            <button class="rpClr" data-vid="${v.id}" style="font-size:10.5px;" ${cur?'':'disabled'} title="Kararı temizle">✕</button>
          </div>
          <div class="rp-state">${cur?(cur.act==='skip'?`🔴 bu hafta atlanır [${d.win}]`:`🔵 → ${DAYS[cur.toDay]} · ${person(cur.toP).name} [${d.win}]`):'karar bekliyor'}</div>
        </div>`;
      }).join('')}
      <div style="margin-top:8px;display:flex;gap:6px;align-items:center;font-size:11px;">
        <span style="color:var(--tx2);">İş hedefi:</span>
        <select id="rpObjective" style="font-size:11px;border:1px solid var(--border2);border-radius:5px;padding:2px 4px;background:var(--card);color:var(--tx);">${OBJECTIVES.map(o=>`<option ${o==='Kapsamayı (uyumu) koru'?'selected':''}>${o}</option>`).join('')}</select>
        <span style="color:var(--tx3);font-size:10px;">— Karar Günlüğü'ne yazılır</span>
      </div>`;
    }
    bg.innerHTML=`<div class="modal" style="width:640px;">
      <div class="modal-head">✨ Onarım ${sel!==null?'— '+ds[sel].label:''}</div>
      <div class="modal-body">${inner}</div>
      <div class="modal-foot">
        ${sel!==null&&ds.length>1?`<button id="rpBack">‹ Geri</button>`:''}
        <button onclick="document.getElementById('rpModal').remove()">Vazgeç</button>
        ${sel!==null?`<button class="primary" id="rpApply" ${decided?'':'disabled style="opacity:.5;"'}>Kararları taslağa uygula (${decided}/${ds[sel].aff.length})</button>`:''}
      </div></div>`;
    if(sel===null){bg.querySelectorAll('[data-d]').forEach(el=>el.onclick=()=>{sel=+el.dataset.d;render();});return;}
    const back=bg.querySelector('#rpBack');if(back)back.onclick=()=>{sel=null;for(const k of Object.keys(dec))delete dec[k];render();};
    const skipAll=bg.querySelector('#rpSkipAll');if(skipAll)skipAll.onclick=()=>{for(const v of ds[sel].aff)dec[v.id]={act:'skip'};render();};
    bg.querySelectorAll('.rpJump').forEach(el=>el.onclick=()=>scrollToVisit(el.dataset.vid));
    bg.querySelectorAll('.rpWho').forEach(el=>el.onchange=()=>{
      const vid=el.dataset.vid;
      if(!el.value){delete dec[vid];render();return;}
      const daySel=bg.querySelector(`.rpDay[data-vid="${vid}"]`);
      dec[vid]={act:'move',toP:el.value,toDay:+daySel.value};render();
    });
    bg.querySelectorAll('.rpDay').forEach(el=>el.onchange=()=>{
      const vid=el.dataset.vid;
      if(dec[vid]&&dec[vid].act==='move')dec[vid].toDay=+el.value;
      render(); /* gün değişince aday sıralaması ve kota hesabı tazelenir */
    });
    bg.querySelectorAll('.rpSkip').forEach(el=>el.onclick=()=>{
      const vid=el.dataset.vid;
      if(dec[vid]&&dec[vid].act==='skip')delete dec[vid];else dec[vid]={act:'skip'};
      render();
    });
    bg.querySelectorAll('.rpClr').forEach(el=>el.onclick=()=>{delete dec[el.dataset.vid];render();});
    const ap=bg.querySelector('#rpApply');
    if(ap)ap.onclick=()=>{
      const d=ds[sel];let moved=0,skipped=0;
      for(const [vid,c] of Object.entries(dec)){
        const v=visits.find(x=>x.id===vid);if(!v)continue;
        const before=snapshotVisit(v);
        if(c.act==='move'){
          const dv=dayVisits(c.toP,c.toDay).filter(x=>x.id!==vid);
          const st=dv.length?dv[dv.length-1].start+dv[dv.length-1].dur+travelMin(store(dv[dv.length-1].storeId),store(v.storeId)):DAY_START;
          v.personId=c.toP;v.day=c.toDay;v.start=skipBreaks(st);v.patched=true;v.patchUntil=d.win;
          logChange(`✨ ${store(v.storeId).name}: ${DAYS[before.day]} ${person(before.personId).name} → ${DAYS[c.toDay]} ${person(c.toP).name} [${d.win}]`,c.toP,c.toDay,()=>restoreVisit(v,before),true);
          moved++;
        } else {
          visits=visits.filter(x=>x.id!==vid);weekData[currentWeek]=visits;
          logChange(`✨ ${store(before.storeId).name}: ${DAYS[before.day]} ziyareti atlandı [${d.win}]`,before.personId,before.day,()=>{visits.push({...before});weekData[currentWeek]=visits;},true);
          skipped++;
        }
      }
      logDecision({kind:'repair',desc:`${d.label} → elle onarım: ${moved} taşıma, ${skipped} atlama (${moved+skipped}/${d.aff.length} karar)`,reason:d.label,objective:bg.querySelector('#rpObjective').value});
      bg.remove();renderAll();
      const rest=ds[sel].aff.length-moved-skipped;
      toast(`✨ ${moved+skipped} karar taslağa uygulandı — Yayınla ile sahaya gider.${rest?` Karar verilmeyen ${rest} ziyaret Sorun Merkezi'nde kalır.`:''}`,[{t:'Geri al (tümü)',f:()=>{for(let i=0;i<moved+skipped;i++)undoLast();}}]);
    };
  };
  render();
  document.body.appendChild(bg);
};


/* ---- Kural Denetçisi (Q7): "bu mağaza neden farklı?" — kaynak zinciri. ---- */
function taskChain(s,t){
  const ch=[{src:'şablon',m:t.min}];
  const tr=typeRules[s.format];
  if(tr&&tr[t.id]!==undefined)ch.push({src:'tip '+s.format,m:tr[t.id]});
  const ro=s.route&&taskOverrides.find(o=>o.scope==='route'&&o.id===s.route&&o.tpl===t.id&&!o.excluded);
  if(ro)ch.push({src:'rut '+route(s.route).code,m:ro.min});
  const so=taskOverrides.find(o=>o.scope==='store'&&o.id===s.id&&o.tpl===t.id&&!o.excluded&&o.min!==undefined);
  if(so)ch.push({src:'bu mağaza',m:so.min});
  return ch;
}
/* ===================== /v0.5 MOTOR ===================== */

/* ---------- changes / publish / undo ---------- */
function undoLast(){
  const c=changes.pop();if(!c)return;
  c.undo();renderAll();toast('Geri alındı: '+c.desc,[]);
}
$('#undoBtn').onclick=undoLast;
/* v0.5: Yayın kapısı = katmanlı önem + GEREKÇELİ GEÇİŞ.
   Hatalar yayını ENGELLEMEZ (planlayıcı sistemin bilmediğini bilebilir) ama
   gerekçesiz de geçilemez — gerekçe + hedef Karar Günlüğü'ne yazılır.
   "Sistem önerdi" yerine "ben, şu nedenle, şu hedefle" — savunulabilir yayın. */
$('#publishBtn').onclick=()=>{
  if(!changes.length){toast('Yayınlanacak değişiklik yok',[]);return;}
  const iss=computeIssues();
  const errs=iss.filter(i=>i.sev==='err'),warns=iss.filter(i=>i.sev==='warn');
  const bg=document.createElement('div');bg.className='modal-bg';bg.id='pubModal';
  const groups={};
  for(const c of changes){
    const k=c.personId?person(c.personId).name+(c.day!=null?' · '+DAYS[c.day]:''):'Genel (kural)';
    (groups[k]=groups[k]||[]).push(c);
  }
  bg.innerHTML=`<div class="modal">
    <div class="modal-head">Yayın özeti — ${changes.length} değişiklik
      <span style="font-weight:600;font-size:11px;margin-left:8px;">${errs.length?`🔴 ${errs.length} hata`:''} ${warns.length?`🟡 ${warns.length} uyarı`:''} ${!errs.length&&!warns.length?'✓ temiz':''}</span></div>
    <div class="modal-body">${Object.entries(groups).map(([g,cs])=>`
      <div class="chg-group"><div class="g">${g}</div>
      ${cs.map(c=>`<div class="chg-item"><span>${c.desc}${c.patch?'<span class="pill">bu hafta</span>':''}</span><button data-c="${c.id}">Geri al</button></div>`).join('')}
      </div>`).join('')}
      ${errs.length?`<div class="pub-errbox">
        <b>🔴 ${errs.length} hata ile yayınlıyorsun:</b>
        ${errs.map(e=>`<div class="e">· ${e.msg}</div>`).join('')}
        <div style="margin-top:6px;font-size:11px;">Yayın engellenmez — ama gerekçe zorunlu. Karar Günlüğü'ne adınla yazılır.</div>
        <textarea id="pubReason" placeholder="Gerekçe (zorunlu) — örn. 'yol tahmini yanlış, depo içinden geçiyor; sahayla teyitli'"></textarea>
      </div>`:''}
      <div style="margin-top:8px;display:flex;gap:6px;align-items:center;font-size:11.5px;">
        <span style="color:var(--tx2);">İş hedefi:</span>
        <select id="pubObjective" style="font-size:11px;border:1px solid var(--border2);border-radius:5px;padding:3px;background:var(--card);color:var(--tx);">
          ${OBJECTIVES.map(o=>`<option>${o}</option>`).join('')}
        </select>
        <span style="color:var(--tx3);font-size:10px;">— günlüğe yazılır; ay sonunda "plan neden böyleydi?"nin cevabı</span>
      </div>
      <div style="color:var(--tx2);font-size:11px;margin-top:8px;">Onayladığında etkilenen saha temsilcilerine tek toplu bildirim gönderilir. Hiçbir değişiklik bu özetten geçmeden telefona düşmez.</div>
    </div>
    <div class="modal-foot">
      <button onclick="document.getElementById('pubModal').remove()">Vazgeç</button>
      <button class="primary" id="confirmPub" ${errs.length?'disabled style="opacity:.5;"':''}>Onayla ve yayınla</button>
    </div></div>`;
  document.body.appendChild(bg);
  const cp=$('#confirmPub'),ra=$('#pubReason');
  if(ra)ra.oninput=()=>{const ok=ra.value.trim().length>=5;cp.disabled=!ok;cp.style.opacity=ok?'1':'.5';};
  bg.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{
    const i=changes.findIndex(c=>c.id===b.dataset.c);
    if(i>=0){changes[i].undo();changes.splice(i,1);}
    bg.remove();renderAll();
    if(changes.length)$('#publishBtn').click();
  });
  cp.onclick=()=>{
    if(errs.length&&(!ra||ra.value.trim().length<5))return;
    const affected=new Set(changes.filter(c=>c.personId).map(c=>person(c.personId).name));
    logDecision({kind:'publish',
      desc:`${changes.length} değişiklik yayınlandı (${[...affected].join(', ')||'genel'})`,
      objective:$('#pubObjective').value,
      reason:errs.length?ra.value.trim():null,
      errors:errs.map(e=>e.msg)});
    if(window.__evoPublish){try{window.__evoPublish({reason:errs.length?ra.value.trim():null,objective:$('#pubObjective').value});}catch(e){console.error('[evo] publish',e);}}changes=[];bg.remove();renderAll();
    toast(`Yayınlandı ✓ ${affected.size?[...affected].join(', ')+' bilgilendirildi (toplu bildirim)':''}${errs.length?' · gerekçe günlüğe yazıldı':''}`,[]);
  };
};
/* ---------- header / status ---------- */
function renderHeader(){
  $('#chgCount').textContent=changes.length;
  $('#wkLabel').textContent=weekLabel(currentWeek)+(isRO()?' 🔒':currentWeek>28?' (gelecek)':'');
  $('#wkLabel').style.color=isRO()?'var(--tx3)':'var(--tx2)';
  const fc=$('#filterChip');
  if(filter){
    const label=filter.type==='routes'?[...filter.ids].map(id=>route(id).code).join(' + '):person(filter.id).name;
    fc.innerHTML=`<span class="chip">◉ ${label} · filtre <span class="x" onclick="setFilterNull()">✕</span></span>`;
  } else fc.innerHTML='';
  document.querySelectorAll('#modeSeg button').forEach(b=>b.classList.toggle('on',b.dataset.m===mode));
  document.querySelectorAll('#layoutSeg button').forEach(b=>b.classList.toggle('on',b.dataset.l===layout));
  $('#mapPane').style.display=(layout==='sched'||layout==='table')?'none':'flex';
  $('#schedPane').style.display=(layout==='map'||layout==='table')?'none':'flex';
  $('#tablePane').style.display=(layout==='table')?'flex':'none';
  if(layout==='table')renderDataTable();
}
window.setFilterNull=()=>setFilter(null);
function renderStatus(){
  /* v0.5: gayrı resmî 2 seviye yerine katmanlı önem modeli (err/warn/info).
     Sayaçlar Sorun Merkezi'ne açılır — problemler planlayıcıya gelir. */
  const iss=computeIssues();
  const e=iss.filter(i=>i.sev==='err').length,w=iss.filter(i=>i.sev==='warn').length,inf=iss.filter(i=>i.sev==='info').length;
  $('#statusWarns').innerHTML=(e||w||inf)?
    `<span style="cursor:pointer;" onclick="openConflictCenter()" title="Sorun Merkezi'ni aç — tıkla, soruna atla">`+
    (e?`<span class="err">🔴 ${e} hata</span> · `:'')+(w?`<span class="warn">🟡 ${w} uyarı</span> · `:'')+(inf?`🔵 ${inf} bilgi · `:'')+
    `<u>Sorun Merkezi</u></span>`:'✓ Plan temiz';
  const vals=people.filter(p=>p.active!==false).map(p=>{
    const wk=weekTotal(p.id);
    const val=visits.filter(v=>v.personId===p.id&&store(v.storeId).cat!=='S').reduce((s,v)=>s+v.dur,0);
    return {n:p.name.split(' ')[0],pct:wk?Math.round(val/wk*100):0};
  });
  const min=vals.length?vals.reduce((a,b)=>a.pct<b.pct?a:b):{pct:100,n:''};
  $('#fairness').textContent=vals.map(v=>`${v.n} %${v.pct}`).join(' · ')+(min.pct<40?` — ${min.n} ortalamanın altında`:'');
}
/* ---------- wiring ---------- */
document.querySelectorAll('.rail .tabs div').forEach(t=>t.onclick=()=>{railTab=t.dataset.t;renderRail();});
$('#wkPrev').onclick=()=>setWeek(currentWeek-1);
$('#wkNext').onclick=()=>setWeek(currentWeek+1);
document.querySelectorAll('#modeSeg button').forEach(b=>b.onclick=()=>{mode=b.dataset.m;renderAll();
  if(mode==='base')toast('Baz görünüm: aylık rutin, yamalar hariç — salt okunur',[]);});
document.querySelectorAll('#layoutSeg button').forEach(b=>b.onclick=()=>{layout=b.dataset.l;renderHeader();});
/* global search */
const gs=$('#globalSearch'),sr=$('#searchResults');
gs.oninput=()=>{
  const q=gs.value.trim().toLowerCase();
  if(q.length<2){sr.style.display='none';return;}
  const res=[];
  for(const s of stores)if(s.active!==false&&s.name.toLowerCase().includes(q))res.push({t:'store',id:s.id,l:s.name,sub:s.route?route(s.route).code:'atanmamış'});
  for(const r of routes)if(r.active!==false&&(r.code+' '+r.name).toLowerCase().includes(q))res.push({t:'route',id:r.id,l:r.code+' · '+r.name,sub:r.person?person(r.person).name:'kişi yok'});
  for(const p of people)if(p.active!==false&&p.name.toLowerCase().includes(q))res.push({t:'person',id:p.id,l:p.name,sub:'saha temsilcisi'});
  if(!res.length){sr.innerHTML='<div style="padding:10px;color:var(--tx3);font-size:12px;">Sonuç yok</div>';sr.style.display='block';return;}
  sr.innerHTML=res.slice(0,8).map(x=>`<div class="sres" data-t="${x.t}" data-id="${x.id}" style="padding:7px 10px;cursor:pointer;border-bottom:1px solid var(--gray-l);font-size:12px;"><b>${x.l}</b><br><span style="color:var(--tx3);font-size:11px;">${x.sub}</span></div>`).join('');
  sr.style.display='block';
  sr.querySelectorAll('.sres').forEach(el=>{
    el.onmouseenter=()=>el.style.background='var(--gray-l)';
    el.onmouseleave=()=>el.style.background='';
    el.onclick=()=>{
      const t=el.dataset.t,id=el.dataset.id;
      sr.style.display='none';gs.value='';
      if(t==='store'){const s=store(id);if(s.route)expandedRoutes.add(s.route);setFocus({type:'store',id});renderAll();requestAnimationFrame(()=>scrollToStore(id));} /* v0.5: bloğa kaydır + vurgula */
      else if(t==='route'){toggleRouteFilter(id,false);}
      else{setFilter({type:'person',id});setFocus({type:'person',id});}
    };
  });
};
gs.onblur=()=>setTimeout(()=>sr.style.display='none',200);
/* v0.5: Enter = ilk sonucu seç */
gs.onkeydown=e=>{
  if(e.key==='Enter'){const first=sr.querySelector('.sres');if(first)first.onclick();}
  if(e.key==='Escape'){gs.blur();sr.style.display='none';}
};
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(currentPage!=='planner'){showPage('planner');return;}
    selection.clear();if(filter)setFilter(null);hidePopover();renderAll();
  }
  if((e.metaKey||e.ctrlKey)&&e.key==='z'){e.preventDefault();undoLast();}
  /* v0.5: Cmd/Ctrl+K veya / = aramaya odaklan (400 mağazada 10sn kuralı) */
  if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();gs.focus();gs.select();}
  if(e.key==='/'&&!e.metaKey&&!e.ctrlKey){
    const t=e.target;
    if(!(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable)){e.preventDefault();gs.focus();gs.select();}
  }
});
/* v0.5: yeni düğmeler */
$('#journalBtn').onclick=()=>openJournal();
document.addEventListener('click',e=>{if(!e.target.closest('#mapPopover')&&!e.target.closest('circle'))hidePopover();});
/* ---------- yönetim + gelen kutusu sayfaları ---------- */
/* Şablonlar: gerçek build'de task_template tablosu (instructions = saha
   talimatı, agent mobilde görür). Kurallar: rule tablosu, kapsam merdiveni
   mağaza > rut > format > zincir > genel, hepsi tarihlenebilir. */
/* MODÜL SİSTEMİ: modül TİPLERİ koda gömülü (KONTROL/FOTO/FORM/BILGI),
   görev İÇERİĞİ tamamen dinamik (mods dizisi). Ajan ekranı = bu yığının
   sırayla render'ı; zorunlu modüller bitmeden görev tamamlanamaz. */
let modSeq=0;
const MOD=(type,label,req,config)=>({id:'m'+(++modSeq),type,label,req:!!req,config:config||{}});
let taskTemplates=[
  {id:'t1',name:'Öncesi fotoğraf',min:5,proof:'Fotoğraf',rec:'Her ziyaret',ins:'Rafa dokunmadan önce genel görünüm fotoğrafı çek.',active:true,
   mods:[MOD('FOTO','Öncesi raf fotoğrafı',true,{min:1})]},
  {id:'t2',name:'Raf çalışması',min:30,proof:'Yok',rec:'Her ziyaret',ins:'Depodan ürün çek, ön yüzeyi düzenle, boş alan bırakma.',active:true,
   mods:[MOD('BILGI','Önce depo kontrolü: eksik ürünleri çek'),
         MOD('KONTROL','Rafı temizle, ön yüzeyi düzenle',true),
         MOD('FORM','Raf durumu',true,{qs:[{q:'Kaç facing?',k:'sayı'},{q:'Boş raf var mı?',k:'evet/hayır'}]})]},
  {id:'t3',name:'SKT kontrol',min:10,proof:'Form',rec:'Her ziyaret',ins:'SKT 30 günden az ürünleri öne çek; kritikleri forma işle.',active:true,
   mods:[MOD('KONTROL','SKT<30 gün ürünleri öne çek',true),
         MOD('FORM','SKT bildirimi',false,{qs:[{q:'Kritik ürün var mı?',k:'evet/hayır'},{q:'Ürün adı',k:'metin'}]})]},
  {id:'t4',name:'Fiyat toplama',min:15,proof:'Form',rec:'Haftalık',ins:'Kendi + rakip 256 kalem; en güncel fiyatı gir.',active:true,
   mods:[MOD('FORM','Fiyat girişi',true,{qs:[{q:'Ürün fiyatları (liste)',k:'metin'}]}),
         MOD('FOTO','Etiket fotoğrafı (opsiyonel)',false,{min:1})]},
  {id:'t5',name:'Sonrası fotoğraf',min:5,proof:'Fotoğraf',rec:'Her ziyaret',ins:'Düzenleme bittikten sonra aynı açıdan fotoğraf çek.',active:true,
   mods:[MOD('FOTO','Sonrası raf fotoğrafı',true,{min:1})]},
  /* v0.5.4: eski "kampanya" artık böyle görünür — hedefli + son tarihli görev.
     target: tip/zincir filtresi (boş = tümü) · until: ISO son tarih, geçince
     görev otomatik düşer. Sadece hedefe uyan mağazaların listesine girer. */
  {id:'t6',name:'Süt reyonu anketi',min:8,proof:'Form',rec:'Tek seferlik',ins:'Süt reyonu sorularını yanıtla; kritik stok eksiğini işaretle.',active:true,
   target:{type:'',chain:'Migros'},until:'2026-07-17',
   mods:[MOD('FORM','Süt reyonu anketi',true,{qs:[{q:'Rakip süt markası sayısı?',k:'sayı'},{q:'Soğutucu düzeni uygun mu?',k:'evet/hayır'}]})]}
];
const MOD_TYPES={KONTROL:'☑',FOTO:'📷',FORM:'📝',BILGI:'ℹ️'};
function resolveMods(s,t){
  const so=taskOverrides.find(o=>o.scope==='store'&&o.id===s.id&&o.tpl===t.id&&o.mods);
  return so?{mods:so.mods,custom:true}:{mods:t.mods||[],custom:false};
}
/* Mağaza tipleri ana DB'den gelir (EVO sync) — ~5 tip, nadiren değişir.
   Tip kuralları = görev × tip matrisi. İstisnalar (mağaza/rut) panel ✎'den. */
/* SABİT 6 tip — Migros adlandırması, tüm zincirlere uygulanır (boyut sınıfı).
   DB'de kod 1-6; büyük A101 de "MM boyutunda" olabilir. */
const STORE_TYPES=[
  {key:'Jet',label:'Jet (1)'},
  {key:'M',label:'M (2)'},
  {key:'MM',label:'MM (3)'},
  {key:'3M',label:'3M (4)'},
  {key:'4M',label:'4M (5)'},
  {key:'5M',label:'5M (6)'}
];
let typeRules={ '4M':{t2:60,t4:25}, '5M':{t2:75,t4:30}, 'Jet':{t2:15,t4:0} }; /* tip → şablon → dk */
let rulesData=[]; /* panel ✎'den gelen mağaza/rut istisnaları */
let settingsData={quota:450,target:1250,snap:5,esc:3,batch:15};
/* Bağlama özel görev kuralları: detay panelindeki ✎ ile oluşturulur.
   Kapsam SADECE o mağaza veya o rut — genel şablona dokunmaz.
   Merdiven: mağaza > rut > format > şablon. */
let taskOverrides=[]; /* {scope:'store'|'route', id, tpl, min?, excluded?, date} */
let storeTaskOrder={}; /* storeId → [tplId,...] — mağazaya özel görev SIRASI (sahada uygulama sırası) */
function storeTaskList(s){
  const excluded=new Set(taskOverrides.filter(o=>o.scope==='store'&&o.id===s.id&&o.excluded).map(o=>o.tpl));
  /* v0.5.4: görev hedefli (tip/zincir) ve süreli (son tarih) olabilir —
     eski "kampanya"nın yaptığı her şey. Süresi dolan otomatik düşer. */
  let list=taskTemplates.filter(t=>{
    if(!t.active||excluded.has(t.id))return false;
    if(t.until&&t.until<TODAY)return false;
    if(t.target){
      if(t.target.type&&s.format!==t.target.type)return false;
      if(t.target.chain&&!s.chain.toLowerCase().includes(t.target.chain.toLowerCase()))return false;
    }
    return true;
  });
  const ord=storeTaskOrder[s.id];
  if(ord)list=list.slice().sort((a,b)=>{
    const ia=ord.indexOf(a.id),ib=ord.indexOf(b.id);
    return (ia<0?999:ia)-(ib<0?999:ib);
  });
  return list;
}
function resolveTaskMin(s,t){
  let m=t.min,src='şablon';
  const tr=typeRules[s.format];
  if(tr&&tr[t.id]!==undefined){m=tr[t.id];src='kural: tip ('+(STORE_TYPES.find(x=>x.key===s.format)||{label:s.format}).label+')';}
  const ro=s.route&&taskOverrides.find(o=>o.scope==='route'&&o.id===s.route&&o.tpl===t.id);
  if(ro){m=ro.min;src='kural: rut ('+route(s.route).code+')'+(ro.date!=='kalıcı'?' · '+ro.date:'');}
  const so=taskOverrides.find(o=>o.scope==='store'&&o.id===s.id&&o.tpl===t.id);
  if(so){m=so.min;src='kural: bu mağaza'+(so.date!=='kalıcı'?' · '+so.date:'');}
  return {m,src};
}
function applyDelta(pred,delta,desc){
  if(!delta)return;
  const snaps=visits.filter(pred).map(v=>({v,s:snapshotVisit(v)}));
  for(const {v} of snaps){v.dur=Math.max(10,v.dur+delta);const bv=baseVisits.find(x=>x.id===v.id);if(bv)bv.dur=v.dur;}
  clearFutureWeeks();
  const days=new Set(snaps.map(({v})=>v.personId+'|'+v.day));
  for(const k of days){const [p,d]=k.split('|');reflow(p,+d);}
  logChange(desc,null,null,()=>{for(const {v,s} of snaps){restoreVisit(v,s);const bv=baseVisits.find(x=>x.id===v.id);if(bv)bv.dur=s.dur;}});
}
window.openTaskEdit=function(storeId,routeId,tplId){
  const s=storeId?store(storeId):null;
  const r=routeId?route(routeId):(s&&s.route?route(s.route):null);
  const bg=document.createElement('div');bg.className='modal-bg';bg.id='teModal';
  bg.innerHTML=`<div class="modal" style="width:400px;">
    <div class="modal-head">Görev düzenle ${s?'— '+s.name:r?'— '+r.code:''}</div>
    <div class="modal-body">
      <div class="frow"><label>Görev</label>
        <select id="teTpl">${taskTemplates.filter(t=>t.active).map(t=>`<option value="${t.id}" ${t.id===tplId?'selected':''}>${t.name}</option>`).join('')}</select></div>
      <div class="frow"><label>Yeni süre (dk)</label><input type="number" id="teMin" step="5" min="5" value="${tplId?(s?resolveTaskMin(s,taskTemplates.find(t=>t.id===tplId)).m:taskTemplates.find(t=>t.id===tplId).min):15}" style="width:70px;"></div>
      <div class="frow"><label>Kapsam</label>
        <select id="teScope">
          ${s?`<option value="store">Sadece bu mağaza</option>`:''}
          ${r?`<option value="route" ${!s?'selected':''}>Bu ruttaki tüm mağazalar (${r.code})</option>`:''}
        </select></div>
      <div class="frow"><label>Geçerlilik</label>
        <select id="teDate"><option>kalıcı</option><option>sadece bu hafta</option><option>sadece bugün</option></select></div>
      <div id="teImpact" style="font-size:11px;background:var(--bg);border:1px solid var(--gray-l);border-radius:6px;padding:6px 8px;"></div>
      <div style="font-size:11px;color:var(--tx3);">Genel şablona dokunmaz — sadece seçili kapsamda geçerli bir kural oluşturur. Kurallar sekmesinde görünür, oradan kaldırılabilir.</div>
    </div>
    <div class="modal-foot">
      <button onclick="document.getElementById('teModal').remove()">Vazgeç</button>
      <button class="primary" id="teSave">Kaydet</button>
    </div></div>`;
  document.body.appendChild(bg);
  /* v0.5: canlı etki önizleme (Q7) — kaydetmeden dalga etkisini gör */
  const teIm=()=>{
    const tpl=taskTemplates.find(t=>t.id===$('#teTpl').value);
    const nm=Math.max(5,Math.round(+$('#teMin').value/5)*5);
    const scope=$('#teScope').value;
    const tgtS=scope==='store'?s:null,tgtR=scope==='route'?r:null;
    const oldM=tgtS?resolveTaskMin(tgtS,tpl).m:tpl.min;
    const delta=nm-oldM;
    const pred=scope==='store'?(v=>v.storeId===tgtS.id):(v=>{const xr=personRoute(v.personId);return xr&&tgtR&&xr.id===tgtR.id;});
    const im=ruleImpact(pred,delta,true);
    $('#teImpact').innerHTML=`<b>Etki önizleme:</b> ${impactLabel(im)}${delta===0?' · süre aynı':''}`;
  };
  ['#teTpl','#teMin','#teScope'].forEach(q=>{const el2=$(q);if(el2)el2.oninput=el2.onchange=teIm;});
  teIm();
  $('#teSave').onclick=()=>{
    const tpl=taskTemplates.find(t=>t.id===$('#teTpl').value);
    const nm=Math.max(5,Math.round(+$('#teMin').value/5)*5);
    const scope=$('#teScope').value, date=$('#teDate').value;
    const tgtStore=scope==='store'?s:null, tgtRoute=scope==='route'?r:null;
    const oldM=tgtStore?resolveTaskMin(tgtStore,tpl).m:tpl.min;
    taskOverrides=taskOverrides.filter(o=>!(o.scope===scope&&o.id===(tgtStore?tgtStore.id:tgtRoute.id)&&o.tpl===tpl.id));
    taskOverrides.push({scope,id:tgtStore?tgtStore.id:tgtRoute.id,tpl:tpl.id,min:nm,date});
    rulesData.push({id:'r'+Date.now(),scope:scope==='store'?'Mağaza':'Rut',
      cond:tgtStore?tgtStore.name:tgtRoute.code,eff:tpl.name+' '+nm+'dk',date,active:true});
    const delta=nm-oldM;
    if(scope==='store')applyDelta(v=>v.storeId===tgtStore.id,delta,`${tgtStore.name}: ${tpl.name} → ${nm}dk (mağaza kuralı)`);
    else applyDelta(v=>{const xr=personRoute(v.personId);return xr&&xr.id===tgtRoute.id;},delta,`${tgtRoute.code}: ${tpl.name} → ${nm}dk (rut kuralı)`);
    bg.remove();renderAll();
    toast(`Kural kaydedildi — ziyaret süreleri güncellendi${delta?'':' (süre aynı)'}`,[]);
  };
};
let inboxData=[
  {id:'i1',type:'💬 Not',who:'Mehmet D.',txt:'"Kantin B müdürü perşembe günleri servis istemiyor."',anchor:'s5',status:'open'},
  {id:'i2',type:'✋ Talep',who:'Ayşe K.',txt:'"Migros 4M süresi yetmiyor — 60dk olmalı."',anchor:'s1',status:'open',apply:{store:'s1',dur:60}},
  {id:'i3',type:'⏰ Geciken',who:'Sistem',txt:'Süt reyonu anketi (süreli görev, son tarih 17 Tem) — Migros MM Bahçeli havuzda, ziyareti yok: hedefte ama plana giremiyor.',anchor:'s9',status:'open'}
];
let currentPage='planner',adminTab='templates',inboxTab='field'; /* v0.5.6 */
/* Yönetim ve Gelen kutusu tam sayfa DEĞİL — sağdan kayan yarım-panel
   (drawer). Planlayıcı arkada görünür ve canlı kalır; bağlam kopmaz. */
function showPage(p){
  if(currentPage==='admin'&&p!=='admin'&&typeof adminDiffs==='function'&&adminDiffs().length){
    if(!confirm(adminDiffs().length+' kaydedilmemiş Yönetim değişikliği var. Kaydetmeden çıkılsın mı?'))return;
    adminDraft=null;
  }
  currentPage=(currentPage===p&&p!=='planner')?'planner':p;
  $('#adminPage').classList.toggle('on',currentPage==='admin');
  $('#inboxPage').classList.toggle('on',currentPage==='inbox');
  $('#settingsPage').classList.toggle('on',currentPage==='settings');
  if(currentPage==='admin')renderAdmin();
  if(currentPage==='inbox')renderInbox();
  if(currentPage==='settings')renderSettings();
  if(currentPage==='planner')renderAll();
}
/* v0.5.4: openCampaignModal ve campaigns[] kaldırıldı — süreli/hedefli
   görev artık görev şablonunun kendisinde (target + until alanları). */

/* ===================== v0.4: TABLO MODU ===================== */
/* Konfig-güdümlü tek tablo bileşeni. Aksiyon sütunları panel/harita ile
   AYNI fonksiyonları çağırır — yeni iş mantığı / kopya modal yok. */
const TBL_ORDER=['routes','stores','people','templates','patches']; /* v0.5.4: campaigns kaldırıldı */
let tblCur='routes';
const tblSearch={}, tblSort={};
const trLow=v=>(v==null?'':(''+v)).toLocaleLowerCase('tr');
const stripHtml=h=>(''+h).replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
/* türetilmiş yardımcılar (personRoute zaten mevcut) */
const rStores=rid=>stores.filter(s=>s.route===rid&&s.active!==false);
const rCiro=rid=>rStores(rid).reduce((a,s)=>a+s.rev,0);
const rMix=rid=>{const m={P:0,V:0,S:0};rStores(rid).forEach(s=>m[s.cat]++);return m;};
const rWeekMin=rid=>visits.filter(v=>{const s=store(v.storeId);return s&&s.route===rid;}).reduce((a,v)=>a+v.dur,0);
const rPatchN=rid=>visits.filter(v=>{const s=store(v.storeId);return v.patched&&s&&s.route===rid;}).length;
const pVisitN=pid=>visits.filter(v=>v.personId===pid).length;
const pPatchN=pid=>visits.filter(v=>v.personId===pid&&v.patched).length;
const pLoadPct=pid=>Math.round(weekTotal(pid)/(QUOTA*5)*100);
const pValPct=pid=>{const wk=weekTotal(pid);if(!wk)return 0;const val=visits.filter(v=>v.personId===pid&&store(v.storeId).cat!=='S').reduce((a,v)=>a+v.dur,0);return Math.round(val/wk*100);};
const miniBar=(pct,color)=>`<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:54px;height:7px;border-radius:4px;background:var(--gray-l);overflow:hidden;display:inline-block;"><span style="display:block;height:100%;width:${Math.min(100,Math.max(0,pct))}%;background:${color};"></span></span>%${pct}</span>`;
const ciroCell=(ciro,target)=>{const col=!target?'var(--tx)':ciro>=target?'var(--green)':ciro>=target*0.8?'var(--amber-d)':'var(--red-d)';return `<span style="color:${col};font-weight:600;">${ciro}K</span>${target?`<span style="color:var(--tx3);"> / ${target}K</span>`:''}`;};
const freqL=s=>(FREQS.find(f=>f.k===(s.freq||'hf'))||{l:'—'}).l;

const TABLES={
  routes:{
    title:'Rutlar',
    rows:()=>routes.slice(),
    search:['code','name'],
    cols:[
      {k:'code',label:'Kod',render:r=>`<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:9px;height:9px;border-radius:50%;background:${r.color};display:inline-block;"></span>${r.code}</span>`,text:r=>r.code,sort:(a,b)=>a.code.localeCompare(b.code,'tr')},
      {k:'name',label:'Ad',render:r=>r.name,text:r=>r.name,sort:(a,b)=>a.name.localeCompare(b.name,'tr')},
      {k:'person',label:'Kişi',render:r=>r.person?person(r.person).name:'<span style="color:var(--tx3)">—</span>',text:r=>r.person?person(r.person).name:'—',sort:(a,b)=>trLow(a.person&&person(a.person).name).localeCompare(trLow(b.person&&person(b.person).name),'tr')},
      {k:'pts',label:'Nokta',render:r=>rStores(r.id).length,text:r=>rStores(r.id).length,sort:(a,b)=>rStores(a.id).length-rStores(b.id).length},
      {k:'ciro',label:'Ciro / Hedef',render:r=>ciroCell(rCiro(r.id),r.target),text:r=>rCiro(r.id)+'/'+(r.target||0),sort:(a,b)=>rCiro(a.id)-rCiro(b.id)},
      {k:'mix',label:'Karışım',render:r=>{const m=rMix(r.id);return `🟢${m.P} 🟡${m.V} ⚪${m.S}`;},text:r=>{const m=rMix(r.id);return `P${m.P} V${m.V} S${m.S}`;},noSort:true},
      {k:'wmin',label:'Haftalık dk',render:r=>rWeekMin(r.id),text:r=>rWeekMin(r.id),sort:(a,b)=>rWeekMin(a.id)-rWeekMin(b.id)},
      {k:'patch',label:'Aktif yama',render:r=>{const n=rPatchN(r.id);return n?`<span class="pill">${n}</span>`:'<span style="color:var(--tx3)">0</span>';},text:r=>rPatchN(r.id),sort:(a,b)=>rPatchN(a.id)-rPatchN(b.id)},
      {k:'stat',label:'Durum',render:r=>r.active===false?'<span class="badge S">pasif</span>':r.draft?'<span class="badge V">taslak</span>':'<span class="badge P">aktif</span>',text:r=>r.active===false?'pasif':r.draft?'taslak':'aktif',sort:(a,b)=>(a.active===false?2:a.draft?1:0)-(b.active===false?2:b.draft?1:0)}
    ],
    isActive:r=>r.active!==false,
    actions:r=> r.active===false ? [
      {icon:'🔎',label:'Filtrele',fn:()=>toggleRouteFilter(r.id,false)},
      {icon:'✎',label:'Düzenle',mut:true,fn:()=>openRouteEditModal(r.id)},
      {icon:'▶',label:'Aktifleştir',mut:true,fn:()=>reactivateRoute(r.id)}
    ] : [
      {icon:'🔎',label:'Filtrele',fn:()=>toggleRouteFilter(r.id,false)},
      {icon:'✎',label:'Düzenle',mut:true,fn:()=>openRouteEditModal(r.id)},
      {icon:'👤',label:'Kişi',mut:true,fn:()=>openPersonPicker(r.id)},
      {icon:'＋',label:'Mağaza',mut:true,fn:()=>openPoolPicker(r.id)},
      {icon:'⏸',label:'Pasifleştir',mut:true,fn:()=>deactivateRoute(r.id)}
    ],
    rowClick:r=>setFocus({type:'route',id:r.id})
  },
  stores:{
    title:'Mağazalar',
    select:true,
    rows:()=>stores.slice(),
    search:['name','chain','format'],
    cols:[
      {k:'name',label:'Ad',render:s=>s.name,text:s=>s.name,sort:(a,b)=>a.name.localeCompare(b.name,'tr')},
      {k:'chain',label:'Zincir',render:s=>s.chain,text:s=>s.chain,sort:(a,b)=>a.chain.localeCompare(b.chain,'tr')},
      {k:'format',label:'Tip',render:s=>s.format,text:s=>s.format,sort:(a,b)=>a.format.localeCompare(b.format,'tr')},
      {k:'cat',label:'Kategori',render:s=>`<span class="badge ${s.cat}">${catL(s.cat)}</span>`,text:s=>catL(s.cat),sort:(a,b)=>catL(a.cat).localeCompare(catL(b.cat),'tr')},
      {k:'rev',label:'Ciro 6ay',render:s=>`${s.rev}K`,text:s=>s.rev,sort:(a,b)=>a.rev-b.rev},
      {k:'route',label:'Rut',render:s=>s.route?`<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:8px;height:8px;border-radius:50%;background:${route(s.route).color};display:inline-block;"></span>${route(s.route).code}</span>`:'<span style="color:var(--tx3)">havuz</span>',text:s=>s.route?route(s.route).code:'havuz',sort:(a,b)=>trLow(a.route&&route(a.route).code).localeCompare(trLow(b.route&&route(b.route).code),'tr')},
      {k:'freq',label:'Sıklık',render:s=>freqL(s),text:s=>freqL(s),sort:(a,b)=>trLow(freqL(a)).localeCompare(trLow(freqL(b)),'tr')},
      {k:'ord',label:'Sıra',render:s=>{const n=storeOrderNum(s.id);return n==null?'<span style="color:var(--tx3)">—</span>':n;},text:s=>storeOrderNum(s.id)||'',sort:(a,b)=>(storeOrderNum(a.id)||1e6)-(storeOrderNum(b.id)||1e6)},
      {k:'dur',label:'Görev dk',render:s=>storeDur(s),text:s=>storeDur(s),sort:(a,b)=>storeDur(a)-storeDur(b)},
      {k:'stat',label:'Durum',render:s=>s.active===false?'<span class="badge S">pasif</span>':'<span class="badge P">aktif</span>',text:s=>s.active===false?'pasif':'aktif',sort:(a,b)=>(a.active===false?1:0)-(b.active===false?1:0)}
    ],
    isActive:s=>s.active!==false,
    actions:s=>[
      {icon:'🔎',label:'Genişlet',fn:()=>setFocus({type:'store',id:s.id})},
      {icon:'⇄',label:'Rut',mut:true,disabled:s.active===false,fn:()=>openRoutePickerModal(s.id)},
      {icon:'✎',label:'Görev süresi',mut:true,disabled:s.active===false,fn:()=>openTaskEdit(s.id,null,null)},
      {icon:'↦',label:'Havuza',mut:true,disabled:!s.route,fn:()=>moveStoreTo(s.id,'POOL')},
      s.active===false
        ? {icon:'▶',label:'Aktifleştir',mut:true,fn:()=>reactivateStore(s.id)}
        : {icon:'⏸',label:'Pasifleştir',mut:true,fn:()=>deactivateStore(s.id)}
    ],
    rowClick:s=>setFocus({type:'store',id:s.id})
  },
  people:{
    title:'Kişiler',
    rows:()=>people.slice(),
    search:['name'],
    cols:[
      {k:'name',label:'Ad',render:p=>p.name,text:p=>p.name,sort:(a,b)=>a.name.localeCompare(b.name,'tr')},
      {k:'route',label:'Rut',render:p=>{const r=personRoute(p.id);return r?r.code:'<span style="color:var(--tx3)">—</span>';},text:p=>{const r=personRoute(p.id);return r?r.code:'—';},sort:(a,b)=>{const ra=personRoute(a.id),rb=personRoute(b.id);return trLow(ra&&ra.code).localeCompare(trLow(rb&&rb.code),'tr');}},
      {k:'load',label:'Yük',render:p=>{const v=pLoadPct(p.id);return miniBar(v,v>100?'var(--red-d)':v>=60?'var(--green)':'var(--amber-d)');},text:p=>pLoadPct(p.id),sort:(a,b)=>pLoadPct(a.id)-pLoadPct(b.id)},
      {k:'val',label:'Değerli',render:p=>{const v=pValPct(p.id);return miniBar(v,'var(--teal-d)');},text:p=>pValPct(p.id),sort:(a,b)=>pValPct(a.id)-pValPct(b.id)},
      {k:'vis',label:'Bu hafta ziyaret',render:p=>pVisitN(p.id),text:p=>pVisitN(p.id),sort:(a,b)=>pVisitN(a.id)-pVisitN(b.id)},
      {k:'pat',label:'Yama',render:p=>pPatchN(p.id),text:p=>pPatchN(p.id),sort:(a,b)=>pPatchN(a.id)-pPatchN(b.id)},
      {k:'stat',label:'Durum',render:p=>p.active===false?'<span class="badge S">pasif</span>':'<span class="badge P">aktif</span>',text:p=>p.active===false?'pasif':'aktif',sort:(a,b)=>(a.active===false?1:0)-(b.active===false?1:0)}
    ],
    isActive:p=>p.active!==false,
    actions:p=>[
      {icon:'🔎',label:'Filtrele',fn:()=>{ if(filter&&filter.type==='person'&&filter.id===p.id){setFilter(null);}else{setFilter({type:'person',id:p.id});setFocus({type:'person',id:p.id});} }},
      {icon:'👤',label:'Rut değiştir',mut:true,disabled:!personRoute(p.id),fn:()=>{const r=personRoute(p.id);if(r)openPersonPicker(r.id);}},
      p.active===false
        ? {icon:'▶',label:'Aktifleştir',mut:true,fn:()=>reactivatePerson(p.id)}
        : {icon:'⏸',label:'Pasifleştir',mut:true,fn:()=>deactivatePerson(p.id)}
    ],
    rowClick:p=>setFocus({type:'person',id:p.id})
  },
  templates:{
    title:'Görev şablonları',
    rows:()=>taskTemplates.slice(),
    search:['name','proof','rec'],
    cols:[
      {k:'name',label:'Ad',render:t=>t.name,text:t=>t.name,sort:(a,b)=>a.name.localeCompare(b.name,'tr')},
      {k:'min',label:'Varsayılan dk',render:t=>t.min,text:t=>t.min,sort:(a,b)=>a.min-b.min},
      {k:'proof',label:'Kanıt',render:t=>t.proof,text:t=>t.proof,sort:(a,b)=>a.proof.localeCompare(b.proof,'tr')},
      {k:'rec',label:'Sıklık',render:t=>t.rec,text:t=>t.rec,sort:(a,b)=>a.rec.localeCompare(b.rec,'tr')},
      {k:'mods',label:'Modül',render:t=>(t.mods||[]).length,text:t=>(t.mods||[]).length,sort:(a,b)=>(a.mods||[]).length-(b.mods||[]).length},
      {k:'active',label:'Aktif',render:t=>t.active?'<span class="badge P">aktif</span>':'<span class="badge S">pasif</span>',text:t=>t.active?'aktif':'pasif',sort:(a,b)=>(a.active?1:0)-(b.active?1:0)}
    ],
    isActive:t=>t.active!==false,
    actions:t=>[
      {icon:'✎',label:'Düzenle',mut:true,fn:()=>openTplEdit(t.id)},
      {icon:t.active?'⏸':'▶',label:(t.active?'Pasifleştir':'Aktifleştir')+' (Yönetim taslağı)',mut:true,fn:()=>toggleTemplateActive(t.id)}
    ],
    rowClick:null
  },
  patches:{
    title:'Yamalar',
    rows:()=>visits.filter(v=>v.patched),
    search:[],
    cols:[
      {k:'day',label:'Gün',render:v=>DAYS[v.day],text:v=>DAYS[v.day],sort:(a,b)=>a.day-b.day},
      {k:'start',label:'Saat',render:v=>fmtT(v.start),text:v=>fmtT(v.start),sort:(a,b)=>a.start-b.start},
      {k:'store',label:'Mağaza',render:v=>store(v.storeId).name,text:v=>store(v.storeId).name,sort:(a,b)=>store(a.storeId).name.localeCompare(store(b.storeId).name,'tr')},
      {k:'person',label:'Kişi',render:v=>person(v.personId).name,text:v=>person(v.personId).name,sort:(a,b)=>person(a.personId).name.localeCompare(person(b.personId).name,'tr')},
      {k:'route',label:'Rut',render:v=>{const s=store(v.storeId);return s.route?route(s.route).code:'<span style="color:var(--tx3)">havuz</span>';},text:v=>{const s=store(v.storeId);return s.route?route(s.route).code:'havuz';},sort:(a,b)=>{const ra=store(a.storeId).route,rb=store(b.storeId).route;return trLow(ra&&route(ra).code).localeCompare(trLow(rb&&route(rb).code),'tr');}},
      {k:'dur',label:'Süre',render:v=>v.dur+'dk',text:v=>v.dur,sort:(a,b)=>a.dur-b.dur}
    ],
    actions:v=>[
      {icon:'↺',label:"Baz'a dön",mut:true,fn:()=>revertPatch(v.id)}
    ],
    rowClick:v=>setFocus({type:'store',id:v.storeId})
  },
};

function tblFilteredSorted(key){
  const cfg=TABLES[key];
  let rows=cfg.rows();
  const q=trLow(tblSearch[key]||'').trim();
  if(q&&cfg.search.length){
    rows=rows.filter(row=>cfg.search.some(f=>trLow(row[f]).includes(q)));
  }
  const st=tblSort[key];
  if(st){
    const col=cfg.cols.find(c=>c.k===st.key);
    if(col&&col.sort){rows=rows.slice().sort(col.sort);if(st.dir==='desc')rows.reverse();}
  }
  return rows;
}

function renderDataTable(tabKey){
  if(tabKey&&TABLES[tabKey])tblCur=tabKey;
  const cfg=TABLES[tblCur];
  /* tabs */
  $('#tblTabs').innerHTML=TBL_ORDER.map(k=>`<button data-k="${k}" class="${k===tblCur?'on':''}">${TABLES[k].title}<span class="cnt">${TABLES[k].rows().length}</span></button>`).join('');
  $('#tblTabs').querySelectorAll('button').forEach(b=>b.onclick=()=>renderDataTable(b.dataset.k));
  /* toolbar */
  const extra=(cfg.toolbar?cfg.toolbar():[]).map((x,i)=>`<button class="tblExtra" data-i="${i}">${x.icon} ${x.label}</button>`).join('');
  const adminChip=(typeof adminDiffs==='function'&&adminDiffs().length)?`<span class="adminChip" id="tblAdminChip">${adminDiffs().length} Yönetim değişikliği onay bekliyor → Yönetim'i aç</span>`:'';
  $('#tblToolbar').innerHTML=
    `<input class="tblSearch" id="tblSearchInp" placeholder="🔍 ${cfg.title} içinde ara…" value="${(tblSearch[tblCur]||'').replace(/"/g,'&quot;')}"${cfg.search.length?'':' disabled'}>`+
    `<span class="rowcount" id="tblRowCount"></span>`+
    `<span class="spacer"></span>`+
    adminChip+extra+
    `<button id="tblExportBtn">⬇ Dışa aktar</button>`;
  const inp=$('#tblSearchInp');
  if(inp){inp.oninput=()=>{tblSearch[tblCur]=inp.value;tblPaint();};}
  $('#tblToolbar').querySelectorAll('.tblExtra').forEach(b=>b.onclick=()=>cfg.toolbar()[+b.dataset.i].fn());
  const chip=$('#tblAdminChip');if(chip)chip.onclick=()=>showPage('admin');
  $('#tblExportBtn').onclick=()=>tblExport();
  tblPaint();
}

function tblPaint(){
  const cfg=TABLES[tblCur];
  const rows=tblFilteredSorted(tblCur);
  const ro=isRO();
  const st=tblSort[tblCur];
  const head=`<tr>`+
    (cfg.select?`<th class="noSort" style="width:26px;"><input type="checkbox" id="tblSelAll"></th>`:'')+
    cfg.cols.map(c=>{
      const arr=st&&st.key===c.k?`<span class="arr">${st.dir==='asc'?'▲':'▼'}</span>`:'';
      return `<th data-k="${c.k}" class="${c.noSort||!c.sort?'noSort':''}">${c.label}${arr}</th>`;
    }).join('')+
    `<th class="noSort">İşlem</th></tr>`;
  const body=rows.length?rows.map((row,ri)=>{
    const sel=cfg.select&&selection.has(row.id);
    const cells=(cfg.select?`<td><input type="checkbox" class="tblSel" data-id="${row.id}" ${sel?'checked':''}></td>`:'')+
      cfg.cols.map(c=>`<td class="${cfg.rowClick?'clk':''}">${c.render(row)}</td>`).join('')+
      `<td><div class="rowActs">`+cfg.actions(row).map((a,ai)=>{
        const dis=a.disabled||(ro&&a.mut);
        return `<button data-ai="${ai}" title="${a.label}" ${dis?'disabled':''}>${a.icon}</button>`;
      }).join('')+`</div></td>`;
    const inact=cfg.isActive&&cfg.isActive(row)===false;
    return `<tr data-ri="${ri}" class="${sel?'sel ':''}${inact?'inact':''}">${cells}</tr>`;
  }).join(''):`<tr><td class="tbl-empty" colspan="${cfg.cols.length+1+(cfg.select?1:0)}">Kayıt yok</td></tr>`;
  $('#tblScroll').innerHTML=`<table class="dataTable"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  const rc=$('#tblRowCount');if(rc)rc.textContent=`${rows.length} kayıt`;
  /* header sort */
  $('#tblScroll').querySelectorAll('thead th[data-k]').forEach(th=>{
    const col=cfg.cols.find(c=>c.k===th.dataset.k);
    if(!col||col.noSort||!col.sort)return;
    th.onclick=()=>{
      const cur=tblSort[tblCur];
      tblSort[tblCur]=(cur&&cur.key===col.k)?{key:col.k,dir:cur.dir==='asc'?'desc':'asc'}:{key:col.k,dir:'asc'};
      tblPaint();
    };
  });
  /* row click + actions + selection */
  $('#tblScroll').querySelectorAll('tbody tr[data-ri]').forEach(tr=>{
    const row=rows[+tr.dataset.ri];
    tr.querySelectorAll('.rowActs button').forEach(b=>{
      b.onclick=e=>{e.stopPropagation();if(b.disabled)return;cfg.actions(row)[+b.dataset.ai].fn();};
    });
    if(cfg.select){
      const cb=tr.querySelector('.tblSel');
      if(cb)cb.onclick=e=>{e.stopPropagation();if(cb.checked)selection.add(row.id);else selection.delete(row.id);renderAll();};
    }
    if(cfg.rowClick){
      tr.querySelectorAll('td.clk').forEach(td=>td.onclick=()=>cfg.rowClick(row));
    }
  });
  if(cfg.select){
    const all=$('#tblSelAll');
    if(all){
      all.checked=rows.length>0&&rows.every(r=>selection.has(r.id));
      all.onclick=e=>{e.stopPropagation();if(all.checked)rows.forEach(r=>selection.add(r.id));else rows.forEach(r=>selection.delete(r.id));renderAll();};
    }
  }
}

function tblExport(){
  const cfg=TABLES[tblCur];
  const rows=tblFilteredSorted(tblCur);
  const cols=cfg.cols;
  const esc=v=>{const s=(v==null?'':''+v);return /[",\n;]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  const head=cols.map(c=>esc(c.label)).join(',');
  const lines=rows.map(row=>cols.map(c=>esc(c.text?c.text(row):stripHtml(c.render(row)))).join(','));
  const csv='﻿'+[head,...lines].join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`evo-${tblCur}-H${currentWeek}.csv`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}

$('#helpBtn').onclick=()=>{
  const bg=document.createElement('div');bg.className='modal-bg';bg.id='helpModal';
  bg.innerHTML=`<div class="modal" style="width:560px;max-height:86vh;">
    <div class="modal-head">? Kullanım kılavuzu — tüm ipuçları</div>
    <div class="modal-body hlp">

      <h3>🗺 Genel düzen</h3>
      <p>Tek ekran, üç bölüm: solda <b>Harita</b> (nerede), sağda <b>Takvim</b> (ne zaman), alttan <b>Tablo</b> çekmecesi (toplu düzenleme). Üstteki <b>Harita · Bölünmüş · Takvim · Tablo</b> düğmeleri düzeni değiştirir — sayfa asla değişmez. Üç bölüm aynı seçimi paylaşır: haritada seçtiğin, takvimde parlar, tabloda filtrelenir.</p>

      <h3>🗂 Tablo modu</h3>
      <p>Üstteki <b>Tablo</b> düğmesi tam ekran tablo çalışma alanını açar — eski sistemin tablo+form alışkanlığı için. Sekmeler: <b>Rutlar · Mağazalar · Kişiler · Görev şablonları · Yamalar</b>.<br>
      • Her tabloda <b>arama</b> kutusu (o tablonun alanlarında filtreler) ve <b>sütun başlığına tıkla</b> → sırala (▲/▼).<br>
      • Son sütundaki <b>işlem düğmeleri</b> panel/harita ile <b>aynı</b> pencereleri açar — kişi ata, mağaza ekle, görev süresi, rut değiştir, yamayı geri al… Yeni bir akış yok, aynı Yayınla kuralı geçerli.<br>
      • <b>Mağazalar</b> tablosundaki onay kutuları harita seçimiyle ortaktır — burada seçtiğin haritada da seçilidir.<br>
      • <b>⬇ Dışa aktar</b> → mevcut arama + sıralamayı koruyan CSV (Excel'de Türkçe karakter uyumlu).<br>
      • Geçmiş (salt-okunur) haftalarda değiştiren düğmeler pasiftir; görüntüleme, arama ve dışa aktarma açık kalır.</p>

      <h3>🧭 Sol şerit (Rutlar / Havuz)</h3>
      <p>• Ruta tıkla → tüm ekran o ruta filtrelenir (tekrar tıkla = kaldır).<br>
      • <kbd>Shift</kbd> + tıkla → birden fazla rut seç, panelde birleşik özet (toplam ciro, nokta).<br>
      • <b>▸</b> ok → rutun mağaza listesi açılır; numaralar <b>ziyaret sırasıdır</b>.<br>
      • Listedeki mağazayı <b>sürükleyip bırak</b> → ziyaret sırası değişir, takvim saatleri otomatik yeniden dizilir.<br>
      • <b>Havuz</b> sekmesi = hiçbir ruta atanmamış mağazalar. Havuzdan bir mağazayı doğrudan takvimde bir güne sürükle → ruta eklenir.</p>

      <h3>🗺 Harita</h3>
      <p>• Pine tıkla → mini kart (ciro, tip, rut) → <b>Genişlet</b> ile sağ panele açılır.<br>
      • Rut <b>çizgisine</b> tıkla → rutu seçer; <kbd>Shift</kbd>+tık → çoklu seçim.<br>
      • Boş alanda <b>sürükle</b> → dikdörtgen seçim: içindeki mağazalar toplu seçilir, alt barda "→ ANK-01" ile hepsini ruta ata.<br>
      • İçi boş pinler = atanmamış mağazalar. Pin içindeki sayı = ziyaret sırası.</p>

      <h3>📅 Takvim</h3>
      <p>• Blok <b>sürükle</b> (başka gün/kişi) → varsayılan <b>sadece bu hafta</b> (yama, kesikli çerçeve); toast'tan <b>Kalıcı yap</b>.<br>
      • Bloğun <b>alt kenarını çek</b> → süre değişir (5dk adım), alttaki bloklar canlı kayar. Bırakınca kapsam sorulur: <i>bu ziyaret · bu mağaza · bu rut · tüm tip</i>.<br>
      • Bloğa tıkla (sürüklemeden) → sağ panelde mağaza detayı.<br>
      • Gün başındaki dakika toplamı kırmızıysa kota aşılmış (sadece uyarı, engellemez).<br>
      • <b>Efektif</b> = bu haftanın gerçek planı (Baz + yamalar) · <b>Baz</b> = kalıcı aylık rutin, salt okunur. Yama süresi dolunca plan kendiliğinden Baz'a döner.</p>

      <h3>📋 Sağ panel (Detay)</h3>
      <p>Neye tıklarsan onun detayı: <b>Bilgi · Görevler · Geçmiş</b>. Mağazanın Görevler sekmesi tam görev yöneticisidir:<br>
      • <b>⠿ sürükle</b> → görev sırası (sahada uygulama sırası)<br>
      • <b>✎</b> → süreyi değiştir (kapsam: bu mağaza / bu rut, kalıcı / tarihli)<br>
      • <b>🧩</b> → modül yığınını bu mağazaya özel düzenle (sağda ajan ekranı önizlemesi)<br>
      • <b>🗑</b> → görevi bu mağazada kaldır (istisna olur, geri eklenebilir)</p>
      <div class="tip">💡 Panelde görev satırının üzerine gel → saha talimatını görürsün. Her sürenin yanında kaynağı yazar: şablon mu, tip kuralı mı, mağaza istisnası mı.</div>

      <h3>📤 Yayınlama</h3>
      <p>Hiçbir değişiklik anında sahaya gitmez. Her düzenleme üstteki <b>Yayınla (n)</b> sayacına birikir. Yayınla → kişi/güne gruplu özet, her kalem tek tek geri alınabilir → <b>Onayla</b> → etkilenen temsilcilere tek toplu bildirim.</p>

      <h3>⚙ Yönetim (Türkiye geneli)</h3>
      <p>• <b>Görev şablonları</b>: görev türleri — Düzenle ile ad, süre, saha talimatı ve <b>modül yığını</b> (☑ kontrol, 📷 fotoğraf, 📝 dinamik form 2–6 seçenekli sorularla, ℹ️ bilgi).<br>
      • <b>Mağaza tipi kuralları</b>: görev × tip matrisi (Jet→5M). Hücre = o tipteki tüm mağazaların süresi; 0 = yapılmaz; boş = varsayılan.<br>
      • Tüm değişiklikler <b>taslakta birikir</b> → alttaki Kaydet → onay modalı → uygulanır ve <b>📜 Denetim kaydına</b> (kim/ne/ne zaman) yazılır. Kaydetmeden çıkarsan uyarılırsın.<br>
      • <b>Sistem ayarları</b> ayrı sayfadadır (kota, hedefler) — aynı Kaydet + onay + kayıt akışı.</p>

      <h3>🔔 Gelen kutusu — iki sekme</h3>
      <p>• <b>💬 Saha</b>: saha notları, değişiklik talepleri, geciken görevler. <b>📍 bağlama git</b> → planlayıcıda ilgili mağazayı odaklar. Talepteki <b>Uygula</b> → değişiklik normal taslak akışına girer (yine Yayınla gerekir).<br>
      • <b>⚠ Sorunlar</b>: planın hata/uyarı/bilgi listesi (Sorun Merkezi). Alt bardaki 🔴/🟡 sayaçları ve gün başlığı rozetleri de buraya açılır. Satıra tıkla → soruna atla; <b>⚡ Otomatik düzelt</b> aynı kişinin gününü kaydırır; <b>✨ Onarım</b> karar tezgâhını açar.</p>

      <h3>⌨️ Kısayollar</h3>
      <p>• <kbd>/</kbd> veya <kbd>Cmd/Ctrl</kbd>+<kbd>K</kbd> → aramaya odaklan (her yerden)<br>
      • Aramada <kbd>Enter</kbd> → ilk sonucu seç; mağazaysa takvimde bloğuna <b>kaydırıp vurgular</b><br>
      • <kbd>Esc</kbd> → seçimi/filtreyi temizle, açık paneli/aramayı kapat<br>
      • <kbd>Cmd/Ctrl</kbd>+<kbd>Z</kbd> → son değişikliği geri al<br>
      • <kbd>Shift</kbd>+tık (rut/çizgi) → çoklu rut seçimi<br>
      • Blok sürükle = taşı · alt kenar = süre · üst kenar = başlangıç saati<br>
      • 🚗 bağlaca tıkla → yol süresini elle düzelt · alt bardaki 🔴/🟡 sayaçlar → Gelen kutusu › Sorunlar</p>
    </div>
    <div class="modal-foot"><button class="primary" onclick="document.getElementById('helpModal').remove()">Anladım</button></div>
  </div>`;
  document.body.appendChild(bg);
  bg.onclick=e=>{if(e.target===bg)bg.remove();};
};
$('#adminBtn').onclick=()=>showPage('admin');
$('#inboxBtn').onclick=()=>showPage('inbox');
document.querySelectorAll('#adminTabs div').forEach(t=>t.onclick=()=>{
  adminTab=t.dataset.t;
  document.querySelectorAll('#adminTabs div').forEach(x=>x.classList.toggle('on',x===t));
  renderAdmin();
});
function renderAdmin(){
  const el=$('#adminBody');
  const banner=(icon,txt)=>`<div style="background:var(--blue-l);color:var(--blue-d);border-radius:8px;padding:8px 12px;font-size:11.5px;margin-bottom:12px;line-height:1.5;">${icon} <b>Etki alanı:</b> ${txt}</div>`;
  if(adminTab==='templates'){
    el.innerHTML=banner('🌍','Buradaki değişiklik <b>tüm mağazaları ve tüm rutları</b> etkiler — görev türünün genel tanımıdır. İstisnalar Kurallar sekmesinde tanımlanır ve buradaki değerin üzerine yazar. Örn: süreyi 5→10dk yaparsan, kendi kuralı olmayan her mağazada 10dk olur.')+taskTemplates.map(t=>`<div class="card" style="${t.active?'':'opacity:.5'}">
      <div class="hd"><input type="text" value="${t.name}" data-f="name" data-id="${t.id}" style="border:1px solid var(--border2);border-radius:5px;padding:3px 7px;font-size:13px;font-weight:600;width:200px;background:var(--card);color:var(--tx);">
        <span class="spacer" style="flex:1"></span>
        <label style="font-size:11px;color:var(--tx2);"><input type="checkbox" data-f="active" data-id="${t.id}" ${t.active?'checked':''}> aktif</label></div>
      <div class="frow"><label>Varsayılan süre (dk)</label><input type="number" step="5" value="${t.min}" data-f="min" data-id="${t.id}" style="width:70px;"> <span style="color:var(--tx3);font-size:11px;">kurallar bunun üstüne yazar</span></div>
      <div class="frow"><label>Kanıt · Sıklık</label><span>${t.proof} · ${t.rec}</span></div>
      <div class="frow" style="align-items:flex-start;"><label>Saha talimatı (nasıl yapılır)</label></div>
      <textarea data-f="ins" data-id="${t.id}">${t.ins}</textarea>
    </div>`).join('')+`<button onclick="taskTemplates.push({id:'t'+Date.now(),name:'Yeni görev',min:10,proof:'Yok',rec:'Her ziyaret',ins:'',active:true});renderAdmin();">+ Yeni şablon</button>`;
    el.querySelectorAll('input,textarea').forEach(inp=>inp.onchange=()=>{
      const t=taskTemplates.find(x=>x.id===inp.dataset.id);
      if(inp.dataset.f==='active'){t.active=inp.checked;}
      else if(inp.dataset.f==='min'){t.min=+inp.value;}
      else t[inp.dataset.f]=inp.value;
      renderAdmin();toast('Şablon kaydedildi — mağaza görev listeleri güncellendi',[]);
    });
  } else if(adminTab==='rules'){
    el.innerHTML=banner('🎯','Kurallar <b>sadece kendi kapsamını</b> etkiler (bir zincir, bir format, bir rut veya tek mağaza) ve şablon varsayılanının üzerine yazar. Öncelik: <b>mağaza &gt; rut &gt; format &gt; zincir &gt; genel</b> — en özel kazanır. Her kural kalıcı ya da tarihli olabilir (örn. "sadece bugün").')+
    rulesData.map(r=>`<div class="card" style="${r.active?'':'opacity:.5'}">
      <div class="hd"><span class="pill">${r.scope}</span> ${r.cond}
        <span class="spacer" style="flex:1"></span>
        <button data-id="${r.id}" class="ruleToggle" style="font-size:11px;">${r.active?'Pasifleştir':'Aktifleştir'}</button></div>
      <div class="frow"><label>Etki</label><b>${r.eff}</b></div>
      <div class="frow"><label>Geçerlilik</label><span>${r.date}</span></div>
    </div>`).join('')+`
    <div class="card" style="border-style:dashed;">
      <div class="hd">+ Yeni kural</div>
      <div class="frow"><label>Kapsam</label>
        <select id="nrScope"><option>Genel</option><option>Zincir</option><option>Format</option><option>Rut</option><option>Mağaza</option></select>
        <input type="text" id="nrCond" placeholder="örn. Migros · MM" style="width:140px;">
      </div>
      <div class="frow"><label>Etki</label><input type="text" id="nrEff" placeholder="örn. Raf çalışması 45dk" style="width:200px;"></div>
      <div class="frow"><label>Geçerlilik</label>
        <select id="nrDate"><option>kalıcı</option><option>sadece bugün</option><option>bu hafta</option><option>tarih aralığı…</option></select>
        <button id="nrAdd">Ekle</button>
      </div>
    </div>`;
    el.querySelectorAll('.ruleToggle').forEach(b=>b.onclick=()=>{
      const r=rulesData.find(x=>x.id===b.dataset.id);r.active=!r.active;renderAdmin();
    });
    $('#nrAdd').onclick=()=>{
      rulesData.push({id:'r'+Date.now(),scope:$('#nrScope').value,cond:$('#nrCond').value||'—',eff:$('#nrEff').value||'—',date:$('#nrDate').value,active:true});
      renderAdmin();toast('Kural eklendi — gerçek sistemde önce etki önizlemesi gösterilir',[]);
    };
  } else if(adminTab==='presets'){
    el.innerHTML=banner('📋','Presetler <b>mevcut hiçbir rutu etkilemez</b> — sadece yeni rut kurarken başlangıç iskeleti olarak kullanılır (sıklık düzeni, hedefler, gün şekli). Mağaza ve kişi içermez.')+presetsData.map(p=>`<div class="card">
      <div class="hd">${p.name}<span class="spacer" style="flex:1"></span>
        <button onclick="alert('Prototip: yeni rut sihirbazı bu presetle açılır.')" style="font-size:11px;">Bununla rut kur</button></div>
      <div style="font-size:12px;color:var(--tx2);">${p.def}</div>
    </div>`).join('')+`
    <div class="card" style="border-style:dashed;">
      <div class="hd">+ Mevcut ruttan preset oluştur</div>
      <div class="frow">
        <select id="npRoute">${routes.filter(r=>r.active!==false).map(r=>`<option value="${r.id}">${r.code} · ${r.name}</option>`).join('')}</select>
        <button id="npAdd">Preset olarak kaydet</button>
      </div>
      <div style="font-size:11px;color:var(--tx3);">Preset yalnızca iskeleti alır (sıklık düzeni, hedefler, gün şekli) — mağazalar ve kişi alınmaz.</div>
    </div>`;
    $('#npAdd').onclick=()=>{
      const r=route($('#npRoute').value);
      presetsData.push({id:'p'+Date.now(),name:r.code+' kopyası',def:'iskelet: '+r.code+' düzeninden'});
      renderAdmin();toast('Preset kaydedildi',[]);
    };
  } else {
    el.innerHTML=banner('⚖️','Ayarlar <b>hiçbir ziyareti taşımaz</b> — sadece uyarı eşiklerini ve sistem davranışını değiştirir (neyin işaretleneceği, bildirimlerin nasıl gruplanacağı). Örn: kotayı 450→420 yaparsan takvimdeki gün toplamları yeni eşiğe göre renklenir.')+`<div class="card">
      <div class="hd">Çalışma kuralları</div>
      <div class="frow"><label>Günlük çalışma kotası (dk)</label><input type="number" id="stQuota" value="${settingsData.quota}" step="15" style="width:80px;"> <span style="font-size:11px;color:var(--tx3);">sadece uyarı — asla bloklamaz</span></div>
      <div class="frow"><label>Takvim adımı (dk)</label><input type="number" id="stSnap" value="${settingsData.snap}" style="width:80px;"></div>
    </div>
    <div class="card">
      <div class="hd">Hedefler ve eşikler</div>
      <div class="frow"><label>Rut ciro hedefi (bin ₺ / 6 ay)</label><input type="number" id="stTarget" value="${settingsData.target}" step="50" style="width:90px;"></div>
      <div class="frow"><label>Geciken görev eskalasyonu (gün)</label><input type="number" id="stEsc" value="${settingsData.esc}" style="width:80px;"></div>
    </div>
    <div class="card">
      <div class="hd">Bildirimler</div>
      <div class="frow"><label>Toplu bildirim penceresi (dk)</label><input type="number" id="stBatch" value="${settingsData.batch}" style="width:80px;"> <span style="font-size:11px;color:var(--tx3);">aynı güne çoklu edit = tek bildirim</span></div>
    </div>
    <div style="font-size:11px;color:var(--tx3);">Gerçek sistemde tüm değerler bölge bazında geçersiz kılınabilir (global + per-region override).</div>`;
    const bind=(id,key,fn)=>{$(id).onchange=e=>{settingsData[key]=+e.target.value;if(fn)fn();toast('Ayar kaydedildi',[]);};};
    bind('#stQuota','quota',()=>{QUOTA=settingsData.quota;});bind('#stSnap','snap');bind('#stTarget','target');bind('#stEsc','esc');bind('#stBatch','batch');
  }
}
/* ===== v0.3.2: Yönetim TASLAK → KAYDET → ONAY → DENETİM KAYDI =====
   Türkiye genelini etkilediği için hiçbir Yönetim değişikliği anında
   uygulanmaz. Tüm edit'ler taslağa (adminDraft) yazılır; alt bardaki
   Kaydet → onay modalı (eski → yeni diff) → uygula + adminLog (kim/ne/
   ne zaman). Vazgeç taslağı atar. Kaydetmeden çıkışta uyarı. */
let adminDraft=null, adminLog=[];
function ensureDraft(){
  if(!adminDraft)adminDraft={
    tpls:JSON.parse(JSON.stringify(taskTemplates)),
    types:JSON.parse(JSON.stringify(typeRules)),
    removedEx:[]
  };
  return adminDraft;
}
function adminDiffs(){
  if(!adminDraft)return [];
  const d=[];
  for(const t of adminDraft.tpls){
    const o=taskTemplates.find(x=>x.id===t.id);
    if(!o){d.push(`Yeni şablon: ${t.name} (${t.min}dk)`);continue;}
    if(o.name!==t.name)d.push(`${o.name}: ad → ${t.name}`);
    if(o.min!==t.min)d.push(`${t.name}: varsayılan süre ${o.min} → ${t.min}dk`);
    if(o.proof!==t.proof)d.push(`${t.name}: kanıt ${o.proof} → ${t.proof}`);
    if(o.rec!==t.rec)d.push(`${t.name}: sıklık ${o.rec} → ${t.rec}`);
    if(o.ins!==t.ins)d.push(`${t.name}: saha talimatı güncellendi`);
    if(o.active!==t.active)d.push(`${t.name}: ${t.active?'aktifleştirildi':'pasifleştirildi'}`);
    if(JSON.stringify(o.mods||[])!==JSON.stringify(t.mods||[]))d.push(`${t.name}: modül yığını güncellendi (${(t.mods||[]).length} modül)`);
    /* v0.5.4: hedef + son tarih de denetime tabi */
    const tgt=x=>x&&(x.type||x.chain)?[x.type,x.chain].filter(Boolean).join(' · '):'tümü';
    if(JSON.stringify(o.target||null)!==JSON.stringify(t.target||null))d.push(`${t.name}: hedef ${tgt(o.target)} → ${tgt(t.target)}`);
    if((o.until||'')!==(t.until||''))d.push(`${t.name}: son tarih ${o.until||'yok'} → ${t.until||'yok'}`);
  }
  const keys=new Set([...Object.keys(typeRules),...Object.keys(adminDraft.types)]);
  for(const k of keys){
    const a=typeRules[k]||{},b=adminDraft.types[k]||{};
    for(const tk of new Set([...Object.keys(a),...Object.keys(b)])){
      if(a[tk]!==b[tk]){
        const tn=(adminDraft.tpls.find(x=>x.id===tk)||{name:tk}).name;
        d.push(`Tip ${k} · ${tn}: ${a[tk]!==undefined?a[tk]+'dk':'varsayılan'} → ${b[tk]!==undefined?b[tk]+'dk':'varsayılan'}`);
      }
    }
  }
  for(const r of adminDraft.removedEx)d.push(`İstisna kaldırıldı: ${r.cond} — ${r.eff}`);
  return d;
}
function refreshAdminFoot(){
  const n=adminDiffs().length,b=$('#adminSave');
  if(!b)return;
  b.disabled=!n;b.style.opacity=n?'1':'.5';
  $('#adminDirty').textContent=n?n+' kaydedilmemiş değişiklik':'';
}
function renderAdmin(){
  const D=ensureDraft();
  const el=$('#adminBody');
  const banner=(icon,txt)=>`<div style="background:var(--blue-l);color:var(--blue-d);border-radius:8px;padding:8px 12px;font-size:11.5px;margin-bottom:12px;line-height:1.5;">${icon} <b>Etki alanı:</b> ${txt}</div>`;
  if(adminTab==='templates'){
    el.innerHTML=banner('🌍','Görev türünün genel tanımı — değişiklik <b>tüm mağazaları</b> etkiler (tip kuralı veya istisnası olanlar hariç). Edit\'ler taslakta birikir; alttaki <b>Kaydet</b> ile onaylanır.')+
    D.tpls.map(t=>`<div class="card" style="${t.active?'':'opacity:.55'}">
      <div class="hd">${t.name} ${t.active?'':'<span class="pill" style="background:var(--gray-l);color:var(--tx2);">pasif</span>'}
        <span class="spacer" style="flex:1"></span>
        <button class="tplEdit" data-id="${t.id}" style="font-size:11px;">Düzenle</button>
        <button class="tplTgl" data-id="${t.id}" style="font-size:11px;">${t.active?'Pasifleştir':'Aktifleştir'}</button></div>
      <div style="font-size:12px;color:var(--tx2);">Varsayılan <b>${t.min}dk</b> · ${t.proof} · ${t.rec}</div>
      ${t.until||(t.target&&(t.target.type||t.target.chain))?`<div style="font-size:11px;color:var(--blue-d);margin-top:3px;">⏳ ${t.until?`son tarih ${t.until}`:''}${t.target&&(t.target.type||t.target.chain)?` · hedef: ${[t.target.type,t.target.chain].filter(Boolean).join(' · ')}`:''} — süresi dolunca otomatik düşer</div>`:''}
      <div style="font-size:11px;color:var(--tx3);margin-top:3px;">📋 ${t.ins||'(saha talimatı yok)'}</div>
    </div>`).join('')+`<button id="tplNew">+ Yeni şablon</button>`;
    el.querySelectorAll('.tplEdit').forEach(b=>b.onclick=()=>openTplEdit(b.dataset.id));
    el.querySelectorAll('.tplTgl').forEach(b=>b.onclick=()=>{
      const t=D.tpls.find(x=>x.id===b.dataset.id);t.active=!t.active;
      renderAdmin();
    });
    $('#tplNew').onclick=()=>openTplEdit(null);
    refreshAdminFoot();
  } else {
    const visEx=rulesData.filter(r=>!D.removedEx.some(x=>x.id===r.id));
    el.innerHTML=banner('🏬','Mağaza tipleri ana veritabanından gelir (6 sabit tip). Hücreye süre yaz → o tipteki <b>tüm mağazalar</b> için taslağa yazılır; alttaki <b>Kaydet</b> ile onaylanır. Boş hücre = şablon varsayılanı. Tek mağaza/rut istisnaları detay panelindeki ✎ ile yapılır ve altta listelenir.')+
    `<div class="card"><div class="hd">Görev × mağaza tipi süre matrisi (dk)</div>
    <table style="font-size:11.5px;">
      <tr><th>Görev</th><th style="text-align:center;">vars.</th>${STORE_TYPES.map(t=>`<th style="text-align:center;">${t.key}</th>`).join('')}</tr>
      ${D.tpls.filter(t=>t.active).map(t=>`<tr><td>${t.name}</td><td style="text-align:center;color:var(--tx3);">${t.min}</td>
        ${STORE_TYPES.map(st=>{const v=D.types[st.key]&&D.types[st.key][t.id];
          return `<td style="text-align:center;"><input type="number" step="5" min="0" class="trCell" data-tp="${st.key}" data-tpl="${t.id}" value="${v!==undefined?v:''}" placeholder="${t.min}" style="width:46px;text-align:center;${v!==undefined?'border-color:var(--blue-d);font-weight:700;color:var(--blue-d);':''}"></td>`;}).join('')}
      </tr>`).join('')}
    </table>
    <div style="font-size:10.5px;color:var(--tx3);margin-top:6px;">0 = bu tipte bu görev yapılmaz. Boş bırak = varsayılana dön.</div></div>
    <div class="card"><div class="hd">İstisnalar (mağaza / rut — panel ✎'den)</div>
      ${visEx.length?visEx.map(r=>`<div class="task-row"><span><span class="pill">${r.scope}</span> ${r.cond}</span>
        <span style="display:flex;gap:6px;align-items:center;">${r.eff} · ${r.date}
        <button class="exDel" data-id="${r.id}" style="font-size:10px;">Kaldır</button></span></div>`).join(''):
      '<div style="font-size:11px;color:var(--tx3);">Henüz istisna yok. Bir mağaza veya rut seçip Görevler sekmesindeki ✎ ile oluşturabilirsin.</div>'}
    </div>`;
    el.querySelectorAll('.trCell').forEach(inp=>inp.onchange=()=>{
      const tp=inp.dataset.tp,tpl=inp.dataset.tpl;
      if(inp.value===''){if(D.types[tp])delete D.types[tp][tpl];}
      else{D.types[tp]=D.types[tp]||{};D.types[tp][tpl]=Math.max(0,+inp.value);}
      renderAdmin();
    });
    el.querySelectorAll('.exDel').forEach(b=>b.onclick=()=>{
      D.removedEx.push(rulesData.find(x=>x.id===b.dataset.id));
      renderAdmin();
    });
    refreshAdminFoot();
  }
}
$('#adminDiscard').onclick=()=>{adminDraft=null;renderAdmin();};
$('#adminHist').onclick=()=>{
  const all=[...adminLog,...settingsLog].slice().reverse();
  const bg=document.createElement('div');bg.className='modal-bg';bg.id='histModal';
  bg.innerHTML=`<div class="modal" style="width:460px;">
    <div class="modal-head">📜 Denetim kaydı</div>
    <div class="modal-body">${all.length?all.map(l=>`<div class="chg-item"><span>${l.desc||l.label+': '+l.from+' → '+l.to}</span><span style="font-size:10px;color:var(--tx3);">${l.who} · ${l.at}</span></div>`).join(''):'<div style="font-size:12px;color:var(--tx3);">Henüz kayıt yok.</div>'}</div>
    <div class="modal-foot"><button onclick="document.getElementById('histModal').remove()">Kapat</button></div></div>`;
  document.body.appendChild(bg);
};
$('#adminSave').onclick=()=>{
  const diffs=adminDiffs();if(!diffs.length)return;
  const bg=document.createElement('div');bg.className='modal-bg';bg.id='adModal';
  bg.innerHTML=`<div class="modal" style="width:460px;">
    <div class="modal-head">⚠ Yönetim değişikliği — onay</div>
    <div class="modal-body">
      <div style="font-size:12px;margin-bottom:10px;">Bu değişiklikler <b>Türkiye'deki tüm mağaza ve rutları</b> etkiler:</div>
      ${diffs.map(d=>`<div class="chg-item"><span>${d}</span></div>`).join('')}
      <div style="font-size:11px;color:var(--tx3);margin-top:8px;">Kayda geçecek: ${CURRENT_USER} · ${new Date().toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})}</div>
    </div>
    <div class="modal-foot">
      <button onclick="document.getElementById('adModal').remove()">Vazgeç</button>
      <button class="primary" id="adConfirm">Onayla ve uygula</button>
    </div></div>`;
  document.body.appendChild(bg);
  $('#adConfirm').onclick=()=>{
    const at=new Date().toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'});
    for(const d of diffs)adminLog.push({desc:d,who:CURRENT_USER,at});
    taskTemplates=adminDraft.tpls;
    typeRules=adminDraft.types;
    for(const r of adminDraft.removedEx){
      rulesData=rulesData.filter(x=>x.id!==r.id);
      taskOverrides=taskOverrides.filter(o=>{
        const label=o.scope==='store'?store(o.id).name:route(o.id).code;
        const tn=taskTemplates.find(t=>t.id===o.tpl);
        return !(label===r.cond&&tn&&r.eff.startsWith(tn.name));
      });
    }
    adminDraft=null;
    bg.remove();renderAdmin();renderAll();
    toast('Uygulandı ve denetim kaydına yazıldı ('+diffs.length+' değişiklik)',[]);
  };
};
/* ===== ModuleListEditor — TEK bileşen, iki kapsam =====
   Yönetim şablon modalı (genel varsayılan) ve mağaza paneli 🧩
   (mağazaya özel yığın) aynı editörü kullanır; fark sadece nereye
   yazdığı. Sağda canlı "saha önizleme" (ajanın göreceği ekran). */
function renderModEditor(host,mods){
  host.innerHTML=mods.map((m,i)=>`<div style="border:1px solid var(--border);border-radius:6px;padding:6px;margin-bottom:5px;font-size:11px;background:var(--card);">
    <div style="display:flex;align-items:center;gap:5px;">
      <span style="cursor:pointer;color:var(--tx3);" class="mUp" data-i="${i}">▲</span>
      <span style="cursor:pointer;color:var(--tx3);" class="mDn" data-i="${i}">▼</span>
      <span>${MOD_TYPES[m.type]}</span>
      <input type="text" class="mLbl" data-i="${i}" value="${m.label}" style="flex:1;border:1px solid var(--border2);border-radius:4px;padding:2px 5px;font-size:11px;">
      <label style="white-space:nowrap;color:var(--tx2);"><input type="checkbox" class="mReq" data-i="${i}" ${m.req?'checked':''}> zorunlu</label>
      <span class="mDel" data-i="${i}" style="cursor:pointer;color:var(--red-d);">🗑</span>
    </div>
    ${m.type==='FOTO'?`<div style="margin-top:4px;color:var(--tx2);">Min fotoğraf: <input type="number" class="mMin" data-i="${i}" value="${m.config.min||1}" min="1" style="width:45px;border:1px solid var(--border2);border-radius:4px;font-size:11px;padding:1px 4px;"></div>`:''}
    ${m.type==='FORM'?`<div style="margin-top:4px;">${(m.config.qs||[]).map((q,qi)=>`<div style="margin-bottom:3px;">
        <div style="display:flex;gap:4px;">
        <input type="text" class="mQ" data-i="${i}" data-qi="${qi}" value="${q.q}" style="flex:1;border:1px solid var(--border2);border-radius:4px;font-size:11px;padding:1px 5px;">
        <select class="mQK" data-i="${i}" data-qi="${qi}" style="font-size:11px;border:1px solid var(--border2);border-radius:4px;">${['metin','sayı','evet/hayır','çoktan seçmeli'].map(k=>`<option ${k===q.k?'selected':''}>${k}</option>`).join('')}</select>
        <span class="mQDel" data-i="${i}" data-qi="${qi}" style="cursor:pointer;color:var(--red-d);font-size:11px;">✕</span></div>
        ${q.k==='çoktan seçmeli'?`<div style="margin:3px 0 0 14px;">
          ${(q.opts||[]).map((op,oi)=>`<div style="display:flex;gap:4px;margin-bottom:2px;align-items:center;">
            <span style="color:var(--tx3);font-size:10px;">◯</span>
            <input type="text" class="mOpt" data-i="${i}" data-qi="${qi}" data-oi="${oi}" value="${op}" style="flex:1;border:1px solid var(--border2);border-radius:4px;font-size:10.5px;padding:1px 5px;">
            ${(q.opts||[]).length>2?`<span class="mOptDel" data-i="${i}" data-qi="${qi}" data-oi="${oi}" style="cursor:pointer;color:var(--red-d);font-size:10px;">✕</span>`:'<span style="width:10px;"></span>'}</div>`).join('')}
          ${(q.opts||[]).length<6?`<span class="mOptAdd" data-i="${i}" data-qi="${qi}" style="cursor:pointer;color:var(--blue-d);font-size:10.5px;">+ seçenek (${(q.opts||[]).length}/6)</span>`:'<span style="font-size:10px;color:var(--tx3);">maks 6 seçenek</span>'}
        </div>`:''}</div>`).join('')}
      <span class="mQAdd" data-i="${i}" style="cursor:pointer;color:var(--blue-d);font-size:11px;">+ soru ekle</span></div>`:''}
  </div>`).join('')+
  `<div style="display:flex;gap:5px;align-items:center;margin-top:4px;">
    <select class="mAddSel" style="font-size:11px;border:1px solid var(--border2);border-radius:4px;padding:2px;">
      <option value="KONTROL">☑ Kontrol maddesi</option><option value="FOTO">📷 Fotoğraf</option>
      <option value="FORM">📝 Form</option><option value="BILGI">ℹ️ Bilgi notu</option></select>
    <button class="mAdd" style="font-size:11px;">+ Modül ekle</button>
  </div>`;
  const rerender=()=>{renderModEditor(host,mods);const mb=host.closest('.modal-body');const pv=mb?mb.querySelector('.modPrev'):null;if(pv)renderModPreview(pv,mods);};
  host.querySelectorAll('.mUp').forEach(b=>b.onclick=()=>{const i=+b.dataset.i;if(i>0){[mods[i-1],mods[i]]=[mods[i],mods[i-1]];rerender();}});
  host.querySelectorAll('.mDn').forEach(b=>b.onclick=()=>{const i=+b.dataset.i;if(i<mods.length-1){[mods[i+1],mods[i]]=[mods[i],mods[i+1]];rerender();}});
  host.querySelectorAll('.mDel').forEach(b=>b.onclick=()=>{mods.splice(+b.dataset.i,1);rerender();});
  host.querySelectorAll('.mLbl').forEach(inp=>inp.onchange=()=>{mods[+inp.dataset.i].label=inp.value;rerender();});
  host.querySelectorAll('.mReq').forEach(inp=>inp.onchange=()=>{mods[+inp.dataset.i].req=inp.checked;rerender();});
  host.querySelectorAll('.mMin').forEach(inp=>inp.onchange=()=>{mods[+inp.dataset.i].config.min=+inp.value;rerender();});
  host.querySelectorAll('.mQ').forEach(inp=>inp.onchange=()=>{mods[+inp.dataset.i].config.qs[+inp.dataset.qi].q=inp.value;rerender();});
  host.querySelectorAll('.mQK').forEach(inp=>inp.onchange=()=>{
    const q=mods[+inp.dataset.i].config.qs[+inp.dataset.qi];
    q.k=inp.value;
    if(q.k==='çoktan seçmeli'&&(!q.opts||q.opts.length<2))q.opts=['Seçenek 1','Seçenek 2'];
    rerender();
  });
  host.querySelectorAll('.mOpt').forEach(inp=>inp.onchange=()=>{mods[+inp.dataset.i].config.qs[+inp.dataset.qi].opts[+inp.dataset.oi]=inp.value;rerender();});
  host.querySelectorAll('.mOptDel').forEach(b=>b.onclick=()=>{mods[+b.dataset.i].config.qs[+b.dataset.qi].opts.splice(+b.dataset.oi,1);rerender();});
  host.querySelectorAll('.mOptAdd').forEach(b=>b.onclick=()=>{
    const q=mods[+b.dataset.i].config.qs[+b.dataset.qi];
    q.opts=q.opts||[];if(q.opts.length<6)q.opts.push('Seçenek '+(q.opts.length+1));
    rerender();
  });
  host.querySelectorAll('.mQDel').forEach(b=>b.onclick=()=>{mods[+b.dataset.i].config.qs.splice(+b.dataset.qi,1);rerender();});
  host.querySelectorAll('.mQAdd').forEach(b=>b.onclick=()=>{const m=mods[+b.dataset.i];m.config.qs=m.config.qs||[];m.config.qs.push({q:'Yeni soru',k:'metin'});rerender();});
  host.querySelector('.mAdd').onclick=()=>{
    const ty=host.querySelector('.mAddSel').value;
    mods.push(MOD(ty,ty==='KONTROL'?'Yeni kontrol maddesi':ty==='FOTO'?'Fotoğraf':ty==='FORM'?'Yeni form':'Bilgi notu',false,ty==='FORM'?{qs:[{q:'Yeni soru',k:'metin'}]}:ty==='FOTO'?{min:1}:{}));
    rerender();
  };
}
function renderModPreview(host,mods){
  host.innerHTML=`<div style="font-size:10px;color:var(--tx3);text-align:center;margin-bottom:4px;">SAHA ÖNİZLEME (ajan ekranı)</div>
  <div style="border:2px solid var(--border2);border-radius:14px;padding:10px 8px;background:var(--card);">
    ${mods.map(m=>{
      if(m.type==='BILGI')return `<div style="background:var(--gray-l);border-radius:6px;padding:5px 7px;font-size:10px;color:var(--tx2);font-style:italic;margin-bottom:6px;">ℹ️ ${m.label}</div>`;
      if(m.type==='KONTROL')return `<div style="display:flex;gap:6px;font-size:10.5px;margin-bottom:6px;align-items:center;"><span style="width:13px;height:13px;border:1.5px solid var(--border2);border-radius:3px;display:inline-block;"></span>${m.label}${m.req?' <span style="color:var(--red-d)">*</span>':''}</div>`;
      if(m.type==='FOTO')return `<div style="border:1.5px dashed var(--border2);border-radius:6px;padding:9px;text-align:center;font-size:10px;color:var(--tx2);margin-bottom:6px;">📷 ${m.label}${m.req?' <span style="color:var(--red-d)">*</span>':''}<br><span style="color:var(--tx3);">min ${m.config.min||1} fotoğraf · dokun</span></div>`;
      return `<div style="border:1px solid var(--border);border-radius:6px;padding:6px;font-size:10px;margin-bottom:6px;"><b>📝 ${m.label}</b>${m.req?' <span style="color:var(--red-d)">*</span>':''}
        ${(m.config.qs||[]).map(q=>`<div style="margin-top:4px;color:var(--tx2);">${q.q}<br>${q.k==='evet/hayır'?'<span style="border:1px solid var(--border2);border-radius:8px;padding:0 6px;font-size:9px;">Evet</span> <span style="border:1px solid var(--border2);border-radius:8px;padding:0 6px;font-size:9px;">Hayır</span>':q.k==='çoktan seçmeli'?(q.opts||['A','B']).map(op=>`<span style="font-size:9px;color:var(--tx3);display:block;">◯ ${op}</span>`).join(''):`<span style="display:inline-block;width:90%;border-bottom:1px solid var(--border2);height:9px;"></span>`}</div>`).join('')}</div>`;
    }).join('')}
    <div style="background:var(--blue-d);color:#fff;border-radius:7px;text-align:center;padding:5px;font-size:10px;margin-top:2px;">Görevi tamamla</div>
  </div>`;
}
/* Mağazaya özel modül düzenleme (🧩) — aynı editör, mağaza kapsamı */
window.openModsEdit=function(storeId,tplId){
  const s=store(storeId),t=taskTemplates.find(x=>x.id===tplId);
  const cur=resolveMods(s,t);
  const work=JSON.parse(JSON.stringify(cur.mods));
  const bg=document.createElement('div');bg.className='modal-bg';bg.id='mdModal';
  bg.innerHTML=`<div class="modal" style="width:640px;">
    <div class="modal-head">🧩 ${t.name} — ${s.name} <span style="font-size:11px;color:var(--tx3);font-weight:400;">sadece bu mağazayı etkiler</span></div>
    <div class="modal-body"><div style="display:flex;gap:12px;">
      <div style="flex:1;"><div class="modHost"></div></div>
      <div style="width:210px;flex-shrink:0;" class="modPrev"></div>
    </div></div>
    <div class="modal-foot">
      ${cur.custom?`<button id="mdReset" style="color:var(--red-d);">Genel şablona döndür</button>`:''}
      <span class="spacer" style="flex:1"></span>
      <button onclick="document.getElementById('mdModal').remove()">Vazgeç</button>
      <button class="primary" id="mdSave">Kaydet (bu mağaza)</button>
    </div></div>`;
  document.body.appendChild(bg);
  const wrap=bg.querySelector('.modal-body > div');
  renderModEditor(wrap.querySelector('.modHost'),work);
  renderModPreview(wrap.querySelector('.modPrev'),work);
  $('#mdSave').onclick=()=>{
    taskOverrides=taskOverrides.filter(o=>!(o.scope==='store'&&o.id===s.id&&o.tpl===t.id&&o.mods));
    taskOverrides.push({scope:'store',id:s.id,tpl:t.id,mods:work,date:'kalıcı'});
    if(!rulesData.some(r=>r.cond===s.name&&r.eff===t.name+' modülleri özelleştirildi'))
      rulesData.push({id:'r'+Date.now(),scope:'Mağaza',cond:s.name,eff:t.name+' modülleri özelleştirildi',date:'kalıcı',active:true});
    logChange(`${s.name}: ${t.name} modülleri özelleştirildi`,null,null,
      ()=>{taskOverrides=taskOverrides.filter(o=>!(o.scope==='store'&&o.id===s.id&&o.tpl===t.id&&o.mods));});
    bg.remove();renderPanel();
    toast('Mağazaya özel modül yığını kaydedildi — istisna olarak listelenir',[]);
  };
  const rs=$('#mdReset');
  if(rs)rs.onclick=()=>{
    taskOverrides=taskOverrides.filter(o=>!(o.scope==='store'&&o.id===s.id&&o.tpl===t.id&&o.mods));
    rulesData=rulesData.filter(r=>!(r.cond===s.name&&r.eff===t.name+' modülleri özelleştirildi'));
    bg.remove();renderPanel();toast('Genel şablona döndürüldü',[]);
  };
};
window.openTplEdit=function(id){
  const D=ensureDraft();
  const t=id?D.tpls.find(x=>x.id===id):{id:null,name:'',min:10,proof:'Yok',rec:'Her ziyaret',ins:'',active:true,mods:[]};
  const wmods=JSON.parse(JSON.stringify(t.mods||[]));
  const bg=document.createElement('div');bg.className='modal-bg';bg.id='tplModal';
  bg.innerHTML=`<div class="modal" style="width:680px;">
    <div class="modal-head">${id?'Şablonu düzenle':'Yeni şablon'} <span style="font-size:11px;color:var(--tx3);font-weight:400;">— tüm mağazaları etkiler (taslağa yazılır)</span></div>
    <div class="modal-body">
      <div class="frow"><label>Ad</label><input type="text" id="tpName" value="${t.name}" style="width:200px;">
        <label style="min-width:auto;">Süre (dk)</label><input type="number" id="tpMin" step="5" min="5" value="${t.min}" style="width:65px;"></div>
      <div class="frow"><label>Kanıt</label><select id="tpProof">${['Yok','Fotoğraf','Form'].map(x=>`<option ${x===t.proof?'selected':''}>${x}</option>`).join('')}</select>
        <label style="min-width:auto;">Sıklık</label><select id="tpRec">${['Her ziyaret','Haftalık','Tek seferlik'].map(x=>`<option ${x===t.rec?'selected':''}>${x}</option>`).join('')}</select></div>
      <!-- v0.5.4: eski "kampanya" = bu iki alan. Hedef boş = tüm mağazalar,
           son tarih boş = kalıcı görev. -->
      <div class="frow"><label>Hedef (boş = tümü)</label>
        <select id="tpType"><option value="">Tüm tipler</option>${STORE_TYPES.map(x=>`<option value="${x.key}" ${t.target&&t.target.type===x.key?'selected':''}>${x.key}</option>`).join('')}</select>
        <input type="text" id="tpChain" placeholder="zincir, örn. Migros" value="${t.target?(t.target.chain||''):''}" style="width:100px;">
        <label style="min-width:auto;">Son tarih</label><input type="date" id="tpUntil" value="${t.until||''}" style="font-size:12px;border:1px solid var(--border2);border-radius:5px;padding:3px;"></div>
      <div id="tpCount" style="font-size:11px;color:var(--blue-d);"></div>
      <div class="frow" style="align-items:flex-start;"><label>Saha talimatı</label></div>
      <textarea id="tpIns">${t.ins}</textarea>
      <div style="font-weight:600;font-size:12px;margin:10px 0 6px;">Görev içeriği (modül yığını) — ajanın göreceği ekran</div>
      <div style="display:flex;gap:12px;">
        <div style="flex:1;"><div class="modHost"></div></div>
        <div style="width:210px;flex-shrink:0;" class="modPrev"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button onclick="document.getElementById('tplModal').remove()">Vazgeç</button>
      <button class="primary" id="tpSave">Taslağa ekle</button>
    </div></div>`;
  document.body.appendChild(bg);
  const wrap2=bg.querySelector('.modal-body > div[style*="display:flex"]');
  renderModEditor(wrap2.querySelector('.modHost'),wmods);
  renderModPreview(wrap2.querySelector('.modPrev'),wmods);
  /* v0.5.4: hedef sayacı — kaç mağazanın görev listesine gireceğini canlı göster */
  const tpCnt=()=>{
    const ty=$('#tpType').value,ch=$('#tpChain').value.trim().toLowerCase();
    if(!ty&&!ch){$('#tpCount').textContent='Hedef: tüm mağazalar';return;}
    const n=stores.filter(s=>s.active!==false&&(!ty||s.format===ty)&&(!ch||s.chain.toLowerCase().includes(ch))).length;
    $('#tpCount').textContent=`Hedef: ${n} mağaza`;
  };
  $('#tpType').onchange=tpCnt;$('#tpChain').oninput=tpCnt;tpCnt();
  $('#tpSave').onclick=()=>{
    const D2=ensureDraft();
    const ty=$('#tpType').value,ch=$('#tpChain').value.trim();
    const extra={target:(ty||ch)?{type:ty,chain:ch}:undefined,until:$('#tpUntil').value||undefined};
    if(!id){D2.tpls.push({id:'t'+Date.now(),name:$('#tpName').value||'Yeni görev',min:+$('#tpMin').value||10,proof:$('#tpProof').value,rec:$('#tpRec').value,ins:$('#tpIns').value,active:true,mods:wmods,...extra});}
    else{Object.assign(t,{name:$('#tpName').value,min:+$('#tpMin').value,proof:$('#tpProof').value,rec:$('#tpRec').value,ins:$('#tpIns').value,mods:wmods,...extra});}
    bg.remove();renderAdmin();
    toast('Taslağa eklendi — alttaki Kaydet ile onaylanır',[]);
  };
};
/* Ayarlar: TASLAK → Kaydet → ONAY modalı → uygula + denetim kaydı.
   Türkiye genelini etkilediği için asla anında kaydedilmez.
   Gerçek build: admin_audit_log tablosu (actor, key, from, to, at) —
   şablon ve kural değişiklikleri de aynı tabloya yazar. */
const CURRENT_USER='Süpervizör · Parham';
let settingsLog=[];
const SETTING_DEFS=[
  {key:'quota',label:'Günlük çalışma kotası (dk)',step:15,grp:'Çalışma kuralları',note:'sadece uyarı — asla bloklamaz'},
  {key:'snap',label:'Takvim adımı (dk)',step:5,grp:'Çalışma kuralları'},
  {key:'target',label:'Rut ciro hedefi (bin ₺ / 6 ay)',step:50,grp:'Hedefler ve eşikler'},
  {key:'esc',label:'Geciken görev eskalasyonu (gün)',step:1,grp:'Hedefler ve eşikler'},
  {key:'batch',label:'Toplu bildirim penceresi (dk)',step:5,grp:'Bildirimler'}
];
function renderSettings(){
  const draft={...settingsData};
  const grps=[...new Set(SETTING_DEFS.map(d=>d.grp))];
  $('#settingsBody').innerHTML=`
    <div style="background:var(--amber-l);color:var(--amber-d);border-radius:8px;padding:8px 12px;font-size:11.5px;margin-bottom:12px;">⚖️ Buradaki değerler <b>Türkiye'deki her mağazayı ve rutu</b> etkiler. Değişiklikler anında uygulanmaz — Kaydet'e basınca onay istenir ve kim değiştirdiği kayda geçer.</div>
    ${grps.map(g=>`<div class="card"><div class="hd">${g}</div>
      ${SETTING_DEFS.filter(d=>d.grp===g).map(d=>`<div class="frow"><label>${d.label}</label>
        <input type="number" class="stIn" data-k="${d.key}" value="${settingsData[d.key]}" step="${d.step}" style="width:90px;">
        ${d.note?`<span style="font-size:11px;color:var(--tx3);">${d.note}</span>`:''}</div>`).join('')}
    </div>`).join('')}
    <div style="display:flex;gap:8px;align-items:center;margin:10px 0;">
      <button class="primary" id="stSave" disabled style="opacity:.5;">Kaydet</button>
      <button id="stReset">Vazgeç</button>
      <span id="stDirty" style="font-size:11px;color:var(--tx3);"></span>
    </div>
    <div class="card"><div class="hd">Değişiklik geçmişi (denetim kaydı)</div>
      ${settingsLog.length?settingsLog.slice().reverse().map(l=>`<div class="task-row" style="font-size:11px;"><span>${l.label}: <b>${l.from} → ${l.to}</b></span><span style="color:var(--tx3);">${l.who} · ${l.at}</span></div>`).join(''):
      '<div style="font-size:11px;color:var(--tx3);">Henüz değişiklik yok.</div>'}
    </div>`;
  const save=$('#stSave');
  const refresh=()=>{
    const dirty=SETTING_DEFS.filter(d=>+document.querySelector(`.stIn[data-k=${d.key}]`).value!==settingsData[d.key]);
    save.disabled=!dirty.length;save.style.opacity=dirty.length?'1':'.5';
    $('#stDirty').textContent=dirty.length?dirty.length+' kaydedilmemiş değişiklik':'';
    return dirty;
  };
  document.querySelectorAll('.stIn').forEach(inp=>inp.oninput=refresh);
  $('#stReset').onclick=()=>renderSettings();
  save.onclick=()=>{
    const dirty=refresh();if(!dirty.length)return;
    const bg=document.createElement('div');bg.className='modal-bg';bg.id='stModal';
    bg.innerHTML=`<div class="modal" style="width:430px;">
      <div class="modal-head">⚠ Sistem ayarı değişikliği — onay</div>
      <div class="modal-body">
        <div style="font-size:12px;margin-bottom:10px;">Bu değişiklikler <b>Türkiye'deki tüm mağaza ve rutları</b> etkiler:</div>
        ${dirty.map(d=>{const nv=+document.querySelector(`.stIn[data-k=${d.key}]`).value;
          return `<div class="chg-item"><span>${d.label}</span><b>${settingsData[d.key]} → ${nv}</b></div>`;}).join('')}
        <div style="font-size:11px;color:var(--tx3);margin-top:8px;">Kayda geçecek: ${CURRENT_USER} · ${new Date().toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})}</div>
      </div>
      <div class="modal-foot">
        <button onclick="document.getElementById('stModal').remove()">Vazgeç</button>
        <button class="primary" id="stConfirm">Onayla ve uygula</button>
      </div></div>`;
    document.body.appendChild(bg);
    $('#stConfirm').onclick=()=>{
      const at=new Date().toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'});
      for(const d of dirty){
        const nv=+document.querySelector(`.stIn[data-k=${d.key}]`).value;
        settingsLog.push({label:d.label,from:settingsData[d.key],to:nv,who:CURRENT_USER,at});
        settingsData[d.key]=nv;
      }
      QUOTA=settingsData.quota;
      bg.remove();renderSettings();renderAll();
      toast('Ayarlar uygulandı ve denetim kaydına yazıldı',[]);
    };
  };
}
/* v0.5.6: Sorunlar sekmesi — eski Sorun Merkezi içeriği. Satıra tıkla →
   planlayıcıya dön + soruna atla; ⚡ aynı-kişi kaydırma; ✨ Onarım tezgâhı. */
function renderInboxIssues(el){
  const grp=[['err','🔴 Hatalar — yayın için gerekçe ister'],['warn','🟡 Uyarılar — izinli, gözden geçir'],['info','🔵 Bilgi']];
  el.innerHTML=(curIssues.length?grp.map(([sev,ttl])=>{
    const list=curIssues.filter(i=>i.sev===sev);
    return list.length?`<div style="font-size:11px;font-weight:700;margin:8px 0 4px;">${ttl} (${list.length})</div>`+
      list.map(i=>`<div class="cc-item" data-i="${curIssues.indexOf(i)}">
        <span class="sev">${sev==='err'?'🔴':sev==='warn'?'🟡':'🔵'}</span><span>${i.msg}</span>
        ${i.fix==='day'?`<span class="fix" data-fix="${curIssues.indexOf(i)}">⚡ Otomatik düzelt</span>`:i.fix==='repair'?`<span class="fix" data-rep="1">✨ Onarım</span>`:''}
      </div>`).join(''):'';
  }).join(''):'<div style="color:var(--tx3);font-size:12px;padding:10px;">✓ Sorun yok — plan temiz.</div>')+
  `<div style="font-size:10.5px;color:var(--tx3);margin-top:8px;">Satıra tıkla → planlayıcıda soruna atlar. Hatalar yayını durdurmaz — Yayınla ekranında gerekçe istenir ve Karar Günlüğü'ne yazılır.</div>`;
  el.querySelectorAll('.cc-item').forEach(el2=>el2.onclick=e=>{
    const i=curIssues[+el2.dataset.i];
    if(e.target.dataset.fix!==undefined&&e.target.dataset.fix!==''){showPage('planner');autoFixDay(i.personId,i.day);return;}
    if(e.target.dataset.rep){
      const di=repairDisruptions().findIndex(d2=>(d2.k==='leave'&&i.personId===d2.id)||(d2.k==='closed'&&i.storeId===d2.id));
      showPage('planner');openRepair(di>=0?di:undefined);return;
    }
    showPage('planner');
    if(i.visitId){const v=visits.find(x=>x.id===i.visitId);if(v){setFocus({type:'store',id:v.storeId});renderAll();requestAnimationFrame(()=>scrollToVisit(i.visitId));}}
    else if(i.personId!=null&&i.day!=null){const dv=dayVisits(i.personId,i.day);if(dv.length){setFocus({type:'store',id:dv[0].storeId});renderAll();requestAnimationFrame(()=>scrollToVisit(dv[0].id));}}
    else if(i.storeId){setFocus({type:'store',id:i.storeId});renderAll();requestAnimationFrame(()=>scrollToStore(i.storeId));}
  });
}
function renderInbox(){
  const el=$('#inboxBody');
  computeIssues();
  const open=inboxData.filter(i=>i.status==='open').length;
  $('#inboxCount').textContent=open;
  /* v0.5.6: iki sekme — Saha (mesaj/talep/geciken) + Sorunlar (hata/uyarı/bilgi) */
  const e=curIssues.filter(i=>i.sev==='err').length,wn=curIssues.filter(i=>i.sev==='warn').length,inf=curIssues.filter(i=>i.sev==='info').length;
  const tabs=$('#inboxTabs');
  tabs.innerHTML=`<div class="${inboxTab==='field'?'on':''}" data-t="field">💬 Saha${open?` (${open})`:''}</div>
    <div class="${inboxTab==='issues'?'on':''}" data-t="issues">⚠ Sorunlar${e?` 🔴${e}`:''}${wn?` 🟡${wn}`:''}${!e&&!wn&&inf?` 🔵${inf}`:''}</div>`;
  tabs.querySelectorAll('div').forEach(t=>t.onclick=()=>{inboxTab=t.dataset.t;renderInbox();});
  if(inboxTab==='issues'){renderInboxIssues(el);return;}
  el.innerHTML=inboxData.map(i=>{
    const s=i.anchor?store(i.anchor):null;
    return `<div class="inbox-item ${i.status==='done'?'done':''}">
      <div style="font-size:15px;">${i.type.split(' ')[0]}</div>
      <div class="bd">
        <span class="who">${i.who}</span> · <span style="color:var(--tx3);font-size:11px;">${i.type.split(' ')[1]||''}</span><br>
        ${i.txt}<br>
        ${s?`<span class="anchor" data-s="${s.id}">📍 ${s.name} — bağlama git</span>`:''}
      </div>
      <div class="acts">
        ${i.apply&&i.status==='open'?`<button class="applyBtn" data-id="${i.id}" style="background:var(--blue-l);color:var(--blue-d);border-color:var(--blue-d);">Uygula (${i.apply.dur}dk)</button>`:''}
        ${i.status==='open'?`<button class="doneBtn" data-id="${i.id}">Çözüldü</button>`:'<span style="font-size:11px;color:var(--tx3);">kapatıldı</span>'}
      </div>
    </div>`;
  }).join('')+`<div style="font-size:11px;color:var(--tx3);margin-top:8px;">Saha temsilcileri not/talep yazabilir ama planı düzenleyemez. Talebi uygulamak süpervizörün tek tıkı — değişiklik normal taslak akışına girer (Yayınla gerekir).</div>`;
  el.querySelectorAll('.anchor').forEach(a=>a.onclick=()=>{
    const s=store(a.dataset.s);
    if(s&&s.route)expandedRoutes.add(s.route);
    setFocus({type:'store',id:a.dataset.s});
    showPage('planner');
  });
  el.querySelectorAll('.doneBtn').forEach(b=>b.onclick=()=>{
    inboxData.find(x=>x.id===b.dataset.id).status='done';if(window.__evoResolveNote)window.__evoResolveNote(b.dataset.id);renderInbox();
  });
  el.querySelectorAll('.applyBtn').forEach(b=>b.onclick=()=>{
    const i=inboxData.find(x=>x.id===b.dataset.id);
    const s=store(i.apply.store);
    applyDur(x=>x.storeId===i.apply.store,i.apply.dur,`${s.name} → ${i.apply.dur}dk (talep: ${i.who})`);
    i.status='done';renderInbox();
    toast(`Talep uygulandı — Yayınla (${changes.length}) ile sahaya gider`,[]);
  });
}
function renderAll(){renderHeader();renderRail();renderMap();renderSched();renderPanel();renderStatus();renderActionBar();renderTable();renderDraftBanner();
  $('#inboxCount').textContent=inboxData.filter(i=>i.status==='open').length;}
renderAll();

/* ==== EVO host bridge (appended; not part of the prototype) ====
   Runs in the engine's top-level scope, so it can mutate the prototype's const arrays
   (people/routes/stores — in place) and reassign its let state (visits/baseVisits/weekData/…).
   The React backend bridge calls window.__evoLoadData(...) with mapped backend data; the
   prototype's own changes[] buffer still gates every commit behind Yayınla. */
window.__EVO_BOOTED__ = true;
window.__evoRenderAll = (typeof renderAll === 'function') ? renderAll : function(){};

window.__evoLoadData = function (d) {
  try {
    if (d.people) { people.length = 0; for (const p of d.people) people.push(p); }
    if (d.routes) { routes.length = 0; for (const r of d.routes) routes.push(r); }
    if (d.stores) { stores.length = 0; for (const s of d.stores) stores.push(s); }
    if (d.visits) {
      visits = d.visits;
      baseVisits = JSON.parse(JSON.stringify(d.visits));
      weekData = {}; weekData[currentWeek] = visits;
    }
    if (typeof d.quota === 'number') QUOTA = d.quota;
    // Snapshot the loaded plan so the publish bridge can diff current-vs-loaded and emit the
    // matching backend mutations on Yayınla (resize -> UpdateStop, move -> Patch).
    window.__evoSnapshot = {
      visits: JSON.parse(JSON.stringify(d.visits || [])),
      storeRoute: (d.stores || []).reduce(function (m, s) { m[s.id] = s.route || null; return m; }, {}),
      routePerson: (d.routes || []).reduce(function (m, r) { m[r.id] = r.person || null; return m; }, {}),
      routeMeta: (d.routes || []).reduce(function (m, r) { m[r.id] = { name: r.name, target: r.target, active: r.active !== false }; return m; }, {}),
      storeSchedule: (d.stores || []).reduce(function (m, s) { if (s.stopId) m[s.id] = { stopId: s.stopId, freqNum: s.freqNum, weekdayMask: s.weekdayMask, route: s.route || null }; return m; }, {}),
      storeActive: (d.stores || []).reduce(function (m, s) { m[s.id] = s.active !== false; return m; }, {}),
      weekFrom: d.weekFrom || null,
      weekTo: d.weekTo || null,
    };
    // Clear the prototype's remaining mock seed data — there is no fake task/rule/inbox data left;
    // the app shows only what the backend provides. (taskTemplates/typeRules have no list endpoint
    // yet, so they go empty; inbox comes from d.notes = GET /notes.)
    taskTemplates = [];
    typeRules = {};
    inboxData = Array.isArray(d.notes) ? d.notes : [];
    var ic = document.getElementById('inboxCount');
    if (ic) ic.textContent = String(inboxData.filter(function (x) { return x.status === 'open'; }).length);
    // Reset transient UI/edit state so a data (re)load starts clean.
    filter = null; focus = null; selection = new Set(); changes = []; expandedRoutes = new Set();
    if (typeof d.weekLabel === 'string') { window.__evoWeekLabelText = d.weekLabel; }
    if (typeof renderAll === 'function') renderAll();
  } catch (e) { console.error('[evo] __evoLoadData', e); }
};

// Read-only view of engine state for the publish bridge (runs in engine scope, so the live
// let-bindings for visits/stores/routes are captured, not stale copies).
window.__evoState = function () {
  return { visits: visits, baseVisits: baseVisits, stores: stores, routes: routes, people: people, currentWeek: currentWeek, filter: filter, focus: focus, selection: selection, panelTab: panelTab };
};

// Post-render hook: after renderPanel paints, let the tasks bridge swap the store Görevler tab
// for a backend-driven list (GET /stores/{id}/task-plan). Wrap the function binding — callers
// reference renderPanel by name at runtime, so they pick up the wrapper.
if (typeof renderPanel === 'function') {
  var __evoOrigRenderPanel = renderPanel;
  renderPanel = function () {
    __evoOrigRenderPanel.apply(this, arguments);
    try { if (window.__evoAfterPanel) window.__evoAfterPanel(); } catch (e) { console.error('[evo] afterPanel', e); }
  };
}

// Focus a store in the detail panel (used by the MapLibre pin click — the prototype's own
// SVG showPopover doesn't apply once the real map replaces the SVG).
window.__evoFocusStore = function (id) {
  try {
    if (typeof store === 'function' && !store(id)) return;
    focus = { type: 'store', id: id };
    panelTab = 'info';
    if (typeof renderAll === 'function') renderAll();
  } catch (e) { console.error('[evo] focusStore', e); }
};

// L4 schedule-days LIVE preview: toggle a routed store's visit day on/off and reconcile the live
// visits[] so the calendar updates immediately — the store's weekdayMask alone doesn't drive
// rendering (visits[] does). Runs in engine scope so it can reassign visits/baseVisits and reuse the
// prototype's own V/reflow/dayVisits helpers, exactly like moveStoreTo. Buffered via logChange (undo
// restores the prior visits snapshot); persisted to the backend on Yayınla by the publish bridge.
window.__evoToggleStoreDay = function (sid, i) {
  try {
    var s = stores.find(function (x) { return x.id === sid; });
    if (!s || !s.route) return;
    var r = route(s.route);
    var pid = r && r.person;
    var prevMask = (typeof s.weekdayMask === 'number') ? s.weekdayMask : null;
    var prevFreq = (typeof s.freqNum === 'number') ? s.freqNum : null;
    // Derive the current mask from the LIVE visits (the calendar's source of truth), not the stored
    // weekdayMask — so a chip click after a scheduler drag operates on what's actually shown.
    var curMask = 0;
    for (var dd = 0; dd < 5; dd++) { if (visits.some(function (v) { return v.storeId === sid && v.day === dd; })) curMask |= (1 << dd); }
    var newMask = curMask ^ (1 << i);
    // Snapshot this store's visits for a faithful undo (moveStoreTo pattern).
    var oldV = visits.filter(function (v) { return v.storeId === sid; }).map(function (v) { return Object.assign({}, v); });
    var oldB = baseVisits.filter(function (v) { return v.storeId === sid; }).map(function (v) { return Object.assign({}, v); });
    s.freqNum = 2; // days now drive it -> Weekly
    s.weekdayMask = newMask;
    var dur = storeDur(s) || 45;
    var touched = {};
    for (var d = 0; d < 5; d++) {
      var want = (newMask & (1 << d)) !== 0;
      var has = visits.some(function (v) { return v.storeId === sid && v.day === d; });
      if (pid && want && !has) {
        var dv = dayVisits(pid, d);
        var start = dv.length ? dv[dv.length - 1].start + dv[dv.length - 1].dur : DAY_START;
        var nv = V(sid, pid, d, skipBreaks(start), dur);
        visits.push(nv);
        baseVisits.push(Object.assign({}, nv));
        touched[d] = 1;
      } else if (!want && has) {
        visits = visits.filter(function (v) { return !(v.storeId === sid && v.day === d); });
        baseVisits = baseVisits.filter(function (v) { return !(v.storeId === sid && v.day === d); });
        touched[d] = 1;
      }
    }
    if (pid) { Object.keys(touched).forEach(function (d) { reflow(pid, +d); }); }
    clearFutureWeeks();
    var names = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum'];
    var lbl = names.filter(function (_, k) { return (newMask & (1 << k)) !== 0; }).join(', ') || 'yok';
    logChange(s.name + ': ziyaret günleri → ' + lbl, pid || null, null, function () {
      s.weekdayMask = prevMask;
      s.freqNum = prevFreq;
      visits = visits.filter(function (v) { return v.storeId !== sid; }).concat(oldV.map(function (v) { return Object.assign({}, v); }));
      baseVisits = baseVisits.filter(function (v) { return v.storeId !== sid; }).concat(oldB.map(function (v) { return Object.assign({}, v); }));
      clearFutureWeeks();
    });
  } catch (e) { console.error('[evo] toggleStoreDay', e); }
};

if (typeof window.__evoOnBoot === 'function') { try { window.__evoOnBoot(); } catch (e) { console.error('[evo] onBoot', e); } }
