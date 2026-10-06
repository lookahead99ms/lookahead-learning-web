/* Shared presentation for illustrative visuals. No code is executed. */
(() => {
  'use strict';
  // Code keeps its authored lines: no wrapping or mid-token breaks. Each visual's code
  // panel scrolls sideways (overflow-x) when a line is wider than the panel.
  const style = document.createElement('style');
  style.textContent = `
    .lookahead-visual-code { background:var(--syntax-bg,#263238);color:var(--syntax-fg,#b2ccd6);white-space:pre;overflow-wrap:normal; }
    .lookahead-visual-code .syntax-keyword{color:var(--syntax-keyword)}
    .lookahead-visual-code .syntax-string{color:var(--syntax-string)}
    .lookahead-visual-code .syntax-number{color:var(--syntax-number)}
    .lookahead-visual-code .syntax-comment{color:var(--syntax-comment)}
    .lookahead-visual-code .syntax-type{color:var(--syntax-type)}
  `;
  document.head.append(style);
  const escape = source => source.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const highlight = (source, language) => window.LookAheadCode
    ? window.LookAheadCode.highlightLearningCode(source, language)
    : escape(source);
  function palette(element, language) {
    element.classList.add('lookahead-visual-code');
    const colors = window.LookAheadCode?.editorPalettes[language] ?? window.LookAheadCode?.editorPalettes.java;
    for (const [key, value] of Object.entries(colors ?? {})) element.style.setProperty('--syntax-' + key, value);
  }
  function render(element, source, language) {
    palette(element, language);
    element.innerHTML = highlight(source, language);
  }
  async function copy(source) {
    // A sandbox can deny the async Clipboard API. Keep the copy operation inside
    // the explicit button gesture, using the browser's selection copy fallback.
    const previous = document.activeElement;
    const input = document.createElement('textarea');
    input.value = source;
    input.setAttribute('readonly', '');
    input.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(input);
    input.focus({preventScroll:true});
    input.select();
    let copied = false;
    try { copied = document.execCommand?.('copy') ?? false; }
    finally { input.remove(); previous?.focus?.({preventScroll:true}); }
    if (!copied) await navigator.clipboard.writeText(source);
  }
  window.LookAheadVisualCode = { highlight, palette, render, copy };
})();
