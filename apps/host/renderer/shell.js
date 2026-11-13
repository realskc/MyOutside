/* MyOutside 外壳：应用列表 + 面板区 + 设置（v0） */

const DICT = {
  zh: {
    appName: "地球online",
    noApps: "没有已安装的子应用",
    loadFailed: "加载失败",
    settings: "设置",
    toggle: "EN",
    settingsTitle: "设置",
    languageLabel: "界面语言",
    apiKeyLabel: "DeepSeek API Key",
    apiKeyHint: "保存在本机，用系统钥匙串加密；任何子应用都读不到。",
    apiKeyLabelShared: "DeepSeek API Key（大家共用）",
    apiKeyHintShared: "试用阶段所有用户都用这把 key，加密保存在服务器上，任何子应用、任何用户都读不到；朋友每人每周有额度。",
    aiQuotaTitle: "AI 额度",
    aiQuotaShared: "试用期间 AI 用的是邀请你的人提供的 key。",
    aiQuotaLine: (used, limit, reset) => `本周已用 ${used} / ${limit}，${reset}恢复。`,
    aiNoKey: "服务器还没有配置 AI 的 key，AI 功能暂时用不了，请联系邀请你的人。",
    aiQuotaHint: "试用期间 AI 用的是邀请你的人提供的 key，每人每周有额度；花费是按 DeepSeek 官方价格估算的。",
    inviteTitle: "邀请朋友",
    inviteCreate: "生成邀请链接",
    inviteCopy: "复制",
    inviteCopied: "已复制",
    inviteUntil: (until) => `${until} 前有效`,
    inviteFailed: (reason) => `生成失败：${reason}`,
    inviteHint: "链接 7 天内有效，用一次就作废；只发给你要邀请的人。对方打开后自己起用户名、设密码。",
    usersTitle: "用户",
    usersName: "用户名",
    usersWeek: "本周花费",
    usersTotal: "一共",
    usersLimit: "额度",
    usersAdmin: "管理员",
    usersNoLimit: "不限",
    usersPerWeek: (limit) => `每周 ${limit}`,
    save: "保存",
    saved: "已保存",
    notSet: "未设置",
    apiKeyPlaceholder: "尚未设置",
    apiKeyPlaceholderSet: "已设置（重新输入可覆盖）",
    dataVersion: (v) => `数据版本 ${v}`,
    usageTitle: "用量与花费",
    usageToday: "今天",
    usage7d: "近 7 天",
    usage30d: "近 30 天",
    usageAll: "全部",
    usageApp: "子应用",
    usageAiCalls: "AI 调用",
    usageInput: "输入 tokens（命中缓存）",
    usageOutput: "输出 tokens（思考）",
    usageWeb: "搜索 / 抓取",
    usageCost: "估算花费",
    usageTotal: "合计",
    usageNone: "这段时间没有用量。",
    usageShell: "外壳",
    usagePlatform: "平台内部（脚本等）",
    usageHint:
      "按 DeepSeek 官方价格估算：区分高峰 / 空闲时段（空闲半价），法定节假日按工作日计；被停止的回复拿不到用量，不计入。实际以 DeepSeek 账单为准。",
    backupTitle: "服务器备份",
    backupOk: (when, ago) => `上次成功：${when}（${ago}）`,
    backupNever: "还没有成功备份过",
    backupFailed: (when, error) => `上次尝试失败（${when}）：${error}`,
    backupWarn: "服务器备份有问题，打开设置查看",
    backupHint: "每天凌晨 4 点（香港时间）和每次部署前，加密备份到 Cloudflare R2；超过一天没有成功就标红。只有管理员能看到。",
    ago: (hours) => (hours < 1 ? "不到 1 小时前" : hours < 48 ? `${hours} 小时前` : `${Math.floor(hours / 24)} 天前`),
  },
  en: {
    appName: "MyOutside",
    noApps: "No apps installed",
    loadFailed: "Failed to load",
    settings: "Settings",
    toggle: "中文",
    settingsTitle: "Settings",
    languageLabel: "Language",
    apiKeyLabel: "DeepSeek API Key",
    apiKeyHint: "Stored locally, encrypted with the system keychain; no app can read it.",
    apiKeyLabelShared: "DeepSeek API Key (shared)",
    apiKeyHintShared: "During the trial every user uses this key. It is stored encrypted on the server; no app and no user can read it. Each friend has a weekly budget.",
    aiQuotaTitle: "AI budget",
    aiQuotaShared: "During the trial, AI runs on a key provided by the person who invited you.",
    aiQuotaLine: (used, limit, reset) => `Used ${used} of ${limit} this week; resets ${reset}.`,
    aiNoKey: "The server has no AI key yet, so AI features are unavailable. Ask the person who invited you.",
    aiQuotaHint: "During the trial, AI runs on a key provided by the person who invited you, with a weekly budget per person. Costs are estimated from DeepSeek's official prices.",
    inviteTitle: "Invite a friend",
    inviteCreate: "Create invite link",
    inviteCopy: "Copy",
    inviteCopied: "Copied",
    inviteUntil: (until) => `Valid until ${until}`,
    inviteFailed: (reason) => `Failed: ${reason}`,
    inviteHint: "The link works once and expires in 7 days; send it only to the person you invite. They choose their own username and password.",
    usersTitle: "Users",
    usersName: "Username",
    usersWeek: "This week",
    usersTotal: "Total",
    usersLimit: "Budget",
    usersAdmin: "admin",
    usersNoLimit: "Unlimited",
    usersPerWeek: (limit) => `${limit} / week`,
    save: "Save",
    saved: "Saved",
    notSet: "Not set",
    apiKeyPlaceholder: "Not set",
    apiKeyPlaceholderSet: "Set (type to overwrite)",
    dataVersion: (v) => `Data version ${v}`,
    usageTitle: "Usage & cost",
    usageToday: "Today",
    usage7d: "Last 7 days",
    usage30d: "Last 30 days",
    usageAll: "All time",
    usageApp: "App",
    usageAiCalls: "AI calls",
    usageInput: "Input tokens (cache hit)",
    usageOutput: "Output tokens (reasoning)",
    usageWeb: "Search / fetch",
    usageCost: "Est. cost",
    usageTotal: "Total",
    usageNone: "No usage in this period.",
    usageShell: "Shell",
    usagePlatform: "Platform (scripts etc.)",
    usageHint:
      "Estimated from DeepSeek's official prices, with peak / off-peak rates (off-peak is half price; public holidays are treated as workdays). Stopped replies report no usage and are not counted. DeepSeek's bill is authoritative.",
    backupTitle: "Server backup",
    backupOk: (when, ago) => `Last success: ${when} (${ago})`,
    backupNever: "No successful backup yet",
    backupFailed: (when, error) => `Last attempt failed (${when}): ${error}`,
    backupWarn: "Server backup needs attention; open Settings",
    backupHint:
      "Encrypted backup to Cloudflare R2 every day at 4:00 (Hong Kong time) and before every deploy; turns red after a day without success. Only admins see this.",
    ago: (hours) => (hours < 1 ? "less than an hour ago" : hours < 48 ? `${hours} hours ago` : `${Math.floor(hours / 24)} days ago`),
  },
};

