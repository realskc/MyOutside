import { createSourceRegistry, runToolLoop, webFetchTool, webSearchTool, type AgentContext, type Round } from "@myoutside/agent";
import type { AiUsage, ReasoningEffort, ZheyeRecipe, ZheyeTrialAppendInput, ZheyeType } from "@myoutside/contracts";
import { estimateCost, WEB_REQUEST_PRICE, type AsyncContext } from "@myoutside/kernel";
import { createDrafts } from "./drafts.js";
import { renderPrompt, TYPE_LABELS } from "./recipe.js";

/** 试验台暂不询问前置（ZHEYE-0020 之后的第一版）：全部按「正文带过」 */
export const TRIAL_PREREQUISITE_ANSWER = "（试验台暂不询问作者：所有前置都按「正文带过」处理）";

const WEB_TOOLS = new Set(["web_search", "web_fetch"]);

function today(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 每一步的用户消息：讲解对象 + 当前全部草稿（程序拼接，试验台上能看到原文） */
export function composeUserMessage(subject: string, type: ZheyeType, docs: Record<string, string>): string {
  const parts = [`讲解对象：${subject}（${TYPE_LABELS[type]}）`, "当前的草稿："];
  for (const [name, content] of Object.entries(docs)) {
    parts.push(`【${name}】\n${content.trim() === "" ? "（空）" : content}`);
  }
  return parts.join("\n\n");
}

function roundCost(round: Round, at: number): { costYuan: number; webCalls: number } {
  const webCalls = round.toolCalls.filter((call) => call.ok && WEB_TOOLS.has(call.name)).length;
  const ai = round.usage
    ? estimateCost({
        kind: "ai.chat",
        model: round.model,
        promptTokens: round.usage.promptTokens,
        completionTokens: round.usage.completionTokens,
        cacheHitTokens: round.usage.cacheHitTokens ?? 0,
        createdAt: at,
      })
    : 0;
  return { costYuan: ai + webCalls * WEB_REQUEST_PRICE, webCalls };
}

function addUsage(total: AiUsage, usage: AiUsage): void {
  total.promptTokens += usage.promptTokens;
  total.completionTokens += usage.completionTokens;
  total.totalTokens += usage.totalTokens;
  total.reasoningTokens = (total.reasoningTokens ?? 0) + (usage.reasoningTokens ?? 0);
  total.cacheHitTokens = (total.cacheHitTokens ?? 0) + (usage.cacheHitTokens ?? 0);
}

export interface TrialOutcome {
  status: "done" | "stopped" | "error";
  error: string | null;
}

/**
 * 按配方跑一次线性流程（ZHEYE-0018）：每一步是一次单独的工具循环，工具 = 联网搜索 / 抓取 + 草稿的编辑工具。
 * 轨迹边跑边存（每条一次短事务）：这一步的提示词、每一轮、每次草稿修改、这一步的结束。
 * 被停止或出错时，已经存下的轨迹与花费都保留。
 */
export async function runTrial(
  ctx: AsyncContext,
  input: { runId: string; subject: string; type: ZheyeType; recipe: ZheyeRecipe; signal: AbortSignal },
): Promise<TrialOutcome> {
  const { runId, subject, type, recipe } = input;
  const append = async (stage: string | null, kind: ZheyeTrialAppendInput["kind"], data: Record<string, unknown>) => {
    const event = await ctx.call("zheye.trialAppend", { runId, stage, kind, data });
    ctx.emit({ type: "trial_event", runId, event });
  };

  const usage: AiUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, reasoningTokens: 0, cacheHitTokens: 0 };
  let costYuan = 0;
  let webCalls = 0;
  let currentStage = recipe.stages[0]!.id;
  const drafts = createDrafts(recipe.docs, (change) => append(currentStage, "doc", { ...change }));
  const sources = createSourceRegistry();
  const loopCtx: AgentContext = { call: (name, payload) => ctx.call(name, payload), emit: (event) => ctx.emit(event), signal: input.signal };

  let outcome: TrialOutcome = { status: "done", error: null };
  try {
    for (const stage of recipe.stages) {
      if (input.signal.aborted) {
        outcome = { status: "stopped", error: null };
        break;
      }
      currentStage = stage.id;
      const vars: Record<string, string> = {
        讲解对象: subject,
        类型: TYPE_LABELS[type],
        今天: today(new Date()),
        流程: recipe.stages.map((item) => item.name).join(" → "),
        这一步: stage.name,
        草稿: recipe.docs.map((name) => `「${name}」`).join("、"),
        前置回答: TRIAL_PREREQUISITE_ANSWER,
      };
      const system = [...recipe.system, stage.prompt].map((path) => renderPrompt(recipe.files, path, vars)).join("\n\n");
      const user = composeUserMessage(subject, type, drafts.all());
      await append(stage.id, "stage_start", { name: stage.name, system, user });

      let stageCost = 0;
      const saved = new Set<number>();
      const saveRound = async (round: Round) => {
        if (saved.has(round.index)) return;
        saved.add(round.index);
        const cost = roundCost(round, Date.now());
        stageCost += cost.costYuan;
        costYuan += cost.costYuan;
        webCalls += cost.webCalls;
        if (round.usage) addUsage(usage, round.usage);
        await append(stage.id, "round", {
          index: round.index,
          reasoning: round.reasoning,
          content: round.content,
          toolCalls: round.toolCalls.map(({ id, name, arguments: args, ok, summary, result }) => ({
            id,
            name,
            arguments: args,
            ok,
            summary,
            result,
          })),
          usage: round.usage,
          model: round.model,
          note: round.note ?? null,
          costYuan: cost.costYuan,
          webCalls: cost.webCalls,
        });
      };

      const result = await runToolLoop(loopCtx, {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [webSearchTool({ sources, question: subject }), webFetchTool({ sources }), ...drafts.tools],
        model: recipe.model,
        reasoningEffort: recipe.reasoningEffort as ReasoningEffort,
        stream: true,
        maxRounds: stage.maxRounds,
        onRound: saveRound,
      });
      // 出错中断时输出到一半的那一轮不经过 onRound：补存
      for (const round of result.rounds) await saveRound(round);
      await append(stage.id, "stage_end", {
        stopReason: result.stopReason,
        error: result.error?.message ?? null,
        costYuan: stageCost,
      });

      if (result.stopReason === "aborted") {
        outcome = { status: "stopped", error: null };
        break;
      }
      if (result.stopReason === "error") {
        outcome = { status: "error", error: `「${stage.name}」出错：${result.error?.message ?? "未知错误"}` };
        break;
      }
    }
  } catch (cause) {
    outcome = input.signal.aborted
      ? { status: "stopped", error: null }
      : { status: "error", error: cause instanceof Error ? cause.message : String(cause) };
  }

  await ctx.call("zheye.trialFinish", {
    runId,
    status: outcome.status,
    error: outcome.error,
    docs: drafts.all(),
    usage,
    costYuan,
    webCalls,
  });
  return outcome;
}
