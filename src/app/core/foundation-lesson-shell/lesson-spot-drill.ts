import { Component, input, output } from '@angular/core';
import { TheorySpotDrill } from '../../content/content.models';

/** The option a learner picked for one problem of a Spot the pattern drill. */
export interface LessonSpotPick {
  index: number;
  option: string;
}

/**
 * algo-pattern-v1 Spot the pattern: pick a pattern per problem, then see whether it fits and why.
 * The host is the lesson's `ol.spot-list`; the lesson keeps the picks.
 */
@Component({
  selector: 'ol[appLessonSpotDrill]',
  template: `
    @for (item of drill().items; track item.statement; let index = $index) {
      <li class="spot-item">
        <p class="spot-statement" [id]="sectionId() + '-spot-' + index"><span class="rich" [innerHTML]="item.statement"></span></p>
        <div class="spot-options" role="group" [attr.aria-labelledby]="sectionId() + '-spot-' + index">
          @for (option of drill().options; track option) {
            <button
              type="button"
              [attr.aria-pressed]="picked(index) === option"
              (click)="pick.emit({ index, option })"
            >{{ option }}</button>
          }
        </div>
        <p class="spot-result" aria-live="polite">
          @if (picked(index); as choice) {
            @if (choice === item.answer) {
              <strong class="spot-right">Right: {{ item.answer }}.</strong>
            } @else {
              <strong class="spot-wrong">Not this one. It is {{ item.answer }}.</strong>
            }
            <span class="rich" [innerHTML]="item.why"></span>
          }
        </p>
      </li>
    }
  `,
  styles: [
    `
      :host-context(.system .lesson-section) p {
        max-width: var(--reading-width);
        line-height: 1.8;
      }
      .spot-item {
        padding: 1rem 1.1rem;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface);
      }
      :host-context(.system) .spot-item .spot-statement {
        margin: 0 0 0.75rem;
        color: var(--text-strong);
        line-height: 1.6;
      }
      .spot-options {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .spot-options button {
        min-height: 40px;
        padding: 0.35rem 0.85rem;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--surface);
        color: var(--text-strong);
        font: inherit;
        font-size: 0.92rem;
        cursor: pointer;
      }
      .spot-options button:hover {
        border-color: var(--accent-link);
      }
      .spot-options button[aria-pressed='true'] {
        border-color: var(--accent-link);
        background: var(--surface-accent);
        font-weight: 650;
      }
      .spot-options button:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      :host-context(.system) .spot-item .spot-result {
        margin: 0.6rem 0 0;
        line-height: 1.6;
      }
      .spot-result:empty {
        display: none;
      }
      .spot-right {
        color: var(--success);
      }
      .spot-wrong {
        color: var(--danger);
      }
    `,
  ],
})
export class LessonSpotDrill {
  readonly drill = input.required<TheorySpotDrill>();
  /** The section id, for the statement ids the option groups are labelled by. */
  readonly sectionId = input.required<string>();
  /** Picks so far, keyed "<sectionId>-<index>" (the lesson keeps them). */
  readonly picks = input.required<Readonly<Record<string, string>>>();
  readonly pick = output<LessonSpotPick>();

  protected picked(index: number): string | null {
    return this.picks()[`${this.sectionId()}-${index}`] ?? null;
  }
}
