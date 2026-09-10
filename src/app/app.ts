import { DOCUMENT } from '@angular/common';
import { Component, ViewEncapsulation, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PlatformThemeService } from './core/platform-theme';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
  encapsulation: ViewEncapsulation.None,
})
export class App {
  private readonly theme = inject(PlatformThemeService);
  private readonly document = inject(DOCUMENT);

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
