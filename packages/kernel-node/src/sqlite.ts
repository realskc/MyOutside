import { DatabaseSync } from "node:sqlite";
import type { DbAdapter, ExecuteResult, SqlValue } from "@myoutside/kernel";

export interface NodeSqliteOptions {
  /** 数据库文件路径；":memory:" 表示内存库 */
  path: string;
}

function normalizeParams(params: SqlValue[]): Array<string | number | bigint | null | Uint8Array> {
  return params.map((value) => {
    if (typeof value === "boolean") return value ? 1 : 0;
    if (value === undefined) return null;
    return value;
  });
}

/**
 * 基于 node:sqlite 的存储适配器（零原生依赖，Node 24 / Electron 主进程通用）。
 * 平台无关的内核只通过 DbAdapter 接口与它交互。
 */
export function createNodeSqliteAdapter({ path }: NodeSqliteOptions): DbAdapter {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL");

  return {
    execute(sql, params = []): ExecuteResult {
      const result = db.prepare(sql).run(...normalizeParams(params));
      return {
        changes: Number(result.changes),
        lastInsertRowid: (result.lastInsertRowid ?? 0) as number | bigint,
      };
    },
    select<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): T[] {
      return db.prepare(sql).all(...normalizeParams(params)) as T[];
    },
    transaction<T>(fn: () => T): T {
      db.exec("BEGIN");
      try {
        const result = fn();
        db.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
}
