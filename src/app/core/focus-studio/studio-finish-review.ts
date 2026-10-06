import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { rankedHandsOnDsaIndexProblems } from '../../content/hands-on-dsa';
import {
  PRACTICE_RATINGS,
  PracticeProgressService,
  PracticeRating,
  REVIEW_CHOICES,
  ReviewChoice,
  reviewDateLabel,
} from '../practice-progress/practice-progress';
import { PracticeStatusMark } from '../practice-progress/practice-status-mark';
import { RecallCheckStore, RecallSuggestion, recallSuggestion } from './recall-check';

/** Notes save this long after the last keystroke. */
export const NOTES_SAVE_DELAY_MS = 600;

/**
 * "Finish and review" under the Recall cards: rate the attempt, plan a review, keep notes and
 * pick the next problem. Everything is saved in this browser only; the copy says so.
 *
 * Card grid layout (user-approved preview, option B, 2026-10-06): it runs the full workspace width
 * in four short columns (How did it go? | Review again | My notes | Next problems) that stack on
 * narrow widths. Once a Recall card is graded it suggests a rating and a review date from the
 * grades; "Use this" sets both, and nothing is set without it.
 */
@Component({
  selector: 'app-studio-finish-review',
  imports: [RouterLink, PracticeStatusMark],
  template: `
    <section class="finish" [attr.aria-labelledby]="ids().title">
      <header>
        <div>
          <p class="eyebrow">After the attempt</p>
          <h3 [id]="ids().title" tabindex="-1">Finish and review</h3>
        </div>
        @if (suggestion(); as suggested) {
          <p class="suggestion">
            {{ suggested.text }}
            <button type="button" class="use-suggestion" title="Apply the suggested rating and review plan for this attempt" (click)="useSuggestion(suggested)">
              Use this
            </button>
          </p>
        }
      </header>

      <div class="columns">
        <div class="block">
          <h4 [id]="ids().rating">How did it go?</h4>
          <div class="options" role="group" [attr.aria-labelledby]="ids().rating">
            @for (option of ratings; track option) {
              <button
                type="button"
                [attr.aria-pressed]="record()?.rating === option"
                [attr.title]="'Save your rating for this problem: ' + option"
                (click)="rate(option)"
              >
                {{ option }}
              </button>
            }
          </div>
        </div>

        <div class="block">
          <h4 [id]="ids().review">Review again</h4>
          <div class="options" role="group" [attr.aria-labelledby]="ids().review">
            @for (option of reviewChoices; track option.id) {
              <button
                type="button"
                [attr.aria-pressed]="reviewChoice() === option.id"
                [attr.title]="option.id === 'none' ? 'Clear the planned review date' : 'Plan another review: ' + option.label"
                (click)="scheduleReview(option.id)"
              >
                {{ option.label }}
              </button>
            }
          </div>
          @if (reviewDate(); as date) {
            <p class="review-date">Review on {{ date }}</p>
          } @else if (reviewChoice() === 'none') {
            <p class="review-date">No review planned.</p>
          }
        </div>

        <div class="block">
          <h4><label [for]="ids().notes">My notes</label></h4>
          <textarea
            [id]="ids().notes"
            rows="4"
            [attr.aria-describedby]="ids().notesHelp"
            placeholder="What tripped you up? For example: my loop stopped one short of the last element."
            [value]="notes()"
            (input)="editNotes($any($event.target).value)"
          ></textarea>
          <p class="hint" [id]="ids().notesHelp">Notes save as you type.</p>
        </div>

        @if (next().length) {
          <div class="block">
            <h4 [id]="ids().next">
              {{ patternRevealed() && patternTitle() ? 'Next in ' + patternTitle() : 'Next problems' }}
            </h4>
            <ol class="next" [attr.aria-labelledby]="ids().next">
              @for (problem of next(); track problem.id) {
                <li>
                  <a [routerLink]="problem.route" [queryParams]="linkQuery()">
                    <span class="next-title">{{ problem.title }}</span>
                    <span class="next-meta">{{ problem.difficulty }}</span>
                    @if (progress.displayStatus(problem.id); as status) {
                      <app-practice-status-mark [status]="status" [compact]="true" />
                    }
                  </a>
                </li>
              }
            </ol>
          </div>
        }
      </div>

      <p class="status" role="status" aria-live="polite">{{ announcement() }}</p>

      @if (hasProgress()) {
        @if (!confirmingClear()) {
          <button type="button" class="quiet clear-trigger" title="Choose whether to clear this problem’s saved progress on this device" (click)="openClear()">
            Clear progress for this problem
          </button>
        } @else {
          <div
            class="clear-confirm"
            role="group"
            [attr.aria-labelledby]="ids().clear"
            (keydown.escape)="cancelClear()"
          >
            <p [id]="ids().clear">Clear the rating, review date and status for this problem?</p>
            <label class="clear-notes">
              <input
                type="checkbox"
                [checked]="clearNotes()"
                (change)="clearNotes.set($any($event.target).checked)"
              />
              And my notes
            </label>
            <div class="options">
              <button type="button" class="confirm-clear" title="Clear this problem’s rating, review date and status, plus notes if selected" (click)="confirmClear()">
                Clear progress
              </button>
              <button type="button" class="cancel-clear" title="Keep your saved progress and close this confirmation" (click)="cancelClear()">Cancel</button>
            </div>
          </div>
        }
      }

      <p class="device-note">
        @if (progress.persisted()) {
          Saved on this device. Progress does not sync to other devices yet.
        } @else {
          This browser is not saving progress, so it lasts until you leave the page.
          Progress does not sync to other devices yet.
        }
      </p>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        container-type: inline-size;
      }
      .finish {
        display: grid;
        gap: 18px;
        padding: 18px 20px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface-muted);
      }
      header {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        justify-content: space-between;
        gap: 8px 20px;
      }
      .columns {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        align-items: start;
        gap: 18px 22px;
      }
      @container (min-width: 560px) {
        .columns {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @container (min-width: 920px) {
        .columns {
          grid-template-columns: none;
          grid-auto-columns: minmax(0, 1fr);
          grid-auto-flow: column;
        }
      }
      .suggestion {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 10px;
        margin: 0;
        color: var(--text-body);
        font-size: 14px;
      }
      .suggestion button {
        min-height: 32px;
        padding: 4px 12px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 700;
      }
      header h3 {
        margin: 2px 0 0;
        color: var(--text-strong);
        font-size: 19px;
        line-height: 1.3;
      }
      .eyebrow {
        margin: 0;
        color: var(--text-subtle);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .block {
        display: grid;
        gap: 8px;
        min-width: 0;
      }
      h4 {
        margin: 0;
        color: var(--text-strong);
        font-size: 15px;
      }
      .options {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      button {
        min-height: 40px;
        padding: 6px 14px;
        border: 1px solid var(--border-strong);
        border-radius: 999px;
        color: var(--text-strong);
        background: var(--surface);
        font: inherit;
        font-size: 14px;
        cursor: pointer;
      }
      button:hover {
        border-color: var(--accent-strong);
      }
      button[aria-pressed='true'] {
        border-color: var(--accent-strong);
        color: var(--accent-on-primary);
        background: var(--accent-strong);
        font-weight: 700;
      }
      button:focus-visible,
      textarea:focus-visible,
      a:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      .review-date,
      .hint,
      .status,
      .device-note {
        margin: 0;
        color: var(--text-subtle);
        font-size: 13px;
      }
      .review-date {
        color: var(--text-body);
        font-weight: 700;
      }
      .status:empty {
        display: none;
      }
      textarea {
        box-sizing: border-box;
        width: 100%;
        min-height: 96px;
        padding: 10px 12px;
        border: 1px solid var(--border-strong);
        border-radius: 8px;
        color: var(--text-strong);
        background: var(--surface);
        font: inherit;
        font-size: 14px;
        line-height: 1.5;
        resize: vertical;
      }
      .next {
        display: grid;
        gap: 6px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .next li {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .next a {
        display: flex;
        flex: 1 1 auto;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 2px 10px;
        min-width: 0;
        min-height: 44px;
        padding: 8px 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        color: var(--accent-link);
        background: var(--surface);
        text-decoration: none;
      }
      .next a:hover .next-title {
        text-decoration: underline;
      }
      .next-title {
        min-width: 0;
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      .next a app-practice-status-mark {
        align-self: center;
        margin-inline-start: auto;
      }
      .next-meta {
        color: var(--text-subtle);
        font-size: 13px;
      }
      button.quiet {
        justify-self: start;
        min-height: 44px;
        padding: 6px 0;
        border: 0;
        border-radius: 0;
        color: var(--text-subtle);
        background: transparent;
        font-size: 13px;
        text-decoration: underline;
      }
      button.quiet:hover {
        color: var(--text-strong);
      }
      .clear-confirm {
        display: grid;
        gap: 10px;
        padding: 12px 14px;
        border: 1px solid var(--border-strong);
        border-radius: 8px;
        background: var(--surface);
      }
      .clear-confirm p {
        margin: 0;
        color: var(--text-strong);
        font-size: 14px;
      }
      .clear-notes {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 32px;
        color: var(--text-body);
        font-size: 14px;
      }
      .clear-notes input {
        width: 18px;
        height: 18px;
        margin: 0;
        accent-color: var(--accent-strong);
      }
      .clear-notes input:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      .confirm-clear {
        border-color: var(--danger);
        color: var(--danger);
        font-weight: 700;
      }
      .device-note {
        padding-top: 12px;
        border-top: 1px solid var(--line);
      }
      @media (max-width: 640px) {
        .finish {
          padding: 14px;
        }
      }
      @media (forced-colors: active) {
        button[aria-pressed='true'] {
          border: 2px solid Highlight;
          color: HighlightText;
          background: Highlight;
        }
      }
    `,
  ],
})
export class StudioFinishReview {
  protected readonly progress = inject(PracticeProgressService);
  private readonly recallChecks = inject(RecallCheckStore);
  private readonly content = inject(ContentService);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  readonly problemId = input.required<string>();
  /** The Hands-On pattern this page is practised in (navigation.handsOnPatternId or ?pattern). */
  readonly patternId = input('');
  /** Only a revealed pattern may be named; otherwise the list stays neutral. */
  readonly patternRevealed = input(false);

