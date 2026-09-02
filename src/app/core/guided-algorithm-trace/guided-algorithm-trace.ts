import { Component, computed, effect, input, signal } from '@angular/core';
import {
  GuidedTraceCell,
  PatternLanguage,
  PatternProblemFixture,
  PatternProblemV1,
} from '../../content/content.models';
import { CodeCopyButton } from '../code-copy-button/code-copy-button';

@Component({
  selector: 'app-guided-algorithm-trace',
  imports: [CodeCopyButton],
  template: `
    <section
      class="guided-trace"
      role="region"
      tabindex="0"
      [attr.data-language]="language()"
      [attr.aria-label]="problem().title + ' guided trace'"
      (keydown)="handleShortcut($event)"
    >
      <header class="trace-toolbar">
        <div>
          <span>Guided trace</span><strong>{{ problem().title }}</strong>
        </div>
        <div class="trace-controls" aria-label="Trace controls">
          <button
            type="button"
            (click)="previous()"
            [disabled]="stepIndex() === 0"
            aria-describedby="trace-boundary-status"
          >
            Previous
          </button>
          <button type="button" (click)="reset()">Reset</button>
          <button
            type="button"
            class="primary"
            (click)="next()"
            [disabled]="stepIndex() === events().length - 1"
            aria-describedby="trace-boundary-status"
          >
            Next
          </button>
        </div>
        <p class="step-status">
          <span>Current step</span>{{ stepIndex() + 1 }} of {{ events().length }} ·
          {{ event().phase }} · {{ event().label }}
        </p>
      </header>

      <div class="trace-context">
        <p><span>Guided input</span>{{ tracedFixture().input }}</p>
        <p><span>Expected output</span>{{ tracedFixture().expectedOutput }}</p>
        @if (selectedFixture().id !== tracedFixture().id) {
          <p class="fixture-note">
            <span>Selected edge case</span>The trace remains on {{ tracedFixture().label }};
            {{ selectedFixture().label }} is available for independent dry-run practice.
          </p>
        }
      </div>

      <div class="language-tabs" role="tablist" aria-label="Trace language">
        @for (code of problem().implementations; track code.language; let index = $index) {
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="language() === code.language"
            [attr.tabindex]="language() === code.language ? 0 : -1"
            [attr.aria-controls]="'guided-source-panel'"
            (click)="selectLanguage(code.language)"
            (keydown)="moveLanguageTab($event, index)"
          >
            {{ code.language }}
          </button>
        }
      </div>

      <div class="trace-workspace">
        <section
          class="source-panel"
          id="guided-source-panel"
          role="tabpanel"
          aria-label="Selected source implementation"
        >
          <div class="pane-heading">
            <span>Source implementation</span>
            <div class="pane-actions">
              <span>{{ language().toUpperCase() }} · {{ themeLabel() }}</span>
              <app-code-copy-button [code]="sourceText()" />
            </div>
          </div>
          <pre
            tabindex="0"
          ><code>@for (line of source().lines; track line.id; let lineNumber = $index) {<span [class.active]="line.id === activeAnchor()" [attr.aria-current]="line.id === activeAnchor() ? 'step' : null"><b>{{ lineNumber + 1 }}</b><i>{{ line.text || ' ' }}</i></span>}</code></pre>
        </section>
        <section class="explanation-panel" aria-label="Current trace explanation">
          <div class="pane-heading">
            {{ event().timing === 'before' ? 'State before this line' : 'State after this line' }}
          </div>
          <article>
            <strong>What happens</strong>
            <p>{{ event().what }}</p>
            <strong>Why this is safe or necessary</strong>
            <p>{{ event().why }}</p>
          </article>
          <dl class="variables">
            @for (variable of event().variables; track variable.name) {
              <div [class.changed]="variable.changed">
                <dt>
                  {{ variable.name }} <small>{{ variable.type }}</small>
                  @if (variable.changed) {
                    <em>changed</em>
                  }
                </dt>
                <dd>{{ variable.value }}</dd>
              </div>
            }
          </dl>
        </section>
      </div>

      <section class="state-view" aria-label="Complete data state">
        <div class="legend" aria-label="State legend">
          @for (item of problem().trace.legend; track item.state) {
            <span><i [attr.data-state]="item.state" aria-hidden="true"></i>{{ item.label }}</span>
          }
        </div>
        @for (row of event().rows; track row.id) {
          <div class="state-row">
            <strong>{{ row.label }}</strong>
            <div class="state-cells" role="list" [attr.aria-label]="row.label">
              @for (cell of row.cells; track $index) {
                <span
                  role="listitem"
                  [class]="cellClasses(cell)"
                  [attr.aria-label]="cellLabel(cell, $index)"
                  ><b>{{ cell.value }}</b>
                  @if (cell.note) {
                    <small>{{ cell.note }}</small>
                  }
                </span>
              }
            </div>
          </div>
        }
        @if (event().result) {
          <p class="trace-result"><strong>Result:</strong> {{ event().result }}</p>
        }
      </section>

      <details class="trace-transcript">
        <summary>Read the full trace transcript</summary>
        <div class="transcript-context">
          <p><strong>Input:</strong> {{ tracedFixture().input }}</p>
          <p><strong>Expected output:</strong> {{ tracedFixture().expectedOutput }}</p>
          <p>
            <strong>Complexity:</strong> {{ problem().complexity.time }} time ·
            {{ problem().complexity.space }} space
          </p>
        </div>
        <p><strong>Invariant:</strong> {{ problem().trace.invariant }}</p>
        <ol>
          @for (step of events(); track step.id) {
            <li>
              <strong>{{ step.phase }} · {{ step.label }}</strong
              ><span>{{ step.what }}</span
              ><span><b>Why:</b> {{ step.why }}</span
              ><span><b>State:</b> {{ transcriptState(step.variables) }}</span>
              @if (step.result) {
                <span><b>Result:</b> {{ step.result }}</span>
              }
            </li>
          }
        </ol>
      </details>
      <p id="trace-boundary-status" class="boundary-status">{{ boundaryStatus() }}</p>
      <p class="sr-status" aria-live="polite" aria-atomic="true">{{ announcement() }}</p>
    </section>
  `,
  styles: [
    `
      .guided-trace {
        position: relative;
        overflow: clip;
        border: 1px solid #35566c;
        border-radius: 16px;
        color: #e6f4f6;
        background: #102333;
        box-shadow: 0 14px 34px rgba(15, 49, 62, 0.14);
      }
      .trace-toolbar {
        position: sticky;
        z-index: 4;
        top: 104px;
        display: grid;
        grid-template-columns: minmax(180px, 1fr) auto minmax(190px, 1fr);
        align-items: center;
        gap: 14px;
        padding: 13px 17px;
        border-bottom: 1px solid #315569;
        background: rgba(23, 51, 70, 0.97);
        backdrop-filter: blur(10px);
      }
      .trace-toolbar span,
      .trace-context span,
      .pane-heading {
        display: block;
        color: #8fd9e3;
        font-size: 0.68rem;
        font-weight: 850;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }
      .trace-toolbar strong {
        display: block;
        margin-top: 2px;
        color: #f4fbfc;
      }
      .trace-controls {
        display: flex;
        gap: 7px;
      }
      .trace-controls button {
        min-height: 38px;
        padding: 7px 12px;
        border: 1px solid #4d7789;
        border-radius: 7px;
        color: #edf9fa;
        background: #2d5267;
        cursor: pointer;
        font:
          750 0.78rem 'Avenir Next',
          sans-serif;
      }
      .trace-controls .primary {
        border-color: #24c2cd;
        background: #168a9b;
      }
      .trace-controls button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .trace-controls button:focus-visible,
      .language-tabs button:focus-visible,
      .guided-trace:focus-visible {
        outline: 3px solid #8de7ed;
        outline-offset: 2px;
      }
      .step-status {
        margin: 0;
        color: #f1fafa;
        font:
          700 0.76rem/1.4 'JetBrains Mono',
          monospace;
        text-align: right;
      }
      .trace-context {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        padding: 12px 17px;
        border-bottom: 1px solid #315569;
        background: #143041;
      }
      .trace-context p {
        margin: 0;
        color: #f1fafa;
        font:
          700 0.78rem/1.5 'JetBrains Mono',
          monospace;
      }
      .trace-context .fixture-note {
        grid-column: 1/-1;
        padding: 8px 10px;
        border-left: 3px solid #f8c35a;
        color: #ffe6a8;
        background: #3d3526;
      }
      .language-tabs {
        display: flex;
        padding: 0 13px;
        border-bottom: 1px solid #315569;
        background: #102b3a;
      }
      .language-tabs button {
        min-width: 86px;
        min-height: 43px;
        border: 0;
        border-bottom: 3px solid transparent;
        color: #aac8cf;
        background: transparent;
        cursor: pointer;
        font:
          800 0.76rem 'Avenir Next',
          sans-serif;
        text-transform: capitalize;
      }
      .language-tabs button[aria-selected='true'] {
        border-bottom-color: #2cd4da;
        color: #fff;
        background: #1a4556;
      }
      .trace-workspace {
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr);
      }
      .source-panel {
        min-width: 0;
        border-right: 1px solid #315569;
        background: #282c34;
      }
      .pane-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 11px 15px;
        border-bottom: 1px solid #315569;
      }
      .pane-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .source-panel pre {
        max-height: 560px;
        margin: 0;
        padding: 12px 0;
        overflow: auto;
        font:
          13px/1.7 'JetBrains Mono',
          monospace;
      }
      .source-panel code > span {
        display: grid;
        grid-template-columns: 42px minmax(max-content, 1fr);
        min-height: 1.7em;
        padding-right: 14px;
        border-left: 4px solid transparent;
        color: #cadce3;
        white-space: pre;
      }
      .source-panel code > span.active {
        border-left-color: #61afef;
        color: #fff;
        background: #3a506c;
      }
      .guided-trace[data-language='python'] .source-panel {
        background: #282a36;
      }
      .guided-trace[data-language='python'] .source-panel code > span.active {
        border-left-color: #ff79c6;
        background: #4b3e5d;
      }
      .guided-trace[data-language='go'] .source-panel {
        background: #292d3e;
      }
      .guided-trace[data-language='go'] .source-panel code > span.active {
        border-left-color: #89ddff;
        background: #3d4565;
      }
      .source-panel b {
        padding-right: 10px;
        color: #6f91a1;
        text-align: right;
        font-weight: 500;
      }
      .source-panel i {
        font-style: normal;
      }
      .explanation-panel {
        background: #102333;
      }
      .explanation-panel article {
        margin: 16px;
        padding: 14px;
        border-left: 4px solid #27c2d0;
        border-radius: 0 8px 8px 0;
        background: #183c50;
      }
      .explanation-panel article strong {
        display: block;
        color: #7be2e9;
        font-size: 0.72rem;
        text-transform: uppercase;
      }
      .explanation-panel article p {
        margin: 6px 0 13px;
        color: #e4f3f5;
        font-size: 0.86rem;
        line-height: 1.55;
      }
      .variables {
        display: grid;
        gap: 7px;
        margin: 0;
        padding: 0 16px 16px;
      }
      .variables div {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        padding: 8px;
        border: 1px solid #315569;
        border-radius: 7px;
        background: #143041;
      }
      .variables div.changed {
        border-color: #f8c35a;
      }
      .variables dt {
        color: #cda5f5;
        font:
          700 0.75rem 'JetBrains Mono',
          monospace;
      }
      .variables dt small {
        color: #91abb5;
      }
      .variables dt em {
        margin-left: 6px;
        color: #ffd17a;
        font:
          800 0.62rem 'Avenir Next',
          sans-serif;
        text-transform: uppercase;
      }
      .variables dd {
        margin: 0;
        color: #fff;
        font:
          700 0.75rem 'JetBrains Mono',
          monospace;
        text-align: right;
      }
      .state-view {
        padding: 16px 18px;
        border-top: 1px solid #315569;
        background: #112b3b;
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 14px;
        margin-bottom: 12px;
        color: #b8d2d8;
        font-size: 0.73rem;
      }
      .legend span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .legend i {
        width: 10px;
        height: 10px;
        border: 1px solid #557b89;
        border-radius: 3px;
        background: #1a3b4b;
      }
      .legend i[data-state='active'],
      .legend i[data-state='changed'] {
        border-color: #24d2dd;
        background: #157082;
      }
      .legend i[data-state='boundary'],
      .legend i[data-state='related'] {
        border-color: #f8c35a;
        background: #6a4f25;
      }
      .legend i[data-state='range'] {
        border-color: #70b7c5;
        background: #24546a;
      }
      .legend i[data-state='resolved'] {
        border-color: #7fe3c4;
        background: #22634f;
      }
      .legend i[data-state='discarded'] {
        background: #263842;
        opacity: 0.55;
      }
      .state-row {
        display: grid;
        grid-template-columns: 90px minmax(0, 1fr);
        align-items: center;
        gap: 10px;
        margin-top: 9px;
      }
      .state-row > strong {
        color: #8bdfe7;
        font:
          800 0.7rem 'JetBrains Mono',
          monospace;
        text-transform: uppercase;
      }
      .state-cells {
        display: flex;
        overflow: auto;
      }
      .state-cells span {
        display: grid;
        flex: 0 0 auto;
        min-width: 52px;
        min-height: 48px;
        place-items: center;
        padding: 4px;
        border: 1px solid #456c7b;
        border-right: 0;
        color: #d9e8ed;
        background: #183344;
        font:
          700 0.82rem 'JetBrains Mono',
          monospace;
      }
      .state-cells span:first-child {
        border-radius: 6px 0 0 6px;
      }
      .state-cells span:last-child {
        border-right: 1px solid #456c7b;
        border-radius: 0 6px 6px 0;
      }
      .state-cells span.active,
      .state-cells span.changed {
        border-color: #24d2dd;
        color: #fff;
        background: #157082;
      }
      .state-cells span.boundary,
      .state-cells span.related {
        border-color: #f8c35a;
        color: #fff0cf;
        background: #6a4f25;
      }
      .state-cells span.range {
        background: #24546a;
      }
      .state-cells span.resolved {
        background: #22634f;
      }
      .state-cells span.discarded {
        opacity: 0.5;
      }
      .state-cells small {
        color: #a9c2ca;
        font-size: 0.6rem;
      }
      .trace-result {
        margin: 13px 0 0;
        padding: 9px 11px;
        border-left: 4px solid #ffd17a;
        color: #fff0cf;
        background: #3e382c;
        font:
          700 0.8rem/1.5 'JetBrains Mono',
          monospace;
      }
      .trace-transcript {
        border-top: 1px solid #315569;
        background: #f8fcfd;
        color: #26384c;
      }
      .trace-transcript summary {
        padding: 14px 17px;
        cursor: pointer;
        color: #116f82;
        font-weight: 800;
      }
      .trace-transcript summary:focus-visible {
        outline: 3px solid #168ca5;
        outline-offset: -3px;
      }
      .trace-transcript > p,
      .trace-transcript ol {
        margin: 0 18px 16px;
      }
      .transcript-context {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin: 0 18px 14px;
      }
      .transcript-context p {
        margin: 0;
        padding: 9px 11px;
        border: 1px solid #d4e2e8;
        border-radius: 8px;
        background: #fff;
        overflow-wrap: anywhere;
      }
      .transcript-context strong {
        display: block;
        margin-bottom: 3px;
        color: #116f82;
        font-size: 0.7rem;
        text-transform: uppercase;
      }
      .trace-transcript ol {
        display: grid;
        gap: 10px;
        padding-left: 22px;
      }
      .trace-transcript li {
        padding-left: 4px;
      }
      .trace-transcript li span {
        display: block;
        margin-top: 3px;
        line-height: 1.5;
      }
      .boundary-status {
        margin: 0;
        padding: 8px 17px;
        color: #9fbcc4;
        background: #173346;
        font-size: 0.72rem;
      }
      .sr-status {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      @media (max-width: 850px) {
        .trace-toolbar {
          top: 88px;
          grid-template-columns: 1fr;
        }
        .step-status {
          text-align: left;
        }
        .trace-workspace {
          grid-template-columns: 1fr;
        }
        .source-panel {
          border-right: 0;
          border-bottom: 1px solid #315569;
        }
      }
      @media (max-width: 560px) {
        .trace-toolbar {
          position: static;
        }
        .trace-context {
          grid-template-columns: 1fr;
        }
        .trace-controls {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
        }
        .state-row {
          grid-template-columns: 1fr;
        }
        .transcript-context {
          grid-template-columns: 1fr;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .trace-toolbar {
          backdrop-filter: none;
        }
        * {
          scroll-behavior: auto !important;
          transition: none !important;
        }
      }
      @media (forced-colors: active) {
        .guided-trace,
        .trace-toolbar,
        .trace-context,
        .source-panel,
        .explanation-panel,
        .state-view,
        .trace-transcript,
        .trace-transcript li {
          border-color: CanvasText;
          color: CanvasText;
          background: Canvas;
          box-shadow: none;
        }
        .trace-controls button,
        .language-tabs button {
          border: 1px solid ButtonText;
          color: ButtonText;
          background: ButtonFace;
        }
        .language-tabs button[aria-selected='true'] {
          border: 3px solid Highlight;
          color: HighlightText;
          background: Highlight;
        }
        .source-panel code > span[aria-current='step'],
        .state-cells span:not([class='']) {
          outline: 3px solid Highlight;
          outline-offset: -3px;
        }
        .trace-controls button:focus-visible,
        .language-tabs button:focus-visible,
        .guided-trace:focus-visible,
        summary:focus-visible,
        pre:focus-visible {
          outline-color: Highlight;
        }
      }
    `,
  ],
})
export class GuidedAlgorithmTrace {
  readonly problem = input.required<PatternProblemV1>();
  readonly selectedFixture = input.required<PatternProblemFixture>();
  protected readonly language = signal<PatternLanguage>('java');
  protected readonly stepIndex = signal(0);
  protected readonly announcement = signal('');
  protected readonly events = computed(() => this.problem().trace.events);
  protected readonly event = computed(() => this.events()[this.stepIndex()] ?? this.events()[0]);
  protected readonly source = computed(
    () =>
      this.problem().implementations.find((item) => item.language === this.language()) ??
      this.problem().implementations[0],
  );
  protected readonly sourceText = computed(() =>
    this.source()
      .lines.map((line) => line.text)
      .join('\n'),
  );
  protected readonly activeAnchor = computed(() => this.event().sourceAnchor[this.language()]);
  protected readonly themeLabel = computed(
    () =>
      ({
        java: 'One Dark Pro',
        python: 'Dracula',
        go: 'Material Palenight',
      })[this.language()],
  );
  protected readonly tracedFixture = computed(
    () =>
      this.problem().fixtures.find((fixture) => fixture.id === this.problem().trace.fixtureId) ??
      this.problem().fixtures[0],
  );

