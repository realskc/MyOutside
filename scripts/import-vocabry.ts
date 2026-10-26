/**
 * 从 Vocabry 迁移卡片到 MyOutside（近似迁移 Anki 的复习状态）。
 * - 数据源（Vocabry 当前库）：%LOCALAPPDATA%/Vocabry/vocabry.sqlite3
 * - 复习状态来源：Anki profile 的 collection.anki2（SM-2 → FSRS 近似换算）
 * - 幂等：按「term + 本质意项」跳过已导入的卡；只增不删
 * 运行：pnpm.cmd import:vocabry
 */
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createKernel } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";
import { vocabApp } from "@myoutside/vocab";
import vocabManifest from "@myoutside/vocab/manifest.json";

const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), ".local", "share");
const appData = process.env.APPDATA ?? join(homedir(), ".config");
const vocabryPath = join(localAppData, "Vocabry", "vocabry.sqlite3");
const myoutsidePath = join(appData, "MyOutside", "myoutside.db");
const ankiRoot = join(appData, "Anki2");

if (!existsSync(vocabryPath)) {
  console.error("[import-vocabry] 找不到 Vocabry 数据库：", vocabryPath);
  process.exit(1);
}

interface StructuredFields {
  word?: string;
  phonetic?: string;
  definition?: string;
  example?: string;
  notes?: string;
}

interface VocabryCardRow {
  card_id: string;
  card_type: string;
  structured_fields: string;
  created_at: string;
}

interface AnkiCardRow {
  id: number;
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  data: string;
}

const vocabry = new DatabaseSync(vocabryPath, { readOnly: true });
const cards = vocabry
  .prepare(
    "SELECT card_id, card_type, structured_fields, created_at FROM cards WHERE deleted_at IS NULL ORDER BY created_at",
  )
  .all() as unknown as VocabryCardRow[];
const mappingRows = vocabry
  .prepare("SELECT card_id, note_id FROM anki_note_mappings")
  .all() as unknown as Array<{ card_id: string; note_id: number }>;

// —— 找 Anki 集合（含有这些映射 note 的 profile）——
interface AnkiCollection {
  db: DatabaseSync;
  crt: number;
  path: string;
}

function openAnkiCollection(noteIds: number[]): AnkiCollection | null {
  if (!existsSync(ankiRoot) || noteIds.length === 0) return null;
  for (const entry of readdirSync(ankiRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "addons21" || entry.name === "logs") continue;
    const collectionPath = join(ankiRoot, entry.name, "collection.anki2");
    if (!existsSync(collectionPath)) continue;
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(collectionPath, { readOnly: true });
      const placeholders = noteIds.map(() => "?").join(",");
      const hit = db
        .prepare(`SELECT COUNT(*) AS c FROM notes WHERE id IN (${placeholders})`)
        .get(...noteIds) as { c: number };
      if (hit.c > 0) {
        const crt = (db.prepare("SELECT crt FROM col LIMIT 1").get() as { crt: number }).crt;
        return { db, crt, path: collectionPath };
      }
    } catch {
      /* 非法或不兼容的库，忽略 */
    }
    db?.close();
  }
  return null;
}

const anki = openAnkiCollection(mappingRows.map((m) => m.note_id));
console.log("[import-vocabry] Vocabry 库：", vocabryPath);
console.log("[import-vocabry] MyOutside 库：", myoutsidePath);
console.log("[import-vocabry] Anki 集合：", anki ? anki.path : "（未找到，复习状态将不迁移）");
console.log(`[import-vocabry] 活动卡片 ${cards.length} 张，Anki 映射 ${mappingRows.length} 条`);

const kernel = createKernel({ storage: createNodeSqliteAdapter({ path: myoutsidePath }) });
kernel.registerApp(vocabApp, vocabManifest);
kernel.start();

async function call<T>(name: string, payload?: unknown): Promise<T> {
  const res = await kernel.handle({ call: name, payload });
  if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
  return res.result as T;
}

interface Scheduling {
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
}

function buildScheduling(cardId: string): Scheduling | null {
  if (!anki) return null;
  const mapping = mappingRows.find((m) => m.card_id === cardId);
  if (!mapping) return null;
  const row = anki.db
    .prepare("SELECT id, type, queue, due, ivl, factor, reps, lapses, data FROM cards WHERE nid = ?")
    .get(mapping.note_id) as unknown as AnkiCardRow | undefined;
  if (!row || row.type !== 2 || row.queue !== 2 || row.ivl <= 0) return null;

  let lastReview: number | null = null;
  try {
    const parsed = JSON.parse(row.data || "{}") as { lrt?: number };
    if (typeof parsed.lrt === "number") lastReview = parsed.lrt * 1000;
  } catch {
    /* ignore */
  }

  const factor = row.factor > 0 ? row.factor : 2500;
  const difficulty = Math.min(10, Math.max(1, 5 + (2500 - factor) / 500));

  return {
    due: (anki.crt + row.due * 86400) * 1000,
    stability: Math.max(0.1, row.ivl),
    difficulty: Math.round(difficulty * 100) / 100,
    elapsed_days: row.ivl,
    scheduled_days: row.ivl,
    learning_steps: 0,
    reps: row.reps,
    lapses: row.lapses,
    state: 2,
    last_review: lastReview,
  };
}

let imported = 0;
let scheduled = 0;
let skipped = 0;
let failed = 0;

for (const card of cards) {
  const fields = JSON.parse(card.structured_fields) as StructuredFields;
  const word = String(fields.word ?? "").trim();
  const definition = String(fields.definition ?? "").trim();
  if (!word || !definition) {
    failed += 1;
    console.error("[import-vocabry] 跳过缺字段的卡：", card.card_id);
    continue;
  }

  const existing = await call<Array<{ sense: string }>>("vocab.listCards", { term: word });
  if (existing.some((item) => item.sense.trim() === definition)) {
    skipped += 1;
    continue;
  }

  const scheduling = buildScheduling(card.card_id);
  const payload = {
    term: word,
    display: word,
    sense: definition,
    meaning: fields.notes ?? "",
    phonetic: fields.phonetic ?? "",
    context: fields.example ?? "",
    source: "vocabry-import",
    ...(scheduling ? { scheduling } : {}),
  };

  const res = await kernel.handle({ call: "vocab.addCard", payload });
  if (res.ok) {
    imported += 1;
    if (scheduling) scheduled += 1;
  } else {
    failed += 1;
    console.error(`[import-vocabry] 导入失败 "${word}"：${res.error.code} ${res.error.message}`);
  }
}

console.log(
  `[import-vocabry] 完成：导入 ${imported} 张（含复习状态 ${scheduled}），跳过（已存在）${skipped}，失败 ${failed}`,
);
