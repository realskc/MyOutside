import type { ZodType } from "zod";
import type { ApiDefinition, ApiVisibility, PlainContext, ReadContext, TxContext } from "./types.js";

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
 * 定义一个普通 API（D-0063、D-0086）：
 * 可以等外部；写数据只能通过调用本子应用的事务 API，整体不保证原子；没有只读、原子这类特殊保证。
 * 也可以公开：公开的普通 API 不管别人怎么调都得防住并发；契约里要写清进度事件的格式、
 * 同时被调用多次时怎么样、中途失败或取消后本应用这边留下什么。
 */
export function definePlain<T>(
  input: ZodType<T>,
  handler: (ctx: PlainContext, input: T) => Promise<unknown>,
  options: ApiOptions = {},
): ApiDefinition {
  return {
    kind: "plain",
    input: input as ZodType<any>,
    handler: handler as (ctx: PlainContext, input: any) => Promise<unknown>,
    visibility: options.visibility ?? "internal",
  };
}
