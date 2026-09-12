import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { PatternProblemFixture } from '../../content/content.models';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import {
  DsaExecutionClient,
  ExecutionCapability,
  ExecutionError,
  ExecutionJob,
  ExecutionLanguage,
} from './dsa-execution-client';

const statusLabels: Record<ExecutionJob['status'], string> = {
  queued: 'Queued',
  compiling: 'Compiling',
  running: 'Running examples',
  passed: 'Examples passed',
  failed: 'Example contract not met',
  compile_error: 'Compilation or syntax error',
  runtime_error: 'Runtime error',
  timeout: 'Time limit reached',
  resource_limit: 'Resource limit reached',
  canceled: 'Canceled',
  internal_error: 'Runner error',
};
export const isExecutionActive = (job: ExecutionJob | null): boolean =>
  !!job && ['queued', 'compiling', 'running'].includes(job.status);

@Component({
  selector: 'app-dsa-run-examples',
  template: `
    @if (eligible()) {
      <section class="run-examples" aria-label="Run visible examples">
        <div class="run-toolbar">
          <button
            type="button"
            class="run-button"
            [disabled]="!ready() || busy() || tooLarge()"
            (click)="run()"
          >
            Run examples
          </button>
          @if (busy()) {
            <button type="button" [disabled]="canceling()" (click)="cancel()">
              {{ canceling() ? 'Canceling' : 'Cancel run' }}
            </button>
          }
          @if (!ready() && !busy()) {
            <button
              type="button"
              [attr.aria-disabled]="checking() || uncertain()"
              (click)="refresh()"
            >
              Check runner
            </button>
          }
          <span class="run-status" role="status" aria-live="polite">{{ message() }}</span>
        </div>
        <p class="run-note">
          Local author preview · Only visible examples run. Source is sent when you choose Run
          examples; avoid including secrets.
        </p>
        @if (tooLarge()) {
          <p role="alert">Source exceeds the {{ sourceLimit() / 1024 }} KiB limit.</p>
        }
        @if (submitted(); as snapshot) {
          <p class="snapshot">
            Results for submitted {{ snapshot.language }} source.
            @if (edited()) {
              <strong>The editor has changed since this run.</strong>
            }
          </p>
        }
        @if (job(); as result) {
          @if (result.diagnostics) {
            <pre class="diagnostics">{{ result.diagnostics }}</pre>
          }
          <div class="example-results">
            @for (row of result.results; track row.fixtureId) {
              <article class="example-result">
                <h4>{{ fixture(row.fixtureId)?.label || row.fixtureId }}</h4>
                <dl>
                  <dt>Input</dt>
                  <dd>{{ fixture(row.fixtureId)?.input || 'Unavailable' }}</dd>
                  <dt>Allowed result</dt>
                  <dd>
                    {{
                      fixture(row.fixtureId)?.expectedOutput ||
                        'Two distinct indices in either order'
                    }}
                    · Either index order; input must remain unchanged.
                  </dd>
                  <dt>Actual result</dt>
                  <dd>
                    <pre>{{ displayActual(row.actual) }}</pre>
                  </dd>
                  <dt>Outcome</dt>
                  <dd>{{ resultLabel(row.status) }}</dd>
                </dl>
                @if (row.diagnostics) {
                  <pre class="diagnostics">{{ row.diagnostics }}</pre>
                }
              </article>
            }
          </div>
          @if (result.status === 'passed') {
            <p class="run-note">
              Passing these examples does not prove correctness for every input, optimal complexity,
              or study completion.
            </p>
          }
        }
      </section>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .run-examples {
        padding: 16px;
        border-top: 1px solid var(--line);
        background: var(--surface);
        color: var(--text-strong);
      }
      .run-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
      }
      button {
        min-height: 44px;
        padding: 10px 16px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: var(--surface);
        color: var(--text-strong);
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .run-button {
        background: var(--accent-strong);
        color: var(--accent-on-primary);
      }
      button:disabled,
      button[aria-disabled='true'] {
        opacity: 0.6;
        cursor: default;
      }
      button:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: 3px;
      }
      .run-status {
        font-weight: 650;
        overflow-wrap: anywhere;
      }
      .run-note,
      .snapshot {
        font-size: 0.875rem;
        line-height: 1.6;
        color: var(--text-subtle);
      }
      .snapshot strong {
        display: block;
        color: var(--text-strong);
      }
      .example-results {
        display: grid;
        gap: 12px;
      }
      .example-result {
        min-width: 0;
        padding: 14px;
        border: 1px solid var(--line);
        border-radius: 6px;
      }
      h4 {
        margin: 0 0 12px;
        font-size: 1rem;
      }
      dl {
        margin: 0;
        display: grid;
        grid-template-columns: minmax(80px, 120px) minmax(0, 1fr);
        gap: 8px 12px;
        font-size: 0.875rem;
      }
      dt {
        font-weight: 650;
      }
      dd {
        margin: 0;
        overflow-wrap: anywhere;
      }
      pre {
        margin: 0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font:
          0.85rem/1.6 ui-monospace,
          monospace;
      }
      .diagnostics {
        max-height: 240px;
        overflow: auto;
        margin: 12px 0;
      }
      @media (max-width: 420px) {
        .run-examples {
          padding: 12px;
        }
        dl {
          grid-template-columns: 1fr;
          gap: 4px;
        }
        dd {
          margin-bottom: 8px;
        }
      }
    `,
  ],
})
export class DsaRunExamples {
  readonly problemId = input('');
  readonly language = input.required<ExecutionLanguage>();
  readonly source = input.required<string>();
  readonly fixtures = input<PatternProblemFixture[]>([]);
  private readonly account = inject(StudyPlanAccount);
  private readonly client = inject(DsaExecutionClient);
  protected readonly eligible = computed(
    () =>
      this.problemId() === 'algorithmic-two-sum' &&
      !!this.account.account()?.authorPreview &&
      !this.account.sessionExpired(),
  );
  protected readonly capability = signal<ExecutionCapability | null>(null);
  protected readonly job = signal<ExecutionJob | null>(null);
  protected readonly submitted = signal<{
    source: string;
    language: ExecutionLanguage;
    hash: string;
  } | null>(null);
  protected readonly busy = signal(false);
  protected readonly uncertain = signal(false);
  protected readonly checking = signal(false);
  protected readonly canceling = signal(false);
  protected readonly message = signal('Checking local runner');
  protected readonly sourceLimit = computed(() =>
    Math.min(65536, this.capability()?.limits.sourceBytes ?? 65536),
  );
  protected readonly tooLarge = computed(
    () => new TextEncoder().encode(this.source()).length > this.sourceLimit(),
  );
  protected readonly ready = computed(
    () => !!this.capability()?.enabled && !!this.supported() && !this.uncertain(),
  );
  protected readonly edited = computed(
    () =>
      !!this.submitted() &&
      (this.source() !== this.submitted()!.source ||
        this.language() !== this.submitted()!.language),
  );
  private readonly supported = computed(() =>
    this.capability()?.problems.find(
      (p) => p.problemId === this.problemId() && p.languages.includes(this.language()),
    ),
  );
  private epoch = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private controller = new AbortController();
  private owner = '';
  private deadline = 0;
  private cancelRequested = false;

