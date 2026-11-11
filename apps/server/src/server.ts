import { promises as fs } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { extname, join, normalize, resolve, sep } from "node:path";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { MAX_USERNAME_LENGTH, normalizeUsername, openAccounts, type Accounts, type Session } from "./accounts.js";
import { cloudAppUiDirs, registerCloudApps } from "./cloud-apps.js";
import { createKernelManager, type KernelManager } from "./kernels.js";
import { createPasswordHasher, HashBusyError, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, type PasswordHasher } from "./password.js";
import { createLoginLimiter, type LoginLimiter } from "./rate-limit.js";
import { createAesSecretCodec, loadOrCreateMasterKey } from "./secrets.js";

/**
 * 服务器版 MyOutside（docs/future/web-version.md）：HTTP（外壳、子应用界面、登录）+ WebSocket（调用）。
 * 安全要求见 D-0093：没登录时能碰的东西最少、处处限大小、限次数但不为难人。
 */
export interface ServerConfig {
  /** 仓库根目录（开发）或发布目录（服务器） */
  root: string;
  /** 数据目录：platform.db、users/、secrets/ */
  dataDir: string;
  /** 浏览器看到的地址，例如 https://myoutside.org；用来检查请求来自自己的页面 */
  publicOrigin: string;
  /** 正式环境 true：cookie 只走 HTTPS（__Host- 前缀）；本机开发（http://localhost）false */
  secureCookies: boolean;
  /** 在 Caddy 后面：从本机来的请求，按 X-Forwarded-For 认访客地址 */
  trustProxy: boolean;
  now?: () => number;
  /** 测试用：低成本的哈希 */
  hasher?: PasswordHasher;
  log?: (line: string) => void;
  kernelIdleMs?: number;
}

/** 没登录时能发的请求（登录、设置密码）最大 4 KB；超长的用户名在这里就被挡掉（作者：防两百万位长的用户名） */
export const AUTH_BODY_LIMIT = 4 * 1024;
/** WebSocket 每条消息最大 1 MB */
export const WS_MESSAGE_LIMIT = 1024 * 1024;
/** 一条连接上同时进行的调用最多几个 */
export const MAX_INFLIGHT_PER_CONNECTION = 64;

