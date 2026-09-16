const DB_NAME = "TrafficCountDB";
const DB_VERSION = 1;
const STORE = "surveys";
const COUNT_TYPES = ["Cars", "HGVs", "Pedestrians", "Cycles"];

let state = {
  siteRef: "", address: "", notes: "", date: "", startTime: "",
  elapsedSeconds: 0, remaining: 180, running: false, paused: false, finished: false,
  directionMode: "one",
  directionNames: {"Direction 1":"Eastbound","Direction 2":"Westbound"},
  counts: {
    "Direction 1": {Cars:0,HGVs:0,Pedestrians:0,Cycles:0},
    "Direction 2": {Cars:0,HGVs:0,Pedestrians:0,Cycles:0}
  }
};
let timerId = null;
let db = null;

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2,"0");
const formatTime = s => `${pad(Math.floor(Math.max(0,s)/60))}:${pad(Math.max(0,s)%60)}`;
const today = () => new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date());
const nowTime = () => new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date());
const totalForDirection = d => COUNT_TYPES.reduce((n,t)=>n+state.counts[d][t],0);
const totalForType = t => state.counts["Direction 1"][t]+state.counts["Direction 2"][t];

function showMessage(text){
  $("message").textContent=text;
  clearTimeout(showMessage.timer);
  showMessage.timer=setTimeout(()=>$("message").textContent="",3500);
}
function syncInputs(){
  state.siteRef=$("siteRef").value.trim();
  state.address=$("address").value.trim();
  state.notes=$("notes").value.trim();
}
function render(){
  $("timer").textContent=formatTime(state.remaining);
  $("status").textContent=state.finished?"Count complete":state.running?"Counting...":state.paused?"Paused":"Ready to start";
  $("dateDisplay").textContent=state.date||"-";
  $("timeDisplay").textContent=state.startTime||"Not started";

  document.querySelectorAll(".mode-btn").forEach(b=>b.classList.toggle("active",b.dataset.mode===state.directionMode));
  $("directionPanels").classList.toggle("two",state.directionMode==="two");
  document.querySelector(".second-panel").classList.toggle("hidden",state.directionMode!=="two");

  document.querySelectorAll(".direction-name").forEach(i=>i.value=state.directionNames[i.dataset.directionName]||"");
  document.querySelectorAll("[data-count]").forEach(el=>{
    const [d,t]=el.dataset.count.split("-");
    el.textContent=state.counts[d][t];
  });
  document.querySelectorAll(".panel-total").forEach(el=>el.textContent=totalForDirection(el.dataset.panelTotal));

  COUNT_TYPES.forEach(t=>{
    const id=t.toLowerCase();
    const allId="all"+id.charAt(0).toUpperCase()+id.slice(1);
    $(allId).textContent=totalForType(t);
  });
  $("startBtn").disabled=state.running||state.finished;
  $("pauseBtn").disabled=!state.running;
  $("startBtn").textContent=state.paused?"RESUME":"START 3:00";
}
function startTimer(){
  syncInputs();
  if(!state.running&&!state.paused&&!state.finished){state.date=today();state.startTime=nowTime();}
  state.running=true;state.paused=false;
  clearInterval(timerId);
  timerId=setInterval(()=>{
    state.elapsedSeconds++;
    state.remaining=Math.max(0,180-state.elapsedSeconds);
    if(state.remaining===0) finishTimer();
    render();
  },1000);
  render();
}
function pauseTimer(){
  if(!state.running)return;
  state.running=false;state.paused=true;clearInterval(timerId);render();
}
function finishTimer(){
  clearInterval(timerId);state.running=false;state.paused=false;state.finished=true;state.remaining=0;render();
  if(navigator.vibrate)navigator.vibrate([150,80,150]);
  showMessage("3-minute count complete.");
}
function resetSurvey(confirmIt=true){
  if(confirmIt&&!confirm("Reset this survey? Unsaved counts will be lost."))return;
  clearInterval(timerId);
  state={
    siteRef:"",address:"",notes:"",date:"",startTime:"",elapsedSeconds:0,remaining:180,
    running:false,paused:false,finished:false,directionMode:"one",
    directionNames:{"Direction 1":"Eastbound","Direction 2":"Westbound"},
    counts:{"Direction 1":{Cars:0,HGVs:0,Pedestrians:0,Cycles:0},"Direction 2":{Cars:0,HGVs:0,Pedestrians:0,Cycles:0}}
  };
  render();
}
function increment(direction,type){
  if(!state.running){showMessage("Start the 3-minute count before recording traffic.");return;}
  state.counts[direction][type]++;
  render();
}
function openDb(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,DB_VERSION);
    r.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:"id"});};
    r.onsuccess=e=>{db=e.target.result;resolve(db);};
    r.onerror=()=>reject(r.error);
  });
}
function dbPut(s){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(s);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
}
function dbGetAll(){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readonly"),r=tx.objectStore(STORE).getAll();
    r.onsuccess=()=>resolve(r.result.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)));
    r.onerror=()=>reject(r.error);
  });
}
function dbDelete(id){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(id);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
}
function makeSurvey(){
  syncInputs();
  return {
    id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),savedAt:new Date().toISOString(),
    siteRef:state.siteRef,address:state.address,notes:state.notes,date:state.date||today(),startTime:state.startTime||"",
    durationSeconds:Math.min(180,state.elapsedSeconds),completed:state.finished,
    directionMode:state.directionMode,directionNames:{...state.directionNames},counts:JSON.parse(JSON.stringify(state.counts))
  };
}
async function saveSurvey(){
  const s=makeSurvey();
  if(!s.siteRef&&!s.address){showMessage("Enter a site reference or address before saving.");return;}
  await dbPut(s);await renderSaved();showMessage("Survey saved to this device.");
}
async function loadSurvey(id){
  const s=(await dbGetAll()).find(x=>x.id===id);if(!s)return;
  clearInterval(timerId);
  state={
    siteRef:s.siteRef||"",address:s.address||"",notes:s.notes||"",date:s.date||"",startTime:s.startTime||"",
    elapsedSeconds:Math.min(180,Number(s.durationSeconds)||0),remaining:Math.max(0,180-(Number(s.durationSeconds)||0)),
    running:false,paused:false,finished:!!s.completed,directionMode:s.directionMode||"one",
    directionNames:s.directionNames||{"Direction 1":"Eastbound","Direction 2":"Westbound"},counts:s.counts
  };
  render();scrollTo({top:0,behavior:"smooth"});showMessage("Survey loaded.");
}
function csvCell(v){return `"${String(v??"").replace(/"/g,'""')}"`;}
async function exportCsv(){
  const surveys=await dbGetAll();if(!surveys.length){showMessage("There are no saved surveys to export.");return;}
  const header=["Site Reference","Address","Notes","Direction Mode","Direction 1","Direction 2","Date","Start Time","Duration (s)","Direction 1 Cars","Direction 1 HGVs","Direction 1 Pedestrians","Direction 1 Cycles","Direction 2 Cars","Direction 2 HGVs","Direction 2 Pedestrians","Direction 2 Cycles","Total Cars","Total HGVs","Total Pedestrians","Total Cycles","Grand Total"];
  const rows=surveys.map(s=>{
    const d1=s.counts["Direction 1"],d2=s.counts["Direction 2"];
    const vals=[s.siteRef,s.address,s.notes,s.directionMode||"one",s.directionNames?.["Direction 1"]||"Eastbound",s.directionNames?.["Direction 2"]||"Westbound",s.date,s.startTime,s.durationSeconds,d1.Cars,d1.HGVs,d1.Pedestrians,d1.Cycles,d2.Cars,d2.HGVs,d2.Pedestrians,d2.Cycles,...COUNT_TYPES.map(t=>(d1[t]||0)+(d2[t]||0)),COUNT_TYPES.reduce((n,t)=>n+(d1[t]||0)+(d2[t]||0),0)];
    return vals.map(csvCell).join(",");
  });
  const blob=new Blob(["\uFEFF"+[header.map(csvCell).join(","),...rows].join("\r\n")],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a"),url=URL.createObjectURL(blob);a.href=url;a.download=`traffic-surveys-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function renderSaved(){
  const surveys=await dbGetAll(),list=$("savedList");
  if(!surveys.length){list.innerHTML='<div class="empty">No saved surveys yet.</div>';return;}
  list.innerHTML=surveys.map(s=>{
    const total=COUNT_TYPES.reduce((n,t)=>n+(s.counts["Direction 1"][t]||0)+(s.counts["Direction 2"][t]||0),0);
    return `<div class="saved-item"><div><strong>${String(s.siteRef||"Unnamed survey").replace(/[&<>"]/g,"")}</strong><small>${String(s.address||"No address").replace(/[&<>"]/g,"")} · ${s.date||""} · ${total} total</small></div><div class="saved-buttons"><button class="secondary load-btn" data-id="${s.id}" type="button">LOAD</button><button class="danger delete-btn" data-id="${s.id}" type="button">DELETE</button></div></div>`;
  }).join("");
}

document.addEventListener("DOMContentLoaded",async()=>{
  try{await openDb();await renderSaved();}catch(e){console.error(e);showMessage("Local storage could not be opened in this browser.");}
  render();
  ["siteRef","address","notes"].forEach(id=>$(id).addEventListener("input",syncInputs));
  $("startBtn").addEventListener("click",startTimer);
  $("pauseBtn").addEventListener("click",pauseTimer);
  $("resetBtn").addEventListener("click",()=>resetSurvey(true));
  $("saveBtn").addEventListener("click",saveSurvey);
  $("newBtn").addEventListener("click",()=>resetSurvey(true));
  $("exportAllBtn").addEventListener("click",exportCsv);
  document.querySelectorAll(".count-btn").forEach(btn=>btn.addEventListener("click",()=>increment(btn.dataset.direction,btn.dataset.type)));
  document.querySelectorAll(".mode-btn").forEach(btn=>btn.addEventListener("click",()=>{state.directionMode=btn.dataset.mode;render();}));
  document.querySelectorAll(".direction-name").forEach(input=>input.addEventListener("input",()=>{state.directionNames[input.dataset.directionName]=input.value.trim();}));
  $("savedList").addEventListener("click",async e=>{
    const load=e.target.closest(".load-btn"),del=e.target.closest(".delete-btn");
    if(load)await loadSurvey(load.dataset.id);
    if(del&&confirm("Delete this saved survey?")){await dbDelete(del.dataset.id);await renderSaved();showMessage("Survey deleted.");}
  });
  let deferredPrompt=null;
  addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;$("installBtn").classList.remove("hidden");});
  $("installBtn").addEventListener("click",async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$("installBtn").classList.add("hidden");});
  if("serviceWorker"in navigator)navigator.serviceWorker.register("service-worker.js").catch(console.error);
});
