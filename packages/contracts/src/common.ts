import { z } from "zod";

/** 通用成功输出 */
export const OkOutput = z.object({ ok: z.literal(true) });
export type OkOutput = z.infer<typeof OkOutput>;
