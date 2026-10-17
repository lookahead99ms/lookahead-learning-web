import { describe, expect, it } from 'vitest';

// DLV-803: lesson pages at real browser zoom. Browser zoom Z on a W px screen gives the page a
// CSS viewport of W / Z, so a title sized by a bare vw term stays the same on screen however far
// the learner zooms in. These checks read the stylesheets as written.
type Fs = { readFileSync(path: string, encoding: 'utf8'): string };
const fs = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }
).process.getBuiltinModule('node:fs') as Fs;
const read = (path: string) => fs.readFileSync(path, 'utf8');

const files = {
  styles: 'src/styles.css',
  question: 'src/app/pages/question/question.ts',
  answer: 'src/app/pages/question/question-answer.css',
  shell: 'src/app/core/foundation-lesson-shell/foundation-lesson-shell.ts',
  scenario: 'src/app/core/foundation-lesson-shell/lesson-scenario-card.ts',
  pattern: 'src/app/core/pattern-lesson-shell/pattern-lesson-shell.ts',
  start: 'src/app/core/lesson-start/lesson-start.ts',
};

/** Rendered px of `clamp(min, base + kvw, max)` on a `screen` px wide window at `zoom`. */
function shown(clamp: string, screen: number, zoom: number): number {
  const parts = clamp.match(/^clamp\((.+)\)$/)![1].split(',').map((part) => part.trim());
  const viewport = screen / zoom;
  const px = (term: string) =>
    term
      .split('+')
      .map((piece) => piece.trim())
      .reduce((sum, piece) => {
        const value = parseFloat(piece);
        if (piece.endsWith('rem')) return sum + value * 16;
        if (piece.endsWith('vw')) return sum + (value * viewport) / 100;
        return sum + value;
      }, 0);
  const [min, middle, max] = parts.map(px);
  return Math.min(max, Math.max(min, middle)) * zoom;
}

function ruleFontSize(source: string, selector: string): string {
  const start = source.indexOf(selector);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const body = source.slice(start, source.indexOf('}', start));
  return body.match(/(clamp\([^;]*?\))\s*(?:\/|;)/)![1].replace(/\s+/g, ' ');
}

