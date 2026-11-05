/* 纯蓝 0x66CCFF：六轨分离 + 慢放练习（v1） */
(() => {
  const bridge = window.outside;
  if (!bridge) {
    document.body.innerHTML = "<p style='padding:24px'>Please open this page inside MyOutside.</p>";
    return;
  }

  const DICT = {
    zh: {
      appTitle: "纯蓝",
      import: "导入音频",
      emptyHint: "导入一首歌，分离成六轨，然后慢放练习。",
      noTracks: "还没有曲目",
      delete: "删除",
      separate: "分离六轨",
      reseparate: "重新分离",
      cancel: "取消",
      play: "播放",
      pause: "暂停",
      speed: "速度",
      loop: "循环",
      clearLoop: "清除",
      setLoopFirst: "先设置 A 点和 B 点",
      invalidLoop: "B 点必须在 A 点之后",
      engineReady: "引擎已安装",
      engineMissingChip: "引擎未安装",
      engineUnknown: "引擎状态未知",
      engineMissing: "未检测到分离引擎。请先运行：",
      recheck: "重新检查",
      notSeparated: "尚未分离",
      ready: "已分离",
      running: "分离中",
      succeeded: "分离完成",
      failed: "分离失败",
      cancelled: "已取消",
      importing: "导入中…",
      imported: "已导入",
      importFailed: "导入失败：",
      deleteConfirm: (title) => `删除「${title}」及其分离结果？`,
      deleted: "已删除",
      separating: "开始分离…",
      separated: "分离完成，六轨已就绪",
      separationFailed: "分离失败：",
      cancelledToast: "已取消分离",
      playFailed: "播放失败",
      meta: (duration, stems, size) => `${duration} · ${stems} 轨 · ${size}`,
      stemCount: (n) => `${n} 轨`,
      unknownDuration: "--:--",
      stemVocals: "人声",
      stemDrums: "鼓",
      stemBass: "贝斯",
      stemOther: "其他",
      stemGuitar: "吉他",
      stemPiano: "钢琴",
    },
    en: {
      appTitle: "Pure Blue",
      import: "Import audio",
      emptyHint: "Import a song, split it into six stems, then practise slowly.",
      noTracks: "No tracks yet",
      delete: "Delete",
      separate: "Split into six stems",
      reseparate: "Split again",
      cancel: "Cancel",
      play: "Play",
      pause: "Pause",
      speed: "Speed",
      loop: "Loop",
      clearLoop: "Clear",
      setLoopFirst: "Set point A and B first",
      invalidLoop: "B must be after A",
      engineReady: "Engine ready",
      engineMissingChip: "Engine missing",
      engineUnknown: "Engine unknown",
      engineMissing: "Separation engine not found. Run:",
      recheck: "Check again",
      notSeparated: "Not separated",
      ready: "Separated",
      running: "Separating",
      succeeded: "Done",
      failed: "Failed",
      cancelled: "Cancelled",
      importing: "Importing…",
      imported: "Imported",
      importFailed: "Import failed: ",
      deleteConfirm: (title) => `Delete “${title}” and its stems?`,
      deleted: "Deleted",
      separating: "Starting…",
      separated: "Done — six stems ready",
      separationFailed: "Separation failed: ",
      cancelledToast: "Separation cancelled",
      playFailed: "Playback failed",
      meta: (duration, stems, size) => `${duration} · ${stems} stems · ${size}`,
      stemCount: (n) => `${n} stems`,
      unknownDuration: "--:--",
      stemVocals: "Vocals",
      stemDrums: "Drums",
      stemBass: "Bass",
      stemOther: "Other",
      stemGuitar: "Guitar",
      stemPiano: "Piano",
    },
  };

  let lang = "zh";
  const t = (key, ...args) => {
    const value = DICT[lang][key] ?? DICT.zh[key] ?? key;
    return typeof value === "function" ? value(...args) : value;
  };

  async function callOrThrow(name, payload, options) {
    const result = await bridge.call(name, payload, options);
    if (!result || !result.ok) {
      const error = new Error(result && result.error ? result.error.message : "unknown error");
      error.code = result && result.error ? result.error.code : "INTERNAL";
      throw error;
    }
    return result.result;
  }

  // ---- 元素 ----
  const trackListEl = document.getElementById("track-list");
  const emptyEl = document.getElementById("empty");
  const detailEl = document.getElementById("detail");
  const titleEl = document.getElementById("track-title");
  const metaEl = document.getElementById("track-meta");
  const deleteBtn = document.getElementById("btn-delete");
  const importBtn = document.getElementById("btn-import");
  const separateBtn = document.getElementById("btn-separate");
  const cancelBtn = document.getElementById("btn-cancel");
  const jobStatusEl = document.getElementById("job-status");
  const progressWrap = document.getElementById("progress-wrap");
  const progressBar = document.getElementById("progress-bar");
  const jobMessageEl = document.getElementById("job-message");
  const engineHelpEl = document.getElementById("engine-help");
  const recheckBtn = document.getElementById("btn-recheck");
  const engineChip = document.getElementById("engine-chip");
  const playerEl = document.getElementById("player");
  const playBtn = document.getElementById("btn-play");
  const timeEl = document.getElementById("time");
  const seekEl = document.getElementById("seek");
  const speedEl = document.getElementById("speed");
  const loopBtn = document.getElementById("btn-loop");
  const aBtn = document.getElementById("btn-a");
  const bBtn = document.getElementById("btn-b");
  const clearLoopBtn = document.getElementById("btn-clear-loop");
  const loopLabel = document.getElementById("loop-label");
  const mixerEl = document.getElementById("mixer");
  const toastEl = document.getElementById("toast");
  const audioHolder = document.getElementById("audio-holder");

  // ---- 状态 ----
  let tracks = [];
  let currentId = null;
  let detail = null;
  let engine = null;
  let activeRunId = null;
  let unsubscribe = null;
  let pollTimer = null;
  let playerSignature = null;
  let draggingSeek = false;

  const audioMap = new Map();
  const stemParams = new Map();
  let master = null;
  let playing = false;
  let loop = { enabled: false, a: null, b: null };

  const STEM_ORDER = ["vocals", "drums", "bass", "other", "guitar", "piano"];
  const STEM_LABEL_KEY = {
    vocals: "stemVocals",
    drums: "stemDrums",
    bass: "stemBass",
    other: "stemOther",
    guitar: "stemGuitar",
    piano: "stemPiano",
  };

  function toast(text, isError = false) {
    toastEl.textContent = text;
    toastEl.classList.toggle("error", isError);
    toastEl.classList.remove("hidden");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toastEl.classList.add("hidden"), 2400);
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function formatSize(bytes) {
    if (!bytes) return "0 MB";
    const mb = bytes / (1024 * 1024);
    return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
  }

  // ---- 语言 ----

  async function initLanguage() {
    let value = null;
    try {
      const result = await bridge.call("platform.settings.get", { key: "ui.language" });
      value = result && result.ok ? result.result.value : null;
    } catch {
      /* ignore */
    }
    lang =
      value === "zh" || value === "en"
        ? value
        : navigator.language.toLowerCase().startsWith("zh")
          ? "zh"
          : "en";
    applyLanguage();
  }

  function applyLanguage() {
    document.title = t("appTitle");
    for (const el of document.querySelectorAll("[data-i18n]")) {
      el.textContent = t(el.dataset.i18n);
    }
    updateEngineChip();
    renderTrackList();
    renderDetail();
    updatePlayButton();
  }

  // ---- 引擎 ----

  async function loadEngine() {
    try {
      engine = await callOrThrow("pureblue.getEngineStatus", {});
    } catch {
      engine = null;
    }
    updateEngineChip();
  }

  function updateEngineChip() {
    if (!engineChip) return;
    if (!engine) {
      engineChip.textContent = t("engineUnknown");
      engineChip.classList.remove("ok");
      engineChip.title = "";
      return;
    }
    engineChip.textContent = engine.ready ? t("engineReady") : t("engineMissingChip");
    engineChip.classList.toggle("ok", engine.ready);
    engineChip.title = engine.message ?? "";
  }

  // ---- 曲目 ----

  async function loadTracks() {
    tracks = await callOrThrow("pureblue.listTracks", {});
    if (currentId && !tracks.some((track) => track.id === currentId)) currentId = null;
    if (!currentId && tracks.length > 0) currentId = tracks[0].id;
    renderTrackList();
    if (currentId) await refreshDetail();
    else {
      detail = null;
      renderDetail();
    }
  }

  function renderTrackList() {
    trackListEl.innerHTML = "";
    if (tracks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.style.height = "auto";
      empty.style.padding = "18px 8px";
      empty.style.fontSize = "13px";
      empty.textContent = t("noTracks");
      trackListEl.appendChild(empty);
      return;
    }
    for (const track of tracks) {
      const item = document.createElement("div");
      item.className = "track-item" + (track.id === currentId ? " active" : "");

      const title = document.createElement("div");
      title.className = "title";
      title.textContent = track.title;

      const sub = document.createElement("div");
      sub.className = "sub";
      const duration = document.createElement("span");
      duration.textContent = track.duration > 0 ? formatTime(track.duration) : t("unknownDuration");
      const status = document.createElement("span");
      status.className = "track-status";
      if (track.jobStatus === "running") {
        status.textContent = `${t("running")} ${Math.round((track.jobProgress ?? 0) * 100)}%`;
      } else if (track.jobStatus === "failed") {
        status.textContent = t("failed");
        status.classList.add("failed");
      } else if (track.stemCount > 0) {
        status.textContent = t("stemCount", track.stemCount);
      }
      sub.appendChild(duration);
      if (status.textContent) sub.appendChild(status);

      item.appendChild(title);
      item.appendChild(sub);
      item.addEventListener("click", () => void selectTrack(track.id));
      trackListEl.appendChild(item);
    }
  }

  async function selectTrack(id) {
    if (id === currentId && detail) return;
    stopPlayback();
    currentId = id;
    detail = null;
    renderTrackList();
    await refreshDetail();
  }

  async function refreshDetail(options = {}) {
    if (!currentId) {
      detail = null;
      renderDetail();
      return;
    }
    try {
      detail = await callOrThrow("pureblue.getTrack", { trackId: currentId });
      renderDetail();
      schedulePoll();
    } catch (error) {
      if (!options.silent) toast(error.message, true);
    }
  }

  function schedulePoll() {
    clearInterval(pollTimer);
    pollTimer = null;
    if (!detail) return;
    if (detail.job && detail.job.status === "running" && !activeRunId) {
      pollTimer = setInterval(() => {
        void refreshDetail({ silent: true });
      }, 2000);
    }
  }

  // ---- 详情 ----

  function jobLabel(job) {
    if (!job) return detail && detail.stems.length > 0 ? t("ready") : t("notSeparated");
    switch (job.status) {
      case "running":
        return `${t("running")} ${Math.round((job.progress ?? 0) * 100)}%`;
      case "succeeded":
        return t("succeeded");
      case "failed":
        return t("failed");
      case "cancelled":
        return t("cancelled");
      default:
        return "";
    }
  }

  function renderDetail() {
    if (!detail) {
      emptyEl.classList.remove("hidden");
      detailEl.classList.add("hidden");
      playerEl.classList.add("hidden");
      return;
    }
    emptyEl.classList.add("hidden");
    detailEl.classList.remove("hidden");
    titleEl.textContent = detail.title;
    metaEl.textContent = t(
      "meta",
      detail.duration > 0 ? formatTime(detail.duration) : t("unknownDuration"),
      detail.stemCount,
      formatSize(detail.size),
    );

    const running = !!activeRunId || (detail.job && detail.job.status === "running");
    separateBtn.textContent = detail.stems.length > 0 ? t("reseparate") : t("separate");
    separateBtn.disabled = running || !engine || !engine.ready;
    cancelBtn.classList.toggle("hidden", !running);
    jobStatusEl.textContent = jobLabel(detail.job);
    progressWrap.classList.toggle("hidden", !running);
    if (running) {
      progressBar.style.width = `${Math.round((detail.jobProgress ?? 0) * 100)}%`;
      jobMessageEl.textContent = detail.job ? detail.job.message : "";
      jobMessageEl.classList.remove("error");
    } else if (detail.job && detail.job.status === "failed") {
      jobMessageEl.textContent = detail.job.error ?? "";
      jobMessageEl.classList.add("error");
    } else if (detail.job && detail.job.status === "cancelled") {
      jobMessageEl.textContent = "";
      jobMessageEl.classList.remove("error");
    } else {
      jobMessageEl.textContent = "";
      jobMessageEl.classList.remove("error");
    }
    engineHelpEl.classList.toggle("hidden", !!(engine && engine.ready));

    if (detail.stems.length > 0) {
      playerEl.classList.remove("hidden");
      ensurePlayer(detail);
      renderMixer();
      applyRate();
      applyStemParams();
      updateTransport();
    } else {
      playerEl.classList.add("hidden");
      stopPlayback();
    }
  }

  // ---- 播放器 ----

  function ensurePlayer(nextDetail) {
    const signature =
      nextDetail.id +
      "|" +
      nextDetail.stems
        .map((stem) => `${stem.kind}:${stem.file}`)
        .sort()
        .join("|");
    if (signature === playerSignature) return;
    playerSignature = signature;
    stopPlayback();
    for (const audio of audioMap.values()) {
      audio.pause();
      audio.src = "";
    }
    audioMap.clear();
    stemParams.clear();
    audioHolder.innerHTML = "";
    master = null;
    loop = { enabled: false, a: null, b: null };

    for (const stem of nextDetail.stems) {
      stemParams.set(stem.kind, { muted: false, solo: false, volume: 1 });
      const audio = document.createElement("audio");
      audio.preload = "auto";
      audio.src = `media://pureblue/${stem.file}`;
      audio.preservesPitch = true;
      audio.webkitPreservesPitch = true;
      audio.addEventListener("loadedmetadata", () => updateTransport());
      audio.addEventListener("ended", () => {
        if (audio === master) {
          playing = false;
          updatePlayButton();
        }
      });
      audioHolder.appendChild(audio);
      audioMap.set(stem.kind, audio);
    }
    const masterKind = STEM_ORDER.find((kind) => audioMap.has(kind));
    master = masterKind ? audioMap.get(masterKind) : null;
    if (master) master.addEventListener("timeupdate", onTimeUpdate);
    renderLoopLabel();
  }

  function stemLabel(kind) {
    return t(STEM_LABEL_KEY[kind] ?? kind);
  }

  function renderMixer() {
    mixerEl.innerHTML = "";
    for (const kind of STEM_ORDER) {
      const audio = audioMap.get(kind);
      if (!audio) continue;
      const params = stemParams.get(kind) ?? { muted: false, solo: false, volume: 1 };
      const row = document.createElement("div");
      row.className = "stem-row";

      const name = document.createElement("span");
      name.className = "stem-name";
      name.textContent = stemLabel(kind);

      const mute = document.createElement("button");
      mute.type = "button";
      mute.className = "stem-toggle" + (params.muted ? " on" : "");
      mute.textContent = "M";
      mute.title = "mute";
      mute.addEventListener("click", () => {
        params.muted = !params.muted;
        mute.classList.toggle("on", params.muted);
        applyStemParams();
      });

      const solo = document.createElement("button");
      solo.type = "button";
      solo.className = "stem-toggle solo" + (params.solo ? " on" : "");
      solo.textContent = "S";
      solo.title = "solo";
      solo.addEventListener("click", () => {
        params.solo = !params.solo;
        solo.classList.toggle("on", params.solo);
        applyStemParams();
      });

      const volume = document.createElement("input");
      volume.type = "range";
      volume.className = "stem-volume";
      volume.min = "0";
      volume.max = "100";
      volume.value = String(Math.round(params.volume * 100));
      volume.addEventListener("input", () => {
        params.volume = Number(volume.value) / 100;
        applyStemParams();
      });

      row.appendChild(name);
      row.appendChild(mute);
      row.appendChild(solo);
      row.appendChild(volume);
      mixerEl.appendChild(row);
    }
  }

  function applyStemParams() {
    const anySolo = [...stemParams.values()].some((params) => params.solo);
    for (const [kind, audio] of audioMap) {
      const params = stemParams.get(kind) ?? { muted: false, solo: false, volume: 1 };
      audio.muted = params.muted || (anySolo && !params.solo);
      audio.volume = Math.max(0, Math.min(1, params.volume));
    }
  }

  function applyRate() {
    const rate = Number(speedEl.value) || 1;
    for (const audio of audioMap.values()) {
      audio.playbackRate = rate;
      audio.preservesPitch = true;
      audio.webkitPreservesPitch = true;
    }
  }

  async function playAll() {
    if (!master) return;
    const time = master.currentTime;
    for (const audio of audioMap.values()) {
      try {
        audio.currentTime = time;
      } catch {
        /* ignore */
      }
    }
    const results = await Promise.allSettled([...audioMap.values()].map((audio) => audio.play()));
    playing = results.some((result) => result.status === "fulfilled");
    if (!playing) toast(t("playFailed"), true);
    updatePlayButton();
  }

  function pauseAll() {
    for (const audio of audioMap.values()) audio.pause();
    playing = false;
    updatePlayButton();
  }

  function stopPlayback() {
    pauseAll();
    if (master) {
      try {
        master.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    seekEl.value = "0";
    updateTransport();
  }

  function updatePlayButton() {
    playBtn.textContent = playing ? t("pause") : t("play");
  }

  function onTimeUpdate() {
    if (!master) return;
    if (playing) {
      for (const audio of audioMap.values()) {
        if (audio !== master && Math.abs(audio.currentTime - master.currentTime) > 0.12) {
          try {
            audio.currentTime = master.currentTime;
          } catch {
            /* ignore */
          }
        }
      }
    }
    if (!draggingSeek) updateTransport();
    if (loop.enabled && loop.a != null && loop.b != null && master.currentTime >= loop.b) {
      seekTo(loop.a);
    }
  }

  function currentDuration() {
    if (master && Number.isFinite(master.duration) && master.duration > 0) return master.duration;
    return detail?.duration ?? 0;
  }

  function updateTransport() {
    const duration = currentDuration();
    const current = master ? master.currentTime : 0;
    timeEl.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    if (!draggingSeek) {
      seekEl.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : "0";
    }
  }

  function seekTo(time) {
    for (const audio of audioMap.values()) {
      try {
        audio.currentTime = Math.max(0, Math.min(time, Number.isFinite(audio.duration) ? audio.duration : time));
      } catch {
        /* ignore */
      }
    }
    updateTransport();
  }

  function renderLoopLabel() {
    const parts = [];
    if (loop.a != null) parts.push(formatTime(loop.a));
    if (loop.b != null) parts.push(formatTime(loop.b));
    loopLabel.textContent = parts.length > 0 ? parts.join(" – ") + (loop.enabled ? " · loop" : "") : "";
    loopBtn.classList.toggle("active", loop.enabled);
  }

  playBtn.addEventListener("click", () => {
    if (playing) pauseAll();
    else void playAll();
  });

  seekEl.addEventListener("input", () => {
    draggingSeek = true;
    const duration = currentDuration();
    if (duration > 0) seekTo((Number(seekEl.value) / 1000) * duration);
  });
  seekEl.addEventListener("change", () => {
    draggingSeek = false;
  });

  speedEl.addEventListener("change", () => {
    applyRate();
  });

  aBtn.addEventListener("click", () => {
    if (!master) return;
    loop.a = master.currentTime;
    if (loop.b != null && loop.b <= loop.a) loop.b = null;
    if (loop.a != null && loop.b != null) loop.enabled = true;
    renderLoopLabel();
  });

  bBtn.addEventListener("click", () => {
    if (!master) return;
    const point = master.currentTime;
    if (loop.a != null && point <= loop.a) {
      toast(t("invalidLoop"), true);
      return;
    }
    loop.b = point;
    if (loop.a != null) loop.enabled = true;
    renderLoopLabel();
  });

  loopBtn.addEventListener("click", () => {
    if (loop.a == null || loop.b == null) {
      toast(t("setLoopFirst"));
      return;
    }
    loop.enabled = !loop.enabled;
    if (loop.enabled && master && master.currentTime >= loop.b) seekTo(loop.a);
    renderLoopLabel();
  });

  clearLoopBtn.addEventListener("click", () => {
    loop = { enabled: false, a: null, b: null };
    renderLoopLabel();
  });

  // ---- 动作 ----

  importBtn.addEventListener("click", async () => {
    if (typeof bridge.pickAudioFile !== "function") {
      toast("File picker unavailable", true);
      return;
    }
    let path = null;
    try {
      path = await bridge.pickAudioFile();
    } catch (error) {
      toast(String(error), true);
      return;
    }
    if (!path) return;
    importBtn.disabled = true;
    toast(t("importing"));
    try {
      const track = await callOrThrow("pureblue.importTrack", { path });
      await loadTracks();
      await selectTrack(track.id);
      toast(t("imported"));
    } catch (error) {
      toast(`${t("importFailed")}${error.message}`, true);
    } finally {
      importBtn.disabled = false;
    }
  });

  separateBtn.addEventListener("click", async () => {
    if (!detail || activeRunId) return;
    if (!engine || !engine.ready) {
      toast(t("engineMissingChip"), true);
      return;
    }
    const trackId = detail.id;
    const runId = bridge.newRunId();
    activeRunId = runId;
    unsubscribe = bridge.onEvent(runId, (event) => {
      if (!event || event.type !== "progress") return;
      if (currentId !== trackId) return;
      progressWrap.classList.remove("hidden");
      progressBar.style.width = `${Math.round((event.progress ?? 0) * 100)}%`;
      jobStatusEl.textContent = `${t("running")} ${Math.round((event.progress ?? 0) * 100)}%`;
      jobMessageEl.textContent = event.message ?? "";
    });
    separateBtn.disabled = true;
    cancelBtn.classList.remove("hidden");
    progressWrap.classList.remove("hidden");
    progressBar.style.width = "0%";
    jobStatusEl.textContent = t("running");
    jobMessageEl.textContent = t("separating");
    jobMessageEl.classList.remove("error");
    try {
      await callOrThrow("pureblue.startSeparation", { trackId }, { runId });
      if (currentId === trackId) toast(t("separated"));
    } catch (error) {
      if (error.code === "ABORTED") {
        toast(t("cancelledToast"));
      } else if (currentId === trackId) {
        toast(`${t("separationFailed")}${error.message}`, true);
      }
    } finally {
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
      activeRunId = null;
      await loadTracks();
    }
  });

  cancelBtn.addEventListener("click", () => {
    if (activeRunId) void bridge.cancel(activeRunId);
  });

  deleteBtn.addEventListener("click", async () => {
    if (!detail) return;
    if (!window.confirm(t("deleteConfirm", detail.title))) return;
    stopPlayback();
    try {
      await callOrThrow("pureblue.deleteTrack", { trackId: detail.id });
      currentId = null;
      detail = null;
      playerSignature = null;
      await loadTracks();
      toast(t("deleted"));
    } catch (error) {
      toast(error.message, true);
    }
  });

  recheckBtn.addEventListener("click", async () => {
    await loadEngine();
    renderDetail();
  });

  // ---- 启动 ----

  async function init() {
    await initLanguage();
    await loadEngine();
    try {
      await loadTracks();
    } catch (error) {
      toast(error.message, true);
    }
    updateEngineChip();
    renderDetail();
  }

  void init();
})();
