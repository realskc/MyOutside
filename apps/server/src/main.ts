import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openAccounts } from "./accounts.js";
import { createMyOutsideServer, type ServerConfig } from "./server.js";

/**
 * 服务器版 MyOutside 的命令行（docs/future/web-version.md）：
 *   serve [--dev]              启动服务；--dev 用本机临时数据目录、http://localhost:8787（不碰作者的真实数据）
 *   create-user <用户名> [--admin]   建账号，打印一次性的设置链接（24 小时内有效，用一次作废）
 *   setup-link <用户名>          重新生成设置链接（忘了密码时用）
 * 正式环境用环境变量：MYOUTSIDE_DATA_DIR、MYOUTSIDE_ORIGIN、MYOUTSIDE_PORT、MYOUTSIDE_ROOT、MYOUTSIDE_BACKUP_STATUS。
 */
// 新建的文件、目录默认只有自己能读写（平台库里有密码哈希，用户库里有加密的 API key）
process.umask(0o077);

const args = process.argv.slice(2);
const command = args[0];
const dev = args.includes("--dev");

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function config(): ServerConfig & { port: number; host: string } {
  if (dev) {
    return {
      root: sourceRoot,
      dataDir: process.env.MYOUTSIDE_DATA_DIR ?? join(tmpdir(), "myoutside-server-dev"),
      publicOrigin: "http://localhost:8787",
      secureCookies: false,
      trustProxy: false,
      port: 8787,
      host: "127.0.0.1",
      backupStatusFile: process.env.MYOUTSIDE_BACKUP_STATUS,
    };
  }
  const dataDir = process.env.MYOUTSIDE_DATA_DIR;
  if (!dataDir) throw new Error("正式环境要设置 MYOUTSIDE_DATA_DIR（或用 --dev）");
  return {
    root: process.env.MYOUTSIDE_ROOT ?? sourceRoot,
    dataDir,
    publicOrigin: process.env.MYOUTSIDE_ORIGIN ?? "https://myoutside.org",
    secureCookies: true,
    trustProxy: true,
    port: Number(process.env.MYOUTSIDE_PORT ?? 8787),
    host: "127.0.0.1",
    backupStatusFile: process.env.MYOUTSIDE_BACKUP_STATUS,
  };
}

async function serve(): Promise<void> {
  const settings = config();
  const app = createMyOutsideServer(settings);
  await app.listen(settings.port, settings.host);
  console.log(`[server] listening on http://${settings.host}:${settings.port} (${settings.publicOrigin}); data: ${settings.dataDir}`);

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[server] ${signal}: 停止接新连接，等进行中的调用结束（最多 30 秒）`);
    app.server.close();
    const deadline = Date.now() + 30_000;
    while (app.kernels.stats().activeCalls > 0 && Date.now() < deadline) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
    }
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
}

function admin(): void {
  const settings = config();
  const accounts = openAccounts(join(settings.dataDir, "platform.db"));
  try {
    const username = args[1];
    if (!username) throw new Error("要给出用户名");
    const user = command === "create-user" ? accounts.createUser(username, { admin: args.includes("--admin") }) : accounts.findUser(username);
    if (!user) throw new Error(`没有这个用户：${username}`);
    const token = accounts.createSetupToken(user.id);
    console.log(`用户 ${user.username} 的设置链接（24 小时内有效，用一次作废）：`);
    console.log(`${settings.publicOrigin}/__myoutside/setup#${token}`);
  } finally {
    accounts.close();
  }
}

try {
  if (command === "serve") await serve();
  else if (command === "create-user" || command === "setup-link") admin();
  else {
    console.error("用法：serve [--dev] | create-user <用户名> [--admin] [--dev] | setup-link <用户名> [--dev]");
    process.exit(2);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
