import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize, sep } from "node:path";
import { z } from "zod";
import type { ZheyeRecipe, ZheyeRecipeFile, ZheyeType } from "@myoutside/contracts";

/**
 * 配方（ZHEYE-0021）：recipes/<类型>/flow.json 定义流程，提示词是 Markdown 文件。
 * 每次读取都从磁盘重新读：作者改了文件，下一次试跑就用新内容。
 */

export const TYPE_LABELS: Record<ZheyeType, string> = { concept: "概念", assertion: "断言", entity: "实体" };
export const TYPES: ZheyeType[] = ["concept", "assertion", "entity"];

const FlowFile = z.object({
  name: z.string().min(1),
  model: z.string().min(1),
  reasoningEffort: z.enum(["none", "low", "high", "max"]),
  docs: z.array(z.string().min(1).max(20)).min(1),
  article: z.string().min(1),
  system: z.array(z.string().min(1)),
  stages: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9_-]+$/i, "id 只能用字母、数字、下划线、连字符"),
        name: z.string().min(1),
        prompt: z.string().min(1),
        maxRounds: z.number().int().min(1).max(50),
      }),
    )
    .min(1),
});

const INCLUDE = /\{\{\s*引入\s+([^}\s]+)\s*\}\}/g;
const VARIABLE = /\{\{\s*([^}\s]+)\s*\}\}/g;
const COMMENT = /<!--[\s\S]*?-->/g;

/** 配方目录里的相对路径：不能是绝对路径、不能跳出目录 */
function safeRelative(path: string): string {
  const normalized = normalize(path).split(sep).join("/");
  if (isAbsolute(path) || normalized.startsWith("../") || normalized === "..") {
    throw new Error(`配方路径不能跳出 recipes/：${path}`);
  }
  return normalized;
}

function readRecipeFile(dir: string, path: string): string {
  const full = join(dir, safeRelative(path));
  if (!existsSync(full)) throw new Error(`找不到配方文件：${path}`);
  return readFileSync(full, "utf8");
}

export function availableTypes(dir: string): ZheyeType[] {
  return TYPES.filter((type) => existsSync(join(dir, type, "flow.json")));
}

/** 读取一类讲解的配方：流程定义 + 它用到的全部提示词文件（含被引入的） */
export function loadRecipe(dir: string, type: ZheyeType): ZheyeRecipe {
  const flowPath = `${type}/flow.json`;
  const flowText = readRecipeFile(dir, flowPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(flowText);
  } catch (cause) {
    throw new Error(`${flowPath} 不是合法的 JSON：${cause instanceof Error ? cause.message : String(cause)}`);
  }
  const checked = FlowFile.safeParse(parsed);
  if (!checked.success) {
    const issue = checked.error.issues[0]!;
    throw new Error(`${flowPath} 格式不对：${issue.path.join(".") || "(根)"} ${issue.message}`);
  }
  const flow = checked.data;
  if (!flow.docs.includes(flow.article)) throw new Error(`${flowPath}：article「${flow.article}」不在 docs 里`);
  const ids = new Set<string>();
  for (const stage of flow.stages) {
    if (ids.has(stage.id)) throw new Error(`${flowPath}：步骤 id 重复：${stage.id}`);
    ids.add(stage.id);
  }

  const files = new Map<string, string>([[flowPath, flowText]]);
  const visit = (path: string) => {
    const rel = safeRelative(path);
    if (files.has(rel)) return;
    const content = readRecipeFile(dir, rel);
    files.set(rel, content);
    for (const match of content.replace(COMMENT, "").matchAll(INCLUDE)) visit(match[1]!);
  };
  for (const path of flow.system) visit(path);
  for (const stage of flow.stages) visit(stage.prompt);

  const list: ZheyeRecipeFile[] = [...files.entries()].map(([path, content]) => ({ path, content }));
  return {
    type,
    name: flow.name,
    model: flow.model,
    reasoningEffort: flow.reasoningEffort,
    docs: flow.docs,
    article: flow.article,
    system: flow.system.map(safeRelative),
    stages: flow.stages.map((stage) => ({ ...stage, prompt: safeRelative(stage.prompt) })),
    files: list,
    hash: hashFiles(list),
  };
}

export function hashFiles(files: ZheyeRecipeFile[]): string {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    hash.update(file.path).update("\0").update(file.content).update("\0");
  }
  return hash.digest("hex").slice(0, 8);
}

/**
 * 渲染一个提示词文件：去掉注释，展开 {{引入 路径}}，再替换 {{变量}}。
 * 用的是配方快照里的文件内容（同一次试跑前后一致）。未知的变量报错，免得把占位符原样发给模型。
 */
export function renderPrompt(files: ZheyeRecipeFile[], path: string, vars: Record<string, string>): string {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const expand = (rel: string, stack: string[]): string => {
    if (stack.includes(rel)) throw new Error(`提示词循环引入：${[...stack, rel].join(" → ")}`);
    const content = byPath.get(rel);
    if (content === undefined) throw new Error(`找不到配方文件：${rel}`);
    return content
      .replace(COMMENT, "")
      .replace(INCLUDE, (_match, target: string) => expand(safeRelative(target), [...stack, rel]).trim());
  };
  const text = expand(safeRelative(path), []).replace(VARIABLE, (match, name: string) => {
    if (!(name in vars)) throw new Error(`${path}：未知的变量 ${match}`);
    return vars[name]!;
  });
  return text.replace(/\n{3,}/g, "\n\n").trim();
}
