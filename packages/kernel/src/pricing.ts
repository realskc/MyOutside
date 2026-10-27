/**
 * DeepSeek 计费估算（D-0074）：价格取自官方「模型 & 价格」页（2026-10-27）。
 * - 模型按百万 tokens 计价，分缓存命中输入 / 缓存未命中输入 / 输出；
 * - 高峰时段（北京时间周一至周五 9:00–12:00、14:00–18:00）为下表价格，其余时段为一半；
 *   中国法定节假日全天为空闲时段，这里不识别节假日（会按高峰价略微高估）；
 * - 网页搜索 / 抓取按成功请求计费，各 5 元 / 千次。
 * 价格会变：每条用量记录在写入时按当时的价格算好花费，之后改价格不影响历史记录。
 */

interface ModelPrice {
  /** 元 / 百万 tokens（高峰时段） */
  cacheHit: number;
  cacheMiss: number;
  output: number;
}

const MODEL_PRICES: Record<string, ModelPrice> = {
  flash: { cacheHit: 0.04, cacheMiss: 2, output: 8 },
  pro: { cacheHit: 0.3, cacheMiss: 9, output: 27 },
};

/** 每次成功的搜索 / 抓取请求（元） */
export const WEB_REQUEST_PRICE = 0.005;

function priceOf(model: string | null | undefined): ModelPrice {
  return model && /pro/i.test(model) ? MODEL_PRICES.pro! : MODEL_PRICES.flash!;
}

/** 是否为高峰时段（按北京时间；不识别法定节假日） */
export function isPeak(timestamp: number): boolean {
  const beijing = new Date(timestamp + 8 * 3600_000);
  const day = beijing.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = beijing.getUTCHours() * 60 + beijing.getUTCMinutes();
  return (minutes >= 9 * 60 && minutes < 12 * 60) || (minutes >= 14 * 60 && minutes < 18 * 60);
}

export interface CostInput {
  kind: string;
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  cacheHitTokens?: number | null;
  createdAt: number;
}

/** 估算一条用量记录的花费（元）；没有用量数据的 AI 调用（例如流式中途被停止）记 0 */
export function estimateCost(record: CostInput): number {
  if (record.kind === "web.search" || record.kind === "web.fetch") return WEB_REQUEST_PRICE;
  if (record.kind !== "ai.chat") return 0;
  const price = priceOf(record.model);
  const factor = isPeak(record.createdAt) ? 1 : 0.5;
  const prompt = record.promptTokens ?? 0;
  const hit = Math.min(record.cacheHitTokens ?? 0, prompt);
  const miss = prompt - hit;
  const output = record.completionTokens ?? 0;
  return ((hit * price.cacheHit + miss * price.cacheMiss + output * price.output) / 1_000_000) * factor;
}
