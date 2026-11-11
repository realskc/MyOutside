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
}

/** 假的网易云：一首歌《测试 歌/曲》，账号最高能下无损；音频是固定的一段字节 */
function fakeNetease(options: { audio?: Buffer; md5?: string; apiCode?: number; maxLevel?: string; lyricFailures?: number } = {}) {
  let lyricFailures = options.lyricFailures ?? 0;
  const audio = options.audio ?? Buffer.from("fLaC fake audio bytes ".repeat(5000));
  const md5 = options.md5 ?? createHash("md5").update(audio).digest("hex");
  const calls: FakeCall[] = [];
  const song = { id: 123, name: "测试 歌/曲", ar: [{ name: "洛天依Official" }, { name: "乐正绫" }], al: { name: "专辑" }, dt: 200000, fee: 8 };
  const privilege = { st: 0, dl: 999000, dlLevel: options.maxLevel ?? "lossless" };
  const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", headers: new Headers(init?.headers), body: String(init?.body ?? "") });
    if (url.startsWith("https://interface.music.163.com/")) {
      if (options.apiCode) return json({ code: options.apiCode, message: `need login ${TOKEN}` });
      const path = new URL(url).pathname;
      if (path === "/api/cloudsearch/pc") return json({ code: 200, result: { songCount: 1, songs: [{ ...song, privilege }] } });
      if (path === "/api/v3/song/detail") return json({ code: 200, songs: [song], privileges: [privilege] });
      if (path === "/api/song/enhance/download/url/v1") {
        const level = new URLSearchParams(String(init?.body)).get("level");
        return json({
          code: 200,
          data: { code: 200, url: `http://m701.music.126.net/a/b.flac?sign=${TOKEN.length}`, size: audio.length, md5, type: "flac", level, br: 931763 },
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

function setup(options: { cookie?: boolean; fake?: ReturnType<typeof fakeNetease> } = {}): {
  kernel: Kernel;
  downloads: string;
  fake: ReturnType<typeof fakeNetease>;
} {
  const dir = tempDir();
  const downloads = join(dir, "网易云音乐");
  const fake = options.fake ?? fakeNetease();
  const cookiePaths = options.cookie === false ? [join(dir, "missing.binarycookies")] : [writeCookieFile(dir)];
  const kernel = createKernel({ storage: createNodeSqliteAdapter({ path: ":memory:" }) });
  kernel.registerApp(createNeteaseApp({ cookiePaths, defaultDownloadDir: downloads, fetch: fake.impl }));
  kernel.start();
  return { kernel, downloads, fake };
}

async function raw(kernel: Kernel, call: string, payload: unknown = {}, emit?: (event: unknown) => void) {
  return kernel.handle({ call, payload }, { caller: "netease", emit });
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

  it("别的子应用只能读下载文件夹；搜索和下载是内部 API，调不了", async () => {
    const dir = tempDir();
    const fake = fakeNetease();
    const kernel = createKernel({ storage: createNodeSqliteAdapter({ path: ":memory:" }) });
    kernel.registerApp(createNeteaseApp({ cookiePaths: [writeCookieFile(dir)], defaultDownloadDir: join(dir, "dl"), fetch: fake.impl }));
    kernel.registerApp(
      { id: "reader", name: "reader", api: {} },
      {
        id: "reader",
        name: "reader",
        protocolVersion: 1,
        uses: ["netease.listDownloadedFiles", "netease.search", "netease.download"],
      },
    );
    kernel.start();
    const as = (name: string, payload: unknown) => kernel.handle({ call: name, payload }, { caller: "reader" });
    expect((await as("netease.listDownloadedFiles", {})).ok).toBe(true);
    for (const name of ["netease.search", "netease.download"]) {
      const res = await as(name, name === "netease.search" ? { query: "x" } : { songId: "123" });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
    }
    expect(fake.calls).toHaveLength(0);
  });
});
