import { randomUUID } from "node:crypto";
import {
  AppendMessageInput,
  CreateConversationInput,
  DeleteConversationInput,
  EditAndSendInput,
  EditUserMessageInput,
  GenerateInput,
  GetPathInput,
  GetUsageInput,
  ListConversationsInput,
  RenameConversationInput,
  SaveReplyInput,
  SendMessageInput,
  SetReasoningEffortInput,
  SetSystemPromptInput,
  SetWebSearchInput,
  SwitchBranchInput,
} from "@myoutside/contracts";
import { defineAsync, defineRead, defineTx, KernelError, type AppDb, type AppModule, type SqlValue } from "@myoutside/kernel";
import {
  buildSystemPrompt,
  estimateContextTokens,
  generateReply,
  isGenerating,
  loadAllMessages,
} from "./generate.js";
import { parseUsage, rowToConversation, rowToMessage, type ConversationRow, type MessageRow } from "./mapping.js";

export { DEFAULT_SYSTEM_PROMPT } from "./generate.js";

/** 自动标题的最大字符数 */
const TITLE_MAX_CHARS = 24;

function getConversationOrThrow(db: AppDb, conversationId: string): ConversationRow {
  const row = db.get<ConversationRow>("conversation", { id: conversationId });
  if (!row) throw new KernelError("NOT_FOUND", `会话不存在：${conversationId}`);
  return row;
}

function getMessageOrThrow(db: AppDb, messageId: string): MessageRow {
  const row = db.get<MessageRow>("message", { id: messageId });
  if (!row) throw new KernelError("NOT_FOUND", `消息不存在：${messageId}`);
  return row;
}

function requireText(value: string, what: string): string {
  const text = value.trim();
  if (text === "") throw new KernelError("VALIDATION", `${what}不能为空`);
  return text;
}

function makeTitle(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX_CHARS);
}

