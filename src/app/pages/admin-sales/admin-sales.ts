import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { AuthorAdminMenu } from '../../core/author-workspace-nav/author-admin-menu';
import { AuthorDocHero } from '../../core/author-workspace-nav/author-doc-hero';
import {
  AuthorOutlineItem,
  AuthorWorkspaceNav,
} from '../../core/author-workspace-nav/author-workspace-nav';
import { PLANS, PlanId, formatUsd, priceLabel } from '../../content/membership-plans';
import {
  PROMO_PLAN_IDS,
  SALE_TEMPLATES,
  SalePreview,
  SaleTemplateId,
} from '../../content/sale-preview';

/**
 * DLV-209 admin page: start or stop a sale and change default prices, as a preview. There is no
 * server support for sales or price changes (frontend design only, user 2026-10-15), so every
 * change here is stored in this browser and seen only by this staff account on Pricing.
 */
@Component({
  selector: 'app-admin-sales',
  imports: [
    PlatformHeader,
    FormsModule,
    RouterLink,
    AuthorAdminMenu,
    AuthorDocHero,
    AuthorWorkspaceNav,
  ],
  templateUrl: './admin-sales.html',
  styleUrl: './admin-sales.css',
})
export class AdminSalesPage {
  private readonly sales = inject(SalePreview);
  protected readonly templates = SALE_TEMPLATES;
  protected readonly activeSale = this.sales.activeSale;
  protected readonly promoPlans = PLANS.filter((plan) => PROMO_PLAN_IDS.includes(plan.id));
  protected readonly outline: readonly AuthorOutlineItem[] = [
    { label: 'Sale', href: '#sale' },
    { label: 'Default prices', href: '#prices' },
    { label: 'What is not built', href: '#not-built' },
  ];

  protected selectedTemplate: SaleTemplateId = this.activeSale()?.template.id ?? 'holiday';
  protected greeting = this.activeSale()?.greeting ?? SALE_TEMPLATES[0].greeting;
  protected readonly includedPlans = signal<PlanId[]>(
    this.activeSale()?.planIds ?? [...PROMO_PLAN_IDS],
  );
  protected readonly notice = signal('');

  /** One row per plan: its catalog price and the price being previewed, in dollars. */
  protected readonly priceRows = computed(() => {
    const overrides = this.sales.priceOverrides();
    return PLANS.filter((plan) => plan.id !== 'free').map((plan) => ({
      id: plan.id,
      name: plan.name,
      group: plan.group === 'promo' ? 'Sale' : 'Regular',
      catalog: priceLabel(plan),
      preview: overrides[plan.id] !== undefined ? (overrides[plan.id]! / 100).toFixed(2) : '',
    }));
  });

  protected chooseTemplate(id: SaleTemplateId): void {
    this.selectedTemplate = id;
    this.greeting = SALE_TEMPLATES.find((template) => template.id === id)!.greeting;
  }

  protected togglePlan(id: PlanId, checked: boolean): void {
    this.includedPlans.update((ids) =>
      checked ? [...new Set([...ids, id])] : ids.filter((item) => item !== id),
    );
  }

  protected startSale(): void {
    if (!this.includedPlans().length) {
      this.notice.set('Choose at least one sale plan.');
      return;
    }
    this.sales.startSale(this.selectedTemplate, this.greeting, this.includedPlans());
    this.notice.set('Sale preview started. Open Pricing to see it; only you can see it.');
  }

  protected stopSale(): void {
    this.sales.stopSale();
    this.notice.set('Sale preview stopped.');
  }

  /** Dollars as typed ("59.99"); empty clears the preview for that plan. */
  protected setPrice(id: PlanId, value: string): void {
    const trimmed = value.trim();
    if (!trimmed) {
      this.sales.setPrice(id, null);
      return;
    }
    if (!/^\d{1,4}(\.\d{1,2})?$/.test(trimmed)) {
      this.notice.set('Enter a price such as 59.99.');
      return;
    }
    this.sales.setPrice(id, Math.round(Number(trimmed) * 100));
    this.notice.set(`Previewing ${formatUsd(Math.round(Number(trimmed) * 100))} for this plan.`);
  }

  protected resetPrices(): void {
    this.sales.resetPrices();
    this.notice.set('Prices are back to the catalog.');
  }
}
