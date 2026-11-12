import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { BACKUP_STALE_MS, openAccounts, readBackupStatus } from "../src/index.js";

/*
 * 备份与恢复脚本（D-0092、D-0096）：在临时目录的假数据上跑真的脚本（AGENTS.md 红线 1），
 * R2 换成一个假的 aws 命令（对象存成本地文件）。
 */

const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)), "../scripts");
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

/** 假的 aws：只认备份脚本用到的 s3 cp 和 s3api list-objects-v2；FAKE_AWS_FAIL=1 时一律失败 */
const FAKE_AWS = `#!/usr/bin/env node
const { copyFileSync, mkdirSync, readdirSync, existsSync } = require("node:fs");
const { dirname, join, relative } = require("node:path");
const root = process.env.FAKE_S3_DIR;
const args = process.argv.slice(2).filter((a, i, all) => a !== "--endpoint-url" && all[i - 1] !== "--endpoint-url");
if (process.env.FAKE_AWS_FAIL) { console.error("An error occurred (AccessDenied) when calling the PutObject operation: Access Denied"); process.exit(1); }
const local = (url) => join(root, url.replace(/^s3:\\/\\//, ""));
if (args[0] === "s3" && args[1] === "cp") {
  const [src, dst] = [args[2], args[3]];
  const from = src.startsWith("s3://") ? local(src) : src;
  const to = dst.startsWith("s3://") ? local(dst) : dst;
  if (dst.startsWith("s3://") && existsSync(to)) { console.error("ObjectLockedByBucketPolicy"); process.exit(1); }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
} else if (args[0] === "s3api" && args[1] === "list-objects-v2") {
  const bucket = args[args.indexOf("--bucket") + 1];
  const prefix = args[args.indexOf("--prefix") + 1];
  const dir = join(root, bucket, prefix);
  const keys = existsSync(dir) ? readdirSync(dir).map((name) => relative(join(root, bucket), join(dir, name))) : [];
  console.log(JSON.stringify(keys.length ? { Contents: keys.map((Key) => ({ Key })) } : {}));
} else { console.error("fake aws: unsupported " + args.join(" ")); process.exit(2); }
`;

interface Env {
  root: string;
  dataDir: string;
  s3: string;
  statusFile: string;
  env: NodeJS.ProcessEnv;
}

function setup(): Env {
  const root = mkdtempSync(join(tmpdir(), "myoutside-backup-test-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "aws"), FAKE_AWS);
  chmodSync(join(bin, "aws"), 0o755);
  const dataDir = join(root, "data");
  const accounts = openAccounts(join(dataDir, "platform.db"));
  const alice = accounts.createUser("alice", { admin: true });
  const bob = accounts.createUser("bob");
  accounts.close();
  for (const [id, rows] of [
    [alice.id, 3],
    [bob.id, 5],
  ] as const) {
    mkdirSync(join(dataDir, "users", id), { recursive: true });
    const db = new DatabaseSync(join(dataDir, "users", id, "myoutside.db"));
    db.exec("PRAGMA journal_mode = WAL; CREATE TABLE app_vocab__card (id INTEGER PRIMARY KEY, term TEXT)");
    for (let i = 0; i < rows; i += 1) db.prepare("INSERT INTO app_vocab__card (term) VALUES (?)").run(`word${i}`);
    db.close();
  }
  // 主密钥不该进备份
  mkdirSync(join(dataDir, "secrets"));
  writeFileSync(join(dataDir, "secrets", "master.key"), randomBytes(32));
  const keyFile = join(root, "backup.key");
  writeFileSync(keyFile, randomBytes(32).toString("base64") + "\n");
  const s3 = join(root, "s3");
  const statusFile = join(root, "status", "status.json");
  return {
    root,
    dataDir,
    s3,
    statusFile,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_S3_DIR: s3,
      MYOUTSIDE_DATA_DIR: dataDir,
      MYOUTSIDE_BACKUP_WORK: join(root, "work"),
      MYOUTSIDE_BACKUP_KEY_FILE: keyFile,
      MYOUTSIDE_BACKUP_STATUS: statusFile,
      MYOUTSIDE_BACKUP_ENV_FILE: join(root, "no-such-env"),
      R2_ENDPOINT: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
      R2_BUCKET: "myoutside-backup",
    },
  };
}

function run(script: string, args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { env, encoding: "utf8" });
}

const objects = (s3: string, prefix: string) => {
  const dir = join(s3, "myoutside-backup", prefix);
  return existsSync(dir) ? readdirSync(dir).sort() : [];
};

const status = (file: string) => JSON.parse(readFileSync(file, "utf8"));

