import { readCredential } from "./credentials.js";
import { KernelError } from "./errors.js";
import type { CredentialStore, DbAdapter, SecretCodec, UsageQuota } from "./types.js";

/**
 * 平台 AI 从哪取 key、有没有额度（D-0097），由运行环境在建内核时给出：
 * - Electron / 本机：key 存在这个库里（secrets 加密），不限额；
 * - 服务器试用阶段：credentials 指向大家共用的 key，朋友的内核带 quota。
 */
export interface AiAccess {
  secrets?: SecretCodec;
  credentials?: CredentialStore;
  quota?: UsageQuota;
}

const API_KEY = "ai.deepseek.apiKey";

export function readApiKey(storage: DbAdapter, access: AiAccess): string | null {
  return access.credentials ? access.credentials.get(API_KEY) : readCredential(storage, API_KEY, access.secrets);
}

export function missingApiKeyMessage(access: AiAccess): string {
  return access.credentials?.missingMessage ?? "尚未配置 DeepSeek API Key（设置 → DeepSeek API Key）";
}

export interface QuotaStatus {
  limitYuan: number;
  usedYuan: number;
  periodStart: number;
  periodEnd: number;
  label: string;
  resetText: string;
}

export function quotaStatus(storage: DbAdapter, quota: UsageQuota, now: number): QuotaStatus {
  const { start, end } = quota.period(now);
  const row = storage.select<{ used: number }>(
    "SELECT COALESCE(SUM(cost_yuan), 0) AS used FROM platform_usage WHERE created_at >= ? AND created_at < ?",
    [start, end],
  )[0];
  return {
    limitYuan: quota.limitYuan,
    usedYuan: Number(row?.used ?? 0),
    periodStart: start,
    periodEnd: end,
    label: quota.label,
    resetText: quota.resetText,
  };
}

/** 发请求之前检查额度：用完了就不发，直接报 QUOTA_EXCEEDED */
export function checkQuota(storage: DbAdapter, access: AiAccess, now = Date.now()): void {
  if (!access.quota) return;
  const status = quotaStatus(storage, access.quota, now);
  if (status.usedYuan >= status.limitYuan) {
    throw new KernelError(
      "QUOTA_EXCEEDED",
      `${status.label}的 AI 额度（¥${status.limitYuan}）用完了，${status.resetText}恢复`,
      status,
    );
  }
}
