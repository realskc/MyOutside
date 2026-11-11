/* 网易云下载：搜歌、下载（NETEASE-0001） */
(() => {
  const bridge = window.outside;
  if (!bridge) {
    document.body.innerHTML = "<p style='padding:24px'>Please open this page inside MyOutside.</p>";
    return;
  }

  const DICT = {
    zh: {
      appTitle: "网易云下载",
      folderLabel: "下载到",
      openFolder: "打开",
      changeFolder: "更改…",
      defaultFolder: "恢复默认",
      searchPlaceholder: "歌名、歌手、专辑",
      quality: "音质",
      qualityMax: "账号能下的最高",
      levelStandard: "标准（128k）",
      levelExhigh: "极高（320k）",
      levelLossless: "无损",
      search: "搜索",
      prev: "上一页",
      next: "下一页",
      colName: "歌名",
      colArtists: "歌手",
      colAlbum: "专辑",
      colDuration: "时长",
      colMax: "最高音质",
      history: "最近下载",
      historyEmpty: "还没有下载过",
      loggedIn: "已登录",
      notLoggedIn: "未登录",
      download: "下载",
      downloading: "下载中",
      downloaded: "已下载",
      existed: "文件夹里已有",
      reveal: "在访达中显示",
      cannotDownload: "不能下载",
      vip: "VIP",
      resultsSummary: (total, from, to) => `共 ${total ?? "?"} 首，第 ${from}–${to} 首`,
      noResults: "没有搜到",
      pickerUnavailable: "文件夹选择器不可用",
      failed: "失败：",
      levels: { standard: "标准", higher: "较高", exhigh: "极高", lossless: "无损", hires: "Hi-Res" },
    },
    en: {
      appTitle: "NetEase Downloader",
      folderLabel: "Save to",
      openFolder: "Open",
      changeFolder: "Change…",
      defaultFolder: "Use default",
      searchPlaceholder: "Song, artist, album",
      quality: "Quality",
      qualityMax: "Highest allowed",
      levelStandard: "Standard (128k)",
      levelExhigh: "Extra high (320k)",
      levelLossless: "Lossless",
      search: "Search",
      prev: "Previous",
      next: "Next",
      colName: "Title",
      colArtists: "Artists",
      colAlbum: "Album",
      colDuration: "Length",
      colMax: "Best quality",
      history: "Recent downloads",
      historyEmpty: "Nothing downloaded yet",
      loggedIn: "Signed in",
      notLoggedIn: "Not signed in",
      download: "Download",
      downloading: "Downloading",
      downloaded: "Downloaded",
      existed: "Already in folder",
      reveal: "Show in Finder",
      cannotDownload: "Not downloadable",
      vip: "VIP",
      resultsSummary: (total, from, to) => `${total ?? "?"} songs, showing ${from}–${to}`,
      noResults: "No results",
      pickerUnavailable: "Folder picker unavailable",
      failed: "Failed: ",
      levels: { standard: "Standard", higher: "Higher", exhigh: "Extra high", lossless: "Lossless", hires: "Hi-Res" },
    },
  };
  const LEVELS = ["standard", "higher", "exhigh", "lossless", "hires"];
  const PAGE = 30;

  let lang = "zh";
  const t = (key) => DICT[lang][key] ?? DICT.zh[key] ?? key;

  async function callOrThrow(name, payload, options) {
    const result = await bridge.call(name, payload, options);
    if (!result || !result.ok) {
      const error = new Error(result && result.error ? result.error.message : "unknown error");
      error.code = result && result.error ? result.error.code : "INTERNAL";
      throw error;
    }
    return result.result;
  }

  const $ = (id) => document.getElementById(id);
  const loginChip = $("login-chip");
  const loginHelp = $("login-help");
  const folderPath = $("folder-path");
  const btnDefaultFolder = $("btn-default-folder");
  const searchForm = $("search-form");
  const searchInput = $("search-input");
  const btnSearch = $("btn-search");
  const quality = $("quality");
  const resultsSection = $("results-section");
  const resultsEl = $("results");
  const resultsSummary = $("results-summary");
  const btnPrev = $("btn-prev");
  const btnNext = $("btn-next");
  const historyEl = $("history");
  const historyEmpty = $("history-empty");
  const toastEl = $("toast");

  let status = null;
  let query = "";
  let offset = 0;
  let total = null;
  /** 歌曲 id → 下载状态 { state: "running" | "done" | "existed" | "failed", progress, file, message } */
  const jobs = new Map();

  let toastTimer = null;
  function toast(text, isError = false) {
    toastEl.textContent = text;
    toastEl.classList.toggle("error", isError);
    toastEl.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add("hidden"), isError ? 6000 : 3000);
  }

  function applyLanguage() {
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
    for (const el of document.querySelectorAll("[data-i18n]")) {
      const value = t(el.dataset.i18n);
      if (typeof value === "string") el.textContent = value;
    }
    for (const el of document.querySelectorAll("[data-i18n-placeholder]")) el.placeholder = t(el.dataset.i18nPlaceholder);
    document.title = t("appTitle");
  }

  function formatDuration(ms) {
    if (typeof ms !== "number") return "";
    const seconds = Math.round(ms / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function levelName(level) {
    return t("levels")[level] ?? level;
  }

  /** 用户选的音质和这首歌的上限取小的；「最高」= 不传，后端按账号上限 */
  function levelFor(song) {
    if (quality.value === "max") return undefined;
    return LEVELS.indexOf(quality.value) > LEVELS.indexOf(song.maxLevel) ? song.maxLevel : quality.value;
  }

  // ---- 状态与下载文件夹 ----

  async function loadStatus() {
    status = await callOrThrow("netease.getStatus", {});
    loginChip.textContent = status.loggedIn ? t("loggedIn") : t("notLoggedIn");
    loginChip.classList.toggle("ok", status.loggedIn);
    loginChip.classList.toggle("bad", !status.loggedIn);
    loginChip.title = status.message;
    loginHelp.textContent = status.message;
    loginHelp.classList.toggle("hidden", status.loggedIn);
    btnSearch.disabled = !status.loggedIn;
    folderPath.textContent = status.downloadDir;
    folderPath.title = status.downloadDir;
    btnDefaultFolder.classList.toggle("hidden", status.downloadDirIsDefault);
  }

  $("btn-change-folder").addEventListener("click", async () => {
    if (typeof bridge.pickFolder !== "function") {
      toast(t("pickerUnavailable"), true);
      return;
    }
    const dir = await bridge.pickFolder();
    if (!dir) return;
    try {
      await callOrThrow("netease.setDownloadDir", { dir });
      await loadStatus();
    } catch (error) {
      toast(t("failed") + error.message, true);
    }
  });

  btnDefaultFolder.addEventListener("click", async () => {
    await callOrThrow("netease.setDownloadDir", { dir: null });
    await loadStatus();
  });

  $("btn-reveal-folder").addEventListener("click", () => {
    if (status && typeof bridge.revealPath === "function") void bridge.revealPath(status.downloadDir);
  });

  // ---- 搜索 ----

  let lastResults = [];

  async function runSearch() {
    if (!query) return;
    btnSearch.disabled = true;
    try {
      const result = await callOrThrow("netease.search", { query, limit: PAGE, offset });
      total = result.total;
      lastResults = result.songs;
      renderResults();
    } catch (error) {
      toast(t("failed") + error.message, true);
    } finally {
      btnSearch.disabled = !(status && status.loggedIn);
    }
  }

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    query = searchInput.value.trim();
    offset = 0;
    void runSearch();
  });
  btnPrev.addEventListener("click", () => {
    offset = Math.max(0, offset - PAGE);
    void runSearch();
  });
  btnNext.addEventListener("click", () => {
    offset += PAGE;
    void runSearch();
  });

  function renderResults() {
    resultsSection.classList.remove("hidden");
    resultsEl.innerHTML = "";
    if (lastResults.length === 0) {
      resultsSummary.textContent = t("noResults");
    } else {
      resultsSummary.textContent = t("resultsSummary")(total, offset + 1, offset + lastResults.length);
    }
    btnPrev.disabled = offset === 0;
    btnNext.disabled = total === null ? lastResults.length < PAGE : offset + lastResults.length >= total;
    for (const song of lastResults) resultsEl.appendChild(renderRow(song));
  }

  function renderRow(song) {
    const tr = document.createElement("tr");
    tr.dataset.songId = song.id;
    const cell = (text, className) => {
      const td = document.createElement("td");
      td.textContent = text;
      if (className) td.className = className;
      tr.appendChild(td);
      return td;
    };
    const name = cell(song.name, "name");
    if (song.fee === 1 || song.fee === 8) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = t("vip");
      name.appendChild(badge);
    }
    cell(song.artists.join(" / "), "muted");
    cell(song.album, "muted");
    cell(formatDuration(song.durationMs), "muted num");
    cell(song.maxLevel ? levelName(song.maxLevel) : t("cannotDownload"), song.maxLevel ? "" : "muted");
    const action = cell("", "action");
    renderAction(action, song);
    return tr;
  }

  function renderAction(td, song) {
    td.innerHTML = "";
    const job = jobs.get(song.id);
    if (job && job.state === "running") {
      const bar = document.createElement("div");
      bar.className = "progress";
      const fill = document.createElement("div");
      fill.style.width = `${Math.round(job.progress * 100)}%`;
      bar.appendChild(fill);
      td.appendChild(bar);
      return;
    }
    if (job && (job.state === "done" || job.state === "existed")) {
      const label = document.createElement("span");
      label.className = "muted";
      label.textContent = job.state === "existed" ? t("existed") : t("downloaded");
      td.appendChild(label);
      td.appendChild(revealButton(job.file));
      if (job.note) {
        const note = document.createElement("div");
        note.className = "note";
        note.textContent = job.note;
        td.appendChild(note);
      }
      return;
    }
    const button = document.createElement("button");
    button.textContent = t("download");
    button.disabled = !song.maxLevel || !(status && status.loggedIn);
    button.addEventListener("click", () => void download(song));
    td.appendChild(button);
    if (job && job.state === "failed") {
      const error = document.createElement("div");
      error.className = "error-text";
      error.textContent = job.message;
      td.appendChild(error);
    }
  }

  function refreshRow(songId) {
    const tr = resultsEl.querySelector(`tr[data-song-id="${songId}"]`);
    const song = lastResults.find((item) => item.id === songId);
    if (tr && song) renderAction(tr.querySelector("td.action"), song);
  }

  function revealButton(file) {
    const button = document.createElement("button");
    button.className = "link";
    button.textContent = t("reveal");
    button.addEventListener("click", () => {
      if (typeof bridge.revealPath === "function") void bridge.revealPath(file);
    });
    return button;
  }

  // ---- 下载 ----

  async function download(song) {
    const runId = bridge.newRunId();
    jobs.set(song.id, { state: "running", progress: 0 });
    refreshRow(song.id);
    const off = bridge.onEvent(runId, (event) => {
      if (!event || event.type !== "progress") return;
      const job = jobs.get(song.id);
      if (job && job.state === "running") {
        job.progress = event.progress ?? 0;
        job.lastMessage = event.message ?? "";
        refreshRow(song.id);
      }
    });
    try {
      const result = await callOrThrow("netease.download", { songId: song.id, level: levelFor(song) }, { runId });
      // 最后一条进度里括号中的说明（例如「歌词没拿到」）显示在「已下载」下面
      const last = (jobs.get(song.id) || {}).lastMessage || "";
      const note = (last.match(/（(.+)）/) || [])[1] || "";
      jobs.set(song.id, { state: result.alreadyExisted ? "existed" : "done", file: result.file, note });
      await loadHistory();
    } catch (error) {
      jobs.set(song.id, { state: "failed", message: error.message });
      toast(t("failed") + error.message, true);
    } finally {
      off();
      refreshRow(song.id);
    }
  }

  // ---- 最近下载 ----

  async function loadHistory() {
    const items = await callOrThrow("netease.listHistory", {});
    historyEl.innerHTML = "";
    historyEmpty.classList.toggle("hidden", items.length > 0);
    for (const item of items.slice(0, 30)) {
      const li = document.createElement("li");
      const title = document.createElement("span");
      title.textContent = `${item.artists.join(" / ")} - ${item.name}`;
      const meta = document.createElement("span");
      meta.className = "muted";
      meta.textContent = `${levelName(item.level)} · ${new Date(item.createdAt).toLocaleString()}`;
      li.append(title, meta, revealButton(item.file));
      historyEl.appendChild(li);
    }
  }

  // ---- 启动 ----

  (async () => {
    let value = null;
    try {
      const setting = await bridge.call("platform.settings.get", { key: "ui.language" });
      value = setting && setting.ok ? setting.result.value : null;
    } catch {
      /* 读不到就按系统语言 */
    }
    lang = value === "zh" || value === "en" ? value : navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
    applyLanguage();
    try {
      await loadStatus();
      await loadHistory();
    } catch (error) {
      toast(t("failed") + error.message, true);
    }
  })();
})();