const appsEl = document.getElementById("apps");
let panel = document.getElementById("panel");
const versionEl = document.getElementById("version");
const settingsView = document.getElementById("settings-view");

let lang = "zh";
let bootstrapped = false;
let settingsOpen = false;

const t = (key) => DICT[lang][key];

// Electron 用 app:// 自定义协议；局域网预览用同源的 /apps/<id>/。
const IS_WEB = location.protocol === "http:" || location.protocol === "https:";
// 服务器版（docs/future/web-version.md）：子应用关进沙箱 iframe，每次打开都新建一个（D-0090），由 client.js 提供
const SERVER = window.__MYOUTSIDE_SERVER__ === true;
/** 当前面板里的子应用（服务器版没法从 src 可靠地认出来：面板可能自己跳走） */
let currentAppId = null;

function openApp(id) {
  currentAppId = id.toLowerCase();
  if (SERVER) {
    panel = window.__myoutsideShell.mountApp(id, panel);
  } else {
    panel.src = appUrl(id);
  }
  // 切换应用后把键盘焦点交给面板，空格等快捷键直接作用于子应用
  panel.addEventListener("load", () => panel.focus(), { once: true });
}

function appUrl(id) {
  // app:// 的 host 大小写不敏感；应用 id 本身保留原始大小写。
  return IS_WEB ? `/apps/${encodeURIComponent(id)}/index.html` : `app://${id.toLowerCase()}/index.html`;
}

