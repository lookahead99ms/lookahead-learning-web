import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const source = await readFile(new URL('../public/assets/visual-code-presentation.js', import.meta.url), 'utf8');
function setup() {
  const dom = new JSDOM('<button id="copy">Copy</button><pre><code></code></pre>', {runScripts:'outside-only'});
  dom.window.eval(source);
  return dom;
}
test('missing syntax bundle preserves literal source without creating markup', () => {
  const dom = setup();
  const code = dom.window.document.querySelector('code');
  const value = '<img src=x onerror="alert(1)"> & text';
  dom.window.LookAheadVisualCode.render(code, value, 'java');
  assert.equal(code.textContent, value);
  assert.equal(code.querySelector('img'), null);
  dom.window.close();
});
test('gesture copy works when sandbox async clipboard is unavailable and restores focus', async () => {
  const dom = setup();
  const document = dom.window.document;
  const button = document.querySelector('button');
  button.focus();
  let copied;
  document.execCommand = command => {
    assert.equal(command, 'copy');
    copied = document.activeElement.value;
    return true;
  };
  await dom.window.LookAheadVisualCode.copy('line 1\nline 2');
  assert.equal(copied, 'line 1\nline 2');
  assert.equal(document.querySelector('textarea'), null);
  assert.equal(document.activeElement, button);
  dom.window.close();
});
test('async clipboard remains available when selection copy cannot run', async () => {
  const dom = setup();
  let copied;
  dom.window.navigator.clipboard = {writeText:async value => {copied=value;}};
  await dom.window.LookAheadVisualCode.copy('source');
  assert.equal(copied, 'source');
  assert.equal(dom.window.document.querySelector('textarea'), null);
  dom.window.close();
});
