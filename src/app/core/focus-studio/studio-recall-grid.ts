import { Component, computed, inject, input } from '@angular/core';
import { DsaRecallKind } from '../../content/content.models';
import { RECALL_GRADES, RecallCheckStore, RecallGrade } from './recall-check';

/** One Recall card as the grid shows it: the kind picks the tag colour, the tag is its words. */
export interface RecallCardView {
  id: string;
  kind: DsaRecallKind;
  tag: string;
  /** The authored label; screen readers hear it with Reveal answer. */
  label: string;
  question: string;
  answer: readonly string[];
  steps?: readonly string[];
}

/**
 * Recall as a card grid (user-approved preview, option B, 2026-10-06): two columns of numbered
 * cards with a coloured kind tag, Reveal answer on each, and Got it / Partly / Missed under a
 * revealed answer. The header counts the graded cards and opens or closes every answer. State is
 * per problem for this tab session (RecallCheckStore) and never changes saved progress.
 */
@Component({
  selector: 'app-studio-recall-grid',
  template: `
    <header class="head">
      <h3 class="visually-hidden">Recall the reasoning</h3>
      <div class="progress">
        <span class="count" role="status">{{ graded() }} of {{ cards().length }} checked</span>
        <span class="meter" aria-hidden="true"><span [style.width.%]="meter()"></span></span>
      </div>
      <button type="button" class="all" (click)="toggleAll()">
        {{ allOpen() ? 'Hide all answers' : 'Show all answers' }}
      </button>
    </header>
    <ol class="grid">
      @for (card of cards(); track card.id; let index = $index) {
        <li>
          <article class="card" [attr.data-kind]="card.kind" [attr.aria-labelledby]="ids(index).question">
            <div class="top">
              <span class="number" aria-hidden="true">{{ index + 1 }}</span>
              <span class="tag">{{ card.tag }}</span>
            </div>
            <h4 [id]="ids(index).question">{{ card.question }}</h4>
            @if (isOpen(card.id)) {
              <div class="answer" [id]="ids(index).answer">
                @for (paragraph of card.answer; track $index) {
                  <p>{{ paragraph }}</p>
                }
                @if (card.steps?.length) {
                  <ol>
                    @for (step of card.steps; track $index) {
                      <li>{{ step }}</li>
                    }
                  </ol>
                }
              </div>
              <div class="grade" role="group" [attr.aria-label]="'How well did you recall card ' + (index + 1) + '?'">
                @for (grade of grades; track grade.id) {
                  <button
                    type="button"
                    [attr.data-grade]="grade.id"
                    [attr.aria-pressed]="gradeOf(card.id) === grade.id"
                    (click)="setGrade(card.id, grade.id)"
                  >
                    {{ grade.label }}
                  </button>
                }
              </div>
            }
            <button
              type="button"
              class="reveal"
              [attr.aria-expanded]="isOpen(card.id)"
              [attr.aria-controls]="isOpen(card.id) ? ids(index).answer : null"
              (click)="toggle(card.id)"
            >
              {{ isOpen(card.id) ? 'Hide answer' : 'Reveal answer'
              }}<span class="visually-hidden">: {{ card.label }}</span>
            </button>
          </article>
        </li>
      }
    </ol>
  `,
  styles: [
    `
      :host {
        --tag-concept: var(--accent-link);
        --tag-state: #6b4fb3;
        --tag-correctness: var(--success);
        --tag-complexity: var(--warning);
        --tag-trap: var(--danger);
        --tag-boundary: var(--text-subtle);
        --tag-transfer: var(--accent-strong);
        display: grid;
        gap: 14px;
        min-width: 0;
        container-type: inline-size;
      }
      :host-context([data-theme='dark']) {
        --tag-state: #c7b6ff;
      }
      .head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px 16px;
      }
      .progress {
        display: grid;
        flex: 1 1 260px;
        gap: 6px;
        min-width: 0;
        max-width: 420px;
      }
      .count {
        color: var(--text-strong);
        font-size: 13px;
        font-weight: 700;
      }
      .meter {
        display: block;
        height: 6px;
        overflow: hidden;
        border-radius: 999px;
        background: var(--surface-muted);
      }
      .meter > span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--accent-strong);
        transition: width 0.2s ease;
      }
      button {
        min-height: 32px;
        padding: 4px 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        color: var(--text-strong);
        background: var(--surface);
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.4;
        cursor: pointer;
      }
      button:hover {
        border-color: var(--accent-strong);
      }
      button:focus-visible {
        outline: 3px solid var(--accent-focus, var(--accent-strong));
        outline-offset: 2px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        align-items: start;
        gap: 12px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .grid > li {
        display: grid;
        min-width: 0;
      }
      .card {
        --tone: var(--tag-concept);
        display: grid;
        gap: 10px;
        min-width: 0;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--surface);
      }
      .card[data-kind='state'] {
        --tone: var(--tag-state);
      }
      .card[data-kind='correctness'] {
        --tone: var(--tag-correctness);
      }
      .card[data-kind='complexity'] {
        --tone: var(--tag-complexity);
      }
      .card[data-kind='trap'] {
        --tone: var(--tag-trap);
      }
      .card[data-kind='boundary'] {
        --tone: var(--tag-boundary);
      }
      .card[data-kind='transfer'] {
        --tone: var(--tag-transfer);
      }
      .top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .number {
        color: var(--text-subtle);
        font: 700 12px/1.4 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
        font-variant-numeric: tabular-nums;
      }
      .tag {
        padding: 1px 8px;
        border: 1px solid currentColor;
        border-radius: 999px;
        color: var(--tone);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        white-space: nowrap;
      }
      h4 {
        margin: 0;
        color: var(--text-strong);
        font-size: 15px;
        line-height: 1.45;
        overflow-wrap: anywhere;
      }
      .answer {
        display: grid;
        gap: 8px;
        padding: 10px 12px;
        border-left: 3px solid var(--tone);
        border-radius: 0 8px 8px 0;
        background: var(--surface-muted);
        color: var(--text-body);
        font-size: 14px;
      }
      .answer p,
      .answer ol {
        margin: 0;
        line-height: 1.6;
        overflow-wrap: anywhere;
      }
      .answer ol {
        padding-inline-start: 20px;
      }
      .grade {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .grade button {
        border-radius: 999px;
        font-weight: 650;
      }
      .grade [data-grade='got'][aria-pressed='true'] {
        border-color: var(--success);
        color: var(--success);
        background: var(--success-surface);
      }
      .grade [data-grade='partly'][aria-pressed='true'] {
        border-color: var(--warning);
        color: var(--warning);
        background: var(--warning-surface);
      }
      .grade [data-grade='missed'][aria-pressed='true'] {
        border-color: var(--danger);
        color: var(--danger);
        background: var(--danger-surface);
      }
      .reveal {
        justify-self: start;
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      @container (max-width: 560px) {
        .grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .meter > span {
          transition: none;
        }
      }
      @media (forced-colors: active) {
        .card,
        .answer {
          border-color: CanvasText;
        }
        .grade [aria-pressed='true'] {
          border: 2px solid Highlight;
        }
      }
    `,
  ],
})
export class StudioRecallGrid {
  private readonly store = inject(RecallCheckStore);
  readonly problemId = input.required<string>();
  readonly cards = input.required<readonly RecallCardView[]>();
  protected readonly grades = RECALL_GRADES;
  private readonly check = computed(() => this.store.check(this.problemId()));
  private readonly cardIds = computed(() => this.cards().map((card) => card.id));
  /** Only grades for cards on this page count; a card's grade survives closing its answer. */
  protected readonly graded = computed(
    () => this.cardIds().filter((id) => this.check().grades[id]).length,
  );
  protected readonly meter = computed(() =>
    this.cards().length ? Math.round((this.graded() / this.cards().length) * 100) : 0,
  );
  protected readonly allOpen = computed(
    () => this.cardIds().length > 0 && this.cardIds().every((id) => this.check().open.includes(id)),
  );

  protected ids(index: number): { question: string; answer: string } {
    const base = `recall-${this.problemId().replace(/[^a-zA-Z0-9_-]/g, '-')}-${index + 1}`;
    return { question: `${base}-question`, answer: `${base}-answer` };
  }
  protected isOpen(id: string): boolean {
    return this.check().open.includes(id);
  }
  protected gradeOf(id: string): RecallGrade | undefined {
    return this.check().grades[id];
  }
  protected toggle(id: string): void {
    this.store.setOpen(this.problemId(), id, !this.isOpen(id), this.cards().length);
  }
  protected toggleAll(): void {
    this.store.setAllOpen(this.problemId(), this.cardIds(), !this.allOpen());
  }
  protected setGrade(id: string, grade: RecallGrade): void {
    this.store.grade(this.problemId(), id, grade, this.cards().length);
  }
}
