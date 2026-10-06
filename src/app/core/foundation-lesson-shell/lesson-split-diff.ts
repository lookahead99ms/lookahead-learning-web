import { Component, TemplateRef, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TheoryCodeTab, TheoryOutput, TheoryPair } from '../../content/content.models';
import { codeLanguageLabel } from '../focus-studio/code-presentation';
import { CodeCopyButton } from '../code-copy-button/code-copy-button';
import { LearningCode } from '../learning-code';
import { cardPoints } from './card-points';
import { DiffRow } from './split-diff';

/** One language's version of a code block (a section, Debug pair side or cheat-sheet tab). */
export type LanguageTab = Omit<TheoryCodeTab, 'body'>;

/** One file of a Debug pair's split diff. */
export interface PairDiffFile {
  label: string;
  language: string;
  broken: LanguageTab | null;
  fixed: LanguageTab | null;
  rows: DiffRow[];
  /** The fix renamed the file (its lines may still be the same). */
  renamed: boolean;
  /** The fix leaves this file alone (only on the broken side, or the same name and lines on both): shown folded. */
  unchanged: boolean;
  removed: number;
  added: number;
}

/** A Debug pair shown as a split diff: the broken program on the left, the fix on the right. */
export interface PairDiff {
  /** Java | Python | Go pairs: the tabs that switch the diff (one choice for the page); null for file pairs. */
  languages: LanguageTab[] | null;
  files: PairDiffFile[];
  brokenOutput: TheoryOutput | null;
  fixedOutput: TheoryOutput | null;
}

const DIFF_MARKS = { same: '', del: '−', add: '+' } as const;

/**
 * A Debug pair as a split diff, as a code review shows it: rows aligned from the same first line, removed lines
 * red (−) on the broken side, added lines green (+) on the fixed side, each side's console below it. In a narrow
 * column CSS order puts the whole broken side first, then the fix. The host is the lesson's `div.split-diff`
 * (its id, role and label are set where it is placed, next to the language tabs). Code blocks, tables and
 * consoles are the lesson's own blocks, passed in as templates.
 */
