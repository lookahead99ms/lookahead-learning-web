import { DOCUMENT } from '@angular/common';
import { Component, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  meetsPasswordRules,
  PASSWORD_RULES,
  PasswordSignInApi,
  PasswordSignInError,
  PasswordStep,
  problemMessage,
} from './password-sign-in-api';

/** Where each next step lives; the email of the flow stays in PasswordSignInApi memory. */
export const PASSWORD_STEP_ROUTES = {
  newPassword: '/sign-in/new-password',
  code: '/sign-in/code',
  confirm: '/sign-up/confirm',
  forgot: '/sign-in/forgot',
  reset: '/sign-in/reset',
} as const;

/** Follows a step the Gateway returned: leave for the signed-in page, or open the next screen. */
export async function followStep(
  step: PasswordStep,
  context: { router: Router; document: Document; returnTo: string; after: 'sign-in' | 'sign-up' | 'reset' },
  api: PasswordSignInApi,
): Promise<void> {
  const queryParams = { returnTo: context.returnTo };
  switch (step.kind) {
    case 'signed-in':
      context.document.defaultView?.location.assign(step.next);
      return;
    case 'new-password':
      await context.router.navigate([PASSWORD_STEP_ROUTES.newPassword], { queryParams });
      return;
    case 'code':
      api.codeMethod.set(step.method);
      await context.router.navigate([PASSWORD_STEP_ROUTES.code], { queryParams });
      return;
    case 'code-sent':
      api.destination.set(step.destination);
      await context.router.navigate([context.after === 'reset' ? PASSWORD_STEP_ROUTES.reset : PASSWORD_STEP_ROUTES.confirm], { queryParams });
      return;
    case 'sign-in':
      await context.router.navigate(['/sign-in'], { queryParams, state: { passwordNotice: context.after } });
      return;
  }
}

@Component({
  selector: 'app-password-account-form',
  imports: [RouterLink],
  templateUrl: './password-account-form.html',
  styleUrl: './account.css',
})
export class PasswordAccountForm {
  readonly mode = input.required<'signin' | 'signup'>();
  readonly returnTo = input('/');
  readonly google = input(false);
  readonly googleUrl = input('');
  readonly initialError = input('');

  protected readonly api = inject(PasswordSignInApi);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  protected readonly rules = PASSWORD_RULES;
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly passwordVisible = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice: string;

  constructor() {
    const state = this.router.currentNavigation()?.extras.state?.['passwordNotice'];
    this.notice =
      state === 'sign-up'
        ? 'Your email is confirmed. Sign in to continue.'
        : state === 'reset'
          ? 'Your password is changed. Sign in with the new one.'
          : '';
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.error.set('');
    this.passwordVisible.set(false);
    const password = this.password();
    if (this.mode() === 'signup' && !meetsPasswordRules(password)) {
      this.error.set(problemMessage('password-rules'));
      return;
    }
    this.busy.set(true);
    try {
      const step =
        this.mode() === 'signup'
          ? await this.api.signUp({
              firstName: this.firstName().trim(),
              lastName: this.lastName().trim(),
              email: this.email(),
              password,
              returnTo: this.returnTo(),
            })
          : await this.api.signIn(this.email(), password, this.returnTo());
      this.password.set('');
      await followStep(
        step,
        { router: this.router, document: this.document, returnTo: this.returnTo(), after: this.mode() === 'signup' ? 'sign-up' : 'sign-in' },
        this.api,
      );
    } catch (error) {
      this.password.set('');
      if (error instanceof PasswordSignInError && error.problem === 'not-confirmed') {
        this.api.destination.set('');
        await this.router.navigate([PASSWORD_STEP_ROUTES.confirm], { queryParams: { returnTo: this.returnTo() } });
        return;
      }
      this.error.set(problemMessage(error instanceof PasswordSignInError ? error.problem : 'unavailable'));
    } finally {
      this.busy.set(false);
    }
  }
}
