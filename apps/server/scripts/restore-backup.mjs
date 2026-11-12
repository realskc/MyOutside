#!/usr/bin/env node
/* Restore into a new directory. Never writes the live data directory. */
import { execFileSync } from "node:child_process";
import { createDecipheriv } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const [archive, destination] = process.argv.slice(2);
if (!archive || !destination) throw new Error("用法：restore-backup.mjs <备份文件> <新的恢复目录>");
const keyFile = process.env.MYOUTSIDE_BACKUP_KEY_FILE ?? "/etc/myoutside/backup.key";
const secret = Buffer.from(readFileSync(keyFile, "utf8").trim(), "base64");
if (secret.length !== 32) throw new Error("备份钥匙必须是 32 字节");
const raw = readFileSync(resolve(archive));
if (raw.subarray(0, 4).toString() !== "MYO1") throw new Error("不是 MyOutside 备份");
const decipher = createDecipheriv("aes-256-gcm", secret, raw.subarray(4, 16));
decipher.setAuthTag(raw.subarray(16, 32));
const encryptedTar = `${destination}.tar.gz`;
mkdirSync(resolve(destination, ".."), { recursive: true });
writeFileSync(encryptedTar, Buffer.concat([decipher.update(raw.subarray(32)), decipher.final()]), { mode: 0o600 });
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true, mode: 0o700 });
execFileSync("tar", ["-xzf", encryptedTar, "-C", destination]);
rmSync(encryptedTar, { force: true });
for (const file of [join(destination, "platform.db"), ...requireUserDbs(destination)]) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (Object.values(db.prepare("PRAGMA integrity_check").get())[0] !== "ok") throw new Error(`数据库损坏：${file}`);
  } finally { db.close(); }
}
console.log(`恢复检查通过：${destination}`);

function requireUserDbs(root) {
  return readdirSync(join(root, "users"), { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(".db")).map((e) => join(root, "users", e.name));
}
