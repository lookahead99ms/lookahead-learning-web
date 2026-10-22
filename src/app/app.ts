import { DevSessionNotice } from './core/dev-session-notice/dev-session-notice';
import { DOCUMENT } from '@angular/common';
import { Component, ViewEncapsulation, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { PlatformThemeService } from './core/platform-theme';
import { StudyPlanAccount } from './pages/study-plan/study-plan-account';
import { PageSidebars } from './core/page-sidebars/page-sidebars';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PageSidebars, DevSessionNotice],
  templateUrl: './app.html',
  styleUrl: './app.css',
  encapsulation: ViewEncapsulation.None,
})
export class App {
  private readonly theme = inject(PlatformThemeService);
  private readonly document = inject(DOCUMENT);

  constructor() {
    const account = inject(StudyPlanAccount);
    const router = inject(Router);
    effect(() => {
      if (!account.sessionExpired()) return;
      const path = router.url.split(/[?#]/)[0];
      if (path === '/sign-in' || path === '/sign-in/choose') return;
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
