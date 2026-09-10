import { Component, computed, input, signal } from '@angular/core';
import { PatternEssentialProblem, TheoryVisual } from '../../content/content.models';
import { authenticCodingVisual } from '../../content/pattern-experience';
import { InteractiveTheoryVisual } from '../interactive-theory-visual/interactive-theory-visual';
import { CodeCopyButton } from '../code-copy-button/code-copy-button';

type Language = 'java' | 'python' | 'go';

@Component({
  selector: 'app-pattern-essential-problems',
  imports: [InteractiveTheoryVisual, CodeCopyButton],
  template: `
    <section class="essential-workspace" aria-label="Three essential pattern problems">
      <header>
        <div>
          <span>Three essential problems</span>
          <h3>{{ activeProblem().title }}</h3>
          <p>{{ activeProblem().description }}</p>
        </div>
        <label
          >Problem<select
            [value]="problemIndex()"
            (change)="chooseProblem($any($event.target).value)"
          >
            @for (problem of problems(); track problem.id; let index = $index) {
              <option [value]="index">{{ index + 1 }}. {{ problem.title }}</option>
            }
          </select></label
        >
      </header>
      <div class="problem-controls">
        <label
          >Input
          <select [value]="variantIndex()" (change)="chooseVariant($any($event.target).value)">
            @for (variant of activeProblem().variants; track variant.id; let index = $index) {
              <option [value]="index">{{ variant.label }}</option>
            }
          </select></label
        >
        <p><span>Active input</span>{{ activeVariant().input }}</p>
        <p><span>Expected output</span>{{ activeVariant().expectedOutput }}</p>
      </div>
      <nav role="tablist" aria-label="Reference language">
        @for (solution of activeProblem().solutions; track solution.language; let index = $index) {
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="languageIndex() === index"
            (click)="languageIndex.set(index)"
          >
            {{ solution.language }}
          </button>
        }
      </nav>
      @if (activeVisual(); as visual) {
        <app-interactive-theory-visual [visual]="visual" />
      } @else {
        <div class="code-fallback">
          <div>
            <span>{{ activeSolution().language }} reference</span
            ><app-code-copy-button [code]="activeSolution().source" />
          </div>
          <pre><code>{{ activeSolution().source }}</code></pre>
        </div>
      }
      <footer>
        <strong>Complexity</strong><span>Time {{ activeProblem().complexity.time }}</span
        ><span>Space {{ activeProblem().complexity.space }}</span>
      </footer>
    </section>
  `,
  styles: [
    `
      .essential-workspace {
        overflow: hidden;
        margin-top: 22px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: var(--surface);
        box-shadow: 0 10px 26px var(--shadow);
      }
      header {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        padding: 18px;
        background: linear-gradient(115deg, var(--surface-accent), var(--surface));
      }
      header span,
      .problem-controls span {
        display: block;
        color: var(--accent-link);
        font-size: 0.68rem;
        font-weight: 850;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }
      header h3 {
        margin: 4px 0;
        color: var(--text-strong);
        font-size: 1.12rem;
      }
      header p {
        max-width: 680px;
        margin: 0;
        color: var(--text-subtle);
        font-size: 0.88rem;
        line-height: 1.5;
      }
      label {
        display: grid;
        align-content: start;
        gap: 5px;
        color: var(--text-subtle);
        font-size: 0.68rem;
        font-weight: 850;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      select {
        min-width: 178px;
        padding: 7px 25px 7px 8px;
        border: 1px solid var(--line);
        border-radius: 7px;
        color: var(--text-strong);
        background: var(--surface);
        font:
          700 0.8rem Inter,
          ui-sans-serif,
          system-ui,
          sans-serif;
      }
      .problem-controls {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr);
        gap: 18px;
        align-items: end;
        padding: 13px 18px;
        border-top: 1px solid var(--line);
        border-bottom: 1px solid var(--line);
        background: var(--surface);
      }
      .problem-controls p {
        min-width: 0;
        margin: 0;
        color: var(--text-strong);
        font:
          700 0.82rem/1.45 'JetBrains Mono',
          Consolas,
          monospace;
        overflow-wrap: anywhere;
      }
      .problem-controls p span {
        margin-bottom: 3px;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      }
      nav {
        display: flex;
        gap: 0;
        padding: 0 12px;
        border-bottom: 1px solid var(--code-line);
        background: var(--code-bg);
      }
      nav button {
        min-height: 46px;
        padding: 0 16px;
        border: 0;
        border-bottom: 3px solid transparent;
        color: var(--code-muted);
        background: transparent;
        cursor: pointer;
        font:
          800 0.78rem Inter,
          ui-sans-serif,
          system-ui,
          sans-serif;
      }
      nav button[aria-selected='true'] {
        border-bottom-color: var(--code-line);
        color: var(--code-ink);
        background: var(--code-panel);
      }
      .code-fallback > div {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 9px 14px;
        border-bottom: 1px solid var(--code-line);
        color: var(--code-keyword);
        background: var(--code-panel);
        font:
          700 0.72rem 'JetBrains Mono',
          Consolas,
          monospace;
        text-transform: uppercase;
      }
      pre {
        min-height: 310px;
        margin: 0;
        padding: 18px;
        color: var(--code-ink);
        background: var(--code-bg);
        white-space: pre-wrap;
        font:
          13px/1.65 'JetBrains Mono',
          Consolas,
          monospace;
      }
      footer {
        display: flex;
        gap: 20px;
        align-items: center;
        padding: 12px 18px;
        color: var(--text-subtle);
        background: var(--surface);
        font-size: 0.8rem;
      }
      footer strong {
        color: var(--text-strong);
      }
      @media (max-width: 700px) {
        header,
        .problem-controls {
          grid-template-columns: 1fr;
          display: grid;
        }
        .problem-controls {
          align-items: stretch;
        }
        select {
          width: 100%;
        }
      }
    `,
  ],
})
export class PatternEssentialProblems {
  readonly problems = input.required<PatternEssentialProblem[]>();
  protected readonly problemIndex = signal(0);
  protected readonly languageIndex = signal(0);
  protected readonly variantIndex = signal(0);
  protected readonly activeProblem = computed(
    () => this.problems()[this.problemIndex()] ?? this.problems()[0],
  );
  protected readonly activeSolution = computed(
    () => this.activeProblem().solutions[this.languageIndex()] ?? this.activeProblem().solutions[0],
  );
  protected readonly activeVariant = computed(
    () => this.activeProblem().variants[this.variantIndex()] ?? this.activeProblem().variants[0],
  );
  protected readonly activeVisual = computed<TheoryVisual | null>(() => {
    const visual = authenticCodingVisual(this.activeProblem().visual ?? null);
    const solution = this.activeSolution();
    if (!visual || !solution) return null;
    const [path, hash = ''] = visual.assetPath.split('#');
    const source = encodeURIComponent(btoa(unescape(encodeURIComponent(solution.source))));
    const variant = this.activeVariant().id;
    return {
      ...visual,
      assetPath: `${path}?lang=${solution.language.toLowerCase()}&input=${variant}${hash ? `&problem=${hash}` : ''}&source=${source}`,
    };
  });
  protected chooseProblem(value: string): void {
    this.problemIndex.set(Number(value));
    this.languageIndex.set(0);
    this.variantIndex.set(0);
  }
  protected chooseVariant(value: string): void {
    this.variantIndex.set(Number(value));
  }
}
