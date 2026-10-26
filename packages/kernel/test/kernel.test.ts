import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createKernel,
  defineAsync,
  defineRead,
  defineTx,
  type AppManifest,
  type AppModule,
  type DbAdapter,
  type SqlValue,
} from "../src/index.js";

/** 测试用的最小 SQLite 适配器（node:sqlite） */
function createMemoryAdapter(): DbAdapter {
  const db = new DatabaseSync(":memory:");
  const normalize = (params: SqlValue[]) =>
    params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p === undefined ? null : p));
  return {
    execute(sql, params = []) {
      const r = db.prepare(sql).run(...normalize(params));
      return { changes: Number(r.changes), lastInsertRowid: (r.lastInsertRowid ?? 0) as number | bigint };
    },
    select(sql, params = []) {
      return db.prepare(sql).all(...normalize(params)) as never[];
    },
    transaction(fn) {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        try {
          db.exec("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw e;
      }
    },
    close() {
      db.close();
    },
  };
}

const notesApp: AppModule = {
  id: "notes",
  name: "Notes",
  owns: ["note"],
  migrations: [
    {
      id: "0001_init",
      up: (ctx) => {
        ctx.createTable("note", "id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at INTEGER NOT NULL");
      },
    },
  ],
  api: {
    createNote: defineTx(
      z.object({ title: z.string().min(1) }),
      (ctx, input) => {
        const id = randomUUID();
        ctx.db.insert("note", { id, title: input.title, created_at: Date.now() });
        return { id };
      },
      { visibility: "public" },
    ),
    listNotes: defineRead(z.object({}), (ctx) => ctx.db.all("note", {}, { orderBy: "created_at" }), {
      visibility: "public",
    }),
    fail: defineTx(
      z.object({}),
      () => {
        throw new Error("boom");
      },
      { visibility: "public" },
    ),
    /** 内部 API：其他子应用不能调用 */
    secret: defineRead(z.object({}), () => "secret"),
    /** 只读 API 试图直接写数据 */
    sneakyWrite: defineRead(z.object({}), (ctx) => {
      ctx.db.insert("note", { id: randomUUID(), title: "sneaky", created_at: Date.now() });
      return "written";
    }),
    /** 普通的异步函数：等一下外部，再调用本应用的事务 API 写入两次（两个短事务） */
    importTwo: defineAsync(z.object({ title: z.string().min(1) }), async (ctx, input) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const a = (await ctx.call("notes.createNote", { title: `${input.title}-1` })) as { id: string };
      ctx.emit({ type: "progress", done: 1 });
      const b = (await ctx.call("notes.createNote", { title: `${input.title}-2` })) as { id: string };
      return { ids: [a.id, b.id] };
    }),
    /** 普通的异步函数：中途失败，已完成的短事务不回滚 */
    importThenFail: defineAsync(z.object({}), async (ctx) => {
      await ctx.call("notes.createNote", { title: "kept" });
      await ctx.call("notes.fail", {});
      return "unreachable";
    }),
    /** 普通的异步函数：等待取消 */
    waitForever: defineAsync(z.object({}), async (ctx) => {
      await new Promise((_resolve, reject) => {
        ctx.signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
      return "unreachable";
    }),
  },
};

const tasksApp: AppModule = {
  id: "tasks",
  name: "Tasks",
  owns: ["task"],
  migrations: [
    {
      id: "0001_init",
      up: (ctx) => {
        ctx.createTable("task", "id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at INTEGER NOT NULL");
      },
    },
  ],
  api: {
    createNoteWithTask: defineTx(z.object({ title: z.string().min(1) }), (ctx, input) => {
      const note = ctx.call("notes.createNote", { title: input.title }) as { id: string };
      const id = randomUUID();
      ctx.db.insert("task", { id, title: input.title, created_at: Date.now() });
      return { noteId: note.id, taskId: id };
    }),
    createTaskThenFail: defineTx(z.object({ title: z.string().min(1) }), (ctx, input) => {
      const id = randomUUID();
      ctx.db.insert("task", { id, title: input.title, created_at: Date.now() });
      ctx.call("notes.fail", {});
      return { taskId: id };
    }),
    callReadFromTx: defineTx(z.object({}), (ctx) => ctx.call("notes.listNotes", {})),
    callSecret: defineRead(z.object({}), (ctx) => ctx.call("notes.secret", {})),
    callUndeclared: defineRead(z.object({}), (ctx) => ctx.call("seed.listItems", {})),
    callAi: defineRead(z.object({}), (ctx) => ctx.call("platform.ai.chat", { messages: [{ role: "user", content: "hi" }] })),
  },
};

const tasksManifest: AppManifest = {
  id: "tasks",
  name: "Tasks",
  protocolVersion: 1,
  uses: ["notes.createNote", "notes.fail", "notes.listNotes", "notes.secret"],
};

const loopApp: AppModule = {
  id: "loop",
  name: "Loop",
  api: {
    ping: defineTx(z.object({ n: z.number().int() }), (ctx, input) => ctx.call("loop.pong", { n: input.n + 1 })),
    pong: defineTx(z.object({ n: z.number().int() }), (ctx, input) => ctx.call("loop.ping", { n: input.n + 1 })),
  },
};

const seedApp: AppModule = {
  id: "seed",
  name: "Seed",
  owns: ["item"],
  migrations: [
    {
      id: "0001_init",
      up: (ctx) => {
        ctx.createTable("item", "id TEXT PRIMARY KEY, name TEXT NOT NULL");
        ctx.insert("item", { id: "1", name: "alpha" });
        ctx.insert("item", { id: "2", name: "beta" });
      },
    },
  ],
  api: {
    listItems: defineRead(z.object({}), (ctx) => ctx.db.all("item", {}, { orderBy: "id" })),
  },
};

function setup() {
  const storage = createMemoryAdapter();
  const kernel = createKernel({ storage });
  kernel.registerApp(notesApp);
  kernel.registerApp(tasksApp, tasksManifest);
  kernel.registerApp(loopApp);
  kernel.registerApp(seedApp);
  kernel.start();
  return { storage, kernel };
}

describe("kernel", () => {
  it("迁移建表；事务写入 + 读函数读取；DataVersion 递增", async () => {
    const { storage, kernel } = setup();
    expect(kernel.dataVersion).toBe(0);

    const created = await kernel.handle({ call: "notes.createNote", payload: { title: "hello" } });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(kernel.dataVersion).toBe(1);

    const listed = await kernel.handle({ call: "notes.listNotes", payload: {} });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.result).toHaveLength(1);
    // 读不改变版本号
    expect(kernel.dataVersion).toBe(1);

    // 物理表名带应用前缀
    const rows = storage.select<{ c: number }>("SELECT COUNT(*) AS c FROM notes__note");
    expect(rows[0]?.c).toBe(1);
  });

  it("迁移内种子数据：insert 自动加应用前缀", async () => {
    const { storage, kernel } = setup();
    expect(storage.select<{ c: number }>("SELECT COUNT(*) AS c FROM seed__item")[0]?.c).toBe(2);
    const listed = await kernel.handle({ call: "seed.listItems", payload: {} });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.result).toEqual([
      { id: "1", name: "alpha" },
      { id: "2", name: "beta" },
    ]);
  });

  it("跨应用事务：tx.call 同一个事务，两边都写入", async () => {
    const { storage, kernel } = setup();
    const r = await kernel.handle({ call: "tasks.createNoteWithTask", payload: { title: "shared" } });
    expect(r.ok).toBe(true);
    expect(storage.select<{ c: number }>("SELECT COUNT(*) AS c FROM notes__note")[0]?.c).toBe(1);
    expect(storage.select<{ c: number }>("SELECT COUNT(*) AS c FROM tasks__task")[0]?.c).toBe(1);
  });

  it("失败回滚：事务中任一失败 → 全部不落库", async () => {
    const { storage, kernel } = setup();
    const r = await kernel.handle({ call: "tasks.createTaskThenFail", payload: { title: "x" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("INTERNAL");
    expect(storage.select<{ c: number }>("SELECT COUNT(*) AS c FROM tasks__task")[0]?.c).toBe(0);
    expect(storage.select<{ c: number }>("SELECT COUNT(*) AS c FROM notes__note")[0]?.c).toBe(0);
  });

  it("参数校验失败 → VALIDATION", async () => {
    const { kernel } = setup();
    const r = await kernel.handle({ call: "notes.createNote", payload: { title: "" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("VALIDATION");
  });

  it("未知函数 → UNKNOWN_FUNCTION", async () => {
    const { kernel } = setup();
    const r = await kernel.handle({ call: "nope.nothing", payload: {} });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("UNKNOWN_FUNCTION");
  });

  it("事务上下文调用读函数 → TX_CALL_INVALID", async () => {
    const { kernel } = setup();
    const r = await kernel.handle({ call: "tasks.callReadFromTx", payload: {} });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("TX_CALL_INVALID");
  });

  it("调用深度保护", async () => {
    const { kernel } = setup();
    const r = await kernel.handle({ call: "loop.ping", payload: { n: 0 } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("CALL_DEPTH_EXCEEDED");
  });

  it("迁移幂等：同一存储再次启动不会重复执行", () => {
    const storage = createMemoryAdapter();
    const first = createKernel({ storage });
    first.registerApp(notesApp);
    first.start();
    const second = createKernel({ storage });
    second.registerApp(notesApp);
    second.start();
    const rows = storage.select<{ c: number }>("SELECT COUNT(*) AS c FROM platform_migration");
    expect(rows[0]?.c).toBe(1);
  });

  it("平台内置 API：platform.dataVersion", async () => {
    const { kernel } = setup();
    await kernel.handle({ call: "notes.createNote", payload: { title: "v" } });
    const r = await kernel.handle({ call: "platform.dataVersion", payload: undefined });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result).toBe(1);
  });

  it("平台 AI：未配置 key 时返回 PRECONDITION", async () => {
    const { kernel } = setup();
    const r = await kernel.handle({
      call: "platform.ai.chat",
      payload: { messages: [{ role: "user", content: "hi" }] },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("PRECONDITION");
  });

  it("平台 AI：工具循环消息透传（assistant.tool_calls / tool），响应 toolCalls 映射", async () => {
    const { kernel } = setup();
    await kernel.handle({
      call: "platform.settings.set",
      payload: { key: "ai.deepseek.apiKey", value: "test-key" },
    });

    let captured: { messages?: Array<Record<string, unknown>> } = {};
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      captured = JSON.parse(init.body) as typeof captured;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: "deepseek-flash",
          choices: [
            {
              message: {
                content: "",
                tool_calls: [{ id: "call_1", type: "function", function: { name: "submit", arguments: "{}" } }],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        text: async () => "",
      };
    });

    try {
      const r = await kernel.handle({
        call: "platform.ai.chat",
        payload: {
          messages: [
            { role: "user", content: "开始" },
            {
              role: "assistant",
              tool_calls: [{ id: "call_1", type: "function", function: { name: "note", arguments: "{}" } }],
            },
            { role: "tool", tool_call_id: "call_1", content: "已记录" },
          ],
        },
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const out = r.result as { toolCalls: Array<{ id: string }> };
      expect(out.toolCalls.map((call) => call.id)).toEqual(["call_1"]);

      const messages = captured.messages ?? [];
      expect(messages).toHaveLength(3);
      expect(messages[1]?.tool_calls).toBeTruthy();
      expect(messages[1]?.content).toBe(null); // assistant 省略 content 时补 null
      expect(messages[2]).toMatchObject({ role: "tool", tool_call_id: "call_1", content: "已记录" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("平台 AI：非法工具消息 → VALIDATION（tool 缺 tool_call_id；assistant 两者皆空）", async () => {
    const { kernel } = setup();

    const missingId = await kernel.handle({
      call: "platform.ai.chat",
      payload: { messages: [{ role: "tool", content: "x" }] },
    });
    expect(missingId.ok).toBe(false);
    if (missingId.ok) return;
    expect(missingId.error.code).toBe("VALIDATION");

    const emptyAssistant = await kernel.handle({
      call: "platform.ai.chat",
      payload: { messages: [{ role: "assistant" }] },
    });
    expect(emptyAssistant.ok).toBe(false);
    if (emptyAssistant.ok) return;
    expect(emptyAssistant.error.code).toBe("VALIDATION");
  });

  it("平台设置：set/get，且同一存储上的新内核可见（持久化）", async () => {
    const storage = createMemoryAdapter();
    const first = createKernel({ storage });
    first.registerApp(notesApp);
    first.start();

    const before = await first.handle({ call: "platform.settings.get", payload: { key: "ui.language" } });
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    expect((before.result as { value: unknown }).value).toBe(null);

    const set = await first.handle({
      call: "platform.settings.set",
      payload: { key: "ui.language", value: "en" },
    });
    expect(set.ok).toBe(true);

    const second = createKernel({ storage });
    second.registerApp(notesApp);
    second.start();
    const after = await second.handle({ call: "platform.settings.get", payload: { key: "ui.language" } });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect((after.result as { value: unknown }).value).toBe("en");
  });
  it("权限：调用其他子应用的内部 API → FORBIDDEN（即使在清单里声明了）", async () => {
    const { kernel } = setup();
    const r = await kernel.handle({ call: "tasks.callSecret", payload: {} });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("FORBIDDEN");
  });

  it("权限：未在清单中声明的跨应用调用 → FORBIDDEN；没有清单的子应用不能调用平台 API", async () => {
    const { kernel } = setup();
    const undeclared = await kernel.handle({ call: "tasks.callUndeclared", payload: {} });
    expect(undeclared.ok).toBe(false);
    if (undeclared.ok) return;
    expect(undeclared.error.code).toBe("FORBIDDEN");

    const ai = await kernel.handle({ call: "tasks.callAi", payload: {} });
    expect(ai.ok).toBe(false);
    if (ai.ok) return;
    expect(ai.error.code).toBe("FORBIDDEN");
  });

  it("权限：前端（调用者 = 子应用）只能调用自己的 API 与清单里声明过的公开 API", async () => {
    const { kernel } = setup();
    const own = await kernel.handle({ call: "notes.secret", payload: {} }, { caller: "notes" });
    expect(own.ok).toBe(true);
    const other = await kernel.handle({ call: "notes.secret", payload: {} }, { caller: "seed" });
    expect(other.ok).toBe(false);
    const declared = await kernel.handle({ call: "notes.listNotes", payload: {} }, { caller: "tasks" });
    expect(declared.ok).toBe(true);
  });

  it("权限：平台设置——子应用可读不可改；凭据任何调用者都读不到值；外壳可以修改", async () => {
    const storage = createMemoryAdapter();
    const kernel = createKernel({ storage });
    kernel.registerApp(notesApp, {
      id: "notes",
      name: "Notes",
      protocolVersion: 1,
      uses: ["platform.settings.get", "platform.settings.set"],
    });
    kernel.start();

    const setByShell = await kernel.handle(
      { call: "platform.settings.set", payload: { key: "ai.deepseek.apiKey", value: "sk-secret" } },
      { caller: "shell" },
    );
    expect(setByShell.ok).toBe(true);
    await kernel.handle({ call: "platform.settings.set", payload: { key: "ui.language", value: "zh" } }, { caller: "shell" });

    const setByApp = await kernel.handle(
      { call: "platform.settings.set", payload: { key: "ui.language", value: "en" } },
      { caller: "notes" },
    );
    expect(setByApp.ok).toBe(false);

    const language = await kernel.handle({ call: "platform.settings.get", payload: { key: "ui.language" } }, { caller: "notes" });
    expect(language.ok && (language.result as { value: unknown }).value).toBe("zh");

    for (const caller of ["notes", "shell", undefined]) {
      const key = await kernel.handle({ call: "platform.settings.get", payload: { key: "ai.deepseek.apiKey" } }, { caller });
      expect(key.ok).toBe(true);
      if (!key.ok) return;
      expect(key.result).toEqual({ value: null, isSet: true });
    }
  });

  it("只读 API 不能直接写数据（只读句柄）", async () => {
    const { storage, kernel } = setup();
    const r = await kernel.handle({ call: "notes.sneakyWrite", payload: {} });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("FORBIDDEN");
    expect(storage.select<{ c: number }>("SELECT COUNT(*) AS c FROM notes__note")[0]?.c).toBe(0);
  });

  it("普通的异步函数：等外部后经本应用的事务 API 写入，每次一个短事务；事件经 emit 推出", async () => {
    const { storage, kernel } = setup();
    const events: unknown[] = [];
    const r = await kernel.handle({ call: "notes.importTwo", payload: { title: "a" } }, { emit: (e) => events.push(e) });
    expect(r.ok).toBe(true);
    expect(storage.select<{ c: number }>("SELECT COUNT(*) AS c FROM notes__note")[0]?.c).toBe(2);
    expect(kernel.dataVersion).toBe(2);
    expect(events).toEqual([{ type: "progress", done: 1 }]);
  });

  it("普通的异步函数：中途失败时，已完成的短事务保留（整体不保证原子）", async () => {
    const { storage, kernel } = setup();
    const r = await kernel.handle({ call: "notes.importThenFail", payload: {} });
    expect(r.ok).toBe(false);
    expect(storage.select<{ title: string }>("SELECT title FROM notes__note").map((row) => row.title)).toEqual(["kept"]);
  });

  it("普通的异步函数只能是内部 API：其他子应用不能调用", async () => {
    const { kernel } = setup();
    const r = await kernel.handle({ call: "notes.importTwo", payload: { title: "x" } }, { caller: "tasks" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("FORBIDDEN");
  });

  it("取消：发起方触发 signal → 调用以 ABORTED 结束", async () => {
    const { kernel } = setup();
    const controller = new AbortController();
    const pending = kernel.handle({ call: "notes.waitForever", payload: {} }, { signal: controller.signal });
    controller.abort();
    const r = await pending;
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("ABORTED");
  });

  it("清单：id 不一致或协议版本不支持时拒绝注册", () => {
    const kernel = createKernel({ storage: createMemoryAdapter() });
    expect(() => kernel.registerApp(notesApp, { id: "other", name: "X", protocolVersion: 1 })).toThrow();
    expect(() => kernel.registerApp(seedApp, { id: "seed", name: "Seed", protocolVersion: 99 })).toThrow();
  });
});
