/*
 * 打发布包（docs/future/web-version.md §5）：apps/server/dist-release/
 *   server.mjs                    打包好的服务端（子应用后端、内核都在里面）
 *   apps/host/renderer/           外壳
 *   apps/server/web/              登录页、设置密码页、client.js、bridge.js
 *   apps/server/deploy/           服务配置、Caddyfile、fail2ban 规则、管理命令（activate-release.sh 安装）
 *   apps/<云端应用>/ui/            子应用界面
 *   apps/zheye/recipes/           哲野的配方（运行时读）
 *   VERSION                       提交号、打包时间
 */
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = join(repo, "apps", "server", "dist-release");
const CLOUD_APPS = ["vocab", "dialog", "go", "zheye"];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(repo, "apps", "server", "src", "main.ts")],
  outfile: join(out, "server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  // ws 里的可选加速包：没有也能用（它自己会 try/catch）
  external: ["bufferutil", "utf-8-validate"],
  // 打包进来的 CommonJS 依赖（ws）会 require Node 自带的模块
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: "warning",
});

const copy = (rel) => cpSync(join(repo, rel), join(out, rel), { recursive: true });
copy("apps/host/renderer");
copy("apps/server/web");
copy("apps/server/deploy");
mkdirSync(join(out, "apps", "server", "scripts"), { recursive: true });
for (const file of ["backup-lib.mjs", "backup.mjs", "restore-backup.mjs", "configure-backup.sh"]) {
  cpSync(join(repo, "apps", "server", "scripts", file), join(out, "apps", "server", "scripts", file));
}
for (const id of CLOUD_APPS) copy(`apps/${id}/ui`);
copy("apps/zheye/recipes");

const commit = execSync("git rev-parse --short HEAD", { cwd: repo }).toString().trim();
const dirty = execSync("git status --porcelain", { cwd: repo }).toString().trim() !== "";
writeFileSync(join(out, "VERSION"), `${commit}${dirty ? "-dirty" : ""} ${new Date().toISOString()}\n`);
console.log(`[release] ${out} (${commit}${dirty ? "-dirty" : ""})`);
