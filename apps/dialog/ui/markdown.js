/* 极简 Markdown 渲染（零依赖、转义优先）
   支持：标题 / 无序·有序列表 / 引用 / 围栏代码块 / 行内代码 / 粗体 / 斜体 / 链接 / 分隔线 */
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

  function safeUrl(raw) {
    const url = String(raw || "").trim();
    return /^https?:\/\/[^\s]+$/i.test(url) ? url : null;
  }

  /** 行内元素（输入先整体转义，随后仅做受控替换） */
  function inline(text) {
    let out = escapeHtml(text);
    const codes = [];
    out = out.replace(/`([^`]+)`/g, (_match, code) => {
      codes.push(code);
      return `\u0000${codes.length - 1}\u0000`;
    });
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, url) => {
      const safe = safeUrl(url);
      return safe ? `<a href="${safe}" data-external="1" rel="noreferrer">${label}</a>` : label;
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    out = out.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
    out = out.replace(/\u0000(\d+)\u0000/g, (_match, index) => `<code>${codes[Number(index)]}</code>`);
    return out;
  }

  function render(text, options) {
    const copyLabel = escapeHtml((options && options.copyLabel) || "Copy");
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let para = [];
    let list = null;

    const flushPara = () => {
      if (para.length > 0) {
        out.push(`<p>${para.map((line) => inline(line)).join("<br />")}</p>`);
        para = [];
      }
    };
    const flushList = () => {
      if (list) {
        out.push(
          `<${list.type}>${list.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${list.type}>`,
        );
        list = null;
      }
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const fence = /^```([\w-]*)\s*$/.exec(line);
      if (fence) {
        flushPara();
        flushList();
        const buffer = [];
        i += 1;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) {
          buffer.push(lines[i]);
          i += 1;
        }
        out.push(
          `<div class="codeblock"><button type="button" class="code-copy">${copyLabel}</button>` +
            `<pre><code>${escapeHtml(buffer.join("\n"))}</code></pre></div>`,
        );
        continue;
      }
      if (/^\s*$/.test(line)) {
        flushPara();
        flushList();
        continue;
      }
      const heading = /^(#{1,6})\s+(.*)$/.exec(line);
      if (heading) {
        flushPara();
        flushList();
        const level = heading[1].length;
        out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        continue;
      }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
        flushPara();
        flushList();
        out.push("<hr />");
        continue;
      }
      const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
      if (ul) {
        flushPara();
        if (!list || list.type !== "ul") {
          flushList();
          list = { type: "ul", items: [] };
        }
        list.items.push(ul[1]);
        continue;
      }
      const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
      if (ol) {
        flushPara();
        if (!list || list.type !== "ol") {
          flushList();
          list = { type: "ol", items: [] };
        }
        list.items.push(ol[1]);
        continue;
      }
      const quote = /^>\s?(.*)$/.exec(line);
      if (quote) {
        flushPara();
        flushList();
        out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
        continue;
      }
      para.push(line);
    }
    flushPara();
    flushList();
    return out.join("\n");
  }

  window.renderMarkdown = render;
})();
