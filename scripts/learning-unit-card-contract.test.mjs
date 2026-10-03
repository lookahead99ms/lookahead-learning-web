import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  cardSceneTextErrors,
  cardSceneValueMaxSize,
  cardSceneWordMaxSize,
  isCardNodeValue,
  isCardSceneValue,
  learningUnitCardErrors,
} from './learning-unit-card-contract.mjs';

const label = 'look-ahead/design-rounds: learning unit reservation-round';
const valid = {
  summary: '2 million fans try to reserve 60,000 seats when an event goes on sale.',
  level: 'Advanced',
  minutes: 45,
  scene: '/content/look-ahead/design-systems/visuals/cards/reservation.svg',
  sceneAlt: 'A seat turns from held to reserved while a second click is refused.',
  pillGroups: [
    { label: 'Patterns', items: ['Contention', 'Handling Bursts'] },
    { label: 'Fundamentals', items: ['Transactions', 'Idempotency', 'Caching', 'Outbox and CDC'] },
  ],
};

test('accepts the full card contract and a summary-only card', () => {
  assert.deepEqual(learningUnitCardErrors(valid, label), []);
  assert.deepEqual(learningUnitCardErrors({ summary: 'One plain line.' }, label), []);
});

test('requires a one-line summary', () => {
  assert.match(learningUnitCardErrors({ ...valid, summary: ' ' }, label)[0], /summary is required/);
  assert.match(learningUnitCardErrors({ ...valid, summary: 'a\nb' }, label)[0], /one line/);
});

test('allows only the three levels and whole-number minutes', () => {
  assert.match(learningUnitCardErrors({ ...valid, level: 'Medium' }, label)[0], /level/);
  assert.match(learningUnitCardErrors({ ...valid, minutes: 4.5 }, label)[0], /minutes/);
});

test('requires a local SVG scene path with alt text', () => {
  assert.match(
    learningUnitCardErrors({ ...valid, scene: 'https://example.com/a.svg' }, label)[0],
    /scene must be/,
  );
  assert.match(
    learningUnitCardErrors({ ...valid, scene: '/content/look-ahead/../x.svg' }, label)[0],
    /scene must be/,
  );
  assert.match(
    learningUnitCardErrors({ ...valid, scene: '/content/look-ahead/cards/a.png' }, label)[0],
    /scene must be/,
  );
  assert.match(
    learningUnitCardErrors({ ...valid, scene: '/assets/other/a.svg' }, label)[0],
    /scene must be/,
  );
  assert.deepEqual(
    learningUnitCardErrors(
      { ...valid, scene: '/assets/scenes/units/look-ahead/design-systems/reservation.svg' },
      label,
    ),
    [],
  );
  const { sceneAlt: _sceneAlt, ...withoutAlt } = valid;
  assert.match(learningUnitCardErrors(withoutAlt, label)[0], /sceneAlt is required/);
});

test('limits pill groups to 1-2 labelled groups of 1-4 short items', () => {
  assert.match(learningUnitCardErrors({ ...valid, pillGroups: [] }, label)[0], /1-2 groups/);
  const three = [...valid.pillGroups, { label: 'More', items: ['x'] }];
  assert.match(learningUnitCardErrors({ ...valid, pillGroups: three }, label)[0], /1-2 groups/);
  assert.match(
    learningUnitCardErrors({ ...valid, pillGroups: [{ label: '', items: ['x'] }] }, label)[0],
    /needs a label/,
  );
  assert.match(
    learningUnitCardErrors(
      { ...valid, pillGroups: [{ label: 'P', items: ['a', 'b', 'c', 'd', 'e'] }] },
      label,
    )[0],
    /1-4 items/,
  );
  assert.match(
    learningUnitCardErrors(
      { ...valid, pillGroups: [{ label: 'P', items: ['x'.repeat(60)] }] },
      label,
    )[0],
    /short/,
  );
});

test('rejects fields outside the contract', () => {
  assert.match(
    learningUnitCardErrors({ ...valid, featured: true }, label)[0],
    /unsupported field featured/,
  );
});

