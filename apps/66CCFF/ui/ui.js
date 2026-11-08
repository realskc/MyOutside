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
      midiRoll: "MIDI 卷帘",
      addMidi: "添加 MIDI",
      clearMidi: "清空",
      midiEmpty: "添加 MIDI 文件查看钢琴卷帘",
      fit: "适应",
      pickerUnavailable: "文件选择器不可用",
      midiLoadFailed: "MIDI 加载失败：",
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
      midiRoll: "MIDI roll",
      addMidi: "Add MIDI",
      clearMidi: "Clear",
      midiEmpty: "Add MIDI files to view the piano roll",
      fit: "Fit",
      pickerUnavailable: "File picker unavailable",
      midiLoadFailed: "Failed to load MIDI: ",
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
  const midiBtn = document.getElementById("btn-midi");
  const midiModal = document.getElementById("midi-modal");
  const midiCanvas = document.getElementById("midi-canvas");
  const midiEmptyEl = document.getElementById("midi-empty");
  const midiLegendEl = document.getElementById("midi-legend");
  const midiNoteInfoEl = document.getElementById("midi-note-info");
  const midiZoomLabel = document.getElementById("midi-zoom-label");
  const midiAddBtn = document.getElementById("btn-midi-add");
  const midiClearBtn = document.getElementById("btn-midi-clear");
  const midiCloseBtn = document.getElementById("btn-midi-close");
  const midiZoomInBtn = document.getElementById("btn-midi-zoom-in");
  const midiZoomOutBtn = document.getElementById("btn-midi-zoom-out");
  const midiFitBtn = document.getElementById("btn-midi-fit");
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

  const MIDI_PAD = { left: 46, right: 14, top: 26, bottom: 20 };
  const MIDI_COLORS = [
    ["#1596cc", "#56b4df", "#0b6d93", "#8bd8f4"],
    ["#d97706", "#efa24b", "#a84f05", "#ffc98c"],
    ["#7c3aed", "#a78bfa", "#5b21b6", "#c4b5fd"],
    ["#0f766e", "#2dd4bf", "#115e59", "#99f6e4"],
  ];
  let midiLayers = [];
  let midiView = { start: 0, pps: 80, pitchMin: 21, pitchMax: 108 };
  let midiFitPps = 80;
  let midiCanvasSize = { w: 0, h: 0 };
  let midiDragging = null;
  let midiHover = null;
  let midiNeedsFit = true;

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

  // ---- MIDI 钢琴卷帘 ----

  function midiNoteName(value) {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const note = Math.round(value);
    return `${names[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
  }

  function midiColor(layerIndex, trackIndex) {
    const palette = MIDI_COLORS[layerIndex % MIDI_COLORS.length];
    return palette[trackIndex % palette.length];
  }

  function allMidiNotes(visibleOnly) {
    const notes = [];
    midiLayers.forEach((layer, layerIndex) => {
      layer.tracks.forEach((track, trackIndex) => {
        if (visibleOnly && !track.visible) return;
        for (const note of track.notes) notes.push({ note, layer, layerIndex, track, trackIndex });
      });
    });
    return notes;
  }

  function midiPlot() {
    const left = MIDI_PAD.left;
    const top = MIDI_PAD.top;
    const plotW = Math.max(1, midiCanvasSize.w - left - MIDI_PAD.right);
    const plotH = Math.max(1, midiCanvasSize.h - top - MIDI_PAD.bottom);
    const pitchCount = Math.max(1, midiView.pitchMax - midiView.pitchMin + 1);
    return { left, top, plotW, plotH, pitchCount, rowH: plotH / pitchCount };
  }

  function midiNoteRect(note, plot) {
    const x = plot.left + (note.time - midiView.start) * midiView.pps;
    const y = plot.top + (midiView.pitchMax - note.midi) * plot.rowH;
    return {
      x,
      y,
      w: Math.max(2, note.duration * midiView.pps),
      h: Math.max(2, plot.rowH - 1),
    };
  }

  function chooseTimeStep(pps) {
    const steps = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const minimumPixels = 74;
    return steps.find((step) => step * pps >= minimumPixels) ?? steps[steps.length - 1];
  }

  function updateMidiEmpty() {
    midiEmptyEl.classList.toggle("hidden", midiLayers.length > 0);
  }

  function updateMidiZoomLabel() {
    const percent = midiFitPps > 0 ? Math.round((midiView.pps / midiFitPps) * 100) : 100;
    midiZoomLabel.textContent = `${percent}%`;
  }

  function renderMidiLegend() {
    midiLegendEl.innerHTML = "";
    midiLayers.forEach((layer, layerIndex) => {
      layer.tracks.forEach((track, trackIndex) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "midi-track-chip" + (track.visible ? "" : " off");
        chip.title = `${layer.name} · ${track.name}`;
        const dot = document.createElement("span");
        dot.className = "midi-color-dot";
        dot.style.background = midiColor(layerIndex, trackIndex);
        const label = document.createElement("span");
        label.textContent = `${layer.name} · ${track.name} (${track.notes.length})`;
        chip.appendChild(dot);
        chip.appendChild(label);
        chip.addEventListener("click", () => {
          track.visible = !track.visible;
          chip.classList.toggle("off", !track.visible);
          updateMidiHover(null);
          drawMidi();
        });
        midiLegendEl.appendChild(chip);
      });
    });
  }

  function fitMidiView() {
    if (!midiCanvasSize.w || !midiCanvasSize.h) return;
    const notes = allMidiNotes(false);
    if (notes.length === 0) {
      midiView = { start: 0, pps: 80, pitchMin: 21, pitchMax: 108 };
      midiFitPps = 80;
      midiNeedsFit = false;
      updateMidiZoomLabel();
      drawMidi();
      return;
    }
    let end = 1;
    let minPitch = 127;
    let maxPitch = 0;
    for (const { note, layer } of notes) {
      end = Math.max(end, note.time + note.duration, layer.duration || 0);
      minPitch = Math.min(minPitch, note.midi);
      maxPitch = Math.max(maxPitch, note.midi);
    }
    midiView.start = 0;
    midiView.pitchMin = Math.max(0, minPitch - 2);
    midiView.pitchMax = Math.min(127, maxPitch + 2);
    midiView.pps = Math.max(1, (midiCanvasSize.w - MIDI_PAD.left - MIDI_PAD.right) / end);
    midiFitPps = midiView.pps;
    midiNeedsFit = false;
    updateMidiZoomLabel();
    drawMidi();
  }

  function zoomMidi(factor, clientX) {
    if (midiLayers.length === 0) return;
    const rect = midiCanvas.getBoundingClientRect();
    const anchorX = clientX == null ? rect.left + rect.width / 2 : clientX;
    const plotLeft = rect.left + MIDI_PAD.left;
    const anchorTime = midiView.start + (anchorX - plotLeft) / midiView.pps;
    const minPps = Math.max(1, midiFitPps * 0.15);
    const maxPps = Math.max(1, midiFitPps * 25);
    midiView.pps = Math.min(maxPps, Math.max(minPps, midiView.pps * factor));
    midiView.start = Math.max(0, anchorTime - (anchorX - plotLeft) / midiView.pps);
    updateMidiZoomLabel();
    drawMidi();
  }

  function drawMidi() {
    if (!midiCanvasSize.w || !midiCanvasSize.h) return;
    const ctx = midiCanvas.getContext("2d");
    const { w, h } = midiCanvasSize;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fbfdff";
    ctx.fillRect(0, 0, w, h);
    if (midiLayers.length === 0) return;

    const plot = midiPlot();
    const start = midiView.start;
    const end = start + plot.plotW / midiView.pps;

    ctx.save();
    ctx.font = '11px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
    ctx.textBaseline = "top";

    const step = chooseTimeStep(midiView.pps);
    for (let time = Math.ceil(start / step) * step; time <= end; time += step) {
      const x = plot.left + (time - start) * midiView.pps;
      ctx.strokeStyle = "rgba(100, 116, 139, 0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, plot.top + plot.plotH);
      ctx.stroke();
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText(formatTime(time), x + 3, 5);
    }

    for (let pitch = midiView.pitchMin; pitch <= midiView.pitchMax; pitch += 1) {
      const y = plot.top + (midiView.pitchMax - pitch) * plot.rowH;
      const octave = pitch % 12 === 0;
      ctx.strokeStyle = octave ? "rgba(100, 116, 139, 0.24)" : "rgba(148, 163, 184, 0.11)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.left + plot.plotW, y);
      ctx.stroke();
      if (octave) {
        ctx.fillStyle = "#94a3b8";
        ctx.textAlign = "right";
        ctx.fillText(midiNoteName(pitch), plot.left - 6, y - 6);
      }
    }

    ctx.globalAlpha = 0.82;
    for (const layer of midiLayers) {
      const layerIndex = midiLayers.indexOf(layer);
      layer.tracks.forEach((track, trackIndex) => {
        if (!track.visible) return;
        ctx.fillStyle = midiColor(layerIndex, trackIndex);
        for (const note of track.notes) {
          if (note.time + note.duration < start || note.time > end) continue;
          const rect = midiNoteRect(note, plot);
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }
      });
    }
    ctx.globalAlpha = 1;

    if (midiHover) {
      const rect = midiNoteRect(midiHover.note, plot);
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }

    ctx.strokeStyle = "rgba(100, 116, 139, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.left, plot.top, plot.plotW, plot.plotH);
    ctx.restore();
  }

  function noteAt(clientX, clientY) {
    if (midiLayers.length === 0) return null;
    const rect = midiCanvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const plot = midiPlot();
    if (x < plot.left || x > plot.left + plot.plotW || y < plot.top || y > plot.top + plot.plotH) {
      return null;
    }
    for (let layerIndex = midiLayers.length - 1; layerIndex >= 0; layerIndex -= 1) {
      const layer = midiLayers[layerIndex];
      for (let trackIndex = layer.tracks.length - 1; trackIndex >= 0; trackIndex -= 1) {
        const track = layer.tracks[trackIndex];
        if (!track.visible) continue;
        for (let i = track.notes.length - 1; i >= 0; i -= 1) {
          const note = track.notes[i];
          const noteRect = midiNoteRect(note, plot);
          if (
            x >= noteRect.x &&
            x <= noteRect.x + noteRect.w &&
            y >= noteRect.y &&
            y <= noteRect.y + noteRect.h
          ) {
            return { note, layer, layerIndex, track, trackIndex };
          }
        }
      }
    }
    return null;
  }

  function updateMidiHover(hit) {
    midiHover = hit;
    if (!hit) {
      midiNoteInfoEl.textContent = "";
      return;
    }
    const { note, layer, track } = hit;
    midiNoteInfoEl.textContent =
      `${layer.name} · ${track.name} · ${midiNoteName(note.midi)} · ` +
      `${note.time.toFixed(2)}s + ${note.duration.toFixed(2)}s · ` +
      `vel ${Math.round(note.velocity * 127)}`;
  }

  function resizeMidiCanvas() {
    if (!midiCanvas) return;
    const rect = midiCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    midiCanvas.width = Math.round(w * dpr);
    midiCanvas.height = Math.round(h * dpr);
    const ctx = midiCanvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    midiCanvasSize = { w, h };
    if (midiNeedsFit) fitMidiView();
    else drawMidi();
  }

  function openMidiModal() {
    midiModal.classList.remove("hidden");
    midiNeedsFit = true;
    requestAnimationFrame(resizeMidiCanvas);
  }

  function closeMidiModal() {
    midiModal.classList.add("hidden");
    midiDragging = null;
    midiCanvas.classList.remove("dragging");
    updateMidiHover(null);
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

    midiAddBtn.disabled = true;
    try {
      for (const path of paths) {
        try {
          const data = await callOrThrow("66CCFF.readMidi", { path });
          midiLayers.push({
            name: data.name,
            path,
            duration: data.duration,
            tracks: data.tracks.map((track) => ({ ...track, visible: true })),
          });
        } catch (error) {
          toast(`${t("midiLoadFailed")}${error.message}`, true);
        }
      }
      midiNeedsFit = true;
      renderMidiLegend();
      updateMidiEmpty();
      resizeMidiCanvas();
    } finally {
      midiAddBtn.disabled = false;
    }
  }

  function clearMidiLayers() {
    midiLayers = [];
    midiNeedsFit = true;
    midiView = { start: 0, pps: 80, pitchMin: 21, pitchMax: 108 };
    midiFitPps = 80;
    renderMidiLegend();
    updateMidiEmpty();
    updateMidiZoomLabel();
    drawMidi();
  }

  function initMidi() {
    midiBtn.addEventListener("click", openMidiModal);
    midiCloseBtn.addEventListener("click", closeMidiModal);
    midiModal.addEventListener("click", (event) => {
      if (event.target === midiModal) closeMidiModal();
    });
    midiAddBtn.addEventListener("click", () => void addMidiFiles());
    midiClearBtn.addEventListener("click", clearMidiLayers);
    midiFitBtn.addEventListener("click", () => {
      midiNeedsFit = true;
      fitMidiView();
    });
    midiZoomInBtn.addEventListener("click", () => zoomMidi(1.25));
    midiZoomOutBtn.addEventListener("click", () => zoomMidi(0.8));

    midiCanvas.addEventListener("mousedown", (event) => {
      if (midiLayers.length === 0) return;
      midiDragging = { clientX: event.clientX, start: midiView.start };
      midiCanvas.classList.add("dragging");
      event.preventDefault();
    });

    window.addEventListener("mousemove", (event) => {
      if (!midiDragging) return;
      const dx = event.clientX - midiDragging.clientX;
      midiView.start = Math.max(0, midiDragging.start - dx / midiView.pps);
      drawMidi();
    });

    window.addEventListener("mouseup", () => {
      if (!midiDragging) return;
      midiDragging = null;
      midiCanvas.classList.remove("dragging");
      drawMidi();
    });

    midiCanvas.addEventListener("mousemove", (event) => {
      if (midiDragging) return;
      updateMidiHover(noteAt(event.clientX, event.clientY));
      drawMidi();
    });

    midiCanvas.addEventListener("mouseleave", () => {
      if (!midiDragging) {
        updateMidiHover(null);
        drawMidi();
      }
    });

    midiCanvas.addEventListener(
      "wheel",
      (event) => {
        if (midiLayers.length === 0) return;
        event.preventDefault();
        if (event.shiftKey) {
          midiView.start = Math.max(
            0,
            midiView.start + (event.deltaY || event.deltaX) / midiView.pps,
          );
          drawMidi();
        } else {
          zoomMidi(event.deltaY < 0 ? 1.15 : 0.87, event.clientX);
        }
      },
      { passive: false },
    );

    window.addEventListener("resize", () => {
      if (midiModal.classList.contains("hidden")) return;
      midiNeedsFit = true;
      resizeMidiCanvas();
    });

    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape" || midiModal.classList.contains("hidden")) return;
        closeMidiModal();
      },
      true,
    );
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
      audio.src = `media://66ccff/${stem.file}`;
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
      if (!midiModal.classList.contains("hidden")) return;
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

  // ---- 启动 ----

  async function init() {
    initMidi();
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
