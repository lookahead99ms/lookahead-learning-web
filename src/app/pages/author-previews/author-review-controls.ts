import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthorDocument } from '../../core/author-documents-client';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import {
  AUTHOR_REVIEW_CLIENT,
  AuthorReviewDecision,
  AuthorReviewError,
  AuthorReviewReceipt,
  AuthorReviewSubmission,
  AuthorReviewBinding,
} from './author-review-client';

@Component({
  selector: 'app-author-review-controls',
  imports: [DatePipe],
  templateUrl: './author-review-controls.html',
  styleUrl: './author-review-controls.css',
})
export class AuthorReviewControls {
  readonly artifact = input.required<AuthorDocument>();
  private readonly client = inject(AUTHOR_REVIEW_CLIENT, { optional: true });
  private readonly accounts = inject(StudyPlanAccount);
  private readonly injector = inject(Injector);
  private readonly result = viewChild<ElementRef<HTMLElement>>('result');
  private generation = 0;
  private attempt: AuthorReviewSubmission | null = null;
  protected readonly connected = this.client !== null;
  protected readonly authorized = computed(
    () => !!this.accounts.account()?.authorPreview && !this.accounts.sessionExpired(),
  );
  protected readonly decision = signal<AuthorReviewDecision | null>(null);
  protected readonly comment = signal('');
  protected readonly state = signal<'idle' | 'saving' | 'recorded' | 'failed' | 'stale'>('idle');
  protected readonly failure = signal('');
  protected readonly receipt = signal<AuthorReviewReceipt | null>(null);
  protected readonly locked = signal(false);
  protected readonly history = signal<AuthorReviewReceipt[]>([]);
  protected readonly historyState = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly loadingMore = signal(false);
  protected readonly historyError = signal('');
  protected readonly conflict = signal(false);
  protected readonly commentLength = computed(() => [...this.comment()].length);

  constructor() {
    effect(() => {
      this.artifact();
      this.accounts.account()?.accountId;
      this.authorized();
      this.generation++;
      this.attempt = null;
      this.decision.set(null);
      this.comment.set('');
      this.receipt.set(null);
      this.locked.set(false);
      this.failure.set('');
      this.state.set('idle');
      this.history.set([]);
      this.nextCursor.set(null);
      this.conflict.set(false);
      void this.loadHistory();
    });
  }

  private binding(): AuthorReviewBinding {
    const artifact = this.artifact();
    return {
      artifactId: artifact.id,
      artifactVersion: artifact.version,
      owningTicket: artifact.owningTicket,
      sourceSha256: artifact.sourceSha256 ?? '',
    };
  }
  protected decisionLabel(decision: AuthorReviewDecision): string {
    return { approve: 'Approve', decline: 'Decline', 'need-more': 'Need more' }[decision];
  }
  protected async loadHistory(more = false): Promise<void> {
    if (!this.client || !this.authorized()) return;
    const generation = this.generation;
    const cursor = more ? this.nextCursor() : undefined;
    if (more && (!cursor || this.loadingMore())) return;
    if (more) this.loadingMore.set(true);
    else this.historyState.set('loading');
    this.historyError.set('');
    try {
      const page = await this.client.load(this.binding(), cursor ?? undefined);
      if (generation !== this.generation || !this.authorized()) return;
      this.history.set(
        more
          ? [
              ...this.history(),
              ...page.entries.filter(
                (item) => !this.history().some((existing) => existing.recordId === item.recordId),
              ),
            ]
          : page.entries,
      );
      this.nextCursor.set(page.nextCursor);
      this.historyState.set('ready');
      if (!more) {
        const current = page.entries[0],
          binding = this.binding();
        const confirmedAttempt =
          this.attempt &&
          page.entries.find((entry) => entry.idempotencyKey === this.attempt!.idempotencyKey);
        if (confirmedAttempt && this.matchesAttempt(confirmedAttempt, this.attempt!)) {
          this.receipt.set(confirmedAttempt);
          this.state.set('recorded');
          this.locked.set(true);
        } else if (
          !this.attempt &&
          current &&
          Object.entries(binding).every(
            ([key, value]) => current[key as keyof AuthorReviewReceipt] === value,
          )
        ) {
          this.receipt.set(current);
          this.state.set('recorded');
          this.locked.set(true);
          this.decision.set(current.decision);
          this.comment.set(current.comment);
        }
      }
    } catch (error) {
      if (generation !== this.generation || !this.authorized()) return;
      if (!more) this.historyState.set('failed');
      this.historyError.set(
        error instanceof AuthorReviewError && error.kind === 'version-changed'
          ? 'This packet no longer matches the server’s review artifact. Reload the review page.'
          : 'Review history could not be confirmed. Reload it before recording a decision.',
      );
    } finally {
      if (generation === this.generation) this.loadingMore.set(false);
    }
  }
  protected revise(): void {
    if (this.historyState() !== 'ready' || this.state() !== 'recorded') return;
    this.attempt = null;
    this.receipt.set(null);
    this.conflict.set(false);
    this.decision.set(null);
    this.comment.set('');
    this.locked.set(false);
    this.failure.set('');
    this.state.set('idle');
    afterNextRender(() => this.choices()?.nativeElement.querySelector('input')?.focus(), {
      injector: this.injector,
    });
  }
  protected reviewConflict(): void {
    if (!this.conflict() || this.historyState() !== 'ready') return;
    this.attempt = null;
    this.locked.set(false);
    this.conflict.set(false);
    this.failure.set('');
    this.state.set('idle');
    afterNextRender(() => this.choices()?.nativeElement.querySelector('input')?.focus(), {
      injector: this.injector,
    });
  }
  private readonly choices = viewChild<ElementRef<HTMLFieldSetElement>>('choices');
  private matchesAttempt(receipt: AuthorReviewReceipt, attempt: AuthorReviewSubmission): boolean {
    return [
      'artifactId',
      'artifactVersion',
      'owningTicket',
      'sourceSha256',
      'decision',
      'comment',
      'idempotencyKey',
      'supersedesEventId',
    ].every(
      (key) =>
        receipt[key as keyof AuthorReviewReceipt] === attempt[key as keyof AuthorReviewSubmission],
    );
  }

