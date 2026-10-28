/* 按行对比两段文字（最长公共子序列），给试验台看草稿的修改与两次试跑的配方差异。
   文字很长时退化为「整段删除 + 整段新增」，免得卡住界面。 */
(() => {
  "use strict";

  const MAX_CELLS = 4_000_000;

  /** @returns {Array<{ op: "same" | "del" | "add", text: string }>} */
  function diffLines(before, after) {
    const a = String(before ?? "").split("\n");
    const b = String(after ?? "").split("\n");
    if (a.length * b.length > MAX_CELLS) {
      return [...a.map((text) => ({ op: "del", text })), ...b.map((text) => ({ op: "add", text }))];
    }
    const n = a.length;
    const m = b.length;
    const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    const out = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        out.push({ op: "same", text: a[i] });
        i += 1;
        j += 1;
      } else if (table[i + 1][j] >= table[i][j + 1]) {
        out.push({ op: "del", text: a[i] });
        i += 1;
      } else {
        out.push({ op: "add", text: b[j] });
        j += 1;
      }
    }
    while (i < n) out.push({ op: "del", text: a[i++] });
    while (j < m) out.push({ op: "add", text: b[j++] });
    return out;
  }

  window.diffLines = diffLines;
})();
