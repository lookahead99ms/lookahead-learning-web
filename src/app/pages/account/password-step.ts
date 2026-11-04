import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { SignInBrand } from './sign-in-brand';
import { safeAccountReturn } from './account-navigation';
import { followStep } from './password-account-form';
import { MergeInboxPanel } from './merge-inbox-panel';
import {
  maskEmail,
  mergeNext,
  meetsPasswordRules,
  PASSWORD_RULES,
  PasswordSignInApi,
  PasswordSignInError,
  PasswordStep,
  problemMessage,
} from './password-sign-in-api';

export type PasswordStepKind = 'confirm' | 'forgot' | 'reset' | 'new-password' | 'code';

/** DLV-969: the screens between "Sign in" or "Create account" and a signed-in page. */
@Component({
  selector: 'app-password-step',
  imports: [PlatformHeader, RouterLink, SignInBrand, MergeInboxPanel],
  templateUrl: './password-step.html',
  styleUrl: './account.css',
})
export class PasswordStepPage {
  protected readonly api = inject(PasswordSignInApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly accounts = inject(StudyPlanAccount);
  /** Continue with Google is offered on these pages (the same condition as the sign-in form's Google hint). */
  protected readonly google = computed(() => !!this.accounts.authOptions()?.google);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly kind = (this.route.snapshot.data['passwordStep'] ?? 'forgot') as PasswordStepKind;
  protected readonly returnTo = computed(() => safeAccountReturn(this.query().get('returnTo')));
  protected readonly rules = PASSWORD_RULES;
  protected readonly email = signal(this.api.email());
  protected readonly code = signal('');
  protected readonly newPassword = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly status = signal('');
  /** DLV-969 S36.8: a finished sign-in that reports another account with this email shows "Check your inbox". */
  protected readonly mergeNext = signal<string | null>(null);
  /** The address the code went to: Cognito's masked form when it gave one, otherwise our own mask. */
  protected readonly destination = computed(() => this.api.destination() || (this.email() ? maskEmail(this.email()) : ''));
  /** A reload loses the in-memory email; then the screen asks for it again. */
  protected readonly needsEmail = computed(() => this.kind !== 'new-password' && this.kind !== 'code' && !this.api.email());

  constructor() {
    if (!this.accounts.authOptions()) void this.accounts.loadAuthOptions();
  }

  protected readonly heading: Record<PasswordStepKind, string> = {
    confirm: 'Check your email',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
    'new-password': 'Set a new password',
    code: 'Enter your code',
  };

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.error.set('');
    this.status.set('');
    if (this.needsEmail()) this.api.email.set(this.email().trim());
    const password = this.newPassword();
    if ((this.kind === 'reset' || this.kind === 'new-password') && !meetsPasswordRules(password)) {
      this.error.set(problemMessage('password-rules'));
      return;
    }
    this.busy.set(true);
    try {
      let step: PasswordStep;
      switch (this.kind) {
        case 'confirm':
          step = await this.api.confirm(this.code(), this.returnTo());
          break;
        case 'forgot':
          step = await this.api.forgot(this.email());
          break;
        case 'reset':
          step = await this.api.reset(this.code(), password, this.returnTo());
          break;
        case 'new-password':
          step = await this.api.respond({ newPassword: password });
          break;
        case 'code':
          step = await this.api.respond({ code: this.code() });
          break;
      }
      this.newPassword.set('');
      const merge = mergeNext(step);
      if (merge !== null) {
        this.mergeNext.set(merge);
        return;
      }
      await followStep(
        step,
        {
          router: this.router,
          document: this.document,
          returnTo: this.returnTo(),
          after: this.kind === 'forgot' ? 'reset' : this.kind === 'reset' ? 'reset' : this.kind === 'confirm' ? 'sign-up' : 'sign-in',
        },
        this.api,
      );
    } catch (error) {
      this.newPassword.set('');
      this.error.set(problemMessage(error instanceof PasswordSignInError ? error.problem : 'unavailable'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async resend(): Promise<void> {
    if (this.busy()) return;
    this.error.set('');
    this.busy.set(true);
    try {
      const step = await this.api.resend();
      if (step.kind === 'code-sent' && step.destination) this.api.destination.set(step.destination);
      this.status.set('We sent a new code.');
    } catch (error) {
      this.error.set(problemMessage(error instanceof PasswordSignInError ? error.problem : 'unavailable'));
    } finally {
      this.busy.set(false);
    }
  }
}
