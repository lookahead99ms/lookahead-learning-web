import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { AdminReviewsPage } from '../admin-reviews/admin-reviews';
import { PLATFORM_REVIEW_CLIENT, PlatformReviewViewer, ReviewCategory } from '../admin-reviews/platform-review.model';
import { ReviewEditIntent } from '../admin-reviews/review-edit-intent';
import { SupportRequestForm } from './support-request-form';
import { ReportTips } from './report-tips';
import { AuthorWorkspaceNav } from '../../core/author-workspace-nav/author-workspace-nav';

/** One kind card: where it goes (a support ticket or feedback) and what the path needs. */
export interface SupportKind {
  id: 'problem' | 'question' | 'idea' | 'change' | 'content';
  icon: string;
  label: string;
  hint: string;
  /** The support ticket path (emailed, kind "request") or the feedback path (kind "review"). */
  path: 'ticket' | 'feedback';
  /** The requestType of a ticket, or the category of feedback, exactly as the API has them today. */
  value: 'problem' | 'question' | 'feedback' | 'change' | 'content';
}

/** The five kinds in the owner's order; learners see the first three (owner, 2026-11-06). */
export const supportKinds: readonly SupportKind[] = [
  { id: 'problem', icon: '🐞', label: 'Report a problem', hint: 'Something broke or looks wrong', path: 'ticket', value: 'problem' },
  { id: 'question', icon: '❓', label: 'Ask a question', hint: 'Not sure how something works', path: 'ticket', value: 'question' },
  { id: 'idea', icon: '💡', label: 'Share an idea', hint: 'Something to add or improve', path: 'ticket', value: 'feedback' },
  { id: 'change', icon: '🛠️', label: 'Change request', hint: 'Works, but should work differently', path: 'feedback', value: 'change' },
  { id: 'content', icon: '📖', label: 'Content correction', hint: 'A lesson, text or example is wrong', path: 'feedback', value: 'content' },
];

/**
 * Support and feedback (owner, 2026-11-06): one card, no tabs. The tips on top, then a row of kind cards, then the
 * fields. The kind decides the path, with no Domain or API change: Report a problem, Ask a question and Share an idea
 * are support tickets (requestType problem / question / feedback, emailed, recorded as kind "request", admins set the
 * status); Change request and Content correction are feedback (kind "review", category change / content, the owner
 * sets the status). Learners see the three ticket kinds; staff the review service recognises (owner, admin,
 * reviewer) see all five. Edit from Support tickets and feedback lands here with the kind and the fields loaded.
 */
@Component({
  selector: 'app-support',
  host: { class: 'admin-surface' },
  imports: [AuthorWorkspaceNav, PlatformHeader, FormsModule, SupportRequestForm, AdminReviewsPage, ReportTips],
  templateUrl: './support.html',
  styleUrl: './support.css',
})
export class SupportPage implements OnInit {
  protected readonly outline = [
    { label: 'How to report', href: '#support-intro' },
    { label: 'Your request', href: '#support-request' },
  ];
  protected readonly accounts = inject(StudyPlanAccount);
  private readonly reviewClient = inject(PLATFORM_REVIEW_CLIENT, { optional: true });
  private readonly editIntent = inject(ReviewEditIntent);

  /** null until the review service answers; reviewers, admins and the owner get the two feedback kinds too. */
  protected readonly reviewRole = signal<PlatformReviewViewer['role'] | null>(null);
  protected readonly checkingReviews = signal(true);
  protected readonly kinds = computed(() => supportKinds.filter((kind) => kind.path === 'ticket' || !!this.reviewRole()));
  protected kindId: SupportKind['id'] = 'problem';
  protected readonly chosen = signal<SupportKind>(supportKinds[0]);
  /** An item loaded for editing keeps the feedback path, whatever its (possibly older) category says. */
  protected readonly editingCategory = signal<ReviewCategory | null>(null);
  protected readonly path = computed(() => (this.editingCategory() ? 'feedback' : this.chosen().path));
  /** The category the feedback form gets: the card's, or the loaded item's while editing. */
  protected readonly feedbackCategory = computed<ReviewCategory>(() => {
    const editing = this.editingCategory();
    if (editing) return editing;
    const chosen = this.chosen();
    return chosen.path === 'feedback' ? (chosen.value as ReviewCategory) : 'change';
  });
  protected readonly ticketKind = computed(() => {
    const chosen = this.chosen();
    return chosen.path === 'ticket' ? (chosen.value as 'problem' | 'question' | 'feedback') : 'problem';
  });
  /** A pending Edit waits for the access check instead of flashing the ticket form first. */
  protected readonly waitingForEdit = computed(() => this.editIntent.itemId() !== null && this.checkingReviews());

  async ngOnInit(): Promise<void> {
    try {
      if (!this.reviewClient) return;
      await this.accounts.initialize();
      if (!this.accounts.account() || this.accounts.sessionExpired()) return;
      // "user" is the service's answer for an account with no review role (a learner, a test account): three kinds.
      const role = (await this.reviewClient.viewer()).role;
      this.reviewRole.set(role === 'user' ? null : role);
      // Edit from the admin page: open the feedback path so its form takes the pending item and tells us its category.
      if (this.reviewRole() && this.editIntent.itemId()) this.select('change');
    } catch {
      // Not a reviewer, or the review service is unavailable: the three ticket kinds still work.
      this.reviewRole.set(null);
    } finally {
      this.checkingReviews.set(false);
    }
  }

  protected select(id: SupportKind['id']): void {
    const kind = supportKinds.find((candidate) => candidate.id === id);
    if (!kind || !this.kinds().includes(kind)) return;
    this.kindId = id;
    this.chosen.set(kind);
  }

  /** The feedback form says which item it loaded (its category) or that it was cleared. */
  protected onEditing(category: ReviewCategory | null): void {
    this.editingCategory.set(category);
    if (!category) return;
    const card = supportKinds.find((kind) => kind.path === 'feedback' && kind.value === category)
      ?? supportKinds.find((kind) => kind.id === category);
    if (card) {
      this.kindId = card.id;
      this.chosen.set(card);
    }
  }
}
