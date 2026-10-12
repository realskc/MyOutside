/**
 * 生成「词以类记」托福词表分级数据（vocab 参考词表）。
 *
 * 源：《托福词以类记_单词_最终中位数分级.json》（DeepSeek 三次运行取中位数）
 * 输出：apps/vocab/backend/src/data/toefl-word-levels.json
 *   - 每行 [term, level]；term 按 vocab 规则归一化（trim + lowercase + 折叠空格）
 *   - 同一词出现在多个分类 / 级别时，取最高优先级（A > B > C > D）
 *
 * 运行：pnpm.cmd build:toefl [源文件路径]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_SOURCE = "D:/Resource/TOEFL/单词/词以类记/output/托福词以类记_单词_最终中位数分级.json";
const OUTPUT = resolve(process.cwd(), "apps/vocab/backend/src/data/toefl-word-levels.json");

type Level = "A" | "B" | "C" | "D";
const LEVELS: Level[] = ["A", "B", "C", "D"];
const RANK: Record<Level, number> = { A: 0, B: 1, C: 2, D: 3 };

function normalizeTerm(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ");
}

const source = process.argv[2] ?? DEFAULT_SOURCE;
const data = JSON.parse(readFileSync(source, "utf8")) as Record<string, unknown>;

const levels = new Map<string, Level>();
const rawForms = new Map<string, Set<string>>();
let entries = 0;

function visit(node: unknown): void {
  if (Array.isArray(node) || !node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const keys = Object.keys(record);
  const isLeaf = keys.length > 0 && keys.every((key) => LEVELS.includes(key as Level));
  if (isLeaf) {
    for (const level of LEVELS) {
      const words = (record[level] ?? []) as string[];
      for (const word of words) {
        entries += 1;
        const term = normalizeTerm(word);
        if (!rawForms.has(term)) rawForms.set(term, new Set());
        rawForms.get(term)!.add(word);
        const current = levels.get(term);
        if (current === undefined || RANK[level] < RANK[current]) levels.set(term, level);
      }
    }
    return;
  }
  for (const key of keys) visit(record[key]);
}
visit(data);

const sorted = [...levels.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
const body = sorted.map(([term, level]) => `  [${JSON.stringify(term)}, ${JSON.stringify(level)}]`).join(",\n");
mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `[\n${body}\n]\n`, "utf8");

const counts: Record<Level, number> = { A: 0, B: 0, C: 0, D: 0 };
for (const level of levels.values()) counts[level] += 1;
const collisions = [...rawForms.entries()].filter(([, forms]) => forms.size > 1);
const collisionText = collisions
  .slice(0, 5)
  .map(([term, forms]) => `${term}(${[...forms].join("|")})`)
  .join(", ");

console.log(`[build-toefl] 源: ${source}`);
console.log(`[build-toefl] 原始条目 ${entries} → 归一化后唯一词 ${levels.size}`);
console.log(`[build-toefl] 分级分布: ${JSON.stringify(counts)}`);
console.log(`[build-toefl] 归一化合并 ${collisions.length} 组${collisions.length ? "：" + collisionText : ""}`);
console.log(`[build-toefl] 输出: ${OUTPUT}`);
