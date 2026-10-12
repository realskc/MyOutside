import type { Card } from "@myoutside/contracts";
import type { SqlValue } from "@myoutside/kernel";
import { State, type Card as FsrsCard } from "ts-fsrs";

/** 数据库行（vocab__card） */
export interface CardRow {
  id: string;
  term: string;
  display: string;
  sense: string;
  phonetic: string | null;
  meaning: string;
  context: string | null;
  source: string | null;
  status: string;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: number | null;
  created_at: number;
}

export function rowToCard(row: CardRow, level: string | null = null): Card {
  return {
    id: row.id,
    term: row.term,
    display: row.display,
    sense: row.sense,
    phonetic: row.phonetic,
    meaning: row.meaning,
    context: row.context,
    source: row.source,
    status: row.status as Card["status"],
    level: level === null ? null : (level as Card["level"]),
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review,
    created_at: row.created_at,
  };
}

export function rowToFsrs(row: CardRow): FsrsCard {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review == null ? undefined : new Date(row.last_review),
  };
}

export function fsrsToColumns(card: FsrsCard): Record<string, SqlValue> {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.getTime() : null,
  };
}
