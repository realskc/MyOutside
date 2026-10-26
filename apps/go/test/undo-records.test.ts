import type { GoRecord, GoRecordSummary, GoState } from "@myoutside/contracts";
import { createKernel, type Kernel } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";
import { describe, expect, it } from "vitest";
import { goApp } from "../backend/src/index.js";

function setup(): Kernel {
  const storage = createNodeSqliteAdapter({ path: ":memory:" });
  const kernel = createKernel({ storage });
  kernel.registerApp(goApp);
  kernel.start();
  return kernel;
}

async function call<T>(kernel: Kernel, name: string, payload?: unknown): Promise<T> {
  const res = await kernel.handle({ call: name, payload });
  if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
  return res.result as T;
}

async function raw(kernel: Kernel, name: string, payload?: unknown) {
  return kernel.handle({ call: name, payload });
}

async function join(kernel: Kernel, token: string) {
  return call<{ seat: string | null }>(kernel, "go.join", { token });
}

async function state(kernel: Kernel, token: string): Promise<GoState> {
  return call<GoState>(kernel, "go.getState", { token });
}

async function move(kernel: Kernel, token: string, x: number, y: number) {
  return call(kernel, "go.move", { token, x, y });
}

async function pass(kernel: Kernel, token: string) {
  return call(kernel, "go.pass", { token });
}

async function setupPlaying(): Promise<Kernel> {
  const kernel = setup();
  await join(kernel, "alice");
  await join(kernel, "bob");
  return kernel;
}

describe("go undo", () => {
  it("requests, blocks moves, and accepts by removing the requester's last move and replies", async () => {
    const kernel = await setupPlaying();
    await move(kernel, "alice", 4, 4);
    await move(kernel, "bob", 0, 0);
    await move(kernel, "alice", 8, 8);
    await move(kernel, "bob", 0, 1);

    const before = await state(kernel, "alice");
    expect(before.canRequestUndo).toBe(true);
    await call(kernel, "go.requestUndo", { token: "alice" });
    const pending = await state(kernel, "alice");
    expect(pending.undo?.seat).toBe("black");
    expect(pending.canRequestUndo).toBe(false);

    const blockedMove = await raw(kernel, "go.move", { token: "bob", x: 2, y: 2 });
    expect(blockedMove.ok).toBe(false);
    if (!blockedMove.ok) expect(blockedMove.error.code).toBe("PRECONDITION");
    const blockedPass = await raw(kernel, "go.pass", { token: "alice" });
    expect(blockedPass.ok).toBe(false);

    await call(kernel, "go.acceptUndo", { token: "bob" });
    const after = await state(kernel, "alice");
    expect(after.status).toBe("playing");
    expect(after.moveCount).toBe(2);
    expect(after.toPlay).toBe(1);
    expect(after.undo).toBeNull();
    expect(after.board[4 * 9 + 4]).toBe(1);
    expect(after.board[0]).toBe(-1);
    expect(after.board[8 * 9 + 8]).toBe(0);
    expect(after.board[9]).toBe(0);
  });

  it("supports reject and cancel; requester and opponent cannot swap roles", async () => {
    const kernel = await setupPlaying();
    await move(kernel, "alice", 4, 4);
    await move(kernel, "bob", 3, 3);

    await call(kernel, "go.requestUndo", { token: "alice" });
    const ownAccept = await raw(kernel, "go.acceptUndo", { token: "alice" });
    expect(ownAccept.ok).toBe(false);
    const opponentCancel = await raw(kernel, "go.cancelUndo", { token: "bob" });
    expect(opponentCancel.ok).toBe(false);
    await call(kernel, "go.rejectUndo", { token: "bob" });
    expect((await state(kernel, "alice")).undo).toBeNull();
    expect((await state(kernel, "alice")).moveCount).toBe(2);

    await call(kernel, "go.requestUndo", { token: "alice" });
    await call(kernel, "go.cancelUndo", { token: "alice" });
    expect((await state(kernel, "alice")).undo).toBeNull();
    expect((await state(kernel, "alice")).moveCount).toBe(2);
  });

  it("can undo all the way to an empty board", async () => {
    const kernel = await setupPlaying();
    await move(kernel, "alice", 4, 4);
    await move(kernel, "bob", 0, 0);

    await call(kernel, "go.requestUndo", { token: "alice" });
    await call(kernel, "go.acceptUndo", { token: "bob" });
    const s = await state(kernel, "alice");
    expect(s.moveCount).toBe(0);
    expect(s.board.every((cell) => cell === 0)).toBe(true);
    expect(s.toPlay).toBe(1);
    expect(s.undo).toBeNull();
  });

  it("rejects a request with no moves and after the game ends", async () => {
    const kernel = await setupPlaying();
    const noMove = await raw(kernel, "go.requestUndo", { token: "alice" });
    expect(noMove.ok).toBe(false);
    if (!noMove.ok) expect(noMove.error.code).toBe("PRECONDITION");

    await move(kernel, "alice", 0, 1);
    await move(kernel, "bob", 0, 0);
    await move(kernel, "alice", 1, 0);
    const finished = await raw(kernel, "go.requestUndo", { token: "alice" });
    expect(finished.ok).toBe(false);
    if (!finished.ok) expect(finished.error.code).toBe("PRECONDITION");
  });
});

