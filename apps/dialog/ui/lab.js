/* 实验室（DIALOG-0020）：直接编辑 DeepSeek 请求体，原样运行、原样看响应。
   普通对话不受影响；这里没有消息树，版本就是每次运行的完整请求。 */
(() => {
  "use strict";

  const bridge = window.outside;
  if (!bridge) {
    document.body.innerHTML = "<p style='padding:24px'>Please open this page inside MyOutside.</p>";
    return;
  }

  const DRAFT_KEY = "dialog.lab.request";
  /** 请求体用「块」还是「JSON」编辑（DIALOG-0021） */
  const MODE_KEY = "dialog.lab.mode";

  const DICT = {
    zh: {
      labTitle: "实验室",
      labBack: "返回对话",
      labBlank: "空白请求",
      labImport: "从对话导入",
      labFormat: "格式化",
      labRun: "运行",
      labStop: "停止",
      labRequest: "请求体",
      labContent: "正文",
      labReasoning: "思考",
      labTools: "工具",
      labRaw: "原始 JSON",
      labChoice: "选择 choice",
      labAppend: "把回复加入消息",
      labCopyResponse: "复制响应",
      labHistory: "运行记录",
      labRefresh: "刷新",
      labEmpty: "还没有运行记录。",
      labResponseEmpty: "还没有运行。点「运行」把请求体发给模型。",
      labRunning: "运行中…",
      labOk: "完成",
      labError: "失败",
      labAborted: "已停止",
      labUntitled: "未命名实验",
      labUntitledConversation: "未命名对话",
      labFrom: (title) => `来自《${title}》`,
      labFromUnknown: "来自对话",
      labTokens: (prompt, completion) => `输入 ${prompt} · 输出 ${completion}`,
      labTokensShort: (n) => `${n} tokens`,
      labCost: (cost) => `¥${cost.toFixed(4)}`,
      labDuration: (ms) => `${ms} ms`,
      labImported: "已导入对话请求",
      labImportTitle: "从对话导入",
      labNoConversations: "还没有对话。",
      labNoUserMessage: "这个对话里还没有用户消息。",
      labInvalidJson: "JSON 无效",
      labNotObject: "请求体必须是 JSON 对象",
      labFormatted: "已格式化",
      labAppended: "已加入请求体",
      labNoReply: "响应里没有可加入的 assistant 消息。",
      labToolHint: "已加入 assistant 消息；它包含 tool_calls，记得补 role=tool 的结果。",
      labCopied: "已复制",
      labCopyCode: "复制",
      labConfirmDelete: "删除这条运行记录？",
      labDeleted: "已删除",
      labNoContent: "没有正文。",
      labNoReasoning: "没有思考过程。",
      labNoTools: "这条回复没有工具调用。",
      labNoResponse: "没有响应。",
      labNeedKey: "请先在「设置」里配置 DeepSeek API Key。",
      labPaste: "把请求体 JSON 粘贴到这里，或点「空白请求」。",
      labClose: "关闭",
      labDelete: "删除",
      labLoad: "载入",
      labImportFailed: "导入失败",
      labRunFailed: "运行失败",
      labModeBlocks: "块",
      labModeJson: "JSON",
      labParams: "参数",
      labMessages: "消息",
      labNoParams: "没有参数。",
      labNoMessagesYet: "还没有消息。",
      labNoToolsYet: "没有工具。",
      labAddMessages: "messages",
      labAddTool: "工具",
      labAddToolCall: "工具调用",
      labAddField: "字段",
      labAdd: "添加",
      labFieldKey: "字段名",
      labFieldValue: "值（按 JSON 解析，解析不了就当文本）",
      labFieldKeyEmpty: "先填字段名",
      labFieldExists: "已经有这个字段了",
      labNotNumber: "不是数字",
      labInvalidFields: (n) => `有 ${n} 处写得不对（标红的地方），改好再继续`,
      labEditJson: "以 JSON 编辑",
      labEditForm: "回到表单",
      labFormShort: "表单",
      labToText: "改为文本",
      labMoveUp: "上移",
      labMoveDown: "下移",
      labDuplicate: "复制一份",
      labCollapse: "折叠",
      labExpand: "展开",
      labCollapseAll: "全部折叠",
      labExpandAll: "全部展开",
      labInsert: "在这里插入",
      labUndo: "撤销",
      labNoRole: "（无 role）",
      labContentLabel: "内容",
      labReasoningLabel: "思考",
      labToolCallsLabel: "工具调用",
      labToolCallIdLabel: "调用 ID",
      labCallsCount: (n) => `${n} 个工具调用`,
      labCallName: "函数名",
      labCallArgs: "参数（JSON 字符串）",
      labUnnamedTool: "未命名工具",
      labToolName: "名称",
      labToolDescription: "说明",
      labToolParameters: "参数（JSON Schema）",
    },
    en: {
      labTitle: "Lab",
      labBack: "Back to chat",
      labBlank: "Blank request",
      labImport: "Import from chat",
      labFormat: "Format",
      labRun: "Run",
      labStop: "Stop",
      labRequest: "Request body",
      labContent: "Content",
      labReasoning: "Reasoning",
      labTools: "Tools",
      labRaw: "Raw JSON",
      labChoice: "Choose choice",
      labAppend: "Append reply to messages",
      labCopyResponse: "Copy response",
      labHistory: "Runs",
      labRefresh: "Refresh",
      labEmpty: "No runs yet.",
      labResponseEmpty: "No run yet. Click “Run” to send the request body to the model.",
      labRunning: "Running…",
      labOk: "Done",
      labError: "Error",
      labAborted: "Stopped",
      labUntitled: "Untitled experiment",
      labUntitledConversation: "Untitled chat",
      labFrom: (title) => `From “${title}”`,
      labFromUnknown: "From a chat",
      labTokens: (prompt, completion) => `in ${prompt} · out ${completion}`,
      labTokensShort: (n) => `${n} tokens`,
      labCost: (cost) => `¥${cost.toFixed(4)}`,
      labDuration: (ms) => `${ms} ms`,
      labImported: "Imported the chat request",
      labImportTitle: "Import from chat",
      labNoConversations: "No conversations yet.",
      labNoUserMessage: "This conversation has no user message.",
      labInvalidJson: "Invalid JSON",
      labNotObject: "The request body must be a JSON object",
      labFormatted: "Formatted",
      labAppended: "Appended to the request",
      labNoReply: "The response has no assistant message to append.",
      labToolHint: "Appended the assistant message; it has tool_calls, remember to add the role=tool results.",
      labCopied: "Copied",
      labCopyCode: "Copy",
      labConfirmDelete: "Delete this run?",
      labDeleted: "Deleted",
      labNoContent: "No content.",
      labNoReasoning: "No reasoning.",
      labNoTools: "This reply has no tool calls.",
      labNoResponse: "No response.",
      labNeedKey: "Configure the DeepSeek API key in Settings first.",
      labPaste: "Paste the request body JSON here, or click “Blank request”.",
      labClose: "Close",
      labDelete: "Delete",
      labLoad: "Load",
      labImportFailed: "Import failed",
      labRunFailed: "Run failed",
      labModeBlocks: "Blocks",
      labModeJson: "JSON",
      labParams: "Parameters",
      labMessages: "Messages",
      labNoParams: "No parameters.",
      labNoMessagesYet: "No messages yet.",
      labNoToolsYet: "No tools.",
      labAddMessages: "messages",
      labAddTool: "Tool",
      labAddToolCall: "Tool call",
      labAddField: "Field",
      labAdd: "Add",
      labFieldKey: "Field name",
      labFieldValue: "Value (parsed as JSON, otherwise kept as text)",
      labFieldKeyEmpty: "Enter a field name first",
      labFieldExists: "This field already exists",
      labNotNumber: "Not a number",
      labInvalidFields: (n) => `${n} place(s) are invalid (marked red); fix them first`,
      labEditJson: "Edit as JSON",
      labEditForm: "Back to form",
      labFormShort: "Form",
      labToText: "Make text",
      labMoveUp: "Move up",
      labMoveDown: "Move down",
      labDuplicate: "Duplicate",
      labCollapse: "Collapse",
      labExpand: "Expand",
      labCollapseAll: "Collapse all",
      labExpandAll: "Expand all",
      labInsert: "Insert here",
      labUndo: "Undo",
      labNoRole: "(no role)",
      labContentLabel: "Content",
      labReasoningLabel: "Reasoning",
      labToolCallsLabel: "Tool calls",
      labToolCallIdLabel: "Call ID",
      labCallsCount: (n) => `${n} tool call(s)`,
      labCallName: "Function name",
      labCallArgs: "Arguments (JSON string)",
      labUnnamedTool: "Unnamed tool",
      labToolName: "Name",
      labToolDescription: "Description",
      labToolParameters: "Parameters (JSON Schema)",
    },
  };

  let lang = "zh";
  const t = (key, ...args) => {
    const value = DICT[lang][key];
    return typeof value === "function" ? value(...args) : value;
  };
  const formatNumber = (value) => Number(value || 0).toLocaleString(lang === "zh" ? "zh-CN" : "en-US");

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
  const requestEl = document.getElementById("lab-request");
  const errorEl = document.getElementById("lab-error");
  const sourceEl = document.getElementById("lab-source");
  const statusEl = document.getElementById("lab-status");
  const metaEl = document.getElementById("lab-meta");
  const choiceEl = document.getElementById("lab-choice");
  const contentEl = document.getElementById("lab-response-content");
  const reasoningEl = document.getElementById("lab-response-reasoning");
  const toolsEl = document.getElementById("lab-response-tools");
  const rawEl = document.getElementById("lab-response-raw");
  const runsEl = document.getElementById("lab-runs");
  const importPanel = document.getElementById("lab-import-panel");
  const toastEl = document.getElementById("lab-toast");
  const blankBtn = document.getElementById("btn-blank");
  const importBtn = document.getElementById("btn-import");
  const formatBtn = document.getElementById("btn-format");
  const runBtn = document.getElementById("btn-run");
  const stopBtn = document.getElementById("btn-stop");
  const appendBtn = document.getElementById("btn-append");
  const copyResponseBtn = document.getElementById("btn-copy-response");
  const refreshBtn = document.getElementById("btn-refresh-history");
  const tabButtons = [...document.querySelectorAll("[data-tab]")];
  const blocksEl = document.getElementById("lab-blocks");
  const modeButtons = [...document.querySelectorAll("[data-mode]")];

  // ---- 状态 ----
  let currentRun = null;
  /** 当前请求来自哪个对话消息：{ conversationId, conversationTitle, messageId } | null */
  let currentSource = null;
  let choiceIndex = 0;
  let running = null;
  let activeTab = "content";
  let runs = [];
  /** "blocks"：块编辑器里的对象是请求体；"json"：文本框里的文字是请求体 */
  let mode = "blocks";

  /** 提示条；带 action 时多一个按钮（例如删除后的「撤销」），停留久一点 */
  function toast(text, action) {
    toastEl.innerHTML = "";
    toastEl.appendChild(document.createTextNode(text));
    if (action) {
      const undo = document.createElement("button");
      undo.type = "button";
      undo.className = "toast-action";
      undo.textContent = action.label;
      undo.addEventListener("click", () => {
        toastEl.classList.add("hidden");
        action.run();
      });
      toastEl.appendChild(undo);
    }
    toastEl.classList.remove("hidden");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toastEl.classList.add("hidden"), action ? 5000 : 2200);
  }

  const editor = window.createLabBlockEditor(blocksEl, {
    t: (key, ...args) => t(key, ...args),
    onChange: () => {
      saveDraft();
      clearError();
    },
    onToast: toast,
  });

  function setStatus(text) {
    statusEl.textContent = text || "";
  }

  function setError(text) {
    errorEl.textContent = text || "";
    errorEl.title = text || "";
  }

  function clearError() {
    setError("");
  }

  /** 草稿存进 localStorage；块编辑时每次按键都会改，稍等一下再存（长请求体序列化不便宜） */
  function saveDraft() {
    clearTimeout(saveDraft._timer);
    saveDraft._timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, mode === "blocks" ? JSON.stringify(editor.getBody(), null, 2) : requestEl.value);
      } catch {
        /* localStorage 不可用时忽略 */
      }
    }, 300);
  }

  function template() {
    return {
      model: "deepseek-flash",
      messages: [
        { role: "system", content: "" },
        { role: "user", content: "" },
      ],
      reasoning_effort: "high",
      stream: false,
    };
  }

  function setRequest(body) {
    // 换了请求体，之前删除留下的「撤销」已经没有意义
    if (toastEl.querySelector(".toast-action")) toastEl.classList.add("hidden");
    if (mode === "blocks") editor.setBody(body);
    else requestEl.value = JSON.stringify(body, null, 2);
    saveDraft();
  }

  /** 解析 JSON 文本框里的请求体 */
  function parseRequestText() {
    const text = requestEl.value.trim();
    if (!text) throw new Error(t("labInvalidJson"));
    let body;
    try {
      body = JSON.parse(text);
    } catch (cause) {
      throw new Error(`${t("labInvalidJson")}: ${cause.message}`);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(t("labNotObject"));
    return body;
  }

  /** 当前请求体。块编辑时返回的就是正在编辑的对象；有标红的地方时不给 */
  function parseRequest() {
    if (mode === "json") return parseRequestText();
    const count = editor.invalidCount();
    if (count > 0) throw new Error(t("labInvalidFields", count));
    return editor.getBody();
  }

  // ---- 块 / JSON 切换 ----

  function applyMode() {
    for (const button of modeButtons) button.classList.toggle("active", button.dataset.mode === mode);
    blocksEl.classList.toggle("hidden", mode !== "blocks");
    requestEl.classList.toggle("hidden", mode !== "json");
    formatBtn.classList.toggle("hidden", mode !== "json");
  }

  function setMode(next) {
    if (next === mode) return;
    let body;
    try {
      body = parseRequest();
    } catch (cause) {
      setError(cause.message);
      toast(cause.message);
      return;
    }
    mode = next;
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* ignore */
    }
    clearError();
    setRequest(body);
    applyMode();
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
    document.title = t("labTitle");
    for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
    for (const el of document.querySelectorAll("[data-i18n-title]")) el.title = t(el.dataset.i18nTitle);
    requestEl.placeholder = t("labPaste");
    choiceEl.title = t("labChoice");
    editor.refresh();
    renderResponse();
    renderRuns();
    syncState();
  }

  // ---- 请求 ----

  function formatRequest() {
    try {
      const body = parseRequest();
      setRequest(body);
      clearError();
      toast(t("labFormatted"));
    } catch (cause) {
      setError(cause.message);
      toast(cause.message);
    }
  }

  function blank() {
    currentRun = null;
    currentSource = null;
    choiceIndex = 0;
    setRequest(template());
    clearError();
    renderResponse();
    renderRuns();
  }

  // ---- 运行 ----

  function syncState() {
    const busy = running !== null;
    runBtn.disabled = busy;
    blankBtn.disabled = busy;
    importBtn.disabled = busy;
    formatBtn.disabled = busy;
    runBtn.classList.toggle("hidden", busy);
    stopBtn.classList.toggle("hidden", !busy);
  }

  async function run() {
    if (running) return;
    let body;
    try {
      body = parseRequest();
      clearError();
    } catch (cause) {
      setError(cause.message);
      toast(cause.message);
      return;
    }

    const runId = bridge.newRunId();
    running = { runId };
    syncState();
    setStatus(t("labRunning"));
    try {
      const result = await call(
        "dialog.labRun",
        {
          body,
          sourceConversationId: currentSource ? currentSource.conversationId : null,
          sourceMessageId: currentSource ? currentSource.messageId : null,
        },
        { runId },
      );
      if (!result || !result.ok) {
        const text = result && result.error ? String(result.error.message) : "unknown error";
        setError(text);
        toast(text);
        return;
      }
      currentRun = result.result;
      choiceIndex = 0;
      renderResponse();
      renderRuns();
      await loadRuns();
    } catch (cause) {
      const text = cause && cause.message ? cause.message : String(cause);
      setError(text);
      toast(text);
    } finally {
      running = null;
      setStatus("");
      syncState();
    }
  }

  function stop() {
    if (!running) return;
    void bridge.cancel(running.runId);
    setStatus(t("labAborted"));
  }

  // ---- 响应 ----

  function responseChoices(run) {
    const response = run && run.response;
    if (!response || typeof response !== "object") return [];
    return Array.isArray(response.choices) ? response.choices : [];
  }

  function selectedMessage(run) {
    const choices = responseChoices(run);
    const choice = choices[choiceIndex] || choices[0];
    if (!choice || typeof choice !== "object") return null;
    const message = choice.message;
    return message && typeof message === "object" ? message : null;
  }

  function empty(el, text) {
    el.innerHTML = "";
    const div = document.createElement("div");
    div.className = "lab-empty";
    div.textContent = text;
    el.appendChild(div);
  }

  function renderResponse() {
    const run = currentRun;
    choiceEl.innerHTML = "";
    choiceEl.classList.add("hidden");
    if (!run) {
      empty(contentEl, t("labResponseEmpty"));
      reasoningEl.textContent = "";
      empty(toolsEl, t("labNoTools"));
      rawEl.textContent = "";
      metaEl.textContent = "";
      metaEl.title = "";
      renderTabs();
      renderSource();
      return;
    }

    const choices = responseChoices(run);
    const message = selectedMessage(run);
    const content = message && typeof message.content === "string" ? message.content : "";
    const reasoning = message && typeof message.reasoning_content === "string" ? message.reasoning_content : "";
    const toolCalls = message && Array.isArray(message.tool_calls) ? message.tool_calls : [];

    const meta = [];
    if (run.model) meta.push(run.model);
    if (run.usage) meta.push(t("labTokens", formatNumber(run.usage.promptTokens), formatNumber(run.usage.completionTokens)));
    if (typeof run.costYuan === "number") meta.push(t("labCost", run.costYuan));
    if (typeof run.durationMs === "number") meta.push(t("labDuration", run.durationMs));
    if (run.status !== "ok") meta.push(run.status === "aborted" ? t("labAborted") : t("labError"));
    metaEl.textContent = meta.join(" · ");
    metaEl.title = run.error || "";

    if (choices.length > 1) {
      choiceEl.classList.remove("hidden");
      choices.forEach((_choice, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = `choice ${index + 1}`;
        choiceEl.appendChild(option);
      });
      choiceEl.value = String(choiceIndex);
    }

    if (content) {
      contentEl.innerHTML = window.renderMarkdown(content, { copyLabel: t("labCopyCode") });
    } else {
      empty(contentEl, run.status === "ok" ? t("labNoContent") : run.error || t("labNoResponse"));
    }

    reasoningEl.textContent = reasoning || t("labNoReasoning");

    toolsEl.innerHTML = "";
    if (toolCalls.length === 0) {
      empty(toolsEl, t("labNoTools"));
    } else {
      for (const call of toolCalls) {
        const box = document.createElement("div");
        box.className = "lab-tool";
        const head = document.createElement("div");
        head.className = "lab-tool-head";
        const name = document.createElement("span");
        name.className = "lab-tool-name";
        name.textContent = (call.function && call.function.name) || "?";
        const id = document.createElement("span");
        id.textContent = call.id || "";
        head.appendChild(name);
        head.appendChild(id);
        box.appendChild(head);
        const args = document.createElement("pre");
        args.textContent = (call.function && call.function.arguments) || "";
        box.appendChild(args);
        toolsEl.appendChild(box);
      }
    }

    rawEl.textContent = JSON.stringify(run.response, null, 2);
    renderTabs();
    renderSource();
  }

  function renderTabs() {
    for (const button of tabButtons) button.classList.toggle("active", button.dataset.tab === activeTab);
    contentEl.classList.toggle("hidden", activeTab !== "content");
    reasoningEl.classList.toggle("hidden", activeTab !== "reasoning");
    toolsEl.classList.toggle("hidden", activeTab !== "tools");
    rawEl.classList.toggle("hidden", activeTab !== "raw");
  }

  function renderSource() {
    if (currentSource && currentSource.conversationTitle) {
      const preview = currentSource.messageContent
        ? currentSource.messageContent.replace(/\s+/g, " ").trim().slice(0, 20)
        : "";
      sourceEl.textContent = preview
        ? `${t("labFrom", currentSource.conversationTitle)} · ${preview}`
        : t("labFrom", currentSource.conversationTitle);
      sourceEl.title = currentSource.messageContent || currentSource.conversationTitle;
    } else if (currentSource && (currentSource.conversationId || currentSource.messageId)) {
      sourceEl.textContent = t("labFromUnknown");
      sourceEl.title = currentSource.conversationId || "";
    } else {
      sourceEl.textContent = "";
      sourceEl.title = "";
    }
  }

  function appendReply() {
    if (!currentRun) {
      toast(t("labNoReply"));
      return;
    }
    const message = selectedMessage(currentRun);
    if (!message) {
      toast(t("labNoReply"));
      return;
    }
    let body;
    try {
      body = parseRequest();
    } catch (cause) {
      setError(cause.message);
      toast(cause.message);
      return;
    }
    if (!Array.isArray(body.messages)) body.messages = [];
    // 复制一份：块编辑器直接改请求体对象，不能和运行记录里的响应共用
    body.messages.push(JSON.parse(JSON.stringify(message)));
    setRequest(body);
    clearError();
    const hasTools = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
    toast(hasTools ? t("labToolHint") : t("labAppended"));
  }

  async function copyResponse() {
    if (!currentRun) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(currentRun.response, null, 2));
      toast(t("labCopied"));
    } catch {
      /* ignore */
    }
  }

  // ---- 运行记录 ----

  async function loadRuns() {
    try {
      runs = await callOrThrow("dialog.listLabRuns", {});
      renderRuns();
    } catch (cause) {
      toast(cause.message);
    }
  }

  function renderRuns() {
    runsEl.innerHTML = "";
    if (runs.length === 0) {
      const div = document.createElement("div");
      div.className = "lab-empty";
      div.textContent = t("labEmpty");
      runsEl.appendChild(div);
      return;
    }
    for (const run of runs) {
      const item = document.createElement("div");
      item.className = "lab-run" + (currentRun && currentRun.id === run.id ? " active" : "");

      const title = document.createElement("span");
      title.className = "lab-run-title";
      title.textContent = run.title || t("labUntitled");

      const status = document.createElement("span");
      status.className = `lab-run-status ${run.status}`;
      status.textContent = run.status === "ok" ? t("labOk") : run.status === "aborted" ? t("labAborted") : t("labError");

      const meta = [];
      meta.push(new Date(run.createdAt).toLocaleString());
      if (run.model) meta.push(run.model);
      if (run.usage) meta.push(t("labTokensShort", formatNumber(run.usage.totalTokens)));
      if (typeof run.costYuan === "number") meta.push(t("labCost", run.costYuan));
      const metaEl = document.createElement("span");
      metaEl.className = "lab-run-meta";
      metaEl.textContent = meta.join(" · ");

      const actions = document.createElement("span");
      actions.className = "lab-run-actions";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.title = t("labDelete");
      remove.textContent = "✕";
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        void deleteRun(run);
      });
      actions.appendChild(remove);

      item.appendChild(title);
      item.appendChild(status);
      item.appendChild(metaEl);
      item.appendChild(actions);
      item.addEventListener("click", () => void loadRun(run.id));
      runsEl.appendChild(item);
    }
  }

  async function loadRun(id) {
    try {
      const run = await callOrThrow("dialog.getLabRun", { runId: id });
      currentRun = run;
      choiceIndex = 0;
      currentSource =
        run.sourceConversationId || run.sourceMessageId
          ? {
              conversationId: run.sourceConversationId || "",
              conversationTitle: "",
              messageId: run.sourceMessageId || "",
            }
          : null;
      setRequest(JSON.parse(JSON.stringify(run.request)));
      clearError();
      renderResponse();
      renderRuns();
    } catch (cause) {
      toast(cause.message);
    }
  }

  async function deleteRun(run) {
    if (!window.confirm(t("labConfirmDelete"))) return;
    try {
      await callOrThrow("dialog.deleteLabRun", { runId: run.id });
      if (currentRun && currentRun.id === run.id) {
        currentRun = null;
        renderResponse();
      }
      await loadRuns();
      toast(t("labDeleted"));
    } catch (cause) {
      toast(cause.message);
    }
  }

  // ---- 从对话导入 ----

  function closeImport() {
    importPanel.classList.add("hidden");
    importPanel.innerHTML = "";
  }

  async function openImport() {
    let conversations = [];
    try {
      conversations = await callOrThrow("dialog.listConversations", {});
    } catch (cause) {
      toast(cause.message);
      return;
    }

    importPanel.innerHTML = "";
    const card = document.createElement("div");
    card.className = "lab-modal-card";
    const head = document.createElement("div");
    head.className = "lab-modal-head";
    const title = document.createElement("h2");
    title.textContent = t("labImportTitle");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "link-btn";
    close.textContent = t("labClose");
    close.addEventListener("click", closeImport);
    head.appendChild(title);
    head.appendChild(close);
    card.appendChild(head);

    if (conversations.length === 0) {
      const emptyEl = document.createElement("div");
      emptyEl.className = "lab-empty";
      emptyEl.textContent = t("labNoConversations");
      card.appendChild(emptyEl);
    } else {
      for (const conversation of conversations) {
        const item = document.createElement("div");
        item.className = "lab-import-item";
        const name = document.createElement("span");
        name.className = "lab-import-title";
        name.textContent = conversation.title || t("labUntitledConversation");
        const meta = document.createElement("span");
        meta.className = "lab-import-meta";
        meta.textContent = new Date(conversation.updatedAt).toLocaleString();
        item.appendChild(name);
        item.appendChild(meta);
        item.addEventListener("click", () => void importConversation(conversation));
        card.appendChild(item);
      }
    }

    importPanel.appendChild(card);
    importPanel.classList.remove("hidden");
  }

  async function importConversation(conversation) {
    closeImport();
    try {
      const path = await callOrThrow("dialog.getPath", { conversationId: conversation.id, limit: 1000 });
      const messages = path.messages || [];
      const userMessage = [...messages].reverse().find((message) => message.role === "user");
      if (!userMessage) {
        toast(t("labNoUserMessage"));
        return;
      }
      const request = await callOrThrow("dialog.getRequest", {
        conversationId: conversation.id,
        messageId: userMessage.id,
      });
      currentSource = request.source;
      currentRun = null;
      choiceIndex = 0;
      setRequest(request.body);
      clearError();
      renderResponse();
      renderRuns();
      toast(t("labImported"));
    } catch (cause) {
      toast(`${t("labImportFailed")}: ${cause.message}`);
    }
  }

  // ---- 事件 ----

  requestEl.addEventListener("input", () => {
    saveDraft();
    clearError();
  });

  blankBtn.addEventListener("click", blank);
  importBtn.addEventListener("click", () => void openImport());
  formatBtn.addEventListener("click", formatRequest);
  for (const button of modeButtons) button.addEventListener("click", () => setMode(button.dataset.mode));
  runBtn.addEventListener("click", () => void run());
  stopBtn.addEventListener("click", stop);
  appendBtn.addEventListener("click", appendReply);
  copyResponseBtn.addEventListener("click", () => void copyResponse());
  refreshBtn.addEventListener("click", () => void loadRuns());

  choiceEl.addEventListener("change", () => {
    choiceIndex = Number(choiceEl.value) || 0;
    renderResponse();
  });

  for (const button of tabButtons) {
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab;
      renderTabs();
    });
  }

  contentEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const copy = target.closest(".code-copy");
    if (copy) {
      const block = copy.closest(".codeblock");
      const code = block ? block.querySelector("pre code") : null;
      if (code) void navigator.clipboard.writeText(code.textContent || "").then(() => toast(t("labCopied")));
      return;
    }
    const link = target.closest("a[data-external]");
    if (link) {
      event.preventDefault();
      const href = link.getAttribute("href") || "";
      if (typeof bridge.openExternal === "function") void bridge.openExternal(href);
    }
  });

  importPanel.addEventListener("click", (event) => {
    if (event.target === importPanel) closeImport();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeImport();
  });

  // ---- 启动 ----

  async function init() {
    let saved = null;
    try {
      saved = localStorage.getItem(DRAFT_KEY);
      mode = localStorage.getItem(MODE_KEY) === "json" ? "json" : "blocks";
    } catch {
      /* ignore */
    }
    let body = template();
    if (saved) {
      try {
        requestEl.value = saved;
        body = parseRequestText();
      } catch {
        // 上次留下的草稿不是合法的 JSON 对象：照原样留在 JSON 文本框里
        mode = "json";
        body = null;
      }
    }
    if (body) setRequest(body);
    applyMode();
    await initLanguage();
    renderResponse();
    await loadRuns();
  }

  void init();
})();