describe("备份", () => {
  it("星期天、1 号按香港时间算（服务器 4 点备份时，UTC 还是前一天）", () => {
    const e = setup();
    // 香港时间 2026-11-15（星期天）04:05 = UTC 11-14（星期六）20:05
    const sunday = Date.UTC(2026, 10, 14, 20, 5, 0);
    const first = run("backup.mjs", [], { ...e.env, MYOUTSIDE_BACKUP_NOW: String(sunday) });
    expect(first.status, first.stderr).toBe(0);
    expect(objects(e.s3, "daily")).toEqual(["20261115-040500.tar.gz.enc"]);
    expect(objects(e.s3, "weekly")).toEqual(["20261115-040500.tar.gz.enc"]);
    expect(objects(e.s3, "monthly")).toEqual([]);

    // 香港时间 2026-12-01（星期二）04:05 = UTC 11-30 20:05
    const firstOfMonth = Date.UTC(2026, 10, 30, 20, 5, 0);
    const second = run("backup.mjs", [], { ...e.env, MYOUTSIDE_BACKUP_NOW: String(firstOfMonth) });
    expect(second.status, second.stderr).toBe(0);
    expect(objects(e.s3, "daily")).toEqual(["20261115-040500.tar.gz.enc", "20261201-040500.tar.gz.enc"]);
    expect(objects(e.s3, "weekly")).toHaveLength(1);
    expect(objects(e.s3, "monthly")).toEqual(["20261201-040500.tar.gz.enc"]);

    // 状态文件：所有人可读（服务端用 myoutside 账号读），不含秘密
    const written = status(e.statusFile);
    expect(written.lastAttempt).toEqual({ at: firstOfMonth, ok: true });
    expect(written.lastSuccess).toMatchObject({ at: firstOfMonth, users: 2, objects: ["daily/20261201-040500.tar.gz.enc", "monthly/20261201-040500.tar.gz.enc"] });
    expect(statSync(e.statusFile).mode & 0o777).toBe(0o644);
    expect(readFileSync(e.statusFile, "utf8")).not.toContain(readFileSync(e.env.MYOUTSIDE_BACKUP_KEY_FILE!, "utf8").trim());
    // 临时文件清掉了
    expect(readdirSync(e.env.MYOUTSIDE_BACKUP_WORK!)).toEqual([]);
  });

  it("上传的是密文；恢复出来的布局和数据目录一样，数据都在，主密钥不在", () => {
    const e = setup();
    expect(run("backup.mjs", [], e.env).status).toBe(0);
    const [object] = objects(e.s3, "daily");
    const cipher = readFileSync(join(e.s3, "myoutside-backup", "daily", object!));
    expect(cipher.subarray(0, 4).toString()).toBe("MYO1");
    expect(cipher.includes(Buffer.from("word1"))).toBe(false);

    const target = join(e.root, "restored");
    const restored = run("restore-backup.mjs", ["--latest", target], e.env);
    expect(restored.status, restored.stderr).toBe(0);
    expect(restored.stdout).toContain("2 个用户库");
    const users = readdirSync(join(target, "users")).sort();
    expect(users).toEqual(readdirSync(join(e.dataDir, "users")).sort());
    const counts = users.map((id) => {
      const db = new DatabaseSync(join(target, "users", id, "myoutside.db"), { readOnly: true });
      const n = (db.prepare("SELECT count(*) AS n FROM app_vocab__card").get() as { n: number }).n;
      db.close();
      return n;
    });
    expect(counts.sort()).toEqual([3, 5]);
    expect(existsSync(join(target, "platform.db"))).toBe(true);
    expect(existsSync(join(target, "secrets"))).toBe(false);
  });

  it("恢复从不碰正在用的数据：目标是数据目录、在它里面，或者不是空目录，都拒绝", () => {
    const e = setup();
    expect(run("backup.mjs", [], e.env).status).toBe(0);
    const before = readdirSync(e.dataDir).sort();
    for (const target of [e.dataDir, join(e.dataDir, "users"), e.root]) {
      const result = run("restore-backup.mjs", ["--latest", target], e.env);
      expect(result.status).not.toBe(0);
    }
    expect(readdirSync(e.dataDir).sort()).toEqual(before);
  });

  it("钥匙不对就解不开", () => {
    const e = setup();
    expect(run("backup.mjs", [], e.env).status).toBe(0);
    const wrongKey = join(e.root, "wrong.key");
    writeFileSync(wrongKey, randomBytes(32).toString("base64"));
    const result = run("restore-backup.mjs", ["--latest", join(e.root, "restored")], { ...e.env, MYOUTSIDE_BACKUP_KEY_FILE: wrongKey });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("解不开");
  });

  it("失败时：退出码非 0，状态里记下原因，上次成功的时间保留", () => {
    const e = setup();
    const ok = Date.UTC(2026, 10, 14, 20, 5, 0);
    expect(run("backup.mjs", [], { ...e.env, MYOUTSIDE_BACKUP_NOW: String(ok) }).status).toBe(0);
    const failedAt = ok + 86_400_000;
    const failed = run("backup.mjs", [], { ...e.env, MYOUTSIDE_BACKUP_NOW: String(failedAt), FAKE_AWS_FAIL: "1" });
    expect(failed.status).not.toBe(0);
    const written = status(e.statusFile);
    expect(written.lastSuccess.at).toBe(ok);
    expect(written.lastAttempt.ok).toBe(false);
    expect(written.lastAttempt.at).toBe(failedAt);
    expect(written.lastAttempt.error).toContain("Access Denied");
  });
});

describe("备份状态（服务端读）", () => {
  it("从没成功、超过 26 小时没成功、上一次失败，都要标红", async () => {
    const e = setup();
    const missing = await readBackupStatus(join(e.root, "none.json"), Date.now());
    expect(missing).toMatchObject({ lastSuccessAt: null, problem: true });

    const ok = Date.UTC(2026, 10, 14, 20, 5, 0);
    expect(run("backup.mjs", [], { ...e.env, MYOUTSIDE_BACKUP_NOW: String(ok) }).status).toBe(0);
    expect(await readBackupStatus(e.statusFile, ok + 3_600_000)).toMatchObject({ lastSuccessAt: ok, lastAttemptOk: true, problem: false });
    expect((await readBackupStatus(e.statusFile, ok + BACKUP_STALE_MS + 1)).problem).toBe(true);

    run("backup.mjs", [], { ...e.env, MYOUTSIDE_BACKUP_NOW: String(ok + 60_000), FAKE_AWS_FAIL: "1" });
    expect(await readBackupStatus(e.statusFile, ok + 120_000)).toMatchObject({ lastSuccessAt: ok, lastAttemptOk: false, problem: true });
  });
});
