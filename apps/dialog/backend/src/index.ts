import { randomUUID } from "node:crypto";
import {
  AppendMessageInput,
  CreateConversationInput,
  DeleteConversationInput,
  EditAndSendInput,
  EditUserMessageInput,
  GenerateInput,
  GetPathInput,
  GetRequestInput,
  GetUsageInput,
  LabDeleteRunInput,
  LabGetRunInput,
  LabListRunsInput,
  LabRunInput,
  ListConversationsInput,
  RenameConversationInput,
  SaveLabRunInput,
  SaveReplyInput,
  SendMessageInput,
  SetReasoningEffortInput,
  SetSystemPromptInput,
  SetSearchNoticeInput,
  SetWebSearchInput,
  SwitchBranchInput,
} from "@myoutside/contracts";
import { definePlain, defineRead, defineTx, KernelError, type AppDb, type AppModule, type SqlValue } from "@myoutside/kernel";
import {
  buildRawRequest,
  buildSystemPrompt,
  estimateContextTokens,
  generateReply,
  isGenerating,
  loadAllMessages,
} from "./generate.js";
import {
  parseUsage,
  rowToConversation,
  rowToLabRun,
  rowToLabRunSummary,
  rowToMessage,
  type ConversationRow,
  type LabRunRow,
  type MessageRow,
} from "./mapping.js";

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

/** 实验室运行记录的标题：取请求体里最后一条有内容的用户消息 */
function labTitleFromRequest(body: Record<string, unknown>): string {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || typeof message !== "object") continue;
    const row = message as { role?: unknown; content?: unknown };
    if (row.role !== "user" || typeof row.content !== "string") continue;
    const text = row.content.replace(/\s+/g, " ").trim();
    if (text) return text.slice(0, TITLE_MAX_CHARS);
  }
  return "";
}

