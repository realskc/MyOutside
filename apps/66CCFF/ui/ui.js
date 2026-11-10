/* 纯蓝 66CCFF：六轨分离 + 慢放练习（v1） */
(() => {
  const bridge = window.outside;
  if (!bridge) {
    document.body.innerHTML = "<p style='padding:24px'>Please open this page inside MyOutside.</p>";
    return;
  }

  const DICT = {
    zh: {
      appTitle: "纯蓝",
      appHex: "66CCFF",
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
      pickerUnavailable: "文件选择器不可用",
      midiLoadFailed: "MIDI 加载失败：",
      rollModeRoll: "卷帘",
      rollModeFall: "沉浸",
      rollFollow: "跟随",
      rollFollowHint: "播放时画面跟着走",
      rollFit: "适应",
      rollFitHint: "让大部分音符上下都放得下，回到播放头",
      rollZoomIn: "放大",
      rollZoomOut: "缩小",
      rollZoomTime: "时间",
      rollZoomPitch: "音高",
      rollExit: "退出沉浸（Esc）",
      rollEmpty: "转一个 MIDI，或者添加 MIDI 文件，这里就会显示钢琴卷帘",
      rollHideTrack: "点一下隐藏这条轨",
      rollShowTrack: "点一下显示这条轨",
      rollRemoveLayer: "从卷帘移除",
      rollVelocity: "力度",
      rollAddMidi: "添加 MIDI 文件",
      rollHint: "滚动 / 拖动：上下左右移动 · 双指捏合或 ⌘ / Ctrl + 滚动：时间缩放（在琴键上则是音高缩放） · ⌥ / Alt + 滚动：音高缩放 · 点标尺：跳转 · 点琴键或音符：试听",
      stemMidi: "MIDI",
      showInRoll: "在卷帘中显示",
      hideInRoll: "从卷帘隐藏",
      transcribeTitle: "转 MIDI",
      transcribeHint: "把选中的轨转成一个 MIDI（MuScriptor）",
      transcribeAs: "转成",
      transcribe: "转 MIDI",
      transcribing: "转写中",
      transcribeStart: "开始转写…",
      transcribed: (n) => `转写完成：${n} 个音符`,
      transcribeFailed: "转写失败：",
      transcribeCancelled: "已取消转写",
      transcriptionFailed: "转写失败",
      pickStem: "至少选一条轨",
      noTranscriptions: "还没有转写结果",
      notes: (n) => `${n} 个音符`,
      deleteTranscriptionConfirm: "删除这个 MIDI？",
      transcribeEngineMissing: "未检测到转 MIDI 引擎。请先运行：",
      transcribeLogin: "MuScriptor 的权重要先登录 HuggingFace：先在浏览器里打开 huggingface.co/MuScriptor/muscriptor-medium 接受许可，再在终端运行（token 只在终端里输入）：",
      instrumentLabels: {
        acoustic_piano: "钢琴",
        electric_piano: "电钢琴",
        voice: "人声（旋律）",
        acoustic_guitar: "木吉他",
        clean_electric_guitar: "电吉他（清音）",
        distorted_electric_guitar: "电吉他（失真）",
        acoustic_bass: "原声贝斯",
        electric_bass: "电贝斯",
        violin: "小提琴",
        cello: "大提琴",
        string_ensemble: "弦乐组",
        flutes: "笛类",
        organ: "风琴",
        synth_lead: "合成器主音",
        synth_pad: "合成器铺底",
        drums: "鼓",
      },
    },
    en: {
      appTitle: "66CCFF",
      appHex: "纯蓝",
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
      pickerUnavailable: "File picker unavailable",
      midiLoadFailed: "Failed to load MIDI: ",
      rollModeRoll: "Roll",
      rollModeFall: "Immersive",
      rollFollow: "Follow",
      rollFollowHint: "Keep the playhead in view while playing",
      rollFit: "Fit",
      rollFitHint: "Fit most notes vertically and jump to the playhead",
      rollZoomIn: "Zoom in",
      rollZoomOut: "Zoom out",
      rollZoomTime: "Time",
      rollZoomPitch: "Pitch",
      rollExit: "Exit immersive (Esc)",
      rollEmpty: "Transcribe a MIDI or add a MIDI file to see the piano roll here",
      rollHideTrack: "Click to hide this track",
      rollShowTrack: "Click to show this track",
      rollRemoveLayer: "Remove from the roll",
      rollVelocity: "velocity",
      rollAddMidi: "Add MIDI file",
      rollHint: "Scroll / drag: move · Pinch or ⌘ / Ctrl + scroll: zoom time (over the keys: zoom pitch) · ⌥ / Alt + scroll: zoom pitch · Click the ruler: seek · Click a key or note: listen",
      stemMidi: "MIDI",
      showInRoll: "Show in roll",
      hideInRoll: "Hide from roll",
      transcribeTitle: "To MIDI",
      transcribeHint: "Transcribe the selected stems into one MIDI (MuScriptor)",
      transcribeAs: "As",
      transcribe: "To MIDI",
      transcribing: "Transcribing",
      transcribeStart: "Starting…",
      transcribed: (n) => `Transcribed: ${n} notes`,
      transcribeFailed: "Transcription failed: ",
      transcribeCancelled: "Transcription cancelled",
      transcriptionFailed: "Failed",
      pickStem: "Select at least one stem",
      noTranscriptions: "No transcriptions yet",
      notes: (n) => `${n} notes`,
      deleteTranscriptionConfirm: "Delete this MIDI?",
      transcribeEngineMissing: "MIDI engine not found. Run:",
      transcribeLogin: "MuScriptor's weights need a HuggingFace login: accept the license at huggingface.co/MuScriptor/muscriptor-medium, then run this in a terminal (the token is typed only there):",
      instrumentLabels: {
        acoustic_piano: "Piano",
        electric_piano: "Electric piano",
        voice: "Voice (melody)",
        acoustic_guitar: "Acoustic guitar",
        clean_electric_guitar: "Electric guitar (clean)",
        distorted_electric_guitar: "Electric guitar (distorted)",
        acoustic_bass: "Acoustic bass",
        electric_bass: "Electric bass",
        violin: "Violin",
        cello: "Cello",
        string_ensemble: "Strings",
        flutes: "Flutes",
        organ: "Organ",
        synth_lead: "Synth lead",
        synth_pad: "Synth pad",
        drums: "Drums",
      },
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
  const engineHelpCommand = document.getElementById("engine-help-command");
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
  const transcribePanel = document.getElementById("transcribe-panel");
  const transcribeStemsEl = document.getElementById("transcribe-stems");
  const transcribeInstrumentEl = document.getElementById("transcribe-instrument");
  const transcribeBtn = document.getElementById("btn-transcribe");
  const transcribeCancelBtn = document.getElementById("btn-transcribe-cancel");
  const transcribeHelpEl = document.getElementById("transcribe-help");
  const transcribeHelpText = document.getElementById("transcribe-help-text");
  const transcribeHelpCommand = document.getElementById("transcribe-help-command");
  const transcribeRecheckBtn = document.getElementById("btn-transcribe-recheck");
  const transcriptionsEl = document.getElementById("transcriptions");
  const rollPanel = document.getElementById("roll-panel");

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

  // 转 MIDI（66CCFF-0012）
  let transcriptionEngine = null;
  let transcribeRunId = null;
  /** 本页发起的转写的实时进度：{ trackId, progress, message } */
  let transcribeLive = null;
  const transcribeStems = new Set(["piano"]);
  /** 作者手动选过乐器后，不再按所选的轨自动换 */
  let instrumentTouched = false;

  // 钢琴卷帘（66CCFF-0015）
  let roll = null;
  /** 卷帘里的图层：这首曲目的转写结果（id 以 t: 开头）和手动添加的 MIDI 文件（f: 开头） */
  let rollLayers = [];
  let rollTrackId = null;
  /** 正在读的转写结果：曲目页一刷新就会再调一次 loadRollLayers，不能读两遍 */
  const rollLoading = new Set();
  let synth = null;
  let synthTimer = null;

  const audioMap = new Map();
  const stemParams = new Map();
  /**
   * 各轨的静音 / 独奏 / 音量都走 Web Audio 的音量节点，<audio> 本身永远不静音（66CCFF-0011）：
   * Chromium 会在窗口隐藏时暂停「从开始播放起就静音」的 <audio>，主播放器一停，切回来时各轨会被拉回到隐藏那一刻。
   */
  let mixContext = null;
  const gainMap = new Map();
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
    if (roll) roll.refreshText();
  }

  // ---- 引擎 ----

  async function loadEngine() {
    try {
      engine = await callOrThrow("66CCFF.getEngineStatus", {});
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
    tracks = await callOrThrow("66CCFF.listTracks", {});
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
      detail = await callOrThrow("66CCFF.getTrack", { trackId: currentId });
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
    const transcriptionRunning = detail.transcriptions.some((item) => item.status === "running");
    if ((detail.job && detail.job.status === "running" && !activeRunId) || (transcriptionRunning && !transcribeRunId)) {
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
      rollPanel.classList.add("hidden");
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
    // 安装命令按平台来自后端，不写死在页面里（66CCFF-0013）
    engineHelpCommand.textContent = engine ? engine.setupCommand : "";

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
    renderTranscribePanel();
    // 卷帘跟着播放器走，有分轨才有播放器（66CCFF-0015）
    rollPanel.classList.toggle("hidden", detail.stems.length === 0);
    if (detail.stems.length > 0) void loadRollLayers(detail);
  }

  // ---- 转 MIDI（66CCFF-0012） ----

  async function loadTranscriptionEngine() {
    try {
      transcriptionEngine = await callOrThrow("66CCFF.getTranscriptionEngineStatus", {});
    } catch {
      transcriptionEngine = null;
    }
  }

  function instrumentLabel(name) {
    return t("instrumentLabels")[name] ?? name;
  }

  /** 按所选的轨猜一个乐器：只选人声 → 人声旋律，只选贝斯 → 电贝斯，只选吉他 → 木吉他，其余 → 钢琴 */
  function defaultInstrument() {
    const kinds = [...transcribeStems];
    if (kinds.length === 1 && kinds[0] === "vocals") return "voice";
    if (kinds.length === 1 && kinds[0] === "bass") return "electric_bass";
    if (kinds.length === 1 && kinds[0] === "guitar") return "acoustic_guitar";
    if (kinds.length === 1 && kinds[0] === "drums") return "drums";
    return "acoustic_piano";
  }

  function renderInstrumentOptions() {
    const names = transcriptionEngine ? transcriptionEngine.instruments : ["acoustic_piano"];
    const labelled = Object.keys(t("instrumentLabels")).filter((name) => names.includes(name));
    const rest = names.filter((name) => !labelled.includes(name));
    const current = transcribeInstrumentEl.value;
    transcribeInstrumentEl.innerHTML = "";
    for (const name of [...labelled, ...rest]) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = instrumentLabel(name);
      transcribeInstrumentEl.appendChild(option);
    }
    transcribeInstrumentEl.value = instrumentTouched && names.includes(current) ? current : defaultInstrument();
  }

  function renderTranscribePanel() {
    if (!detail || detail.stems.length === 0) {
      transcribePanel.classList.add("hidden");
      return;
    }
    transcribePanel.classList.remove("hidden");
    const available = detail.stems.map((stem) => stem.kind);
    for (const kind of [...transcribeStems]) if (!available.includes(kind)) transcribeStems.delete(kind);
    if (transcribeStems.size === 0) transcribeStems.add(available.includes("piano") ? "piano" : available[0]);

    transcribeStemsEl.innerHTML = "";
    for (const kind of STEM_ORDER) {
      if (!available.includes(kind)) continue;
      const label = document.createElement("label");
      label.className = "stem-check" + (transcribeStems.has(kind) ? " on" : "");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = transcribeStems.has(kind);
      box.addEventListener("change", () => {
        if (box.checked) transcribeStems.add(kind);
        else transcribeStems.delete(kind);
        label.classList.toggle("on", box.checked);
        if (!instrumentTouched) transcribeInstrumentEl.value = defaultInstrument();
      });
      label.appendChild(box);
      label.appendChild(document.createTextNode(stemLabel(kind)));
      transcribeStemsEl.appendChild(label);
    }
    renderInstrumentOptions();

    const busy = !!transcribeRunId || detail.transcriptions.some((item) => item.status === "running");
    const separating = !!activeRunId || (detail.job && detail.job.status === "running");
    const ready = !!(transcriptionEngine && transcriptionEngine.ready);
    transcribeBtn.disabled = busy || separating || !ready;
    transcribeCancelBtn.classList.toggle("hidden", !transcribeRunId);

    transcribeHelpEl.classList.toggle("hidden", ready);
    if (!ready) {
      const installed = !!(transcriptionEngine && transcriptionEngine.installed);
      transcribeHelpText.textContent = installed ? t("transcribeLogin") : t("transcribeEngineMissing");
      transcribeHelpCommand.textContent = transcriptionEngine
        ? installed
          ? transcriptionEngine.loginCommand
          : transcriptionEngine.setupCommand
        : "";
    }
    renderTranscriptions();
  }

  function renderTranscriptions() {
    transcriptionsEl.innerHTML = "";
    if (!detail || detail.transcriptions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = t("noTranscriptions");
      transcriptionsEl.appendChild(empty);
      return;
    }
    for (const item of detail.transcriptions) {
      const row = document.createElement("div");
      row.className = "transcription-row";
      const main = document.createElement("div");
      main.className = "transcription-main";
      const title = document.createElement("div");
      title.className = "transcription-title";
      title.textContent = `${instrumentLabel(item.instrument)} ← ${item.stems.map(stemLabel).join(" + ")}`;
      const meta = document.createElement("div");
      meta.className = "muted transcription-meta";
      const parts = [new Date(item.createdAt).toLocaleString()];
      if (item.status === "succeeded") {
        if (item.noteCount != null) parts.push(t("notes", item.noteCount));
        if (item.bpm) parts.push(`${Math.round(item.bpm)} BPM`);
      } else if (item.status === "running") {
        const live = transcribeLive && transcribeLive.trackId === item.trackId ? transcribeLive : null;
        const progress = live ? live.progress : item.progress;
        parts.push(`${t("transcribing")} ${Math.round(progress * 100)}%`, live ? live.message : item.message);
      } else if (item.status === "failed") {
        parts.push(`${t("transcriptionFailed")}：${item.error ?? ""}`);
        meta.classList.add("error");
      } else {
        parts.push(t("cancelled"));
      }
      meta.textContent = parts.filter(Boolean).join(" · ");
      main.appendChild(title);
      main.appendChild(meta);
      row.appendChild(main);

      const actions = document.createElement("div");
      actions.className = "transcription-actions";
      if (item.status === "succeeded") {
        const shown = layerVisible(`t:${item.id}`);
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "ghost" + (shown ? " active" : "");
        toggle.textContent = shown ? t("hideInRoll") : t("showInRoll");
        toggle.addEventListener("click", () => setLayerVisible(`t:${item.id}`, !shown));
        actions.appendChild(toggle);
      }
      if (item.status !== "running") {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "link-btn text-danger";
        remove.textContent = t("delete");
        remove.addEventListener("click", () => void deleteTranscription(item.id));
        actions.appendChild(remove);
      }
      row.appendChild(actions);
      transcriptionsEl.appendChild(row);
    }
  }

  async function startTranscription() {
    if (!detail || transcribeRunId) return;
    if (transcribeStems.size === 0) {
      toast(t("pickStem"), true);
      return;
    }
    const trackId = detail.id;
    const runId = bridge.newRunId();
    transcribeRunId = runId;
    transcribeLive = { trackId, progress: 0, message: t("transcribeStart") };
    const off = bridge.onEvent(runId, (event) => {
      if (!event || event.type !== "progress") return;
      transcribeLive = { trackId, progress: event.progress ?? 0, message: event.message ?? "" };
      if (currentId === trackId) renderTranscriptions();
    });
    const request = callOrThrow(
      "66CCFF.startTranscription",
      { trackId, stems: [...transcribeStems], instrument: transcribeInstrumentEl.value },
      { runId },
    );
    // 记录在请求开始时写入；稍等一下刷新，列表里就有这一行了
    setTimeout(() => {
      if (currentId === trackId) void refreshDetail({ silent: true });
    }, 400);
    renderTranscribePanel();
    try {
      const result = await request;
      if (currentId === trackId) toast(t("transcribed", result.noteCount));
    } catch (error) {
      if (error.code === "ABORTED") toast(t("transcribeCancelled"));
      else if (currentId === trackId) toast(`${t("transcribeFailed")}${error.message}`, true);
    } finally {
      off();
      transcribeRunId = null;
      transcribeLive = null;
      if (currentId === trackId) await refreshDetail({ silent: true });
    }
  }

  async function deleteTranscription(transcriptionId) {
    if (!window.confirm(t("deleteTranscriptionConfirm"))) return;
    try {
      await callOrThrow("66CCFF.deleteTranscription", { transcriptionId });
      rollLayers = rollLayers.filter((layer) => layer.id !== `t:${transcriptionId}`);
      applyRollLayers();
      await refreshDetail({ silent: true });
    } catch (error) {
      toast(error.message, true);
    }
  }

  // ---- 钢琴卷帘（66CCFF-0015） ----

  function initRoll() {
    roll = window.createPianoRoll(rollPanel, {
      t,
      getTime: () => (master ? master.currentTime : 0),
      getDuration: () => currentDuration(),
      isPlaying: () => playing,
      onSeek: (time) => seekTo(time),
      onTogglePlay: () => togglePlayback(),
      onAudition: (midi, velocity) => {
        const ready = ensureSynth();
        if (!ready) return;
        if (mixContext.state !== "running") void mixContext.resume();
        synth.audition(midi, velocity);
      },
      onVisibilityChange: () => {
        syncSynthNotes();
        renderMixer();
        applyStemParams();
        renderTranscriptions();
      },
      onRemoveLayer: (id) => {
        rollLayers = rollLayers.filter((layer) => layer.id !== id);
        applyRollLayers();
      },
    });
    const addFile = document.createElement("button");
    addFile.type = "button";
    addFile.className = "ghost";
    addFile.dataset.i18n = "rollAddMidi";
    addFile.textContent = t("rollAddMidi");
    addFile.addEventListener("click", () => void addMidiFiles());
    roll.extras.appendChild(addFile);
    const hint = document.createElement("div");
    hint.className = "roll-hint";
    hint.dataset.i18n = "rollHint";
    hint.textContent = t("rollHint");
    rollPanel.appendChild(hint);
  }

  /** 卷帘里的一个图层：单轨的转写结果，轨名用乐器名，比 MIDI 里的 GM 音色名好认 */
  function layerFromMidi(id, name, data, { visible, removable, instrument }) {
    return {
      id,
      name,
      removable,
      duration: data.duration,
      grid: data.grid,
      tracks: data.tracks.map((track) => ({
        name: data.tracks.length === 1 && instrument ? instrumentLabel(instrument) : track.name,
        notes: track.notes,
        percussion: track.percussion,
        visible,
      })),
    };
  }

  function transcriptionLabel(item) {
    return `${instrumentLabel(item.instrument)} ← ${item.stems.map(stemLabel).join(" + ")}`;
  }

  /**
   * 换曲目时清空图层；之后把这首曲目所有成功的转写结果读进来（第一次打开时只显示最新的一个），
   * 删掉的转写对应的图层去掉；手动添加的文件保留到换曲目为止。
   */
  async function loadRollLayers(nextDetail) {
    if (rollTrackId !== nextDetail.id) {
      rollTrackId = nextDetail.id;
      rollLayers = [];
      applyRollLayers();
    }
    const trackId = nextDetail.id;
    const succeeded = nextDetail.transcriptions.filter((item) => item.status === "succeeded");
    const wanted = new Set(succeeded.map((item) => `t:${item.id}`));
    const before = rollLayers.length;
    rollLayers = rollLayers.filter((layer) => !layer.id.startsWith("t:") || wanted.has(layer.id));
    let changed = rollLayers.length !== before;
    const firstLoad = !rollLayers.some((layer) => layer.id.startsWith("t:"));
    for (const [index, item] of succeeded.entries()) {
      const id = `t:${item.id}`;
      if (rollLoading.has(id) || rollLayers.some((layer) => layer.id === id)) continue;
      rollLoading.add(id);
      try {
        const data = await callOrThrow("66CCFF.readTranscription", { transcriptionId: item.id });
        if (rollTrackId !== trackId || rollLayers.some((layer) => layer.id === id)) continue;
        // 第一次打开只显示最新的一个；之后新转出来的直接显示
        const visible = firstLoad ? index === 0 : true;
        rollLayers.push(layerFromMidi(id, transcriptionLabel(item), data, { visible, removable: false, instrument: item.instrument }));
        changed = true;
      } catch (error) {
        toast(`${t("midiLoadFailed")}${error.message}`, true);
      } finally {
        rollLoading.delete(id);
      }
    }
    if (rollTrackId !== trackId) return;
    if (changed) {
      const order = new Map(succeeded.map((item, index) => [`t:${item.id}`, index]));
      rollLayers.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
      applyRollLayers();
    }
  }

  function applyRollLayers() {
    if (!roll) return;
    roll.setLayers(rollLayers);
    syncSynthNotes();
    renderMixer();
    applyStemParams();
    renderTranscriptions();
  }

  function layerVisible(id) {
    const layer = rollLayers.find((item) => item.id === id);
    return !!layer && layer.tracks.some((track) => track.visible);
  }

  function setLayerVisible(id, visible) {
    const layer = rollLayers.find((item) => item.id === id);
    if (!layer) return;
    for (const track of layer.tracks) track.visible = visible;
    applyRollLayers();
    if (visible) rollPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function addMidiFiles() {
    if (typeof bridge.pickMidiFiles !== "function") {
      toast(t("pickerUnavailable"), true);
      return;
    }
    let paths = [];
    try {
      paths = await bridge.pickMidiFiles();
    } catch (error) {
      toast(String(error), true);
      return;
    }
    if (!Array.isArray(paths) || paths.length === 0) return;
    for (const path of paths) {
      try {
        const data = await callOrThrow("66CCFF.readMidi", { path });
        const id = `f:${path}`;
        rollLayers = rollLayers.filter((layer) => layer.id !== id);
        rollLayers.push(layerFromMidi(id, data.name, data, { visible: true, removable: true }));
      } catch (error) {
        toast(`${t("midiLoadFailed")}${error.message}`, true);
      }
    }
    applyRollLayers();
  }

  /** MIDI 合成器和混音用同一个 AudioContext；在混音里是「MIDI」这一轨 */
  function ensureSynth() {
    if (!mixContext) return false;
    if (!synth) synth = window.createMidiSynth(mixContext);
    if (!gainMap.has("midi")) {
      const gain = mixContext.createGain();
      synth.output.disconnect();
      synth.output.connect(gain).connect(mixContext.destination);
      gainMap.set("midi", gain);
    }
    if (!stemParams.has("midi")) stemParams.set("midi", { muted: false, solo: false, volume: 0.8 });
    return true;
  }

  function syncSynthNotes() {
    if (!roll || !ensureSynth()) return;
    synth.setNotes(roll.audibleNotes());
  }

  function startSynthClock() {
    clearInterval(synthTimer);
    if (!synth || !master) return;
    const tick = () => synth.tick({ playing, time: master.currentTime, rate: master.playbackRate || 1 });
    tick();
    synthTimer = setInterval(tick, 25);
  }

  function stopSynthClock() {
    clearInterval(synthTimer);
    synthTimer = null;
    if (synth) synth.stop();
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
    for (const gain of gainMap.values()) gain.disconnect();
    gainMap.clear();
    audioMap.clear();
    stemParams.clear();
    audioHolder.innerHTML = "";
    master = null;
    loop = { enabled: false, a: null, b: null };

    if (!mixContext) mixContext = new AudioContext({ latencyHint: "playback" });
    for (const stem of nextDetail.stems) {
      stemParams.set(stem.kind, { muted: false, solo: false, volume: 1 });
      const audio = document.createElement("audio");
      audio.preload = "auto";
      audio.src = `media://66ccff/${stem.file}`;
      const gain = mixContext.createGain();
      mixContext.createMediaElementSource(audio).connect(gain).connect(mixContext.destination);
      gainMap.set(stem.kind, gain);
      audio.preservesPitch = true;
      audio.webkitPreservesPitch = true;
      audio.addEventListener("loadedmetadata", () => updateTransport());
      audio.addEventListener("ended", () => {
        if (audio === master) {
          playing = false;
          updatePlayButton();
          stopSynthClock();
          if (roll) roll.invalidate();
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
    // 卷帘里有显示中的 MIDI 时，混音里多一轨「MIDI」：和分轨一样可以静音、独奏、调音量（66CCFF-0015）
    const kinds = STEM_ORDER.filter((kind) => audioMap.has(kind));
    if (roll && roll.hasVisible() && ensureSynth()) kinds.push("midi");
    for (const kind of kinds) {
      const params = stemParams.get(kind) ?? { muted: false, solo: false, volume: 1 };
      const row = document.createElement("div");
      row.className = "stem-row";

      const name = document.createElement("span");
      name.className = "stem-name";
      name.textContent = kind === "midi" ? t("stemMidi") : stemLabel(kind);

      const mute = document.createElement("button");
      mute.type = "button";
      mute.className = "stem-toggle" + (params.muted ? " on" : "");
      mute.textContent = "M";
      mute.title = "mute";
      mute.setAttribute("aria-pressed", String(params.muted));

      const solo = document.createElement("button");
      solo.type = "button";
      solo.className = "stem-toggle solo" + (params.solo ? " on" : "");
      solo.textContent = "S";
      solo.title = "solo";
      solo.setAttribute("aria-pressed", String(params.solo));

      const syncToggles = () => {
        mute.classList.toggle("on", params.muted);
        solo.classList.toggle("on", params.solo);
        mute.setAttribute("aria-pressed", String(params.muted));
        solo.setAttribute("aria-pressed", String(params.solo));
      };

      // 同一轨的静音与独奏互斥：开启一个会关闭另一个。
      mute.addEventListener("click", () => {
        params.muted = !params.muted;
        if (params.muted) params.solo = false;
        syncToggles();
        applyStemParams();
      });

      solo.addEventListener("click", () => {
        params.solo = !params.solo;
        if (params.solo) params.muted = false;
        syncToggles();
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

  /** 静音 / 独奏 / 音量 → 音量节点；不碰 <audio> 的 muted / volume（66CCFF-0011） */
  function applyStemParams() {
    const anySolo = [...stemParams.values()].some((params) => params.solo);
    for (const [kind, gain] of gainMap) {
      const params = stemParams.get(kind) ?? { muted: false, solo: false, volume: 1 };
      const silent = params.muted || (anySolo && !params.solo);
      const target = silent ? 0 : Math.max(0, Math.min(1, params.volume));
      const now = mixContext.currentTime;
      gain.gain.cancelScheduledValues(now);
      if (mixContext.state === "running") {
        // 约 15 毫秒的渐变，静音 / 取消静音不会有咔哒声
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.setTargetAtTime(target, now, 0.015);
      } else {
        gain.gain.value = target;
      }
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
    // 音频上下文要在用户操作（点播放 / 空格）时启动；没启动时各轨没有声音
    if (mixContext && mixContext.state !== "running") await mixContext.resume().catch(() => undefined);
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
    if (playing) startSynthClock();
    if (roll) roll.invalidate();
  }

  function pauseAll() {
    for (const audio of audioMap.values()) audio.pause();
    playing = false;
    updatePlayButton();
    stopSynthClock();
    if (roll) roll.invalidate();
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

  const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>';
  const PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>';

  function updatePlayButton() {
    const label = playing ? t("pause") : t("play");
    playBtn.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
    playBtn.classList.toggle("playing", playing);
    playBtn.setAttribute("aria-label", label);
    playBtn.title = label;
  }

  function onTimeUpdate() {
    if (!master) return;
    // 其余各轨跟着主播放器对齐：主播放器绝不能被浏览器暂停，否则会把各轨拉回去（66CCFF-0011）
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
    if (roll) roll.invalidate();
  }

  function renderLoopLabel() {
    const parts = [];
    if (loop.a != null) parts.push(formatTime(loop.a));
    if (loop.b != null) parts.push(formatTime(loop.b));
    loopLabel.textContent = parts.length > 0 ? parts.join(" – ") + (loop.enabled ? " · loop" : "") : "";
    loopBtn.classList.toggle("active", loop.enabled);
  }

  function togglePlayback() {
    if (!master) return;
    if (playing) pauseAll();
    else void playAll();
  }

  playBtn.addEventListener("click", togglePlayback);

  // 空格：暂停 / 继续（文字输入框聚焦时让给输入；range / select / button 上仍然控制播放）。
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.code !== "Space" || event.repeat || event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable || target.tagName === "TEXTAREA") return;
        // 纯蓝没有文字输入框；range / select / button 上按空格仍然控制播放。
        if (target.tagName === "INPUT") {
          const type = target.getAttribute("type") ?? "text";
          if (!["range", "checkbox", "radio", "button", "submit"].includes(type)) return;
        }
      }
      if (!master) return;
      event.preventDefault();
      togglePlayback();
    },
    true,
  );

  // 防止聚焦的按钮在 keyup 时把空格又当成一次点击。
  window.addEventListener(
    "keyup",
    (event) => {
      if (event.code !== "Space" || !master) return;
      if (event.target instanceof HTMLElement && event.target.tagName === "BUTTON") {
        event.preventDefault();
      }
    },
    true,
  );

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
      const track = await callOrThrow("66CCFF.importTrack", { path });
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
      await callOrThrow("66CCFF.startSeparation", { trackId }, { runId });
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
      await callOrThrow("66CCFF.deleteTrack", { trackId: detail.id });
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

  transcribeBtn.addEventListener("click", () => void startTranscription());
  transcribeCancelBtn.addEventListener("click", () => {
    if (transcribeRunId) void bridge.cancel(transcribeRunId);
  });
  transcribeInstrumentEl.addEventListener("change", () => {
    instrumentTouched = true;
  });
  transcribeRecheckBtn.addEventListener("click", async () => {
    await loadTranscriptionEngine();
    renderDetail();
  });

  // ---- 启动 ----

  async function init() {
    initRoll();
    await initLanguage();
    await loadEngine();
    await loadTranscriptionEngine();
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
