import { describe, expect, it } from "vitest";
import {
  BOARD_POINTS,
  emptyBoard,
  pointFromIndex,
  pointIndex,
  scoreTerritory,
  tryPlay,
} from "../backend/src/rules.js";

function at(x: number, y: number): number {
  return pointIndex(x, y);
}

describe("go rules", () => {
  it("9x9 board has 81 points", () => {
    expect(BOARD_POINTS).toBe(81);
    expect(emptyBoard()).toHaveLength(81);
    expect(pointFromIndex(at(8, 8))).toEqual({ x: 8, y: 8 });
  });

  it("captures a corner stone", () => {
    const board = emptyBoard();
    board[at(0, 0)] = -1;
    board[at(0, 1)] = 1;
    const result = tryPlay(board, 1, 1, 0);
    expect(result.ok).toBe(true);
    expect(result.captured).toEqual([at(0, 0)]);
    expect(result.board?.[at(0, 0)]).toBe(0);
    expect(result.board?.[at(1, 0)]).toBe(1);
  });

  it("rejects suicide and leaves the board unchanged", () => {
    const board = emptyBoard();
    board[at(0, 1)] = -1;
    board[at(1, 0)] = -1;
    const result = tryPlay(board, 1, 0, 0);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("suicide");
    expect(result.board).toBeUndefined();
  });

  it("a capture takes priority over a would-be suicide", () => {
    const board = emptyBoard();
    board[at(0, 0)] = -1;
    board[at(0, 1)] = 1;
    const result = tryPlay(board, 1, 1, 0);
    expect(result.ok).toBe(true);
    expect(result.captured).toHaveLength(1);
  });

  it("scores empty board as all neutral", () => {
    const score = scoreTerritory(emptyBoard());
    expect(score).toMatchObject({ black: 0, white: 0, neutral: 81 });
    expect(score.ownership.every((value) => value === 0)).toBe(true);
  });

  it("counts a black-only enclosed region, with the outside neutral", () => {
    const board = emptyBoard();
    // Black ring around (4,4)
    board[at(3, 4)] = 1;
    board[at(5, 4)] = 1;
    board[at(4, 3)] = 1;
    board[at(4, 5)] = 1;
    // White stones make the outside region border both colors.
    board[at(0, 0)] = -1;
    board[at(8, 8)] = -1;

    const score = scoreTerritory(board);
    expect(score.black).toBe(1);
    expect(score.white).toBe(0);
    expect(score.neutral).toBe(74);
    expect(score.ownership[at(4, 4)]).toBe(1);
    expect(score.ownership[at(0, 1)]).toBe(0);
  });

  it("counts a white-only enclosed region", () => {
    const board = emptyBoard();
    board[at(3, 4)] = -1;
    board[at(5, 4)] = -1;
    board[at(4, 3)] = -1;
    board[at(4, 5)] = -1;
    board[at(0, 0)] = 1;
    board[at(8, 8)] = 1;

    const score = scoreTerritory(board);
    expect(score.black).toBe(0);
    expect(score.white).toBe(1);
    expect(score.neutral).toBe(74);
    expect(score.ownership[at(4, 4)]).toBe(-1);
  });

  it("does not count stones as territory", () => {
    const board = emptyBoard();
    board[at(0, 0)] = 1;
    board[at(8, 8)] = -1;
    const score = scoreTerritory(board);
    expect(score.black + score.white + score.neutral).toBe(79);
  });
});
