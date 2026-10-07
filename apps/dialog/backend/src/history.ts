/** 估算 token：CJK 字符 ≈ 1 token，其余 ≈ 4 字符 / token（v1 口径，可替换为真正的 tokenizer） */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (/[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch)) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * 从最近往更早收集历史，直到估算 token 接近预算：
 * - 至少保留最近一条用户消息（即使它单独超预算）；
 * - 结果保证从 user 开始（首条为 assistant 则继续前移）；
 * - 截断只影响发送上下文，不影响存储。
 */
export function trimHistory(messages: HistoryMessage[], budget: number): HistoryMessage[] {
  const picked: HistoryMessage[] = [];
  let tokens = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]!;
    const cost = estimateTokens(message.content) + 4; // 每条消息的角色 / 结构开销
    if (picked.length > 0 && tokens + cost > budget) break;
    picked.unshift(message);
    tokens += cost;
  }
  if (!picked.some((m) => m.role === "user")) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]!.role === "user") {
        picked.unshift(messages[i]!);
        break;
      }
    }
  }
  while (picked.length > 0 && picked[0]!.role !== "user") picked.shift();
  return picked;
}
