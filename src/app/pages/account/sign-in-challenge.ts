import { DatePipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  Injector,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PlatformThemeService } from '../../core/platform-theme';
import { SIGN_IN_CHALLENGE_CLIENT, SignInChallenge } from './sign-in-challenge-client';
import { safeAccountReturn } from './account-navigation';
import { SignInManagementError } from './active-sign-ins-client';

@Component({
  selector: 'app-sign-in-challenge',
  imports: [DatePipe, RouterLink],
  templateUrl: './sign-in-challenge.html',
  styleUrl: './sign-in-challenge.css',
})
export class SignInChallengePage implements OnDestroy {
  private readonly client = inject(SIGN_IN_CHALLENGE_CLIENT);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  protected readonly theme = inject(PlatformThemeService);
  protected readonly returnTo = safeAccountReturn(
    inject(ActivatedRoute).snapshot.queryParamMap.get('returnTo'),
  );
  private readonly oauthContinuation =
    inject(ActivatedRoute).snapshot.queryParamMap.get('oauth') === 'continue';
  protected readonly challenge = signal<SignInChallenge | null>(null);
  protected readonly selected = signal('');
  protected readonly state = signal<
    'loading' | 'ready' | 'replacing' | 'canceling' | 'expired' | 'error'
  >('loading');
  protected readonly error = signal('');
  private readonly errorElement = viewChild<ElementRef<HTMLElement>>('errorElement');
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private destroyed = false;

  constructor() {
    void this.load();
  }

  protected busy(): boolean {
    return (
      this.state() === 'loading' || this.state() === 'replacing' || this.state() === 'canceling'
    );
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    this.error.set('');
    try {
      const challenge = await this.client.loadChallenge();
      if (this.destroyed) return;
      this.challenge.set(challenge);
      if (!challenge.signIns.some((signIn) => signIn.id === this.selected())) this.selected.set('');
      this.state.set('ready');
    } catch (error) {
      this.fail(error);
    }
  }

  protected async replace(): Promise<void> {
    if (this.busy()) return;
    if (!this.challenge()?.signIns.some((signIn) => signIn.id === this.selected())) {
      this.error.set('Choose the sign-in you want to end.');
      this.focusError();
      return;
    }
    this.state.set('replacing');
    this.error.set('');
    try {
      const result = await this.client.replace(this.selected());
      if (this.destroyed) return;
      if (result.oauth) {
        window.location.assign(
          this.oauthContinuation
            ? '/api/v1/auth/continue'
            : '/bff/login?returnTo=' + encodeURIComponent(this.returnTo),
        );
      } else {
        await this.router.navigateByUrl(this.returnTo);
      }
    } catch (error) {
      this.fail(error);
    }
  }

  protected async cancel(): Promise<void> {
    if (this.busy()) return;
    this.state.set('canceling');
    this.error.set('');
    try {
      await this.client.cancelChallenge();
      if (!this.destroyed)
        await this.router.navigate(['/sign-in'], {
          queryParams: { returnTo: this.returnTo },
          state: { signInCanceled: true },
        });
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    if (this.destroyed) return;
    const kind = error instanceof SignInManagementError ? error.kind : 'unconfirmed';
    this.state.set(kind === 'expired' ? 'expired' : 'error');
    this.error.set(
      kind === 'expired'
        ? 'This sign-in request expired. Start again to choose an active sign-in.'
        : kind === 'changed'
          ? 'The active sign-ins changed. Refresh the list and choose again.'
          : kind === 'rate-limited'
            ? 'Too many attempts. Wait a few minutes before trying again.'
            : 'We could not confirm this request. Refresh the list to check its status before trying again.',
    );
    if (kind === 'expired') {
      this.challenge.set(null);
      this.selected.set('');
    }
    this.focusError();
  }

  private focusError(): void {
    afterNextRender(
      () => {
        if (!this.destroyed)
          (this.errorElement()?.nativeElement ?? this.heading()?.nativeElement)?.focus();
      },
      { injector: this.injector },
    );
  }
  ngOnDestroy(): void {
    this.destroyed = true;
  }
}
