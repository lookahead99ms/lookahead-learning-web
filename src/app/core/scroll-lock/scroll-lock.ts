import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  Directive,
  ElementRef,
  Injectable,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

/** What the lock changed, so the last release puts every value back exactly. */
interface SavedPage {
  scrollX: number;
  scrollY: number;
  htmlOverflow: string;
  htmlOverscroll: string;
  htmlGutter: string;
  bodyOverflow: string;
  bodyPaddingRight: string;
}

/** Elements inside an open modal may still scroll by touch; everything else may not. */
const TOUCH_ALLOWED = 'dialog[open], [aria-modal="true"], [data-scroll-lock-allow]';

/**
 * One body scroll lock for every modal on the platform (user, 2026-10-16): while any dialog,
 * palette or modal panel is open, the page behind it does not move by wheel, touch or keyboard.
 *
 * - Reference counted: nested or overlapping modals each take a lock; the page unlocks only when
 *   the last one is released. Each release function works once, so a double close is harmless.
 * - `overflow: hidden` on html and body stops wheel and keyboard scrolling (the viewport is no
 *   longer a scroll container). A classic scrollbar keeps its width through
 *   `scrollbar-gutter: stable`, or body padding where that is unsupported, so nothing shifts.
 * - iOS Safari: `overscroll-behavior: none` plus a non-passive touchmove guard that cancels touch
 *   scrolling outside the open modal. The body is not switched to `position: fixed`, so sticky
 *   headers do not jump behind the backdrop.
 * - The scroll position is restored on the last release; a navigation that leaves no modal open
 *   clears any lock a destroyed component failed to release.
 */
@Injectable({ providedIn: 'root' })
export class ScrollLockService {
  private readonly document = inject(DOCUMENT);
  private readonly count = signal(0);
  private saved: SavedPage | null = null;
  /** True while at least one modal holds the lock. */
  readonly locked = computed(() => this.count() > 0);

  constructor() {
    const router = inject(Router, { optional: true });
    const subscription = router?.events.subscribe((event) => {
      if (event instanceof NavigationEnd && this.count() > 0 && !this.modalOpen()) this.reset();
    });
    inject(DestroyRef).onDestroy(() => {
      subscription?.unsubscribe();
      this.reset();
    });
  }

  /** Takes one lock; call the returned function to release it (only the first call counts). */
  lock(): () => void {
    if (this.count() === 0) this.apply();
    this.count.update((count) => count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.release();
    };
  }

  /** Number of locks held, for tests and diagnostics. */
  holders(): number {
    return this.count();
  }

  private release(): void {
    if (this.count() === 0) return;
    this.count.update((count) => count - 1);
    if (this.count() === 0) this.restore();
  }

  private reset(): void {
    if (this.count() === 0) return;
    this.count.set(0);
    this.restore();
  }

  private modalOpen(): boolean {
    return !!this.document.querySelector('dialog[open], [aria-modal="true"]');
  }

  private apply(): void {
    const view = this.document.defaultView;
    const html = this.document.documentElement;
    const body = this.document.body;
    if (!view || !body) return;
    const scrollbar = Math.max(0, view.innerWidth - html.clientWidth);
    this.saved = {
      scrollX: view.scrollX,
      scrollY: view.scrollY,
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      htmlGutter: html.style.getPropertyValue('scrollbar-gutter'),
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
    };
    if (scrollbar > 0) {
      if (view.CSS?.supports?.('scrollbar-gutter', 'stable')) html.style.setProperty('scrollbar-gutter', 'stable');
      else {
        const current = parseFloat(view.getComputedStyle(body).paddingRight) || 0;
        body.style.paddingRight = `${current + scrollbar}px`;
      }
    }
    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    html.dataset['scrollLocked'] = '';
    this.document.addEventListener('touchmove', this.guardTouch, { passive: false });
  }

  private restore(): void {
    const saved = this.saved;
    this.saved = null;
    this.document.removeEventListener('touchmove', this.guardTouch);
    const view = this.document.defaultView;
    const html = this.document.documentElement;
    const body = this.document.body;
    delete html.dataset['scrollLocked'];
    if (!saved || !body) return;
    html.style.overflow = saved.htmlOverflow;
    html.style.overscrollBehavior = saved.htmlOverscroll;
    if (saved.htmlGutter) html.style.setProperty('scrollbar-gutter', saved.htmlGutter);
    else html.style.removeProperty('scrollbar-gutter');
    body.style.overflow = saved.bodyOverflow;
    body.style.paddingRight = saved.bodyPaddingRight;
    if (view && (view.scrollX !== saved.scrollX || view.scrollY !== saved.scrollY)) {
      try {
        view.scrollTo({ left: saved.scrollX, top: saved.scrollY, behavior: 'instant' });
      } catch {
        /* Test environments without layout do not scroll. */
      }
    }
  }

  private readonly guardTouch = (event: Event): void => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(TOUCH_ALLOWED)) return;
    if (event.cancelable) event.preventDefault();
  };
}

/**
 * Put `appScrollLock` on any modal. On a `<dialog>` (or an element that toggles
 * `aria-modal="true"`) the bare attribute follows the element's own open state; bind a boolean
 * (`[appScrollLock]="paletteOpen()"`) where the open state lives in a signal instead. The lock is
 * released when the modal closes or the element is destroyed.
 */
@Directive({ selector: '[appScrollLock]' })
export class ScrollLock {
  /** `''` (bare attribute) follows the element's open state; a boolean is used as given. */
  readonly appScrollLock = input<boolean | ''>('');
  private readonly service = inject(ScrollLockService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly attributeOpen = signal(false);
  private release: (() => void) | null = null;

  constructor() {
    this.read();
    // Applied at once (not only at the next change detection) so the page never scrolls between a
    // dialog opening and the next render.
    const observer =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => {
            this.read();
            if (this.appScrollLock() === '') this.set(this.attributeOpen());
          });
    observer?.observe(this.host, { attributes: true, attributeFilter: ['open', 'aria-modal'] });
    effect(() => {
      const value = this.appScrollLock();
      this.set(value === '' ? this.attributeOpen() : value);
    });
    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
      this.set(false);
    });
  }

  private read(): void {
    this.attributeOpen.set(this.host.hasAttribute('open') || this.host.getAttribute('aria-modal') === 'true');
  }

  private set(active: boolean): void {
    if (active && !this.release) this.release = this.service.lock();
    else if (!active && this.release) {
      this.release();
      this.release = null;
    }
  }
}
