import { z } from "zod";
import { OkOutput } from "./common.js";
import { AiUsageSchema, ReasoningEffort } from "./platform.js";

/** 消息角色（system 由会话的 system_prompt 承载，不落消息） */
export const DialogRole = z.enum(["user", "assistant"]);
export type DialogRole = z.infer<typeof DialogRole>;

export const ConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  systemPrompt: z.string().nullable(),
  reasoningEffort: ReasoningEffort,
  /** 联网搜索开关（DIALOG-0009）：打开时把搜索 / 抓取工具交给模型 */
  webSearch: z.boolean(),
  activeFirstId: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

/** 一次回复中的一次工具调用（搜索、抓取……） */
export const ReplyToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.string(),
  ok: z.boolean(),
  /** 给界面看的一句话，例如「搜索：DeepSeek 发布」 */
  summary: z.string(),
  /** 交给模型的结果文字（已截断）；重建历史时原样回传 */
  result: z.string(),
});
export type ReplyToolCall = z.infer<typeof ReplyToolCallSchema>;

/** 一次回复中调用了工具的一轮（不含最后一轮回答） */
export const ReplyStepSchema = z.object({
  reasoning: z.string().nullable(),
  content: z.string(),
  toolCalls: z.array(ReplyToolCallSchema),
});
export type ReplyStep = z.infer<typeof ReplyStepSchema>;

/** 回复引用的来源（正文用 [n] 标注，DIALOG-0010） */
export const ReplySourceSchema = z.object({
  index: z.number().int(),
  url: z.string(),
  title: z.string(),
  siteName: z.string().nullable(),
  snippet: z.string(),
  date: z.string().nullable(),
});
export type ReplySource = z.infer<typeof ReplySourceSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  parentId: z.string().nullable(),
  role: DialogRole,
  content: z.string(),
  reasoning: z.string().nullable(),
  model: z.string().nullable(),
  usage: AiUsageSchema.nullable(),
  /** 回复过程中调用了工具的各轮（搜索过程） */
  steps: z.array(ReplyStepSchema).nullable(),
  sources: z.array(ReplySourceSchema).nullable(),
  /** 生成这条回复时，最后一次请求的上下文长度（输入 token 数） */
  contextTokens: z.number().int().nullable(),
  /** 生成被停止（按停止或正常关闭 MyOutside），内容是停止前已生成的部分 */
  stopped: z.boolean(),
  activeChildId: z.string().nullable(),
  createdAt: z.number().int(),
});
export type Message = z.infer<typeof MessageSchema>;

/** 当前路径上的一条消息：附带兄弟信息（分叉切换器用） */
export const PathMessageSchema = MessageSchema.extend({
  siblingCount: z.number().int(),
  siblingIndex: z.number().int(),
  /** 兄弟消息 id（按创建时间升序），供切换分叉 */
  siblingIds: z.array(z.string()),
});
export type PathMessage = z.infer<typeof PathMessageSchema>;

// —— API 输入 / 输出 ——

export const ListConversationsInput = z.object({});
export type ListConversationsInput = z.infer<typeof ListConversationsInput>;

export const GetPathInput = z.object({
  conversationId: z.string(),
  limit: z.number().int().min(1).max(1000).optional(),
});
export type GetPathInput = z.infer<typeof GetPathInput>;

export const GetPathOutput = z.object({
  messages: z.array(PathMessageSchema),
  hasMore: z.boolean(),
  /** 这个会话是否正在生成回复 */
  generating: z.boolean(),
  /** 当前上下文长度（token）：最近一条回复的实际输入 token 数，加上其后消息的估算；无回复时整体估算（DIALOG-0014） */
  contextTokens: z.number().int(),
});
export type GetPathOutput = z.infer<typeof GetPathOutput>;

export const GetUsageInput = z.object({ conversationId: z.string() });
export type GetUsageInput = z.infer<typeof GetUsageInput>;

/** 会话累计 token 用量（汇总所有分叉） */
export const UsageSummarySchema = z.object({
  replies: z.number().int(),
  promptTokens: z.number().int(),
  completionTokens: z.number().int(),
  totalTokens: z.number().int(),
  reasoningTokens: z.number().int(),
});
export type UsageSummary = z.infer<typeof UsageSummarySchema>;

/** 发送一条用户消息并生成回复（内部 API，普通的异步函数） */
export const SendMessageInput = z.object({
  conversationId: z.string(),
  content: z.string().min(1),
});
export type SendMessageInput = z.infer<typeof SendMessageInput>;

/** 为某条用户消息生成一条回复（内部 API）：重新生成、失败后重试都用它；新回复成为已有回复的兄弟（DIALOG-0012） */
export const GenerateInput = z.object({
  conversationId: z.string(),
  /** 要回答的那条用户消息 */
  parentId: z.string(),
});
export type GenerateInput = z.infer<typeof GenerateInput>;

/** 编辑一条用户消息（产生新分叉）并生成回复（内部 API） */
export const EditAndSendInput = z.object({
  messageId: z.string(),
  content: z.string().min(1),
});
export type EditAndSendInput = z.infer<typeof EditAndSendInput>;

