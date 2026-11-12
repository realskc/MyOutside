import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * 平台库（docs/future/web-version.md §2）：账号、登录会话、一次性设置链接。
 * 和每个用户自己的库（D-0091）分开：这里只有平台的账号信息，没有任何子应用的数据。
 * 令牌只存哈希：库被偷了也拿不到能用的登录状态和设置链接。
 */

/** 用户名：1–32 个字母、数字或 `_` `.` `-`，不区分大小写（统一存小写） */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,31}$/;
export const MAX_USERNAME_LENGTH = 32;

export function normalizeUsername(input: string): string | null {
  if (input.length > MAX_USERNAME_LENGTH) return null;
  const name = input.trim().toLowerCase();
  return USERNAME_PATTERN.test(name) ? name : null;
}

/** 用户 id 是 UUID：也用作数据目录名，所以严格校验，防止路径穿越 */
export const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const SETUP_TTL_MS = 24 * 3600 * 1000;

export interface User {
  id: string;
  username: string;
  passwordHash: string | null;
  isAdmin: boolean;
}

export interface Session {
  userId: string;
  username: string;
  isAdmin: boolean;
  expiresAt: number;
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

export function openAccounts(path: string, now: () => number = Date.now) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA busy_timeout = 5000");
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS session_user ON session(user_id);
    CREATE TABLE IF NOT EXISTS setup_token (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    );
  `);

  type UserRow = { id: string; username: string; password_hash: string | null; is_admin: number };
  const toUser = (row: UserRow): User => ({
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    isAdmin: row.is_admin === 1,
  });

  return {
    createUser(username: string, options: { admin?: boolean } = {}): User {
      const name = normalizeUsername(username);
      if (!name) throw new Error("用户名只能是 1–32 个字母、数字或 _ . -，并以字母或数字开头");
      if (db.prepare("SELECT 1 FROM user WHERE username = ?").get(name)) throw new Error(`用户名已存在：${name}`);
      const id = randomUUID();
      db.prepare("INSERT INTO user (id, username, is_admin, created_at) VALUES (?, ?, ?, ?)").run(id, name, options.admin ? 1 : 0, now());
      return { id, username: name, passwordHash: null, isAdmin: options.admin === true };
    },

    findUser(username: string): User | null {
      const name = normalizeUsername(username);
      if (!name) return null;
      const row = db.prepare("SELECT id, username, password_hash, is_admin FROM user WHERE username = ?").get(name) as UserRow | undefined;
      return row ? toUser(row) : null;
    },

    setPassword(userId: string, passwordHash: string): void {
      db.prepare("UPDATE user SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
      // 改了密码：别处的登录状态全部作废
      db.prepare("DELETE FROM session WHERE user_id = ?").run(userId);
    },

    /** 一次性设置链接的令牌（设密码 / 重设密码）：24 小时过期，用一次就作废；同一用户之前的链接作废 */
    createSetupToken(userId: string): string {
      const token = newToken();
      db.prepare("DELETE FROM setup_token WHERE user_id = ?").run(userId);
      db.prepare("INSERT INTO setup_token (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(tokenHash(token), userId, now() + SETUP_TTL_MS);
      return token;
    },

    /** 设置链接是否有效（不用掉它）：先检查，再算密码哈希，无效的链接不白算 */
    peekSetupToken(token: string): string | null {
      const row = db
        .prepare("SELECT user_id, expires_at, used_at FROM setup_token WHERE token_hash = ?")
        .get(tokenHash(token)) as { user_id: string; expires_at: number; used_at: number | null } | undefined;
      return row && row.used_at === null && row.expires_at > now() ? row.user_id : null;
    },

    /** 用掉设置链接：有效时返回用户 id；无效、过期、用过的返回 null */
    consumeSetupToken(token: string): string | null {
      const row = db
        .prepare("SELECT user_id, expires_at, used_at FROM setup_token WHERE token_hash = ?")
        .get(tokenHash(token)) as { user_id: string; expires_at: number; used_at: number | null } | undefined;
      if (!row || row.used_at !== null || row.expires_at <= now()) return null;
      const changed = db.prepare("UPDATE setup_token SET used_at = ? WHERE token_hash = ? AND used_at IS NULL").run(now(), tokenHash(token));
      return Number(changed.changes) === 1 ? row.user_id : null;
    },

    createSession(userId: string): { token: string; expiresAt: number } {
      const token = newToken();
      const expiresAt = now() + SESSION_TTL_MS;
      db.prepare("INSERT INTO session (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(tokenHash(token), userId, now(), expiresAt);
      return { token, expiresAt };
    },

    getSession(token: string): Session | null {
      if (!token || token.length > 128) return null;
      const row = db
        .prepare(
          "SELECT s.user_id, s.expires_at, u.username, u.is_admin FROM session s JOIN user u ON u.id = s.user_id WHERE s.token_hash = ?",
        )
        .get(tokenHash(token)) as { user_id: string; expires_at: number; username: string; is_admin: number } | undefined;
      if (!row) return null;
      if (row.expires_at <= now()) {
        db.prepare("DELETE FROM session WHERE token_hash = ?").run(tokenHash(token));
        return null;
      }
      return { userId: row.user_id, username: row.username, isAdmin: row.is_admin === 1, expiresAt: row.expires_at };
    },

    deleteSession(token: string): void {
      db.prepare("DELETE FROM session WHERE token_hash = ?").run(tokenHash(token));
    },

    /** 清掉过期的会话和设置链接 */
    sweep(): void {
      db.prepare("DELETE FROM session WHERE expires_at <= ?").run(now());
      db.prepare("DELETE FROM setup_token WHERE expires_at <= ? OR used_at IS NOT NULL").run(now());
    },

    close(): void {
      db.close();
    },
  };
}

export type Accounts = ReturnType<typeof openAccounts>;
