import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { ACCOUNT_FETCH, StudyPlanAccount } from '../study-plan/study-plan-account';
@Component({
  selector: 'app-support',
  imports: [PlatformHeader, FormsModule, RouterLink],
  template: `<app-platform-header />
    <main id="main-content" class="support-page">
      <p class="eyebrow">Support and feedback</p>
      <h1>Tell us what happened.</h1>
      @if (accounts.account() && !accounts.sessionExpired()) {
        <p>
          Include the steps we can follow. Attach screenshots only when you want to share them;
          avoid private or sensitive information.
        </p>
        <form (ngSubmit)="submit()">
          <fieldset [disabled]="busy() || requestPending() || !!receipt()">
            <legend>Your feedback</legend>
            <label
              >Request type<select name="type" [(ngModel)]="type">
                <option value="feedback">Feedback</option>
                <option value="problem">Report a problem</option>
                <option value="question">Ask a question</option>
              </select></label
            >
            <label
              >Reply email<input
                name="email"
                type="email"
                required
                maxlength="254"
                [(ngModel)]="replyTo"
            /></label>
            <label
              >Subject<input name="subject" required maxlength="160" [(ngModel)]="subject"
            /></label>
            <label
              >Message<textarea
                name="message"
                required
                maxlength="5000"
                rows="8"
                [(ngModel)]="message"
              ></textarea>
            </label>
            <label
              >Screenshots<input
                type="file"
                accept="image/png,image/jpeg"
                multiple
                (change)="attach($event)"
                [disabled]="busy()"
            /></label>
            <p>
              Up to three PNG or JPEG images; 2 MB each and 5 MB in total. Image metadata is removed
              before sending.
            </p>
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
          </fieldset>
          <button type="submit" [disabled]="busy() || !!receipt()">
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
            <p>Your submitted message is kept unchanged while its delivery status is uncertain.</p>
          }
        </form>
      } @else {
        <p>Sign in to send feedback and receive a reply.</p>
        <a routerLink="/account" [queryParams]="{ returnTo: '/support' }">Sign in</a>
      }
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
      @if (receipt()) {
        <p role="status">{{ receipt() }}</p>
      }
    </main>`,
  styles: [
    `
      .support-page {
        max-width: 780px;
        margin: 40px auto;
        padding: 24px;
      }
      form,
      fieldset,
      label {
        display: grid;
        gap: 10px;
      }
      form {
        gap: 22px;
      }
      fieldset {
        min-width: 0;
        padding: 0;
        border: 0;
        gap: 22px;
      }
      legend {
        margin-bottom: 16px;
        font-weight: 700;
      }
      input,
      textarea,
      select,
      button {
        font: inherit;
        min-height: 44px;
        padding: 10px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: var(--surface);
        color: var(--text-strong);
        max-width: 100%;
      }
      input,
      textarea,
      select {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
      }
      label {
        min-width: 0;
      }
      textarea {
        resize: vertical;
      }
      button {
        cursor: pointer;
      }
      .image-previews {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
      }
      figure {
        margin: 0;
        max-width: 180px;
        overflow-wrap: anywhere;
      }
      img {
        width: 100%;
        height: 120px;
        object-fit: contain;
      }
    `,
  ],
})
export class SupportPage implements OnDestroy {
  protected readonly accounts = inject(StudyPlanAccount);
  private readonly transport = inject(ACCOUNT_FETCH);
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
