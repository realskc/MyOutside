import { randomUUID } from "node:crypto";
import {
  ZheyeGetRecipeInput,
  ZheyeTrialAppendInput,
  ZheyeTrialCreateInput,
  ZheyeTrialFinishInput,
  ZheyeTrialGetInput,
  ZheyeTrialListInput,
  ZheyeTrialStartInput,
  ZheyeTrialStopInput,
  type AiUsage,
  type ZheyeRecipe,
  type ZheyeTrialEvent,
  type ZheyeTrialStatus,
  type ZheyeTrialSummary,
  type ZheyeType,
} from "@myoutside/contracts";
import { defineAsync, defineRead, defineTx, KernelError, type AppDb, type AppModule, type WhereValue } from "@myoutside/kernel";
import { availableTypes, loadRecipe } from "./recipe.js";
import { runTrial } from "./trial.js";

export { loadRecipe, renderPrompt } from "./recipe.js";

interface RunRow {
  id: string;
  subject: string;
  type: string;
  flow: string;
  recipe_hash: string;
  recipe: string;
  status: string;
  error: string | null;
  docs: string | null;
  usage: string | null;
  cost_yuan: number;
  web_calls: number;
  started_at: number;
  finished_at: number | null;
}

interface EventRow {
  run_id: string;
  seq: number;
  stage: string | null;
  kind: string;
  data: string;
  at: number;
}

export interface ZheyeAppOptions {
  /** 配方目录（apps/zheye/recipes）：每次试跑开始时从这里读，改了文件不用重启 */
  recipesDir: string;
}

function getRunOrThrow(db: AppDb, runId: string): RunRow {
  const row = db.get<RunRow>("trial_run", { id: runId });
  if (!row) throw new KernelError("NOT_FOUND", `试跑不存在：${runId}`);
  return row;
}

