import { Component, computed, input } from '@angular/core';
import { PracticeDisplayStatus } from './practice-progress';

const MARKS: Record<Exclude<PracticeDisplayStatus, null>, { mark: string; label: string }> = {
  solved: { mark: '✓', label: 'Solved' },
  started: { mark: '…', label: 'Started' },
  'review-due': { mark: '↻', label: 'Review due' },
};

/**
 * One problem's progress on this device: a mark with a text label. Screen readers always hear
 * the label; `compact` hides it visually on narrow screens so the mark keeps the column narrow,
 * and `markOnly` hides it at every width (the Hands-On DSA table keeps a narrow Status column).
 * In a compact or mark-only column a problem not started yet shows an empty outlined circle,
 * so the column never reads as a blank cell.
 */
@Component({
  selector: 'app-practice-status-mark',
  host: {
    '[attr.data-status]': 'status() ?? "none"',
    '[class.compact]': 'compact()',
    '[class.mark-only]': 'markOnly()',
    '[attr.title]': 'markOnly() ? (entry()?.label ?? notStarted) : null',
  },
  template: `@if (entry(); as item) {
      <span class="mark" aria-hidden="true">{{ item.mark }}</span
      ><span class="label">{{ item.label }}</span>
    } @else if (compact() || markOnly()) {
      <span class="mark empty" aria-hidden="true"></span
      ><span class="label none">{{ notStarted }}</span>
    } @else {
      <span class="label none">{{ notStarted }}</span>
    }`,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        color: var(--text-subtle);
        font-size: 0.78rem;
        font-weight: 700;
        line-height: 1.2;
        white-space: nowrap;
      }
      .mark {
        display: inline-grid;
        width: 1.5rem;
        height: 1.5rem;
        flex: 0 0 auto;
        place-items: center;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--surface-muted);
        font-size: 0.85rem;
      }
      /* Not started: the same circle, outlined only, with nothing inside. */
      .mark.empty {
        border: 1.5px solid var(--border-strong);
        background: transparent;
      }
      :host([data-status='solved']) {
        color: var(--success);
      }
      :host([data-status='solved']) .mark {
        border-color: var(--success);
        background: var(--success-surface);
      }
      :host([data-status='review-due']) {
        color: var(--text-strong);
      }
      :host([data-status='review-due']) .mark {
        border-color: var(--warning);
        background: var(--warning-surface);
      }
      .label.none,
      :host(.compact) .label,
      :host(.mark-only) .label {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      @media (min-width: 1100px) {
        :host(.compact:not(.mark-only)) .label:not(.none) {
          position: static;
          width: auto;
          height: auto;
          overflow: visible;
          clip: auto;
        }
      }
      @media (forced-colors: active) {
        .mark {
          border-color: CanvasText;
        }
      }
    `,
  ],
})
export class PracticeStatusMark {
  readonly status = input<PracticeDisplayStatus>(null);
  readonly compact = input(false);
  readonly markOnly = input(false);
  protected readonly notStarted = 'Not started';
  protected readonly entry = computed(() => {
    const status = this.status();
    return status ? MARKS[status] : null;
  });
}
