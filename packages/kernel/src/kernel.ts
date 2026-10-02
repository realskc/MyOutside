import { z } from "zod";
import { createAppDb, createMigrationCtx } from "./appdb.js";
import { KernelError } from "./errors.js";
import type {
  ApiDefinition,
  AppModule,
  DbAdapter,
  KernelResponse,
  Migration,
  ReadContext,
  TxContext,
} from "./types.js";

const MAX_CALL_DEPTH = 8;

export interface KernelOptions {
  storage: DbAdapter;
}

type TxFunction = Extract<ApiDefinition, { kind: "tx" }> & { appId: string };
type ReadFunction = Extract<ApiDefinition, { kind: "read" }> & { appId: string };
type RegisteredFunction = TxFunction | ReadFunction;

/**
 * 创建内核：应用注册 → 迁移 → 处理调用（读直接执行；写经串行队列、单事务执行）。
 */
export function createKernel({ storage }: KernelOptions) {
  const apps = new Map<string, AppModule>();
  const functions = new Map<string, RegisteredFunction>();
  const migrationList: Array<{ appId: string; migration: Migration }> = [];
  let dataVersion = 0;
  let started = false;
  let queue: Promise<void> = Promise.resolve();

  // 平台内置 API
  functions.set("platform.dataVersion", {
    kind: "read",
    appId: "platform",
    input: z.unknown(),
    handler: () => dataVersion,
  });
  functions.set("platform.listApps", {
    kind: "read",
    appId: "platform",
    input: z.unknown(),
    handler: () => [...apps.values()].map((app) => ({ id: app.id, name: app.name })),
  });

  function registerApp(app: AppModule): void {
    if (started) throw new Error("内核已启动，应用必须在 start() 之前注册");
    if (apps.has(app.id)) throw new Error(`应用已注册：${app.id}`);
    apps.set(app.id, app);
    for (const [shortName, def] of Object.entries(app.api)) {
      const fullName = `${app.id}.${shortName}`;
      if (functions.has(fullName)) throw new Error(`函数已注册：${fullName}`);
      functions.set(fullName, { ...def, appId: app.id } as RegisteredFunction);
    }
    for (const migration of app.migrations ?? []) {
      migrationList.push({ appId: app.id, migration });
    }
  }

  function start(): void {
    if (started) return;
    storage.execute(
      `CREATE TABLE IF NOT EXISTS platform_migration (
         app_id TEXT NOT NULL,
         migration_id TEXT NOT NULL,
         applied_at INTEGER NOT NULL,
         PRIMARY KEY (app_id, migration_id)
       )`,
    );
    storage.transaction(() => {
      for (const { appId, migration } of migrationList) {
        const row = storage.select<{ c: number }>(
          "SELECT COUNT(*) AS c FROM platform_migration WHERE app_id = ? AND migration_id = ?",
          [appId, migration.id],
        )[0];
        if ((row?.c ?? 0) > 0) continue;
        migration.up(createMigrationCtx(storage, appId));
        storage.execute("INSERT INTO platform_migration (app_id, migration_id, applied_at) VALUES (?, ?, ?)", [
          appId,
          migration.id,
          Date.now(),
        ]);
      }
    });
    started = true;
  }

  function makeReadContext(appId: string, depth: number): ReadContext {
    return {
      appId,
      db: createAppDb(storage, appId),
      async call(name, payload) {
        const fn = functions.get(name);
        if (!fn) throw new KernelError("UNKNOWN_FUNCTION", `未知函数：${name}`);
        if (fn.kind !== "read") throw new KernelError("TX_CALL_INVALID", `读上下文只能调用读函数：${name}`);
        if (depth >= MAX_CALL_DEPTH)
          throw new KernelError("CALL_DEPTH_EXCEEDED", `调用深度超过 ${MAX_CALL_DEPTH}：${name}`);
        const parsed = fn.input.safeParse(payload);
        if (!parsed.success) throw new KernelError("VALIDATION", `参数校验失败：${name}`, parsed.error.issues);
        return fn.handler(makeReadContext(fn.appId, depth + 1), parsed.data);
      },
    };
  }

  function runTx(fn: TxFunction, input: unknown, depth: number): unknown {
    if (depth >= MAX_CALL_DEPTH)
      throw new KernelError("CALL_DEPTH_EXCEEDED", `调用深度超过 ${MAX_CALL_DEPTH}：${fn.appId}`);
    const ctx: TxContext = {
      appId: fn.appId,
      db: createAppDb(storage, fn.appId),
      call(name, payload) {
        const target = functions.get(name);
        if (!target) throw new KernelError("UNKNOWN_FUNCTION", `未知函数：${name}`);
        if (target.kind !== "tx")
          throw new KernelError("TX_CALL_INVALID", `事务上下文只能调用事务函数：${name}`);
        const parsed = target.input.safeParse(payload);
        if (!parsed.success) throw new KernelError("VALIDATION", `参数校验失败：${name}`, parsed.error.issues);
        return runTx(target, parsed.data, depth + 1);
      },
    };
    const result = fn.handler(ctx, input);
    if (result && typeof (result as { then?: unknown }).then === "function") {
      throw new KernelError("INTERNAL", `事务函数必须同步（返回了 Promise）：${fn.appId}`);
    }
    return result;
  }

  function enqueue<T>(work: () => T): Promise<T> {
    const run = queue.then(work);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function handle(request: { call: string; payload?: unknown }): Promise<KernelResponse> {
    const fn = functions.get(request.call);
    if (!fn) {
      return {
        ok: false,
        error: { code: "UNKNOWN_FUNCTION", message: `未知函数：${request.call}` },
        dataVersion,
      };
    }
    const parsed = fn.input.safeParse(request.payload);
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: "VALIDATION", message: "参数校验失败", details: parsed.error.issues },
        dataVersion,
      };
    }
    try {
      if (fn.kind === "read") {
        const result = await fn.handler(makeReadContext(fn.appId, 0), parsed.data);
        return { ok: true, result, dataVersion };
      }
      const result = await enqueue(() => {
        const r = storage.transaction(() => runTx(fn, parsed.data, 0));
        dataVersion += 1;
        return r;
      });
      return { ok: true, result, dataVersion };
    } catch (cause) {
      const error =
        cause instanceof KernelError
          ? { code: cause.code, message: cause.message, details: cause.details }
          : { code: "INTERNAL", message: cause instanceof Error ? cause.message : String(cause) };
      return { ok: false, error, dataVersion };
    }
  }

  return {
    registerApp,
    start,
    handle,
    get dataVersion(): number {
      return dataVersion;
    },
    listFunctions(): string[] {
      return [...functions.keys()];
    },
    listApps(): Array<{ id: string; name: string }> {
      return [...apps.values()].map((app) => ({ id: app.id, name: app.name }));
    },
  };
}

export type Kernel = ReturnType<typeof createKernel>;
