import type { ZodType } from "zod";

export type SqlValue = string | number | bigint | boolean | null | Uint8Array;

export interface ExecuteResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/** 平台无关的存储适配器接口（Node / 浏览器各有一套实现） */
export interface DbAdapter {
  execute(sql: string, params?: SqlValue[]): ExecuteResult;
  select<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): T[];
  /** 同步事务：全成功或全回滚；不支持嵌套。 */
  transaction<T>(fn: () => T): T;
  close(): void;
}

/** 以应用为作用域的数据访问助手（表名自动加 `appId__` 前缀） */
export interface AppDb {
  insert(table: string, row: Record<string, SqlValue>): void;
  update(table: string, patch: Record<string, SqlValue>, where: Record<string, SqlValue>): number;
  delete(table: string, where: Record<string, SqlValue>): number;
  get<T = Record<string, SqlValue>>(table: string, where: Record<string, SqlValue>): T | undefined;
  all<T = Record<string, SqlValue>>(
    table: string,
    where?: Record<string, SqlValue>,
    opts?: { orderBy?: string; limit?: number; offset?: number },
  ): T[];
  count(table: string, where?: Record<string, SqlValue>): number;
}

export interface MigrationCtx {
  createTable(table: string, columnsSql: string): void;
  createIndex(indexName: string, table: string, columnsSql: string): void;
  /** 逃生口：原样执行 SQL（不自动加表前缀），谨慎使用 */
  exec(sql: string): void;
}

export interface Migration {
  id: string;
  up(ctx: MigrationCtx): void;
}

export interface TxContext {
  readonly appId: string;
  readonly db: AppDb;
  /** 事务内调用其他应用的事务函数（同步、纯数据，与本次写入同生共死） */
  call(name: string, payload?: unknown): unknown;
}

export interface ReadContext {
  readonly appId: string;
  readonly db: AppDb;
  /** 异步调用其他应用的读函数 */
  call(name: string, payload?: unknown): Promise<unknown>;
}

export type TxHandler = (ctx: TxContext, input: any) => unknown;
export type ReadHandler = (ctx: ReadContext, input: any) => unknown | Promise<unknown>;

export type ApiDefinition =
  | { kind: "read"; input: ZodType<any>; handler: ReadHandler }
  | { kind: "tx"; input: ZodType<any>; handler: TxHandler };

export interface AppModule {
  id: string;
  name: string;
  /** 软所有权声明：本应用拥有的逻辑表名（例如 ["card"]） */
  owns?: string[];
  migrations?: Migration[];
  /** 对外函数：短名（如 "addCard"）→ 定义 */
  api: Record<string, ApiDefinition>;
}

export interface KernelRequest {
  call: string;
  payload?: unknown;
}

export interface KernelErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export type KernelResponse =
  | { ok: true; result: unknown; dataVersion: number }
  | { ok: false; error: KernelErrorPayload; dataVersion: number };
