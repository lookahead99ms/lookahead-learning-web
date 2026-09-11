import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { registrationCountries, registrationCountryCode } from './countries';

export function safeAccountReturn(value: string | null): string {
  return value &&
    /^\/(?:study-plan|learn|grow|look-ahead|search|support|author)(?:[/?]|$)/.test(value) &&
    !/[\\\r\n]/.test(value)
    ? value
    : '/study-plan';
}
@Component({
  selector: 'app-account',
  imports: [PlatformHeader, RouterLink],
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
  protected readonly signup = computed(
    () => this.routeData()['accountMode'] === 'signup' || this.query().get('mode') === 'signup',
  );
  protected readonly authenticated = computed(
    () => !!this.store.account() && !this.store.sessionExpired(),
  );
  protected readonly email = signal('');
  protected readonly password = signal('');
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
  constructor() {
    void this.store.loadAuthOptions();
  }
  protected async submit(): Promise<void> {
    this.formError.set('');
    const password = this.password();
    if (this.signup()) {
      const countryCode = registrationCountryCode(this.countryName());
      if (!countryCode) {
        this.formError.set('Choose your country of residence from the list.');
        return;
      }
      if (password !== this.confirmPassword()) {
        this.formError.set('Passwords must match.');
        return;
      }
      const details = {
        firstName: this.firstName().trim(),
        lastName: this.lastName().trim(),
        email: this.email().trim(),
        password,
        confirmPassword: this.confirmPassword(),
        countryCode,
      };
      this.password.set('');
      this.confirmPassword.set('');
      if (await this.store.register(details)) await this.finishSignIn();
    } else {
      this.password.set('');
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
  protected async signOut(): Promise<void> {
    if ((await this.store.logout()) && !this.store.authOptions()?.oauth)
      await this.router.navigate(['/sign-in'], { queryParams: { returnTo: this.returnTo() } });
  }
}
