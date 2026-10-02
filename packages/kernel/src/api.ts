import type { ZodType } from "zod";
import type { ApiDefinition, ReadContext, TxContext } from "./types.js";

/** 定义一个事务函数（写）：同步、纯数据 */
export function defineTx<T>(
  input: ZodType<T>,
  handler: (ctx: TxContext, input: T) => unknown,
): ApiDefinition {
  return {
    kind: "tx",
    input: input as ZodType<any>,
    handler: handler as (ctx: TxContext, input: any) => unknown,
  };
}

/** 定义一个读函数：可异步，不允许写 */
export function defineRead<T>(
  input: ZodType<T>,
  handler: (ctx: ReadContext, input: T) => unknown | Promise<unknown>,
): ApiDefinition {
  return {
    kind: "read",
    input: input as ZodType<any>,
    handler: handler as (ctx: ReadContext, input: any) => unknown | Promise<unknown>,
  };
}