function appIdFromSrc(src) {
  if (src.startsWith("app://")) return (src.slice("app://".length).split("/")[0] || null)?.toLowerCase() ?? null;
  if (src.startsWith("/apps/")) return (src.slice("/apps/".length).split("/")[0] || null)?.toLowerCase() ?? null;
  return null;
}

async function call(name, payload) {
  return window.outside.call(name, payload);
}

// ---- 语言 ----

async function initLanguage() {
  let value = null;
  try {
    const res = await call("platform.settings.get", { key: "ui.language" });
    value = res.ok ? res.result.value : null;
  } catch {
    /* ignore */
  }
  lang = value === "zh" || value === "en" ? value : navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
  applyLanguage();
}

function applyLanguage() {
  document.querySelector(".brand").textContent = t("appName");
  document.title = t("appName");
  document.getElementById("btn-settings").textContent = t("settings");
  document.getElementById("lang-toggle").textContent = t("toggle");
  applyBackupWarning();
  if (settingsOpen) {
    renderSettings();
  } else {
    loadApps();
  }
  refreshVersion();
}

async function setLanguage(next) {
  lang = next;
  await call("platform.settings.set", { key: "ui.language", value: lang });
  applyLanguage();
  reloadPanel();
}

function reloadPanel() {
  if (SERVER) {
    if (currentAppId) openApp(currentAppId);
    return;
  }
  const src = panel.getAttribute("src") || "";
  if (src.startsWith("app://") || src.startsWith("/apps/")) {
    panel.src = src.replace(/\?.*$/, "") + "?l=" + Date.now();
  }
}

// ---- 应用列表 ----

function setActive(button) {
  for (const el of document.querySelectorAll(".app-item")) {
    el.classList.toggle("active", el === button);
  }
}

async function loadApps() {
  try {
    const res = await call("platform.listApps", {});
    if (!res.ok) throw new Error(res.error.message);
    const apps = res.result ?? [];
    appsEl.innerHTML = "";
    if (apps.length === 0) {
      appsEl.innerHTML = `<div class="empty">${t("noApps")}</div>`;
      return;
    }
    for (const app of apps) {
      const button = document.createElement("button");
      button.className = "app-item";
      button.dataset.appId = app.id;
      button.textContent = app.name;
      button.addEventListener("click", () => {
        closeSettings();
        openApp(app.id);
        setActive(button);
      });
      appsEl.appendChild(button);
    }
    const currentId = SERVER ? currentAppId : appIdFromSrc(panel.getAttribute("src") || "");
    if (currentId) {
      const active = [...appsEl.querySelectorAll(".app-item")].find(
        (item) => item.dataset.appId.toLowerCase() === currentId,
      );
      if (active) setActive(active);
    }
    if (!bootstrapped) {
      bootstrapped = true;
      const first = appsEl.querySelector(".app-item");
      if (first) first.click();
    }
  } catch (error) {
    appsEl.innerHTML = `<div class="empty">${t("loadFailed")}：${String(error)}</div>`;
  }
}

async function refreshVersion() {
  try {
    const res = await call("platform.dataVersion", {});
    if (res.ok) versionEl.textContent = t("dataVersion")(res.result);
  } catch {
    /* ignore */
  }
}

// ---- 设置 ----

