import type { AiUsage, Conversation, Message, ReplySource, ReplyStep } from "@myoutside/contracts";

/** 数据库行（dialog__conversation） */
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

/** 数据库行（dialog__message） */
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
    activeChildId: row.active_child_id,
    createdAt: row.created_at,
  };
}
