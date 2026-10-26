import type { AiMessage } from "@myoutside/contracts";

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

/** 一条消息（或一轮回复）展开成发给模型的若干条消息，按整体参与截断 */
export interface HistoryTurn {
  role: "user" | "assistant";
  messages: AiMessage[];
}

/** 估算一组发给模型的消息的 token 数（含思考过程、工具调用与结果） */
export function estimateMessages(messages: AiMessage[]): number {
  let tokens = 0;
  for (const message of messages) {
    tokens += 4; // 每条消息的角色 / 结构开销
    if (message.content) tokens += estimateTokens(message.content);
    if (message.reasoning_content) tokens += estimateTokens(message.reasoning_content);
    for (const call of message.tool_calls ?? []) tokens += estimateTokens(call.function.name + call.function.arguments) + 4;
  }
  return tokens;
}

/**
 * 从最近往更早收集历史，直到估算 token 接近预算：
 * - 以「一条用户消息」或「一整轮回复（含其中的工具调用与结果）」为单位，不会把工具调用与结果拆开；
 * - 至少保留最近一条用户消息（即使它单独超预算）；
 * - 结果保证从 user 开始；
 * - 截断只影响发送上下文，不影响存储。
 */
export function trimTurns(turns: HistoryTurn[], budget: number): AiMessage[] {
  const picked: HistoryTurn[] = [];
  let tokens = 0;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i]!;
    const cost = estimateMessages(turn.messages);
    if (picked.length > 0 && tokens + cost > budget) break;
    picked.unshift(turn);
    tokens += cost;
  }
  if (!picked.some((turn) => turn.role === "user")) {
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      if (turns[i]!.role === "user") {
        picked.unshift(turns[i]!);
        break;
      }
    }
  }
  while (picked.length > 0 && picked[0]!.role !== "user") picked.shift();
  return picked.flatMap((turn) => turn.messages);
}

/** 纯文本历史的截断（兼容旧接口；每条消息一个单位） */
export function trimHistory(messages: HistoryMessage[], budget: number): HistoryMessage[] {
  const turns: HistoryTurn[] = messages.map((message) => ({ role: message.role, messages: [message] }));
  return trimTurns(turns, budget) as HistoryMessage[];
}
