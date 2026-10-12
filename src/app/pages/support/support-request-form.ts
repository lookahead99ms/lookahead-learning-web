import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ACCOUNT_FETCH, StudyPlanAccount } from '../study-plan/study-plan-account';

const requestTypes = [
  { id: 'problem', icon: '🐞', label: 'Report a problem', hint: 'Something broke or looks wrong' },
  { id: 'feedback', icon: '💡', label: 'Share feedback', hint: 'An idea or something to improve' },
  { id: 'question', icon: '❓', label: 'Ask a question', hint: 'Not sure how something works' },
] as const;

/** The Contact support form: sends one request by email and keeps it intact until confirmed. */
@Component({
  selector: 'app-support-request-form',
  imports: [FormsModule, RouterLink],
  template: `
    @if (accounts.account() && !accounts.sessionExpired()) {
      <form (ngSubmit)="submit()">
        <fieldset class="request-fields" [disabled]="busy() || requestPending() || !!receipt()">
          <legend class="visually-hidden">Your feedback</legend>
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
          <div class="attach">
            <label class="file-picker"
              ><span aria-hidden="true">📎</span> Screenshots<input
                type="file"
                accept="image/png,image/jpeg"
                multiple
                (change)="attach($event)"
                [disabled]="busy()"
            /></label>
            <p class="hint">
              Up to three PNG or JPEG images; 2 MB each and 5 MB in total. Image metadata is removed
              before sending.
            </p>
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
                ? 'Request recorded'
                : busy()
                  ? 'Sending…'
                  : requestPending()
                    ? 'Retry the same request'
                    : 'Send feedback'
            }}
          </button>
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
  protected type = 'feedback';
  protected replyTo = '';
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
            message: this.message,
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
        this.receipt.set(
          (body.data.status === 'accepted'
            ? 'The mail server accepted your message. '
            : 'Delivery could not be confirmed. This request will not be sent again automatically. ') +
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
          'Support could not confirm this request. Your form is preserved. Retry sends the same request.',
        );
    } catch {
      this.error.set(
        'Support could not confirm this request. Your form is preserved. Retry sends the same request.',
      );
    } finally {
      this.busy.set(false);
    }
  }
  ngOnDestroy(): void {
    for (const item of this.images()) URL.revokeObjectURL(item.url);
  }
}
