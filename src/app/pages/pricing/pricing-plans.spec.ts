import { planById } from '../../content/membership-plans';
import { CardRecord, PASS_IDS, YEARLY_IDS, cardState, pricingCards } from './pricing-plans';

const plan = (id: string) => planById(id)!;
const learnActive = (endsAt: string): CardRecord[] => [{ planId: 'learn', status: 'active', endsAt }];

describe('pricing cards', () => {
  it('builds yearly and pass cards in order, comparing sale plans with their regular plan', () => {
    const plans = YEARLY_IDS.concat(PASS_IDS).map(plan);
    expect(pricingCards(plans, YEARLY_IDS).map((card) => card.plan.id)).toEqual(['learn', 'grow', 'advance', 'complete']);
    const promo = pricingCards([plan('annual-promo'), plan('complete')], ['annual-promo'])[0];
    expect(promo.comparedWith).toBe('Complete is $279.99/year');
    expect(pricingCards([plan('course-pass')], ['course-pass'])[0].pendingNote).toBe('Not decided yet: duration.');
  });
});

describe('cardState (DLV-209, what each viewer sees)', () => {
  const now = new Date('2027-01-01T00:00:00Z');

  it('lets staff and visitors choose every plan', () => {
    for (const id of ['learn', 'complete', 'interview-sprint', 'annual-promo']) {
      expect(cardState(plan(id), learnActive('2027-06-01T00:00:00Z'), { staff: true, now })).toEqual({
        kind: 'choose',
        label: `Choose ${plan(id).name}`,
      });
      expect(cardState(plan(id), [], { staff: false, now }).kind).toBe('choose');
    }
  });

  it('marks the learner’s own plan with its end date', () => {
    expect(cardState(plan('learn'), learnActive('2027-06-01T00:00:00Z'), { staff: false, now })).toEqual({
      kind: 'current',
      ends: '1 Jun 2027',
    });
    expect(cardState(plan('learn'), [{ planId: 'learn', status: 'active', endsAt: null }], { staff: false, now })).toEqual({
      kind: 'current',
      ends: null,
    });
  });

  it('offers upgrades any time', () => {
    expect(cardState(plan('advance'), learnActive('2027-06-01T00:00:00Z'), { staff: false, now })).toEqual({
      kind: 'upgrade',
      label: 'Upgrade to Advance',
    });
    expect(cardState(plan('complete'), learnActive('2027-06-01T00:00:00Z'), { staff: false, now }).kind).toBe('upgrade');
  });

  it('holds smaller or different plans until the last 7 days, then offers them for next year', () => {
    expect(cardState(plan('grow'), learnActive('2027-06-01T00:00:00Z'), { staff: false, now })).toEqual({
      kind: 'later',
      from: '25 May 2027',
    });
    expect(cardState(plan('grow'), learnActive('2027-01-05T00:00:00Z'), { staff: false, now })).toEqual({
      kind: 'choose',
      label: 'Choose Grow for next year',
    });
    expect(cardState(plan('grow'), [{ planId: 'learn', status: 'active', endsAt: null }], { staff: false, now }).kind).toBe('choose');
  });

  it('ignores expired plans and keeps passes and sale plans choosable', () => {
    expect(cardState(plan('grow'), [{ planId: 'learn', status: 'expired', endsAt: '2026-01-01T00:00:00Z' }], { staff: false, now }).kind).toBe('choose');
    expect(cardState(plan('interview-sprint'), learnActive('2027-06-01T00:00:00Z'), { staff: false, now }).kind).toBe('choose');
    expect(cardState(plan('annual-promo'), learnActive('2027-06-01T00:00:00Z'), { staff: false, now }).kind).toBe('choose');
  });

  it('uses the current date when none is given', () => {
    expect(cardState(plan('grow'), learnActive('2000-01-01T00:00:00Z'), { staff: false }).kind).toBe('choose');
  });
});
