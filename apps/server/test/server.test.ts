import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import {
  createAesSecretCodec,
  createLoginLimiter,
  createMyOutsideServer,
  createPasswordHasher,
  delayAfter,
  normalizeUsername,
  openAccounts,
  type MyOutsideServer,
} from "../src/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "myoutside-server-test-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// ---------------- 单元 ----------------

describe("组件", () => {
  it("API key 的加密：能解开；改一个字节就解不开（AES-256-GCM）", () => {
    const codec = createAesSecretCodec(Buffer.alloc(32, 7));
    const cipher = codec.encrypt("sk-test-123");
    expect(cipher.startsWith("v1:")).toBe(true);
    expect(cipher).not.toContain("sk-test");
    expect(codec.decrypt(cipher)).toBe("sk-test-123");
    const raw = Buffer.from(cipher.slice(3), "base64");
    raw[raw.length - 1] ^= 1;
    expect(() => codec.decrypt("v1:" + raw.toString("base64"))).toThrow();
    expect(() => createAesSecretCodec(Buffer.alloc(32, 8)).decrypt(cipher)).toThrow();
  });

  it("用户名：统一小写；长度、字符受限", () => {
    expect(normalizeUsername("  Alice ")).toBe("alice");
    expect(normalizeUsername("a".repeat(33))).toBeNull();
    expect(normalizeUsername("x".repeat(2_000_000))).toBeNull();
    expect(normalizeUsername("../etc")).toBeNull();
    expect(normalizeUsername("")).toBeNull();
  });

  it("密码哈希：对的通过、错的不通过；不存在的用户也算一次哈希（不暴露用户名存不存在）", async () => {
    const hasher = createPasswordHasher({ cost: 1024 });
    const stored = await hasher.hash("correct horse");
    expect(stored.startsWith("scrypt$1024$")).toBe(true);
    expect(await hasher.verify("correct horse", stored)).toBe(true);
    expect(await hasher.verify("wrong", stored)).toBe(false);
    expect(await hasher.verify("anything", null)).toBe(false);
  });

  it("限次数（作者：输错 20 次也可能是正常人类）：前 10 次不用等，之后翻倍，最长 1 分钟；成功清零；不锁账号", () => {
    expect([1, 10, 11, 12, 13, 20, 30].map(delayAfter)).toEqual([0, 0, 1000, 2000, 4000, 60_000, 60_000]);
    let clock = 1_000_000;
    const limiter = createLoginLimiter({ now: () => clock });
    for (let i = 0; i < 10; i += 1) limiter.fail("1.2.3.4", "alice");
    expect(limiter.check("1.2.3.4", "alice").ok).toBe(true);
    limiter.fail("1.2.3.4", "alice");
    const check = limiter.check("1.2.3.4", "alice");
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.retryAfterMs).toBe(1000);
    // 别的地址不受影响
    expect(limiter.check("5.6.7.8", "alice").ok).toBe(true);
    // 输错 20 次：最多等 1 分钟，等完照样能试
    for (let i = 0; i < 9; i += 1) limiter.fail("1.2.3.4", "alice");
    const late = limiter.check("1.2.3.4", "alice");
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.retryAfterMs).toBeLessThanOrEqual(60_000);
    clock += 60_000;
    expect(limiter.check("1.2.3.4", "alice").ok).toBe(true);
    limiter.succeed("1.2.3.4", "alice");
    limiter.fail("1.2.3.4", "alice");
    expect(limiter.check("1.2.3.4", "alice").ok).toBe(true);
  });

  it("封地址只针对明显是程序的：10 分钟 100 次，或试了 20 个用户名", () => {
    const bans: string[] = [];
    const limiter = createLoginLimiter({ now: () => 0, onBanRequest: (address, reason) => bans.push(`${address} ${reason}`) });
    for (let i = 0; i < 99; i += 1) limiter.fail("1.1.1.1", "alice");
    expect(bans).toHaveLength(0);
    limiter.fail("1.1.1.1", "alice");
    expect(bans).toEqual(["1.1.1.1 100 failures in 10 minutes"]);
    for (let i = 0; i < 19; i += 1) limiter.fail("2.2.2.2", `user${i}`);
    expect(bans).toHaveLength(1);
    limiter.fail("2.2.2.2", "user19");
    expect(bans[1]).toBe("2.2.2.2 20 usernames in 10 minutes");
  });

  it("设置链接：用一次就作废；过期作废；同一用户新建链接后旧的作废", () => {
    let clock = 0;
    const accounts = openAccounts(":memory:", () => clock);
    const user = accounts.createUser("Alice");
    expect(user.username).toBe("alice");
    const first = accounts.createSetupToken(user.id);
    const second = accounts.createSetupToken(user.id);
    expect(accounts.consumeSetupToken(first)).toBeNull();
    expect(accounts.consumeSetupToken(second)).toBe(user.id);
    expect(accounts.consumeSetupToken(second)).toBeNull();
    const third = accounts.createSetupToken(user.id);
    clock += 25 * 3600 * 1000;
    expect(accounts.consumeSetupToken(third)).toBeNull();
    expect(() => accounts.createUser("alice")).toThrow();
    accounts.close();
  });
});

