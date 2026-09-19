import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { registrationCountries, registrationCountryCode } from './countries';
import { AccountSettings } from './account-settings';
import { ACCOUNT_SETTINGS_CLIENT } from './account-settings-client';
import { AccountStudyPlans } from './account-study-plans';

export function safeAccountReturn(value: string | null): string {
  if (!value?.startsWith('/') || /[\\\u0000-\u0020\u007f-\u009f]/.test(value)) return '/';
  try {
    const path = decodeURIComponent(value.split(/[?#]/, 1)[0]);
    // Check the original path before navigation can normalize traversal segments.
    if (
      /[\\\u0000-\u001f\u007f-\u009f]/.test(decodeURIComponent(value)) ||
      /(?:^|\/)\.{1,2}(?:\/|$)/.test(path)
    )
      return '/';
    return path === '/' ||
      path === '/account' ||
      /^\/(?:study-plan|learn|grow|look-ahead|search|support|author)(?:\/.*)?$/.test(path)
      ? value
      : '/';
  } catch {
    return '/';
  }
}
@Component({
  selector: 'app-account',
  imports: [PlatformHeader, RouterLink, AccountSettings, AccountStudyPlans],
  providers: [{ provide: ACCOUNT_SETTINGS_CLIENT, useExisting: StudyPlanAccount }],
  templateUrl: './account.html',
  styleUrl: './account.css',
})
export class AccountPage {
  protected readonly store = inject(StudyPlanAccount);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly routeData = toSignal(this.route.data, {
    initialValue: this.route.snapshot.data,
  });
  protected readonly returnTo = computed(() => safeAccountReturn(this.query().get('returnTo')));
  protected readonly returnUrl = computed(() => this.router.parseUrl(this.returnTo()));
  protected readonly signup = computed(
    () => this.routeData()['accountMode'] === 'signup' || this.query().get('mode') === 'signup',
  );
  protected readonly authenticated = computed(
    () => !!this.store.account() && !this.store.sessionExpired(),
  );
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly passwordVisible = signal(false);
  protected readonly confirmPassword = signal('');
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly countryName = signal('');
  protected readonly formError = signal(
    this.route.snapshot.queryParamMap.get('error') === 'oauth'
      ? 'Sign-in could not be completed. Please try again.'
      : '',
  );
  protected readonly oauthContinuation = computed(() =>
    this.query().get('oauth') === 'continue' ? 'continue' : null,
  );
  protected readonly countries = registrationCountries;
  protected readonly passwordChanged =
    this.router.currentNavigation()?.extras.state?.['passwordChanged'] === true;
  constructor() {
    void this.store.loadAuthOptions();
  }
  protected async submit(): Promise<void> {
    this.passwordVisible.set(false);
    this.formError.set('');
    const password = this.password();
    const confirmation = this.confirmPassword();
    this.password.set('');
    this.confirmPassword.set('');
    if (this.signup()) {
      const passwordLength = Array.from(password).length;
      if (passwordLength < 15 || passwordLength > 128) {
        this.formError.set('Use 15 to 128 characters for your password. Please enter it again.');
        return;
      }
      const countryCode = registrationCountryCode(this.countryName());
      if (!countryCode) {
        this.formError.set('Choose your country of residence from the list.');
        return;
      }
      if (password !== confirmation) {
        this.formError.set('Passwords must match.');
        return;
      }
      const details = {
        firstName: this.firstName().trim(),
        lastName: this.lastName().trim(),
        email: this.email().trim(),
        password,
        confirmPassword: confirmation,
        countryCode,
      };
      if (await this.store.register(details)) await this.finishSignIn();
    } else {
      if (await this.store.login(this.email().trim(), password)) await this.finishSignIn();
    }
  }
  private async finishSignIn(): Promise<void> {
    if (this.store.authOptions()?.oauth) {
      window.location.assign(
        this.oauthContinuation()
          ? '/api/v1/auth/continue'
          : '/bff/login?returnTo=' + encodeURIComponent(this.returnTo()),
      );
    } else {
      await this.router.navigateByUrl(this.returnTo());
    }
  }
}