function openSettings() {
  settingsOpen = true;
  panel.classList.add("hidden");
  settingsView.classList.remove("hidden");
  renderSettings();
}

function closeSettings() {
  settingsOpen = false;
  settingsView.classList.add("hidden");
  panel.classList.remove("hidden");
}

async function renderSettings() {
  let hasKey = false;
  let quota = null;
  try {
    // 凭据读不到值，只能知道是否已设置
    const res = await call("platform.settings.get", { key: "ai.deepseek.apiKey" });
    hasKey = res.ok && res.result.isSet === true;
  } catch {
    /* ignore */
  }
  if (SERVER) {
    await Promise.all([refreshBackupStatus(), refreshMe()]);
    try {
      const res = await call("platform.usage.quota", {});
      quota = res.ok ? res.result : null;
    } catch {
      /* ignore */
    }
  }
  // 服务器试用阶段（D-0097）：大家共用作者的 key，只有管理员能改；朋友看到的是自己本周的额度
  const isAdmin = SERVER && me && me.isAdmin;
  const canEditKey = !SERVER || isAdmin;

  settingsView.innerHTML =
    `<h2>${t("settingsTitle")}</h2>` +
    `<div class="setting-row"><label>${t("languageLabel")}</label>` +
    `<select id="set-lang"><option value="zh">中文</option><option value="en">English</option></select></div>` +
    (canEditKey
      ? `<div class="setting-row"><label>${t(SERVER ? "apiKeyLabelShared" : "apiKeyLabel")}</label>` +
        `<input id="set-api-key" type="password" placeholder="${hasKey ? t("apiKeyPlaceholderSet") : t("apiKeyPlaceholder")}" />` +
        `<div class="setting-actions"><button id="save-api-key">${t("save")}</button>` +
        `<span class="hint">${hasKey ? t("saved") : t("notSet")}</span></div>` +
        `<p class="hint">${t(SERVER ? "apiKeyHintShared" : "apiKeyHint")}</p></div>`
      : quotaRowHtml(quota, hasKey)) +
    (isAdmin ? inviteRowHtml() + usersRowHtml() : "") +
    backupRowHtml() +
    `<div class="setting-row usage-row"><label>${t("usageTitle")}</label>` +
    `<select id="usage-period">` +
    `<option value="today">${t("usageToday")}</option><option value="7d">${t("usage7d")}</option>` +
    `<option value="30d" selected>${t("usage30d")}</option><option value="all">${t("usageAll")}</option></select>` +
    `<div id="usage-table" class="usage-table"></div>` +
    `<p class="hint">${t("usageHint")}</p></div>`;

  const periodSelect = document.getElementById("usage-period");
  periodSelect.addEventListener("change", () => void renderUsage(periodSelect.value));
  void renderUsage(periodSelect.value);

  const langSelect = document.getElementById("set-lang");
  langSelect.value = lang;
  langSelect.addEventListener("change", () => {
    void setLanguage(langSelect.value === "en" ? "en" : "zh");
  });

  document.getElementById("save-api-key")?.addEventListener("click", async () => {
    const input = document.getElementById("set-api-key");
    const value = input.value.trim();
    if (!value) return;
    await call("platform.settings.set", { key: "ai.deepseek.apiKey", value });
    input.value = "";
    await renderSettings();
  });

  if (isAdmin) {
    document.getElementById("invite-create").addEventListener("click", () => void createInvite());
    void renderUsers();
  }
}

// ---- 服务器试用阶段（D-0097）：当前用户、朋友的额度、邀请、各用户的花费 ----

/** 服务器版的当前用户 { username, isAdmin } */
let me = null;

async function refreshMe() {
  try {
    const res = await fetch("/__myoutside/session", { cache: "no-store" });
    if (res.ok) me = await res.json();
  } catch {
    /* 网络断了：保留上次的 */
  }
}

const yuan = (value) => `¥${value.toFixed(2)}`;

