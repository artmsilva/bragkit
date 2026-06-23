/**
 * Best-effort PDF export with zero npm dependencies. We don't bundle a renderer
 * (that would mean Puppeteer/Playwright); instead we drive a Chrome/Chromium/Edge
 * binary the user already has via `--headless=new --print-to-pdf`. If none is
 * found we degrade gracefully — the caller still has the markdown and the
 * intermediate .html — rather than throwing.
 *
 * The markdown→HTML step is a deliberately tiny, line-based converter (headings,
 * lists, bold, links, paragraphs). It is NOT a full CommonMark engine; it exists
 * only so a report renders legibly when printed. HTML is escaped before any
 * inline markdown is applied, so source content can't inject markup.
 */
import { existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Locate a Chrome/Chromium/Edge binary for headless printing. Checks CHROME_PATH
 * first, then common macOS app bundles, then falls back to `which` for binaries
 * on PATH. Returns an absolute path/command string, or null if nothing is found.
 * Mirrors the approach in resume-builder/build.mjs.
 */
export function findChrome(): string | null {
  const candidates: string[] = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
  ].filter((c): c is string => Boolean(c));

  for (const c of candidates) {
    if (c.includes("/")) {
      if (existsSync(c)) return c;
    } else {
      const which = spawnSync("which", [c]);
      if (which.status === 0) {
        const found = which.stdout.toString().trim();
        if (found) return found;
      }
    }
  }
  return null;
}

/** Escape text for safe insertion into HTML. */
function escapeHtml(s: unknown): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  return String(s).replace(/[&<>"]/g, (c) => map[c]);
}

/**
 * Apply the small set of inline markdown rules to an already HTML-escaped string:
 * links `[text](url)` and bold `**text**`. URLs are escaped too.
 */
function inline(escaped: string): string {
  return escaped
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, url: string) => `<a href="${escapeHtml(url)}">${text}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

/**
 * Convert a markdown report into a minimal HTML body. Line-based: `#`/`##`/`###`
 * become headings, `- ` lines become a `<ul>`, blank lines break paragraphs, and
 * everything else accumulates into a `<p>`.
 */
function markdownToHtml(markdown: string): string {
  const out: string[] = [];
  let listOpen = false;
  let para: string[] = [];

  const flushPara = (): void => {
    if (para.length) {
      out.push(`<p>${inline(escapeHtml(para.join(" ")))}</p>`);
      para = [];
    }
  };
  const closeList = (): void => {
    if (listOpen) {
      out.push("</ul>");
      listOpen = false;
    }
  };

  for (const rawLine of String(markdown).split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(escapeHtml(heading[2]))}</h${level}>`);
      continue;
    }

    const item = /^[-*]\s+(.*)$/.exec(line);
    if (item) {
      flushPara();
      if (!listOpen) {
        out.push("<ul>");
        listOpen = true;
      }
      out.push(`<li>${inline(escapeHtml(item[1]))}</li>`);
      continue;
    }

    if (line.trim() === "") {
      flushPara();
      closeList();
      continue;
    }

    closeList();
    para.push(line.trim());
  }
  flushPara();
  closeList();
  return out.join("\n");
}

/**
 * Wrap a markdown report in a self-contained HTML document with simple print CSS.
 */
export function htmlWrap(markdown: string, title = "Brag Report"): string {
  const body = markdownToHtml(markdown);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  body {
    font: 14px/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1a1a1a;
    max-width: 48rem;
    margin: 2rem auto;
    padding: 0 1.5rem;
  }
  h1 { font-size: 1.9rem; margin: 0 0 .5rem; }
  h2 { font-size: 1.3rem; margin: 1.6rem 0 .4rem; border-bottom: 1px solid #ddd; padding-bottom: .2rem; }
  h3 { font-size: 1.05rem; margin: 1.2rem 0 .3rem; }
  ul { padding-left: 1.3rem; }
  li { margin: .15rem 0; }
  a { color: #0b5fff; text-decoration: none; }
  table { border-collapse: collapse; }
  @page { margin: 16mm; }
  @media print {
    body { margin: 0; max-width: none; }
    a { color: #1a1a1a; }
  }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

/**
 * Render markdown to a PDF at `outPath` using headless Chrome. Writes an `.html`
 * sibling (same basename) first, then prints it. Never throws for the expected
 * "no browser" case — returns `{ ok: false }` so callers can fall back.
 */
export function writePdf(
  markdown: string,
  outPath: string,
  { title = "Brag Report" }: { title?: string } = {},
): { ok: boolean; chrome: string | null; html: string } {
  const htmlPath = outPath.replace(/\.pdf$/i, "") + ".html";
  const html = htmlWrap(markdown, title);
  writeFileSync(htmlPath, html);

  const chrome = findChrome();
  if (!chrome) {
    // Graceful degradation: the .html is on disk; the user can open + print it.
    return { ok: false, chrome: null, html: htmlPath };
  }

  const res = spawnSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-pdf-header-footer",
      `--print-to-pdf=${path.resolve(outPath)}`,
      pathToFileURL(path.resolve(htmlPath)).href,
    ],
    { stdio: "ignore" },
  );

  return { ok: res.status === 0, chrome, html: htmlPath };
}
