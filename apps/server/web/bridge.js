/*
 * 子应用页面里的 window.outside（网页版，D-0090）。页面在沙箱 iframe 里，是「无名源」：
 * 读不到外壳和其他子应用，也不能直接请求服务器；所有调用经 postMessage 交给外壳，由外壳认出是哪个子应用再转给服务器。
 * 服务端在发出这个脚本时，把外壳的地址填进 PARENT：消息只发给这个地址的父页面。
 */
(() => {
  "use strict";
  const PARENT = __MYOUTSIDE_PARENT_ORIGIN__;
  // 不在外壳里（直接打开了网址）：不提供 window.outside，子应用会提示要在 MyOutside 里打开
  if (window.parent === window) return;

  let nextId = 1;
  const pending = new Map();
  const storagePending = new Map();
  const listeners = new Map();

  const post = (message) => window.parent.postMessage({ __mo: 1, ...message }, PARENT);

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.__mo !== 1) return;
    if (message.kind === "result") {
      const done = pending.get(message.id);
      if (done) {
        pending.delete(message.id);
        done(message.response);
      }
    } else if (message.kind === "event") {
      for (const listener of listeners.get(message.runId) ?? []) listener(message.event);
    } else if (message.kind === "storage") {
      const done = storagePending.get(message.id);
      if (done) {
        storagePending.delete(message.id);
        done(message);
      }
    }
  });

  function storage(op, key, value) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      storagePending.set(id, (message) => (message.ok ? resolve(message.value ?? null) : reject(new Error(message.error || "存储失败"))));
      post({ kind: "storage", id, op, key, value });
    });
  }

  window.outside = {
    /** 调用 API；传入 runId 时，执行过程中的事件可用 onEvent 订阅、可用 cancel 取消 */
    call(name, payload, options) {
      const id = nextId++;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        post({ kind: "call", id, name, payload, runId: options && options.runId ? options.runId : undefined });
      });
    },
    newRunId() {
      return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    },
    onEvent(runId, listener) {
      let set = listeners.get(runId);
      if (!set) listeners.set(runId, (set = new Set()));
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(runId);
      };
    },
    cancel(runId) {
      post({ kind: "cancel", runId });
      return Promise.resolve(true);
    },
    openExternal(url) {
      post({ kind: "openExternal", url });
      return Promise.resolve(true);
    },
    /** 本地存储（沙箱里没有 localStorage）：只在这台浏览器上，按子应用分开；值必须是字符串 */
    storage: {
      get: (key) => storage("get", key),
      set: (key, value) => storage("set", key, value),
      remove: (key) => storage("remove", key),
    },
  };
})();
