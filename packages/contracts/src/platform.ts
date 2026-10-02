import { z } from "zod";

/** 平台内置 API 的输入约定：允许空对象或 undefined */
export const EmptyInput = z.union([z.undefined(), z.object({}).strict()]);

/** 平台内置 API 面 */
export interface PlatformApi {
  "platform.dataVersion": { input: Record<string, never>; output: number };
  "platform.listApps": { input: Record<string, never>; output: Array<{ id: string; name: string }> };
  "platform.settings.get": { input: { key: string }; output: { value: unknown } };
  "platform.settings.set": { input: { key: string; value: unknown }; output: { ok: true } };
}