  constructor() {
    effect((onCleanup) => {
      const eligible = this.eligible();
      const owner = this.account.account()?.accountId ?? '';
      this.problemId();
      this.language();
      untracked(() => {
        this.owner = owner;
        this.capability.set(null);
        this.job.set(null);
        this.submitted.set(null);
        this.checking.set(false);
        this.uncertain.set(false);
        this.busy.set(false);
        this.canceling.set(false);
        this.cancelRequested = false;
        this.controller = new AbortController();
        if (eligible) void this.refresh();
      });
      onCleanup(() => {
        this.epoch++;
        this.controller.abort();
        clearTimeout(this.timer);
        const oldJob = untracked(this.job);
        if (isExecutionActive(oldJob)) void this.client.cancel(owner, oldJob!.id).catch(() => {});
      });
    });
  }
  protected async refresh(): Promise<void> {
    if (!this.eligible() || this.busy() || this.checking() || this.uncertain()) return;
    const epoch = this.epoch;
    this.checking.set(true);
    this.message.set('Checking local runner');
    try {
      const value = await this.client.capabilities(this.owner, this.controller.signal);
      if (epoch !== this.epoch) return;
      this.capability.set(value);
      this.message.set(
        this.ready()
          ? 'Ready to run visible examples'
          : 'The local runner is unavailable. Your code remains in the editor.',
      );
    } catch (error) {
      if (epoch === this.epoch) this.message.set(this.errorMessage(error));
    } finally {
      if (epoch === this.epoch) this.checking.set(false);
    }
  }
  protected async run(): Promise<void> {
    const supported = this.supported();
    if (!this.ready() || !supported || this.busy() || this.tooLarge()) return;
    if (!globalThis.crypto?.subtle || !globalThis.crypto?.randomUUID) {
      this.message.set(
        'Running examples requires HTTPS or localhost. This connection cannot securely identify the submitted source. Your draft remains available.',
      );
      return;
    }
    const epoch = this.epoch,
      owner = this.owner,
      source = this.source(),
      language = this.language();
    this.busy.set(true);
    this.cancelRequested = false;
    this.job.set(null);
    this.message.set('Submitting examples');
    let dispatched = false;
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
      const hash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      if (epoch !== this.epoch) return;
      this.submitted.set({ source, language, hash });
      this.deadline = Date.now() + 90000;
      dispatched = true;
      const job = await this.client.start(
        owner,
        {
          problemId: this.problemId(),
          language,
          source,
          contractVersion: supported.contractVersion,
          fixtureVersion: supported.fixtureVersion,
        },
        crypto.randomUUID(),
      );
      if (epoch !== this.epoch) {
        if (isExecutionActive(job)) void this.client.cancel(owner, job.id).catch(() => {});
        return;
      }
      this.accept(job);
      if (this.cancelRequested && isExecutionActive(job)) await this.cancel();
      else this.schedule(epoch);
    } catch (error) {
      if (epoch === this.epoch) {
        this.message.set(this.errorMessage(error));
        if (
          dispatched &&
          !(error instanceof ExecutionError && error.status >= 400 && error.status < 500)
        ) {
          this.uncertain.set(true);
          this.timer = setTimeout(
            () => {
              if (epoch === this.epoch) {
                this.uncertain.set(false);
                this.message.set(
                  'The previous run deadline has elapsed. You can run examples again.',
                );
              }
            },
            Math.max(0, this.deadline - Date.now()),
          );
        }
        this.busy.set(false);
        this.canceling.set(false);
      }
    }
  }
  protected async cancel(): Promise<void> {
    this.cancelRequested = true;
    this.canceling.set(true);
    clearTimeout(this.timer);
    const job = this.job();
    if (!job) {
      this.message.set('Cancel requested; waiting for the job receipt');
      return;
    }
    const epoch = this.epoch;
    try {
      const canceled = await this.client.cancel(this.owner, job.id);
      if (epoch === this.epoch) {
        this.accept(canceled);
        this.schedule(epoch);
      }
    } catch (error) {
      if (epoch === this.epoch) {
        this.message.set('Cancellation could not be confirmed. The server deadline still applies.');
        this.schedule(epoch);
      }
    } finally {
      if (epoch === this.epoch) this.canceling.set(false);
    }
  }
  private accept(job: ExecutionJob): void {
    const snapshot = this.submitted();
    const supported = this.supported();
    if (
      !snapshot ||
      job.sourceSha256 !== snapshot.hash ||
      job.language !== snapshot.language ||
      job.problemId !== this.problemId() ||
      job.contractVersion !== supported?.contractVersion ||
      job.fixtureVersion !== supported.fixtureVersion ||
      (this.job() && job.id !== this.job()!.id)
    )
      throw new Error(
        'The result does not match the submitted source. No result can be confirmed.',
      );
    if (this.job() && !isExecutionActive(this.job())) return;
    this.job.set(job);
    this.busy.set(isExecutionActive(job));
    this.message.set(statusLabels[job.status]);
  }
  private schedule(epoch: number): void {
    if (!this.busy() || epoch !== this.epoch) return;
    if (Date.now() >= this.deadline) {
      this.busy.set(false);
      this.message.set(
        'Stopped waiting for this run. Cancellation requested; the server deadline still applies.',
      );
      const job = this.job();
      if (job) void this.client.cancel(this.owner, job.id).catch(() => {});
      return;
    }
    this.timer = setTimeout(() => void this.poll(epoch), 800);
  }
  private async poll(epoch: number): Promise<void> {
    const job = this.job();
    if (!job || epoch !== this.epoch) return;
    try {
      const value = await this.client.status(this.owner, job.id, this.controller.signal);
      if (epoch === this.epoch) {
        this.accept(value);
        this.schedule(epoch);
      }
    } catch (error) {
      if (epoch === this.epoch) {
        this.busy.set(false);
        this.message.set(this.errorMessage(error));
        void this.client.cancel(this.owner, job.id).catch(() => {});
      }
    }
  }
  protected fixture(id: string): PatternProblemFixture | undefined {
    return this.fixtures().find((f) => f.id === id);
  }
  protected displayActual(value: unknown): string {
    return value === undefined ? 'No result' : JSON.stringify(value);
  }
  protected resultLabel(status: string): string {
    return (
      (
        {
          passed: 'Passed',
          failed: 'Contract not met',
          runtime_error: 'Runtime error',
          timeout: 'Time limit reached',
          resource_limit: 'Resource limit reached',
        } as Record<string, string>
      )[status] ?? 'Result could not be confirmed'
    );
  }
  private errorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'The runner is unavailable. Your code remains in the editor.';
  }
}
