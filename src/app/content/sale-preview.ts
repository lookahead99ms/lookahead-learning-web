import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { StudyPlanAccount } from '../pages/study-plan/study-plan-account';
import { PLANS, PlanDefinition, PlanId } from './membership-plans';

/**
 * DLV-209 sales (user decisions 2026-10-15): 3–4 sales a year; a promo appears only while its
 * sale runs, never before. During a sale, Pricing shows the greeting and promo plans first and
 * the regular plans read-only below.
 *
 * There is no server support for sales or price changes yet (frontend design only), so:
 * - learners never see a sale: `activeSale()` is null for them;
 * - staff (authors and admins) can start a *preview* sale and preview price changes from
 *   Admin → Sales and prices. The preview is stored in this browser only and changes nothing for
 *   anyone else. The proposed server contract is in content DLV-209 evidence.
 */
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
  /** Always true today: no sale is live for learners until the server supports it. */
  preview: true;
}

interface StoredSale {
  templateId: SaleTemplateId;
  greeting: string;
  planIds: PlanId[];
}

const SALE_KEY = 'lookahead.sale-preview.v1';
const PRICE_KEY = 'lookahead.price-preview.v1';

@Injectable({ providedIn: 'root' })
export class SalePreview {
  private readonly accounts = inject(StudyPlanAccount);
  private readonly view = inject(DOCUMENT).defaultView;
  private readonly storedSale = signal<StoredSale | null>(this.read<StoredSale>(SALE_KEY));
  private readonly storedPrices = signal<Partial<Record<PlanId, number>>>(
    this.read<Partial<Record<PlanId, number>>>(PRICE_KEY) ?? {},
  );

  /** Authors and admins: the only people who can preview sales and prices. */
  readonly isStaff = computed(() => {
    const account = this.accounts.account();
    if (!account || this.accounts.sessionExpired()) return false;
    return account.authorPreview === true || account.permissions?.previewDocuments === true;
  });

  /** The sale shown on this page view: a staff preview, or nothing. */
  readonly activeSale = computed<ActiveSale | null>(() => {
    const stored = this.storedSale();
    if (!stored || !this.isStaff()) return null;
    const template = SALE_TEMPLATES.find((item) => item.id === stored.templateId);
    const planIds = stored.planIds.filter((id) => PROMO_PLAN_IDS.includes(id));
    if (!template || !planIds.length) return null;
    return { template, greeting: stored.greeting.trim() || template.greeting, planIds, preview: true };
  });

  /** Plan prices with any staff price preview applied; learners always get the catalog. */
  readonly plans = computed<readonly PlanDefinition[]>(() => {
    const overrides = this.isStaff() ? this.storedPrices() : {};
    return PLANS.map((plan) =>
      overrides[plan.id] !== undefined ? { ...plan, priceCents: overrides[plan.id]! } : plan,
    );
  });

  readonly priceOverrides = computed(() => (this.isStaff() ? this.storedPrices() : {}));

  startSale(templateId: SaleTemplateId, greeting: string, planIds: PlanId[]): void {
    const sale = { templateId, greeting, planIds };
    this.storedSale.set(sale);
    this.write(SALE_KEY, sale);
  }

  stopSale(): void {
    this.storedSale.set(null);
    this.write(SALE_KEY, null);
  }

  /** Whole cents only; null clears the preview for that plan. */
  setPrice(planId: PlanId, cents: number | null): void {
    const next = { ...this.storedPrices() };
    if (cents === null || !Number.isInteger(cents) || cents < 0) delete next[planId];
    else next[planId] = cents;
    this.storedPrices.set(next);
    this.write(PRICE_KEY, Object.keys(next).length ? next : null);
  }

  resetPrices(): void {
    this.storedPrices.set({});
    this.write(PRICE_KEY, null);
  }

  private read<T>(key: string): T | null {
    try {
      const raw = this.view?.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: unknown): void {
    try {
      if (value === null) this.view?.localStorage.removeItem(key);
      else this.view?.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be unavailable (private mode); the preview then lasts for this page only.
    }
  }
}
