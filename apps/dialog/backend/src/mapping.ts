import type { AiUsage, Conversation, Message } from "@myoutside/contracts";

/** 数据库行（dialog__conversation） */
export interface ConversationRow {
  id: string;
  title: string;
  system_prompt: string | null;
  reasoning_effort: string;
  active_first_id: string | null;
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
  active_child_id: string | null;
  created_at: number;
}

export function parseUsage(raw: string | null): AiUsage | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AiUsage;
  } catch {
    return null;
  }
}

export function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    systemPrompt: row.system_prompt,
    reasoningEffort: row.reasoning_effort as Conversation["reasoningEffort"],
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
    activeChildId: row.active_child_id,
    createdAt: row.created_at,
  };
}
