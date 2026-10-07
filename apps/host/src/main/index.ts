import { app, BrowserWindow, ipcMain, Menu, protocol, shell, type MenuItemConstructorOptions } from "electron";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { createKernel, type Kernel } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";
import { vocabApp } from "@myoutside/vocab";
import { dialogApp } from "@myoutside/dialog";

// 数据目录使用正式名称：%APPDATA%/MyOutside
app.setName("MyOutside");

// 冒烟模式下关闭站点隔离：capturePage 对跨源 iframe（OOPIF）拍不到内容，仅测试用
if (process.env.MYOUTSIDE_SMOKE === "1") {
  app.commandLine.appendSwitch("disable-site-isolation-trials");
}

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
    default:
      return "application/octet-stream";
  }
}

function registerAppProtocol(): void {
  const appPath = app.getAppPath(); // apps/host
  const uiDirs: Record<string, string> = {
    shell: resolve(appPath, "renderer"),
    vocab: resolve(appPath, "..", "vocab", "ui"),
    dialog: resolve(appPath, "..", "dialog", "ui"),
  };

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
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true,
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
  win.show();
  win.focus();
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
  }, 30000);
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
    } else {
      console.log("[smoke] vocab iframe 未找到");
    }

    const settingsCheck = await win.webContents.executeJavaScript(
      `(async () => { document.getElementById("btn-settings").click(); await new Promise((r) => setTimeout(r, 400)); return { hasLangSelect: !!document.getElementById("set-lang"), hasApiKey: !!document.getElementById("set-api-key"), brand: document.querySelector(".brand").textContent }; })()`,
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
      "我是 **MyOutside** 里的对话助手：\n\n- 记住历史（树形保存，永不丢）\n- 修改用户消息会生成新**分叉**\n- 思考强度可调（输入框上方）";
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
    const dialogShotPath = join(app.getPath("temp"), "myoutside-dialog.png");
    const dialogPng = await captureWindow(win, 12, 500);
    writeFileSync(dialogShotPath, dialogPng);
    console.log("[smoke] dialog screenshot:", dialogShotPath, `(${dialogPng.length} bytes)`);
  } catch (error) {
    console.error("[smoke] 失败：", error);
  } finally {
    clearTimeout(guard);
    app.quit();
  }
}

app.whenReady().then(async () => {
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

  let dataDir = app.getPath("userData");
  if (process.env.MYOUTSIDE_SMOKE === "1") {
    dataDir = prepareSmokeDataDir(dataDir);
    console.log("[smoke] 临时数据副本:", dataDir);
  }
  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, "myoutside.db");
  console.log("[host] data dir:", dataDir);

  const kernel = createKernel({ storage: createNodeSqliteAdapter({ path: dbPath }) });
  kernel.registerApp(vocabApp);
  kernel.registerApp(dialogApp);
  kernel.start();
  console.log("[host] kernel ready. functions:", kernel.listFunctions().join(", "));

  let currentLang = await getLanguage(kernel);
  buildMenu(currentLang);

  ipcMain.handle("kernel:call", async (_event, request: { call: string; payload?: unknown }) => {
    const result = await kernel.handle(request);
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

  // 子应用 UI 的外链：交给系统浏览器（仅 http/https）
  ipcMain.handle("host:openExternal", async (_event, url: unknown) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
    await shell.openExternal(url);
    return true;
  });

  registerAppProtocol();
  const win = await createMainWindow();
  win.setTitle(STRINGS[currentLang].appName);

  if (process.env.MYOUTSIDE_SMOKE === "1") {
    await runSmoke(win);
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