function quotaRowHtml(quota, hasKey) {
  let line = hasKey ? t("aiQuotaShared") : t("aiNoKey");
  let problem = !hasKey;
  if (hasKey && quota) {
    const reset = lang === "zh" ? quota.resetText : new Date(quota.periodEnd).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", hour12: false });
    line = t("aiQuotaLine")(yuan(quota.usedYuan), yuan(quota.limitYuan), reset);
    problem = quota.usedYuan >= quota.limitYuan;
  }
  return (
    `<div class="setting-row"><label>${t("aiQuotaTitle")}</label>` +
    `<p id="ai-quota" class="status-line${problem ? " problem" : ""}">${escapeHtml(line)}</p>` +
    `<p class="hint">${t("aiQuotaHint")}</p></div>`
  );
}

function inviteRowHtml() {
  return (
    `<div class="setting-row"><label>${t("inviteTitle")}</label>` +
    `<div class="setting-actions"><button id="invite-create">${t("inviteCreate")}</button></div>` +
    `<div id="invite-result"></div>` +
    `<p class="hint">${t("inviteHint")}</p></div>`
  );
}

async function createInvite() {
  const box = document.getElementById("invite-result");
  try {
    const res = await fetch("/__myoutside/invites", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || String(res.status));
    const until = new Date(body.expiresAt).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", { hour12: false });
    box.innerHTML =
      `<input id="invite-link" readonly value="${escapeHtml(body.link)}" />` +
      `<div class="setting-actions"><button id="invite-copy">${t("inviteCopy")}</button>` +
      `<span class="hint">${escapeHtml(t("inviteUntil")(until))}</span></div>`;
    const input = document.getElementById("invite-link");
    input.addEventListener("focus", () => input.select());
    document.getElementById("invite-copy").addEventListener("click", async (event) => {
      try {
        await navigator.clipboard.writeText(body.link);
        event.target.textContent = t("inviteCopied");
      } catch {
        input.select();
      }
    });
  } catch (error) {
    box.innerHTML = `<p class="status-line problem">${escapeHtml(t("inviteFailed")(String(error.message || error)))}</p>`;
  }
}

function usersRowHtml() {
  return `<div class="setting-row usage-row"><label>${t("usersTitle")}</label><div id="users-table" class="usage-table"></div></div>`;
}

