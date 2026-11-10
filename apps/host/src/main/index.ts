import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  safeStorage,
  shell,
  type MenuItemConstructorOptions,
  type WebFrameMain,
} from "electron";
import { randomUUID } from "node:crypto";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { createKernel, SHELL_CALLER, type Kernel, type SecretCodec } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";
import { vocabApp } from "@myoutside/vocab";
import vocabManifest from "@myoutside/vocab/manifest.json";
import { dialogApp } from "@myoutside/dialog";
import dialogManifest from "@myoutside/dialog/manifest.json";
import { goApp } from "@myoutside/go";
import goManifest from "@myoutside/go/manifest.json";
import { createX66CCFFApp } from "@myoutside/66ccff";
import x66ccffManifest from "@myoutside/66ccff/manifest.json";
import { createZheyeApp } from "@myoutside/zheye";
import zheyeManifest from "@myoutside/zheye/manifest.json";
import { startLanServer } from "./lan-server";
import { runAiCheck } from "./ai-check";

// 数据目录使用正式名称：%APPDATA%/MyOutside
app.setName("MyOutside");

/** 真实的数据目录（冒烟模式改用临时目录前先记下，用来复制数据库） */
const REAL_USER_DATA = app.getPath("userData");

if (process.env.MYOUTSIDE_SMOKE === "1") {
  // 关闭站点隔离：capturePage 对跨源 iframe（OOPIF）拍不到内容，仅测试用
  app.commandLine.appendSwitch("disable-site-isolation-trials");
  // 独立的浏览器配置目录：不和正在运行的 MyOutside 抢单实例锁、不共用配置
  const smokeProfile = join(app.getPath("temp"), "myoutside-smoke-profile");
  mkdirSync(smokeProfile, { recursive: true });
  // Windows 上 safeStorage 的密钥记在配置目录的 Local State 里：带过去，才能解密数据库副本里的凭据（macOS 用钥匙串，不受影响）
  const localState = join(REAL_USER_DATA, "Local State");
  if (existsSync(localState)) copyFileSync(localState, join(smokeProfile, "Local State"));
  app.setPath("userData", smokeProfile);
}

/**
 * 凭据加解密（D-0075）：Electron safeStorage——macOS 上加密密钥由系统钥匙串保管（Windows 上是 DPAPI）。
 * 系统不支持时返回 undefined，凭据退回明文保存。
 */
function createSecretCodec(): SecretCodec | undefined {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[host] 系统不支持 safeStorage，凭据将以明文保存");
    return undefined;
  }
  return {
    encrypt: (plain) => safeStorage.encryptString(plain).toString("base64"),
    decrypt: (cipher) => safeStorage.decryptString(Buffer.from(cipher, "base64")),
  };
}

/** 冒烟测试默认在后台运行：不显示窗口、不抢焦点、不在 Dock 出现；MYOUTSIDE_SMOKE_SHOW=1 时显示（调试用） */
const SMOKE_HIDDEN = process.env.MYOUTSIDE_SMOKE === "1" && process.env.MYOUTSIDE_SMOKE_SHOW !== "1";

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

/** apps/host：按打包文件所在位置推算（dist/ 或冒烟测试的 dist-smoke/ 都在 apps/host 下） */
const HOST_DIR = resolve(__dirname, "..");
/** 各子应用的目录：apps/<id> */
const appDir = (id: string) => resolve(HOST_DIR, "..", id);

/** 子应用可以请外壳用系统默认程序打开的文件类型（只限它自己目录下的文本文件，D-0077） */
const OPENABLE_EXTENSIONS = new Set([".md", ".json", ".txt"]);

