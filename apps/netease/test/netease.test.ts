import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKernel, type Kernel } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";
import { afterEach, describe, expect, it } from "vitest";
import { baseName, createNeteaseApp, parseBinaryCookies, readMusicU } from "../backend/src/index.js";

const TOKEN = "SECRET_TOKEN_abc123";
const cleanup: string[] = [];

afterEach(() => {
  for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "netease-test-"));
  cleanup.push(dir);
  return dir;
}

/** 按 Apple binarycookies 的格式写一个文件（一页）：每条记录 56 字节头 + 以 NUL 结尾的字符串 */
function binaryCookies(cookies: Array<{ domain: string; name: string; path: string; value: string }>): Buffer {
  const records = cookies.map((cookie) => {
    const strings = [cookie.domain, cookie.name, cookie.path, cookie.value].map((text) => Buffer.from(`${text}\0`, "utf8"));
    const header = Buffer.alloc(56);
    let at = 56;
    const offsets: number[] = [];
    for (const item of strings) {
      offsets.push(at);
      at += item.length;
    }
    header.writeUInt32LE(at, 0);
    header.writeUInt32LE(1, 4);
    offsets.forEach((offset, i) => header.writeUInt32LE(offset, 16 + i * 4));
    return Buffer.concat([header, ...strings]);
  });
  const headerSize = 8 + records.length * 4 + 4;
  const pageHeader = Buffer.alloc(headerSize);
  pageHeader.writeUInt32BE(0x00000100, 0);
  pageHeader.writeUInt32LE(records.length, 4);
  let offset = headerSize;
  records.forEach((record, i) => {
    pageHeader.writeUInt32LE(offset, 8 + i * 4);
    offset += record.length;
  });
  const page = Buffer.concat([pageHeader, ...records]);
  const head = Buffer.alloc(12);
  head.write("cook", 0, "latin1");
  head.writeUInt32BE(1, 4);
  head.writeUInt32BE(page.length, 8);
  return Buffer.concat([head, page, Buffer.alloc(8)]);
}

function writeCookieFile(dir: string, value = TOKEN): string {
  const file = join(dir, "com.netease.163music.binarycookies");
  writeFileSync(
    file,
    binaryCookies([
      { domain: ".music.163.com", name: "NMTID", path: "/", value: "nm" },
      { domain: ".music.163.com", name: "MUSIC_U", path: "/", value },
      { domain: ".163.com", name: "MUSIC_U", path: "/", value: "other-domain" },
    ]),
  );
  return file;
}

interface FakeCall {
  url: string;
  method: string;
  headers: Headers;
  body: string;
  at: number;
}

