import { app, BrowserWindow, ipcMain, Menu, protocol, type MenuItemConstructorOptions } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { createKernel, type Kernel } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";
import { vocabApp } from "@myoutside/vocab";

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
    let png: Buffer = Buffer.alloc(0);
    for (let attempt = 0; attempt < 10 && png.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const image = await win.webContents.capturePage();
      const size = image.getSize();
      console.log("[smoke] capture size:", JSON.stringify(size));
      png = image.toPNG();
    }
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
    let vocabPng: Buffer = Buffer.alloc(0);
    for (let attempt = 0; attempt < 10 && vocabPng.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      vocabPng = (await win.webContents.capturePage()).toPNG();
    }
    writeFileSync(vocabShotPath, vocabPng);
    console.log("[smoke] vocab screenshot:", vocabShotPath, `(${vocabPng.length} bytes)`);
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

  const dataDir = app.getPath("userData");
  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, "myoutside.db");
  console.log("[host] data dir:", dataDir);

  const kernel = createKernel({ storage: createNodeSqliteAdapter({ path: dbPath }) });
  kernel.registerApp(vocabApp);
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
