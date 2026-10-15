import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { SalePreview } from '../../content/sale-preview';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import {
  FREE_FEATURES,
  MOCK_INTERVIEW_FORMATS,
  PASS_IDS,
  PLAN_RULES,
  PRICING_FAQ,
  PricingCard,
  START_FREE_ROUTE,
  YEARLY_IDS,
  pricingCards,
} from './pricing-plans';

/**
 * DLV-209: plans and prices. Everyone can see them; buying needs an account (user, 2026-10-15),
 * so a signed-out visitor's Choose asks them to sign in first. Design only: for a signed-in
 * learner every Choose opens an honest notice that checkout is not connected. The page makes no
 * requests, posts no form, loads no payment script and stores nothing.
 *
 * Sales: promo plans appear only while a sale runs, above the regular plans, which stay visible
 * but read-only. No sale is live for learners yet; staff see their own sale preview and can
 * switch between it and the regular view.
 */
@Component({
  selector: 'app-pricing',
  imports: [PlatformHeader, RouterLink, NgTemplateOutlet],
  templateUrl: './pricing.html',
  styleUrl: './pricing.css',
})
export class PricingPage {
  private readonly accounts = inject(StudyPlanAccount);
  private readonly sales = inject(SalePreview);
  protected readonly freeFeatures = FREE_FEATURES;
  protected readonly rules = PLAN_RULES;
  protected readonly mockFormats = MOCK_INTERVIEW_FORMATS;
  protected readonly faq = PRICING_FAQ;
  protected readonly startFree = START_FREE_ROUTE;
  protected readonly isStaff = this.sales.isStaff;
  protected readonly signedIn = computed(
    () => !!this.accounts.account() && !this.accounts.sessionExpired(),
  );

  /** Staff can look at the regular view while their sale preview is on. */
  protected readonly staffView = signal<'sale' | 'regular'>('sale');
  protected readonly salePreview = this.sales.activeSale;
  protected readonly sale = computed(() =>
    this.staffView() === 'regular' ? null : this.sales.activeSale(),
  );
  protected readonly yearly = computed(() => pricingCards(this.sales.plans(), YEARLY_IDS));
  protected readonly passes = computed(() => pricingCards(this.sales.plans(), PASS_IDS));
  protected readonly promos = computed(() =>
    pricingCards(this.sales.plans(), this.sale()?.planIds ?? []),
  );

  /** The plan whose Choose button opened the notice, for the notice's own wording. */
  protected readonly chosen = signal<PricingCard | null>(null);
  private readonly notice = viewChild.required<ElementRef<HTMLDialogElement>>('notice');
  private readonly closeButton = viewChild.required<ElementRef<HTMLButtonElement>>('noticeClose');
  private trigger: HTMLElement | null = null;

  protected choose(plan: PricingCard, event: Event): void {
    this.trigger = event.currentTarget as HTMLElement | null;
    this.chosen.set(plan);
    const dialog = this.notice().nativeElement;
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    this.closeButton().nativeElement.focus();
  }

  protected closeNotice(): void {
    const dialog = this.notice().nativeElement;
    if (dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
    this.returnFocus();
  }

  /** Escape closes the native dialog; focus goes back to the button that opened it. */
  protected returnFocus(): void {
    const trigger = this.trigger;
    this.trigger = null;
    trigger?.focus();
  }
}