function buildUiDirs(kernel: Kernel): Record<string, string> {
  const appPath = HOST_DIR;
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

/** URL host 是大小写不敏感的；应用 id 保留原始大小写，这里做 host → id 映射。 */
function buildAppIdByHost(kernel: Kernel): Map<string, string> {
  return new Map(kernel.listApps().map(({ id }) => [id.toLowerCase(), id]));
}

function registerAppProtocol(uiDirs: Record<string, string>, appIdByHost: Map<string, string>): void {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    const appId = url.hostname === SHELL_CALLER ? SHELL_CALLER : appIdByHost.get(url.hostname);
    const base = appId ? uiDirs[appId] : undefined;
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
function registerMediaProtocol(dataDir: string, appIds: Set<string>, appIdByHost: Map<string, string>): void {
  const appsRoot = resolve(dataDir, "apps");
  protocol.handle("media", async (request) => {
    const url = new URL(request.url);
    const appId = appIdByHost.get(url.hostname);
    if (!appId || !appIds.has(appId)) return new Response("Not Found", { status: 404 });
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

/** 冒烟用：一段 120 BPM 的小 MIDI（C 大调音阶 + 两个和弦），给卷帘检查用 */
function makeSmokeMidi(): Buffer {
  const vlq = (value: number) => {
    const bytes = [value & 0x7f];
    for (let rest = value >> 7; rest > 0; rest >>= 7) bytes.unshift((rest & 0x7f) | 0x80);
    return bytes;
  };
  const events: number[] = [0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20]; // 120 BPM
  const notes = [60, 62, 64, 65, 67, 69, 71, 72];
  notes.forEach((note) => events.push(...vlq(0), 0x90, note, 90, ...vlq(240), 0x80, note, 64));
  for (const chord of [[60, 64, 67], [65, 69, 72]]) {
    chord.forEach((note, i) => events.push(...vlq(0), 0x90, note, 80));
    chord.forEach((note, i) => events.push(...vlq(i === 0 ? 960 : 0), 0x80, note, 64));
  }
  events.push(0x00, 0xff, 0x2f, 0x00);
  const header = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0]);
  const track = Buffer.alloc(8 + events.length);
  track.write("MTrk", 0);
  track.writeUInt32BE(events.length, 4);
  Buffer.from(events).copy(track, 8);
  return Buffer.concat([header, track]);
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

async function waitFor(win: BrowserWindow, condition: string, attempts = 40, delayMs = 250): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    if ((await win.webContents.executeJavaScript(condition)) as boolean) return true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

/**
 * 哲野试验台（ZHEYE-0020）：流程页能读到配方；在临时数据副本里写一次演示试跑，看试跑页能显示；
 * MYOUTSIDE_SMOKE_ZHEYE_LIVE=1 时再经界面真跑一次（真实调用 DeepSeek，花费几毛钱，最多等 25 分钟）。
 */
async function smokeZheye(win: BrowserWindow): Promise<void> {
  await win.loadURL("app://zheye/index.html");
  await waitFor(win, 'typeof window.outside === "object" && document.querySelectorAll("#view-flow .node").length > 0');
  const flow = await win.webContents.executeJavaScript(
    `(async () => {
      const r = await window.outside.call("zheye.getRecipe", { type: "concept" });
      const nodes = [...document.querySelectorAll("#view-flow .node")];
      if (nodes[4]) nodes[4].click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { ok: r.ok, stages: r.ok && r.result.recipe ? r.result.recipe.stages.length : null, error: r.ok ? r.result.error : r.error.message,
        nodes: nodes.length, files: document.querySelectorAll(".file-card").length, rendered: (document.querySelector(".flow-detail .pre") || {}).textContent?.length || 0,
        hasOpen: typeof window.outside.openAppFile === "function" };
    })()`,
  );
  console.log("[smoke] zheye flow:", JSON.stringify(flow));
  writeFileSync(join(app.getPath("temp"), "myoutside-zheye-flow.png"), await captureWindow(win, 8, 300));

  // 演示试跑：经内部事务 API 写入（只在临时数据副本里）
  const demo = await win.webContents.executeJavaScript(
    `(async () => {
      const call = async (name, payload) => { const r = await window.outside.call(name, payload); if (!r.ok) throw new Error(name + ": " + r.error.message); return r.result; };
      const { recipe } = await call("zheye.getRecipe", { type: "concept" });
      const runId = "smoke-" + Date.now();
      await call("zheye.trialCreate", { id: runId, subject: "通货膨胀（演示）", type: "concept", flow: recipe.name, recipeHash: recipe.hash, recipe });
      const usage = { promptTokens: 4200, completionTokens: 900, totalTokens: 5100, reasoningTokens: 600, cacheHitTokens: 1200 };
      await call("zheye.trialAppend", { runId, stage: "research", kind: "stage_start", data: { name: "搜集资料", system: "（系统提示词）", user: "讲解对象：通货膨胀（概念）" } });
      await call("zheye.trialAppend", { runId, stage: "research", kind: "doc", data: { doc: "资料", op: "write", content: "- 通胀：物价普遍、持续上涨\\n- 例子：1923 年德国" } });
      await call("zheye.trialAppend", { runId, stage: "research", kind: "round", data: { index: 1, reasoning: "先搜一下通胀的经典例子。", content: "", usage, model: "deepseek-flash", costYuan: 0.0123, webCalls: 1,
        toolCalls: [
          { id: "a", name: "web_search", arguments: JSON.stringify({ query: "恶性通胀 例子" }), ok: true, summary: "搜索：恶性通胀 例子", result: "[1] 魏玛德国恶性通胀\\nhttps://example.com" },
          { id: "b", name: "write_doc", arguments: JSON.stringify({ name: "资料", content: "- 通胀：物价普遍、持续上涨\\n- 例子：1923 年德国" }), ok: true, summary: "重写「资料」", result: "已写入" } ] } });
      await call("zheye.trialAppend", { runId, stage: "research", kind: "stage_end", data: { stopReason: "done", error: null, costYuan: 0.0123 } });
      await call("zheye.trialAppend", { runId, stage: "write", kind: "stage_start", data: { name: "编写文章", system: "（系统提示词）", user: "（草稿）" } });
      const article = "## 从一个例子说起\\n\\n1923 年的德国，面包早上和晚上的价格不一样。\\n\\n## [物价普遍上涨时，存钱的人吃亏](#断言:物价普遍上涨时，存钱的人吃亏)\\n\\n[货币](#概念:货币)的购买力下降……";
      await call("zheye.trialAppend", { runId, stage: "write", kind: "doc", data: { doc: "文章", op: "write", content: article } });
      await call("zheye.trialAppend", { runId, stage: "write", kind: "doc", data: { doc: "文章", op: "edit", content: article.replace("不一样", "可能不一样"), old: "不一样", new: "可能不一样" } });
      await call("zheye.trialAppend", { runId, stage: "write", kind: "round", data: { index: 1, reasoning: "按大纲写。", content: "写好了。", usage, model: "deepseek-flash", costYuan: 0.02, webCalls: 0,
        toolCalls: [
          { id: "c", name: "write_doc", arguments: JSON.stringify({ name: "文章", content: article }), ok: true, summary: "重写「文章」", result: "已写入" },
          { id: "d", name: "edit_doc", arguments: JSON.stringify({ name: "文章", old: "不一样", new: "可能不一样" }), ok: true, summary: "修改「文章」", result: "已修改" } ] } });
      await call("zheye.trialAppend", { runId, stage: "write", kind: "stage_end", data: { stopReason: "done", error: null, costYuan: 0.02 } });
      await call("zheye.trialFinish", { runId, status: "done", error: null, docs: {}, usage, costYuan: 0.0323, webCalls: 1 });
      return runId;
    })()`,
  );
  await win.reload();
  await waitFor(win, 'document.querySelectorAll(".run-item").length > 0');
  const runView = await win.webContents.executeJavaScript(
    `(async () => {
      document.querySelector(".run-item").click();
      for (let i = 0; i < 20 && !document.querySelector(".docs-panel .doc-body"); i += 1) await new Promise((r) => setTimeout(r, 150));
      await new Promise((r) => setTimeout(r, 300));
      return { stages: document.querySelectorAll(".stage").length, rounds: document.querySelectorAll(".round").length, tools: document.querySelectorAll(".tool").length,
        marks: document.querySelectorAll(".docs-panel .zy-mark").length, version: (document.querySelector(".doc-bar .small") || {}).textContent || "",
        strip: document.querySelectorAll(".graph-strip .node").length, title: (document.querySelector(".run-title h2") || {}).textContent || "" };
    })()`,
  );
  console.log("[smoke] zheye demo run:", demo, JSON.stringify(runView));
  writeFileSync(join(app.getPath("temp"), "myoutside-zheye-run.png"), await captureWindow(win, 8, 300));

  if (process.env.MYOUTSIDE_SMOKE_ZHEYE_LIVE !== "1") return;
  const subject = process.env.MYOUTSIDE_SMOKE_ZHEYE_SUBJECT ?? "通货膨胀";
  await win.webContents.executeJavaScript(
    `(() => { document.getElementById("subject").value = ${JSON.stringify(subject)}; document.getElementById("btn-start").click(); return true; })()`,
  );
  const started = Date.now();
  let midShot = false;
  let last = "";
  while (Date.now() - started < 25 * 60_000) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const state = (await win.webContents.executeJavaScript(
      `(async () => { const r = await window.outside.call("zheye.trialList", {}); const run = r.ok ? r.result.find((item) => !item.id.startsWith("smoke-")) : null;
        return run ? { status: run.status, cost: run.costYuan, web: run.webCalls, stages: document.querySelectorAll(".graph-strip .node-done").length, live: !!document.querySelector(".round.live") } : null; })()`,
    )) as { status: string; cost: number; web: number; stages: number; live: boolean } | null;
    const line = JSON.stringify(state);
    if (line !== last) console.log("[smoke] zheye live:", Math.round((Date.now() - started) / 1000) + "s", line);
    last = line;
    if (state && !midShot && state.live && state.stages >= 1) {
      writeFileSync(join(app.getPath("temp"), "myoutside-zheye-live.png"), await captureWindow(win, 4, 100));
      midShot = true;
    }
    if (state && state.status !== "running") break;
  }
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const final = await win.webContents.executeJavaScript(
    `(async () => { const list = await window.outside.call("zheye.trialList", {}); const run = list.result.find((item) => !item.id.startsWith("smoke-"));
      const detail = await window.outside.call("zheye.trialGet", { runId: run.id });
      const docs = {}; for (const e of detail.result.events) if (e.kind === "doc") docs[e.data.doc] = e.data.content;
      const failures = detail.result.events.filter((e) => e.kind === "round").flatMap((e) => e.data.toolCalls).filter((c) => !c.ok).map((c) => c.name + ": " + c.result.slice(0, 120));
      return { status: run.status, error: run.error, cost: run.costYuan, web: run.webCalls, usage: run.usage, seconds: Math.round(((run.finishedAt || Date.now()) - run.startedAt) / 1000),
        events: detail.result.events.length, rounds: detail.result.events.filter((e) => e.kind === "round").length,
        docLengths: Object.fromEntries(Object.entries(docs).map(([k, v]) => [k, v.length])), failures, article: docs["文章"] || "", prerequisites: docs["前置"] || "" }; })()`,
  );
  console.log("[smoke] zheye live final:", JSON.stringify({ ...final, article: undefined, prerequisites: undefined }));
  writeFileSync(join(app.getPath("temp"), "myoutside-zheye-article.md"), `${final.article}\n\n---\n\n${final.prerequisites}\n`);
  writeFileSync(join(app.getPath("temp"), "myoutside-zheye-final.png"), await captureWindow(win, 6, 300));
}

/**
 * 纯蓝的回归检查（66CCFF-0011）：独奏一条非主轨（主轨因此被静音）后播放，窗口真的隐藏几秒再显示，
 * 各轨不能回退到隐藏那一刻。主冒烟窗口关了后台节流、页面始终算「可见」，所以另开一个看不见、不抢焦点的小窗口。
 */
async function smokeX66ccffBackground(kernel: Kernel, appDir: string, trackId: string | null): Promise<void> {
  if (!trackId) {
    console.log("[smoke] 66CCFF background: skipped (import failed)");
    return;
  }
  const kinds = ["vocals", "drums", "bass", "other", "guitar", "piano"] as const;
  const wav = makeSilentWav(20);
  mkdirSync(join(appDir, "tracks", trackId, "stems"), { recursive: true });
  const stems = kinds.map((kind) => {
    const file = `tracks/${trackId}/stems/${kind}.wav`;
    writeFileSync(join(appDir, file), wav);
    return { kind, file, size: wav.length };
  });
  const jobId = randomUUID();
  for (const [call, payload] of [
    ["66CCFF.insertJob", { id: jobId, trackId }],
    ["66CCFF.finishJob", { jobId, trackId, stems }],
  ] as const) {
    const result = await kernel.handle({ call, payload }, { caller: "66CCFF" });
    if (!result.ok) throw new Error(`${call}: ${result.error.message}`);
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const probe = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    opacity: 0,
    width: 480,
    height: 360,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: false, nodeIntegration: false },
  });
  probe.setIgnoreMouseEvents(true);
  try {
    await probe.loadURL("app://66ccff/index.html");
    probe.showInactive();
    const audios = 'document.querySelectorAll("#audio-holder audio")';
    await waitFor(probe, `[...document.querySelectorAll(".track-item .title")].some((el) => el.textContent === "smoke")`);
    await probe.webContents.executeJavaScript(
      `[...document.querySelectorAll(".track-item")].find((item) => item.querySelector(".title").textContent === "smoke").click(); true`,
    );
    const loaded = await waitFor(probe, `${audios}.length === 6 && [...${audios}].every((audio) => audio.readyState >= 2)`);
    // 独奏第二轨（鼓）：第一轨人声就是主播放器，因此从开始播放起就是静音的
    await probe.webContents.executeJavaScript(
      `document.querySelectorAll("#mixer .stem-row")[1].querySelector(".stem-toggle.solo").click();
       document.getElementById("btn-play").click(); true`,
      true,
    );
    await sleep(1500);
    probe.hide();
    await sleep(3000);
    const hidden = await probe.webContents.executeJavaScript("document.visibilityState");
    probe.showInactive();
    await sleep(1200);
    const times = (await probe.webContents.executeJavaScript(
      `[...${audios}].map((audio) => Math.round(audio.currentTime * 100) / 100)`,
    )) as number[];
    await probe.webContents.executeJavaScript(`document.getElementById("btn-play").click(); true`);
    // 显示了约 1.5 + 3 + 1.2 秒：没有回退时各轨都在 4.5 秒以后，并且彼此对齐
    const ok = loaded && times.length === 6 && Math.min(...times) > 4.5 && Math.max(...times) - Math.min(...times) < 0.3;
    console.log("[smoke] 66CCFF background:", JSON.stringify({ ok, hidden, times }));

    // 接进 Web Audio 的 media:// 音频真的有数据（将来 Electron 若按跨源处理、只给静音，这里会失败）；只分析、不接扬声器
    const tone = makeSilentWav(1);
    for (let i = 0; i < (tone.length - 44) / 4; i += 1) {
      const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / 44100) * 0.2 * 32767);
      tone.writeInt16LE(sample, 44 + i * 4);
      tone.writeInt16LE(sample, 46 + i * 4);
    }
    writeFileSync(join(appDir, "tracks", trackId, "tone.wav"), tone);
    const peak = (await probe.webContents.executeJavaScript(
      `(async () => {
        const context = new AudioContext();
        const audio = new Audio("media://66ccff/tracks/${trackId}/tone.wav");
        const analyser = context.createAnalyser();
        context.createMediaElementSource(audio).connect(analyser);
        await context.resume();
        await audio.play();
        await new Promise((resolve) => setTimeout(resolve, 400));
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        audio.pause();
        await context.close();
        return Math.max(...data.map(Math.abs));
      })()`,
      true,
    )) as number;
    console.log("[smoke] 66CCFF web audio:", JSON.stringify({ ok: peak > 0.05, peak: Math.round(peak * 1000) / 1000 }));

    // 转 MIDI 面板（66CCFF-0012）：有分轨时出现；冒烟的临时数据里没装 MuScriptor，应显示安装提示、按钮不可点
    const transcribe = await probe.webContents.executeJavaScript(
      `(() => {
        const panel = document.getElementById("transcribe-panel");
        return {
          visible: !!panel && !panel.classList.contains("hidden"),
          stems: document.querySelectorAll("#transcribe-stems input[type=checkbox]").length,
          checked: [...document.querySelectorAll("#transcribe-stems .stem-check.on")].map((el) => el.textContent),
          instrument: document.getElementById("transcribe-instrument").value,
          instruments: document.getElementById("transcribe-instrument").options.length,
          buttonDisabled: document.getElementById("btn-transcribe").disabled,
          help: document.getElementById("transcribe-help-command").textContent,
          separationHelp: document.getElementById("engine-help-command").textContent,
        };
      })()`,
    );
    // 分离引擎的安装命令要按平台显示（66CCFF-0013：以前页面里写死了 Windows 的命令）
    const expectedSetup = process.platform === "darwin" ? "setup-engine-macos.sh" : process.platform === "win32" ? "setup-engine.ps1" : "";
    console.log(
      "[smoke] 66CCFF separation help:",
      JSON.stringify({ ok: !!expectedSetup && transcribe.separationHelp.includes(expectedSetup), command: transcribe.separationHelp }),
    );
    console.log(
      "[smoke] 66CCFF transcribe panel:",
      JSON.stringify({ ok: transcribe.visible && transcribe.stems === 6 && transcribe.instruments > 30, ...transcribe }),
    );

    // 钢琴卷帘（66CCFF-0015）：给测试曲目一个转写结果，卷帘应读出来、能切到沉浸模式；这一段只跳转不播放，后面的合成器检查先把窗口静音再播
    const transcriptionId = randomUUID();
    const midiFile = `tracks/${trackId}/midi/${transcriptionId}.mid`;
    mkdirSync(join(appDir, "tracks", trackId, "midi"), { recursive: true });
    writeFileSync(join(appDir, midiFile), makeSmokeMidi());
    for (const [call, payload] of [
      ["66CCFF.insertTranscription", { id: transcriptionId, trackId, stems: ["piano"], instrument: "acoustic_piano", model: "medium" }],
      ["66CCFF.finishTranscription", { transcriptionId, file: midiFile, noteCount: 16, bpm: 120 }],
    ] as const) {
      const result = await kernel.handle({ call, payload }, { caller: "66CCFF" });
      if (!result.ok) throw new Error(`${call}: ${result.error.message}`);
    }
    probe.setSize(1280, 900);
    await probe.loadURL("app://66ccff/index.html");
    // 记下合成器每个振荡器的开始时间（AudioContext 的时间），用来检查 MIDI 跟播放器对得上
    await probe.webContents.executeJavaScript(
      `(() => {
        window.__smokeStarts = [];
        const start = OscillatorNode.prototype.start;
        OscillatorNode.prototype.start = function (when) {
          window.__smokeStarts.push(when);
          return start.apply(this, arguments);
        };
        return true;
      })()`,
    );
    await waitFor(probe, `[...document.querySelectorAll(".track-item .title")].some((el) => el.textContent === "smoke")`);
    await probe.webContents.executeJavaScript(
      `[...document.querySelectorAll(".track-item")].find((item) => item.querySelector(".title").textContent === "smoke").click(); true`,
    );
    const rollReady = await waitFor(probe, `document.querySelectorAll("#roll-panel .roll-chip").length > 0`);
    await probe.webContents.executeJavaScript(
      `(() => {
        const seek = document.getElementById("seek");
        seek.value = "100"; // 20 秒的 10%：第 2 秒
        seek.dispatchEvent(new Event("input"));
        seek.dispatchEvent(new Event("change"));
        document.getElementById("roll-panel").scrollIntoView();
        return true;
      })()`,
    );
    await sleep(500);
    const rollState = await probe.webContents.executeJavaScript(
      `(() => {
        const panel = document.getElementById("roll-panel");
        const canvas = panel.querySelector("canvas");
        return {
          visible: !panel.classList.contains("hidden"),
          chips: panel.querySelectorAll(".roll-chip").length,
          canvas: [canvas.width, canvas.height],
          mixerMidi: [...document.querySelectorAll("#mixer .stem-name")].some((el) => el.textContent === "MIDI"),
          toggle: [...document.querySelectorAll(".transcription-actions .ghost")].map((el) => el.textContent),
        };
      })()`,
    );
    writeFileSync(join(app.getPath("temp"), "myoutside-66CCFF-roll.png"), (await probe.webContents.capturePage()).toPNG());
    await probe.webContents.executeJavaScript(`[...document.querySelectorAll("#roll-panel .roll-mode")][1].click(); true`);
    await sleep(600);
    const immersive = await probe.webContents.executeJavaScript(
      `document.getElementById("roll-panel").classList.contains("immersive")`,
    );
    writeFileSync(join(app.getPath("temp"), "myoutside-66CCFF-fall.png"), (await probe.webContents.capturePage()).toPNG());
    await probe.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); true`);
    await sleep(200);
    const exited = await probe.webContents.executeJavaScript(`!document.getElementById("roll-panel").classList.contains("immersive")`);

    // 合成器：静音整个窗口（不出声）后，从第 2 秒用 50% 速度播约 2.6 秒。
    // 冒烟 MIDI 第 2、3 秒各有一个三和弦，慢放一半后两组开始时间应相差约 2 秒；暂停后不再排新的音
    probe.webContents.setAudioMuted(true);
    await probe.webContents.executeJavaScript(
      `(() => {
        const speed = document.getElementById("speed");
        speed.value = "0.5";
        speed.dispatchEvent(new Event("change"));
        const seek = document.getElementById("seek");
        seek.value = "100";
        seek.dispatchEvent(new Event("input"));
        seek.dispatchEvent(new Event("change"));
        window.__smokeStarts.length = 0;
        document.getElementById("btn-play").click();
        return true;
      })()`,
      true,
    );
    await sleep(2600);
    await probe.webContents.executeJavaScript(`document.getElementById("btn-play").click(); true`);
    const afterPause = (await probe.webContents.executeJavaScript(`window.__smokeStarts.length`)) as number;
    await sleep(400);
    const starts = (await probe.webContents.executeJavaScript(`window.__smokeStarts.slice()`)) as number[];
    const onsets = [...new Set(starts.map((value) => Math.round(value * 100) / 100))].sort((a, b) => a - b);
    const gap = onsets.length >= 2 ? Math.round((onsets[onsets.length - 1] - onsets[0]) * 100) / 100 : null;
    console.log(
      "[smoke] 66CCFF roll synth:",
      JSON.stringify({ ok: starts.length === 12 && gap !== null && Math.abs(gap - 2) < 0.06 && afterPause === starts.length, oscillators: starts.length, gap }),
    );
    console.log(
      "[smoke] 66CCFF roll:",
      JSON.stringify({
        ok: rollReady && rollState.visible && rollState.chips === 1 && rollState.canvas[0] > 0 && rollState.mixerMidi && immersive && exited,
        ...rollState,
        immersive,
        exited,
      }),
    );
  } finally {
    probe.destroy();
  }
}

async function runSmoke(win: BrowserWindow, kernel: Kernel): Promise<void> {
  const guard = setTimeout(
    () => {
      console.error("[smoke] 超时，强制退出");
      app.quit();
    },
    process.env.MYOUTSIDE_SMOKE_ZHEYE_LIVE === "1" ? 27 * 60_000 : process.env.MYOUTSIDE_SMOKE_LIVE === "1" ? 120000 : 45000,
  );
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
        const steps = [{ reasoning: "先搜一下有没有现成的故事。", content: "", toolCalls: [{ id: "c1", name: "web_search", arguments: "{}", ok: true, summary: "搜索：长故事", result: "" }] }];
        await window.outside.call("dialog.saveReply", { ...base, parentId: q1.result.messageId, content: "从前有座山，山里有座庙，", reasoning: "组织回答。", steps, stopped: true });
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
      `({ katex: document.querySelectorAll(".katex").length, display: document.querySelectorAll(".math-display").length, table: !!document.querySelector(".bubble table"), webSearchToggle: !!document.getElementById("web-search-toggle"), tags: [...document.querySelectorAll(".stopped-tag")].map((tag) => tag.textContent + "|" + tag.title), stoppedReasoning: ((document.querySelector(".msg .stopped-tag") || {}).closest ? document.querySelector(".msg .stopped-tag").closest(".msg").querySelector(".reasoning-body").textContent : null), context: (document.getElementById("usage-total") || {}).textContent || "" })`,
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
    // 实验室（DIALOG-0020）：页面能加载，能经桥导出某个对话的真实请求（只读，不调用模型）
    await win.loadURL("app://dialog/lab.html");
    for (let i = 0; i < 24; i += 1) {
      const ready = (await win.webContents.executeJavaScript(
        'document.readyState === "complete" && typeof window.outside === "object" && !!document.getElementById("lab-request")',
      )) as boolean;
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const labCheck = await win.webContents.executeJavaScript(
      `(async () => {
        const list = await window.outside.call("dialog.listConversations", {});
        const id = list.ok && list.result.length > 0 ? list.result[0].id : null;
        let request = null;
        if (id) {
          const path = await window.outside.call("dialog.getPath", { conversationId: id, limit: 1000 });
          const user = path.ok ? [...path.result.messages].reverse().find((message) => message.role === "user") : null;
          if (user) {
            const r = await window.outside.call("dialog.getRequest", { conversationId: id, messageId: user.id });
            request = r.ok
              ? { ok: true, model: r.result.body.model, messages: r.result.body.messages.length, tools: r.result.body.tools.length }
              : { ok: false, code: r.error.code };
          }
        }
        // 块编辑器（DIALOG-0021）：在块里改内容，切到 JSON 能看到；再从对话导入，消息逐条变成块
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        document.querySelector('[data-mode="blocks"]').click();
        document.getElementById("btn-blank").click();
        const blocksBefore = document.querySelectorAll("#lab-blocks .lab-msg").length;
        const userText = document.querySelector('#lab-blocks .lab-msg[data-role="user"] textarea');
        let synced = false;
        if (userText) {
          userText.value = "smoke-hello";
          userText.dispatchEvent(new Event("input"));
          document.querySelector('[data-mode="json"]').click();
          const json = JSON.parse(document.getElementById("lab-request").value);
          synced = json.messages.some((message) => message.content === "smoke-hello");
          document.querySelector('[data-mode="blocks"]').click();
        }
        let imported = null;
        if (id) {
          document.getElementById("btn-import").click();
          for (let i = 0; i < 20 && !document.querySelector(".lab-import-item"); i += 1) await sleep(100);
          const item = document.querySelector(".lab-import-item");
          if (item) {
            item.click();
            for (let i = 0; i < 20 && document.querySelectorAll("#lab-blocks .lab-msg").length <= 2; i += 1) await sleep(100);
            imported = {
              messages: document.querySelectorAll("#lab-blocks .lab-msg").length,
              tools: document.querySelectorAll("#lab-blocks .lab-tool-def").length,
            };
          }
        }
        return {
          title: document.title,
          hasRequest: !!document.getElementById("lab-request"),
          hasRun: !!document.getElementById("btn-run"),
          hasHistory: !!document.getElementById("lab-runs"),
          request,
          blocks: { before: blocksBefore, synced, imported },
        };
      })()`,
    );
    console.log("[smoke] dialog lab:", JSON.stringify(labCheck));
    const labShotPath = join(app.getPath("temp"), "myoutside-dialog-lab.png");
    const labPng = await captureWindow(win, 12, 500);
    writeFileSync(labShotPath, labPng);
    console.log("[smoke] dialog lab screenshot:", labShotPath, `(${labPng.length} bytes)`);

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

    // 纯蓝：验证 app://66ccff 能加载、曲目列表 / 引擎状态 / media:// 音频链路
    const smokeAppDir = join(app.getPath("temp"), "myoutside-smoke-data", "apps", "66CCFF");
    const smokeWavPath = join(smokeAppDir, "smoke.wav");
    mkdirSync(smokeAppDir, { recursive: true });
    writeFileSync(smokeWavPath, makeSilentWav(1));
    await win.loadURL("app://66ccff/index.html");
    for (let i = 0; i < 24; i += 1) {
      const ready = (await win.webContents.executeJavaScript(
        'document.readyState === "complete" && typeof window.outside === "object" && !!document.getElementById("btn-import")',
      )) as boolean;
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const x66ccffCheck = await win.webContents.executeJavaScript(
      `(async () => {
        const list = await window.outside.call("66CCFF.listTracks", {});
        const engine = await window.outside.call("66CCFF.getEngineStatus", {});
        const audio = await new Promise((resolve) => {
          const element = new Audio("media://66ccff/smoke.wav");
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
    console.log("[smoke] 66CCFF:", JSON.stringify(x66ccffCheck));
    const x66ccffShotPath = join(app.getPath("temp"), "myoutside-66CCFF.png");
    const x66ccffPng = await captureWindow(win, 8, 400);
    writeFileSync(x66ccffShotPath, x66ccffPng);
    console.log("[smoke] 66CCFF screenshot:", x66ccffShotPath, `(${x66ccffPng.length} bytes)`);

    // 纯蓝：真实导入一段静音 WAV（临时数据），验证导入 + 详情界面
    const x66ccffImport = await win.webContents.executeJavaScript(
      `(async () => {
        const r = await window.outside.call("66CCFF.importTrack", { path: ${JSON.stringify(smokeWavPath)} });
        return { ok: r.ok, id: r.ok ? r.result.id : null, error: r.ok ? null : r.error };
      })()`,
    );
    console.log("[smoke] 66CCFF import:", JSON.stringify(x66ccffImport));
    await win.reload();
    for (let i = 0; i < 24; i += 1) {
      const ready = (await win.webContents.executeJavaScript(
        'document.readyState === "complete" && !!document.getElementById("track-title") && document.getElementById("track-title").textContent !== ""',
      )) as boolean;
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const x66ccffTrackPng = await captureWindow(win, 8, 400);
    const x66ccffTrackShotPath = join(app.getPath("temp"), "myoutside-66CCFF-track.png");
    writeFileSync(x66ccffTrackShotPath, x66ccffTrackPng);
    console.log(
      "[smoke] 66CCFF track screenshot:",
      x66ccffTrackShotPath,
      `(${x66ccffTrackPng.length} bytes)`,
    );
    await smokeX66ccffBackground(kernel, smokeAppDir, x66ccffImport.ok ? x66ccffImport.id : null);

    await smokeZheye(win);
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

  const kernel = createKernel({ storage: createNodeSqliteAdapter({ path: dbPath }), secrets: createSecretCodec() });
  kernel.registerApp(vocabApp, vocabManifest);
  kernel.registerApp(dialogApp, dialogManifest);
  kernel.registerApp(goApp, goManifest);
  kernel.registerApp(
    // 转 MIDI 的包装脚本从仓库里的 apps/66CCFF/scripts 读（66CCFF-0012）
    createX66CCFFApp({ dataDir: join(dataDir, "apps", "66CCFF"), scriptsDir: join(appDir("66CCFF"), "scripts") }),
    x66ccffManifest,
  );
  // 哲野的配方从仓库里的 apps/zheye/recipes 读：改了提示词，下一次试跑就生效（ZHEYE-0021）
  kernel.registerApp(createZheyeApp({ recipesDir: join(appDir("zheye"), "recipes") }), zheyeManifest);
  kernel.start();

  // pnpm ai:check：在临时数据副本上用真实接口检查平台 AI / 搜索 / 抓取，不打开窗口，结束即退出
  if (process.env.MYOUTSIDE_AI_CHECK === "1") {
    const passed = await runAiCheck(kernel);
    app.exit(passed ? 0 : 1);
    return;
  }
  const appIds = new Set(kernel.listApps().map((item) => item.id));
  const appIdByHost = buildAppIdByHost(kernel);
  registerMediaProtocol(dataDir, appIds, appIdByHost);

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
    const appId = appIdByHost.get(host);
    return appId && appIds.has(appId) ? appId : null;
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

  // 子应用请求选择本地 MIDI 文件；返回绝对路径数组
  ipcMain.handle("host:pickMidiFiles", async (event) => {
    const caller = callerOf(event.senderFrame);
    if (!caller || caller === SHELL_CALLER) return [];
    const result = await dialog.showOpenDialog({
      title: "选择 MIDI",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "MIDI", extensions: ["mid", "midi"] }],
    });
    return result.canceled ? [] : result.filePaths;
  });

  // 用系统默认程序打开子应用自己目录下的一个文本文件（例如哲野试验台的「在编辑器里打开」，D-0077）
  ipcMain.handle("host:openAppFile", async (event, path: unknown) => {
    const caller = callerOf(event.senderFrame);
    if (!caller || caller === SHELL_CALLER || typeof path !== "string") return { ok: false, error: "无法识别调用者" };
    const base = appDir(caller);
    const file = normalize(join(base, path));
    if (!file.startsWith(normalize(base) + sep)) return { ok: false, error: "只能打开本应用目录下的文件" };
    if (!OPENABLE_EXTENSIONS.has(extname(file).toLowerCase())) return { ok: false, error: "只能打开 .md / .json / .txt 文件" };
    if (!existsSync(file)) return { ok: false, error: "文件不存在" };
    const failure = await shell.openPath(file);
    return failure ? { ok: false, error: failure } : { ok: true };
  });

  registerAppProtocol(uiDirs, appIdByHost);
  const win = await createMainWindow();
  win.setTitle(STRINGS[currentLang].appName);

  if (process.env.MYOUTSIDE_SMOKE === "1") {
    await runSmoke(win, kernel);
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
