import {
  PLANS,
  changeWindowOpens,
  durationLabel,
  isOfferComplete,
  planById,
  plansIncluding,
  planChange,
  priceLabel,
  renewalLabel,
  scopeLabel,
  spokenPrice,
  upgradesFrom,
} from './membership-plans';

describe('membership plan catalog (DLV-209)', () => {
  it('holds exactly the agreed plans, names and prices', () => {
    expect(
      PLANS.map((plan) => [plan.group, plan.name, priceLabel(plan), scopeLabel(plan.scope), durationLabel(plan.duration)]),
    ).toEqual([
      ['regular', 'Free', '$0', 'Open and Free with account lessons', 'Ongoing'],
      ['regular', 'Learn', '$69.99/year', 'Learn', '1 year'],
      ['regular', 'Grow', '$99.99/year', 'Grow', '1 year'],
      ['regular', 'Advance', '$144.99/year', 'Learn + Grow', '1 year'],
      ['regular', 'Complete', '$279.99/year', 'Learn + Grow + Blaze', '1 year'],
      ['regular', 'Course Pass', '$27.99 per course', '1–3 courses you choose', 'Not decided yet'],
      ['regular', 'Interview Sprint', '$99.99 one-time', 'Learn + Grow + Blaze', '100 days'],
      ['promo', 'Monthly Promo', '$27.99/month', 'Learn + Grow + Blaze', '1 month'],
      ['promo', 'Annual Promo', '$104.49/year', 'Learn + Grow + Blaze', '1 year'],
      ['promo', 'Interview Pass Promo', '$59.99 one-time', 'Learn + Grow + Blaze', '90 days'],
    ]);
  });

  it('never says Pro, never offers lifetime access and never renews automatically', () => {
    for (const plan of PLANS) {
      expect(plan.name).not.toMatch(/\bPro\b/);
      expect(durationLabel(plan.duration)).not.toMatch(/life/i);
      expect(plan.renewal).toBe(plan.id === 'free' ? 'not-applicable' : 'manual');
    }
    expect(renewalLabel('manual')).toBe('Manual renewal');
  });

  it('keeps offers with undecided terms off sale', () => {
    // Promo plans are complete offers now; they appear only while a sale runs (sale-preview.ts).
    expect(PLANS.filter((plan) => !isOfferComplete(plan)).map((plan) => [plan.id, plan.pending])).toEqual([
      ['course-pass', ['Duration']],
    ]);
  });

  it('reads prices aloud in words', () => {
    expect(spokenPrice(planById('learn')!)).toBe('$69.99 per year');
    expect(spokenPrice(planById('interview-sprint')!)).toBe('$99.99, one-time payment');
    expect(spokenPrice(planById('course-pass')!)).toBe('$27.99 per course');
  });

  it('allows upgrades any time and every other yearly change only at renewal', () => {
    expect(planChange('learn', 'advance')).toBe('upgrade');
    expect(planChange('grow', 'advance')).toBe('upgrade');
    expect(planChange('advance', 'complete')).toBe('upgrade');
    expect(planChange('learn', 'complete')).toBe('upgrade');
    expect(planChange('complete', 'advance')).toBe('at-renewal');
    expect(planChange('advance', 'grow')).toBe('at-renewal');
    // A different catalog is not an upgrade: Learn to Grow waits for the renewal window.
    expect(planChange('learn', 'grow')).toBe('at-renewal');
    expect(planChange('learn', 'learn')).toBeNull();
    expect(planChange('interview-sprint', 'complete')).toBeNull();
    expect(upgradesFrom('learn').map((plan) => plan.name)).toEqual(['Advance', 'Complete']);
    expect(upgradesFrom('complete')).toEqual([]);
  });

  it('opens the change window seven days before the end date', () => {
    expect(changeWindowOpens(new Date('2027-01-12T00:00:00Z')).toISOString()).toBe(
      '2027-01-05T00:00:00.000Z',
    );
  });

  it('names the yearly plans that include a catalog, with the lowest price', () => {
    expect(plansIncluding('learn')).toEqual({ names: ['Learn', 'Advance', 'Complete'], from: '$69.99/year' });
    expect(plansIncluding('grow')).toEqual({ names: ['Grow', 'Advance', 'Complete'], from: '$99.99/year' });
    expect(plansIncluding('blaze')).toEqual({ names: ['Complete'], from: '$279.99/year' });
  });
});