@Component({
  selector: 'div[appLessonSplitDiff]',
  imports: [NgTemplateOutlet, CodeCopyButton, LearningCode],
  template: `
    <div class="d-head d-l">
      <p class="pair-label">{{ brokenLabel() }}</p>
      @for (paragraph of pair().broken.body; track paragraph) {
        <div class="prose" [innerHTML]="cardPoints(paragraph, true)"></div>
      }
    </div>
    <div class="d-head d-r">
      <p class="pair-label">{{ fixedLabel() }}</p>
      @if (pair().fixed.title) {
        <p class="pair-fix-title"><span class="rich" [innerHTML]="pair().fixed.title"></span></p>
      }
      @for (paragraph of pair().fixed.body; track paragraph) {
        <div class="prose" [innerHTML]="cardPoints(paragraph, true)"></div>
      }
    </div>
    @for (file of diff().files; track file.label) {
      @if (file.unchanged && diff().files.length > 1) {
        <details class="d-shared d-l">
          <summary><span>{{ file.label }}</span> <small>Not changed by the fix</small></summary>
          <ng-container [ngTemplateOutlet]="codeBlock()" [ngTemplateOutletContext]="{ $implicit: file.broken ?? file.fixed }" />
        </details>
      } @else {
        <div class="d-file d-l">
          @if (file.broken; as code) {
            <span>{{ code.title }}</span>
            <div><small>{{ languageLabel(code.language) }}</small><app-code-copy-button [code]="code.source" /></div>
          } @else {
            <span class="d-file-none">No file before the fix</span>
          }
        </div>
        <div class="d-file d-r">
          @if (file.fixed; as code) {
            <span>{{ code.title }}@if (file.removed || file.added) {<small class="d-count" [attr.aria-label]="file.added + ' lines added, ' + file.removed + ' removed'"><b class="d-count-add">+{{ file.added }}</b><b class="d-count-del">−{{ file.removed }}</b></small>} @else if (file.renamed) {<small class="d-count">renamed</small>}</span>
            <div><small>{{ languageLabel(code.language) }}</small><app-code-copy-button [code]="code.source" /></div>
          } @else {
            <span class="d-file-none">Unchanged</span>
          }
        </div>
        @for (row of file.rows; track $index) {
          <ng-container [ngTemplateOutlet]="diffCell" [ngTemplateOutletContext]="{ $implicit: row.left, side: 'l', language: file.language }" />
          <ng-container [ngTemplateOutlet]="diffCell" [ngTemplateOutletContext]="{ $implicit: row.right, side: 'r', language: file.language }" />
        }
        <div class="d-end d-l" aria-hidden="true"></div>
        <div class="d-end d-r" aria-hidden="true"></div>
      }
    }
    <div class="d-out d-l">
      @if (pair().broken.table; as table) {
        <ng-container [ngTemplateOutlet]="lessonTable()" [ngTemplateOutletContext]="{ $implicit: table }" />
      }
      @if (diff().brokenOutput; as output) {
        <ng-container [ngTemplateOutlet]="runConsole()" [ngTemplateOutletContext]="{ $implicit: output }" />
      }
    </div>
    <div class="d-out d-r">
      @if (pair().fixed.table; as table) {
        <ng-container [ngTemplateOutlet]="lessonTable()" [ngTemplateOutletContext]="{ $implicit: table }" />
      }
      @if (diff().fixedOutput; as output) {
        <ng-container [ngTemplateOutlet]="runConsole()" [ngTemplateOutletContext]="{ $implicit: output }" />
      }
    </div>
    <ng-template #diffCell let-cell let-side="side" let-language="language">
      @if (cell) {
        <div class="d-row" [class]="'d-row d-' + side + ' d-' + cell.kind">
          <span class="d-num" aria-hidden="true">{{ cell.line }}</span>
          <span class="d-mark" aria-hidden="true">{{ diffMark(cell.kind) }}</span>
          @if (cell.kind !== 'same') {
            <span class="visually-hidden">{{ cell.kind === 'del' ? 'Removed line ' + cell.line + ': ' : 'Added line ' + cell.line + ': ' }}</span>
          }
          <code class="d-code" [appLearningCode]="cell.text || ' '" [codeLanguage]="language"></code>
        </div>
      } @else {
        <div class="d-row" [class]="'d-row d-' + side + ' d-fill'" aria-hidden="true"></div>
      }
    </ng-template>
  `,
  styles: [
    `
      /* One grid: heads, then per file a title row and aligned rows, then consoles. The code panel is dark
         in both themes, so the row colors are fixed. */
      :host {
        --diff-del-bg: #4a1d27;
        --diff-add-bg: #17402d;
        --diff-del-mark: #ff8f9a;
        --diff-add-mark: #7fe0a8;
        --diff-fill: #0c1526;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        column-gap: 14px;
        min-width: 0;
      }
      :host > * {
        min-width: 0;
      }
      :host .d-l {
        --side-accent: var(--danger);
      }
      :host .d-r {
        --side-accent: var(--success);
      }
      :host .d-head {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin-bottom: 0.6rem;
        padding: 0.75rem 0.85rem;
        border: 1px solid var(--line);
        border-top: 3px solid var(--side-accent);
        border-radius: 10px;
        background: color-mix(in srgb, var(--side-accent) 6%, var(--surface));
      }
      :host .d-file {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 0.6rem;
        padding: 0.45rem 0.75rem;
        border-radius: 10px 10px 0 0;
        background: var(--code-panel);
        color: var(--code-ink);
        font-size: 0.85rem;
      }
      :host .d-file > span {
        min-width: 0;
        overflow-wrap: anywhere;
      }
      :host .d-file > div {
        display: flex;
        flex: none;
        align-items: center;
        gap: 0.5rem;
      }
      :host .d-file small,
      :host .d-file-none {
        color: var(--code-muted);
      }
      :host .d-count {
        margin-left: 0.6rem;
      }
      :host .d-count b {
        font-weight: 700;
      }
      :host .d-count b + b {
        margin-left: 0.4rem;
      }
      :host .d-count-add {
        color: var(--diff-add-mark);
      }
      :host .d-count-del {
        color: var(--diff-del-mark);
      }
      :host .d-row {
        display: grid;
        grid-template-columns: 2.4em 1.3em minmax(0, 1fr);
        align-items: start;
        padding: 0 10px 0 2px;
        background: var(--code-bg);
        color: var(--code-ink);
        font-family: var(--lesson-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
        font-size: 0.8rem;
        line-height: 1.6;
      }
      :host .d-num {
        padding-right: 6px;
        color: var(--code-muted);
        text-align: right;
        user-select: none;
      }
      :host .d-mark {
        font-weight: 800;
        text-align: center;
        user-select: none;
      }
      :host .d-code {
        min-width: 0;
        padding: 0;
        border: 0;
        background: none;
        color: inherit;
        font: inherit;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        tab-size: 4;
      }
      :host .d-del {
        background: var(--diff-del-bg);
      }
      :host .d-del .d-mark {
        color: var(--diff-del-mark);
      }
      :host .d-add {
        background: var(--diff-add-bg);
      }
      :host .d-add .d-mark {
        color: var(--diff-add-mark);
      }
      :host .d-fill {
        background: repeating-linear-gradient(135deg, var(--code-bg) 0 6px, var(--diff-fill) 6px 12px);
      }
      :host .d-end {
        height: 10px;
        border-radius: 0 0 10px 10px;
        background: var(--code-bg);
      }
      :host .d-shared {
        grid-column: 1 / -1;
        margin-top: 0.6rem;
      }
      :host .d-shared summary {
        cursor: pointer;
        color: var(--text-strong);
        font-weight: 600;
      }
      :host .d-shared summary small {
        margin-left: 0.4rem;
        color: var(--text-subtle);
        font-weight: 500;
      }
      :host .d-out {
        display: grid;
        gap: 0.75rem;
        align-content: start;
        padding-top: 0.75rem;
      }
      :host .d-out:empty {
        display: none;
      }
      @container lesson (max-width: 759px) {
        :host {
          grid-template-columns: minmax(0, 1fr);
        }
        :host .d-l {
          order: 1;
        }
        :host .d-r {
          order: 2;
        }
        :host .d-head.d-r {
          margin-top: 1.25rem;
        }
        :host .d-fill {
          display: none;
        }
      }
      /* The lesson parts the diff shares with the rest of the reader: labels, prose and screen-reader text. */
      :host-context(.system .lesson-section) p {
        max-width: var(--reading-width);
        line-height: 1.8;
      }
      .prose {
        margin: 1em 0;
      }
      :host-context(.system) .prose {
        max-width: var(--reading-width);
        line-height: 1.8;
      }
      :host-context(.system) .prose {
        margin: 0;
        padding: 0;
        border: 0;
        background: none;
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      :host-context(.system) .pair-label {
        margin: 0 0 0.3rem;
        color: var(--side-accent);
        font-size: 0.9rem;
        font-weight: 700;
      }
      :host-context(.system) .pair-fix-title {
        margin: 0 0 0.3rem;
        color: var(--text-strong);
        font-weight: 650;
      }
      .d-l .pair-label::before {
        content: '✗ ';
      }
      .d-r .pair-label::before {
        content: '✓ ';
      }
      .system :host(.split-diff) .pair-label {
        margin: 0;
        color: var(--side-accent);
      }
      .system :host(.split-diff) .pair-fix-title {
        margin: 0;
      }
      :host .d-head .prose {
        margin: 0;
        font-size: 0.95rem;
        line-height: 1.6;
      }
      /* The lesson's code block (a folded file) and table, drawn from the lesson's own templates. */
      .system :host(.split-diff) .d-shared ::ng-deep .foundation-code {
        margin-top: 0.5rem;
      }
      :host .d-out ::ng-deep .lesson-table-wrap {
        margin: 0;
      }
    `,
  ],
})
export class LessonSplitDiff {
  readonly diff = input.required<PairDiff>();
  readonly pair = input.required<TheoryPair>();
  /** Column labels, e.g. "What broke" and "The fix", or the section's own pair labels. */
  readonly brokenLabel = input.required<string>();
  readonly fixedLabel = input.required<string>();
  /** The lesson's code block, table and run console, so the diff draws them exactly as the lesson does. */
  readonly codeBlock = input.required<TemplateRef<unknown>>();
  readonly lessonTable = input.required<TemplateRef<unknown>>();
  readonly runConsole = input.required<TemplateRef<unknown>>();

  protected readonly cardPoints = cardPoints;

  protected diffMark(kind: keyof typeof DIFF_MARKS): string {
    return DIFF_MARKS[kind];
  }

  protected languageLabel(language: string): string {
    return codeLanguageLabel(language);
  }
}
