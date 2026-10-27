import { z } from "zod";
import { createAppDb, createMigrationCtx, createReadonlyAppDb } from "./appdb.js";
import { KernelError } from "./errors.js";
import { createPlatformAiDefinition, type UsageRecord } from "./platform-ai.js";
import { createWebFetchDefinition, createWebSearchDefinition } from "./platform-web.js";
import { estimateCost } from "./pricing.js";
import type {
  ApiDefinition,
  AppManifest,
  AppModule,
  AsyncContext,
  DbAdapter,
  HandleOptions,
  KernelResponse,
  Migration,
  ReadContext,
  TxContext,
} from "./types.js";

const MAX_CALL_DEPTH = 8;
const PROTOCOL_VERSION = 1;

/** 调用者：外壳（平台自身的界面） */
export const SHELL_CALLER = "shell";
/** 平台 API 的拥有者 */
const PLATFORM = "platform";

/** 凭据类平台设置：任何调用者都读不到值（外壳也只能知道是否已设置） */
const CREDENTIAL_SETTINGS = new Set(["ai.deepseek.apiKey"]);

const ManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  protocolVersion: z.number().int(),
  ui: z.string().optional(),
  backend: z.string().optional(),
  owns: z.array(z.string()).optional(),
  uses: z.array(z.string()).optional(),
});

export interface KernelOptions {
  storage: DbAdapter;
}

/** 平台 API 的访问规则：apps = 子应用可调用（需在清单 uses 里声明）；shell = 只有外壳与平台内部 */
type PlatformAccess = "apps" | "shell";

type RegisteredFunction = ApiDefinition & { appId: string; access?: PlatformAccess };

/** 一次调用在内核里的身份与运行期附带信息 */
interface CallFrame {
  /** 直接调用方：子应用 id、"shell"，或 undefined（平台内部，受信任） */
  caller: string | undefined;
  depth: number;
  emit: (event: unknown) => void;
  signal: AbortSignal;
}

const NEVER_ABORTED = new AbortController().signal;
const NOOP = () => {};

/**
 * 创建内核：应用注册 → 迁移 → 处理调用。
 * - 只读 API 直接执行；事务 API 经串行队列、单事务执行；普通的异步函数直接执行，写入经本应用的事务 API；
 * - 每次调用都按调用者检查权限（D-0053、D-0058、D-0063）。
 */
