// Readability and safety rules for the animated landing scenes in public/assets/scenes/landing.
// Run: node --test scripts/landing-scenes.test.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

// Scenes that tell their story without AI (the study plan reschedules on its own).
const withoutAi = ['study-plan'];
const dir = new URL('../public/assets/scenes/landing/', import.meta.url).pathname;
const scenes = readdirSync(dir)
  .filter((file) => file.endsWith('.svg'))
  .map((file) => ({ file, name: file.replace(/\.svg$/, ''), svg: readFileSync(join(dir, file), 'utf8') }));

test('all eight landing scenes are present', () => {
  assert.deepEqual(scenes.map((scene) => scene.name).sort(), [
    'decision',
    'grow',
    'learn',
    'look-ahead',
    'project-guides',
    'study-plan',
    'system-design',
    'topic-workbench',
  ]);
});

for (const { file, name, svg } of scenes) {
  test(`${file}: text is at least 12px in a 320-wide view box`, () => {
    const [, , width] = svg.match(/viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/).slice(1).map(Number);
    const minimum = 12 * (width / 320);
    const sizes = [...svg.matchAll(/font-size="([\d.]+)"/g)].map((match) => Number(match[1]));
    assert.ok(sizes.length > 0);
    for (const size of sizes) assert.ok(size >= Math.max(12, minimum), `font-size ${size}`);
    assert.doesNotMatch(svg, /font-size:\s*[\d.]+px/);
  });

  test(`${file}: AI is a drawn sparkles mark in the accent colour beside a plain bold "AI"`, () => {
    if (withoutAi.includes(name)) {
      assert.doesNotMatch(svg, /\bAI\b/, `${name} tells its story without AI`);
      return;
    }
    const spark = svg.match(new RegExp(`\\.${name}-spark \\{([^}]*)\\}`))?.[1] ?? '';
    assert.match(spark, /fill: var\(--scene-accent, #[0-9a-f]+\)/);
    assert.match(svg, new RegExp(`<path class="${name}-spark" d="M`));
    assert.match(svg, new RegExp(`<text class="${name}-ai-t"[^>]*>AI\\b`));
    // No pill: the old chip and the ✦ glyph are gone.
    assert.doesNotMatch(svg, /chip-bg|✦/);
  });

  test(`${file}: each beat holds at most four words`, () => {
    // Each beat is authored as one line: <g class="<name>-ai">…</g>, <g class="<name>-you">…</g> and so on.
    const beat = new RegExp(`<g class="${name}-(ai|you|ask|slow|miss|plan)">`);
    const groups = svg.split('\n').filter((line) => beat.test(line));
    for (const group of groups) {
      const words = [...group.matchAll(/<text(?![^>]*(?:ai-t|you-t|note-t))[^>]*>([^<]*)<\/text>/g)]
        .map((match) => match[1])
        .join(' ')
        .split(/\s+/)
        .filter((word) => /[\p{L}\p{N}]/u.test(word));
      assert.ok(words.length <= 4, `${words.join(' ')}`);
    }
  });

  test(`${file}: the "You" chip and the AI mark sit together as one exchange`, () => {
    const at = (re) => [...svg.matchAll(re)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    const ai = at(new RegExp(`<g class="${name}-ai-mark" transform="translate\\(([\\d.]+) ([\\d.]+)\\)"`, 'g'));
    const you = at(new RegExp(`<rect class="${name}-you-bg" x="([\\d.]+)" y="([\\d.]+)"`, 'g'));
    if (!ai.length || !you.length) return;
    // A "You" chip in the same column, at most two rows away from an AI mark.
    assert.ok(
      ai.some((a) => you.some((y) => Math.abs(a.x - y.x) <= 8 && Math.abs(a.y - y.y) <= 44)),
      JSON.stringify({ ai, you }),
    );
  });

  test(`${file}: theme variables, prefixed styles and no active content`, () => {
    for (const [, inner] of svg.matchAll(/var\(([^)]*)\)/g)) {
      assert.match(inner, /^--scene-[a-z-]+, #[0-9a-f]{3,8}$/i, inner);
    }
    const style = svg.match(/<style>([\s\S]*)<\/style>/)[1];
    for (const [, selector] of style.matchAll(/(?:^|\n)([^@\n{}][^{}\n]*)\{/g)) {
      for (const part of selector.split(',')) {
        const trimmed = part.trim();
        if (/^\d+%|^(from|to)\b/.test(trimmed)) continue;
        assert.ok(trimmed.startsWith(`.${name}-`), `unprefixed selector ${trimmed}`);
      }
    }
    for (const [, keyframes] of style.matchAll(/@keyframes ([\w-]+)/g)) {
      assert.ok(keyframes.startsWith(`${name}-`), keyframes);
    }
    for (const [, delay] of style.matchAll(/animation-delay: ([^;]+);/g)) {
      assert.match(delay, /^-[\d.]+s$/);
    }
    assert.doesNotMatch(svg, /<script|href=|url\(|@import|on[a-z]+=/i);
  });
}

// The Learn / Grow / Look Ahead path cards show their scenes about 276px wide on desktop.
// A 240x135 view box keeps every 12-unit label at 13px or more on screen at that width.
test('path-card scenes use a 240x135 view box so their text renders at 13px or more', () => {
  for (const name of ['learn', 'grow', 'look-ahead']) {
    const { svg } = scenes.find((scene) => scene.name === name);
    assert.match(svg, /viewBox="0 0 240 135"/, name);
    const sizes = [...svg.matchAll(/font-size="([\d.]+)"/g)].map((match) => Number(match[1]));
    for (const size of sizes) assert.ok((size * 276) / 240 >= 13, `${name}: font-size ${size}`);
  }
});

// Each path card rests on a summary card in large type (page load, reduced motion, and while
// another card plays); the landing page plays one story at a time and the summary returns after it.
test('path-card scenes open on a large-type summary that names AI and you', () => {
  for (const name of ['learn', 'grow', 'look-ahead']) {
    const { svg } = scenes.find((scene) => scene.name === name);
    const summary = svg.split('\n').find((line) => line.startsWith(`<g class="${name}-summary">`));
    assert.ok(summary, name);
    for (const [, size] of summary.matchAll(/font-size="([\d.]+)"/g)) {
      assert.ok((Number(size) * 276) / 240 >= 16, `${name}: summary font-size ${size}`);
    }
    assert.match(summary, new RegExp(`${name}-ai-mark`));
    assert.match(summary, new RegExp(`${name}-you-bg`));
    assert.match(svg, new RegExp(`@keyframes ${name}-kf-summary \\{ 0%, [\\d.]+% \\{ opacity: 1; \\}`));
    // The landing page drives these scenes: nothing animates until it adds "<name>-play" to the
    // root, and then the story plays once (no infinite loop) for data-story-ms milliseconds.
    assert.match(svg, /^<svg [^>]*data-story-ms="\d+"/);
    assert.match(svg, new RegExp(`\\.${name}-play \\.${name}-summary \\{ animation: ${name}-kf-summary [\\d.]+s 1; \\}`));
    assert.match(svg, new RegExp(`\\.${name}-play\\.${name}-paused \\* \\{ animation-play-state: paused; \\}`));
    assert.doesNotMatch(svg, /infinite/);
    for (const [, selector] of svg.matchAll(/\n([^\n{]+) \{ [^}]*animation: /g)) {
      assert.ok(selector.startsWith(`.${name}-play .${name}-`), `${name}: ${selector} animates without the play class`);
    }
  }
});

test('summary AI and You rows sit at the same height on all three path cards', () => {
  const rows = ['learn', 'grow', 'look-ahead'].map((name) => {
    const summary = scenes.find((scene) => scene.name === name).svg.split('\n').find((line) => line.startsWith(`<g class="${name}-summary">`));
    return [
      summary.match(new RegExp(`<g class="${name}-ai-mark" transform="translate\\([\\d.]+ ([\\d.]+)\\)"`))[1],
      summary.match(new RegExp(`<rect class="${name}-you-bg" x="[\\d.]+" y="([\\d.]+)"`))[1],
    ];
  });
  assert.deepEqual(rows[1], rows[0]);
  assert.deepEqual(rows[2], rows[0]);
});

test('the three path stories have the same length so they stay in step', () => {
  const lengths = ['learn', 'grow', 'look-ahead'].map(
    (name) => scenes.find((scene) => scene.name === name).svg.match(/data-story-ms="(\d+)"/)[1],
  );
  assert.deepEqual(new Set(lengths).size, 1, lengths.join(', '));
});

// One dialogue band for the Learn and Grow stories, fixed by role like the summary card: every AI
// line sits on row 1 (y 4) and every You line on row 2 (y 27), at x 6, outside the summary card.
// Look Ahead keeps its own system layout (status top right, full balance) and is exempt.
test('learn and grow stories put AI lines on row 1 and You lines on row 2', () => {
  for (const name of ['learn', 'grow']) {
    const story = scenes
      .find((scene) => scene.name === name)
      .svg.split('\n')
      .filter((line) => !line.startsWith(`<g class="${name}-summary">`))
      .join('\n');
    const you = [...story.matchAll(new RegExp(`<rect class="${name}-you-bg" x="([\\d.]+)" y="([\\d.]+)"`, 'g'))];
    // AI dialogue lines start at the band's x; the AI ranker component is centred in its own box.
    const ai = [...story.matchAll(new RegExp(`<g class="${name}-ai-mark" transform="translate\\(([\\d.]+) ([\\d.]+)\\)"`, 'g'))].filter(
      ([, x]) => x === '6',
    );
    assert.ok(you.length > 0, `${name}: no You line`);
    for (const [, x, y] of you) assert.deepEqual([x, y], ['6', '27'], `${name}: You line at ${x},${y}`);
    for (const [, x, y] of ai) assert.deepEqual([x, y], ['6', '4'], `${name}: AI line at ${x},${y}`);
  }
});
