/**
 * 把对话前端用到的第三方库复制到 apps/dialog/ui/vendor/（前端不经构建，直接加载，D-0069）。
 * 版本由 apps/dialog/package.json 的 devDependencies 决定；升级后重新运行：node scripts/vendor-dialog-ui.mjs
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const modules = join("apps", "dialog", "node_modules");
const out = join("apps", "dialog", "ui", "vendor");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "fonts"), { recursive: true });

const files = [
  ["marked/lib/marked.umd.js", "marked.umd.js"],
  ["dompurify/dist/purify.min.js", "purify.min.js"],
  ["katex/dist/katex.min.js", "katex.min.js"],
  ["katex/dist/katex.min.css", "katex.min.css"],
];
for (const [from, to] of files) copyFileSync(join(modules, from), join(out, to));
for (const font of readdirSync(join(modules, "katex", "dist", "fonts")).filter((name) => name.endsWith(".woff2"))) {
  copyFileSync(join(modules, "katex", "dist", "fonts", font), join(out, "fonts", font));
}
const version = (name) => JSON.parse(readFileSync(join(modules, name, "package.json"), "utf8")).version;
writeFileSync(
  join(out, "VERSIONS.txt"),
  `由 scripts/vendor-dialog-ui.mjs 生成，请勿手改。\nmarked ${version("marked")}\ndompurify ${version("dompurify")}\nkatex ${version("katex")}\n`,
);
console.log("vendored to", out);
