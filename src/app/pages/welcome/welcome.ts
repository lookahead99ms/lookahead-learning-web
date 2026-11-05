import { Component, ElementRef, computed, effect, inject, signal } from '@angular/core';
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
import { asksForGithub, githubDismissed } from '../../core/github-account/github-account';
import { TestSessions } from '../../core/test-session/test-sessions';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { GithubAccessCard } from './github-access-card';

/**
 * /welcome (DLV-969, user 2026-11-02): what a person sees while their sign-in waits for the owner's
 * approval: the header, one notice, the Essence playing and the footer. Without `?access=pending`
 * it shows only the Essence, a shareable "what is Look Ahead" page. It loads no content or account
 * data of its own, so it works before anyone is admitted. A signed-in staff member without a GitHub account on file
 * also gets the GitHub card (DLV-969, owner 2026-11-05); that reads only their own profile.
 */
@Component({
  selector: 'app-welcome-page',
  imports: [PlatformHeader, RouterLink, EssenceStory, LearningPrompt, ReasoningPrompt, PageSidebarContextDirective, GithubAccessCard],
  templateUrl: './welcome.html',
  styleUrl: './welcome.css',
})
export class WelcomePage {
  private readonly query = inject(ActivatedRoute).queryParamMap;
  private readonly access = toSignal(this.query.pipe(map((query) => query.get('access'))), { initialValue: null });
  /** Where the GitHub card continues to after Save or Not now (checked as a same-site path by the card). */
  protected readonly next = toSignal(this.query.pipe(map((query) => query.get('next'))), { initialValue: null });
  private readonly accounts = inject(StudyPlanAccount);
  private readonly tests = inject(TestSessions);
  /** The signed-in staff member the card is for, once their profile shows no GitHub account; null otherwise. */
  protected readonly githubFor = signal<string | null>(null);
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
    let checked: string | null = null;
    effect(() => {
      const account = this.accounts.account();
      if (!account || this.accounts.sessionExpired() || checked === account.accountId) return;
      checked = account.accountId;
      void this.checkGithub(account.accountId);
    });
  }

  /** Staff (never the owner or a learner), not in a test session, no GitHub link yet and no Not now in this browser. */
  private async checkGithub(accountId: string): Promise<void> {
    if (!asksForGithub(this.accounts.account()) || githubDismissed(accountId)) return;
    if (this.tests.status() === null) await this.tests.refresh();
    if (this.tests.active()) return;
    try {
      const profile = await this.accounts.loadProfile();
      if (!profile.links?.github && this.accounts.account()?.accountId === accountId) this.githubFor.set(accountId);
    } catch {
      // Profile unavailable: no card; Account settings still has the field.
    }
  }
}

