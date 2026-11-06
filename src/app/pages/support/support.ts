import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { AdminReviewsPage } from '../admin-reviews/admin-reviews';
import { PLATFORM_REVIEW_CLIENT, PlatformReviewViewer } from '../admin-reviews/platform-review.model';
import { SupportRequestForm } from './support-request-form';
import { ReportTips } from './report-tips';

type SupportView = 'contact' | 'reviews';

/**
 * Support and feedback: every signed-in learner can contact support from one card (the tips, then the request form).
 * Accounts the review service recognises as a reviewer, an admin or the owner get two tabs (owner, 2026-11-06):
 * Write Review, the private review card with a folded support request under it, and Team Reviews, what was submitted
 * and where each item stands (formerly /admin/reviews, then the Platform reviews tab; the owner chose the two names the
 * same day).
 */
@Component({
  selector: 'app-support',
  imports: [PlatformHeader, SupportRequestForm, AdminReviewsPage, ReportTips],
  templateUrl: './support.html',
  styleUrl: './support.css',
})
export class SupportPage implements OnInit {
  protected readonly accounts = inject(StudyPlanAccount);
  private readonly reviewClient = inject(PLATFORM_REVIEW_CLIENT, { optional: true });
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** null until the review service answers; reviewers, admins and the owner get the second tab. */
  protected readonly reviewRole = signal<PlatformReviewViewer['role'] | null>(null);
  protected readonly roleBadge = computed(() =>
    this.reviewRole() === 'owner' ? 'Owner' : this.reviewRole() === 'admin' ? 'Admin' : 'Reviewer',
  );
  /** Staff see the support request folded under the review card; a click opens it. */
  protected readonly requestOpen = signal(false);
  protected readonly checkingReviews = signal(true);
  private readonly requestedView = toSignal(
    this.route.queryParamMap.pipe(
      map((params): SupportView => (params.get('view') === 'reviews' ? 'reviews' : 'contact')),
    ),
    { initialValue: 'contact' as SupportView },
  );
  protected readonly view = computed<SupportView>(() =>
    this.reviewRole() && this.requestedView() === 'reviews' ? 'reviews' : 'contact',
  );
  /** A /support?view=reviews link waits for the access check instead of flashing the form. */
  protected readonly waitingForReviews = computed(
    () => this.requestedView() === 'reviews' && this.checkingReviews(),
  );

  async ngOnInit(): Promise<void> {
    try {
      if (!this.reviewClient) return;
      await this.accounts.initialize();
      if (!this.accounts.account() || this.accounts.sessionExpired()) return;
      // DLV-971 (owner, 2026-11-06): "user" is the service's answer for an account with no review role (a learner, a
      // test account); it gets Contact support alone, like an account the service refuses.
      const role = (await this.reviewClient.viewer()).role;
      this.reviewRole.set(role === 'user' ? null : role);
    } catch {
      // Not a reviewer, or the review service is unavailable: Contact support still works.
      this.reviewRole.set(null);
    } finally {
      this.checkingReviews.set(false);
    }
  }

  protected toggleRequest(): void {
    this.requestOpen.update((open) => !open);
  }

  protected show(view: SupportView): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: view === 'reviews' ? 'reviews' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Arrow keys move between the two tabs, as in any tab list. */
  protected moveTab(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next: SupportView =
      event.key === 'Home'
        ? 'contact'
        : event.key === 'End'
          ? 'reviews'
          : this.view() === 'contact'
            ? 'reviews'
            : 'contact';
    this.show(next);
    (event.currentTarget as HTMLElement)
      .querySelector<HTMLButtonElement>(`#support-tab-${next}`)
      ?.focus();
  }
}