function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function createZheyeApp(options: ZheyeAppOptions): AppModule {
  /** 在这次运行的 MyOutside 里进行中的试跑 → 停止用的开关 */
  const active = new Map<string, AbortController>();

  const statusOf = (row: RunRow): ZheyeTrialStatus =>
    row.status === "running" && !active.has(row.id) ? "interrupted" : (row.status as ZheyeTrialStatus);

  const toSummary = (row: RunRow): ZheyeTrialSummary => ({
    id: row.id,
    subject: row.subject,
    type: row.type as ZheyeType,
    flow: row.flow,
    recipeHash: row.recipe_hash,
    status: statusOf(row),
    error: row.error,
    costYuan: row.cost_yuan,
    webCalls: row.web_calls,
    usage: parseJson<AiUsage>(row.usage),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  });

  const toEvent = (row: EventRow): ZheyeTrialEvent => ({
    seq: row.seq,
    stage: row.stage,
    kind: row.kind as ZheyeTrialEvent["kind"],
    data: parseJson<Record<string, unknown>>(row.data) ?? {},
    at: row.at,
  });

  return {
    id: "zheye",
    name: "哲野",
    owns: ["trial_run", "trial_event"],

    migrations: [
      {
        id: "0001_trial",
        up: (ctx) => {
          // 试验台的试跑（ZHEYE-0020、ZHEYE-0021）
          ctx.createTable(
            "trial_run",
            [
              "id TEXT PRIMARY KEY",
              "subject TEXT NOT NULL",
              "type TEXT NOT NULL",
              "flow TEXT NOT NULL",
              "recipe_hash TEXT NOT NULL",
              "recipe TEXT NOT NULL", // JSON：试跑时的配方快照（流程 + 全部提示词文件）
              "status TEXT NOT NULL", // running / done / stopped / error
              "error TEXT",
              "docs TEXT", // JSON：结束时的全部草稿
              "usage TEXT", // JSON：各轮用量之和
              "cost_yuan REAL NOT NULL DEFAULT 0", // 估算花费，边跑边累加
              "web_calls INTEGER NOT NULL DEFAULT 0",
              "started_at INTEGER NOT NULL",
              "finished_at INTEGER",
            ].join(", "),
          );
          ctx.createTable(
            "trial_event",
            [
              "run_id TEXT NOT NULL",
              "seq INTEGER NOT NULL",
              "stage TEXT",
              "kind TEXT NOT NULL", // stage_start / round / doc / stage_end
              "data TEXT NOT NULL", // JSON
              "at INTEGER NOT NULL",
              "PRIMARY KEY (run_id, seq)",
            ].join(", "),
          );
          ctx.createIndex("trial_run_started", "trial_run", "started_at");
        },
      },
    ],

    api: {
      /** 读取一类讲解的配方（流程 + 提示词），供试验台显示 */
      getRecipe: defineRead(ZheyeGetRecipeInput, (_ctx, input) => {
        const type = input.type ?? "concept";
        const available = availableTypes(options.recipesDir);
        if (!available.includes(type)) return { recipe: null, error: null, available };
        try {
          return { recipe: loadRecipe(options.recipesDir, type), error: null, available };
        } catch (cause) {
          return { recipe: null, error: cause instanceof Error ? cause.message : String(cause), available };
        }
      }),

      trialList: defineRead(ZheyeTrialListInput, (ctx) =>
        ctx.db.all<RunRow>("trial_run", {}, { orderBy: "started_at DESC", limit: 200 }).map(toSummary),
      ),

      trialGet: defineRead(ZheyeTrialGetInput, (ctx, input) => {
        const row = getRunOrThrow(ctx.db, input.runId);
        const recipe = parseJson<ZheyeRecipe>(row.recipe);
        const where: Record<string, WhereValue> = { run_id: row.id };
        if (input.afterSeq !== undefined) where.seq = { gt: input.afterSeq };
        const events = ctx.db.all<EventRow>("trial_event", where, { orderBy: "seq" }).map(toEvent);
        return {
          ...toSummary(row),
          recipe,
          events,
          active: active.has(row.id),
        };
      }),

      trialCreate: defineTx(ZheyeTrialCreateInput, (ctx, input) => {
        ctx.db.insert("trial_run", {
          id: input.id,
          subject: input.subject,
          type: input.type,
          flow: input.flow,
          recipe_hash: input.recipeHash,
          recipe: JSON.stringify(input.recipe),
          status: "running",
          error: null,
          docs: null,
          usage: null,
          cost_yuan: 0,
          web_calls: 0,
          started_at: Date.now(),
          finished_at: null,
        });
        return { ok: true as const };
      }),

      /** 追加一条轨迹；「轮」的花费同时累加到这次试跑上（被中断也留得住） */
      trialAppend: defineTx(ZheyeTrialAppendInput, (ctx, input) => {
        const run = getRunOrThrow(ctx.db, input.runId);
        const last = ctx.db.all<EventRow>("trial_event", { run_id: run.id }, { orderBy: "seq DESC", limit: 1 })[0];
        const event: EventRow = {
          run_id: run.id,
          seq: (last?.seq ?? 0) + 1,
          stage: input.stage,
          kind: input.kind,
          data: JSON.stringify(input.data),
          at: Date.now(),
        };
        ctx.db.insert("trial_event", { ...event });
        if (input.kind === "round") {
          const cost = typeof input.data.costYuan === "number" ? input.data.costYuan : 0;
          const web = typeof input.data.webCalls === "number" ? input.data.webCalls : 0;
          ctx.db.update(
            "trial_run",
            { cost_yuan: run.cost_yuan + cost, web_calls: run.web_calls + web },
            { id: run.id },
          );
        }
        return toEvent(event);
      }),

      trialFinish: defineTx(ZheyeTrialFinishInput, (ctx, input) => {
        getRunOrThrow(ctx.db, input.runId);
        ctx.db.update(
          "trial_run",
          {
            status: input.status,
            error: input.error,
            docs: JSON.stringify(input.docs),
            usage: JSON.stringify(input.usage),
            cost_yuan: input.costYuan,
            web_calls: input.webCalls,
            finished_at: Date.now(),
          },
          { id: input.runId },
        );
        return { ok: true as const };
      }),

      /**
       * 开始一次试跑（普通的异步函数，D-0063）：读取当前配方、存下快照，然后跑完整个流程才返回。
       * 一开始先推送 { type: "trial_created", runId }，界面据此显示这次试跑；界面关掉不影响试跑。
       */
      trialStart: defineAsync(ZheyeTrialStartInput, async (ctx, input) => {
        let recipe: ZheyeRecipe;
        try {
          recipe = loadRecipe(options.recipesDir, input.type);
        } catch (cause) {
          throw new KernelError("PRECONDITION", cause instanceof Error ? cause.message : String(cause));
        }
        const runId = randomUUID();
        await ctx.call("zheye.trialCreate", {
          id: runId,
          subject: input.subject,
          type: input.type,
          flow: recipe.name,
          recipeHash: recipe.hash,
          recipe,
        });
        const controller = new AbortController();
        const signal = AbortSignal.any([ctx.signal, controller.signal]);
        active.set(runId, controller);
        ctx.emit({ type: "trial_created", runId });
        try {
          const outcome = await runTrial(ctx, { runId, subject: input.subject, type: input.type, recipe, signal });
          return { runId, status: outcome.status };
        } finally {
          active.delete(runId);
        }
      }),

      /**
       * 停止一次进行中的试跑（不是发起它的页面也能停）。
       * 正在等模型输出时，要等这一次输出结束才停下；发起它的页面用取消（outside.cancel）能立刻停。
       */
      trialStop: defineAsync(ZheyeTrialStopInput, async (_ctx, input) => {
        const controller = active.get(input.runId);
        if (controller) controller.abort();
        return { ok: true as const, stopping: Boolean(controller) };
      }),
    },
  };
}
