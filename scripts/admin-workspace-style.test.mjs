import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/admin-workspace.css', import.meta.url), 'utf8');
const palette = (selector) => {
  const block = css.slice(css.indexOf(selector)).split('}')[0];
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+):\s*(#[\da-f]{6});/gi)].map(([, key, color]) => [key, color]),
  );
};
const luminance = (hex) =>
  hex
    .slice(1)
    .match(/../g)
    .map((channel) => parseInt(channel, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (a, b) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

for (const [name, selector] of [
  ['light', '.admin-surface {'],
  ['dark', ":root[data-theme='dark'] .admin-surface {"],
]) {
  test(`${name} Admin text and actions retain readable contrast`, () => {
    const colors = palette(selector);
    for (const surface of ['--surface-page', '--surface', '--surface-muted']) {
      for (const text of [
        '--text-strong',
        '--text-body',
        '--text-subtle',
        '--accent-link',
        '--accent-strong',
      ]) {
        assert.ok(contrast(colors[text], colors[surface]) >= 4.5, `${text} on ${surface}`);
      }
    }
    assert.ok(
      contrast(colors['--accent-on-primary'], colors['--accent-strong']) >= 4.5,
      'primary button label',
    );
    assert.ok(contrast(colors['--accent-focus'], colors['--surface-page']) >= 3, 'focus indicator');
  });
}

test('Admin layout stays scoped and retains semantic colors and interaction boundaries', () => {
  assert.doesNotMatch(css, /\b(?:pointer-events|visibility)\s*:/);
  assert.doesNotMatch(css, /position\s*:\s*(?:fixed|absolute)/);
  assert.doesNotMatch(css, /--(?:danger|success|warning|code-[\w-]+|path-[\w-]+)\s*:/);
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)}/g);
  for (const [, selector, declarations] of rules) {
    assert.ok(
      selector.includes('.admin-surface') || selector.includes('.admin-workspace'),
      selector,
    );
    if (/display\s*:\s*none/.test(declarations)) {
      assert.doesNotMatch(selector, /button|input|select|textarea|\[role|\.tab/);
      assert.match(selector, /hero-mark|intro-heading|\[data-workspace-panel\]\[hidden\]/);
    }
  }
});

test('Delivery overview uses theme-aware text instead of dark code-panel ink', () => {
  const delivery = readFileSync(
    new URL('../src/app/pages/delivery-plan/delivery-plan.css', import.meta.url),
    'utf8',
  );
  const overview = delivery.slice(
    delivery.indexOf('.delivery-page-heading {'),
    delivery.indexOf('.delivery-workspace { min-width:'),
  );
  // DLV-995: the heading carries the one action; the glance cards below use the shared surface tokens.
  assert.doesNotMatch(overview, /--code-ink|--code-panel/);
  assert.match(overview, /\.delivery-page-heading \.delivery-work-link \{[^}]*background: var\(--accent-strong\)/);
  assert.match(delivery, /\.glance-card \{[^}]*background: var\(--surface\)/);
  assert.match(delivery, /\.glance-heading p \{[^}]*color: var\(--text-subtle\)/);
  assert.doesNotMatch(delivery, /\.delivery-current-focus|\.completion-context/);
});
