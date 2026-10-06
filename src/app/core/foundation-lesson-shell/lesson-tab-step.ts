import { Component, input, output } from '@angular/core';

/** One Previous / Next press under tabbed panels: the step (-1 or 1) and the click, for keeping the tab row in view. */
export interface LessonTabStepEvent {
  delta: number;
  event: Event;
}

/**
 * Previous / Next under tabbed panels (Variations, Common mistakes), for reading them in order (user review,
 * 2026-10-05). The host is the lesson's `div.tab-step`; the lesson owns which tab is open.
 */
@Component({
  selector: 'div[appLessonTabStep]',
  template: `
    <button type="button" [disabled]="at() === 0" (click)="step.emit({ delta: -1, event: $event })">
      <span aria-hidden="true">‹ </span>Previous
    </button>
    <span class="tab-step-count">{{ at() + 1 }} of {{ count() }}</span>
    <button type="button" [disabled]="at() === count() - 1" (click)="step.emit({ delta: 1, event: $event })">
      Next<span aria-hidden="true"> ›</span>
    </button>
  `,
  styles: [
    `
      :host(.tab-step) button {
        padding: 7px 14px;
        border: 1px solid var(--line);
        border-radius: 9px;
        background: var(--surface);
        color: var(--accent-link);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      :host(.tab-step) button:disabled {
        visibility: hidden;
      }
      .tab-step-count {
        color: var(--text-subtle);
        font-size: 0.8rem;
        font-weight: 700;
        letter-spacing: 0.04em;
      }
    `,
  ],
})
export class LessonTabStep {
  /** The open tab (0-based). */
  readonly at = input.required<number>();
  readonly count = input.required<number>();
  readonly step = output<LessonTabStepEvent>();
}
