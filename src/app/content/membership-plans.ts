/**
 * DLV-209: the agreed plan catalog (user decisions 2026-10-15). Pricing, Manage account and the
 * owner's People and access page all read this one list, so names, prices and terms cannot drift.
 *
 * Display data only. The server has no plans, purchases, prices or discounts yet: access is still
 * decided by its own course grants, checkout is not connected and nothing here is sent anywhere.
 * Undecided terms stay in `pending` and keep an offer off sale; nothing is invented to fill them.
 *
 * Renewal policy (final, 2026-10-15): nothing renews automatically. Access ends on its end date
 * and continues only when the learner buys again.
 */

export type CatalogId = 'learn' | 'grow' | 'blaze';
export type PlanGroup = 'regular' | 'promo';
export type PlanId =
  | 'free'
  | 'learn'
  | 'grow'
  | 'advance'
  | 'complete'
  | 'course-pass'
  | 'interview-sprint'
  | 'monthly-promo'
  | 'annual-promo'
  | 'interview-pass-promo';

/** How the price is charged. Nothing is a subscription: every paid row is a single purchase. */
export type PriceBasis = 'free' | 'per-year' | 'per-month' | 'per-course' | 'one-time';

export type PlanScope =
  | { kind: 'free' }
  | { kind: 'catalogs'; catalogs: readonly CatalogId[] }
  | { kind: 'courses'; min: number; max: number };

export type PlanDuration =
  | { kind: 'ongoing' }
  | { kind: 'years' | 'months' | 'days'; count: number }
  | { kind: 'pending' };

/** Free accounts have nothing to renew; every paid plan, promo and pass is renewed by buying again. */
export type RenewalPolicy = 'not-applicable' | 'manual';

export interface PlanDefinition {
  id: PlanId;
  group: PlanGroup;
  /** The exact short name used everywhere. */
  name: string;
  /** US cents, so prices are never rounded by floating point. */
  priceCents: number;
  priceBasis: PriceBasis;
  scope: PlanScope;
  duration: PlanDuration;
  renewal: RenewalPolicy;
  /** Terms the user has not decided yet. Any entry keeps the offer off sale. */
  pending: readonly string[];
}

export const CATALOG_NAMES: Readonly<Record<CatalogId, string>> = {
  learn: 'Learn',
  grow: 'Grow',
  blaze: 'Blaze',
};

const ALL_CATALOGS: readonly CatalogId[] = ['learn', 'grow', 'blaze'];

