import { DestroyRef, afterNextRender, inject } from '@angular/core';

/** Narrower screens stack the Essence into a tall column; shrinking that to fit would make it unreadable. */
export const FIT_FROM_WIDTH = 641;
/** Never shrink the Essence below this, so its words stay readable on short screens. */
export const SMALLEST = 0.36;
/** Screen mode: the room kept above and below the Essence inside the window. */
export const SCREEN_GAP = 20;

export interface EssenceFitOptions {
  /**
   * Owner, 2026-11-06: fit the Essence to the window height below the header, as on the homepage, where the page goes
   * on below it. Without this the Essence is fitted to the height left between what is above it and everything the
   * page still shows below it (/welcome, a locked lesson).
   */
  screen?: boolean;
}

/**
 * DLV-969 (owner, 2026-11-04): pages that show the Essence on its own (/welcome, a locked lesson) fit the screen without
 * scrolling. The Essence keeps its own fixed sizes, so it is scaled as one piece to the height left between what is
 * above it and everything the page still shows below it. The homepage never uses this.
 */
export function fitEssence(essence: HTMLElement | null, options: EssenceFitOptions = {}): void {
  const view = essence?.ownerDocument.defaultView;
  if (!essence || !view) return;
  // Owner, 2026-11-06: what is scaled is the stage inside the card (the wordmark, statements, steps and sentence),
  // never the card, which keeps the width and padding of every other card. The wordmark and the steps have their own
  // maximum widths, so they shrink together as one picture instead of the steps stretching across the card.
  const stage = essence.querySelector<HTMLElement>('.essence-stage') ?? essence;
  stage.style.setProperty('zoom', '1');
  if (view.innerWidth < FIT_FROM_WIDTH) return;
  const box = stage.getBoundingClientRect();
  if (!box.height) return;
  const top = box.top + view.scrollY;
  const below = Math.max(0, essence.ownerDocument.documentElement.scrollHeight - (top + box.height));
  const header = essence.ownerDocument.querySelector('.platform-header')?.getBoundingClientRect().height ?? 0;
  const room = options.screen ? view.innerHeight - header - 2 * SCREEN_GAP : view.innerHeight - top - below - 2;
  const fit = Math.min(1, Math.max(SMALLEST, room / box.height));
  // Rounded down, so rounding never adds the one pixel that would make the page scroll.
  stage.style.setProperty('zoom', String(Math.floor(fit * 1000) / 1000));
}

/** In a component constructor: fit the Essence inside `host` once it is drawn, and again whenever the window or page resizes. */
export function keepEssenceFitted(host: HTMLElement, options: EssenceFitOptions = {}): void {
  const destroy = inject(DestroyRef);
  const view = host.ownerDocument.defaultView;
  afterNextRender(() => {
    const fit = () => fitEssence(host.querySelector<HTMLElement>('section.home-essence'), options);
    fit();
    let frame = 0;
    const refit = () => {
      view?.cancelAnimationFrame(frame);
      frame = view?.requestAnimationFrame(fit) ?? 0;
    };
    view?.addEventListener('resize', refit);
    // Parts of the page that arrive after the first paint (fonts, the statement strip, a loaded title) change the space
    // left, so the page's own size changes refit too. Setting the same zoom again changes nothing, so this settles.
    const observer = view?.ResizeObserver ? new view.ResizeObserver(refit) : null;
    observer?.observe(host.ownerDocument.body);
    destroy.onDestroy(() => {
      view?.removeEventListener('resize', refit);
      observer?.disconnect();
    });
  });
}
