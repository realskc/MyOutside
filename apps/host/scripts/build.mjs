import { build } from "esbuild";
import { mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  sourcemap: true,
  logLevel: "warning",
};

await build({ ...common, entryPoints: ["src/main/index.ts"], outfile: "dist/main.cjs" });
await build({ ...common, entryPoints: ["src/preload/index.ts"], outfile: "dist/preload.cjs" });

console.log("[host] build done");