export function createKernel({ storage }: KernelOptions) {
  const apps = new Map<string, AppModule>();
  const manifests = new Map<string, AppManifest>();
  const functions = new Map<string, RegisteredFunction>();
  const migrationList: Array<{ appId: string; migration: Migration }> = [];
  let dataVersion = 0;
  let started = false;
  let queue: Promise<void> = Promise.resolve();

  function definePlatform(name: string, access: PlatformAccess, def: ApiDefinition): void {
    functions.set(name, { ...def, appId: PLATFORM, access } as RegisteredFunction);
  }

  // —— 平台 API ——
  definePlatform("platform.dataVersion", "apps", {
    kind: "read",
    visibility: "public",
    input: z.unknown(),
    handler: () => dataVersion,
  });
  definePlatform("platform.listApps", "apps", {
    kind: "read",
    visibility: "public",
    input: z.unknown(),
    handler: () => [...apps.values()].map((app) => ({ id: app.id, name: app.name })),
  });
  definePlatform("platform.settings.get", "apps", {
    kind: "read",
    visibility: "public",
    input: z.object({ key: z.string().min(1) }),
    handler: (_ctx, input: { key: string }) => {
      const row = storage.select<{ value: string }>("SELECT value FROM platform_setting WHERE key = ?", [input.key])[0];
      const value = row ? (JSON.parse(row.value) as unknown) : null;
      const isSet = value !== null && value !== "";
      if (CREDENTIAL_SETTINGS.has(input.key)) return { value: null, isSet };
      return { value, isSet };
    },
  });
  definePlatform("platform.settings.set", "shell", {
    kind: "tx",
    visibility: "public",
    input: z.object({ key: z.string().min(1), value: z.unknown() }),
    handler: (_ctx, input: { key: string; value: unknown }) => {
      const serialized = JSON.stringify(input.value ?? null);
      const existing = storage.select<{ key: string }>("SELECT key FROM platform_setting WHERE key = ?", [input.key])[0];
      if (existing) {
        storage.execute("UPDATE platform_setting SET value = ?, updated_at = ? WHERE key = ?", [
          serialized,
          Date.now(),
          input.key,
        ]);
      } else {
        storage.execute("INSERT INTO platform_setting (key, value, updated_at) VALUES (?, ?, ?)", [
          input.key,
          serialized,
          Date.now(),
        ]);
      }
      return { ok: true as const };
    },
  });
  /** 平台用量按调用者记录（经写队列写入；不改变 DataVersion）；写入时按当时的价格估算花费（D-0074） */
  function recordUsage(record: UsageRecord): void {
    const usage = record.usage ?? null;
    const createdAt = Date.now();
    const cost = estimateCost({
      kind: record.kind,
      model: record.model ?? null,
      promptTokens: usage?.promptTokens ?? null,
      completionTokens: usage?.completionTokens ?? null,
      cacheHitTokens: usage?.cacheHitTokens ?? null,
      createdAt,
    });
    void enqueue(() =>
      storage.execute(
        `INSERT INTO platform_usage
           (caller, kind, model, prompt_tokens, completion_tokens, reasoning_tokens, cache_hit_tokens, cost_yuan, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.caller ?? PLATFORM,
          record.kind,
          record.model ?? null,
          usage?.promptTokens ?? null,
          usage?.completionTokens ?? null,
          usage?.reasoningTokens ?? null,
          usage?.cacheHitTokens ?? null,
          cost,
          createdAt,
        ],
      ),
    ).catch(() => {
      /* 计量失败不影响调用结果 */
    });
  }

  definePlatform("platform.ai.chat", "apps", createPlatformAiDefinition(storage, recordUsage));
  definePlatform("platform.web.search", "apps", createWebSearchDefinition(storage, recordUsage));
  definePlatform("platform.web.fetch", "apps", createWebFetchDefinition(storage, recordUsage));
  /** 用量与估算花费，按调用者（子应用）汇总（D-0074）；只给外壳 */
  definePlatform("platform.usage.summary", "shell", {
    kind: "read",
    visibility: "public",
    input: z.object({ since: z.number().int().optional() }),
    handler: (_ctx, input: { since?: number }) => {
      const rows = storage.select<{
        caller: string;
        ai_calls: number;
        prompt_tokens: number;
        cache_hit_tokens: number;
        completion_tokens: number;
        reasoning_tokens: number;
        searches: number;
        fetches: number;
        cost_yuan: number;
      }>(
        `SELECT caller,
                SUM(kind = 'ai.chat') AS ai_calls,
                COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                COALESCE(SUM(cache_hit_tokens), 0) AS cache_hit_tokens,
                COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
                SUM(kind = 'web.search') AS searches,
                SUM(kind = 'web.fetch') AS fetches,
                COALESCE(SUM(cost_yuan), 0) AS cost_yuan
           FROM platform_usage
          WHERE created_at >= ?
          GROUP BY caller
          ORDER BY cost_yuan DESC`,
        [input.since ?? 0],
      );
      return rows.map((row) => ({
        caller: row.caller,
        aiCalls: Number(row.ai_calls),
        promptTokens: Number(row.prompt_tokens),
        cacheHitTokens: Number(row.cache_hit_tokens),
        completionTokens: Number(row.completion_tokens),
        reasoningTokens: Number(row.reasoning_tokens),
        searches: Number(row.searches),
        fetches: Number(row.fetches),
        costYuan: Number(row.cost_yuan),
      }));
    },
  });

  function registerApp(app: AppModule, manifest?: AppManifest): void {
    if (started) throw new Error("内核已启动，应用必须在 start() 之前注册");
    if (apps.has(app.id)) throw new Error(`应用已注册：${app.id}`);
    if (manifest) {
      const parsed = ManifestSchema.parse(manifest);
      if (parsed.id !== app.id) throw new Error(`清单 id（${parsed.id}）与应用 id（${app.id}）不一致`);
      if (parsed.protocolVersion !== PROTOCOL_VERSION) {
        throw new Error(`应用 ${app.id} 的协议版本 ${parsed.protocolVersion} 不受支持（当前为 ${PROTOCOL_VERSION}）`);
      }
      manifests.set(app.id, parsed);
    }
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
    storage.execute(
      `CREATE TABLE IF NOT EXISTS platform_setting (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
    );
    storage.execute(
      `CREATE TABLE IF NOT EXISTS platform_usage (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         caller TEXT NOT NULL,
         kind TEXT NOT NULL,
         model TEXT,
         prompt_tokens INTEGER,
         completion_tokens INTEGER,
         reasoning_tokens INTEGER,
         cache_hit_tokens INTEGER,
         cost_yuan REAL,
         created_at INTEGER NOT NULL
       )`,
    );
    // 早期的用量表没有花费列：补上，并按每条记录当时的时段补算一次
    const usageColumns = storage.select<{ name: string }>("PRAGMA table_info(platform_usage)").map((column) => column.name);
    if (!usageColumns.includes("cost_yuan")) {
      storage.execute("ALTER TABLE platform_usage ADD COLUMN cost_yuan REAL");
      const old = storage.select<{
        id: number;
        kind: string;
        model: string | null;
        prompt_tokens: number | null;
        completion_tokens: number | null;
        cache_hit_tokens: number | null;
        created_at: number;
      }>("SELECT id, kind, model, prompt_tokens, completion_tokens, cache_hit_tokens, created_at FROM platform_usage");
      storage.transaction(() => {
        for (const row of old) {
          const cost = estimateCost({
            kind: row.kind,
            model: row.model,
            promptTokens: row.prompt_tokens,
            completionTokens: row.completion_tokens,
            cacheHitTokens: row.cache_hit_tokens,
            createdAt: row.created_at,
          });
          storage.execute("UPDATE platform_usage SET cost_yuan = ? WHERE id = ?", [cost, row.id]);
        }
      });
    }
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

  /** 权限检查：调用者能不能调用这个函数 */
  function checkAccess(caller: string | undefined, name: string, fn: RegisteredFunction): void {
    // 平台内部（直接调用内核）受信任
    if (caller === undefined) return;
    // 外壳是平台自身的界面：可以调用平台 API；不调用子应用的 API
    if (caller === SHELL_CALLER) {
      if (fn.appId === PLATFORM) return;
      throw new KernelError("FORBIDDEN", `外壳不能调用子应用的 API：${name}`);
    }
    // 调用自己的函数不受限（含内部 API 与异步函数）
    if (fn.appId === caller) return;

    const uses = manifests.get(caller)?.uses ?? [];
    if (fn.appId === PLATFORM) {
      if (fn.access === "shell") throw new KernelError("FORBIDDEN", `只有外壳可以调用：${name}`);
      if (!uses.includes(name)) throw new KernelError("FORBIDDEN", `${caller} 未在清单中声明使用：${name}`);
      return;
    }
    if (fn.kind === "async" || fn.visibility !== "public") {
      throw new KernelError("FORBIDDEN", `${name} 是内部 API，其他子应用不能调用`);
    }
    if (!uses.includes(name)) throw new KernelError("FORBIDDEN", `${caller} 未在清单中声明使用：${name}`);
  }

  function lookup(name: string): RegisteredFunction {
    const fn = functions.get(name);
    if (!fn) throw new KernelError("UNKNOWN_FUNCTION", `未知函数：${name}`);
    return fn;
  }

  function validate(fn: RegisteredFunction, name: string, payload: unknown): unknown {
    const parsed = fn.input.safeParse(payload);
    if (!parsed.success) throw new KernelError("VALIDATION", `参数校验失败：${name}`, parsed.error.issues);
    return parsed.data;
  }

  function nested(frame: CallFrame, caller: string, name: string): CallFrame {
    if (frame.depth + 1 >= MAX_CALL_DEPTH) {
      throw new KernelError("CALL_DEPTH_EXCEEDED", `调用深度超过 ${MAX_CALL_DEPTH}：${name}`);
    }
    return { ...frame, caller, depth: frame.depth + 1 };
  }

  function makeReadContext(fn: RegisteredFunction, frame: CallFrame): ReadContext {
    return {
      appId: fn.appId,
      caller: frame.caller,
      db: createReadonlyAppDb(storage, fn.appId),
      emit: frame.emit,
      signal: frame.signal,
      async call(name, payload) {
        const target = lookup(name);
        if (target.kind !== "read") throw new KernelError("TX_CALL_INVALID", `只读 API 里只能调用只读 API：${name}`);
        const child = nested(frame, fn.appId, name);
        checkAccess(fn.appId, name, target);
        return runRead(target, validate(target, name, payload), child);
      },
    };
  }

  function makeAsyncContext(fn: RegisteredFunction, frame: CallFrame): AsyncContext {
    return {
      appId: fn.appId,
      caller: frame.caller,
      db: createReadonlyAppDb(storage, fn.appId),
      emit: frame.emit,
      signal: frame.signal,
      async call(name, payload) {
        const target = lookup(name);
        if ((target.kind === "tx" || target.kind === "async") && target.appId !== fn.appId) {
          throw new KernelError("TX_CALL_INVALID", `异步函数只能调用本子应用的事务 API / 异步函数：${name}`);
        }
        const child = nested(frame, fn.appId, name);
        checkAccess(fn.appId, name, target);
        return dispatch(target, validate(target, name, payload), child);
      },
    };
  }

  function runTx(fn: RegisteredFunction, input: unknown, depth: number): unknown {
    if (depth >= MAX_CALL_DEPTH) throw new KernelError("CALL_DEPTH_EXCEEDED", `调用深度超过 ${MAX_CALL_DEPTH}：${fn.appId}`);
    const ctx: TxContext = {
      appId: fn.appId,
      db: createAppDb(storage, fn.appId),
      call(name, payload) {
        const target = lookup(name);
        if (target.kind !== "tx") throw new KernelError("TX_CALL_INVALID", `事务 API 里只能调用事务 API：${name}`);
        checkAccess(fn.appId, name, target);
        return runTx(target, validate(target, name, payload), depth + 1);
      },
    };
    const result = (fn.handler as (c: TxContext, i: unknown) => unknown)(ctx, input);
    if (result && typeof (result as { then?: unknown }).then === "function") {
      throw new KernelError("INTERNAL", `事务 API 必须同步（返回了 Promise）：${fn.appId}`);
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

  /**
   * 事务 API：进写队列，单事务执行，成功后 DataVersion + 1。
   * 取消只是通知正在执行的函数「该停了」；它停下来之后要不要再保存一次（例如保存已生成的部分），由它自己决定，
   * 所以这里不因取消而拒绝写入。
   */
  function executeTx(fn: RegisteredFunction, input: unknown, frame: CallFrame): Promise<unknown> {
    return enqueue(() => {
      const result = storage.transaction(() => runTx(fn, input, frame.depth));
      dataVersion += 1;
      return result;
    });
  }

  async function runRead(fn: RegisteredFunction, input: unknown, frame: CallFrame): Promise<unknown> {
    return (fn.handler as (c: ReadContext, i: unknown) => unknown)(makeReadContext(fn, frame), input);
  }

  async function dispatch(fn: RegisteredFunction, input: unknown, frame: CallFrame): Promise<unknown> {
    if (fn.kind === "read") return runRead(fn, input, frame);
    if (fn.kind === "tx") return executeTx(fn, input, frame);
    return (fn.handler as (c: AsyncContext, i: unknown) => Promise<unknown>)(makeAsyncContext(fn, frame), input);
  }

  async function handle(request: { call: string; payload?: unknown }, options: HandleOptions = {}): Promise<KernelResponse> {
    const frame: CallFrame = {
      caller: options.caller,
      depth: 0,
      emit: options.emit ?? NOOP,
      signal: options.signal ?? NEVER_ABORTED,
    };
    try {
      const fn = lookup(request.call);
      if (options.remote) {
        if (frame.caller === undefined) throw new KernelError("FORBIDDEN", "远程调用必须带调用者");
        if (fn.appId === PLATFORM && fn.access === "shell") {
          throw new KernelError("FORBIDDEN", `远程调用不能使用只给外壳的 API：${request.call}`);
        }
      }
      checkAccess(frame.caller, request.call, fn);
      const input = validate(fn, request.call, request.payload);
      const result = await dispatch(fn, input, frame);
      return { ok: true, result, dataVersion };
    } catch (cause) {
      const error =
        cause instanceof KernelError
          ? { code: cause.code, message: cause.message, details: cause.details }
          : frame.signal.aborted
            ? { code: "ABORTED", message: "调用已取消" }
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
