import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatUsd, planById, priceLabel, scopeLabel } from '../../../content/membership-plans';
import { PROMO_COMPARED_WITH, SalePreview } from '../../../content/sale-preview';

interface HomePlanCard {
  id: string;
  name: string;
  amount: string;
  period: string;
  includes: string;
  /** Sale card only. */
  greeting?: string;
  comparedWith?: string;
}

/**
 * DLV-209: a compact plans section for the home page, just before the Essence (user, 2026-10-15).
 * Everyone can see prices; buying happens on Pricing and needs an account. During a sale the
 * first card becomes the sale card. On the home page for every visitor (user approved 2026-10-15).
 */
@Component({
  selector: 'app-home-pricing',
  imports: [RouterLink],
  templateUrl: './home-pricing.html',
  styleUrl: './home-pricing.css',
})
export class HomePricing {
  private readonly sales = inject(SalePreview);

  protected readonly cards = computed<HomePlanCard[]>(() => {
    const plans = this.sales.plans();
    const find = (id: string) => plans.find((plan) => plan.id === id)!;
    const yearly = ['learn', 'grow', 'advance', 'complete'].map((id) => {
      const plan = find(id);
      return { id, name: plan.name, amount: formatUsd(plan.priceCents), period: '/year', includes: scopeLabel(plan.scope) };
    });
    const sale = this.sales.activeSale();
    const saleId = sale?.planIds.includes('annual-promo') ? 'annual-promo' : sale?.planIds[0];
    if (!sale || !saleId) return yearly;
    const promo = find(saleId);
    const regular = PROMO_COMPARED_WITH[promo.id] ? find(PROMO_COMPARED_WITH[promo.id]!) : null;
    const period = priceLabel(promo).replace(formatUsd(promo.priceCents), '').trim();
    return [
      {
        id: promo.id,
        name: `${sale.template.emoji} ${sale.template.name}`,
        greeting: sale.greeting,
        amount: formatUsd(promo.priceCents),
        period,
        includes: `${promo.name}: ${scopeLabel(promo.scope)}`,
        comparedWith: regular ? `${regular.name} is ${priceLabel(regular)}` : undefined,
      },
      ...yearly.slice(0, 3),
    ];
  });

  protected readonly sprint = planById('interview-sprint')!;
  protected readonly sprintPrice = computed(() => {
    const plan = this.sales.plans().find((item) => item.id === 'interview-sprint')!;
    return formatUsd(plan.priceCents);
  });
}
