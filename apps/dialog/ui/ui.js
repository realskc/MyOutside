/* 对话 v0：多会话 + 树形历史分叉 + 思考强度 + Markdown（中英文） */
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
      generating: "生成中…",
      thinkingLabel: "思考",
      effortNone: "关",
      effortLow: "低",
      effortHigh: "高",
      effortMax: "最高",
      untitled: "新对话",
      noConversations: "还没有对话",
      convSettings: "会话设置",
      renameLabel: "名称",
      systemPromptLabel: "系统提示词（留空 = 默认）",
      settingsHint: "系统提示词只影响之后生成的回复。",
      save: "保存",
      cancel: "取消",
      close: "关闭",
      delete: "删除",
      edit: "编辑",
      copy: "复制",
      copied: "已复制",
      copyCode: "复制",
      loadEarlier: "加载更早的消息",
      reasoning: "思考过程",
      retry: "重试",
      errorPrefix: "生成失败：",
      needKey: "请先在「设置」里配置 DeepSeek API Key。",
      confirmDelete: (title) => `删除会话「${title}」？此操作不可恢复。`,
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
      generating: "Generating…",
      thinkingLabel: "Thinking",
      effortNone: "Off",
      effortLow: "Low",
      effortHigh: "High",
      effortMax: "Max",
      untitled: "New chat",
      noConversations: "No conversations",
      convSettings: "Conversation settings",
      renameLabel: "Name",
      systemPromptLabel: "System prompt (empty = default)",
      settingsHint: "The system prompt affects future replies only.",
      save: "Save",
      cancel: "Cancel",
      close: "Close",
      delete: "Delete",
      edit: "Edit",
      copy: "Copy",
      copied: "Copied",
      copyCode: "Copy",
      loadEarlier: "Load earlier messages",
      reasoning: "Reasoning",
      retry: "Retry",
      errorPrefix: "Generation failed: ",
      needKey: "Configure the DeepSeek API key in Settings first.",
      confirmDelete: (title) => `Delete conversation “${title}”? This cannot be undone.`,
      you: "You",
      assistant: "Assistant",
    },
  };

  let lang = "zh";
  const t = (key, ...args) => {
    const value = DICT[lang][key];
    return typeof value === "function" ? value(...args) : value;
  };

  async function call(name, payload) {
    return bridge.call(name, payload);
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
  const settingsBtn = document.getElementById("btn-conv-settings");
  const settingsPanel = document.getElementById("settings-panel");
  const toastEl = document.getElementById("toast");
  const backdropEl = document.getElementById("backdrop");

  // ---- 状态 ----
  let conversations = [];
  let currentId = null;
  let pathMessages = [];
  let pathHasMore = false;
  let pathLimit = 100;
  let composing = false;
  const generating = new Set();
  const errors = new Map();

  const currentConversation = () => conversations.find((item) => item.id === currentId) || null;
  const isGenerating = (id) => generating.has(id);

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
      meta.textContent = timeAgo(conversation.updatedAt);
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
    try {
      await callOrThrow("dialog.deleteConversation", { conversationId: id });
    } catch (error) {
      toast(error.message);
      return;
    }
    errors.delete(id);
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
      renderMessages();
      renderComposerState();
      syncComposer();
      return;
    }
    const result = await callOrThrow("dialog.getPath", { conversationId: currentId, limit: pathLimit });
    pathMessages = result.messages;
    pathHasMore = result.hasMore;
    renderMessages({ scroll });
    renderComposerState();
    syncComposer();
  }

  function renderMessages(options = {}) {
    const scroll = options.scroll !== false;
    messagesEl.innerHTML = "";

    if (!currentId || pathMessages.length === 0) {
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

    const error = errors.get(currentId);
    if (error) messagesEl.appendChild(renderErrorBubble(error));

    if (scroll) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderMessage(message) {
    const wrap = document.createElement("div");
    wrap.className = `msg ${message.role}`;

    const head = document.createElement("div");
    head.className = "msg-head";
    const role = document.createElement("span");
    role.className = "msg-role";
    role.textContent = message.role === "user" ? t("you") : t("assistant");
    head.appendChild(role);
    if (message.siblingCount > 1) {
      head.appendChild(buildBranchSwitcher(message));
    }
    wrap.appendChild(head);

    if (message.role === "assistant" && message.reasoning) {
      wrap.appendChild(buildReasoning(message.reasoning));
    }

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    if (message.role === "assistant") {
      bubble.innerHTML = window.renderMarkdown(message.content, { copyLabel: t("copyCode") });
    } else {
      bubble.textContent = message.content;
    }
    wrap.appendChild(bubble);

    const actions = document.createElement("div");
    actions.className = "msg-actions";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "link-btn";
    copyBtn.textContent = t("copy");
    copyBtn.addEventListener("click", () => {
      void navigator.clipboard.writeText(message.content).then(() => toast(t("copied")));
    });
    actions.appendChild(copyBtn);
    if (message.role === "user") {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "link-btn";
      editBtn.textContent = t("edit");
      editBtn.addEventListener("click", () => startEdit(message, bubble));
      actions.appendChild(editBtn);
    }
    wrap.appendChild(actions);
    return wrap;
  }

  function buildReasoning(reasoning) {
    const box = document.createElement("div");
    box.className = "reasoning";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "reasoning-toggle";
    toggle.textContent = `▸ ${t("reasoning")}`;
    const body = document.createElement("div");
    body.className = "reasoning-body hidden";
    body.textContent = reasoning;
    toggle.addEventListener("click", () => {
      const hidden = body.classList.toggle("hidden");
      toggle.textContent = `${hidden ? "▸" : "▾"} ${t("reasoning")}`;
    });
    box.appendChild(toggle);
    box.appendChild(body);
    return box;
  }

  function buildBranchSwitcher(message) {
    const box = document.createElement("span");
    box.className = "branch-switcher";
    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "link-btn";
    prev.textContent = "‹";
    const label = document.createElement("span");
    label.textContent = `${message.siblingIndex}/${message.siblingCount}`;
    const next = document.createElement("button");
    next.type = "button";
    next.className = "link-btn";
    next.textContent = "›";

    const switchTo = async (offset) => {
      if (isGenerating(message.conversationId)) return;
      const index = message.siblingIds.indexOf(message.id);
      if (index < 0) return;
      const target =
        message.siblingIds[(index + offset + message.siblingIds.length) % message.siblingIds.length];
      try {
        await callOrThrow("dialog.switchBranch", {
          conversationId: message.conversationId,
          parentId: message.parentId,
          childId: target,
        });
        await loadPath();
      } catch (error) {
        toast(error.message);
      }
    };
    prev.addEventListener("click", () => void switchTo(-1));
    next.addEventListener("click", () => void switchTo(1));
    box.appendChild(prev);
    box.appendChild(label);
    box.appendChild(next);
    return box;
  }

  function startEdit(message, bubble) {
    if (isGenerating(message.conversationId)) return;
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
      void saveEdit(message, text);
    });
  }

  async function saveEdit(message, text) {
    try {
      await callOrThrow("dialog.editUserMessage", { messageId: message.id, content: text });
    } catch (error) {
      toast(error.message);
      return;
    }
    await loadConversations();
    if (currentId === message.conversationId) await loadPath();
    await generateReplyFor(message.conversationId);
  }

  // ---- 生成 ----

  async function generateReplyFor(conversationId) {
    generating.add(conversationId);
    errors.delete(conversationId);
    if (currentId === conversationId) {
      renderMessages();
      renderComposerState();
      syncComposer();
    }
    try {
      const reply = await callOrThrow("dialog.generateReply", { conversationId });
      await callOrThrow("dialog.appendMessage", {
        conversationId,
        role: "assistant",
        content: reply.content,
        ...(reply.reasoning ? { reasoning: reply.reasoning } : {}),
        ...(reply.model ? { model: reply.model } : {}),
        ...(reply.usage ? { usage: reply.usage } : {}),
      });
      await loadConversations();
      if (currentId === conversationId) await loadPath();
    } catch (error) {
      const text = String(error.message || error);
      errors.set(
        conversationId,
        text.includes("API Key") ? t("needKey") : `${t("errorPrefix")}${text}`,
      );
      if (currentId === conversationId) renderMessages();
    } finally {
      generating.delete(conversationId);
      if (currentId === conversationId) {
        renderMessages();
        renderComposerState();
        syncComposer();
      }
      renderConversations();
    }
  }

  function renderErrorBubble(text) {
    const box = document.createElement("div");
    box.className = "error-bubble";
    const span = document.createElement("span");
    span.textContent = text;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "link-btn";
    retry.textContent = t("retry");
    retry.addEventListener("click", () => {
      const id = currentId;
      if (id) void generateReplyFor(id);
    });
    box.appendChild(span);
    box.appendChild(retry);
    return box;
  }

  async function send() {
    const conversation = currentConversation();
    if (!conversation || isGenerating(conversation.id)) return;
    const text = inputEl.value.trim();
    if (!text) return;
    const conversationId = conversation.id;
    inputEl.value = "";
    autosize();
    try {
      await callOrThrow("dialog.appendMessage", { conversationId, role: "user", content: text });
    } catch (error) {
      inputEl.value = text;
      autosize();
      toast(error.message);
      return;
    }
    await loadConversations();
    if (currentId === conversationId) await loadPath();
    await generateReplyFor(conversationId);
  }

  // ---- 输入区 ----

  function autosize() {
    inputEl.style.height = "auto";
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 180)}px`;
  }

  function syncComposer() {
    const conversation = currentConversation();
    if (conversation) effortSelect.value = conversation.reasoningEffort;
  }

  function renderComposerState() {
    const conversation = currentConversation();
    const busy = conversation ? isGenerating(conversation.id) : false;
    sendBtn.disabled = !conversation || busy;
    sendBtn.textContent = busy ? t("generating") : t("send");
    settingsBtn.disabled = !conversation;
    effortSelect.disabled = !conversation || busy;
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
  sendBtn.addEventListener("click", () => void send());
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
          await callOrThrow("dialog.renameConversation", {
            conversationId: conversation.id,
            title,
          });
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
