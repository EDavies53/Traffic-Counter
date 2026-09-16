(() => {
  "use strict";

  const COUNT_TYPES = ["cars", "hgv", "pedestrians", "cycles"];
  const DB_NAME = "TrafficCountSimpleDB";
  const DB_VERSION = 1;
  const STORE_NAME = "surveys";
  const DURATION = 180;

  let db = null;
  let timerHandle = null;
  let endTime = 0;

  const state = {
    mode: "one",
    running: false,
    paused: false,
    finished: false,
    remaining: DURATION,
    elapsed: 0,
    date: "",
    startTime: "",
    directionNames: {
      1: "Eastbound",
      2: "Westbound"
    },
    counts: {
      1: { cars: 0, hgv: 0, pedestrians: 0, cycles: 0 },
      2: { cars: 0, hgv: 0, pedestrians: 0, cycles: 0 }
    }
  };

  const el = id => document.getElementById(id);

  function formatTime(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    return String(Math.floor(safe / 60)).padStart(2, "0") + ":" +
           String(safe % 60).padStart(2, "0");
  }

  function dateText() {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit", month: "2-digit", year: "numeric"
    }).format(new Date());
  }

  function timeText() {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).format(new Date());
  }

  function directionTotal(direction) {
    return COUNT_TYPES.reduce((sum, type) => sum + state.counts[direction][type], 0);
  }

  function allTotal(type) {
    return state.counts[1][type] + state.counts[2][type];
  }

  function message(text) {
    el("message").textContent = text;
    clearTimeout(message.timer);
    message.timer = setTimeout(() => { el("message").textContent = ""; }, 3500);
  }

  function render() {
    el("timer").textContent = formatTime(state.remaining);
    el("timerStatus").textContent =
      state.finished ? "Count complete" :
      state.running ? "Counting..." :
      state.paused ? "Paused" : "Ready";

    el("surveyDate").textContent = state.date || "Not started";
    el("surveyStart").textContent = state.startTime || "Not started";

    el("oneDirectionButton").classList.toggle("active", state.mode === "one");
    el("twoDirectionButton").classList.toggle("active", state.mode === "two");
    el("direction2").classList.toggle("hidden", state.mode !== "two");
    el("directions").classList.toggle("two", state.mode === "two");

    el("direction1Name").value = state.directionNames[1];
    el("direction2Name").value = state.directionNames[2];

    [1, 2].forEach(direction => {
      COUNT_TYPES.forEach(type => {
        el("d" + direction + type).textContent = state.counts[direction][type];
      });
      el("direction" + direction + "Total").textContent = directionTotal(direction);
    });

    el("totalCars").textContent = allTotal("cars");
    el("totalHgv").textContent = allTotal("hgv");
    el("totalPedestrians").textContent = allTotal("pedestrians");
    el("totalCycles").textContent = allTotal("cycles");

    el("startButton").disabled = state.running || state.finished;
    el("pauseButton").disabled = !state.running;
    el("startButton").textContent = state.paused ? "RESUME" : "START 3:00";
  }

  function startTimer() {
    if (state.finished) return;

    if (!state.paused) {
      state.date = dateText();
      state.startTime = timeText();
      state.elapsed = 0;
      state.remaining = DURATION;
    }

    state.running = true;
    state.paused = false;
    endTime = Date.now() + state.remaining * 1000;

    clearInterval(timerHandle);
    timerHandle = setInterval(updateTimer, 100);
    updateTimer();
  }

  function updateTimer() {
    if (!state.running) return;

    const remainingMs = Math.max(0, endTime - Date.now());
    state.remaining = Math.ceil(remainingMs / 1000);
    state.elapsed = DURATION - state.remaining;

    if (remainingMs <= 0) {
      finishTimer();
    }

    render();
  }

  function pauseTimer() {
    if (!state.running) return;
    updateTimer();
    state.running = false;
    state.paused = true;
    clearInterval(timerHandle);
    timerHandle = null;
    render();
  }

  function finishTimer() {
    clearInterval(timerHandle);
    timerHandle = null;
    state.running = false;
    state.paused = false;
    state.finished = true;
    state.remaining = 0;
    state.elapsed = DURATION;
    if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
    message("3-minute count complete.");
    render();
  }

  function resetSurvey(confirmReset) {
    if (confirmReset && !window.confirm("Reset this survey? Unsaved counts will be lost.")) return;

    clearInterval(timerHandle);
    timerHandle = null;

    state.mode = "one";
    state.running = false;
    state.paused = false;
    state.finished = false;
    state.remaining = DURATION;
    state.elapsed = 0;
    state.date = "";
    state.startTime = "";
    state.directionNames[1] = "Eastbound";
    state.directionNames[2] = "Westbound";
    COUNT_TYPES.forEach(type => {
      state.counts[1][type] = 0;
      state.counts[2][type] = 0;
    });

    el("siteReference").value = "";
    el("address").value = "";
    el("notes").value = "";
    render();
  }

  function countTraffic(direction, type) {
    if (!state.running) {
      message("Start the 3-minute count before recording traffic.");
      return;
    }
    state.counts[direction][type] += 1;
    render();
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = event => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = event => {
        db = event.target.result;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  function getSurveys() {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  function putSurvey(survey) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(survey);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function deleteSurvey(id) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function collectSurvey() {
    return {
      id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
      savedAt: new Date().toISOString(),
      siteReference: el("siteReference").value.trim(),
      address: el("address").value.trim(),
      notes: el("notes").value.trim(),
      date: state.date || dateText(),
      startTime: state.startTime,
      mode: state.mode,
      directionNames: { 1: state.directionNames[1], 2: state.directionNames[2] },
      counts: {
        1: { ...state.counts[1] },
        2: { ...state.counts[2] }
      }
    };
  }

  async function saveSurvey() {
    if (!db) {
      message("Local saving is unavailable in this browser.");
      return;
    }

    state.directionNames[1] = el("direction1Name").value.trim() || "Direction 1";
    state.directionNames[2] = el("direction2Name").value.trim() || "Direction 2";

    const survey = collectSurvey();

    if (!survey.siteReference && !survey.address) {
      message("Enter a site reference or address before saving.");
      return;
    }

    try {
      await putSurvey(survey);
      await renderSavedSurveys();
      message("Survey saved on this device.");
    } catch (error) {
      console.error(error);
      message("Could not save the survey.");
    }
  }

  async function renderSavedSurveys() {
    const container = el("savedSurveys");
    const surveys = (await getSurveys()).sort((a, b) => b.savedAt.localeCompare(a.savedAt));

    if (!surveys.length) {
      container.innerHTML = '<p class="empty">No saved surveys.</p>';
      return;
    }

    container.innerHTML = "";

    surveys.forEach(survey => {
      const wrapper = document.createElement("div");
      wrapper.className = "saved-item";

      const info = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = survey.siteReference || "Unnamed survey";
      const details = document.createElement("small");
      const total = COUNT_TYPES.reduce((sum, type) =>
        sum + survey.counts[1][type] + survey.counts[2][type], 0);
      details.textContent = (survey.address || "No address") + " · " + survey.date + " · " + total + " counted";
      info.append(title, details);

      const actions = document.createElement("div");
      actions.className = "saved-item-actions";

      const load = document.createElement("button");
      load.className = "secondary";
      load.type = "button";
      load.textContent = "LOAD";
      load.addEventListener("click", () => loadSurvey(survey));

      const remove = document.createElement("button");
      remove.className = "danger";
      remove.type = "button";
      remove.textContent = "DELETE";
      remove.addEventListener("click", async () => {
        if (!window.confirm("Delete this saved survey?")) return;
        await deleteSurvey(survey.id);
        await renderSavedSurveys();
        message("Survey deleted.");
      });

      actions.append(load, remove);
      wrapper.append(info, actions);
      container.append(wrapper);
    });
  }

  function loadSurvey(survey) {
    clearInterval(timerHandle);
    timerHandle = null;

    el("siteReference").value = survey.siteReference || "";
    el("address").value = survey.address || "";
    el("notes").value = survey.notes || "";

    state.mode = survey.mode === "two" ? "two" : "one";
    state.running = false;
    state.paused = false;
    state.finished = false;
    state.remaining = DURATION;
    state.elapsed = 0;
    state.date = survey.date || "";
    state.startTime = survey.startTime || "";
    state.directionNames[1] = survey.directionNames?.[1] || "Eastbound";
    state.directionNames[2] = survey.directionNames?.[2] || "Westbound";

    COUNT_TYPES.forEach(type => {
      state.counts[1][type] = Number(survey.counts?.[1]?.[type]) || 0;
      state.counts[2][type] = Number(survey.counts?.[2]?.[type]) || 0;
    });

    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    message("Survey loaded.");
  }

  function csvValue(value) {
    return '"' + String(value ?? "").replace(/"/g, '""') + '"';
  }

  async function exportCsv() {
    if (!db) {
      message("Local saving is unavailable in this browser.");
      return;
    }

    const surveys = (await getSurveys()).sort((a, b) => a.savedAt.localeCompare(b.savedAt));

    if (!surveys.length) {
      message("There are no saved surveys to export.");
      return;
    }

    const headers = [
      "Site Reference", "Address", "Notes", "Direction Mode",
      "Direction 1", "Direction 2", "Date", "Start Time",
      "Direction 1 Cars", "Direction 1 HGVs", "Direction 1 Pedestrians", "Direction 1 Cycles",
      "Direction 2 Cars", "Direction 2 HGVs", "Direction 2 Pedestrians", "Direction 2 Cycles"
    ];

    const rows = surveys.map(s => [
      s.siteReference, s.address, s.notes, s.mode,
      s.directionNames?.[1] || "", s.directionNames?.[2] || "",
      s.date, s.startTime,
      s.counts[1].cars, s.counts[1].hgv, s.counts[1].pedestrians, s.counts[1].cycles,
      s.counts[2].cars, s.counts[2].hgv, s.counts[2].pedestrians, s.counts[2].cycles
    ].map(csvValue).join(","));

    const blob = new Blob(["\uFEFF" + [headers.map(csvValue).join(","), ...rows].join("\r\n")],
      { type: "text/csv;charset=utf-8" });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "traffic-surveys.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function bindEvents() {
    el("startButton").addEventListener("click", startTimer);
    el("pauseButton").addEventListener("click", pauseTimer);
    el("resetButton").addEventListener("click", () => resetSurvey(true));

    el("oneDirectionButton").addEventListener("click", () => {
      state.mode = "one";
      render();
    });

    el("twoDirectionButton").addEventListener("click", () => {
      state.mode = "two";
      render();
    });

    el("direction1Name").addEventListener("input", event => {
      state.directionNames[1] = event.target.value;
    });

    el("direction2Name").addEventListener("input", event => {
      state.directionNames[2] = event.target.value;
    });

    document.querySelectorAll(".traffic").forEach(button => {
      button.addEventListener("click", () => {
        countTraffic(Number(button.dataset.direction), button.dataset.type);
      });
    });

    el("saveButton").addEventListener("click", saveSurvey);
    el("newButton").addEventListener("click", () => resetSurvey(true));
    el("exportButton").addEventListener("click", exportCsv);
  }

  async function init() {
    bindEvents();
    render();

    try {
      await openDatabase();
      await renderSavedSurveys();
    } catch (error) {
      console.error(error);
      message("Device saving is unavailable in this browser.");
    }
  }

  init();
})();
