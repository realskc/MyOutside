import { randomUUID } from "node:crypto";
import {
  AddCardInput,
  GetDueInput,
  ListCardsInput,
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
import { fsrsToColumns, rowToCard, rowToFsrs, type CardRow } from "./mapping.js";

const scheduler = fsrs();

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

export const vocabApp: AppModule = {
  id: "vocab",
  name: "学英语",
  owns: ["card"],

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
  ],

  api: {
    addCard: defineTx(AddCardInput, (ctx, input) => {
      const now = new Date();
      const id = randomUUID();
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
        ...fsrsToColumns(createEmptyCard(now)),
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

    getDue: defineRead(GetDueInput, (ctx, input) => {
      const now = input.before ?? Date.now();
      const rows = ctx.db.all<CardRow>(
        "card",
        { due: { lte: now }, status: "learning" },
        { orderBy: "due", limit: input.limit ?? 50 },
      );
      return rows.map(rowToCard);
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
      return rows.map(rowToCard);
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
