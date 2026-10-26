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
  if (src.startsWith("app://")) {
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
        panel.src = `app://${app.id}/index.html`;
        setActive(button);
      });
      appsEl.appendChild(button);
    }
    const currentId = (panel.getAttribute("src") || "").match(/^app:\/\/([^/]+)\//);
    if (currentId) {
      const active = appsEl.querySelector(`[data-app-id="${currentId[1]}"]`);
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
    `<p class="hint">${t("apiKeyHint")}</p></div>`;

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
