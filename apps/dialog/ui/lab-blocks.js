/* 实验室的块编辑器（DIALOG-0021）：把请求体显示成一块一块的，编辑的始终是同一个请求体对象。
   认得的结构（参数、消息、工具、工具调用）用表单；认不得的字段和不合常规的形状退回 JSON 文本框，
   任何字段、任何块也都可以切到 JSON 编辑——所以请求体里的一切仍然都能改。 */
(() => {
  "use strict";

  const ROLES = ["system", "user", "assistant", "tool"];
  const PARAM_KEYS = [
    "model",
    "reasoning_effort",
    "temperature",
    "top_p",
    "max_tokens",
    "stop",
    "tool_choice",
    "response_format",
    "frequency_penalty",
    "presence_penalty",
    "logprobs",
    "top_logprobs",
    "n",
    "user_id",
    "stream",
  ];
  /** 字符串参数的候选值（输入框下拉提示，仍可随便填） */
  const VALUE_SUGGESTIONS = {
    model: ["deepseek-flash", "deepseek-v4-pro"],
    reasoning_effort: ["none", "low", "high", "max"],
    tool_choice: ["auto", "none", "required"],
  };
  const MESSAGE_KEYS = ["role", "content", "reasoning_content", "tool_calls", "tool_call_id", "name"];

  let datalistSeq = 0;

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(text, title, onClick, className = "lab-icon") {
    const node = el("button", className, text);
    node.type = "button";
    if (title) node.title = title;
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
    return node;
  }

  function onlyKeys(value, allowed) {
    return Object.keys(value).every((key) => allowed.includes(key));
  }

  /** 工具调用是否是常规形状 { id, type, function: { name, arguments } } */
  function isPlainToolCall(call) {
    return (
      isObject(call) &&
      onlyKeys(call, ["id", "type", "function"]) &&
      (call.id === undefined || typeof call.id === "string") &&
      (call.type === undefined || typeof call.type === "string") &&
      isObject(call.function) &&
      onlyKeys(call.function, ["name", "arguments"]) &&
      typeof call.function.name === "string" &&
      typeof call.function.arguments === "string"
    );
  }

  /** 工具定义是否是常规形状 { type, function: { name, description, parameters } } */
  function isPlainTool(tool) {
    return (
      isObject(tool) &&
      onlyKeys(tool, ["type", "function"]) &&
      (tool.type === undefined || typeof tool.type === "string") &&
      isObject(tool.function) &&
      onlyKeys(tool.function, ["name", "description", "parameters"]) &&
      typeof tool.function.name === "string" &&
      (tool.function.description === undefined || typeof tool.function.description === "string")
    );
  }

  function preview(text, max = 80) {
    return String(text).replace(/\s+/g, " ").trim().slice(0, max);
  }

  function newCallId() {
    return `call_${Math.random().toString(36).slice(2, 10)}`;
  }

  /** 新加 tool 消息时预填的 tool_call_id：往前找最近一条带 tool_calls 的 assistant，取第一个还没有结果的调用 */
  function pendingToolCallId(list, index) {
    const answered = new Set();
    for (let i = index - 1; i >= 0; i -= 1) {
      const message = list[i];
      if (!isObject(message)) continue;
      if (message.role === "tool" && typeof message.tool_call_id === "string") answered.add(message.tool_call_id);
      if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
        const pending = message.tool_calls.find((call) => isObject(call) && typeof call.id === "string" && !answered.has(call.id));
        return pending ? pending.id : "";
      }
    }
    return "";
  }

  function newMessage(role, list, index) {
    if (role === "tool") return { role, tool_call_id: pendingToolCallId(list, index), content: "" };
    return { role, content: "" };
  }

  function newTool() {
    return {
      type: "function",
      function: { name: "", description: "", parameters: { type: "object", properties: {}, required: [] } },
    };
  }

  /**
   * @param {HTMLElement} root 渲染容器（自己滚动）
   * @param {{ t: (key: string, ...args: unknown[]) => string, onChange: () => void, onToast: (text: string, action?: { label: string, run: () => void }) => void }} options
   */
  function createLabBlockEditor(root, { t, onChange, onToast }) {
    let body = {};
    /** 正写着无效 JSON 的文本框 */
    const invalid = new Set();
    /** 整块以 JSON 编辑的消息 / 工具 */
    const jsonBlocks = new WeakSet();
    /** 以 JSON 编辑的字段：对象 → 字段名集合 */
    const jsonFields = new WeakMap();
    const collapsed = new WeakSet();

    function changed() {
      onChange();
    }

    function isJsonField(owner, key) {
      const keys = jsonFields.get(owner);
      return !!keys && keys.has(key);
    }

    function setJsonField(owner, key, on) {
      let keys = jsonFields.get(owner);
      if (!keys) {
        keys = new Set();
        jsonFields.set(owner, keys);
      }
      if (on) keys.add(key);
      else keys.delete(key);
    }

    // ---- 基本输入 ----

    function markValidity(node, error) {
      if (error) {
        invalid.add(node);
        node.classList.add("invalid");
        node.title = error;
      } else {
        invalid.delete(node);
        node.classList.remove("invalid");
        node.title = "";
      }
    }

    function textArea(value, { mono = false, big = false, placeholder = "" } = {}, onInput) {
      const node = el("textarea", `lab-text${mono ? " mono" : ""}${big ? " big" : ""}`);
      node.value = value;
      node.rows = 1;
      node.spellcheck = false;
      if (placeholder) node.placeholder = placeholder;
      node.addEventListener("input", () => onInput(node.value));
      return node;
    }

    /** JSON 文本框：解析成功才写回；解析失败标红，运行前会被拦下 */
    function jsonArea(value, onValid) {
      const node = textArea(value === undefined ? "" : JSON.stringify(value, null, 2), { mono: true }, (text) => {
        try {
          const parsed = JSON.parse(text);
          markValidity(node, null);
          onValid(parsed);
        } catch (cause) {
          markValidity(node, `${t("labInvalidJson")}: ${cause.message}`);
        }
      });
      return node;
    }

    function lineInput(value, onInput, suggestions) {
      const node = el("input", "lab-line");
      node.type = "text";
      node.value = value;
      node.spellcheck = false;
      node.addEventListener("input", () => onInput(node.value));
      if (suggestions && suggestions.length > 0) {
        const list = el("datalist");
        list.id = `lab-suggest-${(datalistSeq += 1)}`;
        for (const option of suggestions) {
          const item = el("option");
          item.value = option;
          list.appendChild(item);
        }
        node.setAttribute("list", list.id);
        const wrap = el("span", "lab-line-wrap");
        wrap.appendChild(node);
        wrap.appendChild(list);
        return wrap;
      }
      return node;
    }

    /** 一个字段的值编辑器：字符串 / 数字 / 布尔用表单，其余（或切到 JSON 时）用 JSON 文本框 */
    function valueEditor(owner, key, { big = false, mono = false } = {}) {
      const value = owner[key];
      const write = (next) => {
        owner[key] = next;
        changed();
      };
      if (isJsonField(owner, key) || !["string", "number", "boolean"].includes(typeof value)) {
        return jsonArea(value, write);
      }
      if (typeof value === "boolean") {
        const select = el("select", "lab-line");
        for (const option of ["true", "false"]) {
          const item = el("option", "", option);
          item.value = option;
          select.appendChild(item);
        }
        select.value = String(value);
        select.addEventListener("change", () => write(select.value === "true"));
        return select;
      }
      if (typeof value === "number") {
        const wrap = lineInput(String(value), (text) => {
          const number = Number(text);
          const input = wrap instanceof HTMLInputElement ? wrap : wrap.querySelector("input");
          if (text.trim() === "" || !Number.isFinite(number)) {
            markValidity(input, t("labNotNumber"));
            return;
          }
          markValidity(input, null);
          write(number);
        });
        return wrap;
      }
      if (big || value.includes("\n") || value.length > 60) {
        return textArea(value, { big, mono }, write);
      }
      return lineInput(value, write, VALUE_SUGGESTIONS[key]);
    }

    /** 字段行：标签 + 值编辑器 +「JSON」切换 + 删除 */
    function fieldRow(owner, key, { label, big = false, mono = false, inline = false } = {}) {
      const row = el("div", `lab-field${inline ? " inline" : ""}`);
      const head = el("div", "lab-field-head");
      const name = el("span", "lab-field-key", label || key);
      name.title = key;
      if (label && label !== key) {
        const raw = el("code", "lab-field-raw", key);
        name.appendChild(raw);
      }
      head.appendChild(name);
      const actions = el("span", "lab-field-actions");
      const scalar = ["string", "number", "boolean"].includes(typeof owner[key]);
      if (big && typeof owner[key] !== "string") {
        // 例如带 tool_calls 的 assistant 的 content 是 null：一键改回文本
        actions.appendChild(
          button(t("labToText"), "", () => {
            owner[key] = "";
            setJsonField(owner, key, false);
            render();
            changed();
          }),
        );
      }
      if (scalar || isJsonField(owner, key)) {
        actions.appendChild(
          button(isJsonField(owner, key) ? t("labFormShort") : "{ }", isJsonField(owner, key) ? t("labEditForm") : t("labEditJson"), () => {
            setJsonField(owner, key, !isJsonField(owner, key));
            render();
          }),
        );
      }
      actions.appendChild(
        button("✕", t("labDelete"), () => {
          const before = owner[key];
          delete owner[key];
          render();
          changed();
          deletedToast(() => {
            owner[key] = before;
          });
        }),
      );
      head.appendChild(actions);
      row.appendChild(head);
      row.appendChild(valueEditor(owner, key, { big, mono }));
      return row;
    }

    /** 「添加字段」：字段名 + 值；值按 JSON 解析，解析不了就当文本 */
    function addFieldForm(owner, suggestions, onDone) {
      const form = el("div", "lab-add-field");
      const keyWrap = lineInput("", () => {}, suggestions);
      const keyInput = keyWrap instanceof HTMLInputElement ? keyWrap : keyWrap.querySelector("input");
      keyInput.placeholder = t("labFieldKey");
      const valueInput = el("input", "lab-line");
      valueInput.type = "text";
      valueInput.spellcheck = false;
      valueInput.placeholder = t("labFieldValue");
      const add = () => {
        const key = keyInput.value.trim();
        if (!key) {
          onToast(t("labFieldKeyEmpty"));
          return;
        }
        if (Object.prototype.hasOwnProperty.call(owner, key)) {
          onToast(t("labFieldExists"));
          return;
        }
        const text = valueInput.value;
        let value = text;
        try {
          value = JSON.parse(text);
        } catch {
          /* 不是 JSON 就当文本 */
        }
        owner[key] = value;
        if (onDone) onDone();
        render();
        changed();
      };
      for (const input of [keyInput, valueInput]) {
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add();
          }
        });
      }
      form.appendChild(keyWrap);
      form.appendChild(valueInput);
      form.appendChild(button(t("labAdd"), "", add, "link-btn"));
      return form;
    }

    function deletedToast(restore) {
      const owner = body;
      onToast(t("labDeleted"), {
        label: t("labUndo"),
        run: () => {
          if (body !== owner) return;
          restore();
          render();
          changed();
        },
      });
    }

    // ---- 块（消息 / 工具）的公共部分 ----

    function blockActions(list, index, { allowJson = true } = {}) {
      const item = list[index];
      const actions = el("span", "lab-block-actions");
      actions.appendChild(
        button("↑", t("labMoveUp"), () => {
          if (index === 0) return;
          [list[index - 1], list[index]] = [list[index], list[index - 1]];
          render();
          changed();
        }),
      );
      actions.appendChild(
        button("↓", t("labMoveDown"), () => {
          if (index >= list.length - 1) return;
          [list[index + 1], list[index]] = [list[index], list[index + 1]];
          render();
          changed();
        }),
      );
      actions.appendChild(
        button("⧉", t("labDuplicate"), () => {
          list.splice(index + 1, 0, clone(item));
          render();
          changed();
        }),
      );
      if (allowJson && isObject(item)) {
        const asJson = jsonBlocks.has(item);
        actions.appendChild(
          button(asJson ? t("labFormShort") : "{ }", asJson ? t("labEditForm") : t("labEditJson"), () => {
            if (asJson) jsonBlocks.delete(item);
            else jsonBlocks.add(item);
            render();
          }),
        );
      }
      if (isObject(item)) {
        const folded = collapsed.has(item);
        actions.appendChild(
          button(folded ? "▶" : "▼", folded ? t("labExpand") : t("labCollapse"), () => {
            if (folded) collapsed.delete(item);
            else collapsed.add(item);
            render();
          }, "lab-icon lab-fold"),
        );
      }
      actions.appendChild(
        button("✕", t("labDelete"), () => {
          const [removed] = list.splice(index, 1);
          render();
          changed();
          deletedToast(() => list.splice(Math.min(index, list.length), 0, removed));
        }),
      );
      return actions;
    }

    /** 整块以 JSON 编辑（形状不常规时只能这样） */
    function jsonBlockBody(list, index) {
      return jsonArea(list[index], (parsed) => {
        const wasJson = isObject(list[index]) && jsonBlocks.has(list[index]);
        list[index] = parsed;
        if (wasJson && isObject(parsed)) jsonBlocks.add(parsed);
        changed();
      });
    }

    function sectionEl(title, count, extra) {
      const section = el("section", "lab-section");
      const head = el("div", "lab-section-head");
      head.appendChild(el("span", "lab-section-title", title));
      if (count !== undefined) head.appendChild(el("span", "lab-section-count", String(count)));
      head.appendChild(el("span", "spacer"));
      if (extra) for (const node of extra) head.appendChild(node);
      section.appendChild(head);
      return section;
    }

    // ---- 参数 ----

    function renderParams() {
      const section = sectionEl(t("labParams"));
      const box = el("div", "lab-block lab-params");
      const keys = Object.keys(body).filter((key) => !((key === "messages" || key === "tools") && Array.isArray(body[key])));
      if (keys.length === 0) box.appendChild(el("div", "lab-empty", t("labNoParams")));
      for (const key of keys) box.appendChild(fieldRow(body, key, { inline: true }));
      box.appendChild(addFieldForm(body, PARAM_KEYS.filter((key) => !(key in body))));
      section.appendChild(box);
      return section;
    }

    // ---- 消息 ----

    function inserter(list, index) {
      const line = el("div", "lab-insert");
      line.appendChild(el("span", "lab-insert-label", t("labInsert")));
      for (const role of ROLES) {
        line.appendChild(
          button(`+ ${role}`, "", () => {
            list.splice(index, 0, newMessage(role, list, index));
            render();
            changed();
          }, "link-btn"),
        );
      }
      return line;
    }

    function messageCard(list, index) {
      const message = list[index];
      const card = el("div", "lab-block lab-msg");
      const head = el("div", "lab-block-head");
      head.appendChild(el("span", "lab-block-index", `#${index + 1}`));

      const formable = isObject(message) && !jsonBlocks.has(message) && (message.role === undefined || typeof message.role === "string");
      if (!formable) {
        card.classList.add("as-json");
        if (isObject(message) && typeof message.role === "string") card.dataset.role = message.role;
        head.appendChild(el("span", "lab-block-kind", "JSON"));
        head.appendChild(el("span", "spacer"));
        head.appendChild(blockActions(list, index));
        card.appendChild(head);
        if (!(isObject(message) && collapsed.has(message))) card.appendChild(jsonBlockBody(list, index));
        return card;
      }

      card.dataset.role = message.role || "";
      const role = el("select", "lab-role");
      const roles = ROLES.includes(message.role) || message.role === undefined ? ROLES : [...ROLES, message.role];
      if (message.role === undefined) {
        const none = el("option", "", t("labNoRole"));
        none.value = "";
        role.appendChild(none);
      }
      for (const option of roles) {
        const item = el("option", "", option);
        item.value = option;
        role.appendChild(item);
      }
      role.value = message.role || "";
      role.addEventListener("change", () => {
        if (role.value) message.role = role.value;
        else delete message.role;
        render();
        changed();
      });
      head.appendChild(role);

      const folded = collapsed.has(message);
      if (folded) {
        const summary =
          typeof message.content === "string" && message.content.trim()
            ? preview(message.content)
            : Array.isArray(message.tool_calls)
              ? t("labCallsCount", message.tool_calls.length)
              : "";
        head.appendChild(el("span", "lab-block-preview", summary));
      }
      head.appendChild(el("span", "spacer"));
      head.appendChild(blockActions(list, index));
      card.appendChild(head);
      if (folded) return card;

      const fields = el("div", "lab-block-body");
      if ("content" in message) fields.appendChild(fieldRow(message, "content", { label: t("labContentLabel"), big: true }));
      if ("reasoning_content" in message) {
        fields.appendChild(fieldRow(message, "reasoning_content", { label: t("labReasoningLabel"), big: true }));
      }
      if ("tool_calls" in message) fields.appendChild(toolCallsField(message));
      if ("tool_call_id" in message) fields.appendChild(fieldRow(message, "tool_call_id", { label: t("labToolCallIdLabel"), inline: true }));
      if ("name" in message) fields.appendChild(fieldRow(message, "name", { inline: true }));
      for (const key of Object.keys(message)) {
        if (!MESSAGE_KEYS.includes(key)) fields.appendChild(fieldRow(message, key, { inline: true }));
      }

      const more = el("div", "lab-block-more");
      if (!("content" in message)) {
        more.appendChild(button(`+ ${t("labContentLabel")}`, "", () => addKey(message, "content", ""), "link-btn"));
      }
      if (message.role === "assistant" && !("reasoning_content" in message)) {
        more.appendChild(button(`+ ${t("labReasoningLabel")}`, "", () => addKey(message, "reasoning_content", ""), "link-btn"));
      }
      if (message.role === "assistant" && !("tool_calls" in message)) {
        more.appendChild(
          button(`+ ${t("labToolCallsLabel")}`, "", () => addKey(message, "tool_calls", [newToolCall()]), "link-btn"),
        );
      }
      if (message.role === "tool" && !("tool_call_id" in message)) {
        more.appendChild(
          button(`+ ${t("labToolCallIdLabel")}`, "", () => addKey(message, "tool_call_id", pendingToolCallId(list, index)), "link-btn"),
        );
      }
      more.appendChild(fieldAdder(message, MESSAGE_KEYS.filter((key) => !(key in message))));
      fields.appendChild(more);
      card.appendChild(fields);
      return card;
    }

    function addKey(owner, key, value) {
      owner[key] = value;
      render();
      changed();
    }

    /** 「+ 字段」：点开才显示添加表单，平时不占地方 */
    function fieldAdder(owner, suggestions) {
      const wrap = el("span", "lab-field-adder");
      const open = button(`+ ${t("labAddField")}`, "", () => {
        open.classList.add("hidden");
        const form = addFieldForm(owner, suggestions);
        wrap.appendChild(form);
        const first = form.querySelector("input");
        if (first) first.focus();
      }, "link-btn");
      wrap.appendChild(open);
      return wrap;
    }

    function newToolCall() {
      return { id: newCallId(), type: "function", function: { name: "", arguments: "{}" } };
    }

    /** assistant 的 tool_calls：常规形状逐个编辑，否则整个字段用 JSON */
    function toolCallsField(message) {
      const calls = message.tool_calls;
      if (!Array.isArray(calls) || !calls.every(isPlainToolCall) || isJsonField(message, "tool_calls")) {
        return fieldRow(message, "tool_calls", { label: t("labToolCallsLabel") });
      }
      const row = el("div", "lab-field");
      const head = el("div", "lab-field-head");
      const name = el("span", "lab-field-key", t("labToolCallsLabel"));
      name.appendChild(el("code", "lab-field-raw", "tool_calls"));
      head.appendChild(name);
      const actions = el("span", "lab-field-actions");
      actions.appendChild(
        button("{ }", t("labEditJson"), () => {
          setJsonField(message, "tool_calls", true);
          render();
        }),
      );
      actions.appendChild(
        button("✕", t("labDelete"), () => {
          const before = message.tool_calls;
          delete message.tool_calls;
          render();
          changed();
          deletedToast(() => {
            message.tool_calls = before;
          });
        }),
      );
      head.appendChild(actions);
      row.appendChild(head);

      calls.forEach((call, index) => {
        const box = el("div", "lab-call");
        const top = el("div", "lab-call-head");
        const fn = lineInput(call.function.name, (text) => {
          call.function.name = text;
          changed();
        });
        const fnInput = fn instanceof HTMLInputElement ? fn : fn.querySelector("input");
        fnInput.placeholder = t("labCallName");
        fnInput.classList.add("lab-call-name");
        const id = lineInput(call.id || "", (text) => {
          call.id = text;
          changed();
        });
        const idInput = id instanceof HTMLInputElement ? id : id.querySelector("input");
        idInput.placeholder = "id";
        idInput.classList.add("lab-call-id");
        top.appendChild(fn);
        top.appendChild(id);
        top.appendChild(
          button("✕", t("labDelete"), () => {
            const [removed] = calls.splice(index, 1);
            render();
            changed();
            deletedToast(() => calls.splice(Math.min(index, calls.length), 0, removed));
          }),
        );
        box.appendChild(top);
        box.appendChild(
          textArea(call.function.arguments, { mono: true, placeholder: t("labCallArgs") }, (text) => {
            call.function.arguments = text;
            changed();
          }),
        );
        row.appendChild(box);
      });
      row.appendChild(
        button(`+ ${t("labAddToolCall")}`, "", () => {
          calls.push(newToolCall());
          render();
          changed();
        }, "link-btn"),
      );
      return row;
    }

    function renderMessages() {
      const list = body.messages;
      if (!Array.isArray(list)) {
        const section = sectionEl(t("labMessages"));
        if (!("messages" in body)) {
          section.appendChild(button(`+ ${t("labAddMessages")}`, "", () => addKey(body, "messages", []), "link-btn"));
        }
        return section;
      }
      const objects = list.filter(isObject);
      const allFolded = objects.length > 0 && objects.every((message) => collapsed.has(message));
      const toggleAll = button(allFolded ? t("labExpandAll") : t("labCollapseAll"), "", () => {
        for (const message of objects) {
          if (allFolded) collapsed.delete(message);
          else collapsed.add(message);
        }
        render();
      }, "link-btn");
      const section = sectionEl(t("labMessages"), list.length, objects.length > 0 ? [toggleAll] : []);
      if (list.length === 0) section.appendChild(el("div", "lab-empty", t("labNoMessagesYet")));
      list.forEach((_message, index) => {
        section.appendChild(inserter(list, index));
        section.appendChild(messageCard(list, index));
      });
      const add = el("div", "lab-add-row");
      for (const role of ROLES) {
        add.appendChild(
          button(`+ ${role}`, "", () => {
            list.push(newMessage(role, list, list.length));
            render();
            changed();
          }, "link-btn"),
        );
      }
      section.appendChild(add);
      return section;
    }

    // ---- 工具 ----

    function toolCard(list, index) {
      const tool = list[index];
      const card = el("div", "lab-block lab-tool-def");
      const head = el("div", "lab-block-head");
      head.appendChild(el("span", "lab-block-index", `#${index + 1}`));
      const formable = isPlainTool(tool) && !jsonBlocks.has(tool);
      const title = isObject(tool) && isObject(tool.function) && typeof tool.function.name === "string" ? tool.function.name : "";
      head.appendChild(el("span", "lab-block-title", title || (formable ? t("labUnnamedTool") : "JSON")));
      head.appendChild(el("span", "spacer"));
      head.appendChild(blockActions(list, index));
      card.appendChild(head);
      if (isObject(tool) && collapsed.has(tool)) return card;
      if (!formable) {
        card.classList.add("as-json");
        card.appendChild(jsonBlockBody(list, index));
        return card;
      }
      const fields = el("div", "lab-block-body");
      const fn = tool.function;
      const nameRow = el("div", "lab-field inline");
      const nameHead = el("div", "lab-field-head");
      nameHead.appendChild(el("span", "lab-field-key", t("labToolName")));
      nameRow.appendChild(nameHead);
      nameRow.appendChild(
        lineInput(fn.name, (text) => {
          fn.name = text;
          changed();
          const titleEl = card.querySelector(".lab-block-title");
          if (titleEl) titleEl.textContent = text || t("labUnnamedTool");
        }),
      );
      fields.appendChild(nameRow);
      if ("description" in fn) fields.appendChild(fieldRow(fn, "description", { label: t("labToolDescription"), big: true }));
      else fields.appendChild(button(`+ ${t("labToolDescription")}`, "", () => addKey(fn, "description", ""), "link-btn"));
      if ("parameters" in fn) fields.appendChild(fieldRow(fn, "parameters", { label: t("labToolParameters") }));
      else fields.appendChild(button(`+ ${t("labToolParameters")}`, "", () => addKey(fn, "parameters", { type: "object", properties: {} }), "link-btn"));
      card.appendChild(fields);
      return card;
    }

    function renderTools() {
      const list = body.tools;
      if (!Array.isArray(list)) {
        const section = sectionEl(t("labTools"));
        if (!("tools" in body)) {
          section.appendChild(button(`+ ${t("labAddTool")}`, "", () => addKey(body, "tools", [newTool()]), "link-btn"));
        }
        return section;
      }
      const objects = list.filter(isObject);
      const allFolded = objects.length > 0 && objects.every((tool) => collapsed.has(tool));
      const toggleAll = button(allFolded ? t("labExpandAll") : t("labCollapseAll"), "", () => {
        for (const tool of objects) {
          if (allFolded) collapsed.delete(tool);
          else collapsed.add(tool);
        }
        render();
      }, "link-btn");
      const section = sectionEl(t("labTools"), list.length, objects.length > 0 ? [toggleAll] : []);
      if (list.length === 0) section.appendChild(el("div", "lab-empty", t("labNoToolsYet")));
      list.forEach((_tool, index) => section.appendChild(toolCard(list, index)));
      section.appendChild(
        button(`+ ${t("labAddTool")}`, "", () => {
          list.push(newTool());
          render();
          changed();
        }, "link-btn lab-add-row"),
      );
      return section;
    }

    // ---- 整体 ----

    function render() {
      const top = root.scrollTop;
      invalid.clear();
      root.innerHTML = "";
      root.appendChild(renderParams());
      root.appendChild(renderMessages());
      root.appendChild(renderTools());
      root.scrollTop = top;
    }

    return {
      /** 换一个请求体（导入、载入运行记录、从 JSON 切回来时） */
      setBody(next) {
        body = next;
        root.scrollTop = 0;
        render();
      },
      /** 当前请求体（就是正在编辑的那个对象） */
      getBody() {
        return body;
      },
      /** 写着无效 JSON / 数字的地方有几处；有的话不能运行 */
      invalidCount() {
        return invalid.size;
      },
      /** 重新渲染（例如换了界面语言） */
      refresh() {
        render();
      },
    };
  }

  window.createLabBlockEditor = createLabBlockEditor;
})();
