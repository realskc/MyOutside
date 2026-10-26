import { randomUUID } from "node:crypto";
import {
  GoArchiveInput,
  GoGetRecordInput,
  GoJoinInput,
  GoListRecordsInput,
  GoMoveInput,
  GoNewGameInput,
  GoPassInput,
  GoResetSeatsInput,
  GoResignInput,
  GoSendChatInput,
  GoStateInput,
  GoSwapColorsInput,
  GoUndoInput,
  type GoRecordMove,
  type GoSeat,
} from "@myoutside/contracts";
import { defineRead, defineTx, KernelError, type AppDb, type AppModule, type SqlValue } from "@myoutside/kernel";
import { colorToSeat, emptyBoard, pointIndex, scoreTerritory, seatToColor, tryPlay } from "./rules.js";
import {
  GAME_ID,
  buildState,
  getGame,
  getPlayerByToken,
  getPlayers,
  getRecord as loadRecord,
  listRecords as loadRecords,
  loadChat,
  parseBoard,
  seatOf,
  type GameRow,
  type MoveRow,
  type PlayerRow,
} from "./storage.js";

function opponent(seat: GoSeat): GoSeat {
  return seat === "black" ? "white" : "black";
}

function countPlayers(db: AppDb): number {
  return db.count("player");
}

function updateGame(db: AppDb, patch: Record<string, SqlValue>, now = Date.now()): void {
  db.update("game", { ...patch, updated_at: now }, { id: GAME_ID });
}

function requireSeat(db: AppDb, token: string): { player: PlayerRow; seat: GoSeat; color: 1 | -1 } {
  const player = getPlayerByToken(db, token);
  const seat = player ? seatOf(player.seat) : null;
  if (!player || !seat) {
    throw new KernelError("PRECONDITION", "你还没有入座（对局可能已满或尚未加入）");
  }
  return { player, seat, color: seatToColor(seat) };
}

function requirePlayingSeat(db: AppDb, token: string): { game: GameRow; seat: GoSeat } {
  const game = getGame(db);
  if (game.status !== "playing") {
    throw new KernelError("PRECONDITION", "对局还没有开始或已经结束");
  }
  const { seat } = requireSeat(db, token);
  return { game, seat };
}

function requireTurn(
  db: AppDb,
  token: string,
): { game: GameRow; player: PlayerRow; seat: GoSeat; color: 1 | -1; board: number[] } {
  const game = getGame(db);
  if (game.status !== "playing") {
    throw new KernelError("PRECONDITION", "对局还没有开始或已经结束");
  }
  if (game.undo_seat) {
    throw new KernelError("PRECONDITION", "请先处理悔棋请求");
  }
  const { player, seat, color } = requireSeat(db, token);
  if (game.to_play !== color) {
    throw new KernelError("PRECONDITION", "还没轮到你");
  }
  return { game, player, seat, color, board: parseBoard(game.board) };
}

/** 把当前对局写入棋谱；已记录或没有落子则跳过。结束/新局/重置座位时调用。 */
function archiveGame(db: AppDb, now = Date.now()): void {
  const game = getGame(db);
  if (game.recorded) return;
  if (game.move_count === 0 && game.status !== "finished") return;

  const rows = db.all<MoveRow>("move", {}, { orderBy: "move_no" });
  let board = emptyBoard();
  const positions: number[][] = [board.slice()];
  const recordMoves: GoRecordMove[] = [];

  for (const row of rows) {
    const seat = seatOf(row.seat);
    if (!seat) throw new KernelError("INTERNAL", "棋谱座位损坏");
    if (row.action === "move") {
      if (row.x === null || row.y === null) throw new KernelError("INTERNAL", "棋谱坐标损坏");
      const result = tryPlay(board, seatToColor(seat), row.x, row.y);
      if (!result.ok || !result.board) throw new KernelError("INTERNAL", "棋谱重放失败");
      board = result.board;
      recordMoves.push({
        moveNo: row.move_no,
        seat,
        action: "move",
        x: row.x,
        y: row.y,
        captured: row.captured,
      });
    } else {
      recordMoves.push({
        moveNo: row.move_no,
        seat,
        action: "pass",
        x: null,
        y: null,
        captured: 0,
      });
    }
    positions.push(board.slice());
  }

  const finalBoard = parseBoard(game.board);
  if (positions.length > 0) {
    positions[positions.length - 1] = finalBoard;
  }
  const endReason =
    game.status === "finished" && game.end_reason ? game.end_reason : "abandoned";

  db.insert("record", {
    id: randomUUID(),
    created_at: game.created_at,
    finished_at: now,
    end_reason: endReason,
    winner: game.winner,
    move_count: recordMoves.length,
    board: JSON.stringify(finalBoard),
    moves: JSON.stringify(recordMoves),
    positions: JSON.stringify(positions),
    score_black: game.score_black,
    score_white: game.score_white,
    score_neutral: game.score_neutral,
    captured_seat: game.captured_seat,
    captured_count: game.captured_count,
  });
  db.update("game", { recorded: 1 }, { id: GAME_ID });
}

