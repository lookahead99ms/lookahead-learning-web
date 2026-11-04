import { Component, computed, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { AccountMergeClient, maskMergeEmail } from './account-merge-client';

/** Seconds before "Send the email again" works again. */
export const MERGE_EMAIL_COOLDOWN = 60;

/**
 * DLV-969 S36.8: "Check your inbox". Shown after a sign-in that reports another account with the same email, and after
 * asking for a new link. The text never changes with what the Domain did: it always answers 202.
 */
@Component({
  selector: 'app-merge-inbox-panel',
  templateUrl: './merge-inbox-panel.html',
  styleUrls: ['./account.css', './account-merge.css'],
})
export class MergeInboxPanel implements OnInit {
  /** The signed-in email; shown masked. Empty when unknown. */
  readonly email = input('');
  /** True when the caller already asked for the email; the panel then only starts the wait. */
  readonly alreadySent = input(false);
  /** Where the sign-in was going (a same-origin path the API already checked); a full page load continues there. */
  readonly next = input<string | null>(null);
  /** False when the page already has a heading that says "Check your inbox". */
  readonly titled = input(true);
  /** After each request the Domain accepted. */
  readonly sent = output<void>();

  private readonly client = inject(AccountMergeClient);
  protected readonly masked = computed(() => maskMergeEmail(this.email()));
  protected readonly wait = signal(0);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private timer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop();
    });
  }

  ngOnInit(): void {
    if (this.alreadySent()) this.startWait();
    else void this.send();
  }

  protected async send(): Promise<void> {
    if (this.busy() || this.wait() > 0) return;
    this.busy.set(true);
    this.error.set('');
    const result = await this.client.requestMergeEmail();
    // The panel may be gone by the time the answer arrives: then no timer and no event.
    if (this.destroyed) return;
    this.busy.set(false);
    if (result.kind === 'sent') {
      this.startWait();
      this.sent.emit();
      return;
    }
    this.error.set(
      result.kind === 'signed-out'
        ? 'Your sign-in has ended. Sign in again, then send the email again.'
        : "We couldn't send the email right now. Try again in a minute.",
    );
  }

  private startWait(): void {
    this.stop();
    if (this.destroyed) return;
    this.wait.set(MERGE_EMAIL_COOLDOWN);
    this.timer = setInterval(() => {
      const left = this.wait() - 1;
      this.wait.set(Math.max(0, left));
      if (left <= 0) this.stop();
    }, 1000);
  }

  private stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
