import type { GoState } from "@myoutside/contracts";
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

describe("go backend", () => {
  it("joins the first two players as black and white", async () => {
    const kernel = setup();
    expect(await join(kernel, "alice")).toEqual({ seat: "black" });
    expect(await join(kernel, "bob")).toEqual({ seat: "white" });
    expect(await join(kernel, "carol")).toEqual({ seat: null });

    const s = await state(kernel, "alice");
    expect(s.players).toEqual({ black: true, white: true });
    expect(s.mySeat).toBe("black");
    expect(s.status).toBe("playing");
    expect(s.board).toHaveLength(81);
    expect(s.toPlay).toBe(1);
  });

  it("does not start until both players join", async () => {
    const kernel = setup();
    await join(kernel, "alice");
    const waiting = await state(kernel, "alice");
    expect(waiting.status).toBe("waiting");

    const result = await raw(kernel, "go.move", { token: "alice", x: 4, y: 4 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PRECONDITION");

    await join(kernel, "bob");
    expect((await state(kernel, "alice")).status).toBe("playing");
  });

  it("rejects out-of-turn and occupied points", async () => {
    const kernel = setup();
    await join(kernel, "alice");
    await join(kernel, "bob");

    const outOfTurn = await raw(kernel, "go.move", { token: "bob", x: 4, y: 4 });
    expect(outOfTurn.ok).toBe(false);
    if (!outOfTurn.ok) expect(outOfTurn.error.code).toBe("PRECONDITION");

    await move(kernel, "alice", 4, 4);
    const occupied = await raw(kernel, "go.move", { token: "bob", x: 4, y: 4 });
    expect(occupied.ok).toBe(false);
    if (!occupied.ok) expect(occupied.error.code).toBe("PRECONDITION");

    const s = await state(kernel, "alice");
    expect(s.moveCount).toBe(1);
    expect(s.board[4 * 9 + 4]).toBe(1);
  });

  it("ends immediately when a stone is captured; capturer wins", async () => {
    const kernel = setup();
    await join(kernel, "alice");
    await join(kernel, "bob");

    // Black at (0,1), white at (0,0), black at (1,0) captures white.
    await move(kernel, "alice", 0, 1);
    await move(kernel, "bob", 0, 0);
    await move(kernel, "alice", 1, 0);

    const s = await state(kernel, "alice");
    expect(s.status).toBe("finished");
    expect(s.winner).toBe("black");
    expect(s.endReason).toBe("capture");
    expect(s.captured).toEqual({ seat: "white", count: 1 });
    expect(s.scores).toBeNull();
    expect(s.board[0]).toBe(0);
    expect(s.board[9]).toBe(1);
    expect(s.board[1]).toBe(1);
  });

  it("rejects suicide", async () => {
    const kernel = setup();
    await join(kernel, "alice");
    await join(kernel, "bob");

    await move(kernel, "alice", 1, 1);
    await move(kernel, "bob", 0, 1);
    await move(kernel, "alice", 2, 2);
    await move(kernel, "bob", 1, 0);

    const suicide = await raw(kernel, "go.move", { token: "alice", x: 0, y: 0 });
    expect(suicide.ok).toBe(false);
    if (!suicide.ok) {
      expect(suicide.error.code).toBe("PRECONDITION");
      expect(suicide.error.message).toContain("自杀");
    }
    const s = await state(kernel, "alice");
    expect(s.moveCount).toBe(4);
    expect(s.board[0]).toBe(0);
  });

  it("two passes score territory and do not declare a winner", async () => {
    const kernel = setup();
    await join(kernel, "alice");
    await join(kernel, "bob");

    await move(kernel, "alice", 4, 4);
    await move(kernel, "bob", 0, 0);
    await pass(kernel, "alice");
    await pass(kernel, "bob");

    const s = await state(kernel, "alice");
    expect(s.status).toBe("finished");
    expect(s.endReason).toBe("two_passes");
    expect(s.winner).toBeNull();
    expect(s.scores).toMatchObject({ black: 0, white: 0, neutral: 79 });
    expect(s.consecutivePasses).toBe(2);
  });

  it("resignation works even when it is not your turn", async () => {
    const kernel = setup();
    await join(kernel, "alice");
    await join(kernel, "bob");

    // Black to play, but white resigns.
    await call(kernel, "go.resign", { token: "bob" });
    const s = await state(kernel, "alice");
    expect(s.status).toBe("finished");
    expect(s.endReason).toBe("resign");
    expect(s.winner).toBe("black");
    expect(s.scores).toBeNull();
  });

  it("newGame resets the board and chat but keeps seats", async () => {
    const kernel = setup();
    await join(kernel, "alice");
    await join(kernel, "bob");
    await move(kernel, "alice", 4, 4);
    await call(kernel, "go.sendChat", { token: "alice", text: "hi" });

    await call(kernel, "go.newGame", { token: "alice" });
    const s = await state(kernel, "alice");
    expect(s.status).toBe("playing");
    expect(s.moveCount).toBe(0);
    expect(s.board.every((cell) => cell === 0)).toBe(true);
    expect(s.chat).toEqual([]);
    expect(s.mySeat).toBe("black");
    expect(s.players).toEqual({ black: true, white: true });
  });

  it("resetSeats clears seats and allows both players to rejoin", async () => {
    const kernel = setup();
    await join(kernel, "alice");
    await join(kernel, "bob");
    await move(kernel, "alice", 4, 4);
    await call(kernel, "go.sendChat", { token: "alice", text: "hi" });

    await call(kernel, "go.resetSeats", { token: "alice" });
    const cleared = await state(kernel, "alice");
    expect(cleared.mySeat).toBeNull();
    expect(cleared.players).toEqual({ black: false, white: false });
    expect(cleared.status).toBe("waiting");
    expect(cleared.board.every((cell) => cell === 0)).toBe(true);
    expect(cleared.chat).toEqual([]);

    expect(await join(kernel, "alice")).toEqual({ seat: "black" });
    expect(await join(kernel, "bob")).toEqual({ seat: "white" });
    expect((await state(kernel, "alice")).status).toBe("playing");
  });

  it("swaps colors only before the first move", async () => {
    const kernel = setup();
    await join(kernel, "alice");
    await join(kernel, "bob");

    await call(kernel, "go.swapColors", { token: "alice" });
    expect((await state(kernel, "alice")).mySeat).toBe("white");
    expect((await state(kernel, "bob")).mySeat).toBe("black");
    expect((await state(kernel, "bob")).toPlay).toBe(1);

    await move(kernel, "bob", 4, 4);
    const later = await raw(kernel, "go.swapColors", { token: "alice" });
    expect(later.ok).toBe(false);
    if (!later.ok) expect(later.error.code).toBe("PRECONDITION");
  });

  it("chat is shared between the two seats; spectators are read-only", async () => {
    const kernel = setup();
    await join(kernel, "alice");
    await join(kernel, "bob");
    await join(kernel, "carol");

    await call(kernel, "go.sendChat", { token: "alice", text: "你好" });
    const b = await state(kernel, "bob");
    expect(b.chat).toHaveLength(1);
    expect(b.chat[0]).toMatchObject({ seat: "black", text: "你好" });

    await call(kernel, "go.sendChat", { token: "bob", text: "hi" });
    const a = await state(kernel, "alice");
    expect(a.chat.map((message) => message.text)).toEqual(["你好", "hi"]);

    const denied = await raw(kernel, "go.sendChat", { token: "carol", text: "let me in" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("PRECONDITION");
  });

  it("a second join with the same token keeps the seat", async () => {
    const kernel = setup();
    expect(await join(kernel, "alice")).toEqual({ seat: "black" });
    expect(await join(kernel, "alice")).toEqual({ seat: "black" });
    await join(kernel, "bob");
    const s = await state(kernel, "alice");
    expect(s.players).toEqual({ black: true, white: true });
  });
});
