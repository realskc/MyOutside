import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createKernel, type DbAdapter, type Kernel, type SecretCodec } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";
import { USER_ID_PATTERN } from "./accounts.js";

/**
 * 内核管理器（D-0091）：每个用户一个数据库、一份内核。
 * 第一次用时为这个用户建内核、注册子应用、跑迁移；闲置一段时间、且没有进行中的调用时关掉，释放内存和文件句柄。
 */
export interface KernelManagerOptions {
  usersDir: string;
  secrets: SecretCodec;
  registerApps: (kernel: Kernel) => void;
  idleMs?: number;
  now?: () => number;
}

interface Entry {
  kernel: Kernel;
  storage: DbAdapter;
  active: number;
  lastUsed: number;
}

export function createKernelManager(options: KernelManagerOptions) {
  const idleMs = options.idleMs ?? 30 * 60_000;
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry>();

  function open(userId: string): Entry {
    if (!USER_ID_PATTERN.test(userId)) throw new Error(`非法的用户 id：${userId}`);
    const dir = join(options.usersDir, userId);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const storage = createNodeSqliteAdapter({ path: join(dir, "myoutside.db") });
    try {
      const kernel = createKernel({ storage, secrets: options.secrets });
      options.registerApps(kernel);
      kernel.start();
      return { kernel, storage, active: 0, lastUsed: now() };
    } catch (error) {
      storage.close();
      throw error;
    }
  }

  return {
    /** 借用一个用户的内核；用完必须调用 release（调用结束时） */
    acquire(userId: string): { kernel: Kernel; release: () => void } {
      let entry = entries.get(userId);
      if (!entry) {
        entry = open(userId);
        entries.set(userId, entry);
      }
      const held = entry;
      held.active += 1;
      held.lastUsed = now();
      let released = false;
      return {
        kernel: held.kernel,
        release() {
          if (released) return;
          released = true;
          held.active -= 1;
          held.lastUsed = now();
        },
      };
    },

    /** 关掉闲置的内核 */
    sweep(): number {
      let closed = 0;
      for (const [userId, entry] of entries) {
        if (entry.active === 0 && now() - entry.lastUsed >= idleMs) {
          entries.delete(userId);
          entry.storage.close();
          closed += 1;
        }
      }
      return closed;
    },

    /** 正在打开的内核与进行中的调用数（部署前看有没有正在进行的任务） */
    stats(): { open: number; activeCalls: number } {
      let activeCalls = 0;
      for (const entry of entries.values()) activeCalls += entry.active;
      return { open: entries.size, activeCalls };
    },

    closeAll(): void {
      for (const entry of entries.values()) entry.storage.close();
      entries.clear();
    },
  };
}

export type KernelManager = ReturnType<typeof createKernelManager>;
