#!/usr/bin/env node
/*
 * 一次性（D-0098）：学英语、对话、围棋、哲野的数据已经搬到服务器（以服务器为准），清掉本机库里它们的那一份。
 * 先完整备份整个库，再删这四个子应用的表、迁移记录和用量记录；纯蓝、网易云下载、平台设置不动。
 * 用法（先完全退出 MyOutside）：node scripts/cleanup-local-cloud-apps.mjs [库的路径]
 * Mac 和 ThinkBook 都清理完以后，删掉这个脚本（AGENTS.md：不留永久的迁移代码）。
 */
import { existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const APPS = ["vocab", "dialog", "go", "zheye"];

function defaultPath() {
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "MyOutside", "myoutside.db");
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "MyOutside", "myoutside.db");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "MyOutside", "myoutside.db");
}

const path = process.argv[2] ?? defaultPath();
if (!existsSync(path)) {
  console.error(`没有找到库：${path}`);
  process.exit(1);
}
// MyOutside 开着时，库旁边有 -wal 文件；正常退出后它会合回主文件并消失
if (existsSync(`${path}-wal`)) {
  console.error("MyOutside 好像还开着（库旁边有 -wal 文件）：请先完全退出 MyOutside 再运行");
  process.exit(1);
}

const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const backupDir = join(dirname(path), "backups");
mkdirSync(backupDir, { recursive: true });
const backup = join(backupDir, `myoutside-before-cleanup-${stamp}.db`);

const db = new DatabaseSync(path);
try {
  db.prepare("VACUUM INTO ?").run(backup);
  const check = new DatabaseSync(backup, { readOnly: true });
  const ok = Object.values(check.prepare("PRAGMA integrity_check").get())[0] === "ok";
  check.close();
  if (!ok) throw new Error(`备份检查没通过：${backup}`);
  console.log(`已备份整个库：${backup}（${statSync(backup).size} 字节）`);

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => row.name)
    .filter((name) => APPS.some((id) => name.startsWith(`app_${id}__`)));
  const marks = APPS.map(() => "?").join(", ");
  db.exec("BEGIN");
  try {
    for (const name of tables) db.exec(`DROP TABLE "${name}"`);
    const migrations = db.prepare(`DELETE FROM platform_migration WHERE app_id IN (${marks})`).run(...APPS).changes;
    const usage = db.prepare(`DELETE FROM platform_usage WHERE caller IN (${marks})`).run(...APPS).changes;
    db.exec("COMMIT");
    console.log(`已删除：${tables.length} 张表（${tables.join("、") || "无"}），${migrations} 条迁移记录，${usage} 条用量记录`);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  db.exec("VACUUM");
  const left = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name);
  console.log(`剩下的表：${left.join("、")}`);
} finally {
  db.close();
}