  constructor() {
    let previousProblem = '';
    let previousFixture = '';
    effect(() => {
      const problemId = this.problem().id;
      const fixtureId = this.selectedFixture().id;
      if (previousProblem && previousProblem !== problemId) {
        this.stepIndex.set(0);
        this.announcement.set(`${this.problem().title} selected. Trace reset to step 1.`);
      } else if (previousFixture && previousFixture !== fixtureId) {
        this.stepIndex.set(0);
        const selected = this.selectedFixture();
        const traced = this.tracedFixture();
        this.announcement.set(
          selected.id === traced.id
            ? `${selected.label} selected. Trace reset to step 1.`
            : `${selected.label} selected for independent dry-run practice. Guided trace reset to ${traced.label}, step 1.`,
        );
      }
      previousProblem = problemId;
      previousFixture = fixtureId;
    });
  }

  protected previous(): void {
    this.setStep(this.stepIndex() - 1);
  }
  protected next(): void {
    this.setStep(this.stepIndex() + 1);
  }
  protected reset(): void {
    this.stepIndex.set(0);
    this.announcement.set('Trace reset to step 1.');
  }

  protected selectLanguage(value: string): void {
    this.language.set(value as PatternLanguage);
    this.announcement.set(`${value} selected. Still on ${this.event().label}.`);
  }

