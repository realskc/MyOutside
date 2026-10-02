import { app, BrowserWindow, ipcMain, protocol } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { createKernel } from "@myoutside/kernel";
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
        `({ title: document.title, ready: document.readyState, hasTopbar: !!document.querySelector(".topbar"), text: (document.body && document.body.innerText || "").slice(0, 160) })`,
      );
      console.log("[smoke] vocab debug:", JSON.stringify(debug));
    } else {
      console.log("[smoke] vocab iframe 未找到");
    }

    const shotPath = join(app.getPath("temp"), "myoutside-smoke.png");
    let png = Buffer.alloc(0);
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
    await new Promise((resolve) => setTimeout(resolve, 800));
    const vocabShotPath = join(app.getPath("temp"), "myoutside-vocab.png");
    let vocabPng = Buffer.alloc(0);
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

  ipcMain.handle("kernel:call", async (_event, request: { call: string; payload?: unknown }) => {
    return kernel.handle(request);
  });

  registerAppProtocol();
  const win = await createMainWindow();

  if (process.env.MYOUTSIDE_SMOKE === "1") {
    await runSmoke(win);
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
