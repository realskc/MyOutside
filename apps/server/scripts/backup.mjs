#!/usr/bin/env node
/* MyOutside R2 backup (D-0092). Run as root from myoutside-backup.service. */
import { execFileSync, spawnSync } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";

const dataDir = process.env.MYOUTSIDE_DATA_DIR ?? "/var/lib/myoutside";
const workRoot = process.env.MYOUTSIDE_BACKUP_WORK ?? "/var/lib/myoutside-backup-work";
const keyFile = process.env.MYOUTSIDE_BACKUP_KEY_FILE ?? "/etc/myoutside/backup.key";
const endpoint = required("R2_ENDPOINT");
const bucket = required("R2_BUCKET");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const date = new Date().toISOString().slice(0, 10);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

function key() {
  const value = readFileSync(keyFile, "utf8").trim();
  const raw = Buffer.from(value, "base64");
  if (raw.length !== 32) throw new Error("备份钥匙必须是 base64 编码的 32 字节");
  return raw;
}

function snapshotDatabase(source, target) {
  if (!existsSync(source)) return false;
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    db.prepare("VACUUM INTO ?").run(target);
    const check = db.prepare("PRAGMA integrity_check").get();
    if (Object.values(check)[0] !== "ok") throw new Error(`源数据库损坏：${source}`);
  } finally {
    db.close();
  }
  const copy = new DatabaseSync(target, { readOnly: true });
  try {
    const check = copy.prepare("PRAGMA integrity_check").get();
    if (Object.values(check)[0] !== "ok") throw new Error(`快照损坏：${target}`);
  } finally {
    copy.close();
  }
  return true;
}

function encrypt(input, output, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret, iv);
  const body = Buffer.concat([cipher.update(readFileSync(input)), cipher.final()]);
  writeFileSync(output, Buffer.concat([Buffer.from("MYO1"), iv, cipher.getAuthTag(), body]), { mode: 0o600 });
}

function decrypt(input, output, secret) {
  const raw = readFileSync(input);
  if (raw.subarray(0, 4).toString() !== "MYO1" || raw.length < 32) throw new Error("不是 MyOutside 备份");
  const decipher = createDecipheriv("aes-256-gcm", secret, raw.subarray(4, 16));
  decipher.setAuthTag(raw.subarray(16, 32));
  writeFileSync(output, Buffer.concat([decipher.update(raw.subarray(32)), decipher.final()]), { mode: 0o600 });
}

function aws(...args) {
  execFileSync("aws", ["--endpoint-url", endpoint, ...args], { stdio: "inherit" });
}

function remoteKey(prefix) {
  return `${prefix}/${date}-${stamp}.tar.gz.enc`;
}

const temp = join(workRoot, `${process.pid}-${Date.now()}`);
mkdirSync(temp, { recursive: true, mode: 0o700 });
try {
  const snapshot = join(temp, "snapshot");
  mkdirSync(join(snapshot, "users"), { recursive: true, mode: 0o700 });
  snapshotDatabase(join(dataDir, "platform.db"), join(snapshot, "platform.db"));
  const usersDir = join(dataDir, "users");
  if (existsSync(usersDir)) {
    for (const userId of readdirSync(usersDir, { withFileTypes: true })) {
      if (userId.isDirectory()) snapshotDatabase(join(usersDir, userId.name, "myoutside.db"), join(snapshot, "users", userId.name + ".db"));
    }
  }
  const tar = join(temp, "backup.tar.gz");
  execFileSync("tar", ["-czf", tar, "-C", snapshot, "."]);
  const encrypted = join(temp, "backup.tar.gz.enc");
  encrypt(tar, encrypted, key());
  // Local decrypt check catches a bad key, format, or encryption before upload.
  const decrypted = join(temp, "roundtrip.tar.gz");
  decrypt(encrypted, decrypted, key());
  if (readFileSync(tar).compare(readFileSync(decrypted)) !== 0) throw new Error("本地加密往返校验失败");

  const prefixes = ["daily"];
  const day = new Date().getUTCDay();
  if (day === 0) prefixes.push("weekly");
  if (new Date().getUTCDate() === 1) prefixes.push("monthly");
  for (const prefix of prefixes) {
    const object = remoteKey(prefix);
    aws("s3", "cp", encrypted, `s3://${bucket}/${object}`, "--no-progress");
    // Download and decrypt the actual uploaded object, then verify it is a valid archive.
    const downloaded = join(temp, `${prefix}.downloaded`);
    aws("s3", "cp", `s3://${bucket}/${object}`, downloaded, "--no-progress");
    const restored = join(temp, `${prefix}.restored.tar.gz`);
    decrypt(downloaded, restored, key());
    execFileSync("tar", ["-tzf", restored]);
    console.log(`[backup] verified s3://${bucket}/${object}`);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
