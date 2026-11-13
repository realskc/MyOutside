import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { KernelError, type CredentialStore, type SecretCodec, type UsageQuota } from "@myoutside/kernel";
import type { Accounts } from "./accounts.js";

/**
 * 服务器试用阶段（D-0097，platform.md「平台 AI」「用量管控」）：
 * - 大家共用作者的 DeepSeek key：只有一把，加密后存在平台库里；只有管理员能改；
 * - 朋友（不是管理员的用户）每周最多花 ¥20，周一 0 点（北京时间）重新算；作者自己不限。
 */
export const TRIAL_WEEKLY_LIMIT_YUAN = 20;

const SHARED_KEY = "ai.deepseek.apiKey";
const UTC8 = 8 * 3600_000;
const DAY = 86_400_000;

/** 包含 now 的那一周（周一 0 点到下周一 0 点，北京时间 = 香港时间） */
export function chinaWeek(now: number): { start: number; end: number } {
  const local = new Date(now + UTC8);
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - sinceMonday) - UTC8;
  return { start, end: start + 7 * DAY };
}

export function weeklyQuota(limitYuan: number): UsageQuota {
  return { limitYuan, period: chinaWeek, label: "本周", resetText: "下周一 0 点（北京时间）" };
}

/** 一个用户看到的凭据：读的都是共用的那把；管理员能改，其他人不能 */
export function sharedCredentials(accounts: Accounts, secrets: SecretCodec, isAdmin: boolean): CredentialStore {
  return {
    get(key) {
      const cipher = key === SHARED_KEY ? accounts.getServerSetting(key) : null;
      if (!cipher) return null;
      try {
        return secrets.decrypt(cipher);
      } catch {
        throw new KernelError("PRECONDITION", "服务器上共用的 AI key 解不开（主密钥换过？）：请管理员在设置里重新填写");
      }
    },
    isSet(key) {
      return key === SHARED_KEY && accounts.getServerSetting(key) !== null;
    },
    set(key, value) {
      if (!isAdmin) throw new KernelError("FORBIDDEN", "试用阶段大家共用作者提供的 AI key，只有管理员能改");
      if (key !== SHARED_KEY) throw new KernelError("VALIDATION", `不认识的凭据：${key}`);
      const plain = value?.trim() ?? "";
      accounts.setServerSetting(key, plain === "" ? null : secrets.encrypt(plain));
    },
    missingMessage: isAdmin
      ? "尚未配置 DeepSeek API Key（设置 → DeepSeek API Key）"
      : "服务器还没有配置 AI 的 key，请联系邀请你的人",
  };
}

/** 一个用户这周和一共花了多少（管理员看各用户的用量）；直接只读打开他的库 */
export function userSpending(usersDir: string, userId: string, now: number): { weekYuan: number; totalYuan: number } {
  const file = join(usersDir, userId, "myoutside.db");
  if (!existsSync(file)) return { weekYuan: 0, totalYuan: 0 };
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'platform_usage'").get();
    if (!hasTable) return { weekYuan: 0, totalYuan: 0 };
    const { start } = chinaWeek(now);
    const row = db
      .prepare("SELECT COALESCE(SUM(cost_yuan), 0) AS total, COALESCE(SUM(CASE WHEN created_at >= ? THEN cost_yuan END), 0) AS week FROM platform_usage")
      .get(start) as { total: number; week: number };
    return { weekYuan: Number(row.week), totalYuan: Number(row.total) };
  } finally {
    db.close();
  }
}
