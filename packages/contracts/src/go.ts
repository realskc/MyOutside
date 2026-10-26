import { z } from "zod";
import { OkOutput } from "./common.js";

/** 围棋执子方 */
export const GoSeat = z.enum(["black", "white"]);
export type GoSeat = z.infer<typeof GoSeat>;

export const GoStatus = z.enum(["waiting", "playing", "finished"]);
export type GoStatus = z.infer<typeof GoStatus>;

export const GoEndReason = z.enum(["capture", "two_passes", "resign"]);
export type GoEndReason = z.infer<typeof GoEndReason>;

export const GoChatMessage = z.object({
  id: z.number().int(),
  seat: GoSeat,
  text: z.string(),
  createdAt: z.number().int(),
});
export type GoChatMessage = z.infer<typeof GoChatMessage>;

/** 只数空（围空），不数子；ownership 用于终局归属图 */
export const GoScore = z.object({
  black: z.number().int().min(0),
  white: z.number().int().min(0),
  neutral: z.number().int().min(0),
  /** 81 个点：1 黑空，-1 白空，0 中立/有子 */
  ownership: z.array(z.number().int().min(-1).max(1)).length(81),
});
export type GoScore = z.infer<typeof GoScore>;

export const GoCaptured = z.object({
  /** 被提子的一方 */
  seat: GoSeat,
  count: z.number().int().min(1),
});
export type GoCaptured = z.infer<typeof GoCaptured>;

export const GoUndoRequest = z.object({
  /** 请求悔棋的一方 */
  seat: GoSeat,
  requestedAt: z.number().int(),
});
export type GoUndoRequest = z.infer<typeof GoUndoRequest>;

export const GoRecordEndReason = z.enum(["capture", "two_passes", "resign", "abandoned"]);
export type GoRecordEndReason = z.infer<typeof GoRecordEndReason>;

export const GoRecordMove = z.object({
  moveNo: z.number().int().min(1),
  seat: GoSeat,
  action: z.enum(["move", "pass"]),
  x: z.number().int().min(0).max(8).nullable(),
  y: z.number().int().min(0).max(8).nullable(),
  captured: z.number().int().min(0),
});
export type GoRecordMove = z.infer<typeof GoRecordMove>;

export const GoRecordScores = z.object({
  black: z.number().int().min(0),
  white: z.number().int().min(0),
  neutral: z.number().int().min(0),
});
export type GoRecordScores = z.infer<typeof GoRecordScores>;

export const GoRecordSummary = z.object({
  id: z.string(),
  createdAt: z.number().int(),
  finishedAt: z.number().int(),
  endReason: GoRecordEndReason,
  winner: GoSeat.nullable(),
  moveCount: z.number().int().min(0),
  scores: GoRecordScores.nullable(),
  captured: GoCaptured.nullable(),
});
export type GoRecordSummary = z.infer<typeof GoRecordSummary>;

export const GoRecord = GoRecordSummary.extend({
  moves: z.array(GoRecordMove),
  /** positions[i] 是走了 i 手之后的棋盘；positions[0] 是空盘 */
  positions: z.array(z.array(z.number().int().min(-1).max(1)).length(81)),
});
export type GoRecord = z.infer<typeof GoRecord>;

export const GoState = z.object({
  board: z.array(z.number().int().min(-1).max(1)).length(81),
  toPlay: z.union([z.literal(1), z.literal(-1)]),
  status: GoStatus,
  /** 只有提子/认输会直接产生胜者；两次 pass 点目不判胜负 */
  winner: GoSeat.nullable(),
  endReason: GoEndReason.nullable(),
  captured: GoCaptured.nullable(),
  scores: GoScore.nullable(),
  undo: GoUndoRequest.nullable(),
  canRequestUndo: z.boolean(),
  players: z.object({ black: z.boolean(), white: z.boolean() }),
  mySeat: GoSeat.nullable(),
  moveCount: z.number().int().min(0),
  consecutivePasses: z.number().int().min(0).max(2),
  lastMove: z
    .object({
      x: z.number().int().min(0).max(8),
      y: z.number().int().min(0).max(8),
    })
    .nullable(),
  lastAction: z.enum(["move", "pass"]).nullable(),
  chat: z.array(GoChatMessage),
  updatedAt: z.number().int(),
});
export type GoState = z.infer<typeof GoState>;

const Token = z.string().min(1).max(100);

export const GoStateInput = z.object({ token: Token.optional() });
export type GoStateInput = z.infer<typeof GoStateInput>;

export const GoJoinInput = z.object({ token: Token });
export type GoJoinInput = z.infer<typeof GoJoinInput>;

export const GoJoinOutput = z.object({ seat: GoSeat.nullable() });
export type GoJoinOutput = z.infer<typeof GoJoinOutput>;

export const GoMoveInput = z.object({
  token: Token,
  x: z.number().int().min(0).max(8),
  y: z.number().int().min(0).max(8),
});
export type GoMoveInput = z.infer<typeof GoMoveInput>;

export const GoPassInput = z.object({ token: Token });
export type GoPassInput = z.infer<typeof GoPassInput>;

export const GoResignInput = z.object({ token: Token });
export type GoResignInput = z.infer<typeof GoResignInput>;

export const GoNewGameInput = z.object({ token: Token });
export type GoNewGameInput = z.infer<typeof GoNewGameInput>;

export const GoSwapColorsInput = z.object({ token: Token });
export type GoSwapColorsInput = z.infer<typeof GoSwapColorsInput>;

export const GoResetSeatsInput = z.object({ token: Token });
export type GoResetSeatsInput = z.infer<typeof GoResetSeatsInput>;

export const GoSendChatInput = z.object({
  token: Token,
  text: z.string().trim().min(1).max(500),
});
export type GoSendChatInput = z.infer<typeof GoSendChatInput>;

export const GoUndoInput = z.object({ token: Token });
export type GoUndoInput = z.infer<typeof GoUndoInput>;

export const GoArchiveInput = z.object({});
export type GoArchiveInput = z.infer<typeof GoArchiveInput>;

export const GoListRecordsInput = z.object({});
export type GoListRecordsInput = z.infer<typeof GoListRecordsInput>;

export const GoGetRecordInput = z.object({ id: z.string().min(1) });
export type GoGetRecordInput = z.infer<typeof GoGetRecordInput>;

/** go 应用的 API 面（函数名 → 输入 / 输出） */
export interface GoApi {
  "go.getState": { input: GoStateInput; output: GoState };
  "go.join": { input: GoJoinInput; output: GoJoinOutput };
  "go.move": { input: GoMoveInput; output: OkOutput };
  "go.pass": { input: GoPassInput; output: OkOutput };
  "go.resign": { input: GoResignInput; output: OkOutput };
  "go.newGame": { input: GoNewGameInput; output: OkOutput };
  "go.swapColors": { input: GoSwapColorsInput; output: OkOutput };
  "go.resetSeats": { input: GoResetSeatsInput; output: OkOutput };
  "go.requestUndo": { input: GoUndoInput; output: OkOutput };
  "go.acceptUndo": { input: GoUndoInput; output: OkOutput };
  "go.rejectUndo": { input: GoUndoInput; output: OkOutput };
  "go.cancelUndo": { input: GoUndoInput; output: OkOutput };
  "go.archiveFinished": { input: GoArchiveInput; output: OkOutput };
  "go.listRecords": { input: GoListRecordsInput; output: GoRecordSummary[] };
  "go.getRecord": { input: GoGetRecordInput; output: GoRecord };
  "go.sendChat": { input: GoSendChatInput; output: OkOutput };
}
