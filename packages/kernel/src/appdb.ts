import type { AppDb, DbAdapter, MigrationCtx, SqlValue, WhereValue } from "./types.js";

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ORDER_BY = /^[A-Za-z_][A-Za-z0-9_]*(\s+(ASC|DESC))?$/i;

function assertIdent(value: string, what: string): void {
  if (!IDENT.test(value)) throw new Error(`非法的${what}：${JSON.stringify(value)}`);
}

/** 逻辑表名 → 物理表名：`card`（app 为 vocab）→ `vocab__card` */
export function physicalTableName(appId: string, table: string): string {
  assertIdent(appId, "应用 id");
  assertIdent(table, "表名");
  return `${appId}__${table}`;
}

function isOperatorObject(value: WhereValue): value is Exclude<WhereValue, SqlValue> {
  return typeof value === "object" && value !== null && !(value instanceof Uint8Array);
}

function buildWhere(where: Record<string, WhereValue>): { sql: string; params: SqlValue[] } {
  const clauses: string[] = [];
  const params: SqlValue[] = [];
  for (const [key, value] of Object.entries(where)) {
    assertIdent(key, "列名");
    if (!isOperatorObject(value)) {
      clauses.push(`${key} = ?`);
      params.push(value);
      continue;
    }
    if (value.eq !== undefined) {
      clauses.push(`${key} = ?`);
      params.push(value.eq);
    }
    if (value.lt !== undefined) {
      clauses.push(`${key} < ?`);
      params.push(value.lt);
    }
    if (value.lte !== undefined) {
      clauses.push(`${key} <= ?`);
      params.push(value.lte);
    }
    if (value.gt !== undefined) {
      clauses.push(`${key} > ?`);
      params.push(value.gt);
    }
    if (value.gte !== undefined) {
      clauses.push(`${key} >= ?`);
      params.push(value.gte);
    }
    if (value.like !== undefined) {
      clauses.push(`${key} LIKE ?`);
      params.push(value.like);
    }
    if (value.in !== undefined) {
      if (value.in.length === 0) {
        clauses.push("1 = 0");
      } else {
        clauses.push(`${key} IN (${value.in.map(() => "?").join(", ")})`);
        params.push(...value.in);
      }
    }
  }
  if (clauses.length === 0) return { sql: "", params: [] };
  return { sql: " WHERE " + clauses.join(" AND "), params };
}

/** 创建以某个应用为作用域的数据访问助手；表名不能越出该应用（所有权由构造保证） */
export function createAppDb(adapter: DbAdapter, appId: string): AppDb {
  const table = (name: string) => physicalTableName(appId, name);

  return {
    insert(name, row) {
      const keys = Object.keys(row);
      if (keys.length === 0) throw new Error("insert：空行");
      keys.forEach((k) => assertIdent(k, "列名"));
      adapter.execute(
        `INSERT INTO ${table(name)} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
        keys.map((k) => row[k]!),
      );
    },
    update(name, patch, where) {
      const keys = Object.keys(patch);
      if (keys.length === 0) return 0;
      keys.forEach((k) => assertIdent(k, "列名"));
      const w = buildWhere(where);
      if (!w.sql) throw new Error("update：必须提供 where");
      return adapter.execute(
        `UPDATE ${table(name)} SET ${keys.map((k) => `${k} = ?`).join(", ")}${w.sql}`,
        [...keys.map((k) => patch[k]!), ...w.params],
      ).changes;
    },
    delete(name, where) {
      const w = buildWhere(where);
      if (!w.sql) throw new Error("delete：必须提供 where");
      return adapter.execute(`DELETE FROM ${table(name)}${w.sql}`, w.params).changes;
    },
    get(name, where) {
      const w = buildWhere(where);
      const sql = `SELECT * FROM ${table(name)}` + w.sql + " LIMIT 1";
      return adapter.select(sql, w.params)[0] as never;
    },
    all(name, where = {}, opts = {}) {
      const w = buildWhere(where);
      let sql = `SELECT * FROM ${table(name)}` + w.sql;
      if (opts.orderBy) {
        if (!ORDER_BY.test(opts.orderBy)) throw new Error(`非法的 orderBy：${opts.orderBy}`);
        sql += ` ORDER BY ${opts.orderBy}`;
      }
      if (opts.limit != null) {
        if (!Number.isInteger(opts.limit) || opts.limit < 1 || opts.limit > 1000) throw new Error("limit 越界");
        sql += ` LIMIT ${opts.limit}`;
        if (opts.offset != null) sql += ` OFFSET ${Math.max(0, Math.floor(opts.offset))}`;
      }
      return adapter.select(sql, w.params) as never;
    },
    count(name, where = {}) {
      const w = buildWhere(where);
      const row = adapter.select<{ c: number }>(`SELECT COUNT(*) AS c FROM ${table(name)}` + w.sql, w.params)[0];
      return row?.c ?? 0;
    },
  };
}

export function createMigrationCtx(adapter: DbAdapter, appId: string): MigrationCtx {
  return {
    createTable(name, columnsSql) {
      adapter.execute(`CREATE TABLE IF NOT EXISTS ${physicalTableName(appId, name)} (${columnsSql})`);
    },
    createIndex(indexName, tableName, columnsSql) {
      assertIdent(indexName, "索引名");
      adapter.execute(
        `CREATE INDEX IF NOT EXISTS ${appId}__${indexName} ON ${physicalTableName(appId, tableName)} (${columnsSql})`,
      );
    },
    exec(sql) {
      adapter.execute(sql);
    },
  };
}
