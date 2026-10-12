import { randomUUID } from "node:crypto";
import {
  AddCardInput,
  GetDueInput,
  ListCardsInput,
  PreviewReviewInput,
  ResolveCardInput,
  SetMasteredInput,
  SubmitReviewInput,
  UpdateCardInput,
} from "@myoutside/contracts";
import {
  defineRead,
  defineTx,
  KernelError,
  type AppDb,
  type AppModule,
  type SqlValue,
  type WhereValue,
} from "@myoutside/kernel";
import { createEmptyCard, fsrs, Rating, type Grade } from "ts-fsrs";
import { z } from "zod";
import toeflWordLevels from "./data/toefl-word-levels.json";
import { fsrsToColumns, rowToCard, rowToFsrs, type CardRow } from "./mapping.js";

const scheduler = fsrs();

/** 导入的参考词表：《词以类记》托福分级（[term, level]；生成见 scripts/build-toefl-levels.ts） */
const WORD_LEVELS: ReadonlyArray<readonly [string, string]> = (toeflWordLevels as string[][]).map(
  ([term, level]) => [term, level] as const,
);

const RATING_TO_GRADE: Record<"again" | "hard" | "good" | "easy", Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

/** term 归一化：仅用于机械地去重检查（同一拼写） */
function normalizeTerm(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ");
}

function getCardOrThrow(db: AppDb, cardId: string): CardRow {
  const row = db.get<CardRow>("card", { id: cardId });
  if (!row) throw new KernelError("NOT_FOUND", `卡片不存在：${cardId}`);
  return row;
}

/** 查询若干 term 的词表分级（未命中的词没有条目） */
function loadWordLevels(db: AppDb, terms: string[]): Map<string, string> {
  const unique = [...new Set(terms)];
  if (unique.length === 0) return new Map();
  const rows = db.all<{ term: string; level: string }>("word_level", { term: { in: unique } });
  return new Map(rows.map((row) => [row.term, row.level]));
}