/** 假的网易云：一首歌《测试 歌/曲》，账号最高能下无损；音频是固定的一段字节 */
function fakeNetease(options: { audio?: Buffer; md5?: string; apiCode?: number; maxLevel?: string; lyricFailures?: number } = {}) {
  let lyricFailures = options.lyricFailures ?? 0;
  const audio = options.audio ?? Buffer.from("fLaC fake audio bytes ".repeat(5000));
  const md5 = options.md5 ?? createHash("md5").update(audio).digest("hex");
  const calls: FakeCall[] = [];
  const songs: Record<string, Record<string, unknown>> = {
    "123": { id: 123, name: "测试 歌/曲", ar: [{ name: "洛天依Official" }, { name: "乐正绫" }], al: { name: "专辑" }, dt: 200000, fee: 8 },
    "456": { id: 456, name: "第二首", ar: [{ name: "乐正绫" }], al: { name: "专辑" }, dt: 100000, fee: 0 },
    "789": { id: 789, name: "第三首", ar: [{ name: "洛天依Official" }], al: { name: "专辑" }, dt: 100000, fee: 0 },
  };
  const song = songs["123"]!;
  const privilege = { st: 0, dl: 999000, dlLevel: options.maxLevel ?? "lossless" };
  const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", headers: new Headers(init?.headers), body: String(init?.body ?? ""), at: Date.now() });
    if (url.startsWith("https://interface.music.163.com/")) {
      if (options.apiCode) return json({ code: options.apiCode, message: `need login ${TOKEN}` });
      const path = new URL(url).pathname;
      if (path === "/api/cloudsearch/pc") return json({ code: 200, result: { songCount: 1, songs: [{ ...song, privilege }] } });
      if (path === "/api/v3/song/detail") {
        const id = (JSON.parse(new URLSearchParams(String(init?.body)).get("c") ?? "[]") as Array<{ id: string }>)[0]?.id ?? "";
        return json({ code: 200, songs: [songs[id] ?? song], privileges: [privilege] });
      }
      if (path === "/api/song/enhance/download/url/v1") {
        const params = new URLSearchParams(String(init?.body));
        return json({
          code: 200,
          data: {
            code: 200,
            url: `http://m701.music.126.net/a/${params.get("id")}.flac?sign=${TOKEN.length}`,
            size: audio.length,
            md5,
            type: "flac",
            level: params.get("level"),
            br: 931763,
          },
        });
      }
      if (path === "/api/song/lyric") {
        if (lyricFailures > 0) {
          lyricFailures -= 1;
          throw new TypeError("fetch failed");
        }
        return json({ code: 200, lrc: { lyric: "[00:00.000] 作词 : 某人\n[00:01.000]第一句\n" } });
      }
      return new Response("not found", { status: 404 });
    }
    if (url.startsWith("https://m701.music.126.net/")) {
      return new Response(audio, { status: 200, headers: { "content-type": "audio/flac" } });
    }
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
  return { impl, calls, audio };
}

function setup(
  options: {
    cookie?: boolean;
    fake?: ReturnType<typeof fakeNetease>;
    /** 默认 0：其他测试不用等；专门测间隔时传 */
    gapMs?: { min: number; max: number };
    dailyLimit?: number;
    now?: () => number;
    /** 数据库文件（模拟重启 MyOutside）；默认内存 */
    dbPath?: string;
    dir?: string;
  } = {},
): {
  kernel: Kernel;
  downloads: string;
  fake: ReturnType<typeof fakeNetease>;
  dir: string;
} {
  const dir = options.dir ?? tempDir();
  const downloads = join(dir, "网易云音乐");
  const fake = options.fake ?? fakeNetease();
  const cookiePaths = options.cookie === false ? [join(dir, "missing.binarycookies")] : [writeCookieFile(dir)];
  const kernel = createKernel({ storage: createNodeSqliteAdapter({ path: options.dbPath ?? ":memory:" }) });
  kernel.registerApp(
    createNeteaseApp({
      cookiePaths,
      defaultDownloadDir: downloads,
      fetch: fake.impl,
      downloadGapMs: options.gapMs ?? { min: 0, max: 0 },
      dailyLimit: options.dailyLimit,
      now: options.now,
      random: () => 0.5,
    }),
  );
  kernel.start();
  return { kernel, downloads, fake, dir };
}

async function raw(kernel: Kernel, call: string, payload: unknown = {}, emit?: (event: unknown) => void, signal?: AbortSignal) {
  return kernel.handle({ call, payload }, { caller: "netease", emit, signal });
}

async function call<T>(kernel: Kernel, name: string, payload: unknown = {}, emit?: (event: unknown) => void): Promise<T> {
  const res = await raw(kernel, name, payload, emit);
  if (!res.ok) throw new Error(`${name}: ${res.error.code} ${res.error.message}`);
  return res.result as T;
}

