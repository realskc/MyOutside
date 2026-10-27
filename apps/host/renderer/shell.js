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
    apiKeyHint: "保存在本机（开发期明文存库，后续版本会迁移到系统钥匙串）。",
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
    apiKeyHint: "Stored locally (plaintext for now; OS keychain planned).",
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
  },
};

const appsEl = document.getElementById("apps");
const panel = document.getElementById("panel");
const versionEl = document.getElementById("version");
const settingsView = document.getElementById("settings-view");

let lang = "zh";
let bootstrapped = false;
let settingsOpen = false;

const t = (key) => DICT[lang][key];

// Electron 用 app:// 自定义协议；局域网预览用同源的 /apps/<id>/。
const IS_WEB = location.protocol === "http:" || location.protocol === "https:";

function appUrl(id) {
  return IS_WEB ? `/apps/${encodeURIComponent(id)}/index.html` : `app://${id}/index.html`;
}

function appIdFromSrc(src) {
  if (src.startsWith("app://")) return src.slice("app://".length).split("/")[0] || null;
  if (src.startsWith("/apps/")) return src.slice("/apps/".length).split("/")[0] || null;
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
        panel.src = appUrl(app.id);
        setActive(button);
      });
      appsEl.appendChild(button);
    }
    const currentId = appIdFromSrc(panel.getAttribute("src") || "");
    if (currentId) {
      const active = appsEl.querySelector(`[data-app-id="${currentId}"]`);
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
  try {
    // 凭据读不到值，只能知道是否已设置
    const res = await call("platform.settings.get", { key: "ai.deepseek.apiKey" });
    hasKey = res.ok && res.result.isSet === true;
  } catch {
    /* ignore */
  }

  settingsView.innerHTML =
    `<h2>${t("settingsTitle")}</h2>` +
    `<div class="setting-row"><label>${t("languageLabel")}</label>` +
    `<select id="set-lang"><option value="zh">中文</option><option value="en">English</option></select></div>` +
    `<div class="setting-row"><label>${t("apiKeyLabel")}</label>` +
    `<input id="set-api-key" type="password" placeholder="${hasKey ? t("apiKeyPlaceholderSet") : t("apiKeyPlaceholder")}" />` +
    `<div class="setting-actions"><button id="save-api-key">${t("save")}</button>` +
    `<span class="hint">${hasKey ? t("saved") : t("notSet")}</span></div>` +
    `<p class="hint">${t("apiKeyHint")}</p></div>` +
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

  document.getElementById("save-api-key").addEventListener("click", async () => {
    const input = document.getElementById("set-api-key");
    const value = input.value.trim();
    if (!value) return;
    await call("platform.settings.set", { key: "ai.deepseek.apiKey", value });
    input.value = "";
    await renderSettings();
  });
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
});
