import { KernelError } from "./errors.js";
import type { DbAdapter, SecretCodec } from "./types.js";

/** 凭据类平台设置：任何调用者都读不到值（外壳也只能知道是否已设置），加密保存（D-0053、D-0075） */
export const CREDENTIAL_SETTINGS = new Set(["ai.deepseek.apiKey"]);

/** 加密后的凭据在设置表里的形状 */
interface EncryptedValue {
  $encrypted: string;
}

function isEncrypted(value: unknown): value is EncryptedValue {
  return typeof value === "object" && value !== null && typeof (value as EncryptedValue).$encrypted === "string";
}

/** 写入前的处理：凭据在有加解密能力时加密；清空（null / 空字符串）照原样 */
export function encodeSetting(key: string, value: unknown, secrets: SecretCodec | undefined): unknown {
  if (!CREDENTIAL_SETTINGS.has(key) || !secrets || typeof value !== "string" || value.trim() === "") return value;
  return { $encrypted: secrets.encrypt(value.trim()) };
}

/** 读出凭据的明文（只在平台内部使用）；未设置返回 null */
export function readCredential(storage: DbAdapter, key: string, secrets: SecretCodec | undefined): string | null {
  const row = storage.select<{ value: string }>("SELECT value FROM platform_setting WHERE key = ?", [key])[0];
  const value = row ? (JSON.parse(row.value) as unknown) : null;
  if (typeof value === "string") return value.trim() === "" ? null : value.trim();
  if (!isEncrypted(value)) return null;
  if (!secrets) throw new KernelError("PRECONDITION", "凭据已加密保存，当前环境无法解密（请在 MyOutside 里使用）");
  try {
    return secrets.decrypt(value.$encrypted);
  } catch {
    throw new KernelError("PRECONDITION", "凭据无法解密（系统钥匙串拒绝访问或已变更）：请在「设置」里重新填写 DeepSeek API Key");
  }
}

/** 启动时：把明文保存的凭据改为加密保存（有加解密能力时） */
export function encryptPlaintextCredentials(storage: DbAdapter, secrets: SecretCodec | undefined): void {
  if (!secrets) return;
  for (const key of CREDENTIAL_SETTINGS) {
    const row = storage.select<{ value: string }>("SELECT value FROM platform_setting WHERE key = ?", [key])[0];
    if (!row) continue;
    const value = JSON.parse(row.value) as unknown;
    if (typeof value !== "string" || value.trim() === "") continue;
    storage.execute("UPDATE platform_setting SET value = ?, updated_at = ? WHERE key = ?", [
      JSON.stringify(encodeSetting(key, value, secrets)),
      Date.now(),
      key,
    ]);
  }
}
