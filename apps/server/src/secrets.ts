import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SecretCodec } from "@myoutside/kernel";

/**
 * 服务器上的凭据加解密（D-0093）：代替 Electron 的 safeStorage（D-0075）。
 * 主密钥是一个 32 字节的随机文件，只有服务进程的账号能读；用户的 API key 用它做 AES-256-GCM 加密后存进用户自己的库。
 * 主密钥不进备份（D-0092）：从备份恢复后，用户重填一次 API key。
 */
export function loadOrCreateMasterKey(path: string): Buffer {
  if (existsSync(path)) {
    const key = readFileSync(path);
    if (key.length !== 32) throw new Error(`主密钥文件长度不对（应为 32 字节）：${path}`);
    return key;
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const key = randomBytes(32);
  writeFileSync(path, key, { mode: 0o600, flag: "wx" });
  chmodSync(path, 0o600);
  return key;
}

const PREFIX = "v1:";

export function createAesSecretCodec(key: Buffer): SecretCodec {
  if (key.length !== 32) throw new Error("主密钥必须是 32 字节");
  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
    },
    decrypt(text) {
      if (!text.startsWith(PREFIX)) throw new Error("无法识别的密文格式");
      const raw = Buffer.from(text.slice(PREFIX.length), "base64");
      if (raw.length < 28) throw new Error("密文太短");
      const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    },
  };
}
