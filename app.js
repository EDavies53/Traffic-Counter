const DB_NAME = "TrafficCountDB";
const DB_VERSION = 1;
const STORE = "surveys";
const COUNT_TYPES = ["Cars", "HGVs", "Pedestrians", "Cycles"];

let state = {
  siteRef: "",
  address: "",
  notes: "",
  date: "",
  startTime: "",
  elapsedSeconds: 0,
  remaining: 180,
  running: false,
  paused: false,
  finished: false,
  activeDirection: "Direction 1",
  counts: {
    "Direction 1": { Cars: 0, HGVs: 0, Pedestrians: 0, Cycles: 0 },
    "Direction 2": { Cars: 0, HGVs: 0, Pedestrians: 0, Cycles: 0 }
  }
};

let timerId = null;
let db = null;

const $ = id => document.getElementById(id);

function pad(n) { return String(n).padStart(2, "0"); }
function formatTime(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}
function today() {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric"
  }).format(new Date());
}
function nowTime() {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).format(new Date());
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}
function totalForDirection(direction) {
  return COUNT_TYPES.reduce((sum, type) => sum + state.counts[direction][type], 0);
}
function totalForType(type) {
  return state.counts["Direction 1"][type] + state.counts["Direction 2"][type];
}
function showMessage(text) {
  $("message").textContent = text;
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => $("message").textContent = "", 3500);
}

function render() {
  $("timer").textContent = formatTime(state.remaining);
  $("status").textContent =
    state.finished ? "Count complete" :
    state.running ? "Counting..." :
    state.paused ? "Paused" : "Ready to start";

  $("dateDisplay").textContent = state.date || "-";
  $("timeDisplay").textContent = state.startTime || "Not started";

  $("siteRef").value = state.siteRef;
  $("address").value = state.address;
  $("notes").value = state.notes;

  COUNT_TYPES.forEach(type => {
    const id = type.toLowerCase();
    $(id).textContent = state.counts[state.activeDirection][type];
    const allId = "all" + id.charAt(0).toUpperCase() + id.slice(1);
    $(allId).textContent = totalForType(type);
  });

  $("directionTotal").textContent = totalForDirection(state.activeDirection);

  document.querySelectorAll(".direction").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.direction === state.activeDirection);
  });

  $("startBtn").disabled = state.running || state.finished;
  $("pauseBtn").disabled = !state.running;
  $("startBtn").textContent = state.paused ? "RESUME" : "START 3:00";
}

function syncInputs() {
  state.siteRef = $("siteRef").value.trim();
  state.address = $("address").value.trim();
  state.notes = $("notes").value.trim();
}

function startTimer() {
  syncInputs();
  if (!state.running && !state.paused && !state.finished) {
    state.date = today();
    state.startTime = nowTime();
  }
  state.running = true;
  state.paused = false;
  clearInterval(timerId);
  timerId = setInterval(() => {
    state.elapsedSeconds++;
    state.remaining = Math.max(0, 180 - state.elapsedSeconds);
    if (state.remaining <= 0) finishTimer();
    render();
  }, 1000);
  render();
}

function pauseTimer() {
  if (!state.running) return;
  state.running = false;
  state.paused = true;
  clearInterval(timerId);
  render();
}

function finishTimer() {
  clearInterval(timerId);
  state.running = false;
  state.paused = false;
  state.finished = true;
  state.remaining = 0;
  render();
  if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
  showMessage("3-minute count complete.");
}

function resetSurvey(confirmIt = true) {
  if (confirmIt && !window.confirm("Reset this survey? Unsaved counts will be lost.")) return;
  clearInterval(timerId);
  state = {
    siteRef: "",
    address: "",
    notes: "",
    date: "",
    startTime: "",
    elapsedSeconds: 0,
    remaining: 180,
    running: false,
    paused: false,
    finished: false,
    activeDirection: "Direction 1",
    counts: {
      "Direction 1": { Cars: 0, HGVs: 0, Pedestrians: 0, Cycles: 0 },
      "Direction 2": { Cars: 0, HGVs: 0, Pedestrians: 0, Cycles: 0 }
    }
  };
  render();
}

function increment(type) {
  if (!state.running) {
    showMessage("Start the 3-minute count before recording traffic.");
    return;
  }
  state.counts[state.activeDirection][type]++;
  render();
}

function makeSurvey() {
  syncInputs();
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    savedAt: new Date().toISOString(),
    siteRef: state.siteRef,
    address: state.address,
    notes: state.notes,
    date: state.date || today(),
    startTime: state.startTime || "",
    durationSeconds: Math.min(180, state.elapsedSeconds),
    completed: state.finished,
    counts: JSON.parse(JSON.stringify(state.counts))
  };
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = e => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = e => { db = e.target.result; resolve(db); };
    request.onerror = () => reject(request.error);
  });
}

function dbPut(survey) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(survey);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function dbGetAll() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a,b) => b.savedAt.localeCompare(a.savedAt)));
    req.onerror = () => reject(req.error);
  });
}

