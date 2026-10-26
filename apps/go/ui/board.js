/* 9 路棋盘：木色、坐标、棋子、最后一手、终局归属图。 */
(() => {
  const SIZE = 9;
  const COLUMNS = ["A", "B", "C", "D", "E", "F", "G", "H", "J"];
  const STARS = [
    [2, 2],
    [2, 6],
    [4, 4],
    [6, 2],
    [6, 6],
  ];

  class GoBoard {
    constructor(canvas, onPlay) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.onPlay = onPlay;
      this.state = null;
      this.hover = null;
      this.size = 0;
      this.dpr = 1;

      canvas.addEventListener("pointermove", (event) => {
        const point = this.pointFromEvent(event);
        if (point?.x === this.hover?.x && point?.y === this.hover?.y) return;
        this.hover = point;
        this.draw();
      });
      canvas.addEventListener("pointerleave", () => {
        this.hover = null;
        this.draw();
      });
      canvas.addEventListener("click", (event) => {
        const point = this.pointFromEvent(event);
        if (point) this.onPlay(point.x, point.y);
      });

      const observer = new ResizeObserver(() => this.resize());
      observer.observe(canvas);
      window.addEventListener("resize", () => this.resize());
      this.resize();
    }

    setState(state) {
      this.state = state;
      this.draw();
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height || rect.width;
      if (width < 2 || height < 2) return;
      const size = Math.max(2, Math.floor(Math.min(width, height)));
      const dpr = window.devicePixelRatio || 1;
      if (size !== this.size || dpr !== this.dpr) {
        this.size = size;
        this.dpr = dpr;
        this.canvas.width = Math.floor(size * dpr);
        this.canvas.height = Math.floor(size * dpr);
      }
      this.draw();
    }

    geometry() {
      const margin = Math.max(20, this.size * 0.085);
      const span = this.size - margin * 2;
      const cell = span / (SIZE - 1);
      return { left: margin, top: margin, span, cell };
    }

    canPlay() {
      const state = this.state;
      return Boolean(
        state &&
          state.status === "playing" &&
          !state.undo &&
          state.mySeat &&
          (state.mySeat === "black" ? state.toPlay === 1 : state.toPlay === -1),
      );
    }

    isEmpty(point) {
      return this.state?.board?.[point.y * SIZE + point.x] === 0;
    }

    pointFromEvent(event) {
      if (!this.size) return null;
      const rect = this.canvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const { left, top, cell } = this.geometry();
      const col = Math.round((px - left) / cell);
      const row = Math.round((py - top) / cell);
      if (col < 0 || col >= SIZE || row < 0 || row >= SIZE) return null;
      const cx = left + col * cell;
      const cy = top + row * cell;
      if (Math.hypot(px - cx, py - cy) > cell * 0.52) return null;
      return { x: col, y: row };
    }

    draw() {
      const ctx = this.ctx;
      const size = this.size;
      if (size < 2) return;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const wood = ctx.createLinearGradient(0, 0, size, size);
      wood.addColorStop(0, "#e3ba78");
      wood.addColorStop(0.45, "#d8a85f");
      wood.addColorStop(1, "#c9954f");
      ctx.fillStyle = wood;
      ctx.fillRect(0, 0, size, size);

      const { left, top, span, cell } = this.geometry();
      if (cell < 2) return;
      const state = this.state;
      const board = state?.board ?? new Array(81).fill(0);

      // 终局归属图：只画空点，棋子仍然压在上面。
      if (state?.scores && state.status === "finished" && state.endReason === "two_passes") {
        const side = cell * 0.56;
        for (let y = 0; y < SIZE; y += 1) {
          for (let x = 0; x < SIZE; x += 1) {
            const index = y * SIZE + x;
            if (board[index] !== 0) continue;
            const owner = state.scores.ownership[index] ?? 0;
            if (owner === 0) continue;
            ctx.fillStyle = owner === 1 ? "rgba(10, 10, 10, 0.24)" : "rgba(255, 255, 255, 0.72)";
            ctx.fillRect(left + x * cell - side / 2, top + y * cell - side / 2, side, side);
            if (owner === -1) {
              ctx.strokeStyle = "rgba(80, 80, 80, 0.35)";
              ctx.lineWidth = 1;
              ctx.strokeRect(left + x * cell - side / 2, top + y * cell - side / 2, side, side);
            }
          }
        }
      }

      // 棋盘线
      ctx.strokeStyle = "#3b2a18";
      ctx.lineWidth = Math.max(1, cell * 0.035);
      ctx.lineCap = "round";
      for (let i = 0; i < SIZE; i += 1) {
        const offset = i * cell;
        ctx.beginPath();
        ctx.moveTo(left, top + offset);
        ctx.lineTo(left + span, top + offset);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(left + offset, top);
        ctx.lineTo(left + offset, top + span);
        ctx.stroke();
      }

      // 星位
      ctx.fillStyle = "#2a1d10";
      for (const [x, y] of STARS) {
        ctx.beginPath();
        ctx.arc(left + x * cell, top + y * cell, Math.max(2, cell * 0.075), 0, Math.PI * 2);
        ctx.fill();
      }

      // 坐标：列 A–J（跳过 I），行 9–1（上到下）
      ctx.fillStyle = "#4a351f";
      ctx.font = `600 ${Math.max(9, Math.floor(cell * 0.3))}px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < SIZE; i += 1) {
        ctx.fillText(COLUMNS[i], left + i * cell, top - cell * 0.56);
        ctx.fillText(String(SIZE - i), left - cell * 0.56, top + i * cell);
      }

      // 棋子
      for (let y = 0; y < SIZE; y += 1) {
        for (let x = 0; x < SIZE; x += 1) {
          const stone = board[y * SIZE + x];
          if (stone === 0) continue;
          this.drawStone(left + x * cell, top + y * cell, cell, stone);
        }
      }

      // 最后一手
      if (state?.lastMove && state.lastAction === "move") {
        const { x, y } = state.lastMove;
        if (board[y * SIZE + x] !== 0) {
          ctx.beginPath();
          ctx.arc(left + x * cell, top + y * cell, cell * 0.2, 0, Math.PI * 2);
          ctx.strokeStyle = "#e53935";
          ctx.lineWidth = Math.max(2, cell * 0.06);
          ctx.stroke();
        }
      }

      // 悬停预览
      if (this.hover && this.canPlay() && this.isEmpty(this.hover)) {
        const { x, y } = this.hover;
        this.drawStone(left + x * cell, top + y * cell, cell, state.toPlay, 0.38);
      }
    }

    drawStone(cx, cy, cell, color, alpha = 1) {
      const ctx = this.ctx;
      const radius = cell * 0.43;
      if (radius <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
      ctx.shadowBlur = cell * 0.09;
      ctx.shadowOffsetY = cell * 0.045;
      const gradient = ctx.createRadialGradient(
        cx - radius * 0.3,
        cy - radius * 0.35,
        radius * 0.12,
        cx,
        cy,
        radius,
      );
      if (color === 1) {
        gradient.addColorStop(0, "#666666");
        gradient.addColorStop(0.45, "#222222");
        gradient.addColorStop(1, "#050505");
      } else {
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.65, "#f2f2f2");
        gradient.addColorStop(1, "#c9c9c9");
      }
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = color === 1 ? "rgba(0, 0, 0, 0.55)" : "rgba(80, 80, 80, 0.45)";
      ctx.lineWidth = Math.max(1, cell * 0.025);
      ctx.stroke();
      ctx.restore();
    }
  }

  window.GoBoard = GoBoard;
})();