const SANDBOX_TOKENS = "allow-scripts allow-forms allow-modals allow-downloads";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function createMyOutsideServer(config: ServerConfig) {
  const now = config.now ?? Date.now;
  const log = config.log ?? ((line: string) => console.log(line));
  const accounts: Accounts = openAccounts(join(config.dataDir, "platform.db"), now);
  const hasher = config.hasher ?? createPasswordHasher();
  const secrets = createAesSecretCodec(loadOrCreateMasterKey(join(config.dataDir, "secrets", "master.key")));
  const kernels: KernelManager = createKernelManager({
    usersDir: join(config.dataDir, "users"),
    secrets,
    registerApps: (kernel) => registerCloudApps(kernel, { root: config.root }),
    idleMs: config.kernelIdleMs,
    now,
  });
  // fail2ban 读这一行封地址（D-0093）：只在「明显是程序」时写
  const limiter: LoginLimiter = createLoginLimiter({
    now,
    onBanRequest: (address, reason) => log(`[auth] ban-request ip=${address} reason="${reason}"`),
  });

  const shellDir = join(config.root, "apps", "host", "renderer");
  const webDir = join(config.root, "apps", "server", "web");
  const appUiDirs = cloudAppUiDirs(config.root);
  const cookieName = config.secureCookies ? "__Host-mo_session" : "mo_session";
  const wsOrigin = config.publicOrigin.replace(/^http/, "ws");

  // ---------------- 工具 ----------------

  function securityHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin",
      "cache-control": "no-store",
      ...extra,
    };
  }

  function send(res: ServerResponse, status: number, type: string, body: string | Buffer, extra: Record<string, string> = {}): void {
    res.writeHead(status, securityHeaders({ "content-type": type, "content-length": String(Buffer.byteLength(body)), ...extra }));
    res.end(body);
  }

  const sendJson = (res: ServerResponse, status: number, value: unknown, extra: Record<string, string> = {}) =>
    send(res, status, "application/json; charset=utf-8", JSON.stringify(value), extra);

  function parseCookies(header: string | undefined): Map<string, string> {
    const cookies = new Map<string, string>();
    if (!header || header.length > 8192) return cookies;
    for (const part of header.split(";")) {
      const index = part.indexOf("=");
      if (index > 0) cookies.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
    }
    return cookies;
  }

  function sessionOf(req: IncomingMessage): { session: Session; token: string } | null {
    const token = parseCookies(req.headers.cookie).get(cookieName);
    if (!token) return null;
    const session = accounts.getSession(token);
    return session ? { session, token } : null;
  }

  function sessionCookie(token: string, expiresAt: number): string {
    const maxAge = Math.max(0, Math.floor((expiresAt - now()) / 1000));
    return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secureCookies ? "; Secure" : ""}`;
  }

  const clearCookie = () => `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${config.secureCookies ? "; Secure" : ""}`;

  /** 请求必须来自自己的页面（防别的网站借用户的浏览器发请求） */
  function requireOwnOrigin(req: IncomingMessage): void {
    if (req.headers.origin !== config.publicOrigin) throw new HttpError(403, "请求来源不对");
  }

  /** 访客地址：在 Caddy 后面时，从本机来的请求按 X-Forwarded-For（Caddy 默认会覆盖掉访客自己填的） */
  function clientAddress(req: IncomingMessage): string {
    const peer = req.socket.remoteAddress ?? "unknown";
    if (config.trustProxy && (peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1")) {
      const forwarded = req.headers["x-forwarded-for"];
      const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
      if (first && /^[0-9a-fA-F.:]{2,45}$/.test(first)) return first;
    }
    return peer;
  }

  async function readJson(req: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
    const declared = Number(req.headers["content-length"] ?? "0");
    if (declared > limit) throw new HttpError(413, "请求太大");
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) throw new HttpError(415, "只接受 JSON");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = chunk as Buffer;
      size += buffer.length;
      if (size > limit) {
        req.destroy();
        throw new HttpError(413, "请求太大");
      }
      chunks.push(buffer);
    }
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
      return value as Record<string, unknown>;
    } catch {
      throw new HttpError(400, "请求格式不对");
    }
  }

  function safeJoin(base: string, rel: string): string | null {
    let decoded: string;
    try {
      decoded = decodeURIComponent(rel);
    } catch {
      return null;
    }
    if (decoded.includes("\0")) return null;
    const root = normalize(resolve(base));
    const file = normalize(resolve(root, decoded || "index.html"));
    return file === root || file.startsWith(root + sep) ? file : null;
  }

  async function serveFile(
    res: ServerResponse,
    file: string | null,
    options: { headers?: Record<string, string>; html?: (text: string) => string } = {},
  ): Promise<void> {
    if (!file) throw new HttpError(404, "Not Found");
    let target = file;
    try {
      const stat = await fs.stat(target);
      if (stat.isDirectory()) target = join(target, "index.html");
      const data = await fs.readFile(target);
      const ext = extname(target).toLowerCase();
      const body = ext === ".html" && options.html ? options.html(data.toString("utf8")) : data;
      send(res, 200, MIME[ext] ?? "application/octet-stream", body, options.headers);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "EISDIR") {
        throw new HttpError(404, "Not Found");
      }
      throw error;
    }
  }

  const sanitizeForLog = (text: string) => text.replace(/[^\w.@-]/g, "?").slice(0, MAX_USERNAME_LENGTH);

  // ---------------- 页面 ----------------

  const SHELL_CSP =
    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; ` +
    `connect-src 'self' ${wsOrigin}; frame-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`;
  const AUTH_CSP = `default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`;

  /** 外壳页面：用 Electron 外壳的同一份 index.html，加上网页版的客户端（登录状态下的 WebSocket、沙箱面板、消息桥） */
  function shellHtml(text: string): string {
    const tags = `<base href="/shell/"><script src="/__myoutside/client.js"></script>`;
    return /<head[^>]*>/i.test(text) ? text.replace(/<head([^>]*)>/i, `<head$1>${tags}`) : tags + text;
  }

  /** 子应用页面：在最前面加上桥脚本，提供 window.outside（经外壳转交调用，D-0090） */
  function appHtml(text: string): string {
    const tag = `<script src="/__myoutside/bridge.js"></script>`;
    return /<head[^>]*>/i.test(text) ? text.replace(/<head([^>]*)>/i, `<head$1>${tag}`) : tag + text;
  }

  let bridgeCache: string | null = null;
  async function bridgeScript(): Promise<string> {
    bridgeCache ??= (await fs.readFile(join(webDir, "bridge.js"), "utf8")).replace("__MYOUTSIDE_PARENT_ORIGIN__", JSON.stringify(config.publicOrigin));
    return bridgeCache;
  }

  // ---------------- 登录 ----------------

  async function handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    requireOwnOrigin(req);
    const body = await readJson(req, AUTH_BODY_LIMIT);
    const username = body.username;
    const password = body.password;
    if (typeof username !== "string" || typeof password !== "string") throw new HttpError(400, "请求格式不对");
    if (username.length > MAX_USERNAME_LENGTH || password.length > MAX_PASSWORD_LENGTH) throw new HttpError(400, "用户名或密码太长");
    const name = normalizeUsername(username) ?? "(invalid)";
    const address = clientAddress(req);
    const check = limiter.check(address, name);
    if (!check.ok) return sendJson(res, 429, { ok: false, error: "输错太多次了，请稍等再试", retryAfterMs: check.retryAfterMs });
    const user = name === "(invalid)" ? null : accounts.findUser(name);
    let valid: boolean;
    try {
      valid = await hasher.verify(password, user?.passwordHash ?? null);
    } catch (error) {
      if (error instanceof HashBusyError) return sendJson(res, 503, { ok: false, error: "服务器忙，请稍后再试" });
      throw error;
    }
    if (!valid || !user) {
      limiter.fail(address, name);
      log(`[auth] failed login ip=${address} user=${sanitizeForLog(name)}`);
      const after = limiter.check(address, name);
      return sendJson(res, 401, { ok: false, error: "用户名或密码不对", retryAfterMs: after.ok ? 0 : after.retryAfterMs });
    }
    limiter.succeed(address, name);
    const session = accounts.createSession(user.id);
    log(`[auth] login ok user=${user.username} ip=${address}`);
    sendJson(res, 200, { ok: true }, { "set-cookie": sessionCookie(session.token, session.expiresAt) });
  }

  async function handleSetup(req: IncomingMessage, res: ServerResponse): Promise<void> {
    requireOwnOrigin(req);
    const body = await readJson(req, AUTH_BODY_LIMIT);
    const token = body.token;
    const password = body.password;
    if (typeof token !== "string" || typeof password !== "string" || token.length > 128) throw new HttpError(400, "请求格式不对");
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      throw new HttpError(400, `密码长度要在 ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} 个字符之间`);
    }
    if (!accounts.peekSetupToken(token)) throw new HttpError(400, "链接无效或已过期，请重新生成");
    let hash: string;
    try {
      hash = await hasher.hash(password);
    } catch (error) {
      if (error instanceof HashBusyError) return sendJson(res, 503, { ok: false, error: "服务器忙，请稍后再试" });
      throw error;
    }
    const userId = accounts.consumeSetupToken(token);
    if (!userId) throw new HttpError(400, "链接无效或已过期，请重新生成");
    accounts.setPassword(userId, hash);
    const session = accounts.createSession(userId);
    log(`[auth] password set user_id=${userId}`);
    sendJson(res, 200, { ok: true }, { "set-cookie": sessionCookie(session.token, session.expiresAt) });
  }

  // ---------------- 路由 ----------------

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://local");
    const path = url.pathname;

    if (req.method === "POST") {
      if (path === "/__myoutside/login") return handleLogin(req, res);
      if (path === "/__myoutside/setup") return handleSetup(req, res);
      if (path === "/__myoutside/logout") {
        requireOwnOrigin(req);
        const current = sessionOf(req);
        if (current) accounts.deleteSession(current.token);
        return sendJson(res, 200, { ok: true }, { "set-cookie": clearCookie() });
      }
      throw new HttpError(404, "Not Found");
    }
    if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "Method Not Allowed");

    if (path === "/" || path === "/index.html") {
      if (!sessionOf(req)) return serveFile(res, join(webDir, "login.html"), { headers: { "content-security-policy": AUTH_CSP } });
      return serveFile(res, join(shellDir, "index.html"), { headers: { "content-security-policy": SHELL_CSP }, html: shellHtml });
    }
    if (path === "/__myoutside/setup") {
      return serveFile(res, join(webDir, "setup.html"), { headers: { "content-security-policy": AUTH_CSP } });
    }
    if (path === "/__myoutside/session") {
      const current = sessionOf(req);
      return current ? sendJson(res, 200, { username: current.session.username }) : sendJson(res, 401, { ok: false });
    }
    if (path === "/__myoutside/bridge.js") {
      // 沙箱里的子应用页面是「无名源」，跨源加载这个脚本
      return send(res, 200, MIME[".js"]!, await bridgeScript(), { "access-control-allow-origin": "*" });
    }
    if (path.startsWith("/__myoutside/static/")) {
      return serveFile(res, safeJoin(webDir, path.slice("/__myoutside/static/".length)));
    }
    if (path === "/__myoutside/client.js") return serveFile(res, join(webDir, "client.js"));
    if (path.startsWith("/shell/")) return serveFile(res, safeJoin(shellDir, path.slice("/shell/".length)));

    if (path.startsWith("/apps/")) {
      const rest = path.slice("/apps/".length);
      const slash = rest.indexOf("/");
      const appId = slash < 0 ? rest : rest.slice(0, slash);
      const base = appUiDirs[appId];
      if (!base) throw new HttpError(404, "App Not Found");
      // 子应用页面一律关进沙箱（D-0090）：直接打开网址也一样；界面文件是公开仓库里的代码，不要求登录——
      // 沙箱里的页面带不上登录 cookie，调用一律经外壳转交
      return serveFile(res, safeJoin(base, slash < 0 ? "" : rest.slice(slash + 1)), {
        headers: { "content-security-policy": `sandbox ${SANDBOX_TOKENS}`, "access-control-allow-origin": "*" },
        html: appHtml,
      });
    }
    throw new HttpError(404, "Not Found");
  }

  const server: Server = createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (error instanceof HttpError) {
        sendJson(res, error.status, { ok: false, error: error.message });
        return;
      }
      log(`[http] error ${req.method} ${req.url?.slice(0, 200)}: ${error instanceof Error ? error.message : String(error)}`);
      sendJson(res, 500, { ok: false, error: "服务器出错" });
    });
  });
  // 慢请求：头 10 秒、整个请求 20 秒内要传完（WebSocket 升级后不受影响）
  server.headersTimeout = 10_000;
  server.requestTimeout = 20_000;
  server.on("clientError", (_error, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    else socket.destroy();
  });

  // ---------------- WebSocket：调用 ----------------

  const wss = new WebSocketServer({ noServer: true, maxPayload: WS_MESSAGE_LIMIT });

  function reject(socket: Duplex, status: number, text: string): void {
    socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = new URL(req.url ?? "/", "http://local").pathname;
    if (path !== "/__myoutside/ws") return reject(socket, 404, "Not Found");
    // 只接受自己的页面连进来，并且要已登录（D-0093）
    if (req.headers.origin !== config.publicOrigin) return reject(socket, 403, "Forbidden");
    const current = sessionOf(req);
    if (!current) return reject(socket, 401, "Unauthorized");
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, current.session, current.token));
  });

  const alive = new WeakMap<WebSocket, boolean>();
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, 30_000);
  heartbeat.unref();

  const isShortString = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;

  function onConnection(ws: WebSocket, session: Session, token: string): void {
    alive.set(ws, true);
    ws.on("pong", () => alive.set(ws, true));
    // 必须接住连接上的错误（例如消息超过 1 MB）：不接的话，一条超大消息就能让整个服务进程崩掉
    ws.on("error", (error) => log(`[ws] connection error user=${session.userId}: ${error.message}`));
    /** 进行中的调用（按「子应用 + 运行 ID」，一个子应用取消不了别的子应用的调用） */
    const runs = new Map<string, AbortController>();
    let inflight = 0;

    const reply = (message: unknown) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    };

    ws.on("message", (data: RawData, isBinary: boolean) => {
      if (isBinary) return ws.close(1003, "binary not supported");
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(data.toString()) as Record<string, unknown>;
        if (typeof message !== "object" || message === null) throw new Error();
      } catch {
        return ws.close(1007, "bad message");
      }
      // 每条消息都重新查会话：过期、退出登录、改了密码以后，已经连着的也立刻失效
      if (!accounts.getSession(token)) return ws.close(4401, "session expired");

      const app = message.app === null || message.app === undefined ? "shell" : message.app;
      if (!isShortString(app, 64)) return ws.close(1007, "bad app");
      const runId = message.runId === undefined ? null : message.runId;
      if (runId !== null && !isShortString(runId, 100)) return ws.close(1007, "bad runId");
      const runKey = runId ? `${app}\u0000${runId}` : null;

      if (message.t === "cancel") {
        if (runKey) runs.get(runKey)?.abort();
        return;
      }
      if (message.t !== "call") return ws.close(1007, "bad type");
      const id = message.id;
      if (!(typeof id === "number" || isShortString(id, 64))) return ws.close(1007, "bad id");
      if (!isShortString(message.call, 200)) return ws.close(1007, "bad call");
      if (inflight >= MAX_INFLIGHT_PER_CONNECTION) {
        return reply({ t: "result", id, response: { ok: false, error: { code: "BUSY", message: "同时进行的调用太多" }, dataVersion: 0 } });
      }

      let held: ReturnType<KernelManager["acquire"]>;
      try {
        held = kernels.acquire(session.userId);
      } catch (error) {
        log(`[ws] kernel open failed user=${session.userId}: ${error instanceof Error ? error.message : String(error)}`);
        return reply({ t: "result", id, response: { ok: false, error: { code: "INTERNAL", message: "打开数据失败" }, dataVersion: 0 } });
      }
      // 调用者只能是外壳或这个用户装了的子应用
      if (app !== "shell" && !held.kernel.listApps().some((item) => item.id === app)) {
        held.release();
        return reply({ t: "result", id, response: { ok: false, error: { code: "FORBIDDEN", message: "未知的子应用" }, dataVersion: 0 } });
      }

      inflight += 1;
      const controller = new AbortController();
      if (runKey) runs.set(runKey, controller);
      const emit = runId ? (event: unknown) => reply({ t: "event", app, runId, event }) : undefined;
      // 断线不取消：调用在服务端照常跑完，结果由子应用自己存（docs/future/web-version.md §3）
      held.kernel
        .handle({ call: message.call as string, payload: message.payload }, { caller: app, emit, signal: controller.signal })
        .then((response) => reply({ t: "result", id, response }))
        .finally(() => {
          inflight -= 1;
          if (runKey && runs.get(runKey) === controller) runs.delete(runKey);
          held.release();
        });
    });
  }

  // ---------------- 定时清理 ----------------

  const sweeper = setInterval(() => {
    accounts.sweep();
    limiter.sweep();
    kernels.sweep();
  }, 5 * 60_000);
  sweeper.unref();

  return {
    server,
    accounts,
    kernels,
    hasher,
    /** 生成设置链接（设密码 / 重设密码） */
    setupLink(username: string): string {
      const user = accounts.findUser(username);
      if (!user) throw new Error(`没有这个用户：${username}`);
      return `${config.publicOrigin}/__myoutside/setup#${accounts.createSetupToken(user.id)}`;
    },
    listen(port: number, host: string): Promise<void> {
      return new Promise((resolvePromise, rejectPromise) => {
        server.once("error", rejectPromise);
        server.listen(port, host, () => {
          server.off("error", rejectPromise);
          resolvePromise();
        });
      });
    },
    async close(): Promise<void> {
      clearInterval(heartbeat);
      clearInterval(sweeper);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
      kernels.closeAll();
      accounts.close();
    },
  };
}

export type MyOutsideServer = ReturnType<typeof createMyOutsideServer>;
