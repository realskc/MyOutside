import { spawn } from "node:child_process";
import electron from "electron";

const smoke = process.argv.includes("--smoke");
const lan = process.argv.includes("--lan");
// 冒烟测试从它自己的输出目录 dist-smoke/ 启动（见 scripts/build.mjs）
const child = spawn(electron, [smoke ? "dist-smoke" : "."], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...(smoke ? { MYOUTSIDE_SMOKE: "1" } : {}),
    ...(lan ? { MYOUTSIDE_LAN: "1" } : {}),
  },
});
child.on("exit", (code) => process.exit(code ?? 1));
