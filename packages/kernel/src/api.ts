import type { ZodType } from "zod";
import type { ApiDefinition, ApiVisibility, AsyncContext, ReadContext, TxContext } from "./types.js";

export interface ApiOptions {
  /** 默认内部 API；具备完整功能或契约整齐的函数推荐公开（D-0058） */
  visibility?: ApiVisibility;
}

/** 定义一个事务 API：同步、纯数据，在一个事务里执行 */
export function defineTx<T>(
  input: ZodType<T>,
  handler: (ctx: TxContext, input: T) => unknown,
  options: ApiOptions = {},
): ApiDefinition {
  return {
    kind: "tx",
    input: input as ZodType<any>,
    handler: handler as (ctx: TxContext, input: any) => unknown,
    visibility: options.visibility ?? "internal",
  };
}

/** 定义一个只读 API：可以异步，不能写数据 */
export function defineRead<T>(
  input: ZodType<T>,
  handler: (ctx: ReadContext, input: T) => unknown | Promise<unknown>,
  options: ApiOptions = {},
): ApiDefinition {
  return {
    kind: "read",
    input: input as ZodType<any>,
    handler: handler as (ctx: ReadContext, input: any) => unknown | Promise<unknown>,
    visibility: options.visibility ?? "internal",
  };
}

/**
 * 定义一个普通的异步函数（只能是内部 API，D-0063）：
 * 可以等外部；写数据只能通过调用本子应用的事务 API，整体不保证原子。
 */
export function defineAsync<T>(input: ZodType<T>, handler: (ctx: AsyncContext, input: T) => Promise<unknown>): ApiDefinition {
  return {
    kind: "async",
    input: input as ZodType<any>,
    handler: handler as (ctx: AsyncContext, input: any) => Promise<unknown>,
    visibility: "internal",
  };
}
