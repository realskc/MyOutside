import type { ZodType } from "zod";

export type SqlValue = string | number | bigint | boolean | null | Uint8Array;

/** where 条件值：标量（相等）或操作符对象 */
export type WhereValue =
  | SqlValue
  | {
      eq?: SqlValue;
      lt?: number;
      lte?: number;
      gt?: number;
      gte?: number;
      like?: string;
      in?: SqlValue[];
    };

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
  update(table: string, patch: Record<string, SqlValue>, where: Record<string, WhereValue>): number;
  delete(table: string, where: Record<string, WhereValue>): number;
  get<T = Record<string, SqlValue>>(table: string, where: Record<string, WhereValue>): T | undefined;
  all<T = Record<string, SqlValue>>(
    table: string,
    where?: Record<string, WhereValue>,
    opts?: { orderBy?: string; limit?: number; offset?: number },
  ): T[];
  count(table: string, where?: Record<string, WhereValue>): number;
}

export interface MigrationCtx {
  createTable(table: string, columnsSql: string): void;
  createIndex(indexName: string, table: string, columnsSql: string): void;
  /** 给本应用已有的表加一列（表名自动加前缀），例如 addColumn("message", "steps TEXT") */
  addColumn(table: string, columnSql: string): void;
  /** 迁移内写入数据（表名自动加前缀；种子 / 参考数据用） */
  insert(table: string, row: Record<string, SqlValue>): void;
  /** 逃生口：原样执行 SQL（不自动加表前缀），谨慎使用 */
  exec(sql: string): void;
}

export interface Migration {
  id: string;
  up(ctx: MigrationCtx): void;
}

/** 一次调用的运行期附带信息：进度事件的出口与取消信号（沿嵌套调用向下传递） */
export interface RunContext {
  /** 直接调用方：子应用 id、"shell"，或 undefined（平台内部）。平台 API 用它按调用者计量 */
  readonly caller: string | undefined;
  /** 把事件推送给发起这次调用的一方；没有推送通道时为空操作 */
  emit(event: unknown): void;
  /** 发起方取消这次调用时触发 */
  readonly signal: AbortSignal;
}

export interface TxContext {
  readonly appId: string;
  readonly db: AppDb;
  /** 事务内调用其他应用的事务 API（同步、纯数据，与本次写入一起成败） */
  call(name: string, payload?: unknown): unknown;
}

export interface ReadContext extends RunContext {
  readonly appId: string;
  /** 只读句柄：写入方法会抛出 FORBIDDEN */
  readonly db: AppDb;
  /** 异步调用只读 API */
  call(name: string, payload?: unknown): Promise<unknown>;
}

export interface AsyncContext extends RunContext {
  readonly appId: string;
  /** 只读句柄：写数据只能通过调用本子应用的事务 API */
  readonly db: AppDb;
  /** 调用只读 API、本子应用的事务 API（各自是一个独立的短事务）或本子应用的异步函数 */
  call(name: string, payload?: unknown): Promise<unknown>;
}

export type TxHandler = (ctx: TxContext, input: any) => unknown;
export type ReadHandler = (ctx: ReadContext, input: any) => unknown | Promise<unknown>;
export type AsyncHandler = (ctx: AsyncContext, input: any) => Promise<unknown>;

/** 可见性：公开 API 其他子应用可调用（还需在其清单 uses 里声明）；内部 API 只有本子应用能调用 */
export type ApiVisibility = "public" | "internal";

export type ApiDefinition =
  | { kind: "read"; input: ZodType<any>; handler: ReadHandler; visibility: ApiVisibility }
  | { kind: "tx"; input: ZodType<any>; handler: TxHandler; visibility: ApiVisibility }
  | { kind: "async"; input: ZodType<any>; handler: AsyncHandler; visibility: "internal" };

export interface AppModule {
  id: string;
  name: string;
  /** 软所有权声明：本应用拥有的逻辑表名（例如 ["card"]） */
  owns?: string[];
  migrations?: Migration[];
  /** 对外函数：短名（如 "addCard"）→ 定义 */
  api: Record<string, ApiDefinition>;
}

/** 子应用清单（D-0056）：描述子应用并声明其权限；与代码分开存放 */
export interface AppManifest {
  id: string;
  name: string;
  protocolVersion: number;
  ui?: string;
  backend?: string;
  owns?: string[];
  /** 会调用的其他子应用 / 平台的 API 全名 */
  uses?: string[];
}

export interface KernelRequest {
  call: string;
  payload?: unknown;
}

/** 发起调用的一方：子应用 id、"shell"（外壳，平台自身）；不传 = 平台内部（受信任） */
export interface HandleOptions {
  caller?: string;
  emit?: (event: unknown) => void;
  signal?: AbortSignal;
}

export interface KernelErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export type KernelResponse =
  | { ok: true; result: unknown; dataVersion: number }
  | { ok: false; error: KernelErrorPayload; dataVersion: number };
