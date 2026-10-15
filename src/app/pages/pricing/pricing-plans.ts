/**
 * DLV-209: the pricing page's view of the agreed plan catalog (src/app/content/membership-plans.ts).
 * Display copy only. Nothing here is sent anywhere, stored, or used to grant access: the server
 * still decides access from its own course grants, and checkout is not connected.
 */
import {
  CHANGE_WINDOW_DAYS,
  PlanDefinition,
  PlanId,
  REMINDER_WINDOW_DAYS,
  durationLabel,
  formatUsd,
  isOfferComplete,
  priceLabel,
  priceSuffix,
  renewalLabel,
  scopeLabel,
  spokenPrice,
} from '../../content/membership-plans';
import { PROMO_COMPARED_WITH } from '../../content/sale-preview';

/** The Start free page (DLV-942): every open and free unit. */
export const START_FREE_ROUTE = '/start-free';

export interface PricingCard {
  plan: PlanDefinition;
  /** What the eye reads: "$69.99". */
  amount: string;
  /** Short suffix next to the amount: "/year", "per course", "one-time". */
  period: string;
  /** What a screen reader reads instead of amount + period. */
  spokenPrice: string;
  /** "Learn + Grow" or "1–3 courses you choose". */
  includes: string;
  terms: readonly string[];
  /** Only offers whose terms are all decided can be chosen. */
  canChoose: boolean;
  /** "Not decided yet: duration." */
  pendingNote: string | null;
  /** Promo only: "Complete is $279.99/year", so the saving is real and visible. */
  comparedWith: string | null;
}

function card(plan: PlanDefinition, plans: readonly PlanDefinition[]): PricingCard {
  const duration = durationLabel(plan.duration);
  const compared = PROMO_COMPARED_WITH[plan.id];
  const regular = compared ? plans.find((item) => item.id === compared) : undefined;
  return {
    plan,
    amount: formatUsd(plan.priceCents),
    period: priceSuffix(plan),
    spokenPrice: spokenPrice(plan),
    includes: scopeLabel(plan.scope),
    terms: [
      plan.duration.kind === 'pending' ? 'Length of access: not decided yet' : `${duration} of access`,
      renewalLabel(plan.renewal),
    ],
    canChoose: isOfferComplete(plan),
    pendingNote: plan.pending.length
      ? `Not decided yet: ${plan.pending.map((term) => term.toLowerCase()).join(', ')}.`
      : null,
    comparedWith: regular ? `${regular.name} is ${priceLabel(regular)}` : null,
  };
}

/** Cards in the order given, so an offer that is on sale comes before one that is not. */
export function pricingCards(
  plans: readonly PlanDefinition[],
  ids: readonly PlanId[],
): PricingCard[] {
  return ids
    .map((id) => plans.find((plan) => plan.id === id))
    .filter((plan): plan is PlanDefinition => plan !== undefined)
    .map((plan) => card(plan, plans));
}

/** One year of access per purchase: Learn, Grow, Advance, Complete. */
export const YEARLY_IDS: readonly PlanId[] = ['learn', 'grow', 'advance', 'complete'];
/** Interview Sprint and Course Pass. */
export const PASS_IDS: readonly PlanId[] = ['interview-sprint', 'course-pass'];

export interface FreeFeature {
  title: string;
  detail: string;
}

export const FREE_FEATURES: readonly FreeFeature[] = [
  { title: 'Open lessons', detail: 'Read them without an account.' },
  { title: 'Free with account lessons', detail: 'Unlocked when you sign up.' },
  { title: 'Search', detail: 'Find courses, lessons and interview questions.' },
  { title: 'Study Plan builder', detail: 'Plan your weeks and track progress.' },
];

export interface PlanRule {
  title: string;
  detail: string;
}

export const PLAN_RULES: readonly PlanRule[] = [
  {
    title: 'Upgrade any time',
    detail:
      'Move to a plan that includes everything you have and more, such as Learn to Advance. You pay the difference for the time left, and your end date stays the same.',
  },
  {
    title: 'Smaller or different plan at renewal',
    detail: `Moving to a smaller plan, or from Learn to Grow, opens ${CHANGE_WINDOW_DAYS} days before your current plan ends. The new plan starts when the current one ends.`,
  },
  {
    title: 'Manual renewal',
    detail: `Nothing renews or charges you automatically. To keep access, buy again. We plan to remind you ${REMINDER_WINDOW_DAYS.to} to ${REMINDER_WINDOW_DAYS.from} days before your access ends.`,
  },
  {
    title: 'Discounts',
    detail:
      'Student, regional and sale discounts are planned. They lower the price you pay and never change the name of your plan.',
  },
];

export const MOCK_INTERVIEW_FORMATS: readonly string[] = [
  'AI mock interview',
  'Mock interview with a human interviewer',
  'Company-style mock interview',
];

export interface PricingQuestion {
  question: string;
  answer: string;
}

export const PRICING_FAQ: readonly PricingQuestion[] = [
  {
    question: 'Which plan opens which lessons?',
    answer:
      'Learn opens the Learn catalog, Grow opens Grow, Advance opens both, and Complete adds Blaze. Blaze comes with Complete, Interview Sprint and sale plans. Open and Free with account lessons stay available on every plan.',
  },
  {
    question: 'Do you have sales?',
    answer:
      'A few times a year. Sale prices appear here only while a sale runs, next to the regular prices.',
  },
  {
    question: 'Does any plan renew automatically?',
    answer:
      'No. No plan, promo or pass renews or charges you automatically. When your access ends, you renew by buying again.',
  },
  {
    question: 'What happens to my study plans if my access ends?',
    answer:
      'Your study plans and progress stay in your account. Paid lessons lock until you buy again. Open and Free with account lessons stay available.',
  },
  {
    question: 'Is there student or regional pricing?',
    answer:
      'It is planned. Student and regional discounts will lower the price you pay; they are not separate plans. They are not available yet.',
  },
  {
    question: 'Can I buy a plan today?',
    answer:
      'Not yet. We are still connecting payments, so checkout is not available and nothing is charged. Buying will need a free account. You can start free now.',
  },
];