const scene = (body, width = 320, height = (width * 9) / 16) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body}</svg>`;

test('card scene node values and values are recognised', () => {
  for (const value of ['1', '25', 'L', 'R', '+1', '−1', 'AI', 'v1', '?', '✓']) {
    assert.ok(isCardNodeValue(value), value);
  }
  for (const value of ['$40', '$$', '60k/s', '200', '2:10', 'O(n²)', 'p99', '50%', 'sort']) {
    assert.ok(!isCardNodeValue(value), value);
  }
  for (const value of ['O(n²)', 'p99', '200 OK', '$$$', '60k/s']) {
    assert.ok(isCardSceneValue(value), value);
  }
  for (const words of ['sort', 'pop', 'goroutines', 'call stack', 'running total', '10k req/s']) {
    assert.ok(!isCardSceneValue(words), words);
  }
});

test('card drawings may carry words coloured from the scene tokens', () => {
  const words = [
    '<style>.sw-t{font:700 16px system-ui,sans-serif;fill:var(--scene-ink,#102a33)}</style>',
    '<text class="sw-t" x="160" y="28">window slides along</text>',
    '<text x="20" y="60" font-size="14" fill="var(--scene-muted,#536970)">add one, drop one</text>',
    '<text x="20" y="80" style="font:600 12px ui-monospace;fill:var(--scene-good,#1f7a4d)">200 OK</text>',
    '<text x="20" y="100" font-size="16" fill="#fff">7</text>',
    '<text x="20" y="120" font-size="16" fill="var(--scene-card,#fff)">Pay</text>',
    '<g fill="var(--scene-text,#28434a)"><text x="1" y="1" font-size="10">Madrid</text></g>',
  ].join('');
  assert.deepEqual(cardSceneTextErrors(scene(words), 'demo'), []);
  // A 240-wide Look Ahead scene at its usual 14 units, and a large DSA value.
  assert.deepEqual(
    cardSceneTextErrors(scene('<text font-size="14">Double room</text>', 240, 135), 'demo'),
    [],
  );
  assert.deepEqual(cardSceneTextErrors(scene('<text font-size="34">#</text>'), 'demo'), []);
});

test('card drawings never colour text outside the shared card text styling', () => {
  for (const [fill, message] of [
    ['#102a33', /own colour/],
    ['red', /own colour/],
    ['var(--text-strong)', /app colour/],
    ['var(--path-learn,#006c73)', /app colour/],
    ['var(--card-title-color)', /app colour/],
  ]) {
    assert.match(
      cardSceneTextErrors(scene(`<text font-size="12" fill="${fill}">queue</text>`), 'demo')[0] ??
        '',
      message,
      fill,
    );
    assert.match(
      cardSceneTextErrors(
        scene(`<style>.x-t{fill:${fill}}</style><text class="x-t" font-size="12">queue</text>`),
        'demo',
      )[0] ?? '',
      message,
      `class ${fill}`,
    );
  }
  assert.match(
    cardSceneTextErrors(
      scene('<text style="font:700 12px system-ui;fill:#000">queue</text>'),
      'demo',
    )[0] ?? '',
    /own colour/,
  );
});

test('card drawings cannot override the shared card text styling with !important', () => {
  for (const body of [
    '<style>.x-t{font-family:Georgia!important}</style><text class="x-t">queue</text>',
    '<style>.x-t{fill:var(--scene-ink) !important}</style><text class="x-t">queue</text>',
    '<text style="font-weight:800 !important">queue</text>',
  ]) {
    assert.match(cardSceneTextErrors(scene(body), 'demo')[0] ?? '', /!important/, body);
  }
  // Animation overrides elsewhere in the scene are fine.
  assert.deepEqual(
    cardSceneTextErrors(
      scene('<style>@media (prefers-reduced-motion: reduce){.x{animation:none!important}}</style>'),
      'demo',
    ),
    [],
  );
});

test('card drawings keep text below headline scale', () => {
  assert.equal(cardSceneWordMaxSize(320), 30);
  assert.equal(cardSceneWordMaxSize(240), 22.5);
  assert.equal(cardSceneValueMaxSize(320), 44);
  assert.deepEqual(cardSceneTextErrors(scene('<text font-size="30">queue</text>'), 'demo'), []);
  assert.match(
    cardSceneTextErrors(scene('<text font-size="32">queue</text>'), 'demo')[0] ?? '',
    /headline scale/,
  );
  assert.match(
    cardSceneTextErrors(
      scene('<style>.h{font:800 26px system-ui}</style><text class="h">Sold out</text>', 240, 135),
      'demo',
    )[0] ?? '',
    /headline scale/,
  );
  assert.deepEqual(cardSceneTextErrors(scene('<text font-size="40">$40</text>'), 'demo'), []);
  assert.match(
    cardSceneTextErrors(scene('<text font-size="48">7</text>'), 'demo')[0] ?? '',
    /headline scale/,
  );
});

// The shared styling itself: drawing words never take the title's colour or weight.
const webRoot = new URL('../', import.meta.url).pathname;
const rootTokens = (css) => {
  const tokens = new Map();
  for (const [, block] of css.matchAll(/(?:^|\n):root\s*\{([^}]*)\}/g)) {
    for (const [, name, value] of block.matchAll(/(--card-[\w-]+)\s*:\s*([^;]+);/g)) {
      tokens.set(name, value.replace(/\s+/g, ' ').trim());
    }
  }
  return tokens;
};

test('card drawing words use their own tokens, never the title colour or weight', () => {
  const styles = readFileSync(join(webRoot, 'src/styles.css'), 'utf8');
  const tokens = rootTokens(styles);
  for (const name of [
    '--card-title-color',
    '--card-title-weight',
    '--card-scene-text-font',
    '--card-scene-code-font',
    '--card-scene-text-weight',
    '--card-scene-text-color',
  ]) {
    assert.ok(tokens.has(name), `${name} is defined on :root`);
  }
  assert.notEqual(tokens.get('--card-scene-text-color'), tokens.get('--card-title-color'));
  assert.doesNotMatch(tokens.get('--card-scene-text-color'), /--(?:path-|card-title|text-strong)/);
  assert.ok(
    Number(tokens.get('--card-scene-text-weight')) < Number(tokens.get('--card-title-weight')),
  );
  assert.doesNotMatch(tokens.get('--card-scene-text-font'), /^system-ui/);
  // Round 7: drawing text stays clearly smaller than the title (a share of --card-title-size).
  for (const [name, limit] of [
    ['--card-scene-text-max-ratio', 0.8],
    ['--card-scene-mark-max-ratio', 0.9],
  ]) {
    const value = Number(tokens.get(name));
    assert.ok(value > 0.5 && value <= limit, `${name} = ${tokens.get(name)}`);
  }
  assert.ok(
    Number(tokens.get('--card-scene-text-max-ratio')) <=
      Number(tokens.get('--card-scene-mark-max-ratio')),
  );
  assert.match(styles, /@property --card-scene-text-max \{\s*syntax: '<length>';/);
  assert.match(styles, /@property --card-scene-mark-max \{\s*syntax: '<length>';/);
  for (const path of ['learn', 'grow', 'look-ahead']) {
    assert.match(
      styles,
      new RegExp(
        `\\.${path}-catalog-reader,\\s*\\.learning-map\\[data-path='${path}'\\]\\s*\\{\\s*--card-title-color: var\\(--card-title-${path}\\);`,
      ),
      path,
    );
  }
  // Card titles are apricot in both themes (user, 2026-10-02), never the drawing-text colour.
  assert.match(styles, /--card-title-learn: #a84e17;/);
  assert.match(styles, /:root\[data-theme='dark'\][\s\S]*--card-title-look-ahead: #ffba87;/);
  const catalog = readFileSync(join(webRoot, 'src/app/pages/catalog-experience.css'), 'utf8');
  const unitMap = readFileSync(
    join(webRoot, 'src/app/core/course-learning-map/course-learning-map.ts'),
    'utf8',
  );
  assert.match(catalog, /\.catalog-group-card \{\s*--card-title-size:/);
  assert.match(catalog, /\.catalog-course-card \{\s*--card-title-size:/);
  assert.match(unitMap, /\.unit-card-item \{\s*--card-title-size:/);
  for (const source of [catalog, unitMap]) {
    assert.doesNotMatch(
      source.replace(/\/\*[\s\S]*?\*\//g, ''),
      /(?:catalog-path-title|catalog-course-title|unit-card-title) \{[^}]*font-size: (?!var\(--card-title-size)/,
    );
  }
  const component = readFileSync(join(webRoot, 'src/app/core/card-scene/card-scene.ts'), 'utf8');
  for (const rule of [
    /--scene-ink: var\(--card-scene-text-color/,
    /font-family: var\(--card-scene-text-font[^;]*!important/,
    /font-weight: var\(--card-scene-text-weight[^;]*!important/,
    /--card-scene-text-max: calc\(\s*var\(--card-title-size/,
    /font-size: min\(\s*var\(--scene-size\),\s*var\(--card-scene-text-limit[^;]*!important/,
    /font-size: min\(\s*var\(--scene-size\),\s*var\(--card-scene-mark-limit[^;]*!important/,
  ]) {
    assert.match(component, rule);
  }
});

// Every catalog course/group card and course unit card drawing shipped with the app, plus the
// Look Ahead content card sources when the private content checkout sits next to this one.
const scenesRoot = new URL('../public/assets/scenes/', import.meta.url).pathname;
const contentLookAhead = new URL('../../lookahead-learning-content/runtime/look-ahead/', import.meta.url)
  .pathname;
const cardSceneDirs = ['courses', 'groups', 'units'].map((dir) => join(scenesRoot, dir));
const walkSvgs = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walkSvgs(path);
    return path.endsWith('.svg') ? [path] : [];
  });

test('every card drawing shipped with the app leaves its text to the card styling', (t) => {
  const dirs = cardSceneDirs.filter((dir) => existsSync(dir));
  if (!dirs.length) return t.skip('public/assets/scenes is not present in this checkout');
  const files = dirs.flatMap(walkSvgs);
  assert.ok(files.length > 0);
  const errors = files.flatMap((file) =>
    cardSceneTextErrors(readFileSync(file, 'utf8'), relative(scenesRoot, file)),
  );
  assert.deepEqual(errors, []);
});

test('every Look Ahead content card drawing leaves its text to the card styling', (t) => {
  if (!existsSync(contentLookAhead)) return t.skip('the content checkout is not next to this one');
  const files = walkSvgs(contentLookAhead).filter((file) => file.includes('/visuals/cards/'));
  assert.ok(files.length > 0);
  const errors = files.flatMap((file) =>
    cardSceneTextErrors(readFileSync(file, 'utf8'), relative(contentLookAhead, file)),
  );
  assert.deepEqual(errors, []);
});
