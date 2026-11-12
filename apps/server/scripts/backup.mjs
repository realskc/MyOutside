#!/usr/bin/env node
/*
 * 服务器数据的备份（D-0092、D-0096）：myoutside-backup.service 以 root 运行（每天凌晨 4 点，以及每次部署前）。
 *   1. 给平台库和每个用户库拍快照，检查完好，打包、压缩、加密；
 *   2. 上传到 R2：每天 daily/；星期天另传 weekly/；每月 1 号另传 monthly/（日子按香港时间算）；
 *   3. 每份都下载回来：核对和上传的一样，解密、解开、逐个打开检查——确认真的能恢复；
 *   4. 结果写进状态文件，网页的设置里显示上次成功的时间，超过一天没成功就标红。
 */
import { mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  aws,
  checkRestoredDir,
  decryptFile,
  encryptFile,
  hongKongTime,
  loadR2Config,
  readBackupKey,
  sha256,
  snapshotDataDir,
  tarCreate,
  tarExtract,
  updateStatus,
} from "./backup-lib.mjs";

const dataDir = process.env.MYOUTSIDE_DATA_DIR ?? "/var/lib/myoutside";
const workRoot = process.env.MYOUTSIDE_BACKUP_WORK ?? "/var/lib/myoutside-backup-work";
const statusFile = process.env.MYOUTSIDE_BACKUP_STATUS ?? "/var/lib/myoutside-backup/status.json";
// 测试用：假装现在是某个时刻
const now = Number(process.env.MYOUTSIDE_BACKUP_NOW) || Date.now();

const temp = join(workRoot, `${process.pid}-${now}`);
try {
  const { endpoint, bucket } = loadR2Config();
  const key = readBackupKey();
  mkdirSync(temp, { recursive: true, mode: 0o700 });

  const snapshot = join(temp, "snapshot");
  const users = snapshotDataDir(dataDir, snapshot);
  const tar = join(temp, "backup.tar.gz");
  tarCreate(snapshot, tar);
  const encrypted = join(temp, "backup.tar.gz.enc");
  encryptFile(tar, encrypted, key);

  const time = hongKongTime(now);
  const prefixes = ["daily"];
  if (time.weekday === 0) prefixes.push("weekly");
  if (time.dayOfMonth === 1) prefixes.push("monthly");

  const objects = [];
  for (const prefix of prefixes) {
    // 文件名是香港时间，按名字排序就是按时间排序；不覆盖旧的
    const object = `${prefix}/${time.stamp}.tar.gz.enc`;
    aws(endpoint, ["s3", "cp", encrypted, `s3://${bucket}/${object}`, "--no-progress", "--only-show-errors"]);
    const downloaded = join(temp, `${prefix}.downloaded`);
    aws(endpoint, ["s3", "cp", `s3://${bucket}/${object}`, downloaded, "--no-progress", "--only-show-errors"]);
    if (sha256(downloaded) !== sha256(encrypted)) throw new Error(`下载回来的和上传的不一样：${object}`);
    const restoredTar = join(temp, `${prefix}.tar.gz`);
    decryptFile(downloaded, restoredTar, key);
    const restored = join(temp, `${prefix}.restored`);
    tarExtract(restoredTar, restored);
    const restoredUsers = checkRestoredDir(restored);
    if (restoredUsers.join(",") !== users.join(",")) throw new Error(`恢复出来的用户库和备份时不一样：${object}`);
    objects.push(object);
    console.log(`[backup] 已上传并检查：s3://${bucket}/${object}`);
  }

  updateStatus(statusFile, {
    lastAttempt: { at: now, ok: true },
    lastSuccess: { at: now, objects, users: users.length, bytes: statSync(encrypted).size },
  });
  console.log(`[backup] 完成：${users.length} 个用户库，${statSync(encrypted).size} 字节`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  try {
    updateStatus(statusFile, { lastAttempt: { at: now, ok: false, error: message.slice(0, 500) } });
  } catch (statusError) {
    console.error(`[backup] 状态文件写不进去：${statusError instanceof Error ? statusError.message : statusError}`);
  }
  console.error(`[backup] 失败：${message}`);
  process.exitCode = 1;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