  protected readonly ratings = PRACTICE_RATINGS;
  protected readonly reviewChoices = REVIEW_CHOICES;
  protected readonly record = computed(() => this.progress.records()[this.problemId()]);
  /** The saved review choice; older records without one show only their date. */
  protected readonly reviewChoice = computed(() => this.record()?.reviewChoice ?? null);
  /** Something to undo: a status, a rating or a planned review (notes clear by editing them). */
  protected readonly hasProgress = computed(() => {
    const record = this.record();
    return !!record && (!!record.status || !!record.rating || !!record.reviewAt);
  });
  /** Two-step clear inside the page: the trigger opens a confirm group with "And my notes". */
  protected readonly confirmingClear = linkedSignal({ source: () => this.problemId(), computation: () => false });
  protected readonly clearNotes = linkedSignal({ source: () => this.problemId(), computation: () => false });
  /** A rating and review date suggested from this session's Recall grades; only "Use this" applies it. */
  protected readonly suggestion = computed(() =>
    recallSuggestion(this.recallChecks.check(this.problemId())),
  );
  protected readonly reviewDate = computed(() => {
    const reviewAt = this.record()?.reviewAt;
    return reviewAt ? reviewDateLabel(reviewAt) : null;
  });
  /** The textarea keeps what is typed; it follows saved notes (another tab) only when idle. */
  private readonly savedNotes = computed(() => this.record()?.notes ?? '');
  protected readonly notes = linkedSignal(() => this.savedNotes());
  protected readonly announcement = signal('');
  protected readonly ids = computed(() => {
    const base = `finish-${this.problemId().replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    return {
      title: `${base}-title`,
      rating: `${base}-rating`,
      review: `${base}-review`,
      notes: `${base}-notes`,
      notesHelp: `${base}-notes-help`,
      next: `${base}-next`,
      clear: `${base}-clear`,
    };
  });

  private readonly index = toSignal(
    this.content.getHandsOnDsaIndex().pipe(
      map((index) => index as typeof index | null),
      catchError(() => of(null)),
    ),
    { initialValue: null },
  );
  private readonly placement = computed(() => {
    const index = this.index();
    const id = this.problemId();
    if (!index) return null;
    const holds = (group: (typeof index.groups)[number]) =>
      group.problems.some((problem) => problem.id === id);
    const group =
      index.groups.find((candidate) => candidate.id === this.patternId() && holds(candidate)) ??
      index.groups.find(holds);
    if (!group) return null;
    const ordered = rankedHandsOnDsaIndexProblems([group], 'study-order');
    const position = ordered.findIndex((problem) => problem.id === id);
    return { group, next: ordered.slice(position + 1, position + 4) };
  });
  /** The next three problems after this one in the same pattern, in learning order. */
  protected readonly next = computed(() => this.placement()?.next ?? []);
  protected readonly patternTitle = computed(() => this.placement()?.group.title ?? '');
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly linkQuery = computed(() => {
    const returnTo = this.queryParams().get('returnTo');
    return {
      pattern: this.placement()?.group.id ?? null,
      ...(returnTo ? { returnTo } : {}),
    };
  });

  private pending?: { problemId: string; notes: string };
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Moving to another problem saves the notes typed for the previous one first.
    effect(() => {
      this.problemId();
      untracked(() => {
        this.flushNotes();
        this.announcement.set('');
      });
    });
    inject(DestroyRef).onDestroy(() => this.flushNotes());
  }

  /** Choosing the pressed rating again takes it back; the problem stays started. */
  protected rate(rating: PracticeRating): void {
    if (this.record()?.rating === rating) {
      this.progress.unrate(this.problemId());
      this.announcement.set('Rating removed. This problem is marked as started.');
      return;
    }
    this.progress.rate(this.problemId(), rating);
    this.announcement.set(`Marked: ${rating}.`);
  }

  /** Sets the suggested rating and review choice; a rating already chosen is kept, not taken back. */
  protected useSuggestion(suggested: RecallSuggestion): void {
    const id = this.problemId();
    if (this.record()?.rating !== suggested.rating) this.progress.rate(id, suggested.rating);
    this.progress.scheduleReview(id, suggested.review);
    const date = this.record()?.reviewAt;
    this.announcement.set(
      `Marked: ${suggested.rating}. ` +
        (suggested.review === 'none' || !date ? 'No review planned.' : `Review on ${reviewDateLabel(date)}.`),
    );
  }

  protected openClear(): void {
    this.clearNotes.set(false);
    this.confirmingClear.set(true);
    this.focusLater('.cancel-clear');
  }

  protected cancelClear(): void {
    this.confirmingClear.set(false);
    this.focusLater('.clear-trigger');
  }

  protected confirmClear(): void {
    const withNotes = this.clearNotes();
    if (withNotes) {
      clearTimeout(this.timer);
      this.pending = undefined;
      this.notes.set('');
    } else this.flushNotes();
    this.progress.clear(this.problemId(), withNotes);
    this.confirmingClear.set(false);
    this.announcement.set(
      withNotes
        ? 'Progress and notes cleared for this problem.'
        : 'Progress cleared for this problem. Your notes are kept.',
    );
    this.focusLater('h3');
  }

  private focusLater(selector: string): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(),
      { injector: this.injector },
    );
  }

  protected scheduleReview(choice: ReviewChoice): void {
    this.progress.scheduleReview(this.problemId(), choice);
    const date = this.record()?.reviewAt;
    this.announcement.set(
      choice === 'none' || !date ? 'No review planned.' : `Review on ${reviewDateLabel(date)}.`,
    );
  }

  protected editNotes(notes: string): void {
    this.notes.set(notes);
    this.pending = { problemId: this.problemId(), notes };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.flushNotes();
      this.announcement.set('Notes saved on this device.');
    }, NOTES_SAVE_DELAY_MS);
  }

  private flushNotes(): void {
    clearTimeout(this.timer);
    const pending = this.pending;
    this.pending = undefined;
    if (pending) this.progress.setNotes(pending.problemId, pending.notes);
  }
}
