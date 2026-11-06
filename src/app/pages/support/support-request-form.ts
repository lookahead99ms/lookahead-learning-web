import { Component, OnDestroy, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ACCOUNT_FETCH, StudyPlanAccount } from '../study-plan/study-plan-account';
import { reviewedPages } from '../admin-reviews/platform-review.model';

const requestTypes = [
  { id: 'problem', icon: '🐞', label: 'Report a problem', hint: 'Something broke or looks wrong' },
  { id: 'feedback', icon: '💡', label: 'Share feedback', hint: 'An idea or something to improve' },
  { id: 'question', icon: '❓', label: 'Ask a question', hint: 'Not sure how something works' },
] as const;

/**
 * The support ticket form: sends one ticket by email and keeps it intact until confirmed. DLV-971 (owner,
 * 2026-11-06): on Support the kind cards live in the page, so the form takes its kind from there (`kind`, no picker
 * of its own, `compact`) and carries the same fields as feedback: Page beside the optional Page address, Title,
 * details, the reply email prefilled from the account, screenshots. The page and address travel inside the message
 * (the ticket API is unchanged).
 */
@Component({
  selector: 'app-support-request-form',
  imports: [FormsModule, RouterLink],
  template: `
    @if (accounts.account() && !accounts.sessionExpired()) {
      <form (ngSubmit)="submit()">
        <fieldset class="request-fields" [disabled]="busy() || requestPending() || !!receipt()">
          <legend class="visually-hidden">Your ticket</legend>
          @if (!kind()) {
          <fieldset class="type-picker">
            <legend>What do you need?</legend>
            <div class="type-options">
              @for (option of requestTypes; track option.id) {
                <label class="type-option" [class.selected]="type === option.id">
                  <input type="radio" name="type" [value]="option.id" [(ngModel)]="type" />
                  <span class="type-icon" aria-hidden="true">{{ option.icon }}</span>
                  <strong>{{ option.label }}</strong>
                  <small>{{ option.hint }}</small>
                </label>
              }
            </div>
          </fieldset>
          }
          @if (compact()) {
            <div class="field-row">
              <label
                >Page
                <select name="page" [(ngModel)]="page">
                  @for (option of pages; track option) {
                    <option [value]="option">{{ option }}</option>
                  }
                </select>
              </label>
              <label
                >Page address <span class="optional">(optional)</span
                ><input name="pageUrl" [(ngModel)]="pageUrl" placeholder="/learn/core-java" autocomplete="off"
              /></label>
            </div>
            <label>Title<input name="subject" required maxlength="160" [(ngModel)]="subject" /></label>
            <label
              >What you saw and what should change<textarea
                name="message"
                required
                maxlength="4000"
                rows="7"
                [(ngModel)]="message"
              ></textarea>
              <span class="hint">{{ message.length }} of 4000 characters</span>
            </label>
            <label
              >Reply email<input
                name="email"
                type="email"
                required
                maxlength="254"
                autocomplete="email"
                [(ngModel)]="replyTo"
              />
              <span class="hint">Prefilled from your account; shown for problems, questions and ideas.</span>
            </label>
          } @else {
          <div class="field-row">
            <label
              >Reply email<input
                name="email"
                type="email"
                required
                maxlength="254"
                autocomplete="email"
                [(ngModel)]="replyTo"
            /></label>
            <label
              >Subject<input name="subject" required maxlength="160" [(ngModel)]="subject"
            /></label>
          </div>
          <label
            >Message<textarea
              name="message"
              required
              maxlength="5000"
              rows="8"
              placeholder="What did you do, what did you expect, and what happened instead?"
              [(ngModel)]="message"
            ></textarea>
            <span class="hint">{{ message.length }} of 5000 characters</span>
          </label>
          }
          <!-- DLV-971 (owner, 2026-11-06): one slim row; the limits stay as they were. -->
          <div class="attach">
            <label class="file-picker"
              ><span aria-hidden="true">📎</span> Add screenshots<input
                type="file"
                accept="image/png,image/jpeg"
                multiple
                (change)="attach($event)"
                [disabled]="busy()"
            /></label>
            <p class="hint">Up to three images, 2 MB each.</p>
          </div>
          @if (images().length) {
            <div class="image-previews">
              @for (image of images(); track image.url) {
                <figure>
                  <img [src]="image.url" [alt]="image.file.name" />
                  <figcaption>{{ image.file.name }}</figcaption>
                  <button type="button" [disabled]="busy()" (click)="remove(image.url)">
                    Remove image
                  </button>
                </figure>
              }
            </div>
          }
        </fieldset>
        <div class="form-actions">
          <button
            class="primary"
            [attr.aria-busy]="busy()"
            type="submit"
            [disabled]="busy() || !!receipt()"
          >
            <span aria-hidden="true">{{ receipt() ? '✅' : '✉️' }}</span>
            {{
              receipt()
                ? 'Ticket recorded'
                : busy()
                  ? 'Sending…'
                  : requestPending()
                    ? 'Retry the same ticket'
                    : compact()
                      ? 'Send'
                      : 'Send ticket'
            }}
          </button>
          @if (compact() && !requestPending() && !receipt()) {
            <button type="button" class="secondary" [disabled]="busy()" (click)="clear()">Clear</button>
          }
          @if (requestPending() && !receipt()) {
            <p class="hint">
              Your submitted message is kept unchanged while its delivery status is uncertain.
            </p>
          }
        </div>
      </form>
    } @else {
      <div class="sign-in-card">
        <span class="sign-in-icon" aria-hidden="true">🔐</span>
        <div>
          <p>Sign in to send feedback and receive a reply.</p>
          <a class="primary" routerLink="/account" [queryParams]="{ returnTo: '/support' }"
            >Sign in</a
          >
        </div>
      </div>
    }
    @if (error()) {
      <p class="banner banner-error" role="alert">
        <span aria-hidden="true">⚠️</span> {{ error() }}
      </p>
    }
    @if (receipt()) {
      <p class="banner banner-success" role="status">
        <span aria-hidden="true">✅</span> {{ receipt() }}
      </p>
    }
  `,
  styleUrl: './support-request-form.css',
})
export class SupportRequestForm implements OnDestroy {
  protected readonly accounts = inject(StudyPlanAccount);
  private readonly transport = inject(ACCOUNT_FETCH);
  protected readonly requestTypes = requestTypes;
  protected readonly pages = reviewedPages;
  /** DLV-971: the kind chosen on the Support page (problem, question, feedback); null shows the form's own picker. */
  readonly kind = input<'problem' | 'question' | 'feedback' | null>(null);
  readonly compact = input(false);
  private readonly followKind = effect(() => {
    const chosen = this.kind();
    if (chosen) this.type = chosen;
  });
  protected type = 'feedback';
  protected page = 'Whole platform';
  protected pageUrl = '';
  /**
   * Prefilled from the account: the sign-in name when it is an email address (Cognito and Google accounts), or
   * `<name>@lookahead.dev` for a learner test account (learner01 to learner27; owner, 2026-11-06: their mail is
   * mocked, never sent). Anyone else types one.
   */
  protected replyTo = SupportRequestForm.replyEmailFor(this.accounts.account()?.username ?? '');
  static replyEmailFor(name: string): string {
    if (name.includes('@')) return name;
    return /^learner\d{2}$/.test(name) ? `${name}@lookahead.dev` : '';
  }
  protected subject = '';
  protected message = '';
  protected readonly images = signal<{ file: File; url: string }[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly receipt = signal('');
  protected readonly requestPending = signal(false);
  private request: { key: string; body: string; owner: string } | null = null;
  protected attach(event: Event): void {
    const field = event.target as HTMLInputElement;
    const files = [...(field.files ?? [])];
    field.value = '';
    const all = [...this.images().map((item) => item.file), ...files];
    if (
      all.length > 3 ||
      all.some(
        (file) => !['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024,
      ) ||
      all.reduce((sum, file) => sum + file.size, 0) > 5 * 1024 * 1024
    ) {
      this.error.set('Choose up to three PNG or JPEG images within the size limits.');
      return;
    }
    this.error.set('');
    this.images.update((current) => [
      ...current,
      ...files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
  }
  protected remove(url: string): void {
    URL.revokeObjectURL(url);
    this.images.update((items) => items.filter((item) => item.url !== url));
  }
  /** Clear (owner, 2026-11-06): the fields and the images go, the kind and the reply email stay. */
  protected clear(): void {
    if (this.busy() || this.requestPending()) return;
    for (const image of this.images()) URL.revokeObjectURL(image.url);
    this.images.set([]);
    this.page = 'Whole platform';
    this.pageUrl = '';
    this.subject = '';
    this.message = '';
    this.error.set('');
  }
  /** The message as sent: the page and its address follow the text when they were given. */
  private messageBody(): string {
    const where = [
      this.page && this.page !== 'Whole platform' ? `Page: ${this.page}` : '',
      this.pageUrl.trim() ? `Page address: ${this.pageUrl.trim()}` : '',
    ].filter(Boolean);
    return where.length ? `${this.message}\n\n${where.join('\n')}` : this.message;
  }
  async submit(): Promise<void> {
    if (this.busy() || this.receipt()) return;
    const owner = this.accounts.account()?.accountId;
    if (
      !owner ||
      this.accounts.sessionExpired() ||
      (this.request && this.request.owner !== owner)
    ) {
      this.error.set(
        'Sign in with the account that started this message before retrying. Your form is still here.',
      );
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      if (!this.request) {
        const images = await Promise.all(
          this.images().map(async (item) => ({
            name: item.file.name,
            data: await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result).split(',')[1]);
              reader.onerror = reject;
              reader.readAsDataURL(item.file);
            }),
          })),
        );
        this.request = {
          key: crypto.randomUUID(),
          owner,
          body: JSON.stringify({
            type: this.type,
            replyTo: this.replyTo,
            subject: this.subject,
            message: this.messageBody(),
            images,
          }),
        };
        this.requestPending.set(true);
      }
      const tokenResponse = await this.transport(this.accounts.apiPath('/auth/csrf'), {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!tokenResponse.ok) throw new Error();
      const csrf = (await tokenResponse.json()).data;
      if (
        this.accounts.account()?.accountId !== this.request.owner ||
        this.accounts.sessionExpired()
      )
        throw new Error('Account changed while preparing submission');
      const result = await this.transport(this.accounts.apiPath('/support'), {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
        headers: {
          'Content-Type': 'application/json',
          [csrf.headerName]: csrf.token,
          'Idempotency-Key': this.request.key,
          'X-LookAhead-Account': this.request.owner,
        },
        body: this.request.body,
      });
      const body = await result.json();
      if (body.data?.reference) {
        // DLV-971 (owner, 2026-11-06): every ticket is also an item under Support tickets and feedback, whatever the mail status.
        // "recorded" (Domain, 202): kept for Support tickets and feedback while support mail is not switched on, so no email was sent.
        const status = body.data.status;
        this.receipt.set(
          (status === 'accepted'
            ? 'The mail server accepted your message. Ticket recorded. The owner and admins see it under Support tickets and feedback; we also reply by email. '
            : status === 'recorded'
              ? 'Ticket recorded. The owner and admins see it under Support tickets and feedback. Email replies are not switched on yet, so there is no email for this one. '
              : 'Delivery could not be confirmed. This ticket will not be sent again automatically. Ticket recorded. The owner and admins see it under Support tickets and feedback; we also reply by email. ') +
            'Reference: ' +
            body.data.reference,
        );
      } else if ([400, 413, 422].includes(result.status) || body.code === 'SUPPORT_UNAVAILABLE') {
        this.request = null;
        this.requestPending.set(false);
        this.error.set(body.message ?? 'Check the form and attachment limits.');
      } else if (result.status === 401)
        this.error.set('Your session expired. Sign in again; your form is still here.');
      else
        this.error.set(
          'Support could not confirm this ticket. Your form is preserved. Retry sends the same ticket.',
        );
    } catch {
      this.error.set(
        'Support could not confirm this ticket. Your form is preserved. Retry sends the same ticket.',
      );
    } finally {
      this.busy.set(false);
    }
  }
  ngOnDestroy(): void {
    for (const item of this.images()) URL.revokeObjectURL(item.url);
  }
}
