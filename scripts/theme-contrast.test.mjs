import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Check actual stylesheet roles, not a second copy of the palette. This covers
// solid semantic colors; rendered overlays, opacity and custom editors need UI QA.
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const palettes = [...css.matchAll(/:root(?:\[data-theme='(dark)'\])?\s*\{([^}]+)\}/g)]
  .slice(0, 2)
  .map(([, mode, block]) => ({
    mode: mode || 'light',
    colors: Object.fromEntries(
      [...block.matchAll(/(--[\w-]+):\s*(#[\da-f]{3,6});/gi)].map(([, name, value]) => [
        name,
        rgb(value),
      ]),
    ),
  }));

function rgb(hex) {
  const value =
    hex.length === 4
      ? hex
          .slice(1)
          .split('')
          .map((x) => x + x)
          .join('')
      : hex.slice(1);
  assert.equal(value.length, 6, 'Expected opaque RGB color');
  return value.match(/../g).map((x) => parseInt(x, 16) / 255);
}

function luminance(color) {
  assert.ok(color, 'Missing semantic color');
  const linear = color.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function ratio(foreground, background) {
  const a = luminance(foreground),
    b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function check(foreground, background, minimum, description) {
  const actual = ratio(foreground, background);
  assert.ok(actual >= minimum, `${description}: ${actual.toFixed(2)}:1; expected ${minimum}:1`);
}

for (const { mode, colors } of palettes) {
  test(`${mode}: text, links and path labels remain readable across standard surfaces`, () => {
    for (const surface of [
      '--surface-page',
      '--surface',
      '--surface-muted',
      '--surface-accent',
      '--platform-surface-soft',
    ]) {
      for (const text of [
        '--text-strong',
        '--text-body',
        '--text-subtle',
        '--accent-link',
        '--accent-strong',
        '--path-learn',
        '--path-grow',
        '--path-look-ahead',
      ]) {
        check(colors[text], colors[surface], 4.5, `${text} on ${surface}`);
      }
      check(colors['--accent-focus'], colors[surface], 3, `focus on ${surface}`);
    }
  });

  test(`${mode}: filled actions and hover maintain readable labels`, () => {
    check(colors['--accent-on-primary'], colors['--accent-strong'], 4.5, 'primary action');
    check(
      colors['--accent-on-primary'],
      colors['--accent-strong'].map((x) => x * 0.85),
      4.5,
      'primary hover',
    );
  });

  test(`${mode}: semantic status messages retain contrast on their tinted surfaces`, () => {
    for (const status of ['--success', '--warning', '--danger']) {
      const background = colors[status].map((x, i) => x * 0.1 + colors['--surface'][i] * 0.9);
      check(colors[status], background, 4.5, status);
    }
  });

  test(`${mode}: inverse panels and default code retain readable text`, () => {
    for (const text of ['--panel-ink', '--panel-muted', '--panel-accent']) {
      check(colors[text], colors['--panel-background'], 4.5, text);
    }
    for (const surface of ['--code-bg', '--code-panel', '--code-highlight']) {
      for (const text of [
        '--code-ink',
        '--code-muted',
        '--code-keyword',
        '--code-string',
        '--code-number',
      ]) {
        check(colors[text], colors[surface], 4.5, `${text} on ${surface}`);
      }
    }
  });
}