// ---------------- 整个服务 ----------------

interface Running {
  app: MyOutsideServer;
  base: string;
  origin: string;
  dataDir: string;
  logs: string[];
  clock: { now: number };
}

async function start(): Promise<Running> {
  const dataDir = tempDir();
  const logs: string[] = [];
  const clock = { now: Date.now() };
  const placeholder = "http://placeholder";
  // 端口要先拿到才能填 publicOrigin：先在 0 号端口起一次拿端口，再按真实地址建
  const probe = createMyOutsideServer({
    root: ROOT,
    dataDir: tempDir(),
    publicOrigin: placeholder,
    secureCookies: false,
    trustProxy: false,
  });
  await probe.listen(0, "127.0.0.1");
  const port = (probe.server.address() as { port: number }).port;
  await probe.close();
  const origin = `http://127.0.0.1:${port}`;
  const app = createMyOutsideServer({
    root: ROOT,
    dataDir,
    publicOrigin: origin,
    secureCookies: false,
    trustProxy: false,
    now: () => clock.now,
    hasher: createPasswordHasher({ cost: 1024 }),
    log: (line) => logs.push(line),
  });
  await app.listen(port, "127.0.0.1");
  cleanups.push(() => app.close());
  return { app, base: origin, origin, dataDir, logs, clock };
}

