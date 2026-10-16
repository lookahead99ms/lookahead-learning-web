import { MembershipApi } from './membership-api';
import { Injectable, computed, inject, signal } from '@angular/core';
import { StudyPlanAccount } from '../pages/study-plan/study-plan-account';
import { PLANS, PlanId } from './membership-plans';

/** Server-owned sales. The legacy service name is retained for existing consumers. */
export type SaleTemplateId = 'holiday' | 'spring' | 'graduation' | 'engineers-day';

export interface SaleTemplate {
  id: SaleTemplateId;
  /** "Holiday sale" */
  name: string;
  /** The default greeting shown above the sale prices; editable when a sale starts. */
  greeting: string;
  /** Decorative only, never the sole way to tell sales apart. */
  emoji: string;
}

export const SALE_TEMPLATES: readonly SaleTemplate[] = [
  { id: 'holiday', name: 'Holiday sale', greeting: 'Happy holidays', emoji: '🎄' },
  { id: 'spring', name: 'Spring sale', greeting: 'Happy spring', emoji: '🌸' },
  { id: 'graduation', name: 'Graduation sale', greeting: 'Happy graduation', emoji: '🎓' },
  { id: 'engineers-day', name: 'Engineer’s Day sale', greeting: 'Happy Engineer’s Day', emoji: '🛠️' },
];

/** The promo plans a sale can offer. */
export const PROMO_PLAN_IDS: readonly PlanId[] = PLANS.filter((plan) => plan.group === 'promo').map(
  (plan) => plan.id,
);

/** The regular plan a promo is compared with, so the saving is real and visible. */
export const PROMO_COMPARED_WITH: Readonly<Partial<Record<PlanId, PlanId>>> = {
  'annual-promo': 'complete',
  'interview-pass-promo': 'interview-sprint',
};

export interface ActiveSale {
  template: SaleTemplate;
  greeting: string;
  planIds: PlanId[];
  /** False for server-backed sales; retained for isolated preview fixtures. */
  preview: boolean;
}

@Injectable({ providedIn: 'root' })
export class SalePreview {
  private readonly accounts = inject(StudyPlanAccount);
  readonly api = inject(MembershipApi);
  readonly activeSale = signal<ActiveSale | null>(null);
  readonly plans = this.api.plans;
  readonly priceOverrides = signal<Partial<Record<PlanId, number>>>({});
  readonly isStaff = computed(() => this.accounts.account()?.permissions?.manageAccess === true || this.accounts.account()?.authorPreview === true);
  private saleId: string | null = null;
  constructor(){void this.reload();}
  async reload(){
    try {
      const sale=await this.api.request<{id:string;template:SaleTemplateId;greeting:string;planIds:PlanId[]} | null>('/sales/active');
      this.saleId=sale?.id??null;
      const template=SALE_TEMPLATES.find(t=>t.id===sale?.template);
      this.activeSale.set(sale&&template?{template,greeting:sale.greeting,planIds:sale.planIds,preview:false}:null);
    } catch {this.activeSale.set(null);}
  }
  async startSale(templateId:SaleTemplateId,greeting:string,planIds:PlanId[],startsAt?:string,endsAt?:string){
    if(!startsAt||!endsAt)throw new Error('Choose the sale start and end dates.');
    await this.api.request('/admin/sales',{template:templateId,greeting,planIds,startsAt:new Date(startsAt).toISOString(),endsAt:new Date(endsAt).toISOString()});await this.reload();
  }
  async stopSale(){if(!this.saleId)throw new Error('No active sale.');await this.api.request('/admin/sales/'+this.saleId+'/stop',{});await this.reload();}
  async setPrice(planId:PlanId,cents:number|null){if(cents===null||!Number.isInteger(cents)||cents<1)throw new Error('Enter a positive price in cents.');await this.api.request('/admin/membership/plans/'+planId+'/price',{priceCents:cents});await this.api.refresh();}
  async resetPrices(){throw new Error('Set each price explicitly; purchase history is never reset.');}
}