async function renderUsers() {
  const el = document.getElementById("users-table");
  if (!el) return;
  try {
    const res = await fetch("/__myoutside/admin/users", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const users = await res.json();
    el.innerHTML =
      `<table><thead><tr><th>${t("usersName")}</th><th>${t("usersWeek")}</th><th>${t("usersTotal")}</th><th>${t("usersLimit")}</th></tr></thead><tbody>` +
      users
        .map(
          (user) =>
            `<tr><td>${escapeHtml(user.username)}${user.isAdmin ? ` (${t("usersAdmin")})` : ""}</td>` +
            `<td>${yuan(user.weekYuan)}</td><td>${yuan(user.totalYuan)}</td>` +
            `<td>${user.weeklyLimitYuan === null ? t("usersNoLimit") : t("usersPerWeek")(yuan(user.weeklyLimitYuan))}</td></tr>`,
        )
        .join("") +
      `</tbody></table>`;
  } catch (error) {
    el.textContent = String(error);
  }
}

// ---- 服务器备份（D-0096）：只有服务器版、只给管理员；超过一天没成功或上次失败，设置按钮上带红点 ----

let backupStatus = null;

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

async function refreshBackupStatus() {
  if (!SERVER) return;
  try {
    const res = await fetch("/__myoutside/backup-status", { cache: "no-store" });
    const body = res.ok ? await res.json() : null;
    backupStatus = body && body.enabled ? body : null;
  } catch {
    /* 网络断了：保留上次的 */
  }
  applyBackupWarning();
}

function applyBackupWarning() {
  const button = document.getElementById("btn-settings");
  const warn = !!(backupStatus && backupStatus.problem);
  button.classList.toggle("warn", warn);
  button.title = warn ? t("backupWarn") : "";
}

function backupRowHtml() {
  if (!backupStatus) return "";
  const when = (ms) => new Date(ms).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", { hour12: false });
  const lines = [
    backupStatus.lastSuccessAt
      ? t("backupOk")(when(backupStatus.lastSuccessAt), t("ago")(Math.floor((Date.now() - backupStatus.lastSuccessAt) / 3_600_000)))
      : t("backupNever"),
  ];
  if (backupStatus.lastAttemptOk === false) {
    lines.push(t("backupFailed")(when(backupStatus.lastAttemptAt), backupStatus.lastError || "?"));
  }
  return (
    `<div class="setting-row"><label>${t("backupTitle")}</label>` +
    `<p id="backup-status" class="backup-status${backupStatus.problem ? " problem" : ""}">${lines.map(escapeHtml).join("<br>")}</p>` +
    `<p class="hint">${t("backupHint")}</p></div>`
  );
}

// ---- 用量与花费（D-0074） ----

function periodStart(period) {
  const now = new Date();
  if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (period === "7d") return now.getTime() - 7 * 86_400_000;
  if (period === "30d") return now.getTime() - 30 * 86_400_000;
  return 0;
}

async function renderUsage(period) {
  const el = document.getElementById("usage-table");
  if (!el) return;
  const [summary, apps] = await Promise.all([
    call("platform.usage.summary", { since: periodStart(period) }),
    call("platform.listApps", {}),
  ]);
  if (!summary.ok) {
    el.textContent = summary.error.message;
    return;
  }
  const rows = summary.result;
  if (rows.length === 0) {
    el.innerHTML = `<p class="hint">${t("usageNone")}</p>`;
    return;
  }
  const names = new Map((apps.ok ? apps.result : []).map((app) => [app.id, app.name]));
  const nameOf = (caller) =>
    caller === "shell" ? t("usageShell") : caller === "platform" ? t("usagePlatform") : names.get(caller) || caller;
  const num = (value) => value.toLocaleString(lang === "zh" ? "zh-CN" : "en-US");
  const money = (value) => `¥${value < 0.01 && value > 0 ? value.toFixed(4) : value.toFixed(2)}`;
  const escape = (text) => String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const total = rows.reduce(
    (sum, row) => {
      for (const key of Object.keys(sum)) sum[key] += row[key];
      return sum;
    },
    { aiCalls: 0, promptTokens: 0, cacheHitTokens: 0, completionTokens: 0, reasoningTokens: 0, searches: 0, fetches: 0, costYuan: 0 },
  );
  const paren = (value) => (lang === "zh" ? `（${num(value)}）` : ` (${num(value)})`);
  const line = (name, row, cls = "") =>
    `<tr class="${cls}"><td>${escape(name)}</td><td>${num(row.aiCalls)}</td>` +
    `<td>${num(row.promptTokens)}${paren(row.cacheHitTokens)}</td>` +
    `<td>${num(row.completionTokens)}${paren(row.reasoningTokens)}</td>` +
    `<td>${num(row.searches)} / ${num(row.fetches)}</td><td>${money(row.costYuan)}</td></tr>`;
  el.innerHTML =
    `<table><thead><tr><th>${t("usageApp")}</th><th>${t("usageAiCalls")}</th><th>${t("usageInput")}</th>` +
    `<th>${t("usageOutput")}</th><th>${t("usageWeb")}</th><th>${t("usageCost")}</th></tr></thead><tbody>` +
    rows.map((row) => line(nameOf(row.caller), row)).join("") +
    (rows.length > 1 ? line(t("usageTotal"), total, "total") : "") +
    `</tbody></table>`;
}

// ---- 事件与启动 ----

document.getElementById("btn-settings").addEventListener("click", () => {
  if (settingsOpen) closeSettings();
  else openSettings();
});
document.getElementById("lang-toggle").addEventListener("click", () => {
  void setLanguage(lang === "zh" ? "en" : "zh");
});

initLanguage().then(() => {
  setInterval(refreshVersion, 3000);
  if (SERVER) {
    void refreshBackupStatus();
    setInterval(() => void refreshBackupStatus(), 10 * 60_000);
  }
});
