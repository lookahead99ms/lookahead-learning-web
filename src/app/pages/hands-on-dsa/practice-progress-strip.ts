import { Component, computed, inject, input } from '@angular/core';
import { PracticeProgressService } from '../../core/practice-progress/practice-progress';

/**
 * Hands-On DSA progress on this device (browser-local milestone): solved of the published total,
 * started and review due. It counts only problems the catalog still publishes.
 */
@Component({
  selector: 'app-practice-progress-strip',
  template: `
    <section class="progress-strip" aria-labelledby="practice-progress-title">
      <!-- A label, not a heading: the strip is not a page section for the outline. -->
      <p class="strip-title" id="practice-progress-title">On this device</p>
      <dl>
        <div class="stat solved">
          <dt>Solved</dt>
          <dd>
            <b>{{ counts().solved }}</b> of {{ total() }}
            <span class="meter" aria-hidden="true"><span [style.width.%]="percent()"></span></span>
          </dd>
        </div>
        <div class="stat">
          <dt>Started</dt>
          <dd><b>{{ counts().started }}</b></dd>
        </div>
        <div class="stat">
          <dt>Review due</dt>
          <dd><b>{{ counts().reviewDue }}</b></dd>
        </div>
      </dl>
      <p class="note">
        @if (progress.persisted()) {
          Saved in this browser only. Progress does not sync to other devices yet.
        } @else {
          This browser is not saving progress, so it lasts until you leave the page.
        }
      </p>
    </section>
  `,
  styles: [
    `
      .progress-strip {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 22px;
        margin: 18px 0 0;
        padding: 12px 17px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: var(--surface);
      }
      .strip-title {
        margin: 0;
        color: var(--text-subtle);
        font-size: 0.72rem;
        font-weight: 850;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      dl {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 22px;
        margin: 0;
      }
      .stat {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      dt {
        color: var(--text-body);
        font-size: 0.82rem;
        font-weight: 700;
      }
      dd {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0;
        color: var(--text-subtle);
        font-size: 0.82rem;
        font-variant-numeric: tabular-nums;
      }
      dd b {
        color: var(--text-strong);
        font-size: 1rem;
      }
      .meter {
        display: inline-block;
        width: 88px;
        height: 6px;
        overflow: hidden;
        border-radius: 999px;
        background: var(--surface-muted);
        box-shadow: inset 0 0 0 1px var(--line);
      }
      .meter span {
        display: block;
        height: 100%;
        background: var(--success);
      }
      .note {
        flex: 1 1 240px;
        margin: 0;
        color: var(--text-subtle);
        font-size: 0.78rem;
        text-align: end;
      }
      @media (max-width: 640px) {
        .note {
          text-align: start;
        }
      }
      @media (forced-colors: active) {
        .progress-strip,
        .meter {
          border: 1px solid CanvasText;
        }
        .meter span {
          background: Highlight;
        }
      }
    `,
  ],
})
export class PracticeProgressStrip {
  protected readonly progress = inject(PracticeProgressService);
  /** Ids of every problem the catalog publishes. */
  readonly problemIds = input.required<ReadonlySet<string>>();
  readonly total = input.required<number>();
  protected readonly counts = computed(() => {
    const ids = this.problemIds();
    const count = (set: ReadonlySet<string>) => [...set].filter((id) => ids.has(id)).length;
    return {
      solved: count(this.progress.solvedIds()),
      started: count(this.progress.startedIds()),
      reviewDue: count(this.progress.reviewDueIds()),
    };
  });
  protected readonly percent = computed(() =>
    this.total() ? Math.min(100, (this.counts().solved / this.total()) * 100) : 0,
  );
}