async function post(run: Running, path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(run.base + path, {
    method: "POST",
    headers: { "content-type": "application/json", origin: run.origin, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0]!;

/** 建账号、用设置链接设密码，返回登录 cookie */
async function signUp(run: Running, username: string, password = "correct horse battery"): Promise<string> {
  run.app.accounts.createUser(username);
  const token = run.app.setupLink(username).split("#")[1]!;
  const response = await post(run, "/__myoutside/setup", { token, password });
  expect(response.status).toBe(200);
  return cookieOf(response);
}

function connectWs(run: Running, headers: Record<string, string>): Promise<WebSocket> {
  return new Promise((resolvePromise, reject) => {
    const ws = new WebSocket(run.base.replace("http", "ws") + "/__myoutside/ws", { headers });
    ws.once("open", () => resolvePromise(ws));
    ws.once("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    ws.once("error", reject);
    cleanups.push(() => ws.terminate());
  });
}

function rpc(ws: WebSocket) {
  let next = 1;
  const pending = new Map<number, (value: { ok: boolean; result?: unknown; error?: { code: string } }) => void>();
  const events: unknown[] = [];
  ws.on("message", (data) => {
    const message = JSON.parse(data.toString()) as { t: string; id: number; response: never; event: unknown };
    if (message.t === "result") pending.get(message.id)?.(message.response);
    if (message.t === "event") events.push(message);
  });
  return {
    events,
    call(call: string, payload: unknown = {}, app: string | null = null, runId?: string) {
      const id = next++;
      return new Promise<{ ok: boolean; result?: unknown; error?: { code: string; message?: string } }>((resolvePromise) => {
        pending.set(id, resolvePromise);
        ws.send(JSON.stringify({ t: "call", id, app, call, payload, runId }));
      });
    },
  };
}

const closed = (ws: WebSocket) => new Promise<number>((resolvePromise) => ws.once("close", (code) => resolvePromise(code)));

describe("服务", () => {
  it("没登录：首页是登录页；外壳和数据都拿不到", async () => {
    const run = await start();
    const home = await fetch(run.base + "/");
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("login.js");
    expect(home.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect((await fetch(run.base + "/__myoutside/session")).status).toBe(401);
    await expect(connectWs(run, { origin: run.origin })).rejects.toThrow("HTTP 401");
  });

  it("设置链接设密码后登录；同一个链接不能再用", async () => {
    const run = await start();
    run.app.accounts.createUser("alice");
    const token = run.app.setupLink("alice").split("#")[1]!;
    expect((await post(run, "/__myoutside/setup", { token, password: "short" })).status).toBe(400);
    const done = await post(run, "/__myoutside/setup", { token, password: "correct horse battery" });
    expect(done.status).toBe(200);
    expect(done.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Strict/);
    expect((await post(run, "/__myoutside/setup", { token, password: "another password" })).status).toBe(400);

    const wrong = await post(run, "/__myoutside/login", { username: "alice", password: "nope" });
    expect(wrong.status).toBe(401);
    expect(run.logs.some((line) => line.startsWith("[auth] failed login ip=127.0.0.1 user=alice"))).toBe(true);
    const ok = await post(run, "/__myoutside/login", { username: "ALICE", password: "correct horse battery" });
    expect(ok.status).toBe(200);
    const shell = await fetch(run.base + "/", { headers: { cookie: cookieOf(ok) } });
    const html = await shell.text();
    expect(html).toContain('<base href="/shell/"><script src="/__myoutside/client.js"></script>');
    expect(shell.headers.get("content-security-policy")).toContain("frame-src 'self'");
  });

  it("防黑客：两百万位长的用户名在读完之前就被拒绝；没有 Origin、别的网站的 Origin 都被拒绝", async () => {
    const run = await start();
    const huge = await post(run, "/__myoutside/login", { username: "x".repeat(2_000_000), password: "p" }).catch((error: Error) => error);
    // 服务端读到 4 KB 就拒绝并断开：要么拿到 413，要么连接被断开
    if (huge instanceof Response) expect(huge.status).toBe(413);
    else expect(huge).toBeInstanceOf(Error);
    const long = await post(run, "/__myoutside/login", { username: "x".repeat(100), password: "p" });
    expect(long.status).toBe(400);
    expect((await post(run, "/__myoutside/login", { username: "a", password: "b" }, { origin: "https://evil.example" })).status).toBe(403);
    const noOrigin = await fetch(run.base + "/__myoutside/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "a", password: "b" }),
    });
    expect(noOrigin.status).toBe(403);
    expect((await post(run, "/__myoutside/login", "not json")).status).toBe(400);
    expect(run.logs.filter((line) => line.startsWith("[auth] failed login"))).toHaveLength(0);
  });

  it("限次数：同一地址同一账号输错 11 次后要等；等完照样能登录", async () => {
    const run = await start();
    await signUp(run, "alice");
    for (let i = 0; i < 10; i += 1) expect((await post(run, "/__myoutside/login", { username: "alice", password: "bad" })).status).toBe(401);
    const eleventh = await post(run, "/__myoutside/login", { username: "alice", password: "bad" });
    expect(eleventh.status).toBe(401);
    expect(((await eleventh.json()) as { retryAfterMs: number }).retryAfterMs).toBe(1000);
    const blocked = await post(run, "/__myoutside/login", { username: "alice", password: "correct horse battery" });
    expect(blocked.status).toBe(429);
    run.clock.now += 1000;
    expect((await post(run, "/__myoutside/login", { username: "alice", password: "correct horse battery" })).status).toBe(200);
  });

  it("子应用页面：关进沙箱、注入桥脚本；路径穿越、不在服务器上的子应用都拿不到", async () => {
    const run = await start();
    const page = await fetch(run.base + "/apps/vocab/index.html");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toBe("sandbox allow-scripts allow-forms allow-modals allow-downloads");
    expect(await page.text()).toContain('<script src="/__myoutside/bridge.js"></script>');
    const bridge = await (await fetch(run.base + "/__myoutside/bridge.js")).text();
    expect(bridge).toContain(`const PARENT = "${run.origin}"`);
    expect((await fetch(run.base + "/apps/vocab/..%2F..%2F..%2Fpackage.json")).status).toBe(404);
    expect((await fetch(run.base + "/apps/66CCFF/index.html")).status).toBe(404);
    expect((await fetch(run.base + "/apps/netease/index.html")).status).toBe(404);
    expect((await fetch(run.base + "/shell/..%2F..%2F..%2Fpackage.json")).status).toBe(404);
  });

  it("WebSocket：要登录、要是自己的页面；调用者只能是外壳或装了的子应用，内核照常检查权限", async () => {
    const run = await start();
    const cookie = await signUp(run, "alice");
    await expect(connectWs(run, { cookie, origin: "https://evil.example" })).rejects.toThrow("HTTP 403");
    const ws = await connectWs(run, { cookie, origin: run.origin });
    const client = rpc(ws);

    const apps = await client.call("platform.listApps");
    expect(apps.ok).toBe(true);
    expect((apps.result as Array<{ id: string }>).map((app) => app.id).sort()).toEqual(["dialog", "go", "vocab", "zheye"]);

    // 子应用冒充不了外壳：只有外壳能改平台设置
    const asApp = await client.call("platform.settings.set", { key: "ui.language", value: "en" }, "vocab");
    expect(asApp.error?.code).toBe("FORBIDDEN");
    // 别的子应用的内部 API 调不了
    const internal = await client.call("vocab.previewReview", { cardId: "x" }, "go");
    expect(internal.error?.code).toBe("FORBIDDEN");
    const unknown = await client.call("platform.listApps", {}, "66CCFF");
    expect(unknown.error?.code).toBe("FORBIDDEN");
  });

  it("每个用户一个库：一个用户的设置、API key 别人看不到；API key 在库里是密文", async () => {
    const run = await start();
    const alice = rpc(await connectWs(run, { cookie: await signUp(run, "alice"), origin: run.origin }));
    const bob = rpc(await connectWs(run, { cookie: await signUp(run, "bob"), origin: run.origin }));
    expect((await alice.call("platform.settings.set", { key: "ui.language", value: "en" })).ok).toBe(true);
    expect((await alice.call("platform.settings.set", { key: "ai.deepseek.apiKey", value: "sk-alice-secret" })).ok).toBe(true);
    expect((await alice.call("platform.settings.get", { key: "ai.deepseek.apiKey" })).result).toEqual({ value: null, isSet: true });
    expect((await bob.call("platform.settings.get", { key: "ui.language" })).result).toEqual({ value: null, isSet: false });
    expect((await bob.call("platform.settings.get", { key: "ai.deepseek.apiKey" })).result).toEqual({ value: null, isSet: false });

    const aliceId = run.app.accounts.findUser("alice")!.id;
    const db = new DatabaseSync(join(run.dataDir, "users", aliceId, "myoutside.db"), { readOnly: true });
    const stored = (db.prepare("SELECT value FROM platform_setting WHERE key = ?").get("ai.deepseek.apiKey") as { value: string }).value;
    db.close();
    expect(stored).not.toContain("sk-alice");
    expect(stored).toContain("v1:");
  });

  it("WebSocket：超过 1 MB 的消息断开；退出登录后已连着的也立刻失效", async () => {
    const run = await start();
    const cookie = await signUp(run, "alice");
    const big = await connectWs(run, { cookie, origin: run.origin });
    const bigClosed = closed(big);
    big.send(JSON.stringify({ t: "call", id: 1, call: "platform.listApps", payload: "x".repeat(1024 * 1024 + 10) }));
    expect(await bigClosed).toBe(1009);

    const ws = await connectWs(run, { cookie, origin: run.origin });
    const client = rpc(ws);
    expect((await client.call("platform.dataVersion")).ok).toBe(true);
    expect((await post(run, "/__myoutside/logout", {}, { cookie })).status).toBe(200);
    const after = closed(ws);
    ws.send(JSON.stringify({ t: "call", id: 99, call: "platform.dataVersion" }));
    expect(await after).toBe(4401);
  });
});
