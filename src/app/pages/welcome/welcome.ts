import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { PageSidebarContextDirective, PageSidebarContextValue } from '../../core/page-sidebars/page-sidebar-context';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { LearningPrompt } from '../../core/platform-signature/learning-prompt';
import { ReasoningPrompt } from '../../core/platform-signature/reasoning-prompt';
import { EssenceStory } from '../landing/essence-story/essence-story';

/**
 * /welcome (DLV-969, user 2026-11-02): what a person sees while their sign-in waits for the owner's
 * approval: the header, one notice, the Essence playing and the footer. Without `?access=pending`
 * it shows only the Essence, a shareable "what is Look Ahead" page. It loads no content or account
 * data of its own, so it works before anyone is admitted.
 */
@Component({
  selector: 'app-welcome-page',
  imports: [PlatformHeader, RouterLink, EssenceStory, LearningPrompt, ReasoningPrompt, PageSidebarContextDirective],
  templateUrl: './welcome.html',
  styleUrl: './welcome.css',
})
export class WelcomePage {
  private readonly access = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((query) => query.get('access'))),
    { initialValue: null },
  );
  protected readonly accessPending = computed(() => this.access() === 'pending');
  /** DLV-969 (owner, 2026-11-04): where a page your account cannot open sends you, instead of the Study Plan. */
  protected readonly accessDenied = computed(() => this.access() === 'denied');
  private readonly devSession = inject(DevSession);
  /** DEV behind the gate (admitted or still waiting): say plainly that this is the internal preview (user, 2026-11-02). */
  protected readonly dev = computed(() => this.devSession.status() !== null || this.devSession.gated());
  /** No section navigation or page statements beside the card. */
  protected readonly sidebarContext: PageSidebarContextValue = { excluded: true };

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const view = host.ownerDocument.defaultView;
    afterNextRender(() => {
      fitEssence(host);
      let frame = 0;
      const refit = () => { view?.cancelAnimationFrame(frame); frame = view?.requestAnimationFrame(() => fitEssence(host)) ?? 0; };
      view?.addEventListener('resize', refit);
      this.destroy.onDestroy(() => view?.removeEventListener('resize', refit));
    });
  }
  private readonly destroy = inject(DestroyRef);
}

/** Narrower screens than this stack the Essence into a tall column; shrinking that to fit would make it unreadable. */
const FIT_FROM_WIDTH = 641;
/** Never shrink the Essence below this, so its words stay readable on short screens. */
const SMALLEST = 0.45;

/**
 * DLV-969 (owner, 2026-11-04): the whole page fits the screen without scrolling. The Essence keeps its own fixed sizes,
 * so it is scaled as one piece to the height left under the header and notice, with the footer still in view.
 */
export function fitEssence(host: HTMLElement): void {
  const view = host.ownerDocument.defaultView;
  const essence = host.querySelector<HTMLElement>('section.home-essence');
  const page = host.querySelector<HTMLElement>('main.welcome-page');
  if (!view || !essence || !page) return;
  essence.style.setProperty('zoom', '1');
  if (view.innerWidth < FIT_FROM_WIDTH) return;
  const footer = host.querySelector<HTMLElement>('.welcome-footer')?.getBoundingClientRect().height ?? 0;
  const style = view.getComputedStyle(page);
  const below = footer + parseFloat(style.rowGap || '0') + parseFloat(style.paddingBottom || '0');
  const top = essence.getBoundingClientRect().top + view.scrollY;
  const height = essence.getBoundingClientRect().height;
  if (!height) return;
  const fit = Math.min(1, Math.max(SMALLEST, (view.innerHeight - top - below) / height));
  essence.style.setProperty('zoom', fit.toFixed(3));
}
