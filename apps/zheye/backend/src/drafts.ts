import type { AgentTool } from "@myoutside/agent";

/**
 * 草稿与编辑工具（ZHEYE-0019）：读取、查找替换、整篇重写。
 * 草稿只在这次写作的内存里；每次修改通过 onChange 交给调用方（保存进轨迹、推给界面）。
 */

export interface DraftChange {
  doc: string;
  op: "write" | "edit";
  /** 改完后的全文 */
  content: string;
  old?: string;
  new?: string;
}

export interface Drafts {
  get(name: string): string;
  all(): Record<string, string>;
  tools: AgentTool[];
}

function countOccurrences(text: string, part: string): number {
  let count = 0;
  for (let at = text.indexOf(part); at !== -1; at = text.indexOf(part, at + part.length)) count += 1;
  return count;
}

export function createDrafts(names: string[], onChange: (change: DraftChange) => Promise<void>): Drafts {
  const docs = new Map(names.map((name) => [name, ""]));
  const nameOf = (args: Record<string, unknown>): string => {
    const name = String(args.name ?? "");
    if (!docs.has(name)) throw new Error(`没有这份草稿：「${name}」。可用的草稿：${names.join("、")}`);
    return name;
  };
  const nameParam = { type: "string", enum: names, description: "草稿的名字" };

  const read: AgentTool = {
    name: "read_doc",
    description: "读取一份草稿的当前全文。",
    parameters: { type: "object", properties: { name: nameParam }, required: ["name"] },
    repeatable: true,
    maxChars: 200_000,
    summarize: (args) => `读取「${String(args.name ?? "")}」`,
    execute: async (args) => {
      const name = nameOf(args);
      return docs.get(name)!;
    },
    toModel: (output) => (String(output) === "" ? "（空）" : String(output)),
  };

  const edit: AgentTool = {
    name: "edit_doc",
    description:
      "修改一份草稿：给出草稿里的一段原文（old）和替换后的内容（new）。原文必须在草稿里恰好出现一次；找不到或出现多次会报错，这时多带一些上下文再试。",
    parameters: {
      type: "object",
      properties: {
        name: nameParam,
        old: { type: "string", description: "草稿里的一段原文，必须恰好出现一次" },
        new: { type: "string", description: "替换成的内容（可以为空，表示删除）" },
      },
      required: ["name", "old", "new"],
    },
    repeatable: true,
    summarize: (args) => `修改「${String(args.name ?? "")}」`,
    execute: async (args) => {
      const name = nameOf(args);
      const oldText = String(args.old ?? "");
      const newText = String(args.new ?? "");
      if (oldText === "") throw new Error("old 不能为空；要整篇替换请用 write_doc");
      const current = docs.get(name)!;
      const count = countOccurrences(current, oldText);
      if (count === 0) throw new Error(`原文在「${name}」里没有找到（需要逐字一致）。可以先用 read_doc 看一下当前全文`);
      if (count > 1) throw new Error(`原文在「${name}」里出现了 ${count} 次，请多带一些上下文，让它只出现一次`);
      const next = current.replace(oldText, () => newText);
      docs.set(name, next);
      await onChange({ doc: name, op: "edit", content: next, old: oldText, new: newText });
      return { length: next.length };
    },
    toModel: (output, args) => `已修改「${String(args.name ?? "")}」，现在共 ${(output as { length: number }).length} 字。`,
  };

  const write: AgentTool = {
    name: "write_doc",
    description: "用新内容整篇替换一份草稿（新写、或推倒重写）。",
    parameters: {
      type: "object",
      properties: {
        name: nameParam,
        content: { type: "string", description: "草稿的新全文" },
      },
      required: ["name", "content"],
    },
    repeatable: true,
    summarize: (args) => `重写「${String(args.name ?? "")}」`,
    execute: async (args) => {
      const name = nameOf(args);
      const content = String(args.content ?? "");
      docs.set(name, content);
      await onChange({ doc: name, op: "write", content });
      return { length: content.length };
    },
    toModel: (output, args) => `已写入「${String(args.name ?? "")}」，共 ${(output as { length: number }).length} 字。`,
  };

  return {
    get: (name) => docs.get(name) ?? "",
    all: () => Object.fromEntries(docs),
    tools: [read, edit, write],
  };
}
