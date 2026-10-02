/* 学英语 v0：复习 / 词库 / 添加 / 统计 */
(() => {
  const bridge = window.outside;
  if (!bridge) {
    document.body.innerHTML = "<p style='padding:24px'>请通过 MyOutside 打开此页面。</p>";
    return;
  }

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
      progress.textContent = empty ? "太棒了，没有待复习的卡片。" : `本次复习完成：${reviewDone} 张。`;
      reveal.classList.add("hidden");
      return;
    }

    const card = reviewQueue[reviewIndex];
    progress.textContent = `待复习 ${reviewIndex + 1} / ${reviewQueue.length}`;
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
      box.innerHTML = '<div class="empty" style="padding:12px;color:#6b7280">没有卡片</div>';
      return;
    }
    for (const card of list) {
      const row = document.createElement("div");
      row.className = "card-row";
      row.innerHTML =
        `<div class="row-main"><span class="display">${escapeHtml(card.display)}</span>` +
        `<span class="badge ${card.status}">${card.status === "mastered" ? "已掌握" : "学习中"}</span></div>` +
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
      `<label>本质意项 <input data-field="sense" value="${escapeHtml(card.sense)}" /></label>` +
      `<label>释义 <textarea data-field="meaning" rows="2">${escapeHtml(card.meaning ?? "")}</textarea></label>` +
      `<label>音标 <input data-field="phonetic" value="${escapeHtml(card.phonetic ?? "")}" /></label>` +
      `<label>例句 / 语境 <textarea data-field="context" rows="2">${escapeHtml(card.context ?? "")}</textarea></label>` +
      `<div class="form-actions">` +
      `<button class="primary" data-action="save">保存</button>` +
      `<button class="plain" data-action="master">${card.status === "mastered" ? "取消掌握" : "标记已掌握"}</button>` +
      `<button class="plain" data-action="close">收起</button>` +
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
          toast("已保存");
          await loadBrowse();
        } catch (error) {
          toast(error.message, true);
        }
      }
      if (action === "master") {
        try {
          const mastered = card.status !== "mastered";
          await call("vocab.setMastered", { cardId: card.id, mastered });
          toast(mastered ? "已标记掌握" : "已恢复学习");
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
        toast("已创建卡片");
        form.reset();
        resultBox.classList.add("hidden");
        return;
      }

      const notice = document.createElement("div");
      notice.className = "notice";
      notice.textContent = `该拼写已有 ${existing.length} 张卡片：`;
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
        replace.textContent = "替换这张";
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
            toast("已替换");
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
      addAnyway.textContent = "仍新增（不同意项）";
      addAnyway.addEventListener("click", async () => {
        try {
          await call("vocab.addCard", values);
          toast("已新增");
          form.reset();
          resultBox.classList.add("hidden");
        } catch (error) {
          toast(error.message, true);
        }
      });
      const abandon = document.createElement("button");
      abandon.className = "plain";
      abandon.textContent = "放弃";
      abandon.addEventListener("click", () => {
        toast("已放弃");
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
      ["cards", "卡片总数"],
      ["learning", "学习中"],
      ["mastered", "已掌握"],
      ["dueNow", "待复习"],
    ];
    box.innerHTML = items
      .map(
        ([key, label]) =>
          `<div class="stat"><div class="num">${stats[key] ?? 0}</div><div class="label">${label}</div></div>`,
      )
      .join("");
  }

  // 初始：加载复习
  loadReview().catch((error) => toast(error.message, true));
})();