describe("netease", () => {
  it("从 binarycookies 里读出唯一的 MUSIC_U（只认 music.163.com 域）", () => {
    const dir = tempDir();
    const file = writeCookieFile(dir);
    const cookies = parseBinaryCookies(readFileSync(file));
    expect(cookies.map((cookie) => cookie.name)).toEqual(["NMTID", "MUSIC_U", "MUSIC_U"]);
    expect(readMusicU([join(dir, "nope"), file])).toEqual({ ok: true, token: TOKEN });
    expect(readMusicU([join(dir, "nope")])).toEqual({ ok: false, reason: "missing" });
    writeFileSync(join(dir, "bad"), "not cookies");
    expect(readMusicU([join(dir, "bad")])).toEqual({ ok: false, reason: "unreadable" });
    const twice = join(dir, "twice");
    writeFileSync(
      twice,
      binaryCookies([
        { domain: ".music.163.com", name: "MUSIC_U", path: "/", value: "a" },
        { domain: "music.163.com", name: "MUSIC_U", path: "/", value: "b" },
      ]),
    );
    expect(readMusicU([twice])).toEqual({ ok: false, reason: "not-logged-in" });
  });

  it("文件名和官方客户端一样：歌手用逗号连接，空格换成不换行空格，/ 等换成全角", () => {
    expect(baseName(["洛天依Official", "Soda纯白"], "中华缘木娘 (Album Version)")).toBe("洛天依Official,Soda纯白 - 中华缘木娘\u00a0(Album\u00a0Version)");
    expect(baseName(["乐正绫", "星辉p"], "久徊/绫")).toBe("乐正绫,星辉p - 久徊／绫");
    expect(baseName([], "a:b?")).toBe("a：b？");
  });

  it("没登录时状态如实显示，搜索被拒绝；默认下载文件夹可以改、可以恢复", async () => {
    const { kernel, downloads } = setup({ cookie: false });
    const status = await call<{ loggedIn: boolean; message: string; downloadDir: string; downloadDirIsDefault: boolean }>(kernel, "netease.getStatus");
    expect(status.loggedIn).toBe(false);
    expect(status.message).toMatch(/没找到/);
    expect(status.downloadDir).toBe(downloads);
    expect(status.downloadDirIsDefault).toBe(true);
    const search = await raw(kernel, "netease.search", { query: "白石溪" });
    expect(search.ok).toBe(false);
    if (!search.ok) expect(search.error.code).toBe("PRECONDITION");

    await call(kernel, "netease.setDownloadDir", { dir: "/tmp/elsewhere" });
    expect((await call<{ downloadDir: string; downloadDirIsDefault: boolean }>(kernel, "netease.getStatus")).downloadDir).toBe("/tmp/elsewhere");
    const relative = await raw(kernel, "netease.setDownloadDir", { dir: "relative/dir" });
    expect(relative.ok).toBe(false);
    await call(kernel, "netease.setDownloadDir", { dir: null });
    expect((await call<{ downloadDirIsDefault: boolean }>(kernel, "netease.getStatus")).downloadDirIsDefault).toBe(true);
  });

  it("搜索：请求带着登录状态和 os=osx；结果里有这个账号能下的最高档位", async () => {
    const { kernel, fake } = setup();
    const result = await call<{ total: number; songs: Array<Record<string, unknown>> }>(kernel, "netease.search", { query: "测试" });
    expect(result.total).toBe(1);
    expect(result.songs[0]).toMatchObject({ id: "123", name: "测试 歌/曲", artists: ["洛天依Official", "乐正绫"], fee: 8, maxLevel: "lossless" });
    const request = fake.calls[0]!;
    expect(request.method).toBe("POST");
    expect(request.headers.get("cookie")).toBe(`MUSIC_U=${TOKEN}; os=osx`);
    expect(new URLSearchParams(request.body).get("s")).toBe("测试");
  });

  it("网易云拒绝时，报错里不带登录凭据", async () => {
    const { kernel } = setup({ fake: fakeNetease({ apiCode: 301 }) });
    const res = await raw(kernel, "netease.search", { query: "测试" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("UPSTREAM");
      expect(JSON.stringify(res.error)).not.toContain(TOKEN);
    }
  });

  it("下载：默认最高档位，照官方命名存进下载文件夹，旁边存歌词，记一条下载记录；CDN 请求不带登录状态", async () => {
    const { kernel, downloads, fake } = setup();
    const events: Array<{ progress: number }> = [];
    const result = await call<Record<string, unknown>>(kernel, "netease.download", { songId: "123" }, (event) => events.push(event as { progress: number }));
    const file = join(downloads, "洛天依Official,乐正绫 - 测试\u00a0歌／曲.flac");
    expect(result).toMatchObject({ songId: "123", level: "lossless", bitrate: 931763, file, alreadyExisted: false });
    expect(readFileSync(file).equals(fake.audio)).toBe(true);
    expect(readFileSync(join(downloads, "洛天依Official,乐正绫 - 测试\u00a0歌／曲.lrc"), "utf8")).toContain("第一句");
    expect(readdirSync(downloads).some((name) => name.endsWith(".part"))).toBe(false);
    expect(events.at(-1)?.progress).toBe(1);

    const urlRequest = fake.calls.find((item) => item.url.endsWith("/api/song/enhance/download/url/v1"))!;
    expect(new URLSearchParams(urlRequest.body).get("level")).toBe("lossless");
    const cdn = fake.calls.find((item) => item.url.startsWith("https://m701.music.126.net/"))!;
    expect(cdn.url.startsWith("https://")).toBe(true);
    expect(cdn.headers.get("cookie")).toBeNull();

    const history = await call<Array<Record<string, unknown>>>(kernel, "netease.listHistory");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ songId: "123", artists: ["洛天依Official", "乐正绫"], file });
  });

  it("歌词请求偶尔失败：重试一次；还失败就不存歌词、照样下完，进度里说明，再下一次会补上", async () => {
    const once = setup({ fake: fakeNetease({ lyricFailures: 1 }) });
    const first = await call<{ lyricFile: string | null }>(once.kernel, "netease.download", { songId: "123" });
    expect(first.lyricFile).not.toBeNull();

    const twice = setup({ fake: fakeNetease({ lyricFailures: 2 }) });
    const events: Array<{ message?: string }> = [];
    const missed = await call<{ lyricFile: string | null; alreadyExisted: boolean }>(twice.kernel, "netease.download", { songId: "123" }, (event) =>
      events.push(event as { message?: string }),
    );
    expect(missed.lyricFile).toBeNull();
    expect(missed.alreadyExisted).toBe(false);
    expect(events.at(-1)?.message).toMatch(/歌词没拿到/);
    const retried = await call<{ lyricFile: string | null; alreadyExisted: boolean }>(twice.kernel, "netease.download", { songId: "123" });
    expect(retried.alreadyExisted).toBe(true);
    expect(retried.lyricFile).not.toBeNull();
  });

  it("文件夹里已有同名文件（例如官方客户端下过）就不重复下载、不覆盖", async () => {
    const { kernel, downloads, fake } = setup();
    mkdirSync(downloads, { recursive: true });
    const file = join(downloads, "洛天依Official,乐正绫 - 测试\u00a0歌／曲.flac");
    writeFileSync(file, "official client file");
    const result = await call<{ alreadyExisted: boolean }>(kernel, "netease.download", { songId: "123" });
    expect(result.alreadyExisted).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("official client file");
    expect(fake.calls.some((item) => item.url.startsWith("https://m701.music.126.net/"))).toBe(false);
    // 没真正下载：不记下载记录，不占每天的额度（NETEASE-0002）
    expect(await call<unknown[]>(kernel, "netease.listHistory")).toHaveLength(0);
    expect((await call<{ downloadsToday: number }>(kernel, "netease.getStatus")).downloadsToday).toBe(0);
  });

  it("要的档位超过账号权限时拒绝；MD5 不对时不留下文件", async () => {
    const limited = setup({ fake: fakeNetease({ maxLevel: "exhigh" }) });
    const tooHigh = await raw(limited.kernel, "netease.download", { songId: "123", level: "lossless" });
    expect(tooHigh.ok).toBe(false);
    if (!tooHigh.ok) expect(tooHigh.error.code).toBe("PRECONDITION");

    const broken = setup({ fake: fakeNetease({ md5: "0".repeat(32) }) });
    const res = await raw(broken.kernel, "netease.download", { songId: "123" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/MD5/);
    expect(existsSync(broken.downloads) ? readdirSync(broken.downloads).filter((name) => !name.endsWith(".lrc")) : []).toEqual([]);
  });

  it("公开 API listDownloadedFiles：列出下载文件夹里的音频和同名歌词（给纯蓝读）", async () => {
    const { kernel, downloads } = setup();
    await call(kernel, "netease.download", { songId: "123" });
    writeFileSync(join(downloads, "notes.txt"), "not audio");
    const listing = await call<{ dir: string; files: Array<{ name: string; lyricPath: string | null }> }>(kernel, "netease.listDownloadedFiles");
    expect(listing.dir).toBe(downloads);
    expect(listing.files).toHaveLength(1);
    expect(listing.files[0]!.name).toBe("洛天依Official,乐正绫 - 测试\u00a0歌／曲.flac");
    expect(listing.files[0]!.lyricPath).toBe(join(downloads, "洛天依Official,乐正绫 - 测试\u00a0歌／曲.lrc"));
    const fns = kernel.listFunctions();
    expect(fns).toContain("netease.listDownloadedFiles");
  });

  it("硬性限制：一次只下一首，上一首结束后才开始等间隔；排队和等待都在进度里说明（NETEASE-0002）", async () => {
    const { kernel, fake } = setup({ gapMs: { min: 150, max: 250 } });
    const events: Record<string, Array<{ message?: string; waitUntil?: number }>> = { "123": [], "456": [] };
    const started = Date.now();
    const [first, second] = await Promise.all(
      ["123", "456"].map((songId) =>
        call<{ songId: string }>(kernel, "netease.download", { songId }, (event) => events[songId]!.push(event as { message?: string })),
      ),
    );
    expect([first.songId, second.songId]).toEqual(["123", "456"]);
    const cdn = (id: string) => fake.calls.find((item) => item.url.includes(`/a/${id}.flac`))!;
    const detailOf = (id: string) => fake.calls.find((item) => item.url.endsWith("/api/v3/song/detail") && item.body.includes(id))!;
    // 第二首在第一首的音频下完之后，至少再等 200 毫秒（random 固定 0.5：150 + 0.5 × 100）才开始查询
    expect(detailOf("456").at - cdn("123").at).toBeGreaterThanOrEqual(195);
    expect(events["456"]!.some((event) => event.message?.startsWith("排队中：前面还有 1 首"))).toBe(true);
    expect(events["456"]!.some((event) => typeof event.waitUntil === "number")).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(195);
    const status = await call<{ queued: number; nextDownloadAt: number | null; downloadsToday: number }>(kernel, "netease.getStatus");
    expect(status.queued).toBe(0);
    expect(status.downloadsToday).toBe(2);
    expect(status.nextDownloadAt).not.toBeNull();
  });

  it("同一首歌同时下两次：排队，后一次轮到时按「文件夹里已有」处理，只下一次", async () => {
    const { kernel, fake } = setup();
    const [first, second] = await Promise.all([
      call<{ alreadyExisted: boolean }>(kernel, "netease.download", { songId: "123" }),
      call<{ alreadyExisted: boolean }>(kernel, "netease.download", { songId: "123" }),
    ]);
    expect([first.alreadyExisted, second.alreadyExisted]).toEqual([false, true]);
    expect(fake.calls.filter((item) => item.url.includes("/a/123.flac"))).toHaveLength(1);
    expect((await call<{ downloadsToday: number }>(kernel, "netease.getStatus")).downloadsToday).toBe(1);
  });

  it("重启 MyOutside 后也按最近一条下载记录等间隔；等待时取消马上返回，不发请求", async () => {
    const dir = tempDir();
    const dbPath = join(dir, "myoutside.db");
    const first = setup({ dir, dbPath, gapMs: { min: 400, max: 400 } });
    await call(first.kernel, "netease.download", { songId: "123" });

    const second = setup({ dir, dbPath, gapMs: { min: 400, max: 400 } });
    const before = Date.now();
    await call(second.kernel, "netease.download", { songId: "456" });
    expect(Date.now() - before).toBeGreaterThanOrEqual(250);

    const controller = new AbortController();
    const pending = raw(second.kernel, "netease.download", { songId: "789" }, undefined, controller.signal);
    setTimeout(() => controller.abort(), 30);
    const cancelled = await pending;
    expect(cancelled.ok).toBe(false);
    if (!cancelled.ok) expect(cancelled.error.code).toBe("ABORTED");
    expect(second.fake.calls.some((item) => item.body.includes("789"))).toBe(false);
  });

  it("硬性限制：每天最多真正下载几首（作者：50）；第二天又能下", async () => {
    let clock = new Date(2026, 10, 11, 9, 0, 0).getTime();
    const { kernel } = setup({ dailyLimit: 2, now: () => clock });
    await call(kernel, "netease.download", { songId: "123" });
    await call(kernel, "netease.download", { songId: "456" });
    const over = await raw(kernel, "netease.download", { songId: "789" });
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.error.code).toBe("PRECONDITION");
      expect(over.error.message).toMatch(/今天已经下载了 2 首/);
    }
    expect((await call<{ downloadsToday: number; dailyLimit: number }>(kernel, "netease.getStatus")).dailyLimit).toBe(2);
    clock = new Date(2026, 10, 12, 0, 0, 1).getTime();
    expect((await call<{ downloadsToday: number }>(kernel, "netease.getStatus")).downloadsToday).toBe(0);
    expect((await raw(kernel, "netease.download", { songId: "789" })).ok).toBe(true);
  });

  it("别的子应用：声明后可以下载、读下载文件夹，和本应用共用排队与额度；搜索是内部 API，调不了（D-0086）", async () => {
    const dir = tempDir();
    const fake = fakeNetease();
    const kernel = createKernel({ storage: createNodeSqliteAdapter({ path: ":memory:" }) });
    kernel.registerApp(
      createNeteaseApp({
        cookiePaths: [writeCookieFile(dir)],
        defaultDownloadDir: join(dir, "dl"),
        fetch: fake.impl,
        downloadGapMs: { min: 0, max: 0 },
        dailyLimit: 1,
      }),
    );
    kernel.registerApp(
      { id: "reader", name: "reader", api: {} },
      {
        id: "reader",
        name: "reader",
        protocolVersion: 1,
        uses: ["netease.listDownloadedFiles", "netease.search", "netease.download"],
      },
    );
    kernel.registerApp({ id: "stranger", name: "stranger", api: {} }, { id: "stranger", name: "stranger", protocolVersion: 1 });
    kernel.start();
    const as = (caller: string, name: string, payload: unknown) => kernel.handle({ call: name, payload }, { caller });

    const search = await as("reader", "netease.search", { query: "x" });
    expect(search.ok).toBe(false);
    if (!search.ok) expect(search.error.code).toBe("FORBIDDEN");
    const undeclared = await as("stranger", "netease.download", { songId: "123" });
    expect(undeclared.ok).toBe(false);
    if (!undeclared.ok) expect(undeclared.error.code).toBe("FORBIDDEN");
    expect(fake.calls).toHaveLength(0);

    const events: unknown[] = [];
    const downloaded = await kernel.handle(
      { call: "netease.download", payload: { songId: "123" } },
      { caller: "reader", emit: (event) => events.push(event) },
    );
    expect(downloaded.ok).toBe(true);
    expect(events.some((event) => (event as { message?: string }).message === "下载完成")).toBe(true);
    const files = await as("reader", "netease.listDownloadedFiles", {});
    expect(files.ok && (files.result as { files: unknown[] }).files).toHaveLength(1);

    // 额度和本应用的界面共用：别的子应用用掉了今天的 1 首，本应用自己也下不了
    const own = await raw(kernel, "netease.download", { songId: "456" });
    expect(own.ok).toBe(false);
    if (!own.ok) expect(own.error.code).toBe("PRECONDITION");
  });
});
