import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { keepEssenceFitted } from '../../core/essence-fit/essence-fit';
import { PageSidebarContextDirective, PageSidebarContextValue } from '../../core/page-sidebars/page-sidebar-context';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { LearningPrompt } from '../../core/platform-signature/learning-prompt';
import { ReasoningPrompt } from '../../core/platform-signature/reasoning-prompt';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
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
  /**
   * Owner, 2026-11-06: the greeting carries the person's first name when the account is known (the header's check
   * fills the store; a waiting account is known only once the Gateway reports it), otherwise it stays plain.
   */
  private readonly accounts = inject(StudyPlanAccount);
  /**
   * A waiting sign-in has no session, so the Gateway hands the first name over in a short-lived cookie (DLV-971). Read
   * once and cleared here; it never reaches the URL. An account known on the page still wins.
   */
  private readonly welcomeName = signal(readWelcomeCookie(inject(DOCUMENT)));
  protected readonly greeting = computed(() => {
    const known = this.accounts.account()?.displayName.trim().split(/\s+/)[0];
    const first = known || this.welcomeName();
    return first ? `${first}, your sign-in worked` : 'Your sign-in worked';
  });
  /** No section navigation or page statements beside the card. */
  protected readonly sidebarContext: PageSidebarContextValue = { excluded: true };

  constructor() {
    // DLV-969 (owner, 2026-11-04): the page fits the screen without scrolling.
    keepEssenceFitted(inject<ElementRef<HTMLElement>>(ElementRef).nativeElement);
  }
}

/** The Gateway's welcome cookie: letters only, at most 40 characters, cleared as soon as it is read. */
export const WELCOME_COOKIE = 'lookahead-welcome';
export function readWelcomeCookie(document: Document): string | null {
  try {
    const pair = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(WELCOME_COOKIE + '='));
    if (!pair) return null;
    document.cookie = `${WELCOME_COOKIE}=; Max-Age=0; Path=/; SameSite=Strict`;
    const value = decodeURIComponent(pair.slice(WELCOME_COOKIE.length + 1));
    return /^[\p{L}\p{M}'’.-]{1,40}$/u.test(value) ? value : null;
  } catch {
    return null;
  }
}
