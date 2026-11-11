/*
 * 网页版外壳的客户端（D-0090、docs/future/web-version.md §3）。在外壳的 shell.js 之前加载：
 * - 和服务器之间一条 WebSocket，承载所有调用、进度、取消；
 * - 外壳自己的 window.outside（调用者是 shell）；
 * - 子应用的面板：每次打开都新建一个沙箱 iframe；子应用的调用经 postMessage 交给这里，
 *   按消息来自外壳建的哪个 iframe 认出调用者（浏览器填的 event.source，子应用伪造不了），再转给服务器。
 */
(() => {
  "use strict";
  window.__MYOUTSIDE_SERVER__ = true;

  const SANDBOX = "allow-scripts allow-forms allow-modals allow-downloads";
  const WS_URL = location.origin.replace(/^http/, "ws") + "/__myoutside/ws";
  const STORAGE_KEY_MAX = 200;
  const STORAGE_VALUE_MAX = 1024 * 1024;

  const newId = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const runKey = (app, runId) => `${app}\u0000${runId}`;
  const failure = (code, message) => ({ ok: false, error: { code, message }, dataVersion: 0 });

  // ---------------- WebSocket ----------------

  let socket = null;
  let connecting = null;
  let nextId = 1;
  /** 调用 id → resolve */
  const pending = new Map();
  /** 子应用 + 运行 ID → 事件监听 */
  const runListeners = new Map();

  async function checkSession() {
    try {
      const response = await fetch("/__myoutside/session", { cache: "no-store" });
      if (response.status === 401) location.href = "/";
    } catch {
      /* 网络断了：下次调用时再连 */
    }
  }

  function connect() {
    if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve(socket);
    if (connecting) return connecting;
    connecting = new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      let opened = false;
      ws.onopen = () => {
        opened = true;
        socket = ws;
        connecting = null;
        resolve(ws);
      };
      ws.onmessage = (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.t === "result") {
          const done = pending.get(message.id);
          if (done) {
            pending.delete(message.id);
            done(message.response);
          }
        } else if (message.t === "event") {
          for (const listener of runListeners.get(runKey(message.app, message.runId)) ?? []) listener(message.event);
        }
      };
      ws.onclose = (event) => {
        if (socket === ws) socket = null;
        connecting = null;
        // 断线：服务端的调用照常跑完，但这边收不到结果了
        for (const [id, done] of pending) {
          pending.delete(id);
          done(failure("DISCONNECTED", "和服务器的连接断开了"));
        }
        if (!opened) reject(new Error("connect failed"));
        if (event.code === 4401) location.href = "/";
        else void checkSession();
      };
    });
    connecting.catch(() => {});
    return connecting;
  }

  async function send(app, call, payload, runId) {
    let ws;
    try {
      ws = await connect();
    } catch {
      return failure("DISCONNECTED", "连不上服务器");
    }
    const id = nextId++;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      try {
        ws.send(JSON.stringify({ t: "call", id, app, runId: runId || undefined, call, payload }));
      } catch {
        pending.delete(id);
        resolve(failure("DISCONNECTED", "和服务器的连接断开了"));
      }
    });
  }

  function cancel(app, runId) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: "cancel", app, runId }));
    return Promise.resolve(true);
  }

  function addRunListener(app, runId, listener) {
    const key = runKey(app, runId);
    let set = runListeners.get(key);
    if (!set) runListeners.set(key, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) runListeners.delete(key);
    };
  }

  function openExternal(url) {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return Promise.resolve(false);
    window.open(url, "_blank", "noopener,noreferrer");
    return Promise.resolve(true);
  }

  // 外壳自己的 window.outside：调用者是 shell
  window.outside = {
    call: (name, payload, options) => send(null, name, payload, options && options.runId),
    newRunId: newId,
    onEvent: (runId, listener) => addRunListener("shell", runId, listener),
    cancel: (runId) => cancel(null, runId),
    openExternal,
  };

  // ---------------- 子应用的面板 ----------------

  /** iframe 的 contentWindow → { appId, iframe, off: 取消转发进度的函数 } */
  const frames = new Map();

  function forget(iframe) {
    for (const [win, entry] of frames) {
      if (entry.iframe === iframe) {
        frames.delete(win);
        for (const off of entry.offs) off();
      }
    }
  }

  window.__myoutsideShell = {
    /**
     * 打开一个子应用：每次都新建 iframe，换掉旧的。旧页面在卸载前发来的消息，source 对不上任何现有的面板，
     * 一律不理——不会被算到新打开的子应用头上。
     */
    mountApp(appId, oldFrame) {
      const iframe = document.createElement("iframe");
      iframe.id = oldFrame.id;
      iframe.className = oldFrame.className;
      iframe.title = oldFrame.title;
      iframe.setAttribute("sandbox", SANDBOX);
      forget(oldFrame);
      oldFrame.replaceWith(iframe);
      frames.set(iframe.contentWindow, { appId, iframe, offs: new Set() });
      iframe.src = `/apps/${encodeURIComponent(appId)}/index.html`;
      return iframe;
    },
  };

  const post = (entry, message) => {
    if (entry.iframe.contentWindow) entry.iframe.contentWindow.postMessage({ __mo: 1, ...message }, "*");
  };
  const isId = (value) => typeof value === "number" || (typeof value === "string" && value.length > 0 && value.length <= 64);
  const isShort = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max;

  function storageKey(entry, key) {
    return `mo.app.${entry.appId}.${key}`;
  }

  /** 子应用的本地存储（沙箱里没有 localStorage）：按子应用分开，存在外壳自己的 localStorage 里，只在这台浏览器上 */
  function handleStorage(entry, message) {
    const reply = (result) => post(entry, { kind: "storage", id: message.id, ...result });
    if (!isShort(message.key, STORAGE_KEY_MAX)) return reply({ ok: false, error: "key 不对" });
    try {
      if (message.op === "get") return reply({ ok: true, value: localStorage.getItem(storageKey(entry, message.key)) });
      if (message.op === "remove") {
        localStorage.removeItem(storageKey(entry, message.key));
        return reply({ ok: true });
      }
      if (message.op === "set") {
        if (typeof message.value !== "string" || message.value.length > STORAGE_VALUE_MAX) return reply({ ok: false, error: "值太大或不是字符串" });
        localStorage.setItem(storageKey(entry, message.key), message.value);
        return reply({ ok: true });
      }
    } catch (error) {
      return reply({ ok: false, error: String(error) });
    }
    return reply({ ok: false, error: "不认识的操作" });
  }

  window.addEventListener("message", (event) => {
    const entry = frames.get(event.source);
    // 不是外壳建的面板直接发来的消息（包括面板里再嵌的页面、别的窗口）：一律不理
    if (!entry || entry.iframe.contentWindow !== event.source) return;
    const message = event.data;
    if (!message || message.__mo !== 1) return;

    if (message.kind === "call") {
      if (!isId(message.id) || !isShort(message.name, 200)) return;
      const runId = isShort(message.runId, 100) ? message.runId : undefined;
      let off = null;
      if (runId) {
        off = addRunListener(entry.appId, runId, (ev) => post(entry, { kind: "event", runId, event: ev }));
        entry.offs.add(off);
      }
      void send(entry.appId, message.name, message.payload, runId).then((response) => {
        post(entry, { kind: "result", id: message.id, response });
        if (off) {
          off();
          entry.offs.delete(off);
        }
      });
    } else if (message.kind === "cancel") {
      if (isShort(message.runId, 100)) void cancel(entry.appId, message.runId);
    } else if (message.kind === "openExternal") {
      void openExternal(message.url);
    } else if (message.kind === "storage") {
      if (isId(message.id)) handleStorage(entry, message);
    }
  });

  // ---------------- 退出登录 ----------------

  document.addEventListener("DOMContentLoaded", () => {
    const footer = document.querySelector(".side-footer");
    if (!footer) return;
    const button = document.createElement("button");
    button.className = "side-btn";
    button.id = "btn-logout";
    button.textContent = "退出登录";
    button.addEventListener("click", async () => {
      try {
        await fetch("/__myoutside/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      } finally {
        location.href = "/";
      }
    });
    footer.prepend(button);
  });
})();
