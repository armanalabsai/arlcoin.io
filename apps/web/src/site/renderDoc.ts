import { readFileSync } from "node:fs";
import path from "node:path";

import { Marked, type Tokens } from "marked";

import { DOCS, docPath, type DocEntry } from "@/content/docs.ts";

// Renders a published repository file to HTML at build time. The files are the project's own,
// so the HTML is trusted. Links to other published files point at their /docs page, links to
// files that are not published lose their link (the text stays), and outside links open in a
// new tab.

const repoRoot = path.join(process.cwd(), "..", "..");

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function resolveLink(from: DocEntry, href: string): string | null {
  if (/^(https?:|mailto:)/.test(href)) return href;
  if (href.startsWith("#")) return href;
  const [file, anchor] = href.split("#");
  if (!file) return null;
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(from.source), file));
  const doc = DOCS.find((d) => d.source === target);
  return doc ? docPath(doc.slug) + (anchor ? `#${anchor}` : "") : null;
}

export function renderDoc(doc: DocEntry): string {
  const raw = readFileSync(path.join(/* turbopackIgnore: true */ repoRoot, doc.source), "utf8");
  if (!doc.source.endsWith(".md")) {
    const lang = path.extname(doc.source).slice(1);
    return `<pre class="doc-code"><code data-lang="${escape(lang)}">${escape(raw)}</code></pre>`;
  }
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      link(this: { parser: { parseInline: (t: Tokens.Generic[]) => string } }, token: Tokens.Link) {
        const text = this.parser.parseInline(token.tokens);
        const href = resolveLink(doc, token.href);
        if (!href) return text;
        const external = /^https?:/.test(href);
        return `<a href="${escape(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
      },
      image(token: Tokens.Image) {
        return escape(token.text);
      },
    },
  });
  // The first heading is shown by the page itself.
  return marked.parse(raw.replace(/^# .*\n/, ""), { async: false });
}