export const PLANS: readonly PlanDefinition[] = [
  {
    id: 'free',
    group: 'regular',
    name: 'Free',
    priceCents: 0,
    priceBasis: 'free',
    scope: { kind: 'free' },
    duration: { kind: 'ongoing' },
    renewal: 'not-applicable',
    pending: [],
  },
  {
    id: 'learn',
    group: 'regular',
    name: 'Learn',
    priceCents: 6999,
    priceBasis: 'per-year',
    scope: { kind: 'catalogs', catalogs: ['learn'] },
    duration: { kind: 'years', count: 1 },
    renewal: 'manual',
    pending: [],
  },
  {
    id: 'grow',
    group: 'regular',
    name: 'Grow',
    priceCents: 9999,
    priceBasis: 'per-year',
    scope: { kind: 'catalogs', catalogs: ['grow'] },
    duration: { kind: 'years', count: 1 },
    renewal: 'manual',
    pending: [],
  },
  {
    id: 'advance',
    group: 'regular',
    name: 'Advance',
    priceCents: 14499,
    priceBasis: 'per-year',
    scope: { kind: 'catalogs', catalogs: ['learn', 'grow'] },
    duration: { kind: 'years', count: 1 },
    renewal: 'manual',
    pending: [],
  },
  {
    id: 'complete',
    group: 'regular',
    name: 'Complete',
    priceCents: 27999,
    priceBasis: 'per-year',
    scope: { kind: 'catalogs', catalogs: ALL_CATALOGS },
    duration: { kind: 'years', count: 1 },
    renewal: 'manual',
    pending: [],
  },
  {
    id: 'course-pass',
    group: 'regular',
    name: 'Course Pass',
    priceCents: 2799,
    priceBasis: 'per-course',
    scope: { kind: 'courses', min: 1, max: 3 },
    duration: { kind: 'pending' },
    renewal: 'manual',
    pending: ['Duration'],
  },
  {
    id: 'interview-sprint',
    group: 'regular',
    name: 'Interview Sprint',
    priceCents: 9999,
    priceBasis: 'one-time',
    scope: { kind: 'catalogs', catalogs: ALL_CATALOGS },
    duration: { kind: 'days', count: 100 },
    renewal: 'manual',
    pending: [],
  },
  {
    id: 'monthly-promo',
    group: 'promo',
    name: 'Monthly Promo',
    priceCents: 2799,
    priceBasis: 'per-month',
    scope: { kind: 'catalogs', catalogs: ALL_CATALOGS },
    duration: { kind: 'months', count: 1 },
    renewal: 'manual',
    // Offered only while a sale runs (sale-preview.ts); no sale is live until the server supports it.
    pending: [],
  },
  {
    id: 'annual-promo',
    group: 'promo',
    name: 'Annual Promo',
    priceCents: 10449,
    priceBasis: 'per-year',
    scope: { kind: 'catalogs', catalogs: ALL_CATALOGS },
    duration: { kind: 'years', count: 1 },
    renewal: 'manual',
    // Offered only while a sale runs (sale-preview.ts); no sale is live until the server supports it.
    pending: [],
  },
  {
    id: 'interview-pass-promo',
    group: 'promo',
    name: 'Interview Pass Promo',
    priceCents: 5999,
    priceBasis: 'one-time',
    scope: { kind: 'catalogs', catalogs: ALL_CATALOGS },
    duration: { kind: 'days', count: 90 },
    renewal: 'manual',
    // Offered only while a sale runs (sale-preview.ts); no sale is live until the server supports it.
    pending: [],
  },
];

export function planById(id: string): PlanDefinition | undefined {
  return PLANS.find((plan) => plan.id === id);
}

/** "$69.99"; whole dollars keep their cents so every price reads the same way. */
export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** What the eye reads next to the amount: "/year", "per course", "one-time". */
export function priceSuffix(plan: PlanDefinition): string {
  switch (plan.priceBasis) {
    case 'per-year':
      return '/year';
    case 'per-month':
      return '/month';
    case 'per-course':
      return 'per course';
    case 'one-time':
      return 'one-time';
    case 'free':
      return '';
  }
}

/** "$69.99/year", "$27.99 per course", "$99.99 one-time", "$0". */
export function priceLabel(plan: PlanDefinition): string {
  const suffix = priceSuffix(plan);
  const amount = formatUsd(plan.priceCents);
  if (plan.priceBasis === 'free') return '$0';
  return suffix.startsWith('/') ? `${amount}${suffix}` : `${amount} ${suffix}`;
}

/** What a screen reader hears: "$69.99 per year", "$99.99, one-time payment". */
export function spokenPrice(plan: PlanDefinition): string {
  const amount = formatUsd(plan.priceCents);
  switch (plan.priceBasis) {
    case 'per-year':
      return `${amount} per year`;
    case 'per-month':
      return `${amount} per month`;
    case 'per-course':
      return `${amount} per course`;
    case 'one-time':
      return `${amount}, one-time payment`;
    case 'free':
      return 'Free';
  }
}

/** "Learn + Grow + Blaze", "1–3 courses you choose", "Free lessons". */
export function scopeLabel(scope: PlanScope): string {
  switch (scope.kind) {
    case 'free':
      return 'Open and Free with account lessons';
    case 'catalogs':
      return scope.catalogs.map((catalog) => CATALOG_NAMES[catalog]).join(' + ');
    case 'courses':
      return `${scope.min}–${scope.max} courses you choose`;
  }
}

/** "1 year", "1 month", "100 days", "Ongoing", "Not decided yet". */
export function durationLabel(duration: PlanDuration): string {
  switch (duration.kind) {
    case 'ongoing':
      return 'Ongoing';
    case 'pending':
      return 'Not decided yet';
    default: {
      const unit = { years: 'year', months: 'month', days: 'day' }[duration.kind];
      return `${duration.count} ${unit}${duration.count === 1 ? '' : 's'}`;
    }
  }
}