describe('Lesson reader at browser zoom (DLV-803)', () => {
  it('enlarges the lesson titles when the learner zooms in on laptop and desktop screens', () => {
    const titles = [
      ruleFontSize(read(files.styles), 'main:is(.harbor-learn, .harbor-catalog) .module-context-title {'),
      ruleFontSize(read(files.question), 'main:not(.harbor-learn, .focus-studio-page) .article-title-row .reader-question-title {'),
      ruleFontSize(read(files.question), '.studio-pilot-page .reader-question-panel .reader-question-title {'),
      ruleFontSize(read(files.question), '.focus-studio-page .reader-question-title {'),
    ];
    expect(titles[0]).toBe('clamp(2rem, 2rem + 1.6vw, 4rem)');
    for (const title of titles) {
      for (const screen of [1512, 1920]) {
        const base = shown(title, screen, 1);
        expect(shown(title, screen, 1.5) / base, `${title} at 150% on ${screen}`).toBeGreaterThanOrEqual(1.25);
        expect(shown(title, screen, 2) / base, `${title} at 200% on ${screen}`).toBeGreaterThanOrEqual(1.5);
      }
    }
    // The old bare-vw Learn title held 64px from 100% to 200% on a 1512px laptop.
    expect(shown('clamp(2rem, 4.2vw, 4rem)', 1512, 2)).toBeCloseTo(shown('clamp(2rem, 4.2vw, 4rem)', 1512, 1), 0);
  });

  it('gives every fluid reader heading a rem base, never a bare vw middle term', () => {
    // styles.css is shared with other pages; its reader title is checked above.
    for (const path of Object.values(files).filter((path) => path !== files.styles)) {
      const clamps = read(path).match(/font(?:-size)?:[^;]*clamp\([^;]*\)/g) ?? [];
      for (const clamp of clamps) {
        const middle = clamp.match(/clamp\(([^,]+),([^,]+),/)![2];
        if (/vw|cqi|vh/.test(middle)) expect(middle, `${path}: ${clamp}`).toMatch(/\d(rem|px)/);
      }
    }
  });

  it('keeps lesson and answer prose at the shared reading measure on wide monitors', () => {
    expect(read(files.shell)).toMatch(/\.system \{[^}]*--reading-width: var\(--reading-measure, 72ch\);/);
    expect(read(files.shell)).not.toMatch(/--reading-width: none/);
    const answer = read(files.answer);
    expect(answer).not.toMatch(/max-width: (?:8\d|9\d|1\d\d)ch/);
    expect(answer.match(/max-width: var\(--reading-measure, 72ch\)/g)?.length).toBe(4);
    expect(read(files.start)).toMatch(/\.run-locally-body :is\(ul, ol\) \{\s*max-width: var\(--reading-measure, 72ch\);/);
    expect(read(files.styles)).toMatch(/--reading-measure: 72ch;/);
  });

  it('centres the lesson page in the site frame without giving the sidebars any of its width', () => {
    const styles = read(files.styles).replace(/\s+/g, ' ');
    const frame = styles.match(
      /main\.reader-page\[data-sidebar-columns\]:has\(> \.question-detail-reader\):not\(\.focus-studio-page\) \{([^}]*)\}/,
    );
    expect(frame).not.toBeNull();
    expect(frame![1]).toContain('--reader-frame: min(100%, var(--site-frame-max, 100rem));');
    // Each sidebar keeps its own column on both sides of the reader.
    expect(frame![1]).toContain('width: calc(var(--reader-frame) - 2 * var(--reader-sidebar-space)) !important;');
    expect(frame![1]).toContain('max-width: min(1440px, calc(var(--reader-frame) - 2 * var(--reader-sidebar-space))) !important;');
    // Up to the frame the sidebar columns are the laptop's 18vw; beyond it they stop growing.
    expect(styles).toContain('--reader-sidebar-space: clamp(248px, 0.18 * min(100vw, var(--site-frame-max, 100rem)), 360px);');
  });

  it('breaks long inline code names instead of pushing a 320px column sideways', () => {
    const styles = read(files.styles);
    const start = styles.indexOf('.rich code:not(pre code),');
    expect(styles.slice(start, styles.indexOf('}', start))).toContain('overflow-wrap: anywhere;');
  });
});

describe('DLV-965 approach switch placement (user, 2026-10-16)', () => {
  it('moves the approach switch from the title row to sit beside "Show solution" in the workspace', () => {
    const html = read('src/app/pages/question/question.html');
    const actions = html.slice(html.indexOf('<div class="problem-pattern-actions">'));
    expect(actions.slice(0, actions.indexOf('</div>'))).not.toContain('app-optimal-approaches');
    expect(html).not.toContain('problem-approach-switch');
    const studio = read('src/app/core/focus-studio/focus-studio.html');
    const workspace = studio.slice(studio.indexOf('<div class="workspace-actions"'));
    const switchAt = workspace.indexOf('<app-optimal-approaches class="workspace-approach-switch"');
    expect(switchAt).toBeGreaterThan(-1);
    expect(switchAt).toBeLessThan(workspace.indexOf("'Show solution'"));
  });

  it('sizes the switch like the recognize button, with this page filled', () => {
    const css = read('src/app/core/optimal-approaches/optimal-approaches.ts').replace(/\s+/g, ' ');
    expect(css).toContain('.approach-switch { display: inline-flex; flex-wrap: wrap; gap: 3px; padding: 3px; border: 1px solid var(--accent-strong); border-radius: 10px;');
    expect(css).toContain("font-size: 0.95rem; font-weight: 700;");
    expect(css).toContain(".approach-switch .segment[aria-current='page'] { color: var(--accent-on-primary); background: var(--accent-strong); }");
  });
});
