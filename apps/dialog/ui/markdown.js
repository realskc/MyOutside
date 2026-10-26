/* Markdown + LaTeX 渲染（DIALOG-0015）：marked 解析 Markdown，KaTeX 渲染公式，DOMPurify 清洗。
   - 公式：$…$、\(…\) 行内；$$…$$、\[…\] 独立成行；代码里的 $ 不处理；
   - 引用：正文里的 [n]（n 是本条回复的来源编号）渲染为指向来源的链接（DIALOG-0010）；
   - 安全：原始 HTML 一律转义；只保留 http/https 链接，交给系统浏览器打开。 */
(() => {
  "use strict";

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const isSafeUrl = (url) => /^https?:\/\/[^\s]+$/i.test(String(url || "").trim());

  /** 占位符：只含字母数字，经过 Markdown 解析与清洗都不会被改动 */
  const MATH = (index) => `MYOMATH${index}END`;
  const CITE = (index) => `MYOCITE${index}END`;

  /**
   * 在非代码片段里把公式与引用换成占位符。
   * 先按围栏代码块与行内代码切开，代码片段原样保留。
   */
  function protect(text, maths, cites, sourceIndexes) {
    const parts = String(text).split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g);
    return parts
      .map((part, i) => {
        if (i % 2 === 1) return part; // 代码
        let out = part;
        const putMath = (tex, display) => {
          maths.push({ tex, display });
          const token = MATH(maths.length - 1);
          return display ? `\n\n${token}\n\n` : token;
        };
        out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex) => putMath(tex, true));
        out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_m, tex) => putMath(tex, true));
        out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_m, tex) => putMath(tex, false));
        // 行内 $…$：开头后、结尾前不能是空白，结尾后不能紧跟数字（避免把「$5 和 $10」当成公式）
        out = out.replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g, (_m, tex) => putMath(tex, false));
        if (sourceIndexes.size > 0) {
          out = out.replace(/\[(\d{1,3})\](?!\()/g, (match, n) => {
            if (!sourceIndexes.has(Number(n))) return match;
            cites.push(Number(n));
            return CITE(cites.length - 1);
          });
        }
        return out;
      })
      .join("");
  }

  let parser = null;
  function getParser(copyLabel) {
    if (!window.marked || !window.marked.Marked) return null;
    if (parser && parser.copyLabel === copyLabel) return parser.instance;
    const instance = new window.marked.Marked({ gfm: true, breaks: true });
    instance.use({
      renderer: {
        code(token) {
          return (
            `<div class="codeblock"><button type="button" class="code-copy">${escapeHtml(copyLabel)}</button>` +
            `<pre><code>${escapeHtml(token.text)}</code></pre></div>`
          );
        },
        html(token) {
          return escapeHtml(token.text);
        },
      },
    });
    parser = { copyLabel, instance };
    return instance;
  }

  function renderMath(tex, display) {
    if (!window.katex) return escapeHtml(display ? `$$${tex}$$` : `$${tex}$`);
    try {
      return window.katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "htmlAndMathml" });
    } catch {
      return escapeHtml(tex);
    }
  }

  /**
   * @param {string} text
   * @param {{ copyLabel?: string, sources?: Array<{ index: number, url: string, title: string }> }} options
   */
  function render(text, options = {}) {
    const copyLabel = options.copyLabel || "Copy";
    const sources = new Map((options.sources || []).map((source) => [source.index, source]));
    const maths = [];
    const cites = [];
    const protectedText = protect(text || "", maths, cites, new Set(sources.keys()));

    const instance = getParser(copyLabel);
    let html = instance ? instance.parse(protectedText) : `<p>${escapeHtml(protectedText).replace(/\n/g, "<br />")}</p>`;
    if (window.DOMPurify) html = window.DOMPurify.sanitize(html, { ADD_ATTR: ["data-external"] });

    // 链接：只保留 http/https，交给系统浏览器打开
    const template = document.createElement("template");
    template.innerHTML = html;
    for (const link of template.content.querySelectorAll("a")) {
      const href = link.getAttribute("href") || "";
      if (isSafeUrl(href)) {
        link.setAttribute("data-external", "1");
        link.setAttribute("rel", "noreferrer");
      } else {
        link.replaceWith(document.createTextNode(link.textContent || ""));
      }
    }
    html = template.innerHTML;

    // 占位符换成公式与引用（二者都由受信任的代码生成）
    html = html.replace(/<p>\s*MYOMATH(\d+)END\s*<\/p>/g, (_m, index) => {
      const math = maths[Number(index)];
      return math ? `<div class="math-display">${renderMath(math.tex, true)}</div>` : "";
    });
    html = html.replace(/MYOMATH(\d+)END/g, (_m, index) => {
      const math = maths[Number(index)];
      return math ? renderMath(math.tex, math.display) : "";
    });
    html = html.replace(/MYOCITE(\d+)END/g, (_m, index) => {
      const n = cites[Number(index)];
      const source = sources.get(n);
      if (!source || !isSafeUrl(source.url)) return `[${n}]`;
      return `<a class="cite" href="${escapeHtml(source.url)}" data-external="1" rel="noreferrer" title="${escapeHtml(source.title)}">[${n}]</a>`;
    });
    return html;
  }

  window.renderMarkdown = render;
})();
