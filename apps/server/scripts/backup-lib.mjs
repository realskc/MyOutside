/*
 * 备份与恢复共用的部分（D-0092、D-0096）。以 root 运行。
 * 包里的布局和服务器上的数据目录一样：platform.db、users/<用户 id>/myoutside.db（不含 secrets/，主密钥不进备份）。
 */
import { execFileSync } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const MAGIC = "MYO1";

/** R2 的配置：systemd 用 EnvironmentFile 传进来；手动运行时从 /etc/myoutside/backup.env 读 */
export function loadR2Config() {
  const file = process.env.MYOUTSIDE_BACKUP_ENV_FILE ?? "/etc/myoutside/backup.env";
  if (!process.env.R2_ENDPOINT && existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
    }
  }
  const required = (name) => {
    const value = process.env[name];
    if (!value) throw new Error(`缺少 ${name}（R2 还没配置？运行 configure-backup.sh）`);
    return value;
  };
  return { endpoint: required("R2_ENDPOINT"), bucket: required("R2_BUCKET") };
}

export function readBackupKey() {
  const file = process.env.MYOUTSIDE_BACKUP_KEY_FILE ?? "/etc/myoutside/backup.key";
  const raw = Buffer.from(readFileSync(file, "utf8").trim(), "base64");
  if (raw.length !== 32) throw new Error("备份钥匙必须是 base64 编码的 32 字节");
  return raw;
}

export function encryptFile(input, output, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(readFileSync(input)), cipher.final()]);
  writeFileSync(output, Buffer.concat([Buffer.from(MAGIC), iv, cipher.getAuthTag(), body]), { mode: 0o600 });
}

/** 解密；钥匙不对或内容被改过一个字节都会失败（AES-256-GCM） */
export function decryptFile(input, output, key) {
  const raw = readFileSync(input);
  if (raw.length < 32 || raw.subarray(0, 4).toString() !== MAGIC) throw new Error("不是 MyOutside 的备份文件");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(4, 16));
  decipher.setAuthTag(raw.subarray(16, 32));
  try {
    writeFileSync(output, Buffer.concat([decipher.update(raw.subarray(32)), decipher.final()]), { mode: 0o600 });
  } catch {
    throw new Error("解不开：备份钥匙不对，或者文件损坏");
  }
}

export const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

function checkIntegrity(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const row = db.prepare("PRAGMA integrity_check").get();
    if (Object.values(row)[0] !== "ok") throw new Error(`数据库损坏：${file}`);
  } finally {
    db.close();
  }
}

/** 给一个库拍快照（服务在运行也能拍，拍出来是完整一致的），并检查源和快照都完好 */
function snapshotDatabase(source, target) {
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    db.prepare("VACUUM INTO ?").run(target);
  } finally {
    db.close();
  }
  checkIntegrity(target);
}

/** 用户库的位置：users/<用户 id>/myoutside.db */
function userDatabases(root) {
  const users = join(root, "users");
  if (!existsSync(users)) return [];
  return readdirSync(users, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(users, entry.name, "myoutside.db")))
    .map((entry) => entry.name)
    .sort();
}

/** 把数据目录里的库拍成快照，放进 target（布局和数据目录一样）；返回用户 id 列表 */
export function snapshotDataDir(dataDir, target) {
  mkdirSync(join(target, "users"), { recursive: true, mode: 0o700 });
  if (!existsSync(join(dataDir, "platform.db"))) throw new Error(`没有平台库：${join(dataDir, "platform.db")}`);
  snapshotDatabase(join(dataDir, "platform.db"), join(target, "platform.db"));
  const users = userDatabases(dataDir);
  for (const id of users) snapshotDatabase(join(dataDir, "users", id, "myoutside.db"), join(target, "users", id, "myoutside.db"));
  return users;
}

/** 检查解开的备份：平台库和每个用户库都能打开、完好；返回用户 id 列表 */
export function checkRestoredDir(dir) {
  checkIntegrity(join(dir, "platform.db"));
  const users = userDatabases(dir);
  for (const id of users) checkIntegrity(join(dir, "users", id, "myoutside.db"));
  return users;
}

export function tarCreate(sourceDir, archive) {
  execFileSync("tar", ["-czf", archive, "-C", sourceDir, "."]);
}

export function tarExtract(archive, targetDir) {
  mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  execFileSync("tar", ["-xzf", archive, "-C", targetDir]);
}

/** 调用 aws 命令行（R2 的 S3 接口）；失败时带上它的最后一行报错 */
export function aws(endpoint, args, { capture = false } = {}) {
  try {
    const out = execFileSync("aws", ["--endpoint-url", endpoint, ...args], {
      stdio: ["ignore", capture ? "pipe" : "inherit", "pipe"],
      encoding: "utf8",
    });
    return capture ? out : "";
  } catch (error) {
    const stderr = String(error.stderr ?? "").trim().split("\n").filter(Boolean).pop();
    throw new Error(`aws ${args.slice(0, 2).join(" ")} 失败${stderr ? "：" + stderr : ""}`);
  }
}

/** 某一时刻在香港时间（服务器和作者都在 UTC+8）的日期、星期、几号，以及文件名用的时间戳 */
export function hongKongTime(ms) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Hong_Kong",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    })
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value]),
  );
  return {
    stamp: `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`,
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday),
    dayOfMonth: Number(parts.day),
  };
}

/** 状态文件（服务端读它，在网页上显示上次成功的时间）：root 写，所有人可读，不含秘密 */
export function updateStatus(file, patch) {
  let current = {};
  try {
    current = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    /* 第一次 */
  }
  const next = { ...current, ...patch };
  mkdirSync(dirname(file), { recursive: true });
  chmodSync(dirname(file), 0o755);
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(next, null, 2) + "\n");
  chmodSync(temp, 0o644);
  renameSync(temp, file);
}
