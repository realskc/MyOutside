import type { AiMessage, AiToolCall, AiUsage, ReasoningEffort } from "@myoutside/contracts";

/**
 * 库运行所需的上下文：子应用后端的只读 API / 普通的异步函数的 ctx 都满足。
 * 库不依赖 Electron，也不依赖内核实现（D-0012）。
 */
export interface AgentContext {
  call(name: string, payload?: unknown): Promise<unknown>;
  emit(event: unknown): void;
  readonly signal: AbortSignal;
}

/** 交给模型的一项能力 */
export interface AgentTool {
  /** 给模型看的名字：字母、数字、下划线、连字符 */
  name: string;
  /** 模型靠它判断什么时候使用 */
  description: string;
  /** 参数格式（JSON Schema） */
  parameters: Record<string, unknown>;
  /** 执行；参数已解析为 JSON（未经格式校验，由被调用的 API 校验） */
  execute(args: Record<string, unknown>, ctx: AgentContext): Promise<unknown>;
  /** 结果怎么交给模型（默认 JSON） */
  toModel?(output: unknown, args: Record<string, unknown>): string;
  /** 给界面看的一句话，例如「搜索：DeepSeek 发布」 */
  summarize?(args: Record<string, unknown>): string;
  /** 交给模型的结果最多多少字符（默认 8000），超出截断 */
  maxChars?: number;
  /** 结果来自不可信来源（网页等）：交给模型时包上边界说明 */
  untrusted?: boolean;
}

/** 一轮里的一次工具调用 */
export interface ToolCallRecord {
  id: string;
  name: string;
  /** 模型给出的参数（原始字符串） */
  arguments: string;
  ok: boolean;
  /** 给界面看的一句话 */
  summary: string;
  /** 交给模型的结果文字（已截断、已包边界） */
  result: string;
  /** 工具的原始输出（成功时），供子应用整理来源等 */
  output?: unknown;
}

/** 工具循环的一轮：调用一次模型，并执行它要求的工具 */
export interface Round {
  index: number;
  reasoning: string | null;
  content: string;
  toolCalls: ToolCallRecord[];
  usage: AiUsage | null;
  model: string;
}

export type StopReason = "done" | "max_rounds" | "aborted" | "error";

export interface ToolLoopOptions {
  /** 完整的消息（含 system 与历史；历史中的 assistant 应带 reasoning_content） */
  messages: AiMessage[];
  tools: AgentTool[];
  reasoningEffort?: ReasoningEffort;
  model?: string;
  /** 流式：模型输出的增量经 ctx.emit 推送（平台 AI 的 ai_delta 事件） */
  stream?: boolean;
  /** 最多几轮（默认 8）；达到时最后一轮不再提供工具，让模型直接回答 */
  maxRounds?: number;
  /** 可重试的上游错误最多重试几次（默认 2） */
  retries?: number;
}

export interface ToolLoopResult {
  stopReason: StopReason;
  /** 最后一轮的回答（中断时为已有的部分） */
  content: string;
  reasoning: string | null;
  rounds: Round[];
  /** 本次新增的消息（assistant / tool），可用于下一次请求的历史 */
  messages: AiMessage[];
  /** 各轮用量之和 */
  usage: AiUsage;
  model: string;
  /** stopReason = error 时的错误 */
  error?: { code: string; message: string };
}

/** 工具循环推送的事件（模型输出的增量由平台 AI 推送：{ type: "ai_delta" }） */
export type LoopEvent =
  | { type: "round_start"; round: number }
  | { type: "tool_start"; round: number; callId: string; tool: string; summary: string }
  | { type: "tool_result"; round: number; callId: string; tool: string; ok: boolean; summary: string }
  | { type: "round_end"; round: number };

export type { AiMessage, AiToolCall, AiUsage };