export const vocabApp: AppModule = {
  id: "vocab",
  name: "学英语",
  owns: ["card", "word_level"],

  migrations: [
    {
      id: "0001_init",
      up: (ctx) => {
        ctx.createTable(
          "card",
          [
            "id TEXT PRIMARY KEY",
            "term TEXT NOT NULL",
            "display TEXT NOT NULL",
            "sense TEXT NOT NULL",
            "phonetic TEXT",
            "meaning TEXT NOT NULL DEFAULT ''",
            "context TEXT",
            "source TEXT",
            "status TEXT NOT NULL DEFAULT 'learning'",
            "due INTEGER NOT NULL",
            "stability REAL NOT NULL",
            "difficulty REAL NOT NULL",
            "elapsed_days INTEGER NOT NULL",
            "scheduled_days INTEGER NOT NULL",
            "learning_steps INTEGER NOT NULL DEFAULT 0",
            "reps INTEGER NOT NULL",
            "lapses INTEGER NOT NULL",
            "state INTEGER NOT NULL",
            "last_review INTEGER",
            "created_at INTEGER NOT NULL",
          ].join(", "),
        );
        ctx.createIndex("card_term", "card", "term");
        ctx.createIndex("card_due", "card", "due");
        ctx.createIndex("card_status", "card", "status");
      },
    },
    {
      id: "0002_word_level",
      up: (ctx) => {
        // 参考词表（非用户数据）：随迁移一次性种入
        ctx.createTable("word_level", "term TEXT PRIMARY KEY, level TEXT NOT NULL");
        for (const [term, level] of WORD_LEVELS) {
          ctx.insert("word_level", { term, level });
        }
      },
    },
  ],

  api: {
    addCard: defineTx(AddCardInput, (ctx, input) => {
      const now = new Date();
      const id = randomUUID();
      const scheduling = input.scheduling ?? fsrsToColumns(createEmptyCard(now));
      ctx.db.insert("card", {
        id,
        term: normalizeTerm(input.term),
        display: input.display?.trim() || input.term.trim(),
        sense: input.sense.trim(),
        phonetic: input.phonetic?.trim() || null,
        meaning: input.meaning ?? "",
        context: input.context ?? null,
        source: input.source ?? "manual",
        status: "learning",
        created_at: now.getTime(),
        ...scheduling,
      });
      return { cardId: id };
    }),

    updateCard: defineTx(UpdateCardInput, (ctx, input) => {
      getCardOrThrow(ctx.db, input.cardId);
      const patch: Record<string, SqlValue> = {};
      if (input.patch.sense !== undefined) patch.sense = input.patch.sense.trim();
      if (input.patch.meaning !== undefined) patch.meaning = input.patch.meaning;
      if (input.patch.phonetic !== undefined) patch.phonetic = input.patch.phonetic.trim();
      if (input.patch.context !== undefined) patch.context = input.patch.context;
      if (Object.keys(patch).length > 0) {
        ctx.db.update("card", patch, { id: input.cardId });
      }
      return { ok: true as const };
    }),

    setMastered: defineTx(SetMasteredInput, (ctx, input) => {
      getCardOrThrow(ctx.db, input.cardId);
      ctx.db.update("card", { status: input.mastered ? "mastered" : "learning" }, { id: input.cardId });
      return { ok: true as const };
    }),

    submitReview: defineTx(SubmitReviewInput, (ctx, input) => {
      const row = getCardOrThrow(ctx.db, input.cardId);
      const result = scheduler.next(rowToFsrs(row), new Date(), RATING_TO_GRADE[input.rating]);
      ctx.db.update("card", fsrsToColumns(result.card), { id: row.id });
      return {
        state: result.card.state,
        due: result.card.due.getTime(),
        scheduledDays: result.card.scheduled_days,
      };
    }),

    /** 预览各评分对应的"下一次复习时间"（只读，不写库） */
    previewReview: defineRead(PreviewReviewInput, (ctx, input) => {
      const row = getCardOrThrow(ctx.db, input.cardId);
      const preview = scheduler.repeat(rowToFsrs(row), new Date());
      const entry = (grade: Grade) => ({
        due: preview[grade].card.due.getTime(),
        scheduledDays: preview[grade].card.scheduled_days,
      });
      return {
        again: entry(Rating.Again),
        hard: entry(Rating.Hard),
        good: entry(Rating.Good),
        easy: entry(Rating.Easy),
      };
    }),

    /** 添加第一步：判断新卡片与已有卡片是否同类（单词已存在时调用平台 AI；未配 key 会抛错，由调用方回退机械流程） */
    resolveCard: defineRead(ResolveCardInput, async (ctx, input) => {
      const term = normalizeTerm(input.term);
      const existing = ctx.db.all<CardRow>("card", { term }, { orderBy: "created_at" });
      if (existing.length === 0) return { action: "new" as const };

      const existingBrief = existing
        .map((row, index) => `${index + 1}. ${row.display} —— 意项：${row.sense}；释义：${row.meaning || "（无）"}`)
        .join("\n");

      const response = (await ctx.call("platform.ai.chat", {
        messages: [
          {
            role: "system",
            content:
              "你是英语学习卡片管理助手。判断「新卡片」与「已有卡片」是否属于同一个本质意项（同词义），而不是同一个拼写。必须调用 submit_decision 工具提交结果。",
          },
          {
            role: "user",
            content:
              `已有卡片：\n${existingBrief}\n\n` +
              `新卡片：\n单词：${input.term}\n本质意项：${input.sense}\n释义：${input.meaning ?? "（无）"}\n\n` +
              "新卡片与哪张已有卡片属于同一个本质意项？调用 submit_decision：matchIndex 为对应序号（从 1 开始）；若没有同类，matchIndex 为 null。",
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_decision",
              description: "提交「是否与已有卡片同类」的判断结果",
              parameters: {
                type: "object",
                properties: {
                  matchIndex: {
                    type: ["integer", "null"],
                    description: "同类已有卡片的序号（从 1 开始）；没有同类则为 null",
                  },
                },
                required: ["matchIndex"],
              },
            },
          },
        ],
        temperature: 0,
      })) as { toolCalls: Array<{ function: { name: string; arguments: string } }> };

      const decision = response.toolCalls.find((call) => call.function.name === "submit_decision");
      if (decision) {
        try {
          const args = JSON.parse(decision.function.arguments) as { matchIndex?: number | null };
          const index = typeof args.matchIndex === "number" ? args.matchIndex - 1 : -1;
          const matched = existing[index];
          if (matched) return { action: "match" as const, cardId: matched.id };
        } catch {
          /* 解析失败 → 视为无同类 */
        }
      }
      return { action: "new" as const };
    }),

    getDue: defineRead(GetDueInput, (ctx, input) => {
      const now = input.before ?? Date.now();
      const rows = ctx.db.all<CardRow>(
        "card",
        { due: { lte: now }, status: "learning" },
        { orderBy: "due", limit: input.limit ?? 50 },
      );
      const levels = loadWordLevels(ctx.db, rows.map((row) => row.term));
      return rows.map((row) => rowToCard(row, levels.get(row.term) ?? null));
    }),

    listCards: defineRead(ListCardsInput, (ctx, input) => {
      const where: Record<string, WhereValue> = {};
      if (input.term !== undefined) where.term = normalizeTerm(input.term);
      if (input.status !== undefined) where.status = input.status;
      if (input.query !== undefined && input.query.trim() !== "") {
        // v0：只按拼写搜索；按释义搜索等以后扩展
        where.display = { like: `%${input.query.trim()}%` };
      }
      const rows = ctx.db.all<CardRow>("card", where, {
        orderBy: "created_at DESC",
        limit: input.limit ?? 200,
        offset: input.offset ?? 0,
      });
      const levels = loadWordLevels(ctx.db, rows.map((row) => row.term));
      return rows.map((row) => rowToCard(row, levels.get(row.term) ?? null));
    }),

    getStats: defineRead(z.object({}), (ctx) => {
      const now = Date.now();
      return {
        cards: ctx.db.count("card"),
        learning: ctx.db.count("card", { status: "learning" }),
        mastered: ctx.db.count("card", { status: "mastered" }),
        dueNow: ctx.db.count("card", { status: "learning", due: { lte: now } }),
      };
    }),
  },
};
