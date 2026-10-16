import { FormsModule } from '@angular/forms';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { MembershipApi } from '../../content/membership-api';
import { PROMO_PLAN_IDS, SalePreview } from '../../content/sale-preview';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import {
  FREE_FEATURES,
  MOCK_INTERVIEW_FORMATS,
  PASS_IDS,
  PLAN_RULES,
  PRICING_FAQ,
  CardState,
  PricingCard,
  START_FREE_ROUTE,
  YEARLY_IDS,
  cardState,
  pricingCards,
} from './pricing-plans';

/** Server-owned catalog and explicit local mock purchases; no real payment calls. */
@Component({
  selector: 'app-pricing',
  imports: [DatePipe, FormsModule, PlatformHeader, RouterLink, NgTemplateOutlet],
  templateUrl: './pricing.html',
  styleUrl: './pricing.css',
})
export class PricingPage {
  protected readonly membershipApi=inject(MembershipApi);
  protected readonly purchaseStatus=signal('');
  protected readonly purchasing=signal(false);
  protected readonly submitted=signal(false);
  private quoteSequence=0;
  private purchaseKey='';
  protected replacesId='';
  protected readonly quote=signal<{priceCents:number;endsAt:string}|null>(null);
  protected async prepareQuote(){
    const sequence=++this.quoteSequence;this.quote.set(null);this.purchaseStatus.set('');this.submitted.set(false);this.purchaseKey=crypto.randomUUID();const card=this.chosen();if(!card||!this.signedIn()||!this.membershipApi.available())return;
    try{const quote=await this.membershipApi.request<{priceCents:number;endsAt:string}>('/account/purchases/quote',{planId:card.plan.id,replacesId:this.replacesId||null,chosenCourses:[]});if(sequence===this.quoteSequence)this.quote.set(quote);}catch(error){if(sequence===this.quoteSequence)this.purchaseStatus.set(error instanceof Error?error.message:'Quote unavailable.');}
  }
  protected async purchase(){
    const card=this.chosen();if(!card||this.purchasing()||!this.membershipApi.available())return;
    this.purchasing.set(true);
    try{const result=await this.membershipApi.buy(card.plan.id,this.purchaseKey,this.replacesId||undefined,this.quote()?.priceCents);this.submitted.set(true);this.purchaseStatus.set(['succeeded','scheduled'].includes(result.status)?'Simulated purchase completed. No money was charged. Open Manage account to see your access.':'Payment simulation: '+result.status+' ('+result.providerStatus+'). No money was charged.');}
    catch(error){this.purchaseStatus.set(error instanceof Error?error.message:'Purchase unavailable. Retry with the same request.');}
    finally{this.purchasing.set(false);}
  }
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
  /** Every sale plan, for the staff-only section shown when no sale runs. */
  protected readonly allPromos = computed(() => pricingCards(this.sales.plans(), PROMO_PLAN_IDS));

  /** Staff see every plan as choosable; a learner's own plan and change rules shape theirs. */
  protected stateOf(card: PricingCard): CardState {
    return cardState(card.plan, this.membershipApi.records(), { staff: this.isStaff() });
  }

  /** The plan whose Choose button opened the notice, for the notice's own wording. */
  protected readonly chosen = signal<PricingCard | null>(null);
  private readonly notice = viewChild.required<ElementRef<HTMLDialogElement>>('notice');
  private readonly closeButton = viewChild.required<ElementRef<HTMLButtonElement>>('noticeClose');
  private trigger: HTMLElement | null = null;

  protected choose(plan: PricingCard, event: Event): void {
    this.trigger = event.currentTarget as HTMLElement | null;
    this.chosen.set(plan);
    this.purchaseKey=crypto.randomUUID();this.purchaseStatus.set('');this.replacesId=this.membershipApi.records().find(r=>r.status==='active')?.id??'';void this.prepareQuote();
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
