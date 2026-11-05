/**
 * DLV-969 (owner, 2026-11-04): the checkout's order summary in words. The purchase flow looks like production in every
 * environment; only the payment step differs (Local mock payment, DEV checkout screen, production not enabled yet).
 * Display only: the server's quote decides the price and dates.
 */
import { CatalogId, PlanDefinition, formatUsd, planById } from '../../content/membership-plans';
import type { AccessRecord } from '../account/account-membership';
import type { PricingCard } from './pricing-plans';

/** The server's quote for one purchase (`POST /account/purchases/quote`); `mock` is true for Local and DEV. */
export interface CheckoutQuote {
  priceCents: number;
  startsAt?: string;
  endsAt: string;
  mock?: boolean;
}

export type CheckoutStep = 'plan' | 'review' | 'payment';
export const CHECKOUT_STEPS: readonly { id: CheckoutStep; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'review', label: 'Review' },
  { id: 'payment', label: 'Payment' },
];

/**
 * What the payment step is for this viewer: `local` the mock payment (the quote says `mock`), `prod` a real provider
 * that is not enabled yet, `dev-test` the DEV checkout screen for a test account, `dev-real` a real account in DEV.
 */
export type PaymentKind = 'local' | 'prod' | 'dev-test' | 'dev-real';

export interface OrderSummary {
  name: string;
  /** "Learn + Grow". */
  includes: string;
  /** The catalogs the plan opens, for the Learn / Grow / Blaze marks; empty for a course pass. */
  catalogs: readonly CatalogId[];
  /** "4 Nov 2026 – 4 Nov 2027" from the quote; the plan's length ("1 year of access") until it arrives. */
  term: string;
  /** The plan's list price, "$144.99". */
  listPrice: string;
  /** "/year", "one-time". */
  period: string;
  /** What is due now: the quote's price, or the list price until the quote arrives. */
  due: string;
  /** False until the quote arrives, so the price can show it is still being checked. */
  quoted: boolean;
  /** An upgrade: the credit for the time left on the current plan, and the end date it keeps. */
  upgrade: { from: string; credit: string; ends: string | null } | null;
  /** A change or renewal that starts when the current plan ends: "Starts 4 Nov 2027, when your Learn plan ends." */
  startsLater: string | null;
}

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "4 Nov 2026"; null for a missing or unreadable date. */
export function checkoutDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const when = new Date(value);
  return Number.isNaN(when.getTime()) ? null : dayFormat.format(when);
}

/** A plan's name from the catalog the page has, then the built-in one, then its id. */
export function planName(planId: string, plans: readonly PlanDefinition[]): string {
  return plans.find((plan) => plan.id === planId)?.name ?? planById(planId)?.name ?? planId;
}

/** The order the review and payment steps show. `now` is for tests. */
export function orderSummary(
  card: PricingCard,
  quote: CheckoutQuote | null,
  replaced: AccessRecord | null,
  plans: readonly PlanDefinition[],
  now: Date = new Date(),
): OrderSummary {
  const plan = card.plan;
  const starts = checkoutDay(quote?.startsAt) ?? (quote ? checkoutDay(now.toISOString()) : null);
  const ends = checkoutDay(quote?.endsAt);
  const startsInFuture = !!quote?.startsAt && new Date(quote.startsAt).getTime() > now.getTime() + 60_000;
  const from = replaced ? planName(replaced.planId, plans) : null;
  const credit = quote && replaced && !startsInFuture ? plan.priceCents - quote.priceCents : 0;
  return {
    name: plan.name,
    includes: card.includes,
    catalogs: plan.scope.kind === 'catalogs' ? plan.scope.catalogs : [],
    term: starts && ends ? `${starts} – ${ends}` : card.terms[0],
    listPrice: formatUsd(plan.priceCents),
    period: card.period,
    due: formatUsd(quote?.priceCents ?? plan.priceCents),
    quoted: !!quote,
    upgrade: from && credit > 0 ? { from, credit: `−${formatUsd(credit)}`, ends } : null,
    startsLater: startsInFuture && starts ? `Starts ${starts}${from ? `, when your ${from} plan ends` : ''}.` : null,
  };
}
