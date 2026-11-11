import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * 密码哈希（D-0093）：加盐的 scrypt，存成 `scrypt$N$r$p$盐$哈希`。
 * 一次哈希约占 32 MB 内存、几十毫秒 CPU，所以同时计算的数量有上限，排队太长就直接拒绝——
 * 防止有人靠大量登录请求把服务器的 CPU 和内存吃满。
 */
const N = 32768;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const MAX_MEMORY = 64 * 1024 * 1024;

/** 用户名、密码的长度上限：超了在算哈希之前就拒绝 */
export const MAX_PASSWORD_LENGTH = 256;
export const MIN_PASSWORD_LENGTH = 8;

export class HashBusyError extends Error {}

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string | null): Promise<boolean>;
}

export function createPasswordHasher(options: { concurrency?: number; maxQueue?: number; cost?: number } = {}): PasswordHasher {
  const concurrency = options.concurrency ?? 2;
  const maxQueue = options.maxQueue ?? 32;
  const cost = options.cost ?? N;
  let running = 0;
  const waiting: Array<() => void> = [];

  async function limited<T>(work: () => Promise<T>): Promise<T> {
    if (running >= concurrency) {
      if (waiting.length >= maxQueue) throw new HashBusyError("服务器忙，请稍后再试");
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    running += 1;
    try {
      return await work();
    } finally {
      running -= 1;
      waiting.shift()?.();
    }
  }

  const params = (n: number) => ({ N: n, r: R, p: P, maxmem: MAX_MEMORY });
  /** 用户不存在时也算一次哈希，响应时间不暴露用户名存不存在 */
  let dummy: Promise<string> | null = null;

  async function hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await limited(() => scrypt(password, salt, KEY_LENGTH, params(cost)));
    return `scrypt$${cost}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
  }

  async function verify(password: string, stored: string | null): Promise<boolean> {
    if (!stored) {
      dummy ??= hash("dummy-password-for-timing");
      await verify(password, await dummy);
      return false;
    }
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const n = Number(parts[1]);
    const salt = Buffer.from(parts[4]!, "base64");
    const expected = Buffer.from(parts[5]!, "base64");
    const key = await limited(() => scrypt(password, salt, expected.length, params(n)));
    return key.length === expected.length && timingSafeEqual(key, expected);
  }

  return { hash, verify };
}