  protected choose(value: AuthorReviewDecision): void {
    this.decision.set(value);
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (
      !this.client ||
      !this.authorized() ||
      this.historyState() !== 'ready' ||
      this.conflict() ||
      ['saving', 'recorded', 'stale'].includes(this.state())
    )
      return;
    const decision = this.decision(),
      comment = this.comment().trim();
    if (!decision || (decision !== 'approve' && !comment) || [...comment].length > 2000) {
      this.failure.set(
        !decision
          ? 'Choose a review decision.'
          : [...comment].length > 2000
            ? 'Keep your comment to 2,000 characters or fewer.'
            : 'Add an explanation for Decline or Need more.',
      );
      this.state.set('failed');
      this.focusResult();
      return;
    }
    const artifact = this.artifact(),
      generation = this.generation;
    if (!artifact.sourceSha256 || !/^[a-f0-9]{64}$/.test(artifact.sourceSha256)) {
      this.state.set('stale');
      this.failure.set(
        'The review publication has no verified source binding. Reload the packet before making a decision.',
      );
      this.focusResult();
      return;
    }
    this.attempt ??= {
      artifactId: artifact.id,
      artifactVersion: artifact.version,
      owningTicket: artifact.owningTicket,
      sourceSha256: artifact.sourceSha256,
      decision,
      comment,
      idempotencyKey: crypto.randomUUID(),
      supersedesEventId: this.history()[0]?.recordId ?? null,
    };
    const attempt = this.attempt;
    this.locked.set(true);
    this.failure.set('');
    this.state.set('saving');
    try {
      const receipt = await this.client.record({ ...attempt });
      if (generation !== this.generation || !this.authorized()) return;
      if (
        !receipt.recordId ||
        !receipt.recordedBy ||
        !Number.isFinite(Date.parse(receipt.recordedAt)) ||
        !this.matchesAttempt(receipt, attempt)
      ) {
        throw new AuthorReviewError('unconfirmed');
      }
      this.receipt.set(receipt);
      this.history.update((entries) => [
        receipt,
        ...entries.filter((entry) => entry.recordId !== receipt.recordId),
      ]);
      this.state.set('recorded');
    } catch (error) {
      if (generation !== this.generation || !this.authorized()) return;
      if (error instanceof AuthorReviewError && error.kind === 'version-changed') {
        this.state.set('stale');
        this.failure.set(
          'The published review changed. Reload the packet before making a decision.',
        );
      } else if (
        error instanceof AuthorReviewError &&
        ['supersession-conflict', 'idempotency-conflict'].includes(error.kind)
      ) {
        this.conflict.set(true);
        this.historyState.set('failed');
        this.state.set('failed');
        this.historyError.set(
          'A review decision changed or this request conflicts with a recorded submission. Reload history and review the latest decision before continuing.',
        );
        this.failure.set('The replacement decision was not confirmed. Your comment is preserved.');
      } else if (
        error instanceof AuthorReviewError &&
        ['unauthorized', 'forbidden'].includes(error.kind)
      ) {
        this.historyState.set('failed');
        this.state.set('failed');
        this.historyError.set(
          'Sign-in and author access must be confirmed before recording a decision.',
        );
        this.failure.set('Access could not be confirmed. Your comment is preserved.');
      } else if (error instanceof AuthorReviewError && error.kind === 'invalid') {
        this.attempt = null;
        this.locked.set(false);
        this.state.set('failed');
        this.failure.set('The decision was not accepted. Check your explanation and submit again.');
      } else {
        this.state.set('failed');
        this.failure.set(
          'Recording could not be confirmed. Your decision and comment are preserved. Retry the same submission to check its outcome.',
        );
      }
    }
    this.focusResult();
  }
  private focusResult(): void {
    afterNextRender(() => this.result()?.nativeElement.focus(), { injector: this.injector });
  }
  ngOnDestroy(): void {
    this.generation++;
    this.attempt = null;
  }
}