function dbDelete(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function saveSurvey() {
  syncInputs();
  const survey = makeSurvey();
  if (!survey.siteRef && !survey.address) {
    showMessage("Enter a site reference or address before saving.");
    return;
  }
  await dbPut(survey);
  showMessage("Survey saved to this device.");
  renderSaved();
}

async function loadSurvey(id) {
  const surveys = await dbGetAll();
  const survey = surveys.find(s => s.id === id);
  if (!survey) return;

  clearInterval(timerId);
  state.siteRef = survey.siteRef || "";
  state.address = survey.address || "";
  state.notes = survey.notes || "";
  state.date = survey.date || "";
  state.startTime = survey.startTime || "";
  state.elapsedSeconds = Math.min(180, Number(survey.durationSeconds) || 0);
  state.remaining = Math.max(0, 180 - state.elapsedSeconds);
  state.running = false;
  state.paused = false;
  state.finished = !!survey.completed;
  state.activeDirection = "Direction 1";
  state.counts = survey.counts;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  showMessage("Survey loaded.");
}

async function renderSaved() {
  const surveys = await dbGetAll();
  const list = $("savedList");
  if (!surveys.length) {
    list.innerHTML = '<div class="empty">No saved surveys yet.</div>';
    return;
  }
  list.innerHTML = surveys.map(s => {
    const total = COUNT_TYPES.reduce((sum,t) =>
      sum + (s.counts["Direction 1"][t] || 0) + (s.counts["Direction 2"][t] || 0), 0);
    return `<div class="saved-item">
      <div>
        <strong>${escapeHtml(s.siteRef || "Unnamed survey")}</strong>
        <small>${escapeHtml(s.address || "No address")} · ${escapeHtml(s.date || "")} · ${total} total</small>
      </div>
      <div class="saved-buttons">
        <button class="secondary load-btn" data-id="${escapeHtml(s.id)}" type="button">LOAD</button>
        <button class="danger delete-btn" data-id="${escapeHtml(s.id)}" type="button">DELETE</button>
      </div>
    </div>`;
  }).join("");
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

async function exportCsv() {
  const surveys = await dbGetAll();
  if (!surveys.length) {
    showMessage("There are no saved surveys to export.");
    return;
  }
  const header = [
    "Site Reference","Address","Notes","Date","Start Time","Duration (s)",
    "Direction 1 Cars","Direction 1 HGVs","Direction 1 Pedestrians","Direction 1 Cycles",
    "Direction 2 Cars","Direction 2 HGVs","Direction 2 Pedestrians","Direction 2 Cycles",
    "Total Cars","Total HGVs","Total Pedestrians","Total Cycles","Grand Total"
  ];
  const rows = surveys.map(s => {
    const d1 = s.counts["Direction 1"], d2 = s.counts["Direction 2"];
    const vals = [
      s.siteRef,s.address,s.notes,s.date,s.startTime,s.durationSeconds,
      d1.Cars,d1.HGVs,d1.Pedestrians,d1.Cycles,
      d2.Cars,d2.HGVs,d2.Pedestrians,d2.Cycles,
      ...COUNT_TYPES.map(t => (d1[t]||0)+(d2[t]||0)),
      COUNT_TYPES.reduce((sum,t) => sum+(d1[t]||0)+(d2[t]||0),0)
    ];
    return vals.map(csvCell).join(",");
  });
  const blob = new Blob(["\uFEFF" + [header.map(csvCell).join(","), ...rows].join("\r\n")],
    { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `traffic-surveys-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await openDb();
    await renderSaved();
  } catch (err) {
    showMessage("Local storage could not be opened in this browser.");
    console.error(err);
  }

  render();

  ["siteRef","address","notes"].forEach(id => {
    $(id).addEventListener("input", syncInputs);
  });

  $("startBtn").addEventListener("click", startTimer);
  $("pauseBtn").addEventListener("click", pauseTimer);
  $("resetBtn").addEventListener("click", () => resetSurvey(true));
  $("saveBtn").addEventListener("click", saveSurvey);
  $("newBtn").addEventListener("click", () => resetSurvey(true));
  $("exportAllBtn").addEventListener("click", exportCsv);

  document.querySelectorAll(".count-btn").forEach(btn => {
    btn.addEventListener("click", () => increment(btn.dataset.type));
  });

  document.querySelectorAll(".direction").forEach(btn => {
    btn.addEventListener("click", () => {
      state.activeDirection = btn.dataset.direction;
      render();
    });
  });

  $("savedList").addEventListener("click", async e => {
    const load = e.target.closest(".load-btn");
    const del = e.target.closest(".delete-btn");
    if (load) await loadSurvey(load.dataset.id);
    if (del && window.confirm("Delete this saved survey?")) {
      await dbDelete(del.dataset.id);
      await renderSaved();
      showMessage("Survey deleted.");
    }
  });

  // PWA install support
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredPrompt = e;
    $("installBtn").classList.remove("hidden");
  });
  $("installBtn").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("installBtn").classList.add("hidden");
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(console.error);
  }
});
