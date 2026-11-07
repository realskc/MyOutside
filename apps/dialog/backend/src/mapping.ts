import type { AiUsage, Conversation, LabRun, LabRunSummary, Message, ReplySource, ReplyStep } from "@myoutside/contracts";

/** 数据库行（app_dialog__conversation） */
export interface ConversationRow {
  id: string;
  title: string;
  system_prompt: string | null;
  reasoning_effort: string;
  active_first_id: string | null;
  web_search: number;
  created_at: number;
  updated_at: number;
}

/** 数据库行（app_dialog__lab_run）：实验室的一次运行（DIALOG-0020） */
export interface LabRunRow {
  id: string;
  title: string;
  source_conversation_id: string | null;
  source_message_id: string | null;
  request: string;
  response: string | null;
  status: string;
  error: string | null;
  model: string | null;
  usage: string | null;
  cost_yuan: number | null;
  duration_ms: number | null;
  created_at: number;
}

/** 数据库行（app_dialog__message） */
export interface MessageRow {
  id: string;
  conversation_id: string;
  parent_id: string | null;
  role: string;
  content: string;
  reasoning: string | null;
  model: string | null;
  usage: string | null;
  steps: string | null;
  sources: string | null;
  context_tokens: number | null;
  stopped: number;
  error: string | null;
  search_notice: string | null;
  active_child_id: string | null;
  created_at: number;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function parseUsage(raw: string | null): AiUsage | null {
  return parseJson<AiUsage>(raw);
}

export function parseSteps(raw: string | null): ReplyStep[] | null {
  return parseJson<ReplyStep[]>(raw);
}

export function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    systemPrompt: row.system_prompt,
    reasoningEffort: row.reasoning_effort as Conversation["reasoningEffort"],
    webSearch: row.web_search !== 0,
    activeFirstId: row.active_first_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    parentId: row.parent_id,
    role: row.role as Message["role"],
    content: row.content,
    reasoning: row.reasoning,
    model: row.model,
    usage: parseUsage(row.usage),
    steps: parseSteps(row.steps),
    sources: parseJson<ReplySource[]>(row.sources),
    contextTokens: row.context_tokens,
    stopped: row.stopped === 1,
    error: row.error,
    searchNotice: row.search_notice === "off" || row.search_notice === "on" ? row.search_notice : null,
    activeChildId: row.active_child_id,
    createdAt: row.created_at,
  };
}

export function rowToLabRun(row: LabRunRow): LabRun {
  return {
    id: row.id,
    title: row.title,
    sourceConversationId: row.source_conversation_id,
    sourceMessageId: row.source_message_id,
    request: parseJson<Record<string, unknown>>(row.request) ?? {},
    response: parseJson<unknown>(row.response),
    status: row.status as LabRun["status"],
    error: row.error,
    model: row.model,
    usage: parseUsage(row.usage),
    costYuan: row.cost_yuan,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

export function rowToLabRunSummary(row: LabRunRow): LabRunSummary {
  const run = rowToLabRun(row);
  return {
    id: run.id,
    title: run.title,
    status: run.status,
    model: run.model,
    usage: run.usage,
    costYuan: run.costYuan,
    durationMs: run.durationMs,
    createdAt: run.createdAt,
  };
}
