import { build } from "esbuild";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// 输出目录：默认 dist/（pnpm dev、myoutside）；冒烟测试用 --out dist-smoke，不碰正在运行的 MyOutside 用的 dist/
const outIndex = process.argv.indexOf("--out");
const out = outIndex >= 0 ? process.argv[outIndex + 1] : "dist";
if (!out || !/^[\w.-]+$/.test(out)) throw new Error(`非法的输出目录：${out}`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  sourcemap: true,
  logLevel: "warning",
};

await build({ ...common, entryPoints: ["src/main/index.ts"], outfile: join(out, "main.cjs") });
await build({ ...common, entryPoints: ["src/preload/index.ts"], outfile: join(out, "preload.cjs") });
if (out !== "dist") {
  // 让 Electron 能直接以这个目录启动
  writeFileSync(join(out, "package.json"), JSON.stringify({ name: "@myoutside/host", private: true, main: "main.cjs" }, null, 2) + "\n");
}

console.log(`[host] build done (${out})`);
