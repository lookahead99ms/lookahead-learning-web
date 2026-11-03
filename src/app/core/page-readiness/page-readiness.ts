import { HttpInterceptorFn } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';
import { finalize } from 'rxjs';

/**
 * DLV-969 S37 (owner, 2026-11-03): "load it all at once". A page is shown only when everything it asked for has
 * arrived: on the first load and on every navigation to another page, the content stays hidden until the requests
 * started for it (account checks, catalogs, lessons, prices) have finished and the network has been quiet for a
 * moment. A quiet veil with the logo appears if that takes longer than a blink, and after a ceiling the page is shown
 * anyway so nothing can hang. Requests made later (saving, searching) never hide the page again, and moving between
 * tabs or sections of the same page (only the query or #part changes) is not a page load.
 */
@Injectable({ providedIn: 'root' })
export class PageReadiness {
  /** No new request for this long after the last one ends means the page has what it asked for. */
  static readonly QUIET_MS = 150;
  /** A navigation that finishes faster than this never shows the veil, only the finished page. */
  static readonly VEIL_AFTER_MS = 150;
  /** Show the page anyway after this long, whatever is still loading. */
  static readonly CEILING_MS = 8000;

  /** True while the page's content is hidden because it is still loading. */
  readonly loading = signal(true);
  /** True while the loading veil (logo) is shown: from the start on the first load, after a blink on navigations. */
  readonly veil = signal(true);

  private open = true;
  private navigated = false;
  private pending = 0;
  private quiet: ReturnType<typeof setTimeout> | undefined;
  private veilTimer: ReturnType<typeof setTimeout> | undefined;
  private ceiling: ReturnType<typeof setTimeout> | undefined;
  private readonly router = inject(Router);

  constructor() {
    this.ceiling = setTimeout(() => this.reveal(), PageReadiness.CEILING_MS);
    const events = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) this.start(event.url);
      else if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
        this.navigated = true;
        this.settle();
      }
    });
    inject(DestroyRef).onDestroy(() => {
      events.unsubscribe();
      this.clearTimers();
    });
  }

  /**
   * Counts work started while a page is loading; work started after the page is shown is passed through untouched.
   * Returns a function to call when the work has ended (safe to call more than once).
   */
  begin(): () => void {
    if (!this.open) return () => undefined;
    this.pending++;
    clearTimeout(this.quiet);
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      this.pending = Math.max(0, this.pending - 1);
      this.settle();
    };
  }

  /** The page waits for this work too (for example the account check on the first load). */
  track<T>(work: Promise<T>): Promise<T> {
    const end = this.begin();
    work.then(end, end);
    return work;
  }

  private start(url: string): void {
    if (!this.open && samePage(this.router.url, url)) return;
    if (!this.open) {
      this.open = true;
      this.loading.set(true);
      clearTimeout(this.veilTimer);
      this.veilTimer = setTimeout(() => this.veil.set(true), PageReadiness.VEIL_AFTER_MS);
      clearTimeout(this.ceiling);
      this.ceiling = setTimeout(() => this.reveal(), PageReadiness.CEILING_MS);
    }
    this.navigated = false;
  }

  private settle(): void {
    if (!this.open || !this.navigated || this.pending > 0) return;
    clearTimeout(this.quiet);
    this.quiet = setTimeout(() => {
      if (this.pending === 0) this.reveal();
    }, PageReadiness.QUIET_MS);
  }

  private reveal(): void {
    if (!this.open) return;
    this.open = false;
    this.pending = 0;
    this.clearTimers();
    this.veil.set(false);
    this.loading.set(false);
  }

  private clearTimers(): void {
    clearTimeout(this.quiet);
    clearTimeout(this.veilTimer);
    clearTimeout(this.ceiling);
  }
}

/** The same page when only the query or #part differs (tabs, filters, section links). */
export function samePage(current: string, next: string): boolean {
  const path = (url: string) => url.split(/[?#]/, 1)[0];
  return path(current) === path(next);
}

/** Every HttpClient request made while a page loads counts towards it (catalogs, lessons, indexes). */
export const pageReadinessInterceptor: HttpInterceptorFn = (request, next) => {
  const end = inject(PageReadiness).begin();
  return next(request).pipe(finalize(end));
};
