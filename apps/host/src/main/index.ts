import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  protocol,
  shell,
  type MenuItemConstructorOptions,
  type WebFrameMain,
} from "electron";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { createKernel, SHELL_CALLER, type Kernel } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";
import { vocabApp } from "@myoutside/vocab";
import vocabManifest from "@myoutside/vocab/manifest.json";
import { dialogApp } from "@myoutside/dialog";
import dialogManifest from "@myoutside/dialog/manifest.json";
import { goApp } from "@myoutside/go";
import goManifest from "@myoutside/go/manifest.json";
import { startLanServer } from "./lan-server";

// 数据目录使用正式名称：%APPDATA%/MyOutside
app.setName("MyOutside");

/** 真实的数据目录（冒烟模式改用临时目录前先记下，用来复制数据库） */
const REAL_USER_DATA = app.getPath("userData");

if (process.env.MYOUTSIDE_SMOKE === "1") {
  // 关闭站点隔离：capturePage 对跨源 iframe（OOPIF）拍不到内容，仅测试用
  app.commandLine.appendSwitch("disable-site-isolation-trials");
  // 独立的浏览器配置目录：不和正在运行的 MyOutside 抢单实例锁、不共用配置
  app.setPath("userData", join(app.getPath("temp"), "myoutside-smoke-profile"));
}

/** 冒烟测试默认在后台运行：不显示窗口、不抢焦点、不在 Dock 出现；MYOUTSIDE_SMOKE_SHOW=1 时显示（调试用） */
const SMOKE_HIDDEN = process.env.MYOUTSIDE_SMOKE === "1" && process.env.MYOUTSIDE_SMOKE_SHOW !== "1";

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

function mimeFor(file: string): string {
  switch (extname(file).toLowerCase()) {
    case ".html":
      return "text/html";
    case ".js":
      return "text/javascript";
    case ".css":
      return "text/css";
    case ".json":
      return "application/json";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function buildUiDirs(kernel: Kernel): Record<string, string> {
  // apps/host：按打包文件所在位置推算（dist/ 或冒烟测试的 dist-smoke/ 都在 apps/host 下）
  const appPath = resolve(__dirname, "..");
  const uiDirs: Record<string, string> = {
    shell: resolve(appPath, "renderer"),
  };
  for (const { id } of kernel.listApps()) {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) {
      console.warn(`[host] 跳过非法应用 id 的 UI 目录：${id}`);
      continue;
    }
    uiDirs[id] = resolve(appPath, "..", id, "ui");
  }
  return uiDirs;
}

function registerAppProtocol(uiDirs: Record<string, string>): void {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    const base = uiDirs[url.hostname];
    if (!base) return new Response("Not Found", { status: 404 });
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const file = normalize(join(base, rel));
    const safeBase = normalize(base) + sep;
    if (!file.startsWith(safeBase) && file !== normalize(join(base, "index.html"))) {
      return new Response("Forbidden", { status: 403 });
    }
    try {
      const data = readFileSync(file);
      return new Response(data, { headers: { "content-type": mimeFor(file) } });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  });
}

async function createMainWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "MyOutside",
    backgroundColor: "#f6f7f9",
    show: !SMOKE_HIDDEN,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true,
      // 后台冒烟：窗口不可见时照常渲染，截图才有内容
      ...(SMOKE_HIDDEN ? { backgroundThrottling: false, paintWhenInitiallyHidden: true } : {}),
    },
  });
  await win.loadURL("app://shell/index.html");
  return win;
}

type Lang = "zh" | "en";

const STRINGS: Record<
  Lang,
  {
    appName: string;
    file: string;
    quit: string;
    edit: string;
    undo: string;
    redo: string;
    cut: string;
    copy: string;
    paste: string;
    selectAll: string;
    view: string;
    reload: string;
    devtools: string;
    resetZoom: string;
    zoomIn: string;
    zoomOut: string;
  }
> = {
  zh: {
    appName: "地球online",
    file: "文件",
    quit: "退出",
    edit: "编辑",
    undo: "撤销",
    redo: "重做",
    cut: "剪切",
    copy: "复制",
    paste: "粘贴",
    selectAll: "全选",
    view: "视图",
    reload: "重新加载",
    devtools: "开发者工具",
    resetZoom: "实际大小",
    zoomIn: "放大",
    zoomOut: "缩小",
  },
  en: {
    appName: "MyOutside",
    file: "File",
    quit: "Quit",
    edit: "Edit",
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    selectAll: "Select All",
    view: "View",
    reload: "Reload",
    devtools: "Toggle DevTools",
    resetZoom: "Actual Size",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
  },
};

