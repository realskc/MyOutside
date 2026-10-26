import { promises as fs } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, normalize, resolve, sep } from "node:path";
import type { Kernel } from "@myoutside/kernel";

const BRIDGE_PATH = "/__myoutside/bridge.js";
const CALL_PATH = "/__myoutside/call";
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * 浏览器版 window.outside。
 * 只做 request / response；没有推送。见 D-0058。
 */
const BRIDGE_JS = `(() => {
  const call = async (name, payload) => {
    const response = await fetch("${CALL_PATH}", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ call: name, payload }),
    });
    const text = await response.text();
    let result = null;
    try {
      result = text ? JSON.parse(text) : null;
    } catch {
      /* 非 JSON 响应按错误处理 */
    }
    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: "BRIDGE_HTTP_" + response.status,
          message:
            (result && result.error && result.error.message) ||
            text ||
            response.statusText,
        },
        dataVersion: 0,
      };
    }
    return result;
  };

  window.outside = {
    call,
    openExternal(url) {
      if (typeof url !== "string" || !(url.startsWith("http://") || url.startsWith("https://"))) {
        return Promise.resolve(false);
      }
      window.open(url, "_blank", "noopener,noreferrer");
      return Promise.resolve(true);
    },
  };
  window.__MYOUTSIDE_WEB__ = true;
})();`;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".wasm": "application/wasm",
};

export interface LanServerOptions {
  kernel: Kernel;
  /** appId -> UI 目录；由宿主按 app:// 的同一份映射提供 */
  uiDirs: Record<string, string>;
  port: number;
  host?: string;
}

export async function startLanServer(options: LanServerOptions): Promise<Server> {
  const { kernel, uiDirs, port, host = "0.0.0.0" } = options;
  const server = createServer((req, res) => {
    void handleRequest(req, res, kernel, uiDirs).catch((error) => {
      console.error("[lan] 请求处理失败：", error);
      if (!res.headersSent) {
        sendJson(res, 500, {
          ok: false,
          error: { code: "INTERNAL", message: String(error) },
          dataVersion: 0,
        });
      } else {
        res.destroy();
      }
    });
  });

  // AI 请求可能持续很久；不要在 Node 的默认超时上断开。
  server.requestTimeout = 0;
  server.timeout = 0;

  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolvePromise();
    });
  });
  server.on("error", (error) => console.error("[lan] 服务错误：", error));

  console.log(`[lan] 本机：http://localhost:${port}/shell/`);
  for (const address of lanAddresses()) {
    console.log(`[lan] 局域网（${address.name}）：http://${address.address}:${port}/shell/`);
  }
  console.log("[lan] 手机与电脑连同一热点后打开上面的地址。开发用预览，无鉴权。");
  return server;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  kernel: Kernel,
  uiDirs: Record<string, string>,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === BRIDGE_PATH) {
    return send(res, 200, "text/javascript; charset=utf-8", BRIDGE_JS);
  }

  if (url.pathname === CALL_PATH) {
    if (req.method !== "POST") {
      return sendJson(res, 405, {
        ok: false,
        error: { code: "METHOD_NOT_ALLOWED", message: "只接受 POST" },
        dataVersion: 0,
      });
    }
    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      return sendJson(res, 400, {
        ok: false,
        error: { code: "BAD_REQUEST", message: String(error) },
        dataVersion: 0,
      });
    }
    if (!isCallBody(body)) {
      return sendJson(res, 400, {
        ok: false,
        error: { code: "BAD_REQUEST", message: "需要 { call: string, payload?: unknown }" },
        dataVersion: 0,
      });
    }
    try {
      const result = await kernel.handle({ call: body.call, payload: body.payload });
      return sendJson(res, 200, result);
    } catch (error) {
      console.error(`[lan] kernel.handle(${body.call}) 失败：`, error);
      return sendJson(res, 500, {
        ok: false,
        error: { code: "INTERNAL", message: String(error) },
        dataVersion: 0,
      });
    }
  }

  if (req.method !== "GET") {
    return sendText(res, 405, "Method Not Allowed");
  }

  if (url.pathname === "/") {
    return redirect(res, "/shell/");
  }

  if (url.pathname === "/shell" || url.pathname === "/shell/") {
    return serveFile(res, resolve(uiDirs.shell, "index.html"));
  }

  if (url.pathname.startsWith("/shell/")) {
    return serveFile(res, safeJoin(uiDirs.shell, url.pathname.slice("/shell/".length)));
  }

  if (url.pathname === "/apps" || url.pathname === "/apps/") {
    return redirect(res, "/shell/");
  }

  if (url.pathname.startsWith("/apps/")) {
    const rest = url.pathname.slice("/apps/".length);
    const slash = rest.indexOf("/");
    if (slash < 0) {
      return redirect(res, `/apps/${rest}/`);
    }
    const appId = safeDecode(rest.slice(0, slash));
    if (!appId) return sendText(res, 400, "Bad Request");
    const base = uiDirs[appId];
    if (!base) return sendText(res, 404, "App Not Found");
    const rel = rest.slice(slash + 1) || "index.html";
    return serveFile(res, safeJoin(base, rel));
  }

  return sendText(res, 404, "Not Found");
}

function isCallBody(value: unknown): value is { call: string; payload?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { call?: unknown }).call === "string"
  );
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("请求体过大");
    chunks.push(buffer);
  }
  if (size === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveFile(res: ServerResponse, file: string | null): Promise<void> {
  if (!file) return sendText(res, 403, "Forbidden");
  let target = file;
  try {
    const stat = await fs.stat(target);
    if (stat.isDirectory()) target = resolve(target, "index.html");
    const data = await fs.readFile(target);
    const ext = extname(target).toLowerCase();
    if (ext === ".html") {
      return send(res, 200, MIME[".html"], injectBridge(data.toString("utf8")));
    }
    return send(res, 200, MIME[ext] ?? "application/octet-stream", data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return sendText(res, 404, "Not Found");
    }
    throw error;
  }
}

function safeJoin(base: string, rel: string): string | null {
  try {
    const decoded = decodeURIComponent(rel);
    const root = normalize(resolve(base));
    const file = normalize(resolve(root, decoded));
    if (file !== root && !file.startsWith(root + sep)) return null;
    return file;
  } catch {
    return null;
  }
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function injectBridge(html: string): string {
  const tag = `<script src="${BRIDGE_PATH}"></script>`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${tag}`);
  }
  return `${tag}${html}`;
}

function lanAddresses(): Array<{ name: string; address: string }> {
  const addresses: Array<{ name: string; address: string }> = [];
  const seen = new Set<string>();
  for (const [name, infos] of Object.entries(networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family !== "IPv4" || info.internal || seen.has(info.address)) continue;
      seen.add(info.address);
      addresses.push({ name, address: info.address });
    }
  }
  return addresses;
}

function send(res: ServerResponse, status: number, contentType: string, body: string | Buffer): void {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, "application/json; charset=utf-8", JSON.stringify(value));
}

function sendText(res: ServerResponse, status: number, text: string): void {
  send(res, status, "text/plain; charset=utf-8", text);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { location, "cache-control": "no-store" });
  res.end();
}
