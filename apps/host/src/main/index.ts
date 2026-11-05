import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  shell,
  type MenuItemConstructorOptions,
  type WebFrameMain,
} from "electron";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { createKernel, SHELL_CALLER, type Kernel } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";
import { vocabApp } from "@myoutside/vocab";
import vocabManifest from "@myoutside/vocab/manifest.json";
import { dialogApp } from "@myoutside/dialog";
import dialogManifest from "@myoutside/dialog/manifest.json";
import { goApp } from "@myoutside/go";
import goManifest from "@myoutside/go/manifest.json";
import { createPureblueApp } from "@myoutside/pureblue";
import pureblueManifest from "@myoutside/pureblue/manifest.json";
import { startLanServer } from "./lan-server";

// 数据目录使用正式名称：%APPDATA%/MyOutside
app.setName("MyOutside");

// 冒烟模式下关闭站点隔离：capturePage 对跨源 iframe（OOPIF）拍不到内容，仅测试用
if (process.env.MYOUTSIDE_SMOKE === "1") {
  app.commandLine.appendSwitch("disable-site-isolation-trials");
}

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  {
    scheme: "media",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
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
  const appPath = app.getAppPath(); // apps/host
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

const MEDIA_MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".aac": "audio/aac",
};

/** 应用私有文件（媒体）：media://<appId>/<相对路径> → <dataDir>/apps/<appId>/<相对路径> */
function registerMediaProtocol(dataDir: string, appIds: Set<string>): void {
  const appsRoot = resolve(dataDir, "apps");
  protocol.handle("media", async (request) => {
    const url = new URL(request.url);
    const appId = url.hostname;
    if (!appIds.has(appId)) return new Response("Not Found", { status: 404 });
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const appRoot = normalize(join(appsRoot, appId));
    const file = normalize(join(appRoot, relativePath));
    if (!file.startsWith(appRoot + sep)) return new Response("Forbidden", { status: 403 });

    let fileStat;
    try {
      fileStat = statSync(file);
    } catch {
      return new Response("Not Found", { status: 404 });
    }
    if (!fileStat.isFile()) return new Response("Not Found", { status: 404 });
    const mime = MEDIA_MIME[extname(file).toLowerCase()] ?? "application/octet-stream";

    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (match) {
        let start = match[1] ? Number(match[1]) : NaN;
        let end = match[2] ? Number(match[2]) : NaN;
        if (Number.isNaN(start)) {
          const suffix = Number.isNaN(end) ? 0 : end;
          start = Math.max(0, fileStat.size - suffix);
          end = fileStat.size - 1;
        } else if (Number.isNaN(end) || end >= fileStat.size) {
          end = fileStat.size - 1;
        }
        if (start <= end && start < fileStat.size) {
          const stream = Readable.toWeb(createReadStream(file, { start, end }));
          return new Response(stream as unknown as ReadableStream, {
            status: 206,
            headers: {
              "content-type": mime,
              "content-length": String(end - start + 1),
              "content-range": `bytes ${start}-${end}/${fileStat.size}`,
              "accept-ranges": "bytes",
            },
          });
        }
      }
    }

    const stream = Readable.toWeb(createReadStream(file));
    return new Response(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        "content-type": mime,
        "content-length": String(fileStat.size),
        "accept-ranges": "bytes",
      },
    });
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

