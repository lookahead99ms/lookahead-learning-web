import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { MembershipApi } from '../../content/membership-api';
import { CATALOG_NAMES, formatUsd } from '../../content/membership-plans';
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
import { ScrollLock } from '../../core/scroll-lock/scroll-lock';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { TestSessions } from '../../core/test-session/test-sessions';
import { awaitingOwner, requestAlreadyWaiting, reviewRequestUrl } from '../../content/purchase-requests';
import { sameSitePath } from '../../core/test-session/same-site-path';
import {
  CHECKOUT_STEPS,
  CheckoutQuote,
  CheckoutStep,
  PaymentKind,
  checkoutDay,
  orderSummary,
  planName,
} from './checkout-summary';

/**
 * DLV-969 (owner, 2026-11-04): the DEV checkout screen, shown in place of the payment page for a test account once its
 * purchase is waiting for the owner or an admin. `sent` right after this purchase became a request; `waiting` when one
 * was already waiting (409 PURCHASE_REQUEST_PENDING). One-time and transient: kept only in this signal and, on Go to
 * People and access, in that one navigation's address; never in storage.
 */
export interface DevCheckout {
  kind: 'sent' | 'waiting';
  /** '' when the answer named none; the review address then opens the list without a request selected. */
  purchaseId: string;
  accountId: string;
  /** The test account's display name ("Learner06"). */
  name: string;
}

/** The Local mock payment's answer, in words. */
export interface PaymentOutcome {
  ok: boolean;
  message: string;
}

const PRICING_PATH = '/pricing';

