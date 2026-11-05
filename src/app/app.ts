import { DevSessionNotice } from './core/dev-session-notice/dev-session-notice';
import { DOCUMENT } from '@angular/common';
import { Component, ViewEncapsulation, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { PlatformThemeService } from './core/platform-theme';
import { StudyPlanAccount } from './pages/study-plan/study-plan-account';
import { PageSidebars } from './core/page-sidebars/page-sidebars';
import { PageReadiness } from './core/page-readiness/page-readiness';
import { PlatformBrand } from './core/platform-brand/platform-brand';
import { GithubPrompt } from './core/github-account/github-account';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PageSidebars, DevSessionNotice, PlatformBrand],
  templateUrl: './app.html',
  styleUrl: './app.css',
  encapsulation: ViewEncapsulation.None,
})
export class App {
  private readonly theme = inject(PlatformThemeService);
  private readonly document = inject(DOCUMENT);
  /** DLV-969 S37: a page is shown only once everything it asked for has arrived. */
  protected readonly readiness = inject(PageReadiness);

  constructor() {
    const root = this.document.documentElement;
    effect(() => root.toggleAttribute('data-page-loading', this.readiness.loading()));
    const account = inject(StudyPlanAccount);
    const router = inject(Router);
    // DLV-969 (owner, 2026-11-05): staff without a GitHub account on file see the Welcome card once per browser session.
    inject(GithubPrompt).start();
    effect(() => {
      if (!account.sessionExpired()) return;
      const path = router.url.split(/[?#]/)[0];
      // /welcome is for people who are not signed in yet (DLV-969): it never sends them away.
      if (path === '/sign-in' || path === '/sign-in/choose' || path === '/welcome') return;
      void router.navigate(['/sign-in'], {
        queryParams: { error: 'session-expired' },
        replaceUrl: true,
      });
    });
  }

  protected skipLinkHref(): string {
    const { pathname, search } = this.document.location;
    return `${pathname}${search}#main-content`;
  }

  protected skipToMain(event: Event): void {
    event.preventDefault();
    const main = this.document.getElementById('main-content');
    if (!main) return;

    if (!main.hasAttribute('tabindex')) {
      main.setAttribute('tabindex', '-1');
      main.addEventListener('blur', () => main.removeAttribute('tabindex'), { once: true });
    }

    main.focus({ preventScroll: true });
    main.scrollIntoView?.({ block: 'start' });
    const view = this.document.defaultView;
    view?.history.replaceState(view.history.state, '', this.skipLinkHref());
  }
}
