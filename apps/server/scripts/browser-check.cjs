/*
 * 在真的浏览器（Electron 的 Chromium）里检查网页版：设密码、外壳、沙箱隔离（D-0090）。
 * 后台运行：窗口不显示、不在 Dock 出现、用临时的浏览器配置目录（AGENTS.md 红线 2）。
 * 用法：MYOUTSIDE_CHECK_SETUP=<设置链接> electron apps/server/scripts/browser-check.cjs
 */
const { app, BrowserWindow } = require("electron");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const setupLink = process.env.MYOUTSIDE_CHECK_SETUP;
if (!setupLink) {
  console.error("要设置 MYOUTSIDE_CHECK_SETUP");
  process.exit(2);
}
const base = new URL(setupLink).origin;
const profile = mkdtempSync(join(tmpdir(), "myoutside-browser-check-"));
app.setPath("userData", profile);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, ms = 8000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await wait(100);
  }
  return null;
}

app.whenReady().then(async () => {
  app.dock?.hide();
  const win = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { backgroundThrottling: false } });
  const results = {};
  try {
    await win.loadURL(setupLink);
    await win.webContents.executeJavaScript(`
      document.querySelector('[name=password]').value = 'correct horse battery';
      document.querySelector('[name=confirm]').value = 'correct horse battery';
      document.getElementById('form').requestSubmit(); true`);
    await until(async () => win.webContents.getURL() === base + "/" && (await win.webContents.executeJavaScript("document.querySelectorAll('.app-item').length")) > 0);
    results.apps = await win.webContents.executeJavaScript(`[...document.querySelectorAll('.app-item')].map((b) => b.dataset.appId)`);
    results.logoutButton = await win.webContents.executeJavaScript(`!!document.getElementById('btn-logout')`);
    results.panelSandbox = await win.webContents.executeJavaScript(`document.getElementById('panel').getAttribute('sandbox')`);

    const frame = await until(() => win.webContents.mainFrame.frames.find((f) => f.url.includes("/apps/")));
    results.frameUrl = frame && frame.url.replace(base, "");
    await until(() => frame.executeJavaScript("!!window.outside").catch(() => false));
    results.inFrame = await frame.executeJavaScript(`(async () => {
      const out = {};
      out.origin = self.origin;
      try { out.parentDocument = window.parent.document ? "readable" : "?"; } catch { out.parentDocument = "blocked"; }
      try { localStorage.setItem("x", "1"); out.localStorage = "allowed"; } catch { out.localStorage = "blocked"; }
      try { out.cookie = document.cookie === "" ? "empty" : "visible"; } catch { out.cookie = "blocked"; }
      const declared = await window.outside.call("platform.settings.get", { key: "ui.language" });
      out.declaredPlatformCall = declared.ok ? "ok" : declared.error.code;
      const set = await window.outside.call("platform.settings.set", { key: "ui.language", value: "en" });
      out.impersonateShell = set.ok ? "ALLOWED" : set.error.code;
      const internal = await window.outside.call("vocab.previewReview", { cardId: "x" });
      out.ownInternal = internal.ok ? "ok" : internal.error.code;
      await window.outside.storage.set("k", "v");
      out.storage = await window.outside.storage.get("k");
      try { const r = await fetch("/__myoutside/session"); out.fetchSession = "readable " + r.status; } catch { out.fetchSession = "blocked"; }
      out.directWebSocket = await new Promise((resolve) => {
        const ws = new WebSocket(${JSON.stringify(base.replace("http", "ws") + "/__myoutside/ws")});
        ws.onopen = () => resolve("OPENED");
        ws.onerror = () => resolve("rejected");
      });
      // 面板里再嵌一个页面（下面在它里面冒充）
      window.__spoofAnswered = false;
      window.addEventListener("message", (event) => {
        if (event.data && event.data.__mo === 1 && event.data.id === "spoof-1") window.__spoofAnswered = true;
      });
      const nested = document.createElement("iframe");
      nested.src = "/apps/dialog/index.html";
      document.body.appendChild(nested);
      return out;
    })()`);

    // 在嵌套的页面里面执行：直接给外壳（window.top）发调用，外壳不该理它；用它自己的桥调用也不该有回应
    const nestedFrame = await until(() => frame.frames.find((f) => f.url.includes("/apps/dialog/")));
    await until(() => nestedFrame.executeJavaScript("document.readyState === 'complete'").catch(() => false));
    results.nested = await nestedFrame.executeJavaScript(`(async () => {
      let answered = false;
      window.addEventListener("message", (event) => {
        if (event.data && event.data.__mo === 1 && event.data.id === "spoof-1") answered = true;
      });
      window.top.postMessage({ __mo: 1, kind: "call", id: "spoof-1", name: "platform.settings.get", payload: { key: "ui.language" } }, "*");
      const viaBridge = await Promise.race([
        window.outside.call("platform.settings.get", { key: "ui.language" }).then(() => "ANSWERED"),
        new Promise((r) => setTimeout(() => r("no answer"), 1500)),
      ]);
      return { directToTop: answered ? "ANSWERED" : "ignored", viaOwnBridge: viaBridge };
    })()`);
    results.nested.parentGotSpoofAnswer = await frame.executeJavaScript("window.__spoofAnswered");

    // 切到另一个子应用：换了一个新的 iframe 元素
    results.switch = await win.webContents.executeJavaScript(`(async () => {
      const before = document.getElementById("panel");
      document.querySelector('.app-item[data-app-id="dialog"]').click();
      await new Promise((r) => setTimeout(r, 1500));
      const after = document.getElementById("panel");
      return { newElement: before !== after, oldAttached: before.isConnected, sandbox: after.getAttribute("sandbox"), src: after.getAttribute("src") };
    })()`);
    const dialogFrame = await until(() => win.webContents.mainFrame.frames.find((f) => f.url.includes("/apps/dialog/")));
    await until(() => dialogFrame.executeJavaScript("!!window.outside").catch(() => false));
    results.dialogCall = await dialogFrame.executeJavaScript(`window.outside.call("dialog.listConversations", {}).then((r) => r.ok ? "ok" : r.error.code)`);
    results.dialogMath = await dialogFrame.executeJavaScript(`typeof window.katex === "object" ? "katex loaded" : "no katex"`);

    // 围棋的座位令牌存进外壳代管的存储：重新打开围棋，令牌不变
    const openGo = async () => {
      await win.webContents.executeJavaScript(`document.querySelector('.app-item[data-app-id="go"]').click(); true`);
      await wait(2000);
      return win.webContents.executeJavaScript(`localStorage.getItem("mo.app.go.myoutside.go.playerToken")`);
    };
    const first = await openGo();
    const second = await openGo();
    results.goToken = first && first === second ? "kept across reloads" : `first=${first} second=${second}`;
  } catch (error) {
    results.error = String(error && error.stack ? error.stack : error);
  }
  console.log("[browser-check] " + JSON.stringify(results, null, 2));
  win.destroy();
  // 临时的浏览器配置目录用完就删
  setTimeout(() => {
    rmSync(profile, { recursive: true, force: true });
    app.exit(0);
  }, 300);
});
