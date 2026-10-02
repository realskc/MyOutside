/* 学英语 v0：复习 / 词库 / 添加 / 统计（中英文） */
(() => {
  const bridge = window.outside;
  if (!bridge) {
    document.body.innerHTML = "<p style='padding:24px'>Please open this page inside MyOutside.</p>";
    return;
  }

  const DICT = {
    zh: {
      appTitle: "学英语",
      tabReview: "复习",
      tabBrowse: "词库",
      tabAdd: "添加",
      tabStats: "统计",
      reviewEmpty: "太棒了，没有待复习的卡片。",
      reviewDone: (n) => `本次复习完成：${n} 张。`,
      reviewDue: (i, total) => `待复习 ${i} / ${total}`,
      showAnswer: "显示答案",
      again: "重来",
      good: "不错",
      easy: "简单",
      searchPlaceholder: "搜索拼写…",
      refresh: "刷新",
      noCards: "没有卡片",
      mastered: "已掌握",
      learning: "学习中",
      fTerm: "单词",
      fSense: "本质意项",
      fMeaning: "释义",
      fPhonetic: "音标",
      fContext: "例句 / 语境",
      sensePlaceholder: "例：椰枣（食物）",
      add: "添加",
      toastCreated: "已创建卡片",
      toastReplaced: "已替换",
      toastAdded: "已新增",
      toastAbandoned: "已放弃",
      toastSaved: "已保存",
      toastMastered: "已标记掌握",
      toastUnmastered: "已恢复学习",
      existingNotice: (n) => `该拼写已有 ${n} 张卡片：`,
      replaceThis: "替换这张",
      addAnyway: "仍新增（不同意项）",
      abandon: "放弃",
      eSense: "本质意项",
      eMeaning: "释义",
      ePhonetic: "音标",
      eContext: "例句 / 语境",
      save: "保存",
      markMastered: "标记已掌握",
      unmarkMastered: "取消掌握",
      collapse: "收起",
      statCards: "卡片总数",
      statLearning: "学习中",
      statMastered: "已掌握",
      statDue: "待复习",
    },
    en: {
      appTitle: "Vocabulary",
      tabReview: "Review",
      tabBrowse: "Cards",
      tabAdd: "Add",
      tabStats: "Stats",
      reviewEmpty: "All clear — no cards due.",
      reviewDone: (n) => `Review finished: ${n} card(s).`,
      reviewDue: (i, total) => `Due ${i} / ${total}`,
      showAnswer: "Show answer",
      again: "Again",
      good: "Good",
      easy: "Easy",
      searchPlaceholder: "Search spelling…",
      refresh: "Refresh",
      noCards: "No cards",
      mastered: "Mastered",
      learning: "Learning",
      fTerm: "Word",
      fSense: "Essential sense",
      fMeaning: "Meaning",
      fPhonetic: "Phonetic",
      fContext: "Context",
      sensePlaceholder: "e.g. date fruit (food)",
      add: "Add",
      toastCreated: "Card created",
      toastReplaced: "Replaced",
      toastAdded: "Added",
      toastAbandoned: "Discarded",
      toastSaved: "Saved",
      toastMastered: "Marked as mastered",
      toastUnmastered: "Back to learning",
      existingNotice: (n) => `${n} card(s) already exist for this spelling:`,
      replaceThis: "Replace this",
      addAnyway: "Add anyway (different sense)",
      abandon: "Discard",
      eSense: "Essential sense",
      eMeaning: "Meaning",
      ePhonetic: "Phonetic",
      eContext: "Context",
      save: "Save",
      markMastered: "Mark mastered",
      unmarkMastered: "Unmark mastered",
      collapse: "Collapse",
      statCards: "Cards",
      statLearning: "Learning",
      statMastered: "Mastered",
      statDue: "Due",
    },
  };

  let lang = "zh";
  const t = (key, ...args) => {
    const value = DICT[lang][key] ?? DICT.zh[key] ?? key;
    return typeof value === "function" ? value(...args) : value;
  };

  async function call(name, payload) {
    const res = await bridge.call(name, payload);
    if (!res.ok) {
      const error = new Error(res.error.message);
      error.code = res.error.code;
      throw error;
    }
    return res.result;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => {
      if (ch === "&") return "&amp;";
      if (ch === "<") return "&lt;";
      if (ch === ">") return "&gt;";
      if (ch === '"') return "&quot;";
      return "&#39;";
    });
  }

  async function initLanguage() {
    let value = null;
    try {
      const res = await bridge.call("platform.settings.get", { key: "ui.language" });
      value = res.ok ? res.result.value : null;
    } catch {
      /* ignore */
    }
    lang = value === "zh" || value === "en" ? value : navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = t("appTitle");
    for (const el of document.querySelectorAll("[data-i18n]")) {
      el.textContent = t(el.dataset.i18n);
    }
    for (const el of document.querySelectorAll("[data-i18n-placeholder]")) {
      const key = el.dataset.i18nPlaceholder;
      if (typeof DICT[lang][key] === "string") el.placeholder = t(key);
    }
  }

  let toastTimer = null;
  function toast(message, isError = false) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.classList.toggle("error", isError);
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2200);
  }

  // ---- 标签切换 ----
  const loaders = { review: loadReview, browse: loadBrowse, add: () => {}, stats: loadStats };
  function switchTab(name) {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
    document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
    const loader = loaders[name];
    if (loader) {
      Promise.resolve(loader()).catch((error) => toast(error.message, true));
    }
  }
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  // ---- 复习 ----
  let reviewQueue = [];
  let reviewIndex = 0;
  let reviewDone = 0;

  async function loadReview() {
    reviewQueue = await call("vocab.getDue", { limit: 50 });
    reviewIndex = 0;
    reviewDone = 0;
    renderReview();
  }

  function renderReview() {
    const progress = document.getElementById("review-progress");
    const front = document.getElementById("review-front");
    const back = document.getElementById("review-back");
    const reveal = document.getElementById("btn-reveal");
    const ratings = document.getElementById("review-ratings");
    back.classList.add("hidden");
    ratings.classList.add("hidden");
    reveal.classList.remove("hidden");
    front.classList.remove("big");

    if (reviewIndex >= reviewQueue.length) {
      front.classList.add("big");
      const empty = reviewQueue.length === 0;
      front.textContent = empty ? "🎉" : "✅";
      progress.textContent = empty ? t("reviewEmpty") : t("reviewDone", reviewDone);
      reveal.classList.add("hidden");
      return;
    }

    const card = reviewQueue[reviewIndex];
    progress.textContent = t("reviewDue", reviewIndex + 1, reviewQueue.length);
    front.textContent = card.display;
    back.innerHTML =
      `<div class="phonetic">${escapeHtml(card.phonetic ?? "")}</div>` +
      `<div class="sense">${escapeHtml(card.sense)}</div>` +
      `<div class="meaning">${escapeHtml(card.meaning ?? "")}</div>` +
      (card.context ? `<div class="context">${escapeHtml(card.context)}</div>` : "");
  }

  document.getElementById("btn-reveal").addEventListener("click", () => {
    document.getElementById("review-back").classList.remove("hidden");
    document.getElementById("btn-reveal").classList.add("hidden");
    document.getElementById("review-ratings").classList.remove("hidden");
  });

  document.querySelectorAll("[data-rating]").forEach((button) => {
    button.addEventListener("click", async () => {
      const card = reviewQueue[reviewIndex];
      try {
        await call("vocab.submitReview", { cardId: card.id, rating: button.dataset.rating });
        reviewDone += 1;
      } catch (error) {
        toast(error.message, true);
      }
      reviewIndex += 1;
      renderReview();
    });
  });

  // ---- 词库 ----
  async function loadBrowse() {
    const query = document.getElementById("browse-query").value.trim();
    const list = await call("vocab.listCards", query ? { query } : {});
    const box = document.getElementById("browse-list");
    box.innerHTML = "";
    if (list.length === 0) {
      box.innerHTML = `<div class="empty" style="padding:12px;color:#6b7280">${t("noCards")}</div>`;
      return;
    }
    for (const card of list) {
      const row = document.createElement("div");
      row.className = "card-row";
      row.innerHTML =
        `<div class="row-main"><span class="display">${escapeHtml(card.display)}</span>` +
        `<span class="badge ${card.status}">${card.status === "mastered" ? t("mastered") : t("learning")}</span></div>` +
        `<div class="row-sub">${escapeHtml(card.sense)}${card.meaning ? " · " + escapeHtml(card.meaning) : ""}</div>`;
      row.addEventListener("click", () => openEditor(row, card));
      box.appendChild(row);
    }
  }

  let editorEl = null;
  function closeEditor() {
    if (editorEl) {
      editorEl.remove();
      editorEl = null;
    }
  }

  function openEditor(row, card) {
    const isSame = editorEl && editorEl.dataset.cardId === card.id;
    closeEditor();
    if (isSame) return;

    const editor = document.createElement("div");
    editor.className = "card-editor";
    editor.dataset.cardId = card.id;
    editor.innerHTML =
      `<label>${t("eSense")} <input data-field="sense" value="${escapeHtml(card.sense)}" /></label>` +
      `<label>${t("eMeaning")} <textarea data-field="meaning" rows="2">${escapeHtml(card.meaning ?? "")}</textarea></label>` +
      `<label>${t("ePhonetic")} <input data-field="phonetic" value="${escapeHtml(card.phonetic ?? "")}" /></label>` +
      `<label>${t("eContext")} <textarea data-field="context" rows="2">${escapeHtml(card.context ?? "")}</textarea></label>` +
      `<div class="form-actions">` +
      `<button class="primary" data-action="save">${t("save")}</button>` +
      `<button class="plain" data-action="master">${card.status === "mastered" ? t("unmarkMastered") : t("markMastered")}</button>` +
      `<button class="plain" data-action="close">${t("collapse")}</button>` +
      `</div>`;

    editor.addEventListener("click", async (event) => {
      const action = event.target && event.target.dataset ? event.target.dataset.action : undefined;
      if (!action) return;
      if (action === "close") {
        closeEditor();
        return;
      }
      if (action === "save") {
        const value = (field) => editor.querySelector(`[data-field="${field}"]`).value;
        try {
          await call("vocab.updateCard", {
            cardId: card.id,
            patch: {
              sense: value("sense"),
              meaning: value("meaning"),
              phonetic: value("phonetic"),
              context: value("context"),
            },
          });
          toast(t("toastSaved"));
          await loadBrowse();
        } catch (error) {
          toast(error.message, true);
        }
      }
      if (action === "master") {
        try {
          const mastered = card.status !== "mastered";
          await call("vocab.setMastered", { cardId: card.id, mastered });
          toast(mastered ? t("toastMastered") : t("toastUnmastered"));
          await loadBrowse();
        } catch (error) {
          toast(error.message, true);
        }
      }
    });

    row.after(editor);
    editorEl = editor;
  }

  document.getElementById("browse-refresh").addEventListener("click", () => {
    loadBrowse().catch((error) => toast(error.message, true));
  });
  document.getElementById("browse-query").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadBrowse().catch((error) => toast(error.message, true));
    }
  });

  // ---- 添加 ----
  document.getElementById("add-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const values = {
      term: form.term.value.trim(),
      sense: form.sense.value.trim(),
      meaning: form.meaning.value,
      phonetic: form.phonetic.value,
      context: form.context.value,
    };
    const resultBox = document.getElementById("add-result");
    try {
      const existing = await call("vocab.listCards", { term: values.term });
      resultBox.innerHTML = "";
      resultBox.classList.remove("hidden");

      if (existing.length === 0) {
        await call("vocab.addCard", values);
        toast(t("toastCreated"));
        form.reset();
        resultBox.classList.add("hidden");
        return;
      }

      const notice = document.createElement("div");
      notice.className = "notice";
      notice.textContent = t("existingNotice", existing.length);
      resultBox.appendChild(notice);

      for (const card of existing) {
        const item = document.createElement("div");
        item.className = "existing-card";
        item.innerHTML =
          `<div><b>${escapeHtml(card.display)}</b> · ${escapeHtml(card.sense)}<br/>` +
          `<small>${escapeHtml(card.meaning ?? "")}</small></div>`;
        const actions = document.createElement("div");
        actions.className = "existing-actions";
        const replace = document.createElement("button");
        replace.className = "primary";
        replace.textContent = t("replaceThis");
        replace.addEventListener("click", async () => {
          try {
            await call("vocab.updateCard", {
              cardId: card.id,
              patch: {
                sense: values.sense,
                meaning: values.meaning,
                phonetic: values.phonetic,
                context: values.context,
              },
            });
            toast(t("toastReplaced"));
            form.reset();
            resultBox.classList.add("hidden");
          } catch (error) {
            toast(error.message, true);
          }
        });
        actions.appendChild(replace);
        item.appendChild(actions);
        resultBox.appendChild(item);
      }

      const footer = document.createElement("div");
      footer.className = "existing-actions";
      const addAnyway = document.createElement("button");
      addAnyway.className = "plain";
      addAnyway.textContent = t("addAnyway");
      addAnyway.addEventListener("click", async () => {
        try {
          await call("vocab.addCard", values);
          toast(t("toastAdded"));
          form.reset();
          resultBox.classList.add("hidden");
        } catch (error) {
          toast(error.message, true);
        }
      });
      const abandon = document.createElement("button");
      abandon.className = "plain";
      abandon.textContent = t("abandon");
      abandon.addEventListener("click", () => {
        toast(t("toastAbandoned"));
        resultBox.classList.add("hidden");
      });
      footer.appendChild(addAnyway);
      footer.appendChild(abandon);
      resultBox.appendChild(footer);
    } catch (error) {
      toast(error.message, true);
    }
  });

  // ---- 统计 ----
  async function loadStats() {
    const stats = await call("vocab.getStats", {});
    const box = document.getElementById("stats-box");
    const items = [
      ["cards", t("statCards")],
      ["learning", t("statLearning")],
      ["mastered", t("statMastered")],
      ["dueNow", t("statDue")],
    ];
    box.innerHTML = items
      .map(
        ([key, label]) =>
          `<div class="stat"><div class="num">${stats[key] ?? 0}</div><div class="label">${label}</div></div>`,
      )
      .join("");
  }

  // 启动：先确定语言，再加载复习
  initLanguage()
    .then(() => loadReview())
    .catch((error) => toast(error.message, true));
})();
