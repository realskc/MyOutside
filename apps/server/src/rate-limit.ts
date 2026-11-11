/**
 * 登录限次数（D-0093；作者：人类还是很笨的，输错 20 次也可能是正常人类）：
 * - 同一地址 + 同一用户名：前 10 次输错不用等；之后每错一次等待翻倍（1、2、4…… 秒），最长 1 分钟；登录成功清零；
 * - 账号永远不锁；
 * - 封地址交给防火墙（fail2ban 读日志）：这里只负责发现「明显是程序」的地址并写日志——
 *   10 分钟内输错 100 次以上，或 10 分钟内试了 20 个以上不同的用户名。
 */
export const FREE_FAILURES = 10;
export const MAX_DELAY_MS = 60_000;
const WINDOW_MS = 10 * 60_000;
export const BAN_FAILURES = 100;
export const BAN_DISTINCT_USERNAMES = 20;

interface PairState {
  failures: number;
  nextAllowedAt: number;
  touchedAt: number;
}

interface AddressState {
  failures: number[];
  usernames: Map<string, number>;
  reported: boolean;
}

export type LimitCheck = { ok: true } | { ok: false; retryAfterMs: number };

export function delayAfter(failures: number): number {
  if (failures <= FREE_FAILURES) return 0;
  return Math.min(MAX_DELAY_MS, 1000 * 2 ** (failures - FREE_FAILURES - 1));
}

export function createLoginLimiter(options: { now?: () => number; onBanRequest?: (address: string, reason: string) => void } = {}) {
  const now = options.now ?? Date.now;
  const pairs = new Map<string, PairState>();
  const addresses = new Map<string, AddressState>();
  const pairKey = (address: string, username: string) => `${address}\u0000${username}`;

  function prune(state: AddressState, at: number): void {
    while (state.failures.length > 0 && state.failures[0]! <= at - WINDOW_MS) state.failures.shift();
    for (const [name, last] of state.usernames) if (last <= at - WINDOW_MS) state.usernames.delete(name);
  }

  return {
    check(address: string, username: string): LimitCheck {
      const state = pairs.get(pairKey(address, username));
      const at = now();
      if (!state || state.nextAllowedAt <= at) return { ok: true };
      return { ok: false, retryAfterMs: state.nextAllowedAt - at };
    },

    fail(address: string, username: string): void {
      const at = now();
      const key = pairKey(address, username);
      const state = pairs.get(key) ?? { failures: 0, nextAllowedAt: 0, touchedAt: at };
      state.failures += 1;
      state.nextAllowedAt = at + delayAfter(state.failures);
      state.touchedAt = at;
      pairs.set(key, state);

      const addressState: AddressState = addresses.get(address) ?? { failures: [], usernames: new Map(), reported: false };
      prune(addressState, at);
      addressState.failures.push(at);
      addressState.usernames.set(username, at);
      if (addressState.failures.length < BAN_FAILURES && addressState.usernames.size < BAN_DISTINCT_USERNAMES) addressState.reported = false;
      if (!addressState.reported) {
        if (addressState.failures.length >= BAN_FAILURES) {
          addressState.reported = true;
          options.onBanRequest?.(address, `${addressState.failures.length} failures in 10 minutes`);
        } else if (addressState.usernames.size >= BAN_DISTINCT_USERNAMES) {
          addressState.reported = true;
          options.onBanRequest?.(address, `${addressState.usernames.size} usernames in 10 minutes`);
        }
      }
      addresses.set(address, addressState);
    },

    succeed(address: string, username: string): void {
      pairs.delete(pairKey(address, username));
    },

    /** 清掉一小时没动静的记录，防止记录本身被撑大 */
    sweep(): void {
      const at = now();
      for (const [key, state] of pairs) if (state.touchedAt <= at - 3600_000 && state.nextAllowedAt <= at) pairs.delete(key);
      for (const [address, state] of addresses) {
        prune(state, at);
        if (state.failures.length === 0) addresses.delete(address);
      }
    },

    get size(): number {
      return pairs.size + addresses.size;
    },
  };
}

export type LoginLimiter = ReturnType<typeof createLoginLimiter>;
