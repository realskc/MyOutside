/* 围棋：双人联机、特殊提子规则、只数围空、聊天。 */
(() => {
  const bridge = window.outside;
  if (!bridge) {
    document.body.innerHTML =
      "<p style='padding:24px'>Please open this page inside MyOutside.</p>";
    return;
  }

  const COLS = ["A", "B", "C", "D", "E", "F", "G", "H", "J"];
  const TOKEN_KEY = "myoutside.go.playerToken";

  const DICT = {
    zh: {
      appTitle: "围棋",
      waiting: "等待对手加入",
      waitingFor: (color) => `等待${color}加入`,
      youBlack: "你是黑方",
      youWhite: "你是白方",
      spectator: "观战中",
      black: "黑方",
      white: "白方",
      joined: "已入座",
      emptySeat: "空位",
      you: "你",
      turnBlack: "轮到黑方",
      turnWhite: "轮到白方",
      yourTurn: "轮到你",
      waitingTurn: "等待对方",
      finished: "对局结束",
      moveCount: (n) => `第 ${n} 手`,
      lastMove: (coord) => `上一手 ${coord}`,
      lastPass: "上一手 Pass",
      pass: "Pass",
      resign: "认输",
      newGame: "新对局",
      swapColors: "交换黑白",
      resetSeats: "重置座位",
      undo: "悔棋",
      undoWaiting: "等待对方同意悔棋…",
      undoRequestedBy: (color) => `${color}请求悔棋`,
      undoSpectator: (color) => `${color}请求悔棋`,
      acceptUndo: "同意",
      rejectUndo: "拒绝",
      cancelUndo: "取消请求",
      toastUndoRequested: "已发送悔棋请求",
      toastUndoAccepted: "已同意悔棋",
      toastUndoRejected: "已拒绝悔棋",
      toastUndoCanceled: "已取消悔棋请求",
      toastUndoPending: "请先处理悔棋请求",
      records: "棋谱",
      recordsEmpty: "还没有棋谱",
      recordBack: "返回列表",
      replayPrev: "上一手",
      replayNext: "下一手",
      replayStep: (i, n) => `第 ${i} / ${n} 手`,
      replayStart: "开局",
      recordAbandoned: "未完成",
      recordCapture: (winner) => `${winner}胜（提子）`,
      recordResign: (winner) => `${winner}胜（认输）`,
      recordScore: (b, w) => `黑 ${b} 目 / 白 ${w} 目`,
      recordMoves: (n) => `${n} 手`,
      replayCaptured: (n) => `提 ${n} 子`,
      resultTitle: "结果",
      resultCapture: (winner, loser, n) => `${loser}有 ${n} 子被吃，${winner}胜`,
      resultResign: (winner, loser) => `${loser}认输，${winner}胜`,
      resultScore: (b, w, n) => `黑方 ${b} 目 · 白方 ${w} 目 · 中立 ${n} 点`,
      noWinner: "本局不判胜负",
      scoreDetail: "只数围空，不计子；中立空点不算任何一方。",
      captureDetail: "提子即终局，不点目。",
      resignDetail: "认输即终局，不点目。",
      chat: "聊天",
      chatPlaceholder: "发消息…",
      chatSpectator: "观战只读",
      send: "发送",
      emptyChat: "还没有消息",
      youLabel: "你",
      blackShort: "黑",
      whiteShort: "白",
      toastNotYourTurn: "还没轮到你",
      toastNotPlaying: "对局还没有开始或已经结束",
      toastSpectator: "观战中不能落子",
      confirmResign: "确定认输吗？",
      confirmNewGame: "开始新对局？当前棋局和聊天会清空。",
      confirmSwap: "交换黑白？只能开局前交换。",
      confirmReset: "重置座位？双方会重新入座，当前棋局和聊天会清空。",
      toastNewGame: "已开始新对局",
      toastSwapped: "已交换黑白",
      toastReset: "座位已重置",
      networkError: "连接断开，正在重试…",
      connecting: "连接中…",
      errorPrefix: "操作失败：",
    },
    en: {
      appTitle: "Go",
      waiting: "Waiting for opponent",
      waitingFor: (color) => `Waiting for ${color}`,
      youBlack: "You are Black",
      youWhite: "You are White",
      spectator: "Spectating",
      black: "Black",
      white: "White",
      joined: "Seated",
      emptySeat: "Empty",
      you: "You",
      turnBlack: "Black to play",
      turnWhite: "White to play",
      yourTurn: "Your turn",
      waitingTurn: "Waiting for opponent",
      finished: "Game over",
      moveCount: (n) => `Move ${n}`,
      lastMove: (coord) => `Last move ${coord}`,
      lastPass: "Last move: Pass",
      pass: "Pass",
      resign: "Resign",
      newGame: "New game",
      swapColors: "Swap colors",
      resetSeats: "Reset seats",
      undo: "Undo",
      undoWaiting: "Waiting for opponent to accept…",
      undoRequestedBy: (color) => `${color} requests an undo`,
      undoSpectator: (color) => `${color} requests an undo`,
      acceptUndo: "Accept",
      rejectUndo: "Reject",
      cancelUndo: "Cancel request",
      toastUndoRequested: "Undo request sent",
      toastUndoAccepted: "Undo accepted",
      toastUndoRejected: "Undo rejected",
      toastUndoCanceled: "Undo request cancelled",
      toastUndoPending: "Resolve the undo request first",
      records: "Records",
      recordsEmpty: "No records yet",
      recordBack: "Back to list",
      replayPrev: "Previous",
      replayNext: "Next",
      replayStep: (i, n) => `Move ${i} / ${n}`,
      replayStart: "Start",
      recordAbandoned: "Unfinished",
      recordCapture: (winner) => `${winner} won by capture`,
      recordResign: (winner) => `${winner} won by resignation`,
      recordScore: (b, w) => `Black ${b} / White ${w}`,
      recordMoves: (n) => `${n} moves`,
      replayCaptured: (n) => `${n} captured`,
      resultTitle: "Result",
      resultCapture: (winner, loser, n) =>
        `${loser} lost ${n} stone${n === 1 ? "" : "s"} — ${winner} wins`,
      resultResign: (winner, loser) => `${loser} resigned — ${winner} wins`,
      resultScore: (b, w, n) => `Black ${b} points · White ${w} points · Neutral ${n}`,
      noWinner: "No winner by score",
      scoreDetail:
        "Territory only; stones are not counted. Neutral empty points belong to neither side.",
      captureDetail: "Capture ends the game; no scoring.",
      resignDetail: "Resignation ends the game; no scoring.",
      chat: "Chat",
      chatPlaceholder: "Message…",
      chatSpectator: "Read-only",
      send: "Send",
      emptyChat: "No messages yet",
      youLabel: "You",
      blackShort: "B",
      whiteShort: "W",
      toastNotYourTurn: "Not your turn",
      toastNotPlaying: "The game is not in progress",
      toastSpectator: "Spectators cannot play",
      confirmResign: "Resign this game?",
      confirmNewGame: "Start a new game? The board and chat will be cleared.",
      confirmSwap: "Swap colors? Only before the first move.",
      confirmReset: "Reset seats? Both players will rejoin; the current game and chat will be cleared.",
      toastNewGame: "New game started",
      toastSwapped: "Colors swapped",
      toastReset: "Seats reset",
      networkError: "Disconnected, retrying…",
      connecting: "Connecting…",
      errorPrefix: "Action failed: ",
    },
  };

  let lang = "zh";
  let token = getToken();
  let state = null;
  let joined = false;
  let polling = false;
  let connected = true;
  let lastChatSignature = "";
  let currentRecord = null;
  let replayIndex = 0;

  const canvas = document.getElementById("board");
  const board = new window.GoBoard(canvas, play);
  const replayCanvas = document.getElementById("replay-board");
  const replayBoard = new window.GoBoard(replayCanvas, () => {});
  const statusEl = document.getElementById("status");
  const youEl = document.getElementById("you");
  const turnEl = document.getElementById("turn");
  const moveCountEl = document.getElementById("move-count");
  const resultEl = document.getElementById("result");
  const resultTextEl = document.getElementById("result-text");
  const resultDetailEl = document.getElementById("result-detail");
  const blackStateEl = document.getElementById("black-state");
  const whiteStateEl = document.getElementById("white-state");
  const chatMessagesEl = document.getElementById("chat-messages");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const chatHint = document.getElementById("chat-hint");
  const passButton = document.getElementById("btn-pass");
  const resignButton = document.getElementById("btn-resign");
  const newButton = document.getElementById("btn-new");
  const swapButton = document.getElementById("btn-swap");
  const resetButton = document.getElementById("btn-reset");
  const undoButton = document.getElementById("btn-undo");
  const undoPanel = document.getElementById("undo-panel");
  const undoText = document.getElementById("undo-text");
  const undoAccept = document.getElementById("btn-undo-accept");
  const undoReject = document.getElementById("btn-undo-reject");
  const undoCancel = document.getElementById("btn-undo-cancel");
  const recordsButton = document.getElementById("btn-records");
  const recordsModal = document.getElementById("records-modal");
  const recordsList = document.getElementById("records-list");
  const recordView = document.getElementById("record-view");
  const recordsClose = document.getElementById("records-close");
  const recordBack = document.getElementById("record-back");
  const recordTitle = document.getElementById("record-title");
  const replayPrev = document.getElementById("replay-prev");
  const replayNext = document.getElementById("replay-next");
  const replayStep = document.getElementById("replay-step");
  const replayMove = document.getElementById("replay-move");
  const toastEl = document.getElementById("toast");

  let toastTimer = null;

  function t(key, ...args) {
    const value = DICT[lang][key] ?? DICT.zh[key] ?? key;
    return typeof value === "function" ? value(...args) : value;
  }

  function makeToken() {
    const bytes = new Uint8Array(16);
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function getToken() {
    try {
      const saved = localStorage.getItem(TOKEN_KEY);
      if (saved) return saved;
      const created = makeToken();
      localStorage.setItem(TOKEN_KEY, created);
      return created;
    } catch {
      return makeToken();
    }
  }

  async function call(name, payload) {
    const response = await bridge.call(name, payload);
    if (!response || !response.ok) {
      throw new Error(response?.error?.message ?? "unknown error");
    }
    return response.result;
  }

  function colorOf(seat) {
    return seat === "black" ? 1 : seat === "white" ? -1 : 0;
  }

  function colorName(seat) {
    return t(seat === "black" ? "black" : "white");
  }

  function colorShort(seat) {
    return t(seat === "black" ? "blackShort" : "whiteShort");
  }

  function coordLabel(point) {
    if (!point) return "";
    return `${COLS[point.x]}${9 - point.y}`;
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2600);
  }

  function applyLanguage() {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = t("appTitle");
    for (const element of document.querySelectorAll("[data-i18n]")) {
      element.textContent = t(element.dataset.i18n);
    }
    for (const element of document.querySelectorAll("[data-i18n-placeholder]")) {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    }
    if (state) render();
  }

  async function initLanguage() {
    let value = null;
    try {
      const response = await bridge.call("platform.settings.get", { key: "ui.language" });
      value = response?.ok ? response.result?.value : null;
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

  function statusText(current) {
    if (!current) return t("connecting");
    if (!connected) return t("networkError");
    if (current.status === "waiting") {
      if (!current.players.black) return t("waitingFor", t("black"));
      if (!current.players.white) return t("waitingFor", t("white"));
      return t("waiting");
    }
    if (current.status === "playing") {
      const myColor = colorOf(current.mySeat);
      const turn = t(current.toPlay === 1 ? "turnBlack" : "turnWhite");
      if (myColor && myColor === current.toPlay) return `${turn} · ${t("yourTurn")}`;
      if (myColor) return `${turn} · ${t("waitingTurn")}`;
      return turn;
    }
    return t("finished");
  }

  function renderPlayers(current) {
    const set = (element, seat) => {
      const joinedSeat = current.players[seat];
      element.textContent = !joinedSeat
        ? t("emptySeat")
        : current.mySeat === seat
          ? t("you")
          : t("joined");
      element.classList.toggle("you", current.mySeat === seat);
    };
    set(blackStateEl, "black");
    set(whiteStateEl, "white");
  }

  function renderResult(current) {
    if (current.status !== "finished") {
      resultEl.classList.add("hidden");
      return;
    }
    resultEl.classList.remove("hidden");

    if (current.endReason === "capture" && current.winner) {
      const loser = current.winner === "black" ? "white" : "black";
      const count = current.captured?.count ?? 0;
      resultTextEl.textContent = t("resultCapture", colorName(current.winner), colorName(loser), count);
      resultDetailEl.textContent = t("captureDetail");
      return;
    }
    if (current.endReason === "resign" && current.winner) {
      const loser = current.winner === "black" ? "white" : "black";
      resultTextEl.textContent = t("resultResign", colorName(current.winner), colorName(loser));
      resultDetailEl.textContent = t("resignDetail");
      return;
    }
    if (current.scores) {
      resultTextEl.textContent = t(
        "resultScore",
        current.scores.black,
        current.scores.white,
        current.scores.neutral,
      );
      resultDetailEl.textContent = `${t("scoreDetail")} ${t("noWinner")}`;
      return;
    }
    resultTextEl.textContent = t("finished");
    resultDetailEl.textContent = "";
  }

  function renderChat(current) {
    const signature = `${lang}:${current.chat.map((message) => message.id).join(",")}`;
    if (signature === lastChatSignature) return;
    lastChatSignature = signature;

    const nearBottom =
      chatMessagesEl.scrollHeight - chatMessagesEl.scrollTop - chatMessagesEl.clientHeight < 48;
    chatMessagesEl.innerHTML = "";

    if (current.chat.length === 0) {
      const empty = document.createElement("div");
      empty.className = "chat-empty";
      empty.textContent = t("emptyChat");
      chatMessagesEl.appendChild(empty);
      return;
    }

    for (const message of current.chat) {
      const mine = message.seat === current.mySeat;
      const row = document.createElement("div");
      row.className = `chat-row${mine ? " mine" : ""}`;

      const meta = document.createElement("div");
      meta.className = "chat-meta";
      const time = new Date(message.createdAt).toLocaleTimeString(
        lang === "zh" ? "zh-CN" : "en-US",
        { hour: "2-digit", minute: "2-digit" },
      );
      meta.textContent = `${mine ? t("youLabel") : colorShort(message.seat)} · ${time}`;

      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = message.text;

      row.append(meta, bubble);
      chatMessagesEl.appendChild(row);
    }

    const lastMessage = current.chat[current.chat.length - 1];
    if (nearBottom || lastMessage?.seat === current.mySeat) {
      chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }
  }

  function render() {
    if (!state) return;
    const current = state;
    const myColor = colorOf(current.mySeat);
    const myTurn = current.status === "playing" && myColor !== 0 && current.toPlay === myColor;

    youEl.textContent = current.mySeat
      ? t(current.mySeat === "black" ? "youBlack" : "youWhite")
      : t("spectator");
    statusEl.textContent = statusText(current);

    turnEl.textContent =
      current.status === "playing"
        ? t(current.toPlay === 1 ? "turnBlack" : "turnWhite")
        : current.status === "waiting"
          ? t("waiting")
          : t("finished");

    let moveText = t("moveCount", current.moveCount);
    if (current.lastAction === "pass") moveText += ` · ${t("lastPass")}`;
    else if (current.lastMove) moveText += ` · ${t("lastMove", coordLabel(current.lastMove))}`;
    moveCountEl.textContent = moveText;

    const undo = current.undo;
    passButton.disabled = !myTurn || Boolean(undo);
    resignButton.disabled = !(current.status === "playing" && current.mySeat);
    undoButton.disabled = !current.canRequestUndo || Boolean(undo);
    newButton.disabled = !current.mySeat;
    swapButton.disabled = !(
      current.mySeat &&
      current.status === "playing" &&
      current.moveCount === 0 &&
      current.players.black &&
      current.players.white
    );
    // 只在“满座但没有我的位置”时显示，作为丢失 localStorage 后的恢复入口。
    resetButton.classList.toggle(
      "hidden",
      Boolean(current.mySeat) || !current.players.black || !current.players.white,
    );

    undoPanel.classList.toggle("hidden", !undo);
    if (undo) {
      if (current.mySeat === undo.seat) {
        undoText.textContent = t("undoWaiting");
        undoAccept.classList.add("hidden");
        undoReject.classList.add("hidden");
        undoCancel.classList.remove("hidden");
      } else if (current.mySeat) {
        undoText.textContent = t("undoRequestedBy", colorName(undo.seat));
        undoAccept.classList.remove("hidden");
        undoReject.classList.remove("hidden");
        undoCancel.classList.add("hidden");
      } else {
        undoText.textContent = t("undoSpectator", colorName(undo.seat));
        undoAccept.classList.add("hidden");
        undoReject.classList.add("hidden");
        undoCancel.classList.add("hidden");
      }
    } else {
      undoAccept.classList.add("hidden");
      undoReject.classList.add("hidden");
      undoCancel.classList.add("hidden");
    }

    board.setState(current);
    renderPlayers(current);
    renderResult(current);

    chatInput.disabled = !current.mySeat;
    chatInput.placeholder = current.mySeat ? t("chatPlaceholder") : t("chatSpectator");
    chatForm.querySelector("button").disabled = !current.mySeat;
    chatHint.textContent = current.mySeat ? "" : t("chatSpectator");
    renderChat(current);
  }

  async function ensureJoined() {
    if (joined) return;
    try {
      await call("go.join", { token });
      joined = true;
    } catch {
      /* 下一轮再试 */
    }
  }

  async function refresh() {
    if (polling) return;
    polling = true;
    try {
      await ensureJoined();
      state = await call("go.getState", { token });
      // 座位空出来时（例如重置座位后）自动补位。
      if (!state.mySeat && (!state.players.black || !state.players.white)) {
        await call("go.join", { token });
        state = await call("go.getState", { token });
      }
      connected = true;
      render();
    } catch {
      connected = false;
      if (state) render();
      else statusEl.textContent = t("networkError");
    } finally {
      polling = false;
    }
  }

  function recordResultText(record) {
    if (record.endReason === "abandoned") return t("recordAbandoned");
    if (record.endReason === "capture" && record.winner) {
      return t("recordCapture", colorName(record.winner));
    }
    if (record.endReason === "resign" && record.winner) {
      return t("recordResign", colorName(record.winner));
    }
    if (record.endReason === "two_passes" && record.scores) {
      return t("recordScore", record.scores.black, record.scores.white);
    }
    return t("finished");
  }

  function recordDate(timestamp) {
    return new Date(timestamp).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderRecordList(records) {
    recordsList.innerHTML = "";
    if (records.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = t("recordsEmpty");
      recordsList.appendChild(empty);
      return;
    }
    for (const record of records) {
      const button = document.createElement("button");
      button.className = "record-item";
      const title = document.createElement("strong");
      title.textContent = recordDate(record.finishedAt);
      const summary = document.createElement("span");
      summary.textContent = `${recordResultText(record)} · ${t("recordMoves", record.moveCount)}`;
      button.append(title, summary);
      button.addEventListener("click", () => void openRecord(record.id));
      recordsList.appendChild(button);
    }
  }

  async function openRecords() {
    recordsModal.classList.remove("hidden");
    recordsList.classList.remove("hidden");
    recordView.classList.add("hidden");
    recordsList.innerHTML = "";
    const loading = document.createElement("p");
    loading.className = "muted";
    loading.textContent = "…";
    recordsList.appendChild(loading);
    try {
      // 兼容旧版本留下的“已结束但还没归档”的对局；只归档 finished，不动进行中的局。
      if (state?.status === "finished") {
        await call("go.archiveFinished", {});
      }
      const records = await call("go.listRecords", {});
      renderRecordList(records);
    } catch (error) {
      recordsList.innerHTML = "";
      const failed = document.createElement("p");
      failed.className = "muted";
      failed.textContent = t("errorPrefix") + error.message;
      recordsList.appendChild(failed);
    }
  }

  function closeRecords() {
    recordsModal.classList.add("hidden");
    currentRecord = null;
  }

  async function openRecord(id) {
    try {
      currentRecord = await call("go.getRecord", { id });
      replayIndex = currentRecord.positions.length - 1;
      recordTitle.textContent = `${recordDate(currentRecord.finishedAt)} · ${recordResultText(currentRecord)}`;
      recordsList.classList.add("hidden");
      recordView.classList.remove("hidden");
      drawReplay();
    } catch (error) {
      toast(t("errorPrefix") + error.message);
    }
  }

  function drawReplay() {
    if (!currentRecord) return;
    const positions = currentRecord.positions;
    replayIndex = Math.max(0, Math.min(replayIndex, positions.length - 1));
    const move = replayIndex > 0 ? currentRecord.moves[replayIndex - 1] : null;
    replayBoard.resize();
    replayBoard.setState({
      board: positions[replayIndex] ?? new Array(81).fill(0),
      toPlay: 1,
      status: "finished",
      mySeat: null,
      lastMove: move?.action === "move" ? { x: move.x, y: move.y } : null,
      lastAction: move?.action ?? null,
      scores: null,
    });
    replayStep.textContent = t("replayStep", replayIndex, positions.length - 1);
    replayPrev.disabled = replayIndex <= 0;
    replayNext.disabled = replayIndex >= positions.length - 1;
    if (!move) {
      replayMove.textContent = t("replayStart");
    } else if (move.action === "pass") {
      replayMove.textContent = `${colorName(move.seat)} Pass`;
    } else {
      let text = `${colorName(move.seat)} ${COLS[move.x]}${9 - move.y}`;
      if (move.captured > 0) text += ` · ${t("replayCaptured", move.captured)}`;
      replayMove.textContent = text;
    }
    replayBoard.resize();
  }

  async function play(x, y) {
    if (!state || state.status !== "playing") {
      toast(t("toastNotPlaying"));
      return;
    }
    if (state.undo) {
      toast(t("toastUndoPending"));
      return;
    }
    if (!state.mySeat) {
      toast(t("toastSpectator"));
      return;
    }
    if (colorOf(state.mySeat) !== state.toPlay) {
      toast(t("toastNotYourTurn"));
      return;
    }
    try {
      await call("go.move", { token, x, y });
      await refresh();
    } catch (error) {
      toast(t("errorPrefix") + error.message);
      await refresh();
    }
  }

  passButton.addEventListener("click", async () => {
    if (!state || state.status !== "playing") return;
    try {
      await call("go.pass", { token });
      await refresh();
    } catch (error) {
      toast(t("errorPrefix") + error.message);
      await refresh();
    }
  });

  resignButton.addEventListener("click", async () => {
    if (!state || state.status !== "playing" || !state.mySeat) return;
    if (!window.confirm(t("confirmResign"))) return;
    try {
      await call("go.resign", { token });
      await refresh();
    } catch (error) {
      toast(t("errorPrefix") + error.message);
      await refresh();
    }
  });

  newButton.addEventListener("click", async () => {
    if (!state?.mySeat) return;
    if (!window.confirm(t("confirmNewGame"))) return;
    try {
      await call("go.newGame", { token });
      lastChatSignature = "";
      toast(t("toastNewGame"));
      await refresh();
    } catch (error) {
      toast(t("errorPrefix") + error.message);
      await refresh();
    }
  });

  swapButton.addEventListener("click", async () => {
    if (!state?.mySeat) return;
    if (!window.confirm(t("confirmSwap"))) return;
    try {
      await call("go.swapColors", { token });
      lastChatSignature = "";
      toast(t("toastSwapped"));
      await refresh();
    } catch (error) {
      toast(t("errorPrefix") + error.message);
      await refresh();
    }
  });

  undoButton.addEventListener("click", async () => {
    if (!state || state.status !== "playing" || !state.canRequestUndo) return;
    try {
      await call("go.requestUndo", { token });
      toast(t("toastUndoRequested"));
      await refresh();
    } catch (error) {
      toast(t("errorPrefix") + error.message);
      await refresh();
    }
  });

  undoAccept.addEventListener("click", async () => {
    try {
      await call("go.acceptUndo", { token });
      toast(t("toastUndoAccepted"));
      await refresh();
    } catch (error) {
      toast(t("errorPrefix") + error.message);
      await refresh();
    }
  });

  undoReject.addEventListener("click", async () => {
    try {
      await call("go.rejectUndo", { token });
      toast(t("toastUndoRejected"));
      await refresh();
    } catch (error) {
      toast(t("errorPrefix") + error.message);
      await refresh();
    }
  });

  undoCancel.addEventListener("click", async () => {
    try {
      await call("go.cancelUndo", { token });
      toast(t("toastUndoCanceled"));
      await refresh();
    } catch (error) {
      toast(t("errorPrefix") + error.message);
      await refresh();
    }
  });

  resetButton.addEventListener("click", async () => {
    if (!window.confirm(t("confirmReset"))) return;
    try {
      await call("go.resetSeats", { token });
      joined = false;
      lastChatSignature = "";
      toast(t("toastReset"));
      await refresh();
    } catch (error) {
      toast(t("errorPrefix") + error.message);
      await refresh();
    }
  });

  recordsButton.addEventListener("click", () => void openRecords());
  recordsClose.addEventListener("click", closeRecords);
  recordBack.addEventListener("click", () => {
    recordView.classList.add("hidden");
    recordsList.classList.remove("hidden");
  });
  replayPrev.addEventListener("click", () => {
    replayIndex -= 1;
    drawReplay();
  });
  replayNext.addEventListener("click", () => {
    replayIndex += 1;
    drawReplay();
  });
  recordsModal.addEventListener("click", (event) => {
    if (event.target === recordsModal) closeRecords();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !recordsModal.classList.contains("hidden")) closeRecords();
  });

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text || !state?.mySeat) return;
    try {
      await call("go.sendChat", { token, text });
      chatInput.value = "";
      await refresh();
      chatInput.focus();
    } catch (error) {
      toast(t("errorPrefix") + error.message);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refresh();
  });
  window.addEventListener("focus", () => void refresh());

  initLanguage()
    .then(async () => {
      await ensureJoined();
      await refresh();
      setInterval(() => void refresh(), 500);
    })
    .catch((error) => {
      statusEl.textContent = `${t("errorPrefix")}${error.message}`;
    });
})();
