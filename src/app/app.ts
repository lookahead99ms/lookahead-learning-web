import { DOCUMENT } from '@angular/common';
import { Component, HostListener, ViewEncapsulation, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
  encapsulation: ViewEncapsulation.None,
})
export class App {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);

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

  @HostListener('window:keydown', ['$event'])
  protected openSearchShortcut(event: KeyboardEvent): void {
    if (event.key.toLowerCase() !== 'k' || (!event.metaKey && !event.ctrlKey)) return;
    const target = event.target as HTMLElement | null;
    if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    void this.router.navigate(['/search']);
  }
}
