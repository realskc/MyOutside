import { promises as fs } from "node:fs";

/**
 * 服务器备份的状态（D-0092、D-0096）：备份程序（root）写状态文件，服务端只读它，在设置里给管理员看。
 * 每天凌晨 4 点备份，定时器会随机推迟最多 15 分钟、备份本身也要一会儿：26 小时内有成功的就算正常，
 * 超过就标红（作者预期是「超过一天没成功就标红」，多出的 2 小时是给这些误差留的）。
 */
export const BACKUP_STALE_MS = 26 * 3600_000;

export interface BackupStatus {
  /** 上次成功的时间（毫秒）；从没成功过是 null */
  lastSuccessAt: number | null;
  lastAttemptAt: number | null;
  lastAttemptOk: boolean | null;
  /** 上次失败的原因（上次成功时为 null） */
  lastError: string | null;
  /** 要标红：从没成功过、超过 26 小时没成功，或者上一次失败了 */
  problem: boolean;
}

interface StatusFile {
  lastAttempt?: { at?: unknown; ok?: unknown; error?: unknown };
  lastSuccess?: { at?: unknown };
}

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

export async function readBackupStatus(file: string, now: number): Promise<BackupStatus> {
  let raw: StatusFile = {};
  try {
    raw = JSON.parse(await fs.readFile(file, "utf8")) as StatusFile;
  } catch {
    /* 还没备份过，或者文件坏了：都当作没有成功过 */
  }
  const lastSuccessAt = num(raw.lastSuccess?.at);
  const lastAttemptAt = num(raw.lastAttempt?.at);
  const lastAttemptOk = typeof raw.lastAttempt?.ok === "boolean" ? raw.lastAttempt.ok : null;
  const lastError = lastAttemptOk === false && typeof raw.lastAttempt?.error === "string" ? raw.lastAttempt.error.slice(0, 500) : null;
  const stale = lastSuccessAt === null || now - lastSuccessAt > BACKUP_STALE_MS;
  return { lastSuccessAt, lastAttemptAt, lastAttemptOk, lastError, problem: stale || lastAttemptOk === false };
}
