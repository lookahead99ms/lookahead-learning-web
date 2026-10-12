import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { AdminReviewsPage } from '../admin-reviews/admin-reviews';
import { PLATFORM_REVIEW_CLIENT, PlatformReviewViewer } from '../admin-reviews/platform-review.model';
import { SupportRequestForm } from './support-request-form';

type SupportView = 'contact' | 'reviews';

/**
 * Support and feedback: every signed-in learner can contact support. Accounts the review service
 * recognises as a reviewer or the owner also get the Platform reviews tab (formerly /admin/reviews).
 */
@Component({
  selector: 'app-support',
  imports: [PlatformHeader, SupportRequestForm, AdminReviewsPage],
  templateUrl: './support.html',
  styleUrl: './support.css',
})
export class SupportPage implements OnInit {
  protected readonly accounts = inject(StudyPlanAccount);
  private readonly reviewClient = inject(PLATFORM_REVIEW_CLIENT, { optional: true });
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** null until the review service answers; reviewers and the owner get the second tab. */
  protected readonly reviewRole = signal<PlatformReviewViewer['role'] | null>(null);
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
      this.reviewRole.set((await this.reviewClient.viewer()).role);
    } catch {
      // Not a reviewer, or the review service is unavailable: Contact support still works.
      this.reviewRole.set(null);
    } finally {
      this.checkingReviews.set(false);
    }
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
