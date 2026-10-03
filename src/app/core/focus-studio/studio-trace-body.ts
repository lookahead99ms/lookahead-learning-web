import { Component, ElementRef, computed, effect, input, viewChild } from '@angular/core';
import {
  DsaProblemFixtureV2,
  PatternLanguage,
  PatternProblemV1,
} from '../../content/content.models';
import { TraceSnapshot } from '../guided-algorithm-trace/trace-model';
import { TraceStatePanel } from '../guided-algorithm-trace/trace-state-panel';
import { StudioEssentialState } from './studio-essential-state';
import { StudioInspector } from './studio-inspector';
import { editorPalettes, highlightStudioSource } from './code-presentation';

@Component({
  selector: 'app-studio-trace-body',
  imports: [StudioInspector, StudioEssentialState, TraceStatePanel],
  template: `<div
    class="trace-body"
    [class.with-inspector]="debugger()"
    [class.contextual]="contextual()"
    [style.--code-bg]="palette().bg"
    [style.--code-fg]="palette().fg"
    [style.--syntax-keyword]="palette().keyword"
    [style.--syntax-string]="palette().string"
    [style.--syntax-number]="palette().number"
    [style.--syntax-comment]="palette().comment"
    [style.--syntax-type]="palette().type"
  >
    <div class="code-column">
      <pre
        #sourcePanel
        tabindex="0"
        aria-label="Reference solution, read-only"
      ><code>@for (line of source().lines; track line.id; let index = $index) {<span class="source-line" [class.current]="debugger() && line.id === snapshot()?.event?.sourceAnchor?.[language()]" [class.executed]="debugger() && executed().has(line.id) && line.id !== snapshot()?.event?.sourceAnchor?.[language()]" [attr.aria-current]="debugger() && line.id === snapshot()?.event?.sourceAnchor?.[language()] ? 'step' : null"><span class="line-number" aria-hidden="true">{{ index + 1 }}</span><span class="line-text" [innerHTML]="highlighted()[index]"></span></span>}</code></pre>
      @if (debugger()) {
        <p class="code-key" aria-hidden="true">
          <span><i class="key-current"></i>Running now</span>
          <span><i class="key-executed"></i>Already ran</span>
        </p>
      }
    </div>
    @if (debugger()) {
      @if (snapshot(); as state) {
        <div class="inspector-scroll">
          <app-trace-state-panel
            [problem]="problem()"
            [fixture]="fixture()"
            [snapshot]="state"
            [language]="language()"
          />
          <app-studio-essential-state
            [problem]="problem()"
            [fixture]="fixture()"
            [snapshot]="state"
            [language]="language()"
          />
        </div>
        <details class="secondary-state">
          <summary>All recorded locals and instruction detail</summary>
          <div class="secondary-locals" tabindex="0" role="region" aria-label="All recorded locals">
            <app-studio-inspector
              [problem]="problem()"
              [fixture]="fixture()"
              [snapshot]="state"
              [language]="language()"
            />
          </div>
        </details>
      }
    }
  </div>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        container: trace-surface / inline-size;
      }
      .trace-body {
        min-width: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        background: var(--code-bg);
        color: var(--code-fg);
      }
      .with-inspector {
        grid-template-columns: minmax(0, 1.35fr) minmax(240px, 1fr);
        gap: 10px;
        background: var(--surface);
      }
      pre {
        font:
          13px/24px ui-monospace,
          monospace;
        tab-size: 4;
        height: var(--studio-code-height, 520px);
        margin: 0;
        padding: 16px 0;
        overflow: auto;
        scrollbar-gutter: stable;
        overscroll-behavior: contain;
        background: var(--code-bg);
        color: var(--code-fg);
        min-width: 0;
        box-sizing: border-box;
      }
      code {
        font: inherit;
        display: block;
        min-width: max-content;
      }
      .source-line {
        display: flex;
        min-height: 24px;
        padding-inline-end: 16px;
      }
      .line-number {
        display: inline-block;
        flex: 0 0 40px;
        text-align: right;
        padding-inline-end: 12px;
        opacity: 0.7;
        user-select: none;
      }
      .source-line.current {
        background: #24565e;
        box-shadow: inset 3px 0 #6ed7cf;
      }
      .source-line.executed {
        background: rgb(255 255 255 / 5%);
      }
      .source-line.executed .line-text {
        opacity: 0.72;
      }
      .source-line.executed .line-number {
        position: relative;
      }
      .source-line.executed .line-number::before {
        content: '';
        position: absolute;
        left: 8px;
        top: 50%;
        width: 5px;
        height: 5px;
        margin-top: -2.5px;
        border-radius: 50%;
        background: currentColor;
      }
      .code-column {
        display: flex;
        flex-direction: column;
        min-width: 0;
        background: var(--code-bg);
      }
      .code-key {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 16px;
        margin: 0;
        padding: 8px 14px;
        border-top: 1px solid rgb(255 255 255 / 8%);
        color: var(--code-fg);
        font-size: 13px;
      }
      .code-key span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        opacity: 0.85;
      }
      .code-key i {
        display: inline-block;
        width: 14px;
        height: 10px;
        border-radius: 2px;
      }
      .key-current {
        background: #24565e;
        box-shadow: inset 3px 0 #6ed7cf;
      }
      .key-executed {
        background: rgb(255 255 255 / 9%);
        outline: 1px solid rgb(255 255 255 / 14%);
      }
      .inspector-scroll {
        height: var(--studio-code-height, 520px);
        overflow: auto;
        min-width: 0;
      }
      .contextual .inspector-scroll {
        height: auto;
        min-height: 420px;
        overflow: visible;
      }
      :host ::ng-deep .syntax-keyword {
        color: var(--syntax-keyword);
      }
      :host ::ng-deep .syntax-string {
        color: var(--syntax-string);
      }
      :host ::ng-deep .syntax-number {
        color: var(--syntax-number);
      }
      :host ::ng-deep .syntax-comment {
        color: var(--syntax-comment);
      }
      :host ::ng-deep .syntax-type {
        color: var(--syntax-type);
      }
      .with-inspector {
        grid-template-columns: minmax(0, 1fr);
        gap: 10px;
        align-items: start;
      }
      .with-inspector .inspector-scroll {
        grid-row: 2;
        height: auto;
        min-height: 0;
        overflow: visible;
        display: grid;
        gap: 10px;
        align-content: start;
      }
      .with-inspector .code-column {
        grid-row: 1;
      }
      .with-inspector pre {
        height: var(--studio-source-height, 280px);
        min-height: 0;
        overflow: auto;
        font-size: 13px;
        line-height: 23px;
        padding: 10px 0;
      }
      .with-inspector .source-line {
        min-height: 23px;
      }
      .secondary-state {
        grid-column: 1/-1;
        grid-row: 3;
        color: var(--ink);
        border-top: 1px solid var(--line);
        padding-top: 12px;
      }
      .secondary-state summary {
        font-size: 13px;
        padding: 6px 0;
        cursor: pointer;
        font-weight: 700;
      }
      .secondary-locals {
        max-height: 320px;
        overflow: auto;
        padding: 8px;
        scrollbar-gutter: stable;
        overscroll-behavior: contain;
      }
      summary:focus-visible,
      .secondary-locals:focus-visible,
      pre:focus-visible {
        outline: 3px solid var(--accent);
        outline-offset: 2px;
      }
      @container trace-surface (min-width: 760px) {
        .with-inspector {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
          align-items: stretch;
        }
        .with-inspector .code-column {
          grid-row: 1;
          grid-column: 1;
        }
        .with-inspector pre {
          flex: 1 1 auto;
          height: auto;
          min-height: var(--studio-source-height, 280px);
          max-height: var(--studio-code-height, 520px);
        }
        .with-inspector .inspector-scroll {
          grid-row: 1;
          grid-column: 2;
        }
        .secondary-state {
          grid-row: 2;
        }
      }
      @container trace-surface (min-width:1100px) {
        :host-context([data-composition='wide']) .with-inspector {
          grid-template-columns: minmax(0, 60fr) minmax(0, 40fr);
        }
        :host-context([data-composition='wide']) .with-inspector .code-column {
          grid-row: 1;
          grid-column: 1;
        }
        :host-context([data-composition='wide']) .with-inspector pre {
          height: 520px;
        }
        :host-context([data-composition='wide']) .with-inspector .inspector-scroll {
          grid-row: 1;
          grid-column: 2;
        }
        :host-context([data-composition='wide']) .secondary-state {
          grid-row: 2;
        }
      }
      @media (forced-colors: active) {
        .source-line.current {
          outline: 2px solid Highlight;
          outline-offset: -2px;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .source-line {
          transition: none;
        }
      }
    `,
  ],
})
export class StudioTraceBody {
  readonly problem = input.required<PatternProblemV1>();
  readonly language = input.required<PatternLanguage>();
  readonly fixture = input.required<DsaProblemFixtureV2>();
  readonly snapshot = input<TraceSnapshot | null>(null);
  readonly debugger = input(false);
  readonly contextual = input(false);
  readonly follow = input(true);
  private readonly sourcePanel = viewChild<ElementRef<HTMLElement>>('sourcePanel');
  protected readonly source = computed(() =>
    this.problem().implementations.find((item) => item.language === this.language())!,
  );
  protected readonly palette = computed(() => editorPalettes[this.language()]);
  /** Source lines executed before the current instruction, for dimming. */
  protected readonly executed = computed(() => {
    const snapshot = this.snapshot();
    const language = this.language();
    return new Set(
      (snapshot?.events ?? [])
        .slice(0, (snapshot?.step ?? 0) + 1)
        .map((event) => event.sourceAnchor[language]),
    );
  });
  protected readonly highlighted = computed(() =>
    highlightStudioSource(
      this.source()
        .lines.map((line) => line.text)
        .join('\n'),
      this.language(),
    ),
  );
  constructor() {
    effect(() => {
      this.snapshot()?.step;
      this.language();
      this.debugger();
      if (!this.follow()) return;
      requestAnimationFrame(() => this.followCurrentLine());
    });
  }
  followCurrentLine(): void {
    const panel = this.sourcePanel()?.nativeElement;
    const line = panel?.querySelector<HTMLElement>('.current');
    if (!line || !panel) return;
    const visible = panel.getBoundingClientRect(),
      active = line.getBoundingClientRect();
    if (active.top < visible.top + 20 || active.bottom > visible.bottom - 20) {
      panel.scrollTop += active.top - visible.top - Math.max(32, panel.clientHeight * 0.35);
    }
  }
}
