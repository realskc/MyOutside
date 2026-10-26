import type {
  GoChatMessage,
  GoEndReason,
  GoRecord,
  GoRecordMove,
  GoRecordSummary,
  GoScore,
  GoSeat,
  GoState,
  GoStatus,
} from "@myoutside/contracts";
import { KernelError, type AppDb } from "@myoutside/kernel";
import { BOARD_POINTS, pointFromIndex, scoreTerritory } from "./rules.js";

export const GAME_ID = "current";

export interface GameRow {
  id: string;
  board: string;
  to_play: number;
  status: string;
  winner: string | null;
  end_reason: string | null;
  move_count: number;
  consecutive_passes: number;
  last_move: number | null;
  last_action: string | null;
  captured_count: number;
  captured_seat: string | null;
  score_black: number | null;
  score_white: number | null;
  score_neutral: number | null;
  recorded: number;
  undo_seat: string | null;
  undo_target: number | null;
  undo_requested_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface MoveRow {
  id: number;
  move_no: number;
  seat: string;
  action: string;
  x: number | null;
  y: number | null;
  captured: number;
  created_at: number;
}

export interface RecordRow {
  id: string;
  created_at: number;
  finished_at: number;
  end_reason: string;
  winner: string | null;
  move_count: number;
  board: string;
  moves: string;
  positions: string;
  score_black: number | null;
  score_white: number | null;
  score_neutral: number | null;
  captured_seat: string | null;
  captured_count: number;
}

export interface PlayerRow {
  seat: string;
  token: string;
  joined_at: number;
}

export interface ChatRow {
  id: number;
  seat: string;
  text: string;
  created_at: number;
}

export interface Players {
  black: PlayerRow | undefined;
  white: PlayerRow | undefined;
}

export function getGame(db: AppDb): GameRow {
  const row = db.get<GameRow>("game", { id: GAME_ID });
  if (!row) throw new KernelError("INTERNAL", "围棋对局数据缺失");
  return row;
}

export function getPlayers(db: AppDb): Players {
  const rows = db.all<PlayerRow>("player", {}, { orderBy: "seat" });
  return {
    black: rows.find((row) => row.seat === "black"),
    white: rows.find((row) => row.seat === "white"),
  };
}

export function getPlayerByToken(db: AppDb, token: string): PlayerRow | undefined {
  return db.get<PlayerRow>("player", { token });
}

export function loadChat(db: AppDb, limit = 100): GoChatMessage[] {
  const rows = db.all<ChatRow>("chat", {}, { orderBy: "id DESC", limit });
  return rows.reverse().map((row) => ({
    id: row.id,
    seat: row.seat === "black" ? "black" : "white",
    text: row.text,
    createdAt: row.created_at,
  }));
}

export function parseBoard(raw: string): number[] {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new KernelError("INTERNAL", "围棋棋盘数据损坏");
  }
  if (!Array.isArray(value) || value.length !== BOARD_POINTS) {
    throw new KernelError("INTERNAL", "围棋棋盘数据损坏");
  }
  return value.map((cell) => (cell === 1 ? 1 : cell === -1 ? -1 : 0));
}

export function seatOf(value: string | null): GoSeat | null {
  return value === "black" || value === "white" ? value : null;
}

export function scoreFromRow(game: GameRow, board: number[]): GoScore | null {
  if (game.score_black === null || game.score_white === null || game.score_neutral === null) return null;
  return {
    black: game.score_black,
    white: game.score_white,
    neutral: game.score_neutral,
    ownership: scoreTerritory(board).ownership,
  };
}

export function buildState(
  game: GameRow,
  board: number[],
  players: Players,
  chat: GoChatMessage[],
  mySeat: GoSeat | null,
  canRequestUndo: boolean,
): GoState {
  const lastAction = game.last_action === "move" || game.last_action === "pass" ? game.last_action : null;
  const lastMove =
    lastAction === "move" && game.last_move !== null ? pointFromIndex(game.last_move) : null;
  const captured =
    game.captured_count > 0 && seatOf(game.captured_seat)
      ? { seat: seatOf(game.captured_seat)!, count: game.captured_count }
      : null;
  const undoSeat = seatOf(game.undo_seat);
  const undo =
    undoSeat && game.undo_requested_at !== null
      ? { seat: undoSeat, requestedAt: game.undo_requested_at }
      : null;

  return {
    board,
    toPlay: game.to_play === -1 ? -1 : 1,
    status: game.status as GoStatus,
    winner: seatOf(game.winner),
    endReason: (game.end_reason as GoEndReason | null) ?? null,
    captured,
    scores: scoreFromRow(game, board),
    undo,
    canRequestUndo,
    players: { black: Boolean(players.black), white: Boolean(players.white) },
    mySeat,
    moveCount: game.move_count,
    consecutivePasses: game.consecutive_passes,
    lastMove,
    lastAction,
    chat,
    updatedAt: game.updated_at,
  };
}

export function listRecords(db: AppDb): GoRecordSummary[] {
  return db
    .all<RecordRow>("record", {}, { orderBy: "finished_at DESC", limit: 100 })
    .map(recordSummaryFromRow);
}

export function getRecord(db: AppDb, id: string): GoRecord {
  const row = db.get<RecordRow>("record", { id });
  if (!row) throw new KernelError("NOT_FOUND", "棋谱不存在");
  const summary = recordSummaryFromRow(row);
  let moves: GoRecordMove[];
  let positions: number[][];
  try {
    moves = JSON.parse(row.moves) as GoRecordMove[];
    positions = JSON.parse(row.positions) as number[][];
  } catch {
    throw new KernelError("INTERNAL", "棋谱数据损坏");
  }
  if (!Array.isArray(moves) || !Array.isArray(positions)) {
    throw new KernelError("INTERNAL", "棋谱数据损坏");
  }
  return { ...summary, moves, positions };
}

function recordSummaryFromRow(row: RecordRow): GoRecordSummary {
  const scores =
    row.score_black !== null && row.score_white !== null && row.score_neutral !== null
      ? { black: row.score_black, white: row.score_white, neutral: row.score_neutral }
      : null;
  const captured =
    row.captured_count > 0 && seatOf(row.captured_seat)
      ? { seat: seatOf(row.captured_seat)!, count: row.captured_count }
      : null;
  return {
    id: row.id,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    endReason: row.end_reason as GoRecordSummary["endReason"],
    winner: seatOf(row.winner),
    moveCount: row.move_count,
    scores,
    captured,
  };
}
