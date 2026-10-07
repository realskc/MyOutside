/* 学英语 v0：复习 / 查词 / 词库 / 添加 / 统计（中英文） */
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
      tabLookup: "查词",
      tabBrowse: "词库",
      tabAdd: "添加",
      tabStats: "统计",
      reviewEmpty: "太棒了，没有待复习的卡片。",
      reviewDone: (n) => `本次复习完成：${n} 张。`,
      reviewDue: (remaining, total) => `还剩 ${remaining} / ${total} 张`,
      showAnswer: "显示答案",
      again: "重来",
      good: "不错",
      easy: "简单",
      intervalNow: "不到 1 分钟",
      intervalMinutes: (n) => `${n} 分钟`,
      intervalHours: (n) => `${n} 小时`,
      intervalDays: (n) => `${n} 天`,
      intervalMonths: (n) => `${n} 个月`,
      intervalYears: (n) => `${n} 年`,
      fullyLearned: "完全学会",
      masteredHint: "移出复习",
      toastFullyLearned: "已标记为完全学会",
      lookupPlaceholder: "输入单词或短语…",
      lookupRun: "查询",
      lookupSearching: "查询中…",
      lookupFailed: "查询失败",
      lookupNeedKey: "请先在「设置」里配置 DeepSeek API Key。",
      addToVocab: "加入词库",
      ignore: "忽略",
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
      aiMatchNotice: "AI 判断为同一本质意项：",
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
      tabLookup: "Lookup",
      tabBrowse: "Cards",
      tabAdd: "Add",
      tabStats: "Stats",
      reviewEmpty: "All clear — no cards due.",
      reviewDone: (n) => `Review finished: ${n} card(s).`,
      reviewDue: (remaining, total) => `${remaining} / ${total} remaining`,
      showAnswer: "Show answer",
      again: "Again",
      good: "Good",
      easy: "Easy",
      intervalNow: "<1 min",
      intervalMinutes: (n) => `${n} min`,
      intervalHours: (n) => `${n} hr`,
      intervalDays: (n) => `${n} d`,
      intervalMonths: (n) => `${n} mo`,
      intervalYears: (n) => `${n} y`,
      fullyLearned: "Mastered",
      masteredHint: "removed",
      toastFullyLearned: "Marked as fully learned",
      lookupPlaceholder: "Type a word or phrase…",
      lookupRun: "Look up",
      lookupSearching: "Looking up…",
      lookupFailed: "Lookup failed",
      lookupNeedKey: "Configure the DeepSeek API key in Settings first.",
      addToVocab: "Add to vocabulary",
      ignore: "Ignore",
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
      aiMatchNotice: "AI found an existing card with the same essential sense:",
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
  const loaders = { review: loadReview, lookup: () => {}, browse: loadBrowse, add: () => {}, stats: loadStats };
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

  const INTERVAL_KEYS = ["again", "good", "easy", "mastered"];

  function setIntervalLabels(values) {
    for (const key of INTERVAL_KEYS) {
      const el = document.querySelector(`[data-interval="${key}"]`);
      if (el) el.textContent = values ? String(values[key] ?? "") : "";
    }
  }

  function formatInterval(dueMs, nowMs) {
    const diff = Math.max(0, dueMs - nowMs);
    const minutes = Math.round(diff / 60000);
    if (minutes < 1) return t("intervalNow");
    if (minutes < 60) return t("intervalMinutes", minutes);
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t("intervalHours", hours);
    const days = Math.round(diff / 86400000);
    if (days < 30) return t("intervalDays", days);
    const months = Math.round(days / 30);
    if (months < 12) return t("intervalMonths", months);
    return t("intervalYears", Math.round(months / 12));
  }

  async function loadPreview(cardId) {
    setIntervalLabels({ again: "…", good: "…", easy: "…", mastered: t("masteredHint") });
    try {
      const preview = await call("vocab.previewReview", { cardId });
      const current = reviewQueue[reviewIndex];
      if (!current || current.id !== cardId) return; // 卡片已切换，丢弃过期结果
      const now = Date.now();
      setIntervalLabels({
        again: formatInterval(preview.again.due, now),
        good: formatInterval(preview.good.due, now),
        easy: formatInterval(preview.easy.due, now),
        mastered: t("masteredHint"),
      });
    } catch {
      setIntervalLabels(null);
    }
  }

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
      setIntervalLabels(null);
      return;
    }

    const card = reviewQueue[reviewIndex];
    progress.textContent = t("reviewDue", reviewQueue.length - reviewIndex, reviewQueue.length);
    front.textContent = card.display;
    void loadPreview(card.id);
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

  document.getElementById("btn-mastered").addEventListener("click", async () => {
    const card = reviewQueue[reviewIndex];
    try {
      await call("vocab.setMastered", { cardId: card.id, mastered: true });
      toast(t("toastFullyLearned"));
      reviewDone += 1;
    } catch (error) {
      toast(error.message, true);
    }
    reviewIndex += 1;
    renderReview();
  });

  // ---- 添加（两步：解析 → 提交；AI 不可用时回退机械流程）----

  async function runAddFlow(values, container, onFinished) {
    const finish = () => {
      if (onFinished) onFinished();
    };
    container.innerHTML = "";
    container.classList.remove("hidden");
    try {
      let resolved = null;
      try {
        resolved = await call("vocab.resolveCard", {
          term: values.term,
          sense: values.sense,
          meaning: values.meaning,
        });
      } catch {
        resolved = null; // AI 不可用 → 回退机械检查
      }

      if (resolved && resolved.action === "new") {
        await call("vocab.addCard", values);
        toast(t("toastCreated"));
        finish();
        return;
      }

      if (resolved && resolved.action === "match") {
        const cards = await call("vocab.listCards", { term: values.term });
        const matched = cards.filter((card) => card.id === resolved.cardId);
        renderChoices(container, matched, values, true, finish);
        return;
      }

      const existing = await call("vocab.listCards", { term: values.term });
      if (existing.length === 0) {
        await call("vocab.addCard", values);
        toast(t("toastCreated"));
        finish();
        return;
      }
      renderChoices(container, existing, values, false, finish);
    } catch (error) {
      toast(error.message, true);
    }
  }

  function renderChoices(container, cards, values, aiMatched, finish) {
    container.innerHTML = "";
    const notice = document.createElement("div");
    notice.className = "notice";
    notice.textContent = aiMatched ? t("aiMatchNotice") : t("existingNotice", cards.length);
    container.appendChild(notice);

    for (const card of cards) {
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
          finish();
        } catch (error) {
          toast(error.message, true);
        }
      });
      actions.appendChild(replace);
      item.appendChild(actions);
      container.appendChild(item);
    }

    const footer = document.createElement("div");
    footer.className = "existing-actions";
    if (!aiMatched) {
      const addAnyway = document.createElement("button");
      addAnyway.className = "plain";
      addAnyway.textContent = t("addAnyway");
      addAnyway.addEventListener("click", async () => {
        try {
          await call("vocab.addCard", values);
          toast(t("toastAdded"));
          finish();
        } catch (error) {
          toast(error.message, true);
        }
      });
      footer.appendChild(addAnyway);
    }
    const abandon = document.createElement("button");
    abandon.className = "plain";
    abandon.textContent = t("abandon");
    abandon.addEventListener("click", () => {
      toast(t("toastAbandoned"));
      finish();
    });
    footer.appendChild(abandon);
    container.appendChild(footer);
  }

  document.getElementById("add-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const values = {
      term: form.term.value.trim(),
      sense: form.sense.value.trim(),
      meaning: form.meaning.value,
      phonetic: form.phonetic.value,
      context: form.context.value,
      source: "manual",
    };
    await runAddFlow(values, document.getElementById("add-result"), () => {
      form.reset();
      document.getElementById("add-result").classList.add("hidden");
    });
  });

  // ---- 查词 ----

  const CARD_TOOL = {
    type: "function",
    function: {
      name: "make_card",
      description: "生成一张学习卡片草稿（单词 + 本质意项 + 音标 + 释义 + 例句）",
      parameters: {
        type: "object",
        properties: {
          term: { type: "string", description: "单词原形（小写）" },
          sense: { type: "string", description: "本质意项的简短描述（一律用中文）" },
          phonetic: { type: "string", description: "IPA 音标，含斜杠，如 /rʌn/" },
          meaning: { type: "string", description: "释义与解说（一律用中文）" },
          example: { type: "string", description: "一个英文例句" },
        },
        required: ["term", "sense", "meaning"],
      },
    },
  };

  const lookupSystemPrompt = () =>
    "你是英语学习助手。用户给你一个英语单词或短语：先用中文给出翻译与简明解说（可含常见搭配），然后必须调用 make_card 工具生成一张学习卡片草稿——卡片内容一律使用中文（例句除外）。若该词有多种本质不同的意项，只针对最常见的一种生成，并在解说里简要提及其它意项。";

  async function runLookup() {
    const input = document.getElementById("lookup-term");
    const term = input.value.trim();
    if (!term) return;
    const status = document.getElementById("lookup-status");
    const result = document.getElementById("lookup-result");
    const textEl = document.getElementById("lookup-text");
    const draftEl = document.getElementById("lookup-draft");

    status.textContent = t("lookupSearching");
    status.classList.remove("error");
    result.classList.add("hidden");
    draftEl.classList.add("hidden");
    draftEl.innerHTML = "";
    textEl.textContent = "";

    try {
      const response = await call("platform.ai.chat", {
        messages: [
          { role: "system", content: lookupSystemPrompt() },
          { role: "user", content: term },
        ],
        tools: [CARD_TOOL],
        temperature: 0.3,
      });
      status.textContent = "";
      textEl.textContent = response.content || "";
      result.classList.remove("hidden");

      const cardCall = (response.toolCalls || []).find((item) => item.function.name === "make_card");
      if (cardCall) {
        let draft = null;
        try {
          draft = JSON.parse(cardCall.function.arguments);
        } catch {
          draft = null;
        }
        if (draft && draft.term && draft.sense) {
          renderDraft(draftEl, draft);
        }
      }
    } catch (error) {
      status.textContent =
        error.code === "PRECONDITION" ? t("lookupNeedKey") : `${t("lookupFailed")}：${error.message}`;
      status.classList.add("error");
    }
  }

  function renderDraft(container, draft) {
    container.classList.remove("hidden");
    container.innerHTML = "";

    const card = document.createElement("div");
    card.className = "draft-card";
    card.innerHTML =
      `<div class="draft-term">${escapeHtml(draft.term)}` +
      `<span class="phonetic">${escapeHtml(draft.phonetic ?? "")}</span></div>` +
      `<div class="draft-sense">${escapeHtml(draft.sense)}</div>` +
      `<div class="draft-meaning">${escapeHtml(draft.meaning)}</div>` +
      (draft.example ? `<div class="context">${escapeHtml(draft.example)}</div>` : "");
    container.appendChild(card);

    const actions = document.createElement("div");
    actions.className = "draft-actions";
    const addButton = document.createElement("button");
    addButton.className = "primary";
    addButton.textContent = t("addToVocab");
    const ignoreButton = document.createElement("button");
    ignoreButton.className = "plain";
    ignoreButton.textContent = t("ignore");

    const choices = document.createElement("div");
    choices.className = "add-result hidden";

    addButton.addEventListener("click", async () => {
      addButton.disabled = true;
      const values = {
        term: String(draft.term),
        sense: String(draft.sense),
        meaning: draft.meaning ? String(draft.meaning) : "",
        phonetic: draft.phonetic ? String(draft.phonetic) : "",
        context: draft.example ? String(draft.example) : "",
        source: "lookup",
      };
      await runAddFlow(values, choices, () => {
        addButton.disabled = true;
        choices.classList.add("hidden");
      });
    });
    ignoreButton.addEventListener("click", () => {
      container.classList.add("hidden");
    });

    actions.appendChild(addButton);
    actions.appendChild(ignoreButton);
    container.appendChild(actions);
    container.appendChild(choices);
  }

  document.getElementById("lookup-run").addEventListener("click", () => {
    runLookup().catch((error) => toast(error.message, true));
  });
  document.getElementById("lookup-term").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runLookup().catch((error) => toast(error.message, true));
    }
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
