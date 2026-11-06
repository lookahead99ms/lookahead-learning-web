import { Component, ElementRef, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { keepEssenceFitted } from '../../core/essence-fit/essence-fit';
import { PageSidebarContextDirective, PageSidebarContextValue } from '../../core/page-sidebars/page-sidebar-context';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { LearningPrompt } from '../../core/platform-signature/learning-prompt';
import { ReasoningPrompt } from '../../core/platform-signature/reasoning-prompt';
import { EssenceStory } from '../landing/essence-story/essence-story';

/**
 * /welcome (DLV-969, user 2026-11-02): what a person sees while their sign-in waits for the owner's
 * approval: the header, one notice, the Essence playing and the footer. Without `?access=pending`
 * it shows only the Essence, a shareable "what is Look Ahead" page. It loads no content or account
 * data of its own, so it works before anyone is admitted. The GitHub question staff see after sign-in is a dialog in
 * the app shell (DLV-969, owner 2026-11-06), not part of this page.
 */
@Component({
  selector: 'app-welcome-page',
  imports: [PlatformHeader, RouterLink, EssenceStory, LearningPrompt, ReasoningPrompt, PageSidebarContextDirective],
  templateUrl: './welcome.html',
  styleUrl: './welcome.css',
})
export class WelcomePage {
  private readonly query = inject(ActivatedRoute).queryParamMap;
  private readonly access = toSignal(this.query.pipe(map((query) => query.get('access'))), { initialValue: null });
  protected readonly accessPending = computed(() => this.access() === 'pending');
  /** DLV-969 (owner, 2026-11-04): where a page your account cannot open sends you, instead of the Study Plan. */
  protected readonly accessDenied = computed(() => this.access() === 'denied');
  private readonly devSession = inject(DevSession);
  /** DEV behind the gate (admitted or still waiting): say plainly that this is the internal preview (user, 2026-11-02). */
  protected readonly dev = computed(() => this.devSession.status() !== null || this.devSession.gated());
  /** No section navigation or page statements beside the card. */
  protected readonly sidebarContext: PageSidebarContextValue = { excluded: true };

  constructor() {
    // DLV-969 (owner, 2026-11-04): the page fits the screen without scrolling.
    keepEssenceFitted(inject<ElementRef<HTMLElement>>(ElementRef).nativeElement);
  }
}
