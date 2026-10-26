import { spawn } from "node:child_process";
import electron from "electron";

const smoke = process.argv.includes("--smoke");
const lan = process.argv.includes("--lan");
const child = spawn(electron, ["."], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...(smoke ? { MYOUTSIDE_SMOKE: "1" } : {}),
    ...(lan ? { MYOUTSIDE_LAN: "1" } : {}),
  },
});
child.on("exit", (code) => process.exit(code ?? 1));