  protected moveLanguageTab(event: KeyboardEvent, index: number): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const count = this.problem().implementations.length;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? count - 1
          : event.key === 'ArrowRight'
            ? (index + 1) % count
            : (index - 1 + count) % count;
    const language = this.problem().implementations[next].language as PatternLanguage;
    this.selectLanguage(language);
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [next]?.focus();
  }

  protected handleShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.matches('button, select, summary, a, pre, input, textarea')) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.previous();
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.next();
    }
    if (event.key === 'Home') {
      event.preventDefault();
      this.reset();
    }
  }

  protected cellClasses(cell: GuidedTraceCell): string {
    return cell.states?.join(' ') ?? '';
  }

  protected cellLabel(cell: GuidedTraceCell, index: number): string {
    const states = cell.states?.length ? `, ${cell.states.join(', ')}` : '';
    return `Position ${index}, value ${cell.value}${cell.note ? `, ${cell.note}` : ''}${states}`;
  }

  protected transcriptState(variables: { name: string; value: string }[]): string {
    return variables.map((variable) => `${variable.name} = ${variable.value}`).join('; ');
  }

  protected boundaryStatus(): string {
    if (this.stepIndex() === 0) return 'At the first step. Previous is unavailable.';
    if (this.stepIndex() === this.events().length - 1)
      return 'Trace complete. Next is unavailable.';
    return 'Previous, Next, and Reset are available. Focus the trace region and use Left Arrow, Right Arrow, or Home as shortcuts.';
  }

  private setStep(next: number): void {
    const index = Math.max(0, Math.min(next, this.events().length - 1));
    if (index === this.stepIndex()) return;
    this.stepIndex.set(index);
    this.announcement.set(
      `Step ${index + 1} of ${this.events().length}: ${this.event().phase}, ${this.event().label}.`,
    );
  }
}
