#!/usr/bin/env node
/*
 * 把一份备份解开到一个新目录，并逐个打开检查（D-0092、D-0096）。以 root 运行。
 *   restore-backup.mjs --latest <新目录>       从 R2 下载 daily/ 里最新的一份
 *   restore-backup.mjs <备份文件> <新目录>      用已经下载好的文件
 * 解开后的布局和数据目录一样（platform.db、users/<用户 id>/myoutside.db）；真正换回去的步骤见 docs/server.md。
 * 新目录必须不存在或是空的，而且不能和数据目录重叠：这个脚本从不碰正在用的数据（AGENTS.md 红线 1）。
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { aws, checkRestoredDir, decryptFile, loadR2Config, readBackupKey, tarExtract } from "./backup-lib.mjs";

const [source, destinationArg] = process.argv.slice(2);
if (!source || !destinationArg) {
  console.error("用法：restore-backup.mjs <备份文件 | --latest> <新的恢复目录>");
  process.exit(2);
}
const destination = resolve(destinationArg);
const dataDir = resolve(process.env.MYOUTSIDE_DATA_DIR ?? "/var/lib/myoutside");
const inside = (child, parent) => child === parent || child.startsWith(parent + sep);
if (inside(destination, dataDir) || inside(dataDir, destination)) {
  console.error(`恢复目录不能和数据目录重叠：${destination}`);
  process.exit(2);
}
if (existsSync(destination) && readdirSync(destination).length > 0) {
  console.error(`恢复目录要是新的（不存在或是空的）：${destination}`);
  process.exit(2);
}

const workRoot = process.env.MYOUTSIDE_BACKUP_WORK ?? tmpdir();
mkdirSync(workRoot, { recursive: true, mode: 0o700 });
const work = mkdtempSync(join(workRoot, "myoutside-restore-"));
try {
  const key = readBackupKey();
  let archive = resolve(source);
  if (source === "--latest") {
    const { endpoint, bucket } = loadR2Config();
    const listing = JSON.parse(aws(endpoint, ["s3api", "list-objects-v2", "--bucket", bucket, "--prefix", "daily/", "--output", "json"], { capture: true }) || "{}");
    const keys = (listing.Contents ?? []).map((item) => item.Key).filter((name) => name.endsWith(".tar.gz.enc")).sort();
    const latest = keys.at(-1);
    if (!latest) throw new Error(`R2 的 ${bucket}/daily/ 里没有备份`);
    archive = join(work, "latest.tar.gz.enc");
    aws(endpoint, ["s3", "cp", `s3://${bucket}/${latest}`, archive, "--no-progress", "--only-show-errors"]);
    console.log(`下载了最新的一份：${latest}`);
  }
  const tar = join(work, "backup.tar.gz");
  decryptFile(archive, tar, key);
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  tarExtract(tar, destination);
  const users = checkRestoredDir(destination);
  console.log(`恢复检查通过：${destination}（平台库 + ${users.length} 个用户库）`);
} catch (error) {
  console.error(`恢复失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
