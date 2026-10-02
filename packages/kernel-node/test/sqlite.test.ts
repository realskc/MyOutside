import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createNodeSqliteAdapter } from "../src/index.js";

describe("kernel-node sqlite adapter", () => {
  const dir = mkdtempSync(join(tmpdir(), "myoutside-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("基本读写、布尔归一化与事务回滚（文件库）", () => {
    const adapter = createNodeSqliteAdapter({ path: join(dir, "test.db") });
    adapter.execute("CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)");
    adapter.execute("INSERT INTO t (id, n) VALUES (?, ?)", ["a", 1]);
    adapter.execute("INSERT INTO t (id, n) VALUES (?, ?)", ["c", true]);
    expect(adapter.select<{ n: number }>("SELECT n FROM t WHERE id = ?", ["a"])[0]?.n).toBe(1);
    expect(adapter.select<{ n: number }>("SELECT n FROM t WHERE id = ?", ["c"])[0]?.n).toBe(1);

    expect(() =>
      adapter.transaction(() => {
        adapter.execute("INSERT INTO t (id, n) VALUES (?, ?)", ["b", 2]);
        throw new Error("rollback");
      }),
    ).toThrow("rollback");
    expect(adapter.select("SELECT * FROM t").length).toBe(2);
    adapter.close();
  });
});
