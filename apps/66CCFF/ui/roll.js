/* 纯蓝的钢琴卷帘（66CCFF-0015）。两种模式：
   - 卷帘：时间从左往右，左边一排琴键，几条轨叠在一起、各自一种颜色；上下左右都能滚动和缩放；有小节线；块够大时显示音名；
   - 沉浸：竖着的，音符往下落到底下的琴键上，带小节线，按轨上色，铺满整个窗口。
   时间来自曲目的播放器：卷帘负责看、试听和拖动时间，播放 / 暂停 / 慢放 / 循环都走播放器。 */
(() => {
  "use strict";

  const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const BLACK = new Set([1, 3, 6, 8, 10]);
  const PALETTE = ["#1596cc", "#e8590c", "#7048e8", "#2f9e44", "#d6336c", "#f59f00", "#1098ad", "#4263eb", "#a61e4d", "#74b816"];
  const KEYS_W = 64;
  const RULER_H = 24;
  const MIN_ROW = 4;
  const MAX_ROW = 32;

  const isBlack = (pitch) => BLACK.has(((pitch % 12) + 12) % 12);
  const noteName = (pitch) => `${NOTE_NAMES[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatTime(seconds) {
    const s = Math.max(0, seconds);
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
  }

  /** 第一个开始时间 ≥ time 的音符下标 */
  function lowerBound(notes, time) {
    let lo = 0;
    let hi = notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid].time < time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** 第一个 ≥ value 的下标（数字数组） */
  function lowerBoundValue(values, value) {
    let lo = 0;
    let hi = values.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /**
   * @param {HTMLElement} root
   * @param {{
   *   t: (key: string, ...args: unknown[]) => string,
   *   getTime: () => number,
   *   getDuration: () => number,
   *   isPlaying: () => boolean,
   *   onSeek: (time: number) => void,
   *   onTogglePlay: () => void,
   *   onAudition?: (midi: number, velocity: number) => void,
   *   onVisibilityChange?: () => void,
   *   onRemoveLayer?: (id: string) => void,
   * }} options
   */
  function createPianoRoll(root, options) {
    const { t } = options;

    // ---- DOM ----
    root.innerHTML = "";
    const toolbar = el("div", "roll-toolbar");
    const modeGroup = el("div", "roll-modes");
    const rollModeBtn = el("button", "roll-mode active");
    const fallModeBtn = el("button", "roll-mode");
    modeGroup.append(rollModeBtn, fallModeBtn);
    const playBtn = el("button", "roll-play");
    const timeEl = el("span", "roll-time");
    const followBtn = el("button", "ghost roll-follow active");
    const fitBtn = el("button", "ghost");
    const zoomOutBtn = el("button", "ghost roll-zoom");
    const zoomInBtn = el("button", "ghost roll-zoom");
    const timeZoom = el("div", "roll-zoom-group");
    const timeZoomLabel = el("span", "roll-zoom-label");
    timeZoom.append(timeZoomLabel, zoomOutBtn, zoomInBtn);
    const pitchOutBtn = el("button", "ghost roll-zoom");
    const pitchInBtn = el("button", "ghost roll-zoom");
    const pitchZoom = el("div", "roll-zoom-group roll-pitch-zoom");
    const pitchZoomLabel = el("span", "roll-zoom-label");
    pitchZoom.append(pitchZoomLabel, pitchOutBtn, pitchInBtn);
    const extras = el("div", "roll-extras");
    const exitBtn = el("button", "ghost roll-exit");
    for (const button of [rollModeBtn, fallModeBtn, playBtn, followBtn, fitBtn, zoomOutBtn, zoomInBtn, pitchOutBtn, pitchInBtn, exitBtn]) {
      button.type = "button";
    }
    toolbar.append(modeGroup, playBtn, timeEl, el("span", "spacer"), followBtn, fitBtn, timeZoom, pitchZoom, extras, exitBtn);
    const legend = el("div", "roll-legend");
    const stage = el("div", "roll-stage");
    const canvas = el("canvas", "roll-canvas");
    const tip = el("div", "roll-tip hidden");
    const empty = el("div", "roll-empty");
    stage.append(canvas, tip, empty);
    root.append(toolbar, legend, stage);

    // ---- 状态 ----
    /** @type {Array<{ id: string, name: string, removable?: boolean, duration: number, grid: { beats: number[], bars: number[] }, tracks: Array<{ name: string, notes: any[], visible: boolean, percussion?: boolean, color?: string, maxDuration?: number }> }>} */
    let layers = [];
    let mode = "roll";
    const view = { start: 0, pps: 70, top: 80, rowH: 12 };
    const fall = { pps: 170, low: 36, high: 96 };
    let follow = true;
    let size = { w: 0, h: 0, dpr: 1 };
    let hover = null;
    let drag = null;
    let needsFit = true;
    let frame = null;

    function visibleTracks() {
      const list = [];
      for (const layer of layers) for (const track of layer.tracks) if (track.visible) list.push({ layer, track });
      return list;
    }

    function primaryGrid() {
      const first = visibleTracks()[0];
      return first ? first.layer.grid : null;
    }

    function duration() {
      return Math.max(options.getDuration() || 0, ...layers.map((layer) => layer.duration || 0), 1);
    }

    /** 大部分音符所在的音域（去掉最低、最高各 1% 的零星音），给竖向「适应」用；零星的音滚动过去还能看到 */
    function mainPitchRange() {
      const counts = new Array(128).fill(0);
      let total = 0;
      for (const { track } of visibleTracks()) {
        for (const note of track.notes) {
          counts[note.midi] += 1;
          total += 1;
        }
      }
      if (total === 0) return null;
      if (total < 50) return pitchRange();
      const cut = total * 0.01;
      let lo = 0;
      for (let sum = counts[0]; sum <= cut && lo < 127; ) sum += counts[++lo];
      let hi = 127;
      for (let sum = counts[127]; sum <= cut && hi > 0; ) sum += counts[--hi];
      return lo <= hi ? { lo, hi } : pitchRange();
    }

    function pitchRange() {
      let lo = 127;
      let hi = 0;
      for (const { track } of visibleTracks()) {
        for (const note of track.notes) {
          if (note.midi < lo) lo = note.midi;
          if (note.midi > hi) hi = note.midi;
        }
      }
      return lo > hi ? null : { lo, hi };
    }

    // ---- 文案 ----
    function applyText() {
      rollModeBtn.textContent = t("rollModeRoll");
      fallModeBtn.textContent = t("rollModeFall");
      followBtn.textContent = t("rollFollow");
      followBtn.title = t("rollFollowHint");
      fitBtn.textContent = t("rollFit");
      fitBtn.title = t("rollFitHint");
      timeZoomLabel.textContent = t("rollZoomTime");
      pitchZoomLabel.textContent = t("rollZoomPitch");
      for (const button of [zoomOutBtn, pitchOutBtn]) {
        button.textContent = "−";
        button.title = t("rollZoomOut");
      }
      for (const button of [zoomInBtn, pitchInBtn]) {
        button.textContent = "+";
        button.title = t("rollZoomIn");
      }
      exitBtn.textContent = t("rollExit");
      empty.textContent = t("rollEmpty");
      updatePlayButton();
      renderLegend();
    }

    function updatePlayButton() {
      const playing = options.isPlaying();
      playBtn.textContent = playing ? "❚❚" : "▶";
      playBtn.title = playing ? t("pause") : t("play");
    }

    // ---- 图例：每条轨一个按钮，点一下显示 / 隐藏 ----
    function renderLegend() {
      legend.innerHTML = "";
      for (const layer of layers) {
        const group = el("div", "roll-legend-group");
        const name = el("span", "roll-legend-name", layer.name);
        name.title = layer.name;
        group.appendChild(name);
        for (const track of layer.tracks) {
          const chip = el("button", "roll-chip" + (track.visible ? "" : " off"));
          chip.type = "button";
          const dot = el("span", "roll-dot");
          dot.style.background = track.color;
          chip.append(dot, el("span", "", `${track.name} · ${track.notes.length}`));
          chip.title = track.visible ? t("rollHideTrack") : t("rollShowTrack");
          chip.addEventListener("click", () => {
            track.visible = !track.visible;
            renderLegend();
            if (options.onVisibilityChange) options.onVisibilityChange();
            if (mode === "fall") fitFallRange();
            invalidate();
          });
          group.appendChild(chip);
        }
        if (layer.removable && options.onRemoveLayer) {
          const remove = el("button", "roll-remove", "×");
          remove.type = "button";
          remove.title = t("rollRemoveLayer");
          remove.addEventListener("click", () => options.onRemoveLayer(layer.id));
          group.appendChild(remove);
        }
        legend.appendChild(group);
      }
      empty.classList.toggle("hidden", visibleTracks().length > 0);
    }

    // ---- 视图 ----
    function plot() {
      return { x: KEYS_W, y: RULER_H, w: Math.max(1, size.w - KEYS_W), h: Math.max(1, size.h - RULER_H) };
    }

    const xOf = (time) => KEYS_W + (time - view.start) * view.pps;
    const yOf = (pitch) => RULER_H + (view.top - (pitch + 1)) * view.rowH;
    const timeAt = (x) => view.start + (x - KEYS_W) / view.pps;
    const pitchAt = (y) => Math.floor(view.top - (y - RULER_H) / view.rowH);

    /** 竖向：让大部分音符放得下（行高至少 8px，放不下就从中间看起）；横向：第一次大约 12 秒一屏 */
    function fitView() {
      // 面板还没显示出来时先不算，等有了尺寸再适应
      if (size.w < 80 || size.h < 80) {
        needsFit = true;
        return;
      }
      const p = plot();
      const range = mainPitchRange();
      if (range) {
        const span = range.hi - range.lo + 5;
        view.rowH = clamp(p.h / span, 8, MAX_ROW);
        const visibleRows = p.h / view.rowH;
        const center = (range.lo + range.hi + 1) / 2;
        view.top = Math.min(128, center + visibleRows / 2);
      }
      if (needsFit) {
        view.pps = clamp(p.w / 12, 8, 2000);
        view.start = options.getTime() - (p.w * 0.08) / view.pps;
      }
      needsFit = false;
    }

    function clampView() {
      const p = plot();
      view.rowH = clamp(view.rowH, MIN_ROW, MAX_ROW);
      const rows = p.h / view.rowH;
      view.top = clamp(view.top, Math.min(128, rows), 128);
      view.pps = clamp(view.pps, 2, 4000);
      view.start = clamp(view.start, -1, Math.max(0, duration() - p.w / view.pps / 2));
    }

    /** 沉浸模式的琴键范围：按显示中的音符取整到八度，至少两个八度，最多 88 键 */
    function fitFallRange() {
      const range = pitchRange();
      if (!range) {
        fall.low = 36;
        fall.high = 96;
        return;
      }
      let low = Math.max(21, Math.floor((range.lo - 1) / 12) * 12);
      let high = Math.min(108, Math.ceil((range.hi + 2) / 12) * 12 - 1);
      while (high - low < 23) {
        if (low > 21) low = Math.max(21, low - 12);
        else high = Math.min(108, high + 12);
        if (low === 21 && high === 108) break;
      }
      fall.low = low;
      fall.high = high;
    }

    // ---- 画 ----
    function resize() {
      const rect = stage.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      size = { w: Math.max(1, Math.floor(rect.width)), h: Math.max(1, Math.floor(rect.height)), dpr };
      canvas.width = Math.floor(size.w * dpr);
      canvas.height = Math.floor(size.h * dpr);
      canvas.style.width = `${size.w}px`;
      canvas.style.height = `${size.h}px`;
      if (needsFit && layers.length > 0) fitView();
      invalidate();
    }

    function invalidate() {
      if (frame === null) frame = requestAnimationFrame(loop);
    }

    function loop() {
      frame = null;
      draw();
      if (options.isPlaying()) frame = requestAnimationFrame(loop);
    }

    function draw() {
      updatePlayButton();
      const time = options.getTime();
      timeEl.textContent = `${formatTime(time)} / ${formatTime(duration())}`;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      if (mode === "fall") drawFall(ctx, time);
      else drawRoll(ctx, time);
    }

    /** 某一刻正在响的音（用来点亮琴键） */
    function activeAt(time) {
      const active = new Map();
      for (const { track } of visibleTracks()) {
        const notes = track.notes;
        let i = lowerBound(notes, time - (track.maxDuration ?? 8));
        for (; i < notes.length && notes[i].time <= time; i += 1) {
          const note = notes[i];
          if (note.time + note.duration > time) active.set(note.midi, track.color);
        }
      }
      return active;
    }

    function drawRoll(ctx, time) {
      const p = plot();
      if (follow && options.isPlaying()) {
        const x = xOf(time);
        if (x > p.x + p.w * 0.88 || x < p.x) view.start = time - (p.w * 0.08) / view.pps;
      }
      clampView();
      const lowPitch = Math.max(0, Math.floor(view.top - p.h / view.rowH) - 1);
      const highPitch = Math.min(127, Math.ceil(view.top));

      // 行底色：黑键行深一点；每个 C 下面一条八度线
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(p.x, p.y, p.w, p.h);
      for (let pitch = lowPitch; pitch <= highPitch; pitch += 1) {
        const y = yOf(pitch);
        if (isBlack(pitch)) {
          ctx.fillStyle = "#f2f6fa";
          ctx.fillRect(p.x, y, p.w, view.rowH);
        }
        if (pitch % 12 === 0) {
          ctx.fillStyle = "#cfd8e3";
          ctx.fillRect(p.x, y + view.rowH - 1, p.w, 1);
        }
      }

      // 拍线和小节线
      const grid = primaryGrid();
      const startTime = view.start;
      const endTime = timeAt(size.w);
      if (grid) {
        const beatGap = grid.beats.length > 1 ? (grid.beats[1] - grid.beats[0]) * view.pps : 999;
        if (beatGap >= 8) {
          ctx.fillStyle = "rgba(100, 116, 139, 0.10)";
          for (let i = lowerBoundValue(grid.beats, startTime); i < grid.beats.length && grid.beats[i] <= endTime; i += 1) {
            ctx.fillRect(Math.round(xOf(grid.beats[i])), p.y, 1, p.h);
          }
        }
        ctx.fillStyle = "rgba(71, 85, 105, 0.32)";
        for (let i = lowerBoundValue(grid.bars, startTime); i < grid.bars.length && grid.bars[i] <= endTime; i += 1) {
          ctx.fillRect(Math.round(xOf(grid.bars[i])), p.y, 1, p.h);
        }
      }

      // 音符
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.x, p.y, p.w, p.h);
      ctx.clip();
      const showNames = view.rowH >= 11;
      ctx.font = `${Math.min(11, Math.floor(view.rowH) - 2)}px -apple-system, "Segoe UI", sans-serif`;
      ctx.textBaseline = "middle";
      for (const { track } of visibleTracks()) {
        const notes = track.notes;
        for (let i = lowerBound(notes, startTime - (track.maxDuration ?? 8)); i < notes.length && notes[i].time <= endTime; i += 1) {
          const note = notes[i];
          if (note.midi < lowPitch || note.midi > highPitch) continue;
          const x = xOf(note.time);
          const w = Math.max(2, note.duration * view.pps);
          if (x + w < p.x) continue;
          const y = yOf(note.midi) + 1;
          const h = Math.max(2, view.rowH - 2);
          const sounding = note.time <= time && note.time + note.duration > time;
          ctx.globalAlpha = sounding ? 1 : 0.5 + 0.4 * note.velocity;
          ctx.fillStyle = track.color;
          roundRect(ctx, x, y, w, h, 3);
          ctx.fill();
          if (hover && hover.note === note) {
            ctx.globalAlpha = 1;
            ctx.strokeStyle = "#0f172a";
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          if (showNames && w >= 26) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = "#ffffff";
            ctx.fillText(noteName(note.midi), Math.max(x, p.x) + 4, y + h / 2 + 0.5);
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // 播放头
      const playX = xOf(time);
      if (playX >= p.x && playX <= size.w) {
        ctx.fillStyle = "#e03131";
        ctx.fillRect(Math.round(playX) - 1, p.y, 2, p.h);
      }

      // 标尺：小节号（太密时隔几个标一个），没有节拍信息时标时间
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(p.x, 0, p.w, RULER_H);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(p.x, RULER_H - 1, p.w, 1);
      ctx.font = '11px -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = "#64748b";
      ctx.textBaseline = "middle";
      if (grid && grid.bars.length > 1) {
        const barGap = (grid.bars[1] - grid.bars[0]) * view.pps;
        const every = barGap >= 32 ? 1 : barGap >= 16 ? 2 : barGap >= 8 ? 4 : 8;
        grid.bars.forEach((bar, index) => {
          if (index % every !== 0 || bar < startTime - 1 || bar > endTime) return;
          const x = xOf(bar);
          ctx.fillRect(Math.round(x), RULER_H - 7, 1, 6);
          ctx.fillText(String(index + 1), x + 3, RULER_H / 2 - 2);
        });
      } else {
        const steps = [0.5, 1, 2, 5, 10, 15, 30, 60];
        const step = steps.find((value) => value * view.pps >= 60) ?? 60;
        for (let s = Math.ceil(startTime / step) * step; s <= endTime; s += step) {
          const x = xOf(s);
          ctx.fillRect(Math.round(x), RULER_H - 7, 1, 6);
          ctx.fillText(formatTime(s).replace(/\.\d$/, ""), x + 3, RULER_H / 2 - 2);
        }
      }
      if (playX >= p.x && playX <= size.w) {
        ctx.fillStyle = "#e03131";
        ctx.beginPath();
        ctx.moveTo(playX - 5, 0);
        ctx.lineTo(playX + 5, 0);
        ctx.lineTo(playX, 8);
        ctx.closePath();
        ctx.fill();
      }

      // 左边的琴键：正在响的键用轨的颜色点亮
      const active = activeAt(time);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, KEYS_W, size.h);
      for (let pitch = lowPitch; pitch <= highPitch; pitch += 1) {
        const y = yOf(pitch);
        if (y > size.h || y + view.rowH < RULER_H) continue;
        const color = active.get(pitch);
        if (isBlack(pitch)) {
          ctx.fillStyle = color ?? "#334155";
          ctx.fillRect(0, y + 1, KEYS_W * 0.62, Math.max(1, view.rowH - 2));
        } else {
          if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(0, y, KEYS_W, view.rowH);
          }
          ctx.fillStyle = "#dbe3ec";
          ctx.fillRect(0, y + view.rowH - 1, KEYS_W, 1);
        }
        if (pitch % 12 === 0 && view.rowH >= 7) {
          ctx.fillStyle = color ? "#ffffff" : "#64748b";
          ctx.font = `${Math.min(11, Math.floor(view.rowH))}px -apple-system, "Segoe UI", sans-serif`;
          ctx.textAlign = "right";
          ctx.fillText(noteName(pitch), KEYS_W - 5, y + view.rowH / 2 + 0.5);
          ctx.textAlign = "left";
        }
      }
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, KEYS_W, RULER_H);
      ctx.fillStyle = "#cbd5e1";
      ctx.fillRect(KEYS_W - 1, 0, 1, size.h);
    }

    /** 沉浸模式里琴键的位置：白键等宽，黑键压在两个白键之间 */
    function fallKeys() {
      const whites = [];
      for (let pitch = fall.low; pitch <= fall.high; pitch += 1) if (!isBlack(pitch)) whites.push(pitch);
      const whiteW = size.w / Math.max(1, whites.length);
      const blackW = whiteW * 0.62;
      const geometry = new Map();
      whites.forEach((pitch, index) => geometry.set(pitch, { x: index * whiteW, w: whiteW, black: false }));
      for (let pitch = fall.low; pitch <= fall.high; pitch += 1) {
        if (!isBlack(pitch)) continue;
        const below = geometry.get(pitch - 1);
        if (below) geometry.set(pitch, { x: below.x + whiteW - blackW / 2, w: blackW, black: true });
      }
      return { geometry, whiteW };
    }

    function fallMetrics() {
      const keysH = clamp(size.h * 0.17, 70, 160);
      const progressH = 6;
      return { keysH, nowY: size.h - keysH, progressH };
    }

    function drawFall(ctx, time) {
      const { keysH, nowY, progressH } = fallMetrics();
      const { geometry } = fallKeys();
      const pps = fall.pps;
      const ahead = nowY / pps;

      const background = ctx.createLinearGradient(0, 0, 0, nowY);
      background.addColorStop(0, "#0b1220");
      background.addColorStop(1, "#111c33");
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, size.w, nowY);
      // 每个 C 一条竖线，帮助对位
      ctx.fillStyle = "rgba(148, 163, 184, 0.10)";
      for (const [pitch, key] of geometry) if (pitch % 12 === 0) ctx.fillRect(Math.round(key.x), 0, 1, nowY);

      // 小节线（横线）和小节号
      const grid = primaryGrid();
      if (grid) {
        ctx.font = '11px -apple-system, "Segoe UI", sans-serif';
        ctx.textBaseline = "bottom";
        grid.bars.forEach((bar, index) => {
          if (bar < time - 0.05 || bar > time + ahead) return;
          const y = nowY - (bar - time) * pps;
          ctx.fillStyle = "rgba(148, 163, 184, 0.28)";
          ctx.fillRect(0, Math.round(y), size.w, 1);
          ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
          ctx.fillText(String(index + 1), 6, y - 2);
        });
      }

      // 落下的音符
      ctx.textBaseline = "bottom";
      for (const { track } of visibleTracks()) {
        const notes = track.notes;
        for (let i = lowerBound(notes, time - (track.maxDuration ?? 8)); i < notes.length && notes[i].time <= time + ahead; i += 1) {
          const note = notes[i];
          const key = geometry.get(note.midi);
          if (!key) continue;
          const bottom = Math.min(nowY, nowY - (note.time - time) * pps);
          const top = nowY - (note.time + note.duration - time) * pps;
          if (bottom <= top || bottom < 0) continue;
          const sounding = note.time <= time && note.time + note.duration > time;
          const inset = key.black ? 1 : 2;
          ctx.globalAlpha = sounding ? 1 : 0.88;
          ctx.fillStyle = track.color;
          roundRect(ctx, key.x + inset, top, key.w - inset * 2, bottom - top, 4);
          ctx.fill();
          if (sounding) {
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = "#ffffff";
            roundRect(ctx, key.x + inset, top, key.w - inset * 2, bottom - top, 4);
            ctx.fill();
          }
          if (key.w >= 16 && bottom - top >= 16) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = "#ffffff";
            ctx.font = `${Math.min(12, Math.floor(key.w * 0.45))}px -apple-system, "Segoe UI", sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText(noteName(note.midi).replace(/-?\d+$/, ""), key.x + key.w / 2, bottom - 3);
            ctx.textAlign = "left";
          }
        }
      }
      ctx.globalAlpha = 1;

      // 「现在」这条线
      ctx.fillStyle = "#66ccff";
      ctx.fillRect(0, nowY - 2, size.w, 2);

      // 底下的琴键
      const active = activeAt(time);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(0, nowY, size.w, keysH);
      for (const [pitch, key] of geometry) {
        if (key.black) continue;
        ctx.fillStyle = active.get(pitch) ?? "#fdfdfd";
        ctx.fillRect(key.x + 0.5, nowY, key.w - 1, keysH - 2);
        if (pitch % 12 === 0 && key.w >= 14) {
          ctx.fillStyle = active.has(pitch) ? "#ffffff" : "#94a3b8";
          ctx.font = `${Math.min(11, Math.floor(key.w * 0.42))}px -apple-system, "Segoe UI", sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(noteName(pitch), key.x + key.w / 2, nowY + keysH - 6);
          ctx.textAlign = "left";
        }
      }
      for (const [pitch, key] of geometry) {
        if (!key.black) continue;
        ctx.fillStyle = active.get(pitch) ?? "#1e293b";
        roundRect(ctx, key.x, nowY, key.w, keysH * 0.62, 3);
        ctx.fill();
      }

      // 顶上的进度条（点一下跳转）
      ctx.fillStyle = "rgba(148, 163, 184, 0.25)";
      ctx.fillRect(0, 0, size.w, progressH);
      ctx.fillStyle = "#66ccff";
      ctx.fillRect(0, 0, size.w * clamp(time / duration(), 0, 1), progressH);
    }

    // ---- 交互 ----
    function noteAt(x, y) {
      if (x < KEYS_W || y < RULER_H) return null;
      const time = timeAt(x);
      const pitch = pitchAt(y);
      const tracks = visibleTracks();
      for (let k = tracks.length - 1; k >= 0; k -= 1) {
        const { track, layer } = tracks[k];
        const notes = track.notes;
        for (let i = lowerBound(notes, time - (track.maxDuration ?? 8)); i < notes.length && notes[i].time <= time; i += 1) {
          const note = notes[i];
          if (note.midi === pitch && note.time + note.duration >= time) return { note, track, layer };
        }
      }
      return null;
    }

    function showTip(hit, clientX, clientY) {
      if (!hit) {
        tip.classList.add("hidden");
        return;
      }
      const { note, track, layer } = hit;
      tip.textContent = `${noteName(note.midi)} · ${formatTime(note.time)} · ${note.duration.toFixed(2)}s · ${t("rollVelocity")} ${Math.round(note.velocity * 127)} · ${layer.name} / ${track.name}`;
      const rect = stage.getBoundingClientRect();
      tip.style.left = `${Math.min(rect.width - 260, clientX - rect.left + 12)}px`;
      tip.style.top = `${clientY - rect.top + 14}px`;
      tip.classList.remove("hidden");
    }

    function localPoint(event) {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.h : 1;
        const dx = event.deltaX * scale;
        const dy = event.deltaY * scale;
        const { x, y } = localPoint(event);
        if (mode === "fall") {
          if (event.ctrlKey || event.metaKey) {
            fall.pps = clamp(fall.pps * Math.exp(-dy * 0.01), 40, 900);
          } else {
            // 滚动 = 拖动时间：往下滚往后走
            options.onSeek(clamp(options.getTime() + dy / fall.pps, 0, duration()));
          }
          invalidate();
          return;
        }
        if ((event.ctrlKey || event.metaKey) && x < KEYS_W) {
          // 在左边琴键上捏合 / ⌘ + 滚动：竖向缩放
          zoomPitchAt(y, Math.exp(-dy * 0.01));
        } else if (event.ctrlKey || event.metaKey) {
          // 横向缩放（触控板双指捏合也走这里），以鼠标所在的时间为中心
          const anchor = timeAt(x);
          view.pps = clamp(view.pps * Math.exp(-dy * 0.01), 2, 4000);
          view.start = anchor - (x - KEYS_W) / view.pps;
        } else if (event.altKey) {
          // 竖向缩放，以鼠标所在的音高为中心
          zoomPitchAt(y, Math.exp(-dy * 0.01));
        } else {
          const horizontal = dx !== 0 ? dx : event.shiftKey ? dy : 0;
          const vertical = event.shiftKey && dx === 0 ? 0 : dy;
          if (horizontal !== 0) {
            view.start += horizontal / view.pps;
            if (options.isPlaying()) setFollow(false);
          }
          view.top -= vertical / view.rowH;
        }
        invalidate();
      },
      { passive: false },
    );

    canvas.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      const { x, y } = localPoint(event);
      if (mode === "fall") {
        const { nowY, progressH } = fallMetrics();
        if (y <= progressH + 6) {
          options.onSeek(clamp((x / size.w) * duration(), 0, duration()));
          drag = { kind: "progress" };
        } else if (y >= nowY) {
          const { geometry } = fallKeys();
          let hit = null;
          for (const [pitch, key] of geometry) {
            const inKey = x >= key.x && x <= key.x + key.w && (key.black ? y <= nowY + fallMetrics().keysH * 0.62 : true);
            if (inKey && (!hit || key.black)) hit = pitch;
          }
          if (hit !== null && options.onAudition) options.onAudition(hit, 0.8);
        }
        event.preventDefault();
        return;
      }
      if (y < RULER_H && x >= KEYS_W) {
        options.onSeek(clamp(timeAt(x), 0, duration()));
        drag = { kind: "seek" };
      } else if (x < KEYS_W) {
        if (options.onAudition) options.onAudition(pitchAt(y), 0.8);
      } else {
        const hit = noteAt(x, y);
        if (hit && options.onAudition) options.onAudition(hit.note.midi, hit.note.velocity);
        drag = { kind: "pan", x: event.clientX, y: event.clientY, start: view.start, top: view.top };
        canvas.classList.add("dragging");
      }
      event.preventDefault();
    });

    window.addEventListener("mousemove", (event) => {
      if (drag) {
        if (drag.kind === "seek") {
          options.onSeek(clamp(timeAt(localPoint(event).x), 0, duration()));
        } else if (drag.kind === "progress") {
          options.onSeek(clamp((localPoint(event).x / size.w) * duration(), 0, duration()));
        } else {
          view.start = drag.start - (event.clientX - drag.x) / view.pps;
          view.top = drag.top + (event.clientY - drag.y) / view.rowH;
          if (options.isPlaying() && Math.abs(event.clientX - drag.x) > 3) setFollow(false);
        }
        invalidate();
        return;
      }
      if (event.target !== canvas || mode !== "roll") return;
      const { x, y } = localPoint(event);
      const hit = noteAt(x, y);
      if ((hit && hit.note) !== (hover && hover.note)) {
        hover = hit;
        invalidate();
      }
      showTip(hit, event.clientX, event.clientY);
    });

    window.addEventListener("mouseup", () => {
      if (!drag) return;
      drag = null;
      canvas.classList.remove("dragging");
    });

    canvas.addEventListener("mouseleave", () => {
      if (hover) {
        hover = null;
        invalidate();
      }
      tip.classList.add("hidden");
    });

    /** 竖向缩放，y 处的音高不动 */
    function zoomPitchAt(y, factor) {
      const anchor = view.top - (y - RULER_H) / view.rowH;
      view.rowH = clamp(view.rowH * factor, MIN_ROW, MAX_ROW);
      view.top = anchor + (y - RULER_H) / view.rowH;
    }

    function setFollow(on) {
      follow = on;
      followBtn.classList.toggle("active", on);
    }

    function setMode(next) {
      if (next === mode) return;
      mode = next;
      rollModeBtn.classList.toggle("active", mode === "roll");
      fallModeBtn.classList.toggle("active", mode === "fall");
      root.classList.toggle("immersive", mode === "fall");
      document.body.classList.toggle("roll-immersive", mode === "fall");
      tip.classList.add("hidden");
      if (mode === "fall") fitFallRange();
      requestAnimationFrame(resize);
    }

    rollModeBtn.addEventListener("click", () => setMode("roll"));
    fallModeBtn.addEventListener("click", () => setMode("fall"));
    exitBtn.addEventListener("click", () => setMode("roll"));
    playBtn.addEventListener("click", () => options.onTogglePlay());
    followBtn.addEventListener("click", () => {
      setFollow(!follow);
      invalidate();
    });
    fitBtn.addEventListener("click", () => {
      if (mode === "fall") {
        fitFallRange();
        fall.pps = 170;
        invalidate();
        return;
      }
      fitView();
      view.start = options.getTime() - (plot().w * 0.08) / view.pps;
      invalidate();
    });
    const zoomBy = (factor) => {
      if (mode === "fall") {
        fall.pps = clamp(fall.pps * factor, 40, 900);
      } else {
        // 播放头在画面里就以它为中心缩放，不在就以画面中间为中心
        const p = plot();
        const playX = xOf(options.getTime());
        const anchorX = playX >= p.x && playX <= p.x + p.w ? playX : p.x + p.w / 2;
        const anchor = timeAt(anchorX);
        view.pps = clamp(view.pps * factor, 2, 4000);
        view.start = anchor - (anchorX - KEYS_W) / view.pps;
      }
      invalidate();
    };
    zoomInBtn.addEventListener("click", () => zoomBy(1.25));
    zoomOutBtn.addEventListener("click", () => zoomBy(0.8));
    const zoomPitch = (factor) => {
      zoomPitchAt(RULER_H + plot().h / 2, factor);
      invalidate();
    };
    pitchInBtn.addEventListener("click", () => zoomPitch(1.25));
    pitchOutBtn.addEventListener("click", () => zoomPitch(0.8));
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && mode === "fall") setMode("roll");
    });

    new ResizeObserver(() => resize()).observe(stage);

    applyText();

    return {
      /** 工具栏，调用方可以往 `extras` 里放自己的按钮（例如「添加 MIDI 文件」） */
      extras,

      /** 换一组图层；颜色按顺序分配；第一次有内容时自动适应 */
      setLayers(next) {
        let colorIndex = 0;
        for (const layer of next) {
          for (const track of layer.tracks) {
            if (!track.color) track.color = PALETTE[colorIndex % PALETTE.length];
            colorIndex += 1;
            // 查找都靠按开始时间排好序（二分）
            if (track.notes.some((note, i) => i > 0 && note.time < track.notes[i - 1].time)) {
              track.notes = track.notes.slice().sort((a, b) => a.time - b.time);
            }
            if (track.maxDuration === undefined) {
              track.maxDuration = track.notes.reduce((max, note) => Math.max(max, note.duration), 0);
            }
          }
        }
        const hadContent = visibleTracks().length > 0;
        layers = next;
        renderLegend();
        if (!hadContent && visibleTracks().length > 0) {
          needsFit = true;
          fitView();
        }
        if (mode === "fall") fitFallRange();
        invalidate();
      },

      /** 显示中、有音高的音符（给合成器用） */
      audibleNotes() {
        const list = [];
        for (const { track } of visibleTracks()) if (!track.percussion) list.push(...track.notes);
        return list;
      },

      hasVisible() {
        return visibleTracks().length > 0;
      },

      invalidate,
      setMode,
      getMode: () => mode,
      refreshText: applyText,
    };
  }

  window.createPianoRoll = createPianoRoll;
})();
