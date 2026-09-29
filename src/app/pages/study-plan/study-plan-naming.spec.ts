import { defaultPlanName, planNameError } from './study-plan-naming';
describe('study-plan naming', () => {
  it('uses the exact UTC date, per-user number and configured hours/day count', () => {
    expect(defaultPlanName(3, new Date('2026-09-29T23:59:00Z'), 5, 90)).toBe(
      'Study plan #3_29092026_5X90',
    );
  });
  it('validates blank, overly long and control-character names while accepting a full replacement', () => {
    for (const name of ['  ', 'a'.repeat(161), 'a\nb']) expect(planNameError(name)).not.toBe('');
    expect(planNameError('My interview preparation 🌱')).toBe('');
  });
});