function buildMenu(lang: Lang): void {
  const t = STRINGS[lang];
  const template: MenuItemConstructorOptions[] = [
    { label: t.file, submenu: [{ role: "quit", label: t.quit }] },
    {
      label: t.edit,
      submenu: [
        { role: "undo", label: t.undo },
        { role: "redo", label: t.redo },
        { type: "separator" },
        { role: "cut", label: t.cut },
        { role: "copy", label: t.copy },
        { role: "paste", label: t.paste },
        { role: "selectAll", label: t.selectAll },
      ],
    },
    {
      label: t.view,
      submenu: [
        { role: "reload", label: t.reload },
        { role: "toggleDevTools", label: t.devtools },
        { type: "separator" },
        { role: "resetZoom", label: t.resetZoom },
        { role: "zoomIn", label: t.zoomIn },
        { role: "zoomOut", label: t.zoomOut },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function getLanguage(kernel: Kernel): Promise<Lang> {
  try {
    const res = await kernel.handle({ call: "platform.settings.get", payload: { key: "ui.language" } });
    if (res.ok) {
      const { value } = res.result as { value: unknown };
      if (value === "zh" || value === "en") return value;
    }
  } catch {
    /* ignore */
  }
  return app.getLocale().toLowerCase().startsWith("zh") ? "zh" : "en";
}

/** 冒烟模式：把真实数据库复制到临时目录，允许演示写入而不污染真实数据 */
function prepareSmokeDataDir(realDataDir: string): string {
  const smokeDir = join(app.getPath("temp"), "myoutside-smoke-data");
  rmSync(smokeDir, { recursive: true, force: true });
  mkdirSync(smokeDir, { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    const source = join(realDataDir, `myoutside.db${suffix}`);
    if (existsSync(source)) copyFileSync(source, join(smokeDir, `myoutside.db${suffix}`));
  }
  return smokeDir;
}

/** 冒烟截图：先确保窗口可见（被遮挡时 capturePage 会失败），失败自动重试 */
async function captureWindow(win: BrowserWindow, attempts: number, delayMs: number): Promise<Buffer> {
  if (!SMOKE_HIDDEN) {
    win.show();
    win.focus();
  }
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      return (await win.webContents.capturePage()).toPNG();
    } catch (error) {
      if (attempt === attempts - 1) console.error("[smoke] capturePage 失败：", error);
    }
  }
  return Buffer.alloc(0);
}

async function runSmoke(win: BrowserWindow): Promise<void> {
  const guard = setTimeout(() => {
    console.error("[smoke] 超时，强制退出");
    app.quit();
  }, process.env.MYOUTSIDE_SMOKE_LIVE === "1" ? 120000 : 30000);
  try {
    await new Promise((resolve) => setTimeout(resolve, 1200)); // 等 iframe 加载
    const shell = await win.webContents.executeJavaScript(
      `(async () => { const r = await window.outside.call("platform.listApps", {}); return { hasBridge: typeof window.outside === "object", ok: r.ok, apps: r.ok ? r.result : null }; })()`,
    );
    console.log("[smoke] shell:", JSON.stringify(shell));

    const frames = win.webContents.mainFrame.frames;
    console.log("[smoke] frames:", frames.map((frame) => frame.url).join(" | ") || "(none)");
    const vocabFrame = frames.find((frame) => frame.url.startsWith("app://vocab"));
    if (vocabFrame) {
      const vocab = await vocabFrame.executeJavaScript(
        `(async () => { const r = await window.outside.call("vocab.getStats", {}); return { hasBridge: typeof window.outside === "object", ok: r.ok, stats: r.ok ? r.result : null }; })()`,
      );
      console.log("[smoke] vocab:", JSON.stringify(vocab));

      const debug = await vocabFrame.executeJavaScript(
        `({ title: document.title, ready: document.readyState, hasTopbar: !!document.querySelector(".topbar"), hasLookup: !!document.querySelector('[data-tab="lookup"]'), hasMastered: !!document.getElementById("btn-mastered"), goodInterval: (document.querySelector('[data-interval="good"]') || {}).textContent || "", text: (document.body && document.body.innerText || "").slice(0, 160) })`,
      );
      console.log("[smoke] vocab debug:", JSON.stringify(debug));

      // 硬约束：子应用读不到凭据、不能修改平台设置、不能调用其他子应用的内部 API
      const guard = await vocabFrame.executeJavaScript(
        `(async () => {
          const key = await window.outside.call("platform.settings.get", { key: "ai.deepseek.apiKey" });
          const set = await window.outside.call("platform.settings.set", { key: "ui.language", value: "en" });
          const other = await window.outside.call("dialog.listConversations", {});
          return { keyValue: key.ok ? key.result.value : "ERR", setCode: set.ok ? "OK" : set.error.code, otherCode: other.ok ? "OK" : other.error.code };
        })()`,
      );
      console.log("[smoke] vocab guard:", JSON.stringify(guard));
    } else {
      console.log("[smoke] vocab iframe 未找到");
    }

    const settingsCheck = await win.webContents.executeJavaScript(
      `(async () => { document.getElementById("btn-settings").click(); await new Promise((r) => setTimeout(r, 400)); return { hasLangSelect: !!document.getElementById("set-lang"), hasApiKey: !!document.getElementById("set-api-key"), brand: document.querySelector(".brand").textContent, usageRows: (await new Promise((r) => setTimeout(r, 400)), document.querySelectorAll("#usage-table tbody tr").length) }; })()`,
    );
    console.log("[smoke] settings:", JSON.stringify(settingsCheck));

    const shotPath = join(app.getPath("temp"), "myoutside-smoke.png");
    const png = await captureWindow(win, 10, 500);
    writeFileSync(shotPath, png);
    console.log("[smoke] screenshot:", shotPath, `(${png.length} bytes)`);

    // iframe 属跨源 OOPIF，capturePage 可能拍不到；这里单独加载 vocab UI 再截一张
    await win.loadURL("app://vocab/index.html");
    // 等复习卡数据就绪（正面出现文字）后点「显示答案」，让截图能看到卡背面
    for (let i = 0; i < 24; i += 1) {
      const frontText = (await win.webContents.executeJavaScript(
        'document.getElementById("review-front").textContent',
      )) as string;
      if (frontText && frontText.trim() !== "") break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const reveal = await win.webContents.executeJavaScript(
      `(async () => { const btn = document.getElementById("btn-reveal"); if (!btn) return { clicked: false }; btn.click(); await new Promise((resolve) => setTimeout(resolve, 300)); return { clicked: true, backHidden: document.getElementById("review-back").classList.contains("hidden") }; })()`,
    );
    console.log("[smoke] reveal:", JSON.stringify(reveal));
    const vocabShotPath = join(app.getPath("temp"), "myoutside-vocab.png");
    const vocabPng = await captureWindow(win, 10, 400);
    writeFileSync(vocabShotPath, vocabPng);
    console.log("[smoke] vocab screenshot:", vocabShotPath, `(${vocabPng.length} bytes)`);

    // 词库页：验证导入词表的分级徽章（搜索一个确定命中词表的词）
    await win.webContents.executeJavaScript(`document.querySelector('[data-tab="browse"]').click()`);
    await new Promise((resolve) => setTimeout(resolve, 600));
    await win.webContents.executeJavaScript(
      `(() => { document.getElementById("browse-query").value = "gorgeous"; document.getElementById("browse-refresh").click(); return true; })()`,
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
    const browseShotPath = join(app.getPath("temp"), "myoutside-vocab-browse.png");
    const browsePng = await captureWindow(win, 8, 400);
    writeFileSync(browseShotPath, browsePng);
    console.log("[smoke] vocab browse screenshot:", browseShotPath, `(${browsePng.length} bytes)`);

    // 对话应用：走真实桥读会话列表（只读，不写真实数据），再截一张
    await win.loadURL("app://dialog/index.html");
    for (let i = 0; i < 24; i += 1) {
      const ready = (await win.webContents.executeJavaScript(
        'document.readyState === "complete" && typeof window.outside === "object"',
      )) as boolean;
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const dialogCheck = await win.webContents.executeJavaScript(
      `(async () => { const r = await window.outside.call("dialog.listConversations", {}); return { ok: r.ok, count: r.ok ? r.result.length : null, hasComposer: !!document.getElementById("btn-send"), hasEffort: !!document.getElementById("effort-select"), title: document.title }; })()`,
    );
    console.log("[smoke] dialog:", JSON.stringify(dialogCheck));

    // 在临时副本上做一次演示写入：会话 → 两条消息 → 编辑生成分叉（用于查看切换器与思考过程）
    const demoAssistant =
      "我是 **MyOutside** 里的对话助手：\n\n- 记住历史（树形保存，永不丢）\n- 修改用户消息会生成新**分叉**\n- 思考强度可调（输入框上方）\n\n" +
      "欧拉恒等式 $e^{i\\pi}+1=0$，以及\n\n$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$\n\n| 能力 | 状态 |\n|---|---|\n| 联网搜索 | ✓ |\n| 公式渲染 | ✓ |";
    const demoReasoning = "用户要求一句话自我介绍。保持简短，顺便提示本应用的分叉与思考强度能力。";
    const demoConversation = await win.webContents.executeJavaScript(
      `(async () => {
        const create = await window.outside.call("dialog.createConversation", {});
        const conversationId = create.result.conversationId;
        await window.outside.call("dialog.appendMessage", { conversationId, role: "user", content: ${JSON.stringify("你好！简单介绍一下你自己。")} });
        await window.outside.call("dialog.appendMessage", { conversationId, role: "assistant", content: ${JSON.stringify("你好！我是运行在 MyOutside 里的对话助手。")}, reasoning: "用户让我自我介绍，先用一句话问候并说明身份。" });
        const pathResult = await window.outside.call("dialog.getPath", { conversationId });
        const firstUser = pathResult.result.messages.find((message) => message.role === "user");
        await window.outside.call("dialog.editUserMessage", { messageId: firstUser.id, content: ${JSON.stringify("你好！用一句话介绍你自己。")} });
        await window.outside.call("dialog.appendMessage", { conversationId, role: "assistant", content: ${JSON.stringify(demoAssistant)}, reasoning: ${JSON.stringify(demoReasoning)}, model: "deepseek-flash", usage: { promptTokens: 32, completionTokens: 48, totalTokens: 80, reasoningTokens: 18 } });
        // 被停止 / 出错中断的回复（DIALOG-0017、DIALOG-0018）
        const base = { conversationId, reasoning: null, model: "deepseek-flash", usage: null, steps: null, sources: null, contextTokens: null };
        const q1 = await window.outside.call("dialog.appendMessage", { conversationId, role: "user", content: "讲一个长一点的故事。" });
        await window.outside.call("dialog.saveReply", { ...base, parentId: q1.result.messageId, content: "从前有座山，山里有座庙，", stopped: true });
        const q2 = await window.outside.call("dialog.appendMessage", { conversationId, role: "user", content: "继续。" });
        await window.outside.call("dialog.saveReply", { ...base, parentId: q2.result.messageId, content: "庙里有个老和尚，", error: "读取流式响应失败：terminated" });
        return conversationId;
      })()`,
    );
    console.log("[smoke] dialog demo:", JSON.stringify(demoConversation));
    await win.reload();
    await new Promise((resolve) => setTimeout(resolve, 900));
    const reasoningOpen = await win.webContents.executeJavaScript(
      `(async () => { const toggle = document.querySelector(".reasoning-toggle"); if (toggle) toggle.click(); await new Promise((r) => setTimeout(r, 250)); return !!toggle; })()`,
    );
    console.log("[smoke] dialog reasoning toggle:", reasoningOpen);
    const rendering = await win.webContents.executeJavaScript(
      `({ katex: document.querySelectorAll(".katex").length, display: document.querySelectorAll(".math-display").length, table: !!document.querySelector(".bubble table"), webSearchToggle: !!document.getElementById("web-search-toggle"), tags: [...document.querySelectorAll(".stopped-tag")].map((tag) => tag.textContent + "|" + tag.title), context: (document.getElementById("usage-total") || {}).textContent || "" })`,
    );
    console.log("[smoke] dialog rendering:", JSON.stringify(rendering));
    const dialogShotPath = join(app.getPath("temp"), "myoutside-dialog.png");
    const dialogPng = await captureWindow(win, 12, 500);
    writeFileSync(dialogShotPath, dialogPng);
    console.log("[smoke] dialog screenshot:", dialogShotPath, `(${dialogPng.length} bytes)`);

    // 可选：真实生成（MYOUTSIDE_SMOKE_LIVE=1）——经界面发一个需要联网搜索的问题，生成中与生成后各截一张
    if (process.env.MYOUTSIDE_SMOKE_LIVE === "1") {
      await win.webContents.executeJavaScript(
        `(async () => { document.getElementById("btn-new").click(); await new Promise((r) => setTimeout(r, 500));
          const input = document.getElementById("input"); input.value = ${JSON.stringify(process.env.MYOUTSIDE_SMOKE_QUESTION ?? "DeepSeek 最近发布了哪些 API 更新？")};
          document.getElementById("btn-send").click(); return true; })()`,
      );
      let midShot = false;
      for (let i = 0; i < 120; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const state = (await win.webContents.executeJavaScript(
          `({ live: !!document.querySelector(".msg.live"), steps: document.querySelectorAll(".msg.live .step-tool").length, text: ((document.querySelector(".msg.live .bubble") || {}).innerText || "").length, stop: document.getElementById("btn-send").classList.contains("stop") })`,
        )) as { live: boolean; steps: number; text: number; stop: boolean };
        // 可选：生成到一半时正常退出（MYOUTSIDE_SMOKE_QUIT_MID=1），验证退出前会保存已生成的部分
        if (process.env.MYOUTSIDE_SMOKE_QUIT_MID === "1" && state.live && state.text > 80) {
          console.log("[smoke] quitting mid-generation:", JSON.stringify(state));
          app.quit();
          return;
        }
        if (!midShot && state.live && state.text > 80) {
          const mid = await captureWindow(win, 4, 100);
          writeFileSync(join(app.getPath("temp"), "myoutside-dialog-live.png"), mid);
          console.log("[smoke] live mid-generation:", JSON.stringify(state));
          midShot = true;
        }
        if (!state.live && i > 2) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
      const final = await win.webContents.executeJavaScript(
        `({ sources: document.querySelectorAll(".sources li").length, cites: document.querySelectorAll("a.cite").length, steps: !!document.querySelector(".steps-body"), notice: (document.querySelector(".error-bubble, .notice-bubble") || {}).innerText || null, context: document.getElementById("usage-total").textContent })`,
      );
      console.log("[smoke] live final:", JSON.stringify(final));
      const finalShot = await captureWindow(win, 6, 300);
      writeFileSync(join(app.getPath("temp"), "myoutside-dialog-final.png"), finalShot);
    }
    // 围棋：验证 app://go 能加载、bridge 可用、9 路状态能返回
    await win.loadURL("app://go/index.html");
    for (let i = 0; i < 24; i += 1) {
      const ready = (await win.webContents.executeJavaScript(
        'document.readyState === "complete" && typeof window.outside === "object" && typeof window.GoBoard === "function"',
      )) as boolean;
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const goCheck = await win.webContents.executeJavaScript(
      `(async () => {
        const a = await window.outside.call("go.join", { token: "smoke-go-a" });
        const b = await window.outside.call("go.join", { token: "smoke-go-b" });
        const s = await window.outside.call("go.getState", { token: "smoke-go-a" });
        const lang = await window.outside.call("platform.settings.get", { key: "ui.language" });
        return {
          hasBoard: typeof window.GoBoard === "function",
          joinA: a.ok ? a.result : null,
          joinB: b.ok ? b.result : null,
          stateOk: s.ok,
          board: s.ok ? s.result.board.length : null,
          status: s.ok ? s.result.status : null,
          langOk: lang.ok,
          lang: lang.ok ? lang.result.value : null,
        };
      })()`,
    );
    console.log("[smoke] go:", JSON.stringify(goCheck));
    const goShotPath = join(app.getPath("temp"), "myoutside-go.png");
    const goPng = await captureWindow(win, 10, 400);
    writeFileSync(goShotPath, goPng);
    console.log("[smoke] go screenshot:", goShotPath, `(${goPng.length} bytes)`);

  } catch (error) {
    console.error("[smoke] 失败：", error);
  } finally {
    clearTimeout(guard);
    app.quit();
  }
}

app.whenReady().then(async () => {
  if (SMOKE_HIDDEN) app.dock?.hide();
  // 单实例：重复双击时聚焦已有窗口
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on("second-instance", () => {
    const [existing] = BrowserWindow.getAllWindows();
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
    }
  });

  let dataDir = REAL_USER_DATA;
  if (process.env.MYOUTSIDE_SMOKE === "1") {
    dataDir = prepareSmokeDataDir(REAL_USER_DATA);
    console.log("[smoke] 临时数据副本:", dataDir);
  }
  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, "myoutside.db");
  console.log("[host] data dir:", dataDir);

  const kernel = createKernel({ storage: createNodeSqliteAdapter({ path: dbPath }) });
  kernel.registerApp(vocabApp, vocabManifest);
  kernel.registerApp(dialogApp, dialogManifest);
  kernel.registerApp(goApp, goManifest);
  kernel.start();
  const appIds = new Set(kernel.listApps().map((item) => item.id));

  /** 调用者 = 发起 IPC 的页面所属的子应用（app://<id>/）；外壳 = 平台自身 */
  const callerOf = (frame: WebFrameMain | null): string | null => {
    if (!frame) return null;
    let host: string;
    try {
      const url = new URL(frame.url);
      if (url.protocol !== "app:") return null;
      host = url.hostname;
    } catch {
      return null;
    }
    if (host === SHELL_CALLER) return SHELL_CALLER;
    return appIds.has(host) ? host : null;
  };

  /** 进行中的调用（按运行 ID）：用于推送事件与取消 */
  const runs = new Map<string, { controller: AbortController; frame: WebFrameMain }>();
  console.log("[host] kernel ready. functions:", kernel.listFunctions().join(", "));

  const uiDirs = buildUiDirs(kernel);

  // 开发用 LAN 预览（D-0072）：默认关闭，只有 dev:lan 才设置 MYOUTSIDE_LAN=1。
  if (process.env.MYOUTSIDE_LAN === "1") {
    const port = Number(process.env.MYOUTSIDE_LAN_PORT ?? 3000);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      console.error(`[lan] 无效端口：${process.env.MYOUTSIDE_LAN_PORT}`);
    } else {
      void startLanServer({ kernel, uiDirs, port }).catch((error) => {
        console.error("[lan] 启动失败：", error);
      });
    }
  }

  let currentLang = await getLanguage(kernel);
  buildMenu(currentLang);

  ipcMain.handle("kernel:call", async (event, request: { call: string; payload?: unknown; runId?: string }) => {
    const frame = event.senderFrame;
    const caller = callerOf(frame);
    if (!caller || !frame) {
      return { ok: false, error: { code: "FORBIDDEN", message: "无法识别调用者" }, dataVersion: kernel.dataVersion };
    }
    const controller = new AbortController();
    const runId = typeof request.runId === "string" && request.runId ? request.runId : null;
    if (runId) runs.set(runId, { controller, frame });
    const emit = runId
      ? (payload: unknown) => {
          try {
            frame.send("kernel:event", { runId, event: payload });
          } catch {
            /* 页面已关闭：推送只是附带的进度，丢失不影响结果 */
          }
        }
      : undefined;
    if (quitting) {
      return { ok: false, error: { code: "ABORTED", message: "MyOutside 正在退出" }, dataVersion: kernel.dataVersion };
    }
    const done = kernel.handle({ call: request.call, payload: request.payload }, { caller, emit, signal: controller.signal });
    const entry = { controller, done };
    inflight.add(entry);
    let result;
    try {
      result = await done;
    } finally {
      inflight.delete(entry);
      if (runId) runs.delete(runId);
    }
    if (request.call === "platform.settings.set" && result.ok) {
      const nextLang = await getLanguage(kernel);
      if (nextLang !== currentLang) {
        currentLang = nextLang;
        buildMenu(currentLang);
        for (const win of BrowserWindow.getAllWindows()) {
          win.setTitle(STRINGS[currentLang].appName);
        }
      }
    }
    return result;
  });

  // 取消一次进行中的调用：只能取消同一页面发起的调用
  ipcMain.handle("kernel:cancel", async (event, runId: unknown) => {
    if (typeof runId !== "string") return false;
    const run = runs.get(runId);
    if (!run || run.frame !== event.senderFrame) return false;
    run.controller.abort();
    return true;
  });

  // 子应用 UI 的外链：交给系统浏览器（仅 http/https）
  ipcMain.handle("host:openExternal", async (_event, url: unknown) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
    await shell.openExternal(url);
    return true;
  });

  registerAppProtocol(uiDirs);
  const win = await createMainWindow();
  win.setTitle(STRINGS[currentLang].appName);

  if (process.env.MYOUTSIDE_SMOKE === "1") {
    await runSmoke(win);
  }
});

/** 进行中的调用：正常退出时先取消它们，等它们收尾（例如保存已生成的部分）再退出（DIALOG-0017） */
const inflight = new Set<{ controller: AbortController; done: Promise<unknown> }>();
const QUIT_GRACE_MS = 3000;
let quitting = false;

app.on("before-quit", (event) => {
  if (quitting || inflight.size === 0) return;
  event.preventDefault();
  quitting = true;
  const pending = [...inflight];
  for (const call of pending) call.controller.abort();
  const timeout = new Promise((resolve) => setTimeout(resolve, QUIT_GRACE_MS));
  void Promise.race([Promise.allSettled(pending.map((call) => call.done)), timeout]).then(() => app.quit());
});

app.on("window-all-closed", () => {
  app.quit();
});
