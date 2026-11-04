import { FormsModule } from '@angular/forms';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import { ScrollLock } from '../../core/scroll-lock/scroll-lock';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { TestSessions } from '../../core/test-session/test-sessions';
import { REQUEST_WAITING_MESSAGE, awaitingOwner, reviewRequestUrl } from '../../content/purchase-requests';
import { sameSitePath } from '../../core/test-session/same-site-path';

/** The request just sent, for the request-sent notice and its Review request address. */
export interface SentRequest {
  purchaseId: string;
  accountId: string;
  /** The test account's display name ("Learner06"). */
  name: string;
}

const PRICING_PATH = '/pricing';

/** Server-owned catalog and explicit local mock purchases; no real payment calls. */
@Component({
  selector: 'app-pricing',
  imports: [DatePipe, FormsModule, PlatformHeader, RouterLink, NgTemplateOutlet, ScrollLock],
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
  private readonly devSession=inject(DevSession);
  protected readonly testSessions=inject(TestSessions);
  /**
   * DLV-969 (owner wording, 2026-11-04): a request was just sent; the notice says where it is approved. One-time and
   * transient: kept only in this signal and, on Review request, in that one navigation's address; never in storage.
   */
  protected readonly requestSent=signal<SentRequest|null>(null);
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
  /** Review request: ends the test session, as Back to my account does, and lands on this request in People and access. */
  protected reviewRequest(sent:SentRequest){
    const next=reviewRequestUrl({purchaseId:sent.purchaseId,returnTo:this.startedFrom,accountId:sent.accountId});
    this.requestSent.set(null);void this.testSessions.back(next);
  }
  /** DLV-969: this is DEV behind the Gateway's gate. */
  protected readonly dev=computed(()=>this.devSession.status()!==null||this.devSession.gated());
  /**
   * DLV-969 (owner, 2026-11-04): how buying works for this viewer. 'local' is the Local and production behaviour;
   * 'request' is a DEV test account, whose purchase waits for the owner; 'real' is a real account in DEV, which cannot buy.
   */
  protected readonly mode=computed<'local'|'request'|'real'>(()=>!this.dev()?'local':this.testSessions.active()?'request':'real');
  protected readonly waitingMessage=REQUEST_WAITING_MESSAGE;
  protected async prepareQuote(){
    const sequence=++this.quoteSequence;this.quote.set(null);this.purchaseStatus.set('');this.requestSent.set(null);this.submitted.set(false);this.purchaseKey=crypto.randomUUID();const card=this.chosen();if(!card||!this.signedIn()||!this.membershipApi.available()||this.mode()==='real')return;
    try{const quote=await this.membershipApi.request<{priceCents:number;endsAt:string}>('/account/purchases/quote',{planId:card.plan.id,replacesId:this.replacesId||null,chosenCourses:[]});if(sequence===this.quoteSequence)this.quote.set(quote);}catch(error){if(sequence===this.quoteSequence)this.purchaseStatus.set(error instanceof Error?error.message:'Quote unavailable.');}
  }
  protected async purchase(){
    const card=this.chosen();if(!card||this.purchasing()||!this.membershipApi.available()||this.mode()==='real'||this.membershipApi.requestWaiting())return;
    this.purchasing.set(true);
    try{const result=await this.membershipApi.buy(card.plan.id,this.purchaseKey,this.replacesId||undefined,this.quote()?.priceCents);this.submitted.set(true);if(awaitingOwner(result)){const signedIn=this.accounts.account();this.purchaseStatus.set('');this.requestSent.set({purchaseId:purchaseIdOf(result),accountId:signedIn?.accountId??'',name:signedIn?.displayName||signedIn?.username||'this test account'});return;}this.purchaseStatus.set(['succeeded','scheduled'].includes(result.status)?'Simulated purchase completed. No money was charged. Open Manage account to see your access.':'Payment simulation: '+result.status+' ('+result.providerStatus+'). No money was charged.');}
    // 409 PURCHASE_REQUEST_PENDING and 403 PURCHASES_TEST_ACCOUNTS_ONLY are said in the server's words.
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
    // DLV-969: a waiting request may have been decided since; fresh records clear it once the plan has changed.
    const owner=this.accounts.account()?.accountId;if(owner&&this.membershipApi.requestWaiting())void this.membershipApi.loadRecords(owner);
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

/** The purchase answer's `id`, which People and access knows the request by; '' when it has none. */
function purchaseIdOf(result:unknown):string{
  const id=(result as {id?:unknown}|null)?.id;
  return typeof id==='string'?id:'';
}
