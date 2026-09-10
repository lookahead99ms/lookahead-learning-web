import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const css = postcss.parse(readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8'));
const palette = (theme) => {
  const tokens = {};
  css.walkRules((rule) => {
    if (rule.parent.type === 'atrule') return;
    if (
      rule.selector !== ':root' &&
      !(theme === 'dark' && rule.selector === ":root[data-theme='dark']")
    )
      return;
    rule.walkDecls((decl) => {
      if (decl.prop.startsWith('--')) tokens[decl.prop] = decl.value;
    });
  });
  const resolve = (name) => {
    const value = tokens[name];
    assert.ok(value, `Missing token ${name}`);
    return value.startsWith('var(') ? resolve(value.slice(4, -1)) : value;
  };
  return { tokens, resolve };
};
const luminance = (hex) => {
  const values = hex
    .replace('#', '')
    .match(/../g)
    .slice(0, 3)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
};
const contrast = (a, b) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
for (const theme of ['light', 'dark']) {
  test(`${theme}: reading, actions and code retain readable contrast`, () => {
    const { resolve } = palette(theme);
    const check = (fg, bg, min = 4.5) =>
      assert.ok(
        contrast(resolve(fg), resolve(bg)) >= min,
        `${theme} ${fg}/${bg}: ${contrast(resolve(fg), resolve(bg)).toFixed(2)} < ${min}`,
      );
    for (const bg of ['--surface-page', '--surface', '--surface-muted', '--surface-accent']) {
      for (const fg of ['--text-strong', '--text-body', '--text-subtle', '--accent-link', '--path-learn', '--path-grow', '--path-look-ahead'])
        check(fg, bg);
      check('--accent-focus', bg, 3);
    }
    check('--accent-on-primary', '--accent-strong');
    check('--accent-on-secondary', '--accent-secondary-strong');
    for (const fg of ['--success', '--warning', '--danger']) check(fg, '--surface');
    for (const bg of ['--code-bg', '--code-panel', '--code-highlight']) {
      for (const fg of [
        '--code-ink',
        '--code-muted',
        '--code-keyword',
        '--code-string',
        '--code-number',
        '--code-success',
        '--code-warning',
        '--code-danger',
      ])
        check(fg, bg);
      check('--code-focus', bg, 3);
    }
    check('--code-on-primary', '--code-action');
  });
}
test('theme switching changes colors without changing hero typography', () => {
  const light = palette('light');
  const dark = palette('dark');
  for (const key of ['--hero-font-family', '--hero-font-weight'])
    assert.equal(light.resolve(key), dark.resolve(key));
  assert.notEqual(light.resolve('--surface-page'), dark.resolve('--surface-page'));
});

test('forced colors retain system identity and focus colors', () => {
  const forced = css.nodes.find(node => node.type === 'atrule' && node.params === '(forced-colors: active)');
  assert.ok(forced);
  const tokens = {};
  forced.walkDecls(decl => { tokens[decl.prop] = decl.value; });
  for (const path of ['learn', 'grow', 'look-ahead']) assert.equal(tokens[`--path-${path}`], 'CanvasText');
  assert.equal(tokens['--accent-focus'], 'Highlight');
});
