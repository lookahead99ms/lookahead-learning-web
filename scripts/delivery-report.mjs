import { createHash } from 'node:crypto';
import { Marked, Renderer } from 'marked';

const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );

const styles = `
:root { color-scheme: light; --ink: #192b3c; --muted: #52677b; --line: #d7e3eb; --accent: #087b8d; }
* { box-sizing: border-box; }
body { margin: 0; color: var(--ink); background: radial-gradient(ellipse at top left, #e8f6f8, transparent 55%), #f4f7fa; font: 16px/1.7 'Avenir Next', 'Trebuchet MS', sans-serif; }
a { color: #17619a; text-underline-offset: .2em; overflow-wrap: anywhere; }
a:hover { color: var(--accent); }
:focus-visible { outline: 3px solid #b16c09; outline-offset: 4px; }
.skip { position: absolute; left: 1rem; top: -5rem; background: white; padding: .7rem; z-index: 2; }
.skip:focus { top: 1rem; }
header, main, footer { width: min(1240px, calc(100% - 64px)); margin-inline: auto; }
header { padding: 28px 0 24px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.eyebrow { color: var(--accent); font-size: 12px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; margin: 0 0 4px; }
.identity { margin: 0; font-size: 14px; color: var(--muted); }
nav { display: flex; flex-wrap: wrap; gap: 10px; }
nav a { display: inline-block; padding: 8px 14px; border: 1px solid #b9cfdd; border-radius: 8px; background: white; text-decoration: none; font-weight: 700; font-size: 14px; }
nav a:last-child { color: white; background: #17619a; border-color: #17619a; }
main { background: white; border: 1px solid var(--line); border-top: 4px solid var(--accent); border-radius: 12px; padding: clamp(22px, 4vw, 52px); box-shadow: 0 14px 40px #20364d09; min-width: 0; overflow-wrap: anywhere; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; scroll-margin-top: 20px; }
h1 { font-size: clamp(27px, 3vw, 40px); letter-spacing: -.03em; margin: 0 0 24px; }
h2 { font-size: 25px; margin: 44px 0 18px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
h3 { font-size: 20px; margin-top: 28px; }
p { margin: 16px 0; }
li { margin-block: 9px; }
ul, ol { padding-left: 24px; }
code { font: .87em/1.6 'SFMono-Regular', Consolas, 'Liberation Mono', monospace; color: #224d64; background: #eef4f8; padding: .1em .32em; border-radius: 4px; overflow-wrap: anywhere; }
pre { background: #f0f5f8; border: 1px solid var(--line); border-radius: 8px; padding: 18px; white-space: pre-wrap; overflow-wrap: anywhere; }
pre code { padding: 0; background: transparent; }
.table-scroll { max-width: 100%; overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; margin-block: 24px; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 14px; line-height: 1.65; }
th, td { padding: 13px 16px; text-align: left; vertical-align: top; overflow-wrap: anywhere; border-bottom: 1px solid var(--line); }
th { background: #edf5f8; font-weight: 800; }
th:first-child { width: 26%; }
[data-columns="3"] th:first-child { width: 8%; }
[data-columns="3"] th:nth-child(2) { width: 38%; }
tbody tr:nth-child(even) { background: #f9fbfc; }
tbody tr:last-child td { border-bottom: 0; }
blockquote { margin-inline: 0; padding: 8px 20px; border-left: 4px solid var(--accent); background: #f0f9fa; }
footer { padding-block: 22px 34px; color: var(--muted); font-size: 13px; }
@media (max-width: 700px) {
  header, main, footer { width: calc(100% - 28px); }
  header { align-items: flex-start; flex-direction: column; gap: 16px; }
  main { padding: 22px 16px; }
  h2 { font-size: 22px; }
  table { min-width: 600px; }
  th, td { padding: 11px 13px; }
}
@media print {
  body { background: white; }
  header, main, footer { width: 100%; }
  nav, .skip { display: none; }
  main { border: 0; box-shadow: none; padding: 0; }
  .table-scroll { overflow: visible; }
  table { min-width: 0; }
  tr, pre { break-inside: avoid; }
}
`;

export const reportContentSecurityPolicy = [
  "default-src 'none'",
  `style-src 'sha256-${createHash('sha256').update(styles).digest('base64')}'`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  'sandbox allow-same-origin allow-downloads',
].join('; ');

function safeLink(href) {
  if (/[\s\\\u0000-\u001f\u007f]/.test(href)) return null;
  if (/^#[A-Za-z0-9_-]+$/.test(href)) return href;
  if (/^\/(?!\/)/.test(href) || /^https?:\/\//i.test(href)) return href;
  return null;
}

export function renderDeliveryReport({ markdown, title, itemId, evidenceId }) {
  // Marked parses Markdown; it is not an HTML sanitizer. Disable raw HTML and
  // images, constrain link targets, and keep the whole page script-free with CSP.
  const renderer = new Renderer();
  renderer.html = ({ text }) => escapeHtml(text);
  renderer.image = ({ text }) => `<span>${escapeHtml(text)} (image omitted)</span>`;
  renderer.link = function ({ href, tokens }) {
    const label = this.parser.parseInline(tokens);
    const safe = safeLink(href);
    return safe ? `<a href="${escapeHtml(safe)}" rel="noreferrer noopener">${label}</a>` : label;
  };
  renderer.table = function (token) {
    const table = Renderer.prototype.table
      .call(this, token)
      .replace('<table>', `<table data-columns="${token.header.length}">`);
    return `<div class="table-scroll" role="region" aria-label="Report table" tabindex="0">${table}</div>`;
  };
  const parser = new Marked({ renderer, gfm: true, async: false });
  const body = parser.parse(markdown);
  const evidenceUrl = `/__local/delivery/evidence/${encodeURIComponent(itemId)}/${encodeURIComponent(evidenceId)}`;
  const boardUrl = `/delivery-plan?q=${encodeURIComponent(itemId)}&stage=all`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(itemId)} | ${escapeHtml(title)}</title>
  <style>${styles}</style>
</head>
<body>
  <a class="skip" href="#report">Skip to report</a>
  <header>
    <div><p class="eyebrow">Look Ahead / Delivery evidence</p><p class="identity">${escapeHtml(itemId)} &middot; Private local report</p></div>
    <nav aria-label="Report actions">
      <a href="${escapeHtml(boardUrl)}">Back to ${escapeHtml(itemId)}</a>
      <a href="${evidenceUrl}?raw=1">View Markdown</a>
      <a href="${evidenceUrl}?download=1" download>Download .md</a>
    </nav>
  </header>
  <main id="report">${body}</main>
  <footer>Read-only evidence. The original Markdown stays in the private content repository.</footer>
</body>
</html>`;
}