export function renewalLabel(renewal: RenewalPolicy): string {
  return renewal === 'manual' ? 'Manual renewal' : 'Not applicable';
}

/** An offer can be chosen only when every term is decided. Checkout is still not connected. */
export function isOfferComplete(plan: PlanDefinition): boolean {
  return plan.pending.length === 0;
}

/** Days before the end date when a learner may move to a smaller or different yearly plan. */
export const CHANGE_WINDOW_DAYS = 7;

/** Days before the end date when a reminder should go out; schedule and channel are not decided. */
export const REMINDER_WINDOW_DAYS = { from: 10, to: 7 } as const;

const YEARLY_CATALOG_PLANS: ReadonlySet<PlanId> = new Set(['learn', 'grow', 'advance', 'complete']);

/**
 * Moving between the yearly catalog plans (user rule, 2026-10-15):
 * - 'upgrade': the new plan includes every catalog of the current one and more. Allowed any time;
 *   the learner pays the difference for the time left and the end date stays the same.
 * - 'at-renewal': anything else (smaller, or a different catalog such as Learn to Grow). Allowed only
 *   in the last CHANGE_WINDOW_DAYS before the current plan ends; the new plan starts when it ends.
 * - null: same plan, or a plan outside these four, where no change rule has been decided.
 */
export function planChange(fromId: PlanId, toId: PlanId): 'upgrade' | 'at-renewal' | null {
  if (fromId === toId || !YEARLY_CATALOG_PLANS.has(fromId) || !YEARLY_CATALOG_PLANS.has(toId)) {
    return null;
  }
  const from = catalogsOf(planById(fromId)!);
  const to = catalogsOf(planById(toId)!);
  const isSuperset = from.every((catalog) => to.includes(catalog)) && to.length > from.length;
  return isSuperset ? 'upgrade' : 'at-renewal';
}

/** The yearly plans that are an upgrade from this one, smallest first. */
export function upgradesFrom(planId: PlanId): PlanDefinition[] {
  return PLANS.filter((plan) => planChange(planId, plan.id) === 'upgrade');
}

/** The first day a smaller or different plan can be chosen: CHANGE_WINDOW_DAYS before the end. */
export function changeWindowOpens(endsAt: Date): Date {
  return new Date(endsAt.getTime() - CHANGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

function catalogsOf(plan: PlanDefinition): readonly CatalogId[] {
  return plan.scope.kind === 'catalogs' ? plan.scope.catalogs : [];
}

export interface PlanCatalogRow {
  id: PlanId;
  group: 'Regular' | 'Promo';
  name: string;
  price: string;
  access: string;
  duration: string;
  renewal: string;
  /** Configuration state, never a sale: there is no checkout. */
  status: string;
}

/** The configured catalog as one table row per plan, for staff pages. */
export function planCatalogRows(): PlanCatalogRow[] {
  return PLANS.map((plan) => ({
    id: plan.id,
    group: plan.group === 'promo' ? 'Promo' : 'Regular',
    name: plan.name,
    price: priceLabel(plan),
    access: scopeLabel(plan.scope),
    duration: durationLabel(plan.duration),
    renewal: renewalLabel(plan.renewal),
    status:
      plan.id === 'free'
        ? 'Available: any signed-in account'
        : !isOfferComplete(plan)
          ? `Pending: ${plan.pending.join(', ')}`
          : plan.group === 'promo'
            ? 'Only during a sale; checkout not connected'
            : 'Not on sale: checkout not connected',
  }));
}

/**
 * The yearly plans on sale that include a catalog, smallest first, and the lowest price:
 * learn -> Learn, Advance, Complete from $69.99/year. For the locked-lesson screen.
 */
export function plansIncluding(catalog: CatalogId): { names: string[]; from: string } | null {
  const plans = PLANS.filter(
    (plan) =>
      plan.group === 'regular' &&
      plan.priceBasis === 'per-year' &&
      isOfferComplete(plan) &&
      plan.scope.kind === 'catalogs' &&
      plan.scope.catalogs.includes(catalog),
  ).sort((a, b) => a.priceCents - b.priceCents);
  return plans.length ? { names: plans.map((plan) => plan.name), from: priceLabel(plans[0]) } : null;
}