/** Server-owned catalog and a stepped checkout; Local pays with a mock provider and no real payment is ever called. */
@Component({
  selector: 'app-pricing',
  imports: [FormsModule, PlatformHeader, RouterLink, NgTemplateOutlet, ScrollLock],
  templateUrl: './pricing.html',
  styleUrl: './pricing.css',
})
export class PricingPage {
  protected readonly membershipApi=inject(MembershipApi);
  private readonly changes=inject(ChangeDetectorRef);
  protected readonly purchaseStatus=signal('');
  protected readonly purchasing=signal(false);
  protected readonly submitted=signal(false);
  private quoteSequence=0;
  private purchaseKey='';
  /** The access record this purchase replaces (an upgrade, a change or a renewal); '' for a new purchase. */
  protected readonly replacesId=signal('');
  protected readonly quote=signal<CheckoutQuote|null>(null);
  protected readonly quoting=signal(false);
  private readonly devSession=inject(DevSession);
  protected readonly testSessions=inject(TestSessions);
  protected readonly steps=CHECKOUT_STEPS;
  protected readonly catalogNames=CATALOG_NAMES;
  protected readonly step=signal<CheckoutStep>('plan');
  protected readonly stepIndex=computed(()=>CHECKOUT_STEPS.findIndex(step=>step.id===this.step()));
  protected readonly devCheckout=signal<DevCheckout|null>(null);
  protected readonly outcome=signal<PaymentOutcome|null>(null);
  /**
   * The same-site page the purchase started from, for Switch back after the review: a `returnTo` on this address, else
   * the page that sent the learner here (a locked lesson), else Pricing itself.
   */
  readonly startedFrom:string=(()=>{
    const fromQuery=sameSitePath(inject(ActivatedRoute,{optional:true})?.snapshot.queryParamMap.get('returnTo'));
    if(fromQuery)return fromQuery;
    const router=inject(Router,{optional:true});
    const navigation=router?.currentNavigation()??router?.lastSuccessfulNavigation()??null;
    const previous=navigation?.previousNavigation?.finalUrl;
    const path=previous&&router?sameSitePath(router.serializeUrl(previous)):null;
    return path&&!path.startsWith(PRICING_PATH)?path:PRICING_PATH;
  })();
  /** Go to People and access: ends the test session, as Back to my account does, and lands on this request there. */
  protected goToPeopleAndAccess(checkout:DevCheckout){
    void this.testSessions.back(reviewRequestUrl({purchaseId:checkout.purchaseId,returnTo:this.startedFrom,accountId:checkout.accountId}));
  }
  /** DLV-969: this is DEV behind the Gateway's gate. */
  protected readonly dev=computed(()=>this.devSession.status()!==null||this.devSession.gated());
  /**
   * DLV-969 (owner, 2026-11-04): how buying works for this viewer. 'local' is the Local and production behaviour;
   * 'request' is a DEV test account, whose purchase waits for the owner; 'real' is a real account in DEV, which cannot buy.
   */
  protected readonly mode=computed<'local'|'request'|'real'>(()=>!this.dev()?'local':this.testSessions.active()?'request':'real');
  /** Only the payment step differs by environment (owner, 2026-11-04); the quote says whether payments are the mock. */
  protected readonly paymentKind=computed<PaymentKind>(()=>{
    const mode=this.mode();
    if(mode==='request')return 'dev-test';
    if(mode==='real')return 'dev-real';
    return this.quote()?.mock===true?'local':'prod';
  });
  /** The record a replacement purchase replaces; null for a new purchase. */
  protected readonly activeRecords=computed(()=>this.membershipApi.records().filter(record=>record.status==='active'));
  private readonly replaced=computed(()=>this.membershipApi.records().find(record=>record.id===this.replacesId())??null);
  protected readonly summary=computed(()=>{
    const card=this.chosen();
    return card?orderSummary(card,this.quote(),this.replaced(),this.membershipApi.plans()):null;
  });
  /** Continue to payment needs the server's quote; a real account in DEV goes on to read why it cannot buy. */
  protected readonly canContinueToPayment=computed(()=>this.mode()==='real'||(this.membershipApi.available()&&(this.quote()!==null||(this.mode()==='request'&&this.membershipApi.requestWaiting()))));
  protected recordLabel(record:{planId:string;endsAt:string|null}):string{
    const ends=checkoutDay(record.endsAt);
    return `Change my ${planName(record.planId,this.membershipApi.plans())} plan${ends?` (ends ${ends})`:''}`;
  }
  protected payLabel():string{return 'Pay '+formatUsd(this.quote()?.priceCents??this.chosen()?.plan.priceCents??0);}
  protected setReplaces(id:string){this.replacesId.set(id);void this.prepareQuote();}
  protected async prepareQuote(){
    const sequence=++this.quoteSequence;this.quote.set(null);this.purchaseStatus.set('');this.devCheckout.set(null);this.outcome.set(null);this.submitted.set(false);this.purchaseKey=crypto.randomUUID();const card=this.chosen();if(!card||!this.signedIn()||!this.membershipApi.available()||this.mode()==='real'){this.quoting.set(false);return;}
    this.quoting.set(true);
    try{const quote=await this.membershipApi.request<CheckoutQuote>('/account/purchases/quote',{planId:card.plan.id,replacesId:this.replacesId()||null,chosenCourses:[]});if(sequence===this.quoteSequence)this.quote.set(quote);}catch(error){if(sequence===this.quoteSequence)this.purchaseStatus.set(error instanceof Error?error.message:'Quote unavailable.');}
    finally{if(sequence===this.quoteSequence)this.quoting.set(false);}
  }
  /** Plan → Review → Payment. Moving on puts focus on the new step's heading, so a screen reader reads where it is. */
  protected goTo(step:CheckoutStep){
    this.step.set(step);
    this.changes.detectChanges();
    this.stepTitle()?.nativeElement.focus();
  }
  /**
   * Continue to payment. Local and production open the payment step. A DEV test account sends the purchase here (it
   * becomes a request) and opens the DEV checkout screen once the request exists; a waiting request opens it at once.
   */
  protected async continueToPayment(){
    if(!this.canContinueToPayment()||this.purchasing())return;
    if(this.paymentKind()!=='dev-test'){this.goTo('payment');return;}
    await this.purchase();
  }
  protected async purchase(){
    const card=this.chosen();if(!card||this.purchasing()||!this.membershipApi.available()||this.mode()==='real')return;
    if(this.mode()==='request'&&this.membershipApi.requestWaiting()){this.showDevCheckout('waiting','');return;}
    if(this.submitted())return;
    this.purchasing.set(true);this.purchaseStatus.set('');
    try{const result=await this.membershipApi.buy(card.plan.id,this.purchaseKey,this.replacesId()||undefined,this.quote()?.priceCents);this.submitted.set(true);if(awaitingOwner(result)){this.showDevCheckout('sent',purchaseIdOf(result));return;}
      const ok=['succeeded','scheduled'].includes(result.status);
      this.outcome.set({ok,message:ok?'Simulated purchase completed. No money was charged. Open Manage account to see your access.':'Payment simulation: '+result.status+' ('+result.providerStatus+'). No money was charged.'});
      if(this.step()!=='payment')this.goTo('payment');}
    catch(error){
      // 409 PURCHASE_REQUEST_PENDING opens the same DEV checkout screen; 403 PURCHASES_TEST_ACCOUNTS_ONLY and any other
      // refusal are said in the server's words.
      if(this.mode()==='request'&&requestAlreadyWaiting(error)){this.showDevCheckout('waiting','');return;}
      this.purchaseStatus.set(error instanceof Error?error.message:'Purchase unavailable. Retry with the same request.');}
    finally{this.purchasing.set(false);}
  }
  private showDevCheckout(kind:DevCheckout['kind'],purchaseId:string){
    const signedIn=this.accounts.account();
    this.purchaseStatus.set('');
    this.devCheckout.set({kind,purchaseId,accountId:signedIn?.accountId??'',name:signedIn?.displayName||signedIn?.username||'This account'});
    this.goTo('payment');
  }
  /** Escape closes the dialog, except while a payment or request is being sent. */
  protected cancel(event:Event){if(this.purchasing()||this.testSessions.returning())event.preventDefault();}
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

  /** The plan whose Choose button opened the checkout, for the checkout's own wording. */
  protected readonly chosen = signal<PricingCard | null>(null);
  private readonly notice = viewChild.required<ElementRef<HTMLDialogElement>>('notice');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('noticeClose');
  private readonly stepTitle = viewChild<ElementRef<HTMLElement>>('stepTitle');
  private trigger: HTMLElement | null = null;

  protected choose(plan: PricingCard, event: Event): void {
    this.trigger = event.currentTarget as HTMLElement | null;
    this.chosen.set(plan);
    this.step.set('plan');
    this.replacesId.set(this.membershipApi.records().find(r=>r.status==='active')?.id??'');
    void this.prepareQuote();
    // DLV-969: a waiting request may have been decided since; fresh records clear it once the plan has changed.
    const owner=this.accounts.account()?.accountId;if(owner&&this.membershipApi.requestWaiting())void this.membershipApi.loadRecords(owner);
    const dialog = this.notice().nativeElement;
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    // The first step renders before focus moves, so focus lands on this checkout's Close, never a stale one.
    this.changes.detectChanges();
    this.closeButton()?.nativeElement.focus();
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

/** The purchase answer's `id`, which People and access knows the request by; '' when it has none. */
function purchaseIdOf(result:unknown):string{
  const id=(result as {id?:unknown}|null)?.id;
  return typeof id==='string'?id:'';
}
