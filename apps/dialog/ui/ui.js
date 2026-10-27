/* 对话：多会话 + 树形历史分叉 + 联网搜索 + 流式输出 + Markdown / LaTeX（中英文）
   生成在后端（dialog.send / generate / editAndSend），前端只负责发起、显示进度与结果（DIALOG-0016）。 */
(() => {
  const bridge = window.outside;
  if (!bridge) {
    document.body.innerHTML = "<p style='padding:24px'>Please open this page inside MyOutside.</p>";
    return;
  }

  const DICT = {
    zh: {
      appTitle: "对话",
      newChat: "新建对话",
      emptyHint: "点「新建对话」开始，或从左侧选择已有会话。",
      startHint: "输入消息开始对话。",
      inputPlaceholder: "输入消息…（Enter 发送，Shift+Enter 换行）",
      send: "发送",
      stop: "停止",
      generating: "生成中…",
      thinkingLabel: "思考",
      effortNone: "关",
      effortLow: "低",
      effortHigh: "高",
      effortMax: "最高",
      webSearch: "联网搜索",
      untitled: "新对话",
      noConversations: "还没有对话",
      convSettings: "会话设置",
      renameLabel: "名称",
      systemPromptLabel: "系统提示词（留空 = 默认）",
      settingsHint: "系统提示词只影响之后生成的回复。",
      save: "保存",
      saved: "已保存",
      cancel: "取消",
      close: "关闭",
      delete: "删除",
      edit: "编辑",
      copy: "复制",
      copied: "已复制",
      copyCode: "复制",
      regenerate: "重新生成",
      loadEarlier: "加载更早的消息",
      reasoning: "思考过程",
      thinking: "思考中…",
      searchProcess: (n) => `搜索过程（${n} 步）`,
      sourcesCount: (n) => `来源（${n}）`,
      retry: "重试",
      generateNow: "生成回复",
      noReply: "这条消息还没有回复（上次生成被中断）。",
      stopped: "已停止生成。",
      stoppedTag: "已停止",
      stoppedTitle: "生成被停止，这是停止前已生成的部分",
      interruptedTag: "已中断",
      interruptedTitle: (reason) => `生成出错中断，这是中断前已生成的部分。原因：${reason}`,
      errorPrefix: "生成失败：",
      needKey: "请先在「设置」里配置 DeepSeek API Key。",
      confirmDelete: (title) => `删除会话「${title}」？此操作不可恢复。`,
      contextLength: (n) => `上下文 约 ${n} tokens`,
      usageMsg: (prompt, completion, reasoning) =>
        reasoning == null
          ? `输入 ${prompt} · 输出 ${completion}`
          : `输入 ${prompt} · 输出 ${completion} · 思考 ${reasoning}`,
      usageTitle: (replies, prompt, completion, reasoning, total) =>
        `本会话累计（${replies} 条回复）：输入 ${prompt} · 输出 ${completion} · 思考 ${reasoning} · 合计 ${total}`,
      you: "你",
      assistant: "助手",
    },
    en: {
      appTitle: "Chat",
      newChat: "New chat",
      emptyHint: "Click “New chat” to start, or pick a conversation on the left.",
      startHint: "Type a message to start.",
      inputPlaceholder: "Type a message… (Enter to send, Shift+Enter for newline)",
      send: "Send",
      stop: "Stop",
      generating: "Generating…",
      thinkingLabel: "Thinking",
      effortNone: "Off",
      effortLow: "Low",
      effortHigh: "High",
      effortMax: "Max",
      webSearch: "Web search",
      untitled: "New chat",
      noConversations: "No conversations",
      convSettings: "Conversation settings",
      renameLabel: "Name",
      systemPromptLabel: "System prompt (empty = default)",
      settingsHint: "The system prompt affects future replies only.",
      save: "Save",
      saved: "Saved",
      cancel: "Cancel",
      close: "Close",
      delete: "Delete",
      edit: "Edit",
      copy: "Copy",
      copied: "Copied",
      copyCode: "Copy",
      regenerate: "Regenerate",
      loadEarlier: "Load earlier messages",
      reasoning: "Reasoning",
      thinking: "Thinking…",
      searchProcess: (n) => `Search process (${n} steps)`,
      sourcesCount: (n) => `Sources (${n})`,
      retry: "Retry",
      generateNow: "Generate reply",
      noReply: "This message has no reply yet (the last generation was interrupted).",
      stopped: "Generation stopped.",
      stoppedTag: "Stopped",
      stoppedTitle: "Generation was stopped; this is what had been generated",
      interruptedTag: "Interrupted",
      interruptedTitle: (reason) => `Generation failed midway; this is what had been generated. Reason: ${reason}`,
      errorPrefix: "Generation failed: ",
      needKey: "Configure the DeepSeek API key in Settings first.",
      confirmDelete: (title) => `Delete conversation “${title}”? This cannot be undone.`,
      contextLength: (n) => `Context ~${n} tokens`,
      usageMsg: (prompt, completion, reasoning) =>
        reasoning == null ? `in ${prompt} · out ${completion}` : `in ${prompt} · out ${completion} · think ${reasoning}`,
      usageTitle: (replies, prompt, completion, reasoning, total) =>
        `This conversation (${replies} replies): in ${prompt} · out ${completion} · think ${reasoning} · total ${total}`,
      you: "You",
      assistant: "Assistant",
    },
  };

  let lang = "zh";
  const t = (key, ...args) => {
    const value = DICT[lang][key];
    return typeof value === "function" ? value(...args) : value;
  };

  async function call(name, payload, options) {
    return bridge.call(name, payload, options);
  }

  async function callOrThrow(name, payload) {
    const result = await call(name, payload);
    if (!result || !result.ok) {
      const error = new Error(result && result.error ? result.error.message : "unknown error");
      error.code = result && result.error ? result.error.code : "INTERNAL";
      throw error;
    }
    return result.result;
  }

  // ---- 元素 ----
  const convListEl = document.getElementById("conv-list");
  const messagesEl = document.getElementById("messages");
  const inputEl = document.getElementById("input");
  const sendBtn = document.getElementById("btn-send");
  const newBtn = document.getElementById("btn-new");
  const menuBtn = document.getElementById("btn-menu");
  const effortSelect = document.getElementById("effort-select");
  const webSearchToggle = document.getElementById("web-search-toggle");
  const settingsBtn = document.getElementById("btn-conv-settings");
  const settingsPanel = document.getElementById("settings-panel");
  const toastEl = document.getElementById("toast");
  const backdropEl = document.getElementById("backdrop");
  const usageTotalEl = document.getElementById("usage-total");

  // ---- 状态 ----
  let conversations = [];
  let currentId = null;
  let pathMessages = [];
  let pathHasMore = false;
  let pathLimit = 100;
  let pathGenerating = false; // 后端报告的「正在生成」（可能是别的页面 / 重新打开前发起的）
  let contextTokens = 0;
  let composing = false;
  let usageSummary = null;
  /** 本页面发起、正在进行的生成：会话 id → { runId, pendingUser, rounds: [{ reasoning, content, tools: [] }] } */
  const live = new Map();
  /** 生成结束后的提示：会话 id → { kind: "error" | "stopped", text } */
  const notices = new Map();
  let remotePoll = null;

  const currentConversation = () => conversations.find((item) => item.id === currentId) || null;
  const isBusy = (id) => live.has(id) || (id === currentId && pathGenerating);

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.remove("hidden");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toastEl.classList.add("hidden"), 1800);
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const minute = 60_000;
    const hour = 3_600_000;
    const day = 86_400_000;
    if (diff < minute) return lang === "zh" ? "刚刚" : "now";
    if (diff < hour) return lang === "zh" ? `${Math.floor(diff / minute)} 分钟前` : `${Math.floor(diff / minute)}m ago`;
    if (diff < day) return lang === "zh" ? `${Math.floor(diff / hour)} 小时前` : `${Math.floor(diff / hour)}h ago`;
    return lang === "zh" ? `${Math.floor(diff / day)} 天前` : `${Math.floor(diff / day)}d ago`;
  }

  const formatNumber = (value) => value.toLocaleString(lang === "zh" ? "zh-CN" : "en-US");

  // ---- 上下文长度与用量（DIALOG-0014） ----

  function renderUsage() {
    const conversation = currentConversation();
    if (!conversation || pathMessages.length === 0) {
      usageTotalEl.textContent = "";
      usageTotalEl.title = "";
      return;
    }
    usageTotalEl.textContent = t("contextLength", formatNumber(contextTokens));
    usageTotalEl.title =
      usageSummary && usageSummary.totalTokens > 0
        ? t(
            "usageTitle",
            usageSummary.replies,
            formatNumber(usageSummary.promptTokens),
            formatNumber(usageSummary.completionTokens),
            formatNumber(usageSummary.reasoningTokens),
            formatNumber(usageSummary.totalTokens),
          )
        : "";
  }

  // ---- 语言 ----

  async function initLanguage() {
    let value = null;
    try {
      const result = await call("platform.settings.get", { key: "ui.language" });
      value = result && result.ok ? result.result.value : null;
    } catch {
      /* ignore */
    }
    lang =
      value === "zh" || value === "en"
        ? value
        : navigator.language.toLowerCase().startsWith("zh")
          ? "zh"
          : "en";
    applyLanguage();
  }

  function applyLanguage() {
    document.title = t("appTitle");
    for (const el of document.querySelectorAll("[data-i18n]")) {
      el.textContent = t(el.dataset.i18n);
    }
    for (const el of document.querySelectorAll("[data-i18n-placeholder]")) {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    }
    renderConversations();
    renderMessages();
    renderComposerState();
    syncComposer();
    renderUsage();
  }

  // ---- 会话列表 ----

  async function loadConversations() {
    conversations = await callOrThrow("dialog.listConversations", {});
    if (currentId && !conversations.some((item) => item.id === currentId)) {
      currentId = conversations.length > 0 ? conversations[0].id : null;
    }
    renderConversations();
  }

  function renderConversations() {
    convListEl.innerHTML = "";
    if (conversations.length === 0) {
      const empty = document.createElement("div");
      empty.className = "conv-empty";
      empty.textContent = t("noConversations");
      convListEl.appendChild(empty);
      return;
    }
    for (const conversation of conversations) {
      const item = document.createElement("div");
      item.className = "conv-item" + (conversation.id === currentId ? " active" : "");

      const main = document.createElement("div");
      main.className = "conv-main";
      const title = document.createElement("div");
      title.className = "conv-title";
      title.textContent = conversation.title || t("untitled");
      const meta = document.createElement("div");
      meta.className = "conv-meta";
      meta.textContent = live.has(conversation.id) ? t("generating") : timeAgo(conversation.updatedAt);
      main.appendChild(title);
      main.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "conv-actions";
      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.className = "icon-btn";
      renameBtn.title = t("convSettings");
      renameBtn.textContent = "✎";
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "icon-btn danger";
      deleteBtn.title = t("delete");
      deleteBtn.textContent = "✕";
      actions.appendChild(renameBtn);
      actions.appendChild(deleteBtn);

      item.appendChild(main);
      item.appendChild(actions);
      item.addEventListener("click", () => void selectConversation(conversation.id));
      renameBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (currentId !== conversation.id) void selectConversation(conversation.id).then(() => openSettings(true));
        else openSettings(true);
      });
      deleteBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        void removeConversation(conversation.id);
      });
      convListEl.appendChild(item);
    }
  }

  async function createConversation() {
    const { conversationId } = await callOrThrow("dialog.createConversation", {});
    await loadConversations();
    await selectConversation(conversationId);
    inputEl.focus();
  }

  async function removeConversation(id) {
    const conversation = conversations.find((item) => item.id === id);
    const title = (conversation && conversation.title) || t("untitled");
    if (!window.confirm(t("confirmDelete", title))) return;
    const run = live.get(id);
    if (run) void bridge.cancel(run.runId);
    try {
      await callOrThrow("dialog.deleteConversation", { conversationId: id });
    } catch (error) {
      toast(error.message);
      return;
    }
    notices.delete(id);
    if (currentId === id) {
      currentId = null;
      pathMessages = [];
    }
    await loadConversations();
    if (currentId) await loadPath();
    else {
      renderMessages();
      renderComposerState();
      syncComposer();
      renderUsage();
    }
  }

  async function selectConversation(id) {
    currentId = id;
    pathLimit = 100;
    closeSettings();
    document.body.classList.remove("sidebar-open");
    renderConversations();
    try {
      await loadPath();
    } catch (error) {
      toast(error.message);
    }
  }

  // ---- 消息路径 ----

  async function loadPath(options = {}) {
    const scroll = options.scroll !== false;
    if (!currentId) {
      pathMessages = [];
      pathHasMore = false;
      pathGenerating = false;
      usageSummary = null;
      renderMessages();
      renderComposerState();
      syncComposer();
      renderUsage();
      return;
    }
    const id = currentId;
    const [result, usage] = await Promise.all([
      callOrThrow("dialog.getPath", { conversationId: id, limit: pathLimit }),
      callOrThrow("dialog.getUsage", { conversationId: id }),
    ]);
    if (id !== currentId) return;
    pathMessages = result.messages;
    pathHasMore = result.hasMore;
    pathGenerating = result.generating;
    contextTokens = result.contextTokens;
    usageSummary = usage;
    renderMessages({ scroll });
    renderComposerState();
    syncComposer();
    renderUsage();
    watchRemoteGeneration();
  }

  /** 后端正在生成、但不是本页面发起的（例如重新打开了页面）：定时刷新，直到生成结束 */
  function watchRemoteGeneration() {
    clearTimeout(remotePoll);
    if (currentId && pathGenerating && !live.has(currentId)) {
      remotePoll = setTimeout(() => void loadPath({ scroll: false }).catch(() => {}), 1500);
    }
  }

  function renderMessages(options = {}) {
    const scroll = options.scroll !== false;
    const nearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
    messagesEl.innerHTML = "";

    const run = currentId ? live.get(currentId) : null;
    if (!currentId || (pathMessages.length === 0 && !run)) {
      const hint = document.createElement("div");
      hint.className = "empty-state";
      hint.textContent = currentId ? t("startHint") : t("emptyHint");
      messagesEl.appendChild(hint);
      return;
    }

    if (pathHasMore) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "load-earlier";
      more.textContent = t("loadEarlier");
      more.addEventListener("click", async () => {
        const prevHeight = messagesEl.scrollHeight;
        const prevTop = messagesEl.scrollTop;
        pathLimit += 100;
        await loadPath({ scroll: false });
        messagesEl.scrollTop = prevTop + (messagesEl.scrollHeight - prevHeight);
      });
      messagesEl.appendChild(more);
    }

    for (const message of pathMessages) {
      messagesEl.appendChild(renderMessage(message));
    }

    if (run) {
      if (run.pendingUser) messagesEl.appendChild(renderPendingUser(run.pendingUser));
      messagesEl.appendChild(renderLive(run));
    } else if (currentId === (currentConversation() || {}).id && pathGenerating) {
      messagesEl.appendChild(renderRemoteGenerating());
    } else {
      const notice = notices.get(currentId);
      const last = pathMessages.at(-1);
      if (notice) messagesEl.appendChild(renderNotice(notice, last));
      else if (last && last.role === "user") messagesEl.appendChild(renderNotice({ kind: "missing", text: t("noReply") }, last));
    }

    if (scroll || (run && nearBottom)) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function messageHead(roleKey, message) {
    const head = document.createElement("div");
    head.className = "msg-head";
    const role = document.createElement("span");
    role.className = "msg-role";
    role.textContent = t(roleKey);
    head.appendChild(role);
    if (message && (message.stopped || message.error)) {
      const tag = document.createElement("span");
      tag.className = "stopped-tag" + (message.error ? " interrupted" : "");
      tag.textContent = message.error ? t("interruptedTag") : t("stoppedTag");
      tag.title = message.error ? t("interruptedTitle", message.error) : t("stoppedTitle");
      head.appendChild(tag);
    }
    if (message && message.siblingCount > 1) head.appendChild(buildBranchSwitcher(message));
    return head;
  }

  function renderMessage(message) {
    const wrap = document.createElement("div");
    wrap.className = `msg ${message.role}`;
    wrap.appendChild(messageHead(message.role === "user" ? "you" : "assistant", message));

    // 思考过程：所有轮的思考按顺序拼在一起（调用了工具的各轮存在 steps 里，最后一轮存在 reasoning 里），与生成中的显示一致
    const reasoning =
      message.role === "assistant"
        ? [...(message.steps || []).map((step) => step.reasoning), message.reasoning].filter(Boolean).join("\n\n")
        : "";
    if (reasoning) {
      wrap.appendChild(buildCollapsible(t("reasoning"), buildReasoningBody(reasoning)));
    }
    if (message.role === "assistant" && message.steps && message.steps.length > 0) {
      wrap.appendChild(buildCollapsible(t("searchProcess", countTools(message.steps)), buildStepsBody(message.steps)));
    }

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    if (message.role === "assistant") {
      bubble.innerHTML = window.renderMarkdown(message.content, { copyLabel: t("copyCode"), sources: message.sources || [] });
    } else {
      bubble.textContent = message.content;
    }
    wrap.appendChild(bubble);

    if (message.role === "assistant" && message.sources && message.sources.length > 0) {
      wrap.appendChild(buildSources(message.sources));
    }

    const actions = document.createElement("div");
    actions.className = "msg-actions";
    if (message.usage) {
      const usageNote = document.createElement("span");
      usageNote.className = "usage-note";
      const reasoningTokens = message.usage.reasoningTokens;
      usageNote.textContent = t(
        "usageMsg",
        formatNumber(message.usage.promptTokens),
        formatNumber(message.usage.completionTokens),
        reasoningTokens == null ? null : formatNumber(reasoningTokens),
      );
      actions.appendChild(usageNote);
    }
    actions.appendChild(linkButton(t("copy"), () => {
      void navigator.clipboard.writeText(message.content).then(() => toast(t("copied")));
    }));
    if (message.role === "user") {
      actions.appendChild(linkButton(t("edit"), () => startEdit(message, bubble)));
    } else {
      actions.appendChild(linkButton(t("regenerate"), () => void regenerate(message)));
    }
    wrap.appendChild(actions);
    return wrap;
  }

  function linkButton(text, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "link-btn";
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
  }

  function countTools(steps) {
    return steps.reduce((sum, step) => sum + (step.toolCalls || step.tools || []).length, 0);
  }

  function buildCollapsible(label, body, open = false) {
    const box = document.createElement("div");
    box.className = "collapsible";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "collapsible-toggle reasoning-toggle";
    toggle.textContent = `${open ? "▾" : "▸"} ${label}`;
    if (!open) body.classList.add("hidden");
    toggle.addEventListener("click", () => {
      const hidden = body.classList.toggle("hidden");
      toggle.textContent = `${hidden ? "▸" : "▾"} ${label}`;
    });
    box.appendChild(toggle);
    box.appendChild(body);
    return box;
  }

  function buildReasoningBody(reasoning) {
    const body = document.createElement("div");
    body.className = "reasoning-body";
    body.textContent = reasoning;
    return body;
  }

  /** 搜索过程：每一轮说的话（如有）与工具调用 */
  function buildStepsBody(steps) {
    const body = document.createElement("div");
    body.className = "steps-body";
    for (const step of steps) {
      if (step.content) {
        const said = document.createElement("div");
        said.className = "step-said";
        said.textContent = step.content;
        body.appendChild(said);
      }
      for (const tool of step.toolCalls || step.tools || []) {
        const row = document.createElement("div");
        const status = tool.status || (tool.ok ? "ok" : "fail");
        row.className = `step-tool ${status}`;
        row.textContent = `${status === "running" ? "…" : status === "ok" ? "✓" : "✕"} ${tool.summary}`;
        body.appendChild(row);
      }
    }
    return body;
  }

  /** 来源：全部列出，默认折叠（DIALOG-0010） */
  function buildSources(sources) {
    const list = document.createElement("ol");
    for (const source of sources) {
      const item = document.createElement("li");
      item.value = source.index;
      const link = document.createElement("a");
      link.href = source.url;
      link.dataset.external = "1";
      link.rel = "noreferrer";
      link.textContent = source.title || source.url;
      item.appendChild(link);
      const meta = [source.siteName, source.date ? source.date.slice(0, 10) : null].filter(Boolean).join(" · ");
      if (meta) {
        const span = document.createElement("span");
        span.className = "source-meta";
        span.textContent = ` — ${meta}`;
        item.appendChild(span);
      }
      list.appendChild(item);
    }
    const body = document.createElement("div");
    body.className = "sources";
    body.appendChild(list);
    return buildCollapsible(t("sourcesCount", sources.length), body);
  }

  function renderPendingUser(text) {
    const wrap = document.createElement("div");
    wrap.className = "msg user pending";
    wrap.appendChild(messageHead("you"));
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;
    wrap.appendChild(bubble);
    return wrap;
  }

  /** 正在生成的回复：思考过程、搜索过程（实时状态）、流式正文 */
  function renderLive(run) {
    const wrap = document.createElement("div");
    wrap.className = "msg assistant live";
    wrap.appendChild(messageHead("assistant"));

    const current = run.rounds.at(-1) || { reasoning: "", content: "", tools: [] };
    const toolRounds = run.rounds.filter((round) => round.tools.length > 0);
    const reasoning = run.rounds.map((round) => round.reasoning).filter(Boolean).join("\n\n");
    if (reasoning) {
      const open = !current.content && current.tools.length === 0;
      wrap.appendChild(buildCollapsible(open ? t("thinking") : t("reasoning"), buildReasoningBody(reasoning), open));
    }
    if (toolRounds.length > 0) {
      wrap.appendChild(buildCollapsible(t("searchProcess", countTools(toolRounds)), buildStepsBody(toolRounds), true));
    }

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    const text = current.tools.length === 0 ? current.content : "";
    if (text) bubble.innerHTML = window.renderMarkdown(text, { copyLabel: t("copyCode") });
    else bubble.innerHTML = `<span class="typing">${t(reasoning ? "thinking" : "generating")}</span>`;
    wrap.appendChild(bubble);
    return wrap;
  }

  function renderRemoteGenerating() {
    const wrap = document.createElement("div");
    wrap.className = "msg assistant live";
    wrap.appendChild(messageHead("assistant"));
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = `<span class="typing">${t("generating")}</span>`;
    wrap.appendChild(bubble);
    return wrap;
  }

  /** 生成失败 / 已停止 / 没有回复：提示 + 重试（为最后那条用户消息生成） */
  function renderNotice(notice, lastMessage) {
    const box = document.createElement("div");
    box.className = notice.kind === "error" ? "error-bubble" : "notice-bubble";
    const span = document.createElement("span");
    span.textContent = notice.text;
    box.appendChild(span);
    if (lastMessage && lastMessage.role === "user") {
      box.appendChild(
        linkButton(notice.kind === "error" ? t("retry") : t("generateNow"), () => {
          void startRun(lastMessage.conversationId, "dialog.generate", {
            conversationId: lastMessage.conversationId,
            parentId: lastMessage.id,
          });
        }),
      );
    }
    return box;
  }

  function buildBranchSwitcher(message) {
    const box = document.createElement("span");
    box.className = "branch-switcher";
    const prev = linkButton("‹", () => void switchTo(-1));
    const label = document.createElement("span");
    label.textContent = `${message.siblingIndex}/${message.siblingCount}`;
    const next = linkButton("›", () => void switchTo(1));

    async function switchTo(offset) {
      const index = message.siblingIds.indexOf(message.id);
      if (index < 0) return;
      const target = message.siblingIds[(index + offset + message.siblingIds.length) % message.siblingIds.length];
      try {
        await callOrThrow("dialog.switchBranch", {
          conversationId: message.conversationId,
          parentId: message.parentId,
          childId: target,
        });
        notices.delete(message.conversationId);
        await loadPath();
      } catch (error) {
        toast(error.message);
      }
    }
    box.appendChild(prev);
    box.appendChild(label);
    box.appendChild(next);
    return box;
  }

  function startEdit(message, bubble) {
    if (isBusy(message.conversationId)) return;
    const editor = document.createElement("div");
    editor.className = "edit-box";
    const textarea = document.createElement("textarea");
    textarea.value = message.content;
    textarea.rows = Math.min(8, Math.max(2, message.content.split("\n").length));
    const actions = document.createElement("div");
    actions.className = "edit-actions";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "primary";
    save.textContent = t("save");
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = t("cancel");
    actions.appendChild(save);
    actions.appendChild(cancel);
    editor.appendChild(textarea);
    editor.appendChild(actions);

    bubble.replaceWith(editor);
    textarea.focus();

    cancel.addEventListener("click", () => void loadPath());
    save.addEventListener("click", () => {
      const text = textarea.value.trim();
      if (!text) return;
      void startRun(message.conversationId, "dialog.editAndSend", { messageId: message.id, content: text });
    });
  }

  async function regenerate(message) {
    if (isBusy(message.conversationId) || !message.parentId) return;
    await startRun(message.conversationId, "dialog.generate", {
      conversationId: message.conversationId,
      parentId: message.parentId,
    });
  }

  // ---- 生成：发起、接收推送事件、结束后刷新 ----

  let renderScheduled = false;
  function scheduleRender(conversationId) {
    if (conversationId !== currentId || renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      renderMessages({ scroll: false });
    });
  }

  function handleEvent(conversationId, run, event) {
    if (!event || typeof event !== "object") return;
    const current = () => {
      if (run.rounds.length === 0) run.rounds.push({ reasoning: "", content: "", tools: [] });
      return run.rounds.at(-1);
    };
    switch (event.type) {
      case "round_start":
        if (run.rounds.length === 0 || run.rounds.at(-1).reasoning || run.rounds.at(-1).content || run.rounds.at(-1).tools.length) {
          run.rounds.push({ reasoning: "", content: "", tools: [] });
        }
        break;
      case "round_retry": {
        // 这一轮出错、即将从头重试：丢掉已显示的半截
        const round = current();
        round.reasoning = "";
        round.content = "";
        break;
      }
      case "ai_delta":
        if (event.reasoning) current().reasoning += event.reasoning;
        if (event.content) current().content += event.content;
        break;
      case "tool_start":
        current().tools.push({ callId: event.callId, summary: event.summary, status: "running" });
        break;
      case "tool_result": {
        const tool = current().tools.find((item) => item.callId === event.callId);
        if (tool) tool.status = event.ok ? "ok" : "fail";
        break;
      }
      default:
        return;
    }
    scheduleRender(conversationId);
  }

  /**
   * 发起一次生成（dialog.send / generate / editAndSend）。
   * 生成与保存都在后端；本页面通过推送事件显示进度，结束后重新读取路径。
   */
  async function startRun(conversationId, api, payload, options = {}) {
    if (isBusy(conversationId)) return;
    const runId = bridge.newRunId();
    const run = { runId, pendingUser: options.pendingUser || null, rounds: [] };
    live.set(conversationId, run);
    notices.delete(conversationId);
    const unsubscribe = bridge.onEvent(runId, (event) => handleEvent(conversationId, run, event));
    renderConversations();
    if (currentId === conversationId) {
      renderMessages();
      renderComposerState();
    }
    // 编辑：后端很快会建好新分叉，刷新一次以显示改过的消息
    if (api === "dialog.editAndSend" && currentId === conversationId) {
      setTimeout(() => {
        if (live.get(conversationId) === run && currentId === conversationId) void loadPath({ scroll: true }).catch(() => {});
      }, 150);
    }

    let result;
    try {
      result = await call(api, payload, { runId });
    } finally {
      unsubscribe();
      live.delete(conversationId);
    }
    if (!result || !result.ok) {
      const code = result && result.error ? result.error.code : "INTERNAL";
      const text = result && result.error ? String(result.error.message) : "unknown error";
      if (code === "ABORTED") notices.set(conversationId, { kind: "stopped", text: t("stopped") });
      else if (code === "PRECONDITION" && text.includes("API Key")) notices.set(conversationId, { kind: "error", text: t("needKey") });
      else notices.set(conversationId, { kind: "error", text: `${t("errorPrefix")}${text}` });
    }
    await loadConversations().catch(() => {});
    if (currentId === conversationId) await loadPath().catch(() => {});
    else renderConversations();
  }

  async function send() {
    const conversation = currentConversation();
    if (!conversation || isBusy(conversation.id)) return;
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = "";
    autosize();
    await startRun(conversation.id, "dialog.send", { conversationId: conversation.id, content: text }, { pendingUser: text });
  }

  function stop() {
    const run = currentId ? live.get(currentId) : null;
    if (run) void bridge.cancel(run.runId);
  }

  // ---- 输入区 ----

  function autosize() {
    inputEl.style.height = "auto";
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 180)}px`;
  }

  function syncComposer() {
    const conversation = currentConversation();
    if (conversation) {
      effortSelect.value = conversation.reasoningEffort;
      webSearchToggle.checked = conversation.webSearch !== false;
    }
  }

  function renderComposerState() {
    const conversation = currentConversation();
    const mine = conversation ? live.has(conversation.id) : false;
    const busy = conversation ? isBusy(conversation.id) : false;
    sendBtn.disabled = !conversation || (busy && !mine);
    sendBtn.textContent = mine ? t("stop") : busy ? t("generating") : t("send");
    sendBtn.classList.toggle("stop", mine);
    settingsBtn.disabled = !conversation;
    effortSelect.disabled = !conversation;
    webSearchToggle.disabled = !conversation;
  }

  inputEl.addEventListener("compositionstart", () => {
    composing = true;
  });
  inputEl.addEventListener("compositionend", () => {
    composing = false;
  });
  inputEl.addEventListener("input", autosize);
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !composing && !event.isComposing) {
      event.preventDefault();
      void send();
    }
  });
  sendBtn.addEventListener("click", () => {
    if (currentId && live.has(currentId)) stop();
    else void send();
  });
  newBtn.addEventListener("click", () => void createConversation());

  effortSelect.addEventListener("change", async () => {
    const conversation = currentConversation();
    if (!conversation) return;
    const effort = effortSelect.value;
    try {
      await callOrThrow("dialog.setReasoningEffort", { conversationId: conversation.id, effort });
      conversation.reasoningEffort = effort;
    } catch (error) {
      toast(error.message);
      syncComposer();
    }
  });

  webSearchToggle.addEventListener("change", async () => {
    const conversation = currentConversation();
    if (!conversation) return;
    const enabled = webSearchToggle.checked;
    try {
      await callOrThrow("dialog.setWebSearch", { conversationId: conversation.id, enabled });
      conversation.webSearch = enabled;
    } catch (error) {
      toast(error.message);
      syncComposer();
    }
  });

  // ---- 会话设置 ----

  function closeSettings() {
    settingsPanel.classList.add("hidden");
    settingsPanel.innerHTML = "";
  }

  function openSettings(focusRename = false) {
    const conversation = currentConversation();
    if (!conversation) return;
    settingsPanel.innerHTML = "";

    const titleRow = document.createElement("label");
    titleRow.className = "setting-row";
    const titleLabel = document.createElement("span");
    titleLabel.textContent = t("renameLabel");
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.value = conversation.title;
    titleRow.appendChild(titleLabel);
    titleRow.appendChild(titleInput);

    const promptRow = document.createElement("label");
    promptRow.className = "setting-row";
    const promptLabel = document.createElement("span");
    promptLabel.textContent = t("systemPromptLabel");
    const promptInput = document.createElement("textarea");
    promptInput.rows = 6;
    promptInput.value = conversation.systemPrompt ?? "";
    promptRow.appendChild(promptLabel);
    promptRow.appendChild(promptInput);

    const actions = document.createElement("div");
    actions.className = "settings-actions";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "primary";
    save.textContent = t("save");
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = t("close");
    actions.appendChild(save);
    actions.appendChild(close);

    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = t("settingsHint");

    settingsPanel.appendChild(titleRow);
    settingsPanel.appendChild(promptRow);
    settingsPanel.appendChild(actions);
    settingsPanel.appendChild(hint);
    settingsPanel.classList.remove("hidden");
    if (focusRename) titleInput.focus();

    close.addEventListener("click", closeSettings);
    save.addEventListener("click", async () => {
      const title = titleInput.value.trim();
      const systemPrompt = promptInput.value.trim();
      try {
        if (title && title !== conversation.title) {
          await callOrThrow("dialog.renameConversation", { conversationId: conversation.id, title });
        }
        if (systemPrompt !== (conversation.systemPrompt ?? "")) {
          await callOrThrow("dialog.setSystemPrompt", {
            conversationId: conversation.id,
            systemPrompt: systemPrompt || null,
          });
        }
      } catch (error) {
        toast(error.message);
        return;
      }
      await loadConversations();
      toast(t("saved"));
      closeSettings();
    });
  }

  settingsBtn.addEventListener("click", () => openSettings(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSettings();
  });

  // ---- 消息区事件委托（代码复制 / 外链） ----

  messagesEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const copy = target.closest(".code-copy");
    if (copy) {
      const block = copy.closest(".codeblock");
      const code = block ? block.querySelector("pre code") : null;
      if (code) {
        void navigator.clipboard.writeText(code.textContent || "").then(() => toast(t("copied")));
      }
      return;
    }
    const link = target.closest("a[data-external]");
    if (link) {
      event.preventDefault();
      const href = link.getAttribute("href") || "";
      if (typeof bridge.openExternal === "function") void bridge.openExternal(href);
    }
  });

  // ---- 窄屏侧栏 ----

  menuBtn.addEventListener("click", () => document.body.classList.toggle("sidebar-open"));
  backdropEl.addEventListener("click", () => document.body.classList.remove("sidebar-open"));

  // ---- 启动 ----

  async function init() {
    await initLanguage();
    try {
      await loadConversations();
    } catch (error) {
      toast(error.message);
    }
    if (conversations.length > 0) {
      await selectConversation(conversations[0].id);
    } else {
      renderMessages();
      renderComposerState();
      syncComposer();
    }
  }

  void init();
})();