/** 冒烟用：生成一小段合法 WAV（静音），验证 media:// 音频链路 */
function makeSilentWav(seconds: number): Buffer {
  const sampleRate = 44100;
  const channels = 2;
  const bits = 16;
  const dataSize = sampleRate * channels * (bits / 8) * seconds;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bits / 8), 28);
  buffer.writeUInt16LE(channels * (bits / 8), 32);
  buffer.writeUInt16LE(bits, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
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
      `({ katex: document.querySelectorAll(".katex").length, display: document.querySelectorAll(".math-display").length, table: !!document.querySelector(".bubble table"), webSearchToggle: !!document.getElementById("web-search-toggle"), context: (document.getElementById("usage-total") || {}).textContent || "" })`,
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

    // 纯蓝：验证 app://pureblue 能加载、曲目列表 / 引擎状态 / media:// 音频链路
    const smokeAppDir = join(app.getPath("temp"), "myoutside-smoke-data", "apps", "pureblue");
    const smokeWavPath = join(smokeAppDir, "smoke.wav");
    mkdirSync(smokeAppDir, { recursive: true });
    writeFileSync(smokeWavPath, makeSilentWav(1));
    await win.loadURL("app://pureblue/index.html");
    for (let i = 0; i < 24; i += 1) {
      const ready = (await win.webContents.executeJavaScript(
        'document.readyState === "complete" && typeof window.outside === "object" && !!document.getElementById("btn-import")',
      )) as boolean;
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const pureblueCheck = await win.webContents.executeJavaScript(
      `(async () => {
        const list = await window.outside.call("pureblue.listTracks", {});
        const engine = await window.outside.call("pureblue.getEngineStatus", {});
        const audio = await new Promise((resolve) => {
          const element = new Audio("media://pureblue/smoke.wav");
          let done = false;
          const finish = (result) => { if (!done) { done = true; resolve(result); } };
          element.addEventListener("canplaythrough", () => finish({ ok: true, duration: element.duration }));
          element.addEventListener("error", () => finish({ ok: false, code: element.error ? element.error.code : null }));
          setTimeout(() => finish({ ok: false, timeout: true }), 3000);
          element.load();
        });
        return {
          listOk: list.ok,
          count: list.ok ? list.result.length : null,
          engineOk: engine.ok,
          engineReady: engine.ok ? engine.result.ready : null,
          hasImport: !!document.getElementById("btn-import"),
          chip: (document.getElementById("engine-chip") || {}).textContent || "",
          audio,
        };
      })()`,
    );
    console.log("[smoke] pureblue:", JSON.stringify(pureblueCheck));
    const pureblueShotPath = join(app.getPath("temp"), "myoutside-pureblue.png");
    const purebluePng = await captureWindow(win, 8, 400);
    writeFileSync(pureblueShotPath, purebluePng);
    console.log("[smoke] pureblue screenshot:", pureblueShotPath, `(${purebluePng.length} bytes)`);

    // 纯蓝：真实导入一段静音 WAV（临时数据），验证导入 + 详情界面
    const pureblueImport = await win.webContents.executeJavaScript(
      `(async () => {
        const r = await window.outside.call("pureblue.importTrack", { path: ${JSON.stringify(smokeWavPath)} });
        return { ok: r.ok, id: r.ok ? r.result.id : null, error: r.ok ? null : r.error };
      })()`,
    );
    console.log("[smoke] pureblue import:", JSON.stringify(pureblueImport));
    await win.reload();
    for (let i = 0; i < 24; i += 1) {
      const ready = (await win.webContents.executeJavaScript(
        'document.readyState === "complete" && !!document.getElementById("track-title") && document.getElementById("track-title").textContent !== ""',
      )) as boolean;
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const pureblueTrackPng = await captureWindow(win, 8, 400);
    const pureblueTrackShotPath = join(app.getPath("temp"), "myoutside-pureblue-track.png");
    writeFileSync(pureblueTrackShotPath, pureblueTrackPng);
    console.log(
      "[smoke] pureblue track screenshot:",
      pureblueTrackShotPath,
      `(${pureblueTrackPng.length} bytes)`,
    );

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
  kernel.registerApp(vocabApp, vocabManifest);
  kernel.registerApp(dialogApp, dialogManifest);
  kernel.registerApp(goApp, goManifest);
  kernel.registerApp(createPureblueApp({ dataDir: join(dataDir, "apps", "pureblue") }), pureblueManifest);
  kernel.start();
  const appIds = new Set(kernel.listApps().map((item) => item.id));
  registerMediaProtocol(dataDir, appIds);

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
    let result;
    try {
      result = await kernel.handle({ call: request.call, payload: request.payload }, { caller, emit, signal: controller.signal });
    } finally {
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

  // 子应用请求选择本地音频文件；只允许已注册的子应用页面调用
  ipcMain.handle("host:pickAudioFile", async (event) => {
    const caller = callerOf(event.senderFrame);
    if (!caller || caller === SHELL_CALLER) return null;
    const result = await dialog.showOpenDialog({
      title: "选择音频",
      properties: ["openFile"],
      filters: [{ name: "Audio", extensions: ["mp3", "wav", "flac", "m4a", "ogg", "aac"] }],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  registerAppProtocol(uiDirs);
  const win = await createMainWindow();
  win.setTitle(STRINGS[currentLang].appName);

  if (process.env.MYOUTSIDE_SMOKE === "1") {
    await runSmoke(win);
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
