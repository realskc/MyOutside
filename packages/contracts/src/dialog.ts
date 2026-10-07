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
  activeFirstId: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  parentId: z.string().nullable(),
  role: DialogRole,
  content: z.string(),
  reasoning: z.string().nullable(),
  model: z.string().nullable(),
  usage: AiUsageSchema.nullable(),
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
});
export type GetPathOutput = z.infer<typeof GetPathOutput>;

export const GenerateReplyInput = z.object({ conversationId: z.string() });
export type GenerateReplyInput = z.infer<typeof GenerateReplyInput>;

export const GenerateReplyOutput = z.object({
  content: z.string(),
  reasoning: z.string().nullable(),
  model: z.string(),
  usage: AiUsageSchema.nullable(),
});
export type GenerateReplyOutput = z.infer<typeof GenerateReplyOutput>;

export const CreateConversationInput = z.object({
  title: z.string().optional(),
  systemPrompt: z.string().nullable().optional(),
  reasoningEffort: ReasoningEffort.optional(),
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
  "dialog.generateReply": { input: GenerateReplyInput; output: GenerateReplyOutput };
  "dialog.createConversation": { input: CreateConversationInput; output: CreateConversationOutput };
  "dialog.appendMessage": { input: AppendMessageInput; output: AppendMessageOutput };
  "dialog.editUserMessage": { input: EditUserMessageInput; output: EditUserMessageOutput };
  "dialog.switchBranch": { input: SwitchBranchInput; output: OkOutput };
  "dialog.renameConversation": { input: RenameConversationInput; output: OkOutput };
  "dialog.setSystemPrompt": { input: SetSystemPromptInput; output: OkOutput };
  "dialog.setReasoningEffort": { input: SetReasoningEffortInput; output: OkOutput };
  "dialog.deleteConversation": { input: DeleteConversationInput; output: OkOutput };
}
