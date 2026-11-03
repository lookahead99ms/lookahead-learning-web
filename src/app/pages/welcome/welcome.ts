import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
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
  imports: [PlatformHeader, EssenceStory, LearningPrompt, ReasoningPrompt, PageSidebarContextDirective],
  templateUrl: './welcome.html',
  styleUrl: './welcome.css',
})
export class WelcomePage {
  protected readonly accessPending = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((query) => query.get('access') === 'pending')),
    { initialValue: false },
  );
  /** No section navigation or page statements beside the card. */
  protected readonly sidebarContext: PageSidebarContextValue = { excluded: true };
}