function getLabRunOrThrow(db: AppDb, runId: string): LabRunRow {
  const row = db.get<LabRunRow>("lab_run", { id: runId });
  if (!row) throw new KernelError("NOT_FOUND", `运行记录不存在：${runId}`);
  return row;
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
  owns: ["conversation", "message", "lab_run"],

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
            "web_search INTEGER NOT NULL DEFAULT 1", // 联网搜索开关，默认打开（DIALOG-0009）
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
            "steps TEXT", // JSON：回复过程中调用了工具的各轮
            "sources TEXT", // JSON：引用的来源
            "context_tokens INTEGER", // 生成时最后一次请求的输入 token 数
            "stopped INTEGER NOT NULL DEFAULT 0", // 生成被停止，内容是已生成的部分
            "error TEXT", // 生成被错误中断时的原因，内容是已生成的部分
            "search_notice TEXT", // 用户消息：联网搜索开关在这里变了（off / on），发给模型时跟一条 system 说明（DIALOG-0019）
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
      id: "0002_lab",
      up: (ctx) => {
        ctx.createTable(
          "lab_run",
          [
            "id TEXT PRIMARY KEY",
            "title TEXT NOT NULL DEFAULT ''",
            "source_conversation_id TEXT",
            "source_message_id TEXT",
            "request TEXT NOT NULL", // 原样请求体（JSON）
            "response TEXT", // 原样响应体；失败时是上游错误体
            "status TEXT NOT NULL", // ok | error | aborted
            "error TEXT",
            "model TEXT",
            "usage TEXT", // JSON：{ promptTokens, completionTokens, ... }
            "cost_yuan REAL",
            "duration_ms INTEGER",
            "created_at INTEGER NOT NULL",
          ].join(", "),
        );
        ctx.createIndex("lab_run_created", "lab_run", "created_at");
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
      const systemPrompt = buildSystemPrompt(conversation);
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

    /** 保存一条回复，挂在指定的用户消息下，并选中它（DIALOG-0012：已有回复时成为兄弟） */
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
        stopped: input.stopped ? 1 : 0,
        error: input.error ?? null,
        active_child_id: null,
        created_at: now,
      });
      ctx.db.update("message", { active_child_id: id }, { id: parent.id });
      ctx.db.update("conversation", { updated_at: now }, { id: conversation.id });
      return { messageId: id };
    }),

    /** 记下这条用户消息发出时联网搜索开关的变化（生成回复前由后端调用，DIALOG-0019） */
    setSearchNotice: defineTx(SetSearchNoticeInput, (ctx, input) => {
      const message = getMessageOrThrow(ctx.db, input.messageId);
      if (message.role !== "user") throw new KernelError("VALIDATION", "只有用户消息能记联网搜索的变化");
      ctx.db.update("message", { search_notice: input.notice }, { id: message.id });
      return { ok: true as const };
    }),

    setWebSearch: defineTx(SetWebSearchInput, (ctx, input) => {
      getConversationOrThrow(ctx.db, input.conversationId);
      ctx.db.update("conversation", { web_search: input.enabled ? 1 : 0 }, { id: input.conversationId });
      return { ok: true as const };
    }),

    /** 发送一条用户消息并生成回复（普通的异步函数，D-0063）：回复由后端保存，前端是否还在不影响结果 */
    send: definePlain(SendMessageInput, async (ctx, input) => {
      const { messageId } = (await ctx.call("dialog.appendMessage", {
        conversationId: input.conversationId,
        role: "user",
        content: input.content,
      })) as { messageId: string };
      return generateReply(ctx, input.conversationId, messageId);
    }),

    /** 为一条用户消息生成回复：重新生成（DIALOG-0012）、失败或中断后重试 */
    generate: definePlain(GenerateInput, (ctx, input) => generateReply(ctx, input.conversationId, input.parentId)),

    /** 编辑一条用户消息（产生新分叉）并生成回复 */
    editAndSend: definePlain(EditAndSendInput, async (ctx, input) => {
      const original = ctx.db.get<MessageRow>("message", { id: input.messageId });
      if (!original) throw new KernelError("NOT_FOUND", `消息不存在：${input.messageId}`);
      const { messageId } = (await ctx.call("dialog.editUserMessage", input)) as { messageId: string };
      return generateReply(ctx, original.conversation_id, messageId);
    }),

    // —— 实验室（DIALOG-0020） ——

    /** 导出一个用户消息对应的真实请求（只读；从对话导入实验室用） */
    getRequest: defineRead(GetRequestInput, (ctx, input) =>
      buildRawRequest(ctx.db, input.conversationId, input.messageId),
    ),

    /**
     * 实验室运行：把请求体原样交给平台 raw API，成功 / 失败都先存一条运行记录再返回。
     * 运行在后端进行，前端关掉也不丢记录；取消时存为 aborted。
     */
    labRun: definePlain(LabRunInput, async (ctx, input) => {
      const started = Date.now();
      let response: unknown = null;
      let status: "ok" | "error" | "aborted" = "ok";
      let error: string | null = null;
      let model: string | null = typeof input.body.model === "string" ? input.body.model : null;
      let usage: unknown = null;
      let costYuan: number | null = null;
      try {
        const result = (await ctx.call("platform.ai.chatRaw", { body: input.body })) as {
          body: Record<string, unknown>;
          usage: unknown;
          costYuan: number;
        };
        response = result.body;
        usage = result.usage ?? null;
        costYuan = result.costYuan;
        if (typeof result.body.model === "string") model = result.body.model;
      } catch (cause) {
        const detail = cause as { code?: string; message?: string; details?: { body?: unknown } };
        status = detail.code === "ABORTED" ? "aborted" : "error";
        error = detail.message ?? String(cause);
        response = detail.details?.body ?? null;
      }
      return ctx.call("dialog.saveLabRun", {
        request: input.body,
        response,
        status,
        error,
        model,
        usage,
        costYuan,
        durationMs: Date.now() - started,
        sourceConversationId: input.sourceConversationId ?? null,
        sourceMessageId: input.sourceMessageId ?? null,
      });
    }),

    /** 保存一次实验室运行（内部事务 API） */
    saveLabRun: defineTx(SaveLabRunInput, (ctx, input) => {
      const id = randomUUID();
      const now = Date.now();
      ctx.db.insert("lab_run", {
        id,
        title: labTitleFromRequest(input.request),
        source_conversation_id: input.sourceConversationId,
        source_message_id: input.sourceMessageId,
        request: JSON.stringify(input.request),
        response: input.response == null ? null : JSON.stringify(input.response),
        status: input.status,
        error: input.error,
        model: input.model,
        usage: input.usage ? JSON.stringify(input.usage) : null,
        cost_yuan: input.costYuan,
        duration_ms: input.durationMs,
        created_at: now,
      });
      return rowToLabRun(getLabRunOrThrow(ctx.db, id));
    }),

    listLabRuns: defineRead(LabListRunsInput, (ctx) =>
      ctx.db
        .all<LabRunRow>("lab_run", {}, { orderBy: "created_at DESC", limit: 200 })
        .map(rowToLabRunSummary),
    ),

    getLabRun: defineRead(LabGetRunInput, (ctx, input) => rowToLabRun(getLabRunOrThrow(ctx.db, input.runId))),

    deleteLabRun: defineTx(LabDeleteRunInput, (ctx, input) => {
      getLabRunOrThrow(ctx.db, input.runId);
      ctx.db.delete("lab_run", { id: input.runId });
      return { ok: true as const };
    }),
  },
};