describe("go records", () => {
  it("archives a capture game and returns a replayable record", async () => {
    const kernel = await setupPlaying();
    await move(kernel, "alice", 0, 1);
    await move(kernel, "bob", 0, 0);
    await move(kernel, "alice", 1, 0);
    const s = await state(kernel, "alice");

    const records = await call<GoRecordSummary[]>(kernel, "go.listRecords", {});
    expect(records).toHaveLength(1);
    expect(records[0]?.endReason).toBe("capture");
    expect(records[0]?.winner).toBe("black");
    expect(records[0]?.moveCount).toBe(3);
    expect(records[0]?.captured).toEqual({ seat: "white", count: 1 });

    const record = await call<GoRecord>(kernel, "go.getRecord", { id: records[0]!.id });
    expect(record.positions).toHaveLength(4);
    expect(record.positions[0]?.every((cell) => cell === 0)).toBe(true);
    expect(record.positions[3]).toEqual(s.board);
    expect(record.moves.map((m) => m.action)).toEqual(["move", "move", "move"]);
  });

  it("archives a two-pass game with territory-only scores", async () => {
    const kernel = await setupPlaying();
    await move(kernel, "alice", 4, 4);
    await move(kernel, "bob", 0, 0);
    await pass(kernel, "alice");
    await pass(kernel, "bob");

    const records = await call<GoRecordSummary[]>(kernel, "go.listRecords", {});
    expect(records).toHaveLength(1);
    expect(records[0]?.endReason).toBe("two_passes");
    expect(records[0]?.winner).toBeNull();
    expect(records[0]?.scores).toEqual({ black: 0, white: 0, neutral: 79 });

    const record = await call<GoRecord>(kernel, "go.getRecord", { id: records[0]!.id });
    expect(record.positions).toHaveLength(5);
    expect(record.moves.at(-1)?.action).toBe("pass");
  });

  it("archives a zero-move resignation", async () => {
    const kernel = await setupPlaying();
    await call(kernel, "go.resign", { token: "bob" });
    const records = await call<GoRecordSummary[]>(kernel, "go.listRecords", {});
    expect(records).toHaveLength(1);
    expect(records[0]?.endReason).toBe("resign");
    expect(records[0]?.winner).toBe("black");
    expect(records[0]?.moveCount).toBe(0);
    const record = await call<GoRecord>(kernel, "go.getRecord", { id: records[0]!.id });
    expect(record.positions).toHaveLength(1);
    expect(record.moves).toEqual([]);
  });

  it("archives abandoned games on newGame/resetSeats and does not duplicate finished ones", async () => {
    const kernel = await setupPlaying();
    await move(kernel, "alice", 4, 4);
    await call(kernel, "go.newGame", { token: "alice" });
    let records = await call<GoRecordSummary[]>(kernel, "go.listRecords", {});
    expect(records).toHaveLength(1);
    expect(records[0]?.endReason).toBe("abandoned");
    expect(records[0]?.moveCount).toBe(1);

    await move(kernel, "alice", 3, 3);
    await call(kernel, "go.resetSeats", { token: "alice" });
    records = await call<GoRecordSummary[]>(kernel, "go.listRecords", {});
    expect(records).toHaveLength(2);
    expect(records.some((record) => record.endReason === "abandoned")).toBe(true);

    // 结束局已经归档，再开新局不重复。
    await join(kernel, "alice");
    await join(kernel, "bob");
    await call(kernel, "go.resign", { token: "bob" });
    const finishedCount = (await call<GoRecordSummary[]>(kernel, "go.listRecords", {})).length;
    await call(kernel, "go.newGame", { token: "alice" });
    expect((await call<GoRecordSummary[]>(kernel, "go.listRecords", {})).length).toBe(finishedCount);
  });

  it("records only the moves that remain after an accepted undo", async () => {
    const kernel = await setupPlaying();
    await move(kernel, "alice", 4, 4);
    await move(kernel, "bob", 0, 0);
    await move(kernel, "alice", 8, 8);
    await call(kernel, "go.requestUndo", { token: "alice" });
    await call(kernel, "go.acceptUndo", { token: "bob" });
    await call(kernel, "go.newGame", { token: "alice" });

    const records = await call<GoRecordSummary[]>(kernel, "go.listRecords", {});
    expect(records).toHaveLength(1);
    expect(records[0]?.moveCount).toBe(2);
    const record = await call<GoRecord>(kernel, "go.getRecord", { id: records[0]!.id });
    expect(record.positions).toHaveLength(3);
    expect(record.moves).toHaveLength(2);
  });

  it("returns NOT_FOUND for an unknown record", async () => {
    const kernel = setup();
    const result = await raw(kernel, "go.getRecord", { id: "missing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});