function compareMessages(a: MessageRow, b: MessageRow): number {
  return a.created_at - b.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function siblingsOf(messages: MessageRow[], message: MessageRow): MessageRow[] {
  return messages.filter((m) => m.parent_id === message.parent_id).sort(compareMessages);
}

/** 会话内消息时间戳保持单调递增（同毫秒内多次写入时避免排序不稳定） */
function nextMessageTimestamp(messages: MessageRow[], now: number): number {
  let max = 0;
  for (const message of messages) {
    if (message.created_at > max) max = message.created_at;
  }
  return max >= now ? max + 1 : now;
}

/** 当前选中的路径：从选中的根消息沿 active_child 下降（指针缺失时兜底取最新子消息） */
function computeActivePath(messages: MessageRow[], activeFirstId: string | null): MessageRow[] {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const orderedChildren = (parentId: string | null) =>
    messages.filter((m) => m.parent_id === parentId).sort(compareMessages);

  let current = activeFirstId ? byId.get(activeFirstId) : undefined;
  if (!current || current.parent_id !== null) current = orderedChildren(null).at(-1);

  const path: MessageRow[] = [];
  while (current) {
    path.push(current);
    const picked = current.active_child_id ? byId.get(current.active_child_id) : undefined;
    current = picked && picked.parent_id === current.id ? picked : orderedChildren(current.id).at(-1);
  }
  return path;
}

export const dialogApp: AppModule = {
  id: "dialog",
  name: "对话",
  owns: ["conversation", "message"],

  migrations: [
    {
      id: "0001_init",
      up: (ctx) => {
        ctx.createTable(
          "conversation",
          [
            "id TEXT PRIMARY KEY",
            "title TEXT NOT NULL DEFAULT ''",
            "system_prompt TEXT",
            "reasoning_effort TEXT NOT NULL DEFAULT 'high'",
            "active_first_id TEXT",
            "created_at INTEGER NOT NULL",
            "updated_at INTEGER NOT NULL",
          ].join(", "),
        );
        ctx.createTable(
          "message",
          [
            "id TEXT PRIMARY KEY",
            "conversation_id TEXT NOT NULL",
            "parent_id TEXT",
            "role TEXT NOT NULL",
            "content TEXT NOT NULL",
            "reasoning TEXT",
            "model TEXT",
            "usage TEXT",
            "active_child_id TEXT",
            "created_at INTEGER NOT NULL",
          ].join(", "),
        );
        ctx.createIndex("conversation_updated", "conversation", "updated_at");
        ctx.createIndex("message_conversation_parent", "message", "conversation_id, parent_id");
        ctx.createIndex("message_conversation_created", "message", "conversation_id, created_at");
      },
    },
    {
      id: "0002_search_and_steps",
      up: (ctx) => {
        ctx.addColumn("conversation", "web_search INTEGER NOT NULL DEFAULT 1"); // 联网搜索开关，默认打开（D-0055）
        ctx.addColumn("message", "steps TEXT"); // JSON：回复过程中调用了工具的各轮
        ctx.addColumn("message", "sources TEXT"); // JSON：引用的来源
        ctx.addColumn("message", "context_tokens INTEGER"); // 生成时最后一次请求的输入 token 数
      },
    },
  ],

  api: {
    createConversation: defineTx(CreateConversationInput, (ctx, input) => {
      const now = Date.now();
      const id = randomUUID();
      ctx.db.insert("conversation", {
        id,
        title: input.title?.trim() ?? "",
        system_prompt: input.systemPrompt?.trim() || null,
        reasoning_effort: input.reasoningEffort ?? "high",
        web_search: input.webSearch === false ? 0 : 1,
        active_first_id: null,
        created_at: now,
        updated_at: now,
      });
      return { conversationId: id };
    }),

    appendMessage: defineTx(AppendMessageInput, (ctx, input) => {
      const conversation = getConversationOrThrow(ctx.db, input.conversationId);
      const messages = loadAllMessages(ctx.db, conversation.id);
      const path = computeActivePath(messages, conversation.active_first_id);
      const leaf = path.at(-1) ?? null;

      if (input.role === "user" && leaf?.role === "user") {
        throw new KernelError("PRECONDITION", "上一条消息尚未得到回复");
      }
      if (input.role === "assistant" && (!leaf || leaf.role !== "user")) {
        throw new KernelError("PRECONDITION", "助手消息必须跟在用户消息之后");
      }

      const content = requireText(input.content, "消息内容");
      const now = nextMessageTimestamp(messages, Date.now());
      const id = randomUUID();
      ctx.db.insert("message", {
        id,
        conversation_id: conversation.id,
        parent_id: leaf?.id ?? null,
        role: input.role,
        content,
        reasoning: input.reasoning ?? null,
        model: input.model ?? null,
        usage: input.usage ? JSON.stringify(input.usage) : null,
        active_child_id: null,
        created_at: now,
      });

      if (leaf) ctx.db.update("message", { active_child_id: id }, { id: leaf.id });
      else ctx.db.update("conversation", { active_first_id: id }, { id: conversation.id });

      const patch: Record<string, SqlValue> = { updated_at: now };
      if (input.role === "user" && conversation.title.trim() === "") {
        patch.title = makeTitle(content);
      }
      ctx.db.update("conversation", patch, { id: conversation.id });
      return { messageId: id };
    }),

    editUserMessage: defineTx(EditUserMessageInput, (ctx, input) => {
      const original = getMessageOrThrow(ctx.db, input.messageId);
      if (original.role !== "user") {
        throw new KernelError("PRECONDITION", "只能编辑用户消息");
      }
      const content = requireText(input.content, "消息内容");
      const messages = loadAllMessages(ctx.db, original.conversation_id);
      const now = nextMessageTimestamp(messages, Date.now());
      const id = randomUUID();
      ctx.db.insert("message", {
        id,
        conversation_id: original.conversation_id,
        parent_id: original.parent_id,
        role: "user",
        content,
        reasoning: null,
        model: null,
        usage: null,
        active_child_id: null,
        created_at: now,
      });
      if (original.parent_id) {
        ctx.db.update("message", { active_child_id: id }, { id: original.parent_id });
      } else {
        ctx.db.update("conversation", { active_first_id: id }, { id: original.conversation_id });
      }
      ctx.db.update("conversation", { updated_at: now }, { id: original.conversation_id });
      return { messageId: id };
    }),

    switchBranch: defineTx(SwitchBranchInput, (ctx, input) => {
      const conversation = getConversationOrThrow(ctx.db, input.conversationId);
      const child = getMessageOrThrow(ctx.db, input.childId);
      if (child.conversation_id !== conversation.id) {
        throw new KernelError("VALIDATION", "消息不属于该会话");
      }
      if ((child.parent_id ?? null) !== input.parentId) {
        throw new KernelError("VALIDATION", "目标消息不是该位置的分叉");
      }
      if (input.parentId === null) {
        ctx.db.update("conversation", { active_first_id: child.id }, { id: conversation.id });
      } else {
        const parent = getMessageOrThrow(ctx.db, input.parentId);
        if (parent.conversation_id !== conversation.id) {
          throw new KernelError("VALIDATION", "消息不属于该会话");
        }
        ctx.db.update("message", { active_child_id: child.id }, { id: parent.id });
      }
      return { ok: true as const };
    }),

    renameConversation: defineTx(RenameConversationInput, (ctx, input) => {
      getConversationOrThrow(ctx.db, input.conversationId);
      ctx.db.update("conversation", { title: requireText(input.title, "标题") }, { id: input.conversationId });
      return { ok: true as const };
    }),

    setSystemPrompt: defineTx(SetSystemPromptInput, (ctx, input) => {
      getConversationOrThrow(ctx.db, input.conversationId);
      ctx.db.update(
        "conversation",
        { system_prompt: input.systemPrompt?.trim() || null },
        { id: input.conversationId },
      );
      return { ok: true as const };
    }),

    setReasoningEffort: defineTx(SetReasoningEffortInput, (ctx, input) => {
      getConversationOrThrow(ctx.db, input.conversationId);
      ctx.db.update("conversation", { reasoning_effort: input.effort }, { id: input.conversationId });
      return { ok: true as const };
    }),

    deleteConversation: defineTx(DeleteConversationInput, (ctx, input) => {
      getConversationOrThrow(ctx.db, input.conversationId);
      ctx.db.delete("message", { conversation_id: input.conversationId });
      ctx.db.delete("conversation", { id: input.conversationId });
      return { ok: true as const };
    }),

    listConversations: defineRead(ListConversationsInput, (ctx) => {
      const rows = ctx.db.all<ConversationRow>("conversation", {}, { orderBy: "updated_at DESC" });
      return rows.map(rowToConversation);
    }),

    getPath: defineRead(GetPathInput, (ctx, input) => {
      const conversation = getConversationOrThrow(ctx.db, input.conversationId);
      const all = loadAllMessages(ctx.db, conversation.id);
      const path = computeActivePath(all, conversation.active_first_id);
      const limit = input.limit ?? 100;
      const sliced = path.length <= limit ? path : path.slice(path.length - limit);
      const messages = sliced.map((message) => {
        const siblings = siblingsOf(all, message);
        const index = siblings.findIndex((m) => m.id === message.id);
        return {
          ...rowToMessage(message),
          siblingCount: siblings.length,
          siblingIndex: index + 1,
          siblingIds: siblings.map((m) => m.id),
        };
      });
      const systemPrompt = buildSystemPrompt(conversation, conversation.web_search !== 0);
      return {
        messages,
        hasMore: path.length > limit,
        generating: isGenerating(conversation.id),
        contextTokens: estimateContextTokens(path, systemPrompt),
      };
    }),

    /** 会话累计用量：汇总所有分叉中带 usage 的消息 */
    getUsage: defineRead(GetUsageInput, (ctx, input) => {
      const conversation = getConversationOrThrow(ctx.db, input.conversationId);
      const messages = loadAllMessages(ctx.db, conversation.id);
      const summary = { replies: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, reasoningTokens: 0 };
      for (const message of messages) {
        const usage = parseUsage(message.usage);
        if (!usage) continue;
        summary.replies += 1;
        summary.promptTokens += usage.promptTokens;
        summary.completionTokens += usage.completionTokens;
        summary.totalTokens += usage.totalTokens;
        summary.reasoningTokens += usage.reasoningTokens ?? 0;
      }
      return summary;
    }),

    /** 保存一条回复，挂在指定的用户消息下，并选中它（D-0066：已有回复时成为兄弟） */
    saveReply: defineTx(SaveReplyInput, (ctx, input) => {
      const conversation = getConversationOrThrow(ctx.db, input.conversationId);
      const parent = getMessageOrThrow(ctx.db, input.parentId);
      if (parent.conversation_id !== conversation.id || parent.role !== "user") {
        throw new KernelError("CONFLICT", "回复要挂的用户消息已不存在或不属于这个会话");
      }
      const messages = loadAllMessages(ctx.db, conversation.id);
      const now = nextMessageTimestamp(messages, Date.now());
      const id = randomUUID();
      ctx.db.insert("message", {
        id,
        conversation_id: conversation.id,
        parent_id: parent.id,
        role: "assistant",
        content: input.content,
        reasoning: input.reasoning,
        model: input.model,
        usage: input.usage ? JSON.stringify(input.usage) : null,
        steps: input.steps ? JSON.stringify(input.steps) : null,
        sources: input.sources ? JSON.stringify(input.sources) : null,
        context_tokens: input.contextTokens,
        active_child_id: null,
        created_at: now,
      });
      ctx.db.update("message", { active_child_id: id }, { id: parent.id });
      ctx.db.update("conversation", { updated_at: now }, { id: conversation.id });
      return { messageId: id };
    }),

    setWebSearch: defineTx(SetWebSearchInput, (ctx, input) => {
      getConversationOrThrow(ctx.db, input.conversationId);
      ctx.db.update("conversation", { web_search: input.enabled ? 1 : 0 }, { id: input.conversationId });
      return { ok: true as const };
    }),

    /** 发送一条用户消息并生成回复（普通的异步函数，D-0063）：回复由后端保存，前端是否还在不影响结果 */
    send: defineAsync(SendMessageInput, async (ctx, input) => {
      const { messageId } = (await ctx.call("dialog.appendMessage", {
        conversationId: input.conversationId,
        role: "user",
        content: input.content,
      })) as { messageId: string };
      return generateReply(ctx, input.conversationId, messageId);
    }),

    /** 为一条用户消息生成回复：重新生成（D-0066）、失败或中断后重试 */
    generate: defineAsync(GenerateInput, (ctx, input) => generateReply(ctx, input.conversationId, input.parentId)),

    /** 编辑一条用户消息（产生新分叉）并生成回复 */
    editAndSend: defineAsync(EditAndSendInput, async (ctx, input) => {
      const original = ctx.db.get<MessageRow>("message", { id: input.messageId });
      if (!original) throw new KernelError("NOT_FOUND", `消息不存在：${input.messageId}`);
      const { messageId } = (await ctx.call("dialog.editUserMessage", input)) as { messageId: string };
      return generateReply(ctx, original.conversation_id, messageId);
    }),
  },
};
