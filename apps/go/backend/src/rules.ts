/** 9 路围棋的纯规则：落子、提子、自杀判断、只数围空。 */

export const BOARD_SIZE = 9;
export const BOARD_POINTS = BOARD_SIZE * BOARD_SIZE;

export type Seat = "black" | "white";
export type Stone = 0 | 1 | -1;

export interface PlayResult {
  ok: boolean;
  /** 落子后的棋盘（失败时不存在） */
  board?: number[];
  /** 被提掉的点的下标 */
  captured?: number[];
  reason?: "occupied" | "suicide";
}

export interface TerritoryScore {
  black: number;
  white: number;
  neutral: number;
  /** 81 个点：1 黑空，-1 白空，0 中立/有子 */
  ownership: number[];
}

export function seatToColor(seat: Seat): 1 | -1 {
  return seat === "black" ? 1 : -1;
}

export function colorToSeat(color: number): Seat {
  return color === 1 ? "black" : "white";
}

export function emptyBoard(): number[] {
  return new Array<number>(BOARD_POINTS).fill(0);
}

export function pointIndex(x: number, y: number): number {
  return y * BOARD_SIZE + x;
}

export function pointFromIndex(index: number): { x: number; y: number } {
  return { x: index % BOARD_SIZE, y: Math.floor(index / BOARD_SIZE) };
}

export function neighbors(index: number): number[] {
  const x = index % BOARD_SIZE;
  const y = Math.floor(index / BOARD_SIZE);
  const result: number[] = [];
  if (y > 0) result.push(index - BOARD_SIZE);
  if (x + 1 < BOARD_SIZE) result.push(index + 1);
  if (y + 1 < BOARD_SIZE) result.push(index + BOARD_SIZE);
  if (x > 0) result.push(index - 1);
  return result;
}

function groupAndLiberties(board: number[], start: number): { group: number[]; liberties: number } {
  const color = board[start];
  const group: number[] = [];
  const seen = new Set<number>([start]);
  const libertySet = new Set<number>();
  const stack = [start];
  while (stack.length > 0) {
    const here = stack.pop()!;
    group.push(here);
    for (const next of neighbors(here)) {
      const value = board[next];
      if (value === 0) {
        libertySet.add(next);
      } else if (value === color && !seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return { group, liberties: libertySet.size };
}

/** 尝试落子；不修改传入的棋盘。 */
export function tryPlay(board: number[], color: 1 | -1, x: number, y: number): PlayResult {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) {
    return { ok: false, reason: "occupied" };
  }
  const index = pointIndex(x, y);
  if (board[index] !== 0) return { ok: false, reason: "occupied" };

  const next = board.slice();
  next[index] = color;

  const captured: number[] = [];
  for (const neighbor of neighbors(index)) {
    if (next[neighbor] !== -color) continue;
    const { group, liberties } = groupAndLiberties(next, neighbor);
    if (liberties === 0) captured.push(...group);
  }
  for (const point of captured) next[point] = 0;

  // 提子后自己的棋块仍有气才算合法；否则是自杀。
  const own = groupAndLiberties(next, index);
  if (own.liberties === 0) {
    return { ok: false, reason: "suicide" };
  }

  return { ok: true, board: next, captured: [...new Set(captured)] };
}

/**
 * 只数空（围空）：
 * - 一整块空点只被一种颜色包围 → 这块空点全部算该颜色的目；
 * - 被双方包围 / 没有包围 → 中立；
 * - 棋子本身不计入任何一方。
 */
export function scoreTerritory(board: number[]): TerritoryScore {
  const ownership = new Array<number>(BOARD_POINTS).fill(0);
  const visited = new Array<boolean>(BOARD_POINTS).fill(false);
  let black = 0;
  let white = 0;
  let neutral = 0;

  for (let start = 0; start < BOARD_POINTS; start += 1) {
    if (board[start] !== 0 || visited[start]) continue;
    const region: number[] = [];
    const borders = new Set<number>();
    const stack = [start];
    visited[start] = true;
    while (stack.length > 0) {
      const here = stack.pop()!;
      region.push(here);
      for (const next of neighbors(here)) {
        const value = board[next];
        if (value === 0) {
          if (!visited[next]) {
            visited[next] = true;
            stack.push(next);
          }
        } else {
          borders.add(value);
        }
      }
    }
    const owner = borders.size === 1 ? [...borders][0]! : 0;
    for (const point of region) ownership[point] = owner;
    if (owner === 1) black += region.length;
    else if (owner === -1) white += region.length;
    else neutral += region.length;
  }

  return { black, white, neutral, ownership };
}
