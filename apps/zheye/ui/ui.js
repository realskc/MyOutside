/* 哲野 · 试验台（ZHEYE-0020、ZHEYE-0021）
   - 流程与提示词：当前配方（或某次试跑当时的配方快照）的流程图与各环节提示词；
   - 试跑：开始一次试跑，看完整轨迹（发给模型的提示词、思维链、工具调用）与草稿的每一版，可以停止；
   - 对比：两次试跑的文章与配方差异。 */
(() => {
  "use strict";

  const TYPE_LABELS = { concept: "概念", assertion: "断言", entity: "实体" };
  const STATUS_LABELS = {
    running: "进行中",
    done: "完成",
    stopped: "已停止",
    error: "出错",
    interrupted: "已中断",
  };
  const STATUS_HINTS = { interrupted: "MyOutside 关闭时还没跑完" };
  const TOOL_LABELS = { web_search: "搜索", web_fetch: "阅读", read_doc: "读取", edit_doc: "修改", write_doc: "重写" };
  const POLL_MS = 1500;
  const LIST_POLL_MS = 4000;
  const SAMPLE_VARS = {
    讲解对象: "（讲解对象）",
    今天: "（今天的日期）",
    前置回答: "（试验台暂不询问作者：所有前置都按「正文带过」处理）",
  };

  // ———————————————————— 工具 ————————————————————

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "html") node.innerHTML = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  async function api(name, payload, options) {
    const res = await window.outside.call(name, payload ?? {}, options);
    if (!res.ok) throw Object.assign(new Error(res.error.message), { code: res.error.code });
    return res.result;
  }

  let toastTimer = null;
  function toast(text) {
    const node = document.getElementById("toast");
    node.textContent = text;
    node.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.add("hidden"), 3200);
  }

  const yuan = (value) => `¥${(value || 0).toFixed(value >= 1 ? 2 : 3)}`;
  const tokens = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(n || 0));

  function duration(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s} 秒`;
    const m = Math.floor(s / 60);
    return m < 60 ? `${m} 分 ${s % 60} 秒` : `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
  }

  function when(ts) {
    const date = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    const today = new Date();
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return date.toDateString() === today.toDateString() ? time : `${date.getMonth() + 1}/${date.getDate()} ${time}`;
  }

  function md(text, cls) {
    return el("div", { class: `md ${cls || ""}`, html: window.renderMarkdown(text || "", { copyLabel: "复制" }) });
  }

  function details(summary, body, open) {
    const node = el("details", { class: "fold", open: Boolean(open) }, el("summary", {}, summary));
    // 内容第一次展开时才生成（长提示词、长网页结果不拖慢页面）
    let filled = false;
    const fill = () => {
      if (filled) return;
      filled = true;
      node.append(typeof body === "function" ? body() : body);
    };
    if (open) fill();
    else node.addEventListener("toggle", fill, { once: true });
    return node;
  }

  function pre(text, cls) {
    return el("pre", { class: `pre ${cls || ""}` }, text);
  }

  /** 按行对比，未变的长段落折叠成「… n 行相同 …」 */
  function diffView(before, after, context = 2) {
    const lines = window.diffLines(before, after);
    const box = el("div", { class: "diff" });
    const changed = lines.map((line) => line.op !== "same");
    const near = (index) => {
      for (let k = Math.max(0, index - context); k <= Math.min(lines.length - 1, index + context); k += 1) {
        if (changed[k]) return true;
      }
      return false;
    };
    let skipped = 0;
    const flush = () => {
      if (skipped > 0) box.append(el("div", { class: "diff-skip" }, `… ${skipped} 行相同 …`));
      skipped = 0;
    };
    lines.forEach((line, index) => {
      if (line.op === "same" && !near(index)) {
        skipped += 1;
        return;
      }
      flush();
      box.append(el("div", { class: `diff-line diff-${line.op}` }, (line.op === "add" ? "+ " : line.op === "del" ? "- " : "  ") + line.text));
    });
    flush();
    if (!changed.some(Boolean)) box.append(el("div", { class: "diff-skip" }, "没有变化"));
    return box;
  }

  async function openRecipeFile(path) {
    if (typeof window.outside.openAppFile !== "function") {
      toast(`这里打不开文件，请在编辑器里打开：apps/zheye/recipes/${path}`);
      return;
    }
    const res = await window.outside.openAppFile(`recipes/${path}`);
    if (!res || !res.ok) toast(`打不开：${(res && res.error) || "未知原因"}`);
  }

  // ———————————————————— 配方的渲染（与后端 renderPrompt 一致，变量用示例值） ————————————————————

  const INCLUDE = /\{\{\s*引入\s+([^}\s]+)\s*\}\}/g;
  const VARIABLE = /\{\{\s*([^}\s]+)\s*\}\}/g;
  const COMMENT = /<!--[\s\S]*?-->/g;

  function filesOf(recipe) {
    return new Map(recipe.files.map((file) => [file.path, file.content]));
  }

  /** 一个文件用到的全部文件（含被引入的），按出现顺序 */
  function filesUsedBy(recipe, paths) {
    const files = filesOf(recipe);
    const out = [];
    const visit = (path) => {
      if (out.includes(path) || !files.has(path)) return;
      out.push(path);
      for (const match of files.get(path).replace(COMMENT, "").matchAll(INCLUDE)) visit(match[1]);
    };
    paths.forEach(visit);
    return out;
  }

  function renderRecipePrompt(recipe, path, vars) {
    const files = filesOf(recipe);
    const expand = (rel, stack) => {
      if (stack.includes(rel)) return `【循环引入：${rel}】`;
      const content = files.get(rel);
      if (content === undefined) return `【找不到：${rel}】`;
      return content.replace(COMMENT, "").replace(INCLUDE, (_m, target) => expand(target, [...stack, rel]).trim());
    };
    return expand(path, [])
      .replace(VARIABLE, (match, name) => (name in vars ? vars[name] : match))
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function sampleVars(recipe, stage) {
    return {
      ...SAMPLE_VARS,
      类型: TYPE_LABELS[recipe.type] || recipe.type,
      流程: recipe.stages.map((item) => item.name).join(" → "),
      这一步: stage ? stage.name : "（这一步）",
      草稿: recipe.docs.map((name) => `「${name}」`).join("、"),
    };
  }

  // ———————————————————— 状态 ————————————————————

  const state = {
    view: "flow",
    /** 流程页：当前配方，或某次试跑的配方快照 */
    flow: { type: "concept", recipe: null, error: null, available: [], snapshotOf: null, selected: "__system" },
    runs: [],
    /** 正在看的试跑 */
    run: null,
    events: [],
    lastSeq: 0,
    docView: { name: null, version: null, mode: "render" },
    /** 本页发起的试跑：runId → { outsideRunId, live } */
    mine: new Map(),
    compare: null,
  };

  // ———————————————————— 侧栏：试跑记录 ————————————————————

  function statusChip(status) {
    return el("span", { class: `chip chip-${status}`, title: STATUS_HINTS[status] }, STATUS_LABELS[status] || status);
  }

  function renderRunList() {
    const list = document.getElementById("run-list");
    list.replaceChildren();
    if (state.runs.length === 0) {
      list.append(el("div", { class: "muted small empty" }, "还没有试跑。"));
      return;
    }
    for (const run of state.runs) {
      const selected = state.view !== "flow" && state.run && state.run.id === run.id;
      list.append(
        el(
          "button",
          { class: `run-item${selected ? " active" : ""}`, type: "button", onclick: () => selectRun(run.id) },
          el("div", { class: "run-item-top" }, el("span", { class: "run-subject" }, run.subject), statusChip(run.status)),
          el(
            "div",
            { class: "muted small" },
            `${TYPE_LABELS[run.type] || run.type} · ${when(run.startedAt)} · ${yuan(run.costYuan)} · 配方 ${run.recipeHash}`,
          ),
        ),
      );
    }
  }

  async function refreshRuns() {
    try {
      state.runs = await api("zheye.trialList", {});
      renderRunList();
      if (state.run) {
        const fresh = state.runs.find((run) => run.id === state.run.id);
        if (fresh && fresh.status !== state.run.status) await reloadRun();
      }
    } catch (error) {
      toast(`读取试跑记录失败：${error.message}`);
    }
  }

  function showView(view) {
    state.view = view;
    for (const name of ["flow", "run", "compare"]) {
      document.getElementById(`view-${name}`).classList.toggle("hidden", name !== view);
    }
    document.getElementById("nav-flow").classList.toggle("active", view === "flow" && !state.flow.snapshotOf);
    renderRunList();
  }

  // ———————————————————— 流程与提示词 ————————————————————

  async function loadFlow(type) {
    state.flow.type = type;
    state.flow.snapshotOf = null;
    try {
      const res = await api("zheye.getRecipe", { type });
      state.flow.recipe = res.recipe;
      state.flow.error = res.error;
      state.flow.available = res.available;
    } catch (error) {
      state.flow.recipe = null;
      state.flow.error = error.message;
    }
    if (state.flow.recipe && state.flow.selected !== "__system" && !state.flow.recipe.stages.some((s) => s.id === state.flow.selected)) {
      state.flow.selected = "__system";
    }
    renderTypeSelect();
    renderFlow();
  }

  function renderTypeSelect() {
    const select = document.getElementById("type");
    const current = select.value || "concept";
    select.replaceChildren(
      ...Object.entries(TYPE_LABELS).map(([type, label]) =>
        el(
          "option",
          { value: type, disabled: !state.flow.available.includes(type) },
          state.flow.available.includes(type) ? label : `${label}（还没有配方）`,
        ),
      ),
    );
    select.value = state.flow.available.includes(current) ? current : "concept";
  }

  function renderFlow() {
    const root = document.getElementById("view-flow");
    root.replaceChildren();
    const { recipe, error, snapshotOf } = state.flow;

    if (snapshotOf) {
      root.append(
        el(
          "div",
          { class: "banner" },
          `这是试跑「${snapshotOf.subject}」当时用的配方（版本 ${snapshotOf.recipeHash}），只读。`,
          el("button", { class: "link-btn", type: "button", onclick: () => loadFlow(state.flow.type) }, "回到当前配方"),
        ),
      );
    } else {
      root.append(
        el(
          "div",
          { class: "type-tabs" },
          Object.entries(TYPE_LABELS).map(([type, label]) =>
            el(
              "button",
              {
                type: "button",
                class: `type-tab${state.flow.type === type ? " active" : ""}`,
                onclick: () => loadFlow(type),
              },
              state.flow.available.includes(type) ? `讲解${label}` : `讲解${label}（还没有配方）`,
            ),
          ),
          el("span", { class: "spacer" }),
          el("button", { type: "button", class: "link-btn", onclick: () => loadFlow(state.flow.type) }, "重新读取"),
        ),
      );
    }

    if (error) {
      root.append(el("div", { class: "error-box" }, `配方有问题：${error}`));
      return;
    }
    if (!recipe) {
      root.append(
        el(
          "div",
          { class: "muted empty" },
          `还没有「讲解${TYPE_LABELS[state.flow.type]}」的配方：在 apps/zheye/recipes/${state.flow.type}/ 下建 flow.json 即可（写法见 recipes/README.md）。`,
        ),
      );
      return;
    }

    root.append(
      el(
        "div",
        { class: "meta-line" },
        el("strong", {}, recipe.name),
        el("span", { class: "muted" }, `模型 ${recipe.model} · 思考强度 ${recipe.reasoningEffort} · 配方版本 ${recipe.hash}`),
      ),
    );

    // 流程图：共用的系统提示词 → 各步骤；下面是各步之间传递的草稿
    const graph = el("div", { class: "graph" });
    const node = (id, index, title, sub) =>
      el(
        "button",
        {
          type: "button",
          class: `node${state.flow.selected === id ? " active" : ""}${id === "__system" ? " node-system" : ""}`,
          onclick: () => {
            state.flow.selected = id;
            renderFlow();
          },
        },
        index ? el("span", { class: "node-index" }, index) : null,
        el("span", { class: "node-title" }, title),
        sub ? el("span", { class: "node-sub" }, sub) : null,
      );
    graph.append(node("__system", null, "每一步共用", "系统提示词"));
    recipe.stages.forEach((stage, i) => {
      graph.append(el("span", { class: i === 0 ? "arrow arrow-plus" : "arrow" }, i === 0 ? "+" : "→"));
      graph.append(node(stage.id, i + 1, stage.name, `最多 ${stage.maxRounds} 轮`));
    });
    root.append(graph);
    root.append(
      el(
        "div",
        { class: "docs-line muted small" },
        "草稿（各步之间传递，每一步都能读取、修改、重写）：",
        recipe.docs.map((name) => el("span", { class: `doc-chip${name === recipe.article ? " doc-final" : ""}` }, name === recipe.article ? `${name}（最终）` : name)),
        " · 每一步都能联网搜索、阅读网页",
      ),
    );

    // 选中的节点
    const stage = recipe.stages.find((item) => item.id === state.flow.selected) || null;
    const paths = stage ? [...recipe.system, stage.prompt] : recipe.system;
    const detail = el("div", { class: "flow-detail" });
    if (stage) {
      const vars = sampleVars(recipe, stage);
      detail.append(
        el("h3", {}, `「${stage.name}」发给模型的内容`),
        el("div", { class: "muted small" }, "系统提示词 = 共用的系统提示词 + 这一步的提示词；变量用示例值显示，注释不发给模型。"),
        details("系统提示词（渲染后）", () => pre(paths.map((path) => renderRecipePrompt(recipe, path, vars)).join("\n\n")), true),
        details("用户消息（程序拼接）", () =>
          pre(
            `讲解对象：${vars.讲解对象}（${vars.类型}）\n\n当前的草稿：\n\n` +
              recipe.docs.map((name) => `【${name}】\n（这份草稿当前的全文，空的显示「（空）」）`).join("\n\n"),
          ),
        ),
      );
    } else {
      detail.append(
        el("h3", {}, "每一步共用的系统提示词"),
        el("div", { class: "muted small" }, "每一步的系统提示词都先放这些文件，再接上这一步自己的提示词。点上面的步骤看某一步完整的内容。"),
      );
    }
    detail.append(el("h3", {}, "用到的文件"));
    for (const path of filesUsedBy(recipe, paths)) {
      const content = filesOf(recipe).get(path);
      detail.append(
        el(
          "div",
          { class: "file-card" },
          el(
            "div",
            { class: "file-head" },
            el("code", {}, path),
            el("span", { class: "spacer" }),
            snapshotOf ? null : el("button", { type: "button", class: "link-btn", onclick: () => openRecipeFile(path) }, "在编辑器里打开"),
          ),
          pre(content, "pre-source"),
        ),
      );
    }
    const flowFile = `${recipe.type}/flow.json`;
    detail.append(
      details(`流程定义（${flowFile}）`, () =>
        el(
          "div",
          {},
          snapshotOf ? null : el("button", { type: "button", class: "link-btn", onclick: () => openRecipeFile(flowFile) }, "在编辑器里打开"),
          pre(filesOf(recipe).get(flowFile) || "", "pre-source"),
        ),
      ),
    );
    root.append(detail);
  }

  // ———————————————————— 试跑：开始 / 选择 / 轮询 ————————————————————

  async function startRun(subject, type) {
    const outsideRunId = window.outside.newRunId();
    const ctx = { runId: null, live: null };
    const off = window.outside.onEvent(outsideRunId, (event) => onLiveEvent(ctx, event));
    const button = document.getElementById("btn-start");
    button.disabled = true;
    const done = window.outside.call("zheye.trialStart", { subject, type }, { runId: outsideRunId });
    done
      .then((res) => {
        if (!res.ok) toast(`试跑没能开始：${res.error.message}`);
      })
      .finally(() => {
        off();
        button.disabled = false;
        if (ctx.runId) state.mine.delete(ctx.runId);
        void refreshRuns();
      });
    ctx.outsideRunId = outsideRunId;
  }

  function onLiveEvent(ctx, event) {
    if (!event || typeof event !== "object") return;
    if (event.type === "trial_created") {
      ctx.runId = event.runId;
      state.mine.set(event.runId, ctx);
      document.getElementById("btn-start").disabled = false;
      document.getElementById("subject").value = "";
      void refreshRuns().then(() => selectRun(event.runId));
      return;
    }
    if (!ctx.runId) return;
    if (event.type === "trial_event") {
      // 这一轮已经存下：实时块换成存下的那一轮
      if (event.event && (event.event.kind === "round" || event.event.kind === "stage_end")) ctx.live = null;
      if (state.run && state.run.id === ctx.runId) mergeEvents([event.event]);
      scheduleLive();
      return;
    }
    // 实时输出（只有本页发起的试跑才有）
    if (event.type === "round_start") {
      ctx.live = { round: event.round, reasoning: "", content: "", tools: [] };
    } else if (event.type === "round_retry") {
      ctx.live = { round: event.round, reasoning: "", content: "", tools: [], retry: event.attempt };
    } else if (event.type === "ai_delta" && ctx.live) {
      if (event.reasoning) ctx.live.reasoning += event.reasoning;
      if (event.content) ctx.live.content += event.content;
    } else if (event.type === "tool_start" && ctx.live) {
      ctx.live.tools.push({ callId: event.callId, tool: event.tool, summary: event.summary, ok: null });
    } else if (event.type === "tool_result" && ctx.live) {
      const tool = ctx.live.tools.find((item) => item.callId === event.callId);
      if (tool) tool.ok = event.ok;
    } else {
      return;
    }
    if (state.run && state.run.id === ctx.runId) scheduleLive();
  }

  let pollTimer = null;
  async function selectRun(runId) {
    clearTimeout(pollTimer);
    state.flow.snapshotOf = null;
    try {
      const detail = await api("zheye.trialGet", { runId });
      state.run = detail;
      state.events = detail.events;
      state.lastSeq = detail.events.length ? detail.events[detail.events.length - 1].seq : 0;
      state.docView = { name: detail.recipe ? detail.recipe.article : null, version: null, mode: "render" };
      showView("run");
      renderRun();
      schedulePoll();
    } catch (error) {
      toast(`读取试跑失败：${error.message}`);
    }
  }

  async function reloadRun() {
    if (!state.run) return;
    const detail = await api("zheye.trialGet", { runId: state.run.id, afterSeq: state.lastSeq });
    const newEvents = detail.events;
    state.run = { ...detail, events: undefined };
    renderRunHeader();
    mergeEvents(newEvents);
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    if (!state.run || state.view !== "run" || state.run.status !== "running") return;
    pollTimer = setTimeout(async () => {
      try {
        await reloadRun();
      } catch {
        /* 下一次再试 */
      }
      schedulePoll();
    }, POLL_MS);
  }

  function mergeEvents(events) {
    const fresh = events.filter((event) => event.seq > state.lastSeq).sort((a, b) => a.seq - b.seq);
    if (fresh.length === 0) return;
    for (const event of fresh) {
      state.events.push(event);
      state.lastSeq = event.seq;
      appendEvent(event);
    }
    renderStageStrip();
    renderDocs();
    scheduleLive();
  }

  // ———————————————————— 试跑：页面 ————————————————————

  let dom = null;

  function renderRun() {
    const root = document.getElementById("view-run");
    root.replaceChildren();
    dom = {
      header: el("div", { class: "run-header" }),
      strip: el("div", { class: "graph graph-strip" }),
      trajectory: el("div", { class: "trajectory" }),
      docs: el("div", { class: "docs-panel" }),
      stages: new Map(),
      live: null,
      docCounters: new Map(),
      pendingDocs: [],
    };
    root.append(dom.header, dom.strip, el("div", { class: "run-body" }, dom.trajectory, dom.docs));
    renderRunHeader();
    for (const event of state.events) appendEvent(event);
    renderStageStrip();
    renderDocs();
    scheduleLive();
  }

  function stageInfo(stageId) {
    const stages = (state.run.recipe && state.run.recipe.stages) || [];
    const index = stages.findIndex((stage) => stage.id === stageId);
    return { index, stage: stages[index] || { id: stageId, name: stageId } };
  }

  function stageStatus(stageId) {
    let started = false;
    let end = null;
    for (const event of state.events) {
      if (event.stage !== stageId) continue;
      if (event.kind === "stage_start") started = true;
      if (event.kind === "stage_end") end = event.data;
    }
    if (end) return end.stopReason === "error" ? "error" : end.stopReason === "aborted" ? "stopped" : "done";
    if (!started) return "pending";
    return state.run.status === "running" ? "running" : state.run.status === "error" ? "error" : "stopped";
  }

  function renderRunHeader() {
    if (!dom) return;
    const run = state.run;
    const usage = run.usage;
    const elapsed = (run.finishedAt || Date.now()) - run.startedAt;
    const others = state.runs.filter((item) => item.id !== run.id);
    const compareSelect = el(
      "select",
      {
        class: "compare-select",
        onchange: (event) => {
          if (event.target.value) openCompare(run.id, event.target.value);
        },
      },
      el("option", { value: "" }, "与另一次试跑对比…"),
      others.map((item) => el("option", { value: item.id }, `${item.subject} · ${when(item.startedAt)} · 配方 ${item.recipeHash}`)),
    );
    const mine = state.mine.get(run.id);
    dom.header.replaceChildren(
      ...[
      el(
        "div",
        { class: "run-title" },
        el("h2", {}, run.subject, el("span", { class: "muted" }, `（${TYPE_LABELS[run.type] || run.type}）`)),
        statusChip(run.status),
        run.status === "running"
          ? el(
              "button",
              {
                type: "button",
                class: "danger-btn",
                onclick: async () => {
                  if (mine && mine.outsideRunId) {
                    await window.outside.cancel(mine.outsideRunId);
                    toast("正在停止…");
                  } else {
                    await api("zheye.trialStop", { runId: run.id });
                    toast("正在停止：等这一次模型输出结束");
                  }
                },
              },
              "停止",
            )
          : null,
      ),
      el(
        "div",
        { class: "muted small run-meta" },
        `${run.flow} · ${yuan(run.costYuan)} · ${duration(elapsed)} · 搜索 / 阅读 ${run.webCalls} 次` +
          (usage ? ` · 输入 ${tokens(usage.promptTokens)}（缓存 ${tokens(usage.cacheHitTokens || 0)}）· 输出 ${tokens(usage.completionTokens)}（思考 ${tokens(usage.reasoningTokens || 0)}）` : "") +
          ` · 配方 ${run.recipeHash}`,
        el(
          "button",
          {
            type: "button",
            class: "link-btn",
            onclick: () => {
              if (!run.recipe) return;
              state.flow.recipe = run.recipe;
              state.flow.error = null;
              state.flow.snapshotOf = run;
              state.flow.selected = "__system";
              showView("flow");
              renderFlow();
            },
          },
          "看这一版配方",
        ),
        others.length ? compareSelect : null,
      ),
      run.error ? el("div", { class: "error-box" }, run.error) : null,
      run.status === "interrupted" ? el("div", { class: "muted small" }, "MyOutside 关闭时这次试跑还没跑完，下面是已经存下的部分。") : null,
      ].filter(Boolean),
    );
  }

  function renderStageStrip() {
    if (!dom || !state.run.recipe) return;
    const costs = new Map();
    for (const event of state.events) {
      if (event.kind === "round") costs.set(event.stage, (costs.get(event.stage) || 0) + (event.data.costYuan || 0));
    }
    dom.strip.replaceChildren();
    state.run.recipe.stages.forEach((stage, i) => {
      if (i > 0) dom.strip.append(el("span", { class: "arrow" }, "→"));
      const status = stageStatus(stage.id);
      dom.strip.append(
        el(
          "button",
          {
            type: "button",
            class: `node node-${status}`,
            title: { pending: "还没开始", running: "进行中", done: "完成", error: "出错", stopped: "停止" }[status],
            onclick: () => {
              const section = dom.stages.get(stage.id);
              if (section) section.root.scrollIntoView({ behavior: "smooth", block: "start" });
            },
          },
          el("span", { class: "node-index" }, i + 1),
          el("span", { class: "node-title" }, stage.name),
          el("span", { class: "node-sub" }, status === "pending" ? "未开始" : yuan(costs.get(stage.id) || 0)),
        ),
      );
    });
  }

  function stageSection(stageId) {
    let section = dom.stages.get(stageId);
    if (section) return section;
    const { index, stage } = stageInfo(stageId);
    const head = el("div", { class: "stage-head" }, el("span", { class: "node-index" }, index + 1), el("h3", {}, stage.name), el("span", { class: "stage-note muted small" }));
    const body = el("div", { class: "stage-body" });
    const root = el("section", { class: "stage" }, head, body);
    dom.trajectory.append(root);
    section = { root, head, body, note: head.querySelector(".stage-note"), docEventsSinceRound: [] };
    dom.stages.set(stageId, section);
    return section;
  }

  /** 草稿的第几版（每份草稿各自从 1 数） */
  function docVersionOf(event) {
    const count = (dom.docCounters.get(event.data.doc) || 0) + 1;
    dom.docCounters.set(event.data.doc, count);
    return count;
  }

  function appendEvent(event) {
    if (!dom || !event.stage) return;
    const section = stageSection(event.stage);
    if (event.kind === "stage_start") {
      section.body.append(
        details("发给模型的提示词", () =>
          el("div", {}, el("div", { class: "label" }, "系统提示词"), pre(event.data.system), el("div", { class: "label" }, "用户消息"), pre(event.data.user)),
        ),
      );
    } else if (event.kind === "doc") {
      section.docEventsSinceRound.push({ doc: event.data.doc, version: docVersionOf(event) });
    } else if (event.kind === "round") {
      section.body.append(roundView(event.data, section.docEventsSinceRound));
      section.docEventsSinceRound = [];
    } else if (event.kind === "stage_end") {
      const data = event.data;
      const reason = { done: "", max_rounds: "达到最多轮数", aborted: "已停止", error: "出错" }[data.stopReason] ?? data.stopReason;
      section.note.textContent = `${yuan(data.costYuan)}${reason ? ` · ${reason}` : ""}`;
      if (data.error) section.body.append(el("div", { class: "error-box" }, data.error));
    }
  }

  function roundView(round, docEvents) {
    const usage = round.usage;
    const head = el(
      "div",
      { class: "round-head muted small" },
      `第 ${round.index} 轮`,
      usage ? ` · 输入 ${tokens(usage.promptTokens)} · 输出 ${tokens(usage.completionTokens)}（思考 ${tokens(usage.reasoningTokens || 0)}）` : " · 没有用量（输出到一半被打断）",
      ` · ${yuan(round.costYuan)}`,
    );
    const box = el("div", { class: "round" }, head);
    if (round.note) box.append(el("div", { class: "round-note" }, `程序追加给模型：${round.note}`));
    if (round.reasoning) {
      box.append(details(`思维链（${round.reasoning.length} 字）`, () => pre(round.reasoning, "pre-reasoning")));
    }
    if (round.content && round.content.trim()) box.append(md(round.content, "round-said"));
    const pendingDocs = [...docEvents];
    for (const call of round.toolCalls || []) {
      let args = {};
      try {
        args = JSON.parse(call.arguments || "{}");
      } catch {
        /* 参数不是 JSON：原样显示 */
      }
      const label = TOOL_LABELS[call.name] || call.name;
      let docVersion = null;
      if (call.ok && (call.name === "edit_doc" || call.name === "write_doc")) {
        const index = pendingDocs.findIndex((item) => item.doc === args.name);
        if (index >= 0) docVersion = pendingDocs.splice(index, 1)[0];
      }
      const summary = el(
        "span",
        { class: `tool tool-${call.ok ? "ok" : "fail"}` },
        el("span", { class: "tool-label" }, label),
        call.summary.replace(/^(搜索|阅读|读取|修改|重写)[：]?/, "") || call.name,
        call.name === "write_doc" && call.ok ? ` · ${String(args.content || "").length} 字` : "",
        call.ok ? "" : " · 失败",
      );
      box.append(
        details(summary, () => {
          const body = el("div", { class: "tool-body" });
          if (docVersion) {
            body.append(
              el(
                "button",
                {
                  type: "button",
                  class: "link-btn",
                  onclick: () => {
                    state.docView = { name: docVersion.doc, version: docVersion.version, mode: "diff" };
                    renderDocs();
                  },
                },
                `在右边看「${docVersion.doc}」的第 ${docVersion.version} 版`,
              ),
            );
          }
          if (call.name === "edit_doc" && call.ok) {
            body.append(diffView(String(args.old || ""), String(args.new || ""), 99));
          } else if (call.name === "write_doc" && call.ok) {
            body.append(pre(String(args.content || "")));
          } else {
            if (call.name !== "read_doc") body.append(el("div", { class: "label" }, "参数"), pre(call.arguments));
            body.append(el("div", { class: "label" }, "交给模型的结果"), pre(call.result));
          }
          return body;
        }),
      );
    }
    return box;
  }

  // 实时输出：画在当前步骤的末尾，持久化的「轮」到了就换掉
  let liveFrame = 0;
  function scheduleLive() {
    if (liveFrame) return;
    liveFrame = requestAnimationFrame(() => {
      liveFrame = 0;
      renderLive();
    });
  }

  function renderLive() {
    if (!dom) return;
    const mine = state.run && state.mine.get(state.run.id);
    const live = mine && mine.live;
    const lastStart = [...state.events].reverse().find((event) => event.kind === "stage_start");
    const currentStage = lastStart ? lastStart.stage : null;
    if (!live || state.run.status !== "running" || !currentStage) {
      if (dom.live) dom.live.remove();
      dom.live = null;
      return;
    }
    const section = stageSection(currentStage);
    if (!dom.live) {
      dom.live = el(
        "div",
        { class: "round live" },
        el("div", { class: "round-head muted small" }),
        el("details", { class: "fold", open: true }, el("summary", {}, "思维链（实时）"), pre("", "pre-reasoning live-reasoning")),
        el("div", { class: "md round-said live-content" }),
        el("div", { class: "live-tools" }),
      );
    }
    if (dom.live.parentNode !== section.body) section.body.append(dom.live);
    dom.live.querySelector(".round-head").textContent = `第 ${live.round} 轮 · 生成中${live.retry ? `（第 ${live.retry} 次重试）` : ""}…`;
    const reasoningBox = dom.live.querySelector(".live-reasoning");
    const stick = reasoningBox.scrollHeight - reasoningBox.scrollTop - reasoningBox.clientHeight < 30;
    reasoningBox.textContent = live.reasoning || "…";
    if (stick) reasoningBox.scrollTop = reasoningBox.scrollHeight;
    dom.live.querySelector(".live-content").innerHTML = live.content ? window.renderMarkdown(live.content, { copyLabel: "复制" }) : "";
    dom.live
      .querySelector(".live-tools")
      .replaceChildren(
        ...live.tools.map((tool) =>
          el(
            "div",
            { class: `tool tool-${tool.ok === null ? "running" : tool.ok ? "ok" : "fail"}` },
            el("span", { class: "tool-label" }, TOOL_LABELS[tool.tool] || tool.tool),
            tool.summary.replace(/^(搜索|阅读|读取|修改|重写)[：]?/, ""),
            tool.ok === null ? " …" : "",
          ),
        ),
      );
  }

  // ———————————————————— 草稿面板 ————————————————————

  function docVersions(name) {
    const versions = [];
    for (const event of state.events) {
      if (event.kind === "doc" && event.data.doc === name) {
        versions.push({ content: event.data.content, op: event.data.op, stage: event.stage, seq: event.seq });
      }
    }
    return versions;
  }

  let docsFrame = 0;
  function renderDocs() {
    if (!dom || docsFrame) return;
    docsFrame = requestAnimationFrame(() => {
      docsFrame = 0;
      drawDocs();
    });
  }

  function drawDocs() {
    const recipe = state.run.recipe;
    if (!recipe) {
      dom.docs.replaceChildren(el("div", { class: "muted" }, "没有配方快照。"));
      return;
    }
    const view = state.docView;
    if (!view.name || !recipe.docs.includes(view.name)) view.name = recipe.article;
    const versions = docVersions(view.name);
    const latest = versions.length;
    const index = view.version === null ? latest : Math.min(Math.max(1, view.version), latest);
    const current = versions[index - 1];
    const previous = versions[index - 2];

    const tabs = el(
      "div",
      { class: "doc-tabs" },
      recipe.docs.map((name) =>
        el(
          "button",
          {
            type: "button",
            class: `doc-tab${name === view.name ? " active" : ""}`,
            onclick: () => {
              state.docView = { name, version: null, mode: view.mode };
              renderDocs();
            },
          },
          name,
          el("span", { class: "muted small" }, ` ${docVersions(name).length}`),
        ),
      ),
    );
    const go = (next) => {
      state.docView = { ...view, version: next >= latest ? null : next };
      renderDocs();
    };
    const stageName = current ? stageInfo(current.stage).stage.name : "";
    const bar = el(
      "div",
      { class: "doc-bar" },
      el("button", { type: "button", class: "icon-btn", disabled: index <= 1, onclick: () => go(index - 1) }, "‹"),
      el("span", { class: "small" }, latest ? `第 ${index} / ${latest} 版` : "还没有内容"),
      el("button", { type: "button", class: "icon-btn", disabled: index >= latest, onclick: () => go(index + 1) }, "›"),
      current ? el("span", { class: "muted small" }, `来自「${stageName}」· ${current.op === "write" ? "重写" : "修改"} · ${current.content.length} 字`) : null,
      view.version === null && state.run.status === "running" ? el("span", { class: "muted small" }, "· 跟随最新") : null,
      el("span", { class: "spacer" }),
      ["render", "source", "diff"].map((mode) =>
        el(
          "button",
          {
            type: "button",
            class: `mode-btn${view.mode === mode ? " active" : ""}`,
            onclick: () => {
              state.docView = { ...view, mode };
              renderDocs();
            },
          },
          { render: "渲染", source: "原文", diff: "与上一版对比" }[mode],
        ),
      ),
    );
    let body;
    if (!current) body = el("div", { class: "muted empty" }, "这份草稿还是空的。");
    else if (view.mode === "source") body = pre(current.content, "pre-source");
    else if (view.mode === "diff") body = diffView(previous ? previous.content : "", current.content);
    else body = md(current.content, "doc-md");
    const scroller = dom.docs.querySelector(".doc-body");
    const keepScroll = scroller && view.version !== null ? scroller.scrollTop : null;
    const bodyBox = el("div", { class: "doc-body" }, body);
    dom.docs.replaceChildren(tabs, bar, bodyBox);
    if (keepScroll !== null) bodyBox.scrollTop = keepScroll;
  }

  // ———————————————————— 对比两次试跑 ————————————————————

  function finalArticle(detail) {
    const name = detail.recipe ? detail.recipe.article : null;
    let content = "";
    for (const event of detail.events) if (event.kind === "doc" && event.data.doc === name) content = event.data.content;
    return content;
  }

  async function openCompare(aId, bId) {
    clearTimeout(pollTimer);
    try {
      const [a, b] = await Promise.all([api("zheye.trialGet", { runId: aId }), api("zheye.trialGet", { runId: bId })]);
      state.compare = { a, b };
      showView("compare");
      renderCompare();
    } catch (error) {
      toast(`读取试跑失败：${error.message}`);
    }
  }

  function renderCompare() {
    const { a, b } = state.compare;
    const root = document.getElementById("view-compare");
    const stat = (run) => {
      const rounds = run.events.filter((event) => event.kind === "round").length;
      return `${STATUS_LABELS[run.status]} · ${yuan(run.costYuan)} · ${duration((run.finishedAt || Date.now()) - run.startedAt)} · ${rounds} 轮 · 搜索 / 阅读 ${run.webCalls} 次 · 文章 ${finalArticle(run).length} 字 · 配方 ${run.recipeHash}`;
    };
    const column = (run) =>
      el(
        "div",
        { class: "compare-col" },
        el("h3", {}, el("button", { type: "button", class: "link-btn", onclick: () => selectRun(run.id) }, `${run.subject} · ${when(run.startedAt)}`)),
        el("div", { class: "muted small" }, stat(run)),
        el("div", { class: "doc-body" }, finalArticle(run) ? md(finalArticle(run), "doc-md") : el("div", { class: "muted empty" }, "没有文章。")),
      );

    const filesA = new Map(((a.recipe && a.recipe.files) || []).map((file) => [file.path, file.content]));
    const filesB = new Map(((b.recipe && b.recipe.files) || []).map((file) => [file.path, file.content]));
    const paths = [...new Set([...filesA.keys(), ...filesB.keys()])].sort();
    const changes = paths.filter((path) => filesA.get(path) !== filesB.get(path));
    const recipeDiff = el("div", { class: "recipe-diff" }, el("h3", {}, "配方的差异"));
    if (changes.length === 0) recipeDiff.append(el("div", { class: "muted" }, "两次试跑用的是同一版配方。"));
    for (const path of changes) {
      const tag = !filesA.has(path) ? "（只有右边有）" : !filesB.has(path) ? "（只有左边有）" : "";
      recipeDiff.append(details(`${path} ${tag}`, () => diffView(filesA.get(path) || "", filesB.get(path) || ""), true));
    }
    root.replaceChildren(
      el(
        "div",
        { class: "banner" },
        "对比两次试跑：左边是旧的、右边是新的时，配方差异里「-」是删掉的、「+」是加上的。",
        el("button", { type: "button", class: "link-btn", onclick: () => openCompare(b.id, a.id) }, "左右交换"),
      ),
      recipeDiff,
      el("div", { class: "compare-cols" }, column(a), column(b)),
    );
  }

  // ———————————————————— 启动 ————————————————————

  document.getElementById("view-flow").addEventListener("click", onMarkClick);
  document.getElementById("view-run").addEventListener("click", onMarkClick);
  document.getElementById("view-compare").addEventListener("click", onMarkClick);
  function onMarkClick(event) {
    const mark = event.target.closest && event.target.closest(".zy-mark");
    if (mark) toast(`「${mark.dataset.zyType}：${mark.dataset.zyName}」——跳转与生成以后再做（ZHEYE-0017）`);
    const copy = event.target.closest && event.target.closest(".code-copy");
    if (copy) {
      const code = copy.parentElement.querySelector("code");
      if (code) void navigator.clipboard.writeText(code.textContent || "");
    }
  }

  document.getElementById("nav-flow").addEventListener("click", () => {
    clearTimeout(pollTimer);
    showView("flow");
    void loadFlow(state.flow.type);
  });

  document.getElementById("new-run").addEventListener("submit", (event) => {
    event.preventDefault();
    const subject = document.getElementById("subject").value.trim();
    const type = document.getElementById("type").value;
    if (!subject) {
      toast("先写上讲解对象");
      return;
    }
    void startRun(subject, type);
  });

  setInterval(() => {
    if (state.runs.some((run) => run.status === "running")) void refreshRuns();
    if (state.view === "run" && state.run && state.run.status === "running") renderRunHeader();
  }, LIST_POLL_MS);

  void loadFlow("concept");
  void refreshRuns();
})();