export const goApp: AppModule = {
  id: "go",
  name: "围棋",
  owns: ["game", "player", "move", "chat"],

  migrations: [
    {
      id: "0001_init",
      up: (ctx) => {
        ctx.createTable(
          "game",
          [
            "id TEXT PRIMARY KEY",
            "board TEXT NOT NULL",
            "to_play INTEGER NOT NULL",
            "status TEXT NOT NULL",
            "winner TEXT",
            "end_reason TEXT",
            "move_count INTEGER NOT NULL DEFAULT 0",
            "consecutive_passes INTEGER NOT NULL DEFAULT 0",
            "last_move INTEGER",
            "last_action TEXT",
            "captured_count INTEGER NOT NULL DEFAULT 0",
            "captured_seat TEXT",
            "score_black INTEGER",
            "score_white INTEGER",
            "score_neutral INTEGER",
            "created_at INTEGER NOT NULL",
            "updated_at INTEGER NOT NULL",
          ].join(", "),
        );
        ctx.createTable(
          "player",
          ["seat TEXT PRIMARY KEY", "token TEXT NOT NULL UNIQUE", "joined_at INTEGER NOT NULL"].join(
            ", ",
          ),
        );
        ctx.createTable(
          "move",
          [
            "id INTEGER PRIMARY KEY AUTOINCREMENT",
            "move_no INTEGER NOT NULL",
            "seat TEXT NOT NULL",
            "action TEXT NOT NULL",
            "x INTEGER",
            "y INTEGER",
            "captured INTEGER NOT NULL DEFAULT 0",
            "created_at INTEGER NOT NULL",
          ].join(", "),
        );
        ctx.createTable(
          "chat",
          [
            "id INTEGER PRIMARY KEY AUTOINCREMENT",
            "seat TEXT NOT NULL",
            "text TEXT NOT NULL",
            "created_at INTEGER NOT NULL",
          ].join(", "),
        );
        ctx.createIndex("move_no", "move", "move_no");
        ctx.createIndex("chat_id", "chat", "id");

        const now = Date.now();
        ctx.insert("game", {
          id: GAME_ID,
          board: JSON.stringify(emptyBoard()),
          to_play: 1,
          status: "waiting",
          winner: null,
          end_reason: null,
          move_count: 0,
          consecutive_passes: 0,
          last_move: null,
          last_action: null,
          captured_count: 0,
          captured_seat: null,
          score_black: null,
          score_white: null,
          score_neutral: null,
          created_at: now,
          updated_at: now,
        });
      },
    },
    {
      id: "0002_records_undo",
      up: (ctx) => {
        ctx.createTable(
          "record",
          [
            "id TEXT PRIMARY KEY",
            "created_at INTEGER NOT NULL",
            "finished_at INTEGER NOT NULL",
            "end_reason TEXT NOT NULL",
            "winner TEXT",
            "move_count INTEGER NOT NULL",
            "board TEXT NOT NULL",
            "moves TEXT NOT NULL",
            "positions TEXT NOT NULL",
            "score_black INTEGER",
            "score_white INTEGER",
            "score_neutral INTEGER",
            "captured_seat TEXT",
            "captured_count INTEGER NOT NULL DEFAULT 0",
          ].join(", "),
        );
        ctx.createIndex("record_finished", "record", "finished_at");
        ctx.exec("ALTER TABLE go__game ADD COLUMN recorded INTEGER NOT NULL DEFAULT 0");
        ctx.exec("ALTER TABLE go__game ADD COLUMN undo_seat TEXT");
        ctx.exec("ALTER TABLE go__game ADD COLUMN undo_target INTEGER");
        ctx.exec("ALTER TABLE go__game ADD COLUMN undo_requested_at INTEGER");
      },
    },
  ],

  api: {
    getState: defineRead(GoStateInput, (ctx, input) => {
      const game = getGame(ctx.db);
      const board = parseBoard(game.board);
      const players = getPlayers(ctx.db);
      const player = input.token ? getPlayerByToken(ctx.db, input.token) : undefined;
      const mySeat = player ? seatOf(player.seat) : null;
      const canRequestUndo = Boolean(
        game.status === "playing" &&
          !game.undo_seat &&
          mySeat &&
          ctx.db.count("move", { seat: mySeat }) > 0,
      );
      return buildState(game, board, players, loadChat(ctx.db), mySeat, canRequestUndo);
    }),

    join: defineTx(GoJoinInput, (ctx, input) => {
      const existing = getPlayerByToken(ctx.db, input.token);
      if (existing) {
        return { seat: seatOf(existing.seat) };
      }
      const players = getPlayers(ctx.db);
      const seat: GoSeat | null = !players.black ? "black" : !players.white ? "white" : null;
      if (!seat) return { seat: null };

      ctx.db.insert("player", {
        seat,
        token: input.token,
        joined_at: Date.now(),
      });
      const game = getGame(ctx.db);
      if (game.status === "waiting" && countPlayers(ctx.db) === 2) {
        updateGame(ctx.db, { status: "playing" });
      }
      return { seat };
    }),

    move: defineTx(GoMoveInput, (ctx, input) => {
      const { game, seat, color, board } = requireTurn(ctx.db, input.token);
      const result = tryPlay(board, color, input.x, input.y);
      if (!result.ok) {
        throw new KernelError(
          "PRECONDITION",
          result.reason === "suicide" ? "自杀是非法落子" : "这个点已经有子了",
        );
      }
      const nextBoard = result.board!;
      const captured = result.captured ?? [];
      const ended = captured.length > 0;
      const now = Date.now();
      const moveCount = game.move_count + 1;
      const nextColor = -color;

      updateGame(
        ctx.db,
        {
          board: JSON.stringify(nextBoard),
          to_play: nextColor,
          status: ended ? "finished" : "playing",
          winner: ended ? seat : null,
          end_reason: ended ? "capture" : null,
          move_count: moveCount,
          consecutive_passes: 0,
          last_move: pointIndex(input.x, input.y),
          last_action: "move",
          captured_count: captured.length,
          captured_seat: ended ? colorToSeat(nextColor) : null,
          score_black: null,
          score_white: null,
          score_neutral: null,
        },
        now,
      );
      ctx.db.insert("move", {
        move_no: moveCount,
        seat,
        action: "move",
        x: input.x,
        y: input.y,
        captured: captured.length,
        created_at: now,
      });
      if (ended) archiveGame(ctx.db, now);
      return { ok: true as const };
    }),

    pass: defineTx(GoPassInput, (ctx, input) => {
      const { game, seat, board } = requireTurn(ctx.db, input.token);
      const now = Date.now();
      const moveCount = game.move_count + 1;
      const passes = game.consecutive_passes + 1;
      const ended = passes >= 2;
      const score = ended ? scoreTerritory(board) : null;

      updateGame(
        ctx.db,
        {
          to_play: -game.to_play,
          status: ended ? "finished" : "playing",
          winner: null,
          end_reason: ended ? "two_passes" : null,
          move_count: moveCount,
          consecutive_passes: passes,
          last_move: null,
          last_action: "pass",
          captured_count: 0,
          captured_seat: null,
          score_black: score?.black ?? null,
          score_white: score?.white ?? null,
          score_neutral: score?.neutral ?? null,
        },
        now,
      );
      ctx.db.insert("move", {
        move_no: moveCount,
        seat,
        action: "pass",
        x: null,
        y: null,
        captured: 0,
        created_at: now,
      });
      if (ended) archiveGame(ctx.db, now);
      return { ok: true as const };
    }),

    resign: defineTx(GoResignInput, (ctx, input) => {
      const { seat } = requirePlayingSeat(ctx.db, input.token);
      const now = Date.now();
      updateGame(
        ctx.db,
        {
          status: "finished",
          winner: opponent(seat),
          end_reason: "resign",
          score_black: null,
          score_white: null,
          score_neutral: null,
          undo_seat: null,
          undo_target: null,
          undo_requested_at: null,
        },
        now,
      );
      archiveGame(ctx.db, now);
      return { ok: true as const };
    }),

    newGame: defineTx(GoNewGameInput, (ctx, input) => {
      requireSeat(ctx.db, input.token);
      const players = getPlayers(ctx.db);
      const now = Date.now();
      archiveGame(ctx.db, now);
      updateGame(
        ctx.db,
        {
          board: JSON.stringify(emptyBoard()),
          to_play: 1,
          status: players.black && players.white ? "playing" : "waiting",
          winner: null,
          end_reason: null,
          move_count: 0,
          consecutive_passes: 0,
          last_move: null,
          last_action: null,
          captured_count: 0,
          captured_seat: null,
          score_black: null,
          score_white: null,
          score_neutral: null,
          recorded: 0,
          undo_seat: null,
          undo_target: null,
          undo_requested_at: null,
        },
        now,
      );
      ctx.db.delete("move", { id: { gte: 0 } });
      ctx.db.delete("chat", { id: { gte: 0 } });
      return { ok: true as const };
    }),

    swapColors: defineTx(GoSwapColorsInput, (ctx, input) => {
      requireSeat(ctx.db, input.token);
      const game = getGame(ctx.db);
      if (game.status !== "playing" || game.move_count !== 0) {
        throw new KernelError("PRECONDITION", "只能在开局前交换黑白");
      }
      const players = getPlayers(ctx.db);
      if (!players.black || !players.white) {
        throw new KernelError("PRECONDITION", "双方都入座后才能交换黑白");
      }
      // seat 是主键：先挪到临时值，避免 black/white 互换时主键冲突。
      ctx.db.update("player", { seat: "swap" }, { seat: "black" });
      ctx.db.update("player", { seat: "black" }, { seat: "white" });
      ctx.db.update("player", { seat: "white" }, { seat: "swap" });
      updateGame(ctx.db, {});
      return { ok: true as const };
    }),

    resetSeats: defineTx(GoResetSeatsInput, (ctx, _input) => {
      const now = Date.now();
      archiveGame(ctx.db, now);
      ctx.db.delete("player", { seat: { in: ["black", "white"] } });
      updateGame(
        ctx.db,
        {
          board: JSON.stringify(emptyBoard()),
          to_play: 1,
          status: "waiting",
          winner: null,
          end_reason: null,
          move_count: 0,
          consecutive_passes: 0,
          last_move: null,
          last_action: null,
          captured_count: 0,
          captured_seat: null,
          score_black: null,
          score_white: null,
          score_neutral: null,
          recorded: 0,
          undo_seat: null,
          undo_target: null,
          undo_requested_at: null,
        },
        now,
      );
      ctx.db.delete("move", { id: { gte: 0 } });
      ctx.db.delete("chat", { id: { gte: 0 } });
      return { ok: true as const };
    }),

    requestUndo: defineTx(GoUndoInput, (ctx, input) => {
      const { game, seat } = requirePlayingSeat(ctx.db, input.token);
      if (game.undo_seat) throw new KernelError("PRECONDITION", "已经有一个悔棋请求");
      const last = ctx.db.all<MoveRow>("move", { seat }, { orderBy: "move_no DESC", limit: 1 })[0];
      if (!last) throw new KernelError("PRECONDITION", "你还没有落子");
      updateGame(ctx.db, {
        undo_seat: seat,
        undo_target: last.move_no - 1,
        undo_requested_at: Date.now(),
      });
      return { ok: true as const };
    }),

    cancelUndo: defineTx(GoUndoInput, (ctx, input) => {
      const { game, seat } = requirePlayingSeat(ctx.db, input.token);
      if (!game.undo_seat || game.undo_seat !== seat) {
        throw new KernelError("PRECONDITION", "没有你的悔棋请求");
      }
      updateGame(ctx.db, { undo_seat: null, undo_target: null, undo_requested_at: null });
      return { ok: true as const };
    }),

    rejectUndo: defineTx(GoUndoInput, (ctx, input) => {
      const { game, seat } = requirePlayingSeat(ctx.db, input.token);
      if (!game.undo_seat) throw new KernelError("PRECONDITION", "没有待处理的悔棋请求");
      if (game.undo_seat === seat) throw new KernelError("PRECONDITION", "不能拒绝自己的请求");
      updateGame(ctx.db, { undo_seat: null, undo_target: null, undo_requested_at: null });
      return { ok: true as const };
    }),

    acceptUndo: defineTx(GoUndoInput, (ctx, input) => {
      const { game, seat } = requirePlayingSeat(ctx.db, input.token);
      if (!game.undo_seat || game.undo_target === null) {
        throw new KernelError("PRECONDITION", "没有待处理的悔棋请求");
      }
      if (game.undo_seat === seat) throw new KernelError("PRECONDITION", "不能同意自己的请求");

      const target = game.undo_target;
      const moves = ctx.db.all<MoveRow>(
        "move",
        { move_no: { lte: target } },
        { orderBy: "move_no" },
      );
      let board = emptyBoard();
      let toPlay: 1 | -1 = 1;
      let passes = 0;
      let lastMove: number | null = null;
      let lastAction: "move" | "pass" | null = null;

      for (const move of moves) {
        const moveSeat = seatOf(move.seat);
        if (!moveSeat) throw new KernelError("INTERNAL", "棋谱座位损坏");
        const color = seatToColor(moveSeat);
        if (move.action === "pass") {
          passes += 1;
          lastMove = null;
          lastAction = "pass";
        } else {
          if (move.x === null || move.y === null) {
            throw new KernelError("INTERNAL", "棋谱坐标损坏");
          }
          const result = tryPlay(board, color, move.x, move.y);
          if (!result.ok || !result.board) {
            throw new KernelError("INTERNAL", "悔棋重放失败");
          }
          board = result.board;
          passes = 0;
          lastMove = pointIndex(move.x, move.y);
          lastAction = "move";
        }
        toPlay = color === 1 ? -1 : 1;
      }

      ctx.db.delete("move", { move_no: { gt: target } });
      updateGame(ctx.db, {
        board: JSON.stringify(board),
        to_play: toPlay,
        status: "playing",
        winner: null,
        end_reason: null,
        move_count: target,
        consecutive_passes: passes,
        last_move: lastMove,
        last_action: lastAction,
        captured_count: 0,
        captured_seat: null,
        score_black: null,
        score_white: null,
        score_neutral: null,
        undo_seat: null,
        undo_target: null,
        undo_requested_at: null,
      });
      return { ok: true as const };
    }),

    archiveFinished: defineTx(GoArchiveInput, (ctx) => {
      const game = getGame(ctx.db);
      if (game.status === "finished") archiveGame(ctx.db);
      return { ok: true as const };
    }),

    listRecords: defineRead(GoListRecordsInput, (ctx) => loadRecords(ctx.db)),

    getRecord: defineRead(GoGetRecordInput, (ctx, input) => loadRecord(ctx.db, input.id)),

    sendChat: defineTx(GoSendChatInput, (ctx, input) => {
      const { seat } = requireSeat(ctx.db, input.token);
      ctx.db.insert("chat", {
        seat,
        text: input.text,
        created_at: Date.now(),
      });
      return { ok: true as const };
    }),
  },
};
