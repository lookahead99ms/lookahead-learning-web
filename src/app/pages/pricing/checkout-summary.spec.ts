import { PLANS } from '../../content/membership-plans';
import type { AccessRecord } from '../account/account-membership';
import { CHECKOUT_STEPS, checkoutDay, orderSummary, planName } from './checkout-summary';
import { YEARLY_IDS, pricingCards } from './pricing-plans';

const NOW = new Date('2026-11-04T12:00:00Z');
const card = (id: string) => pricingCards(PLANS, [id as (typeof YEARLY_IDS)[number]])[0];
const learnRecord: AccessRecord = {
  id: 'r1',
  planId: 'learn',
  courses: [],
  startsAt: '2026-05-04T00:00:00Z',
  endsAt: '2027-05-04T00:00:00Z',
  status: 'active',
  pricePaidCents: 6999,
  discount: null,
};

describe('checkout order summary (DLV-969)', () => {
  it('has three steps: Plan, Review, Payment', () => {
    expect(CHECKOUT_STEPS.map((step) => step.label)).toEqual(['Plan', 'Review', 'Payment']);
  });

  it('reads dates as "4 Nov 2026" in UTC, and nothing for a missing or unreadable one', () => {
    expect(checkoutDay('2026-11-04T23:30:00Z')).toBe('4 Nov 2026');
    expect(checkoutDay('')).toBeNull();
    expect(checkoutDay(null)).toBeNull();
    expect(checkoutDay('not a date')).toBeNull();
  });

  it('names a plan from the catalog given, the built-in catalog, then its id', () => {
    expect(planName('learn', [{ ...PLANS[1], id: 'learn', name: 'Learn (server)' }])).toBe('Learn (server)');
    expect(planName('grow', [])).toBe('Grow');
    expect(planName('retired-plan', [])).toBe('retired-plan');
  });

  it('stands in the list price and the plan length until the quote arrives', () => {
    const order = orderSummary(card('complete'), null, null, PLANS, NOW);
    expect(order).toMatchObject({
      name: 'Complete',
      includes: 'Learn + Grow + Blaze',
      catalogs: ['learn', 'grow', 'blaze'],
      term: '1 year of access',
      listPrice: '$279.99',
      due: '$279.99',
      period: '/year',
      quoted: false,
      upgrade: null,
      startsLater: null,
    });
  });

  it('uses today as the start when the quote sends only an end date', () => {
    const order = orderSummary(card('learn'), { priceCents: 6999, endsAt: '2027-11-04T00:00:00Z' }, null, PLANS, NOW);
    expect(order.term).toBe('4 Nov 2026 – 4 Nov 2027');
    expect(order.quoted).toBe(true);
  });

  it('shows an upgrade as the full price less the credit for the time left, keeping the end date', () => {
    const order = orderSummary(
      card('advance'),
      { priceCents: 3999, startsAt: NOW.toISOString(), endsAt: learnRecord.endsAt! },
      learnRecord,
      PLANS,
      NOW,
    );
    expect(order.upgrade).toEqual({ from: 'Learn', credit: '−$105.00', ends: '4 May 2027' });
    expect(order.due).toBe('$39.99');
    expect(order.startsLater).toBeNull();
  });

  it('shows a change or renewal that starts when the current plan ends, with no credit', () => {
    const order = orderSummary(
      card('grow'),
      { priceCents: 9999, startsAt: learnRecord.endsAt!, endsAt: '2028-05-04T00:00:00Z' },
      learnRecord,
      PLANS,
      NOW,
    );
    expect(order.upgrade).toBeNull();
    expect(order.startsLater).toBe('Starts 4 May 2027, when your Learn plan ends.');
    expect(order.term).toBe('4 May 2027 – 4 May 2028');
    const fresh = orderSummary(card('grow'), { priceCents: 9999, startsAt: '2027-01-01T00:00:00Z', endsAt: '2028-01-01T00:00:00Z' }, null, PLANS, NOW);
    expect(fresh.startsLater).toBe('Starts 1 Jan 2027.');
  });

  it('lists no catalogs for a course pass, so the summary names what it includes instead', () => {
    const pass = pricingCards(PLANS, ['course-pass'])[0];
    const order = orderSummary(pass, null, null, PLANS, NOW);
    expect(order.catalogs).toEqual([]);
    expect(order.includes).toBe('1–3 courses you choose');
  });
});