export const GenerateOutput = z.object({
  /** 新回复的 id */
  messageId: z.string(),
  /** 回答的那条用户消息 */
  parentId: z.string(),
  /** stopped：被停止，已生成的部分已保存 */
  stopReason: z.enum(["done", "max_rounds", "stopped"]),
});
export type GenerateOutput = z.infer<typeof GenerateOutput>;

/** 保存一条回复（内部事务 API）：挂在指定的用户消息下 */
export const SaveReplyInput = z.object({
  conversationId: z.string(),
  parentId: z.string(),
  content: z.string(),
  reasoning: z.string().nullable(),
  model: z.string().nullable(),
  usage: AiUsageSchema.nullable(),
  steps: z.array(ReplyStepSchema).nullable(),
  sources: z.array(ReplySourceSchema).nullable(),
  contextTokens: z.number().int().nullable(),
  stopped: z.boolean().optional(),
});
export type SaveReplyInput = z.infer<typeof SaveReplyInput>;

export const SetWebSearchInput = z.object({
  conversationId: z.string(),
  enabled: z.boolean(),
});
export type SetWebSearchInput = z.infer<typeof SetWebSearchInput>;

export const CreateConversationInput = z.object({
  title: z.string().optional(),
  systemPrompt: z.string().nullable().optional(),
  reasoningEffort: ReasoningEffort.optional(),
  webSearch: z.boolean().optional(),
});
export type CreateConversationInput = z.infer<typeof CreateConversationInput>;

export const CreateConversationOutput = z.object({ conversationId: z.string() });
export type CreateConversationOutput = z.infer<typeof CreateConversationOutput>;

export const AppendMessageInput = z.object({
  conversationId: z.string(),
  role: DialogRole,
  content: z.string().min(1),
  model: z.string().optional(),
  reasoning: z.string().optional(),
  usage: AiUsageSchema.optional(),
});
export type AppendMessageInput = z.infer<typeof AppendMessageInput>;

export const AppendMessageOutput = z.object({ messageId: z.string() });
export type AppendMessageOutput = z.infer<typeof AppendMessageOutput>;

export const EditUserMessageInput = z.object({
  messageId: z.string(),
  content: z.string().min(1),
});
export type EditUserMessageInput = z.infer<typeof EditUserMessageInput>;

export const EditUserMessageOutput = z.object({ messageId: z.string() });
export type EditUserMessageOutput = z.infer<typeof EditUserMessageOutput>;

export const SwitchBranchInput = z.object({
  conversationId: z.string(),
  parentId: z.string().nullable(),
  childId: z.string(),
});
export type SwitchBranchInput = z.infer<typeof SwitchBranchInput>;

export const RenameConversationInput = z.object({
  conversationId: z.string(),
  title: z.string().min(1),
});
export type RenameConversationInput = z.infer<typeof RenameConversationInput>;

export const SetSystemPromptInput = z.object({
  conversationId: z.string(),
  systemPrompt: z.string().nullable(),
});
export type SetSystemPromptInput = z.infer<typeof SetSystemPromptInput>;

export const SetReasoningEffortInput = z.object({
  conversationId: z.string(),
  effort: ReasoningEffort,
});
export type SetReasoningEffortInput = z.infer<typeof SetReasoningEffortInput>;

export const DeleteConversationInput = z.object({ conversationId: z.string() });
export type DeleteConversationInput = z.infer<typeof DeleteConversationInput>;

/** dialog 应用的 API 面（函数名 → 输入 / 输出） */
export interface DialogApi {
  "dialog.listConversations": { input: ListConversationsInput; output: Conversation[] };
  "dialog.getPath": { input: GetPathInput; output: GetPathOutput };
  "dialog.getUsage": { input: GetUsageInput; output: UsageSummary };
  "dialog.send": { input: SendMessageInput; output: GenerateOutput };
  "dialog.generate": { input: GenerateInput; output: GenerateOutput };
  "dialog.editAndSend": { input: EditAndSendInput; output: GenerateOutput };
  "dialog.saveReply": { input: SaveReplyInput; output: { messageId: string } };
  "dialog.setWebSearch": { input: SetWebSearchInput; output: OkOutput };
  "dialog.createConversation": { input: CreateConversationInput; output: CreateConversationOutput };
  "dialog.appendMessage": { input: AppendMessageInput; output: AppendMessageOutput };
  "dialog.editUserMessage": { input: EditUserMessageInput; output: EditUserMessageOutput };
  "dialog.switchBranch": { input: SwitchBranchInput; output: OkOutput };
  "dialog.renameConversation": { input: RenameConversationInput; output: OkOutput };
  "dialog.setSystemPrompt": { input: SetSystemPromptInput; output: OkOutput };
  "dialog.setReasoningEffort": { input: SetReasoningEffortInput; output: OkOutput };
  "dialog.deleteConversation": { input: DeleteConversationInput; output: OkOutput };
}
