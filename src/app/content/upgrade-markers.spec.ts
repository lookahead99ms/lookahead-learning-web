import {
  UPGRADE_MARKERS,
  approvedLine,
  canResetOf,
  resetReserved,
  switcherUpgradeLine,
  switcherUpgradeOf,
  upgradeLine,
  upgradeMarkerOf,
} from './upgrade-markers';

const marker = (by: Record<string, unknown>, approvedBy: Record<string, unknown> | null = null) => ({
  upgradedBy: { ...by, approvedBy, plan: { code: 'grow', name: 'Grow' }, kind: 'upgrade', approvedAt: '2026-11-04T10:30:00Z' },
});

/** DLV-969 (owner, 2026-11-04): the "upgraded by" marker on DEV test accounts. */
describe('Upgrade markers', () => {
  it('keeps every Domain name in one place', () => {
    expect(UPGRADE_MARKERS).toEqual({ rowField: 'upgradedBy', canResetField: 'canReset', resetReservedCode: 'RESET_RESERVED' });
  });

  it('says who upgraded it: You, the label, or for the owner the name with its label', () => {
    const self = upgradeMarkerOf(marker({ self: true, label: 'Owner' }))!;
    expect(upgradeLine(self, true)).toBe('Upgraded by You · Grow · 4 Nov');
    const admin = upgradeMarkerOf(marker({ self: false, label: 'Admin 2', name: 'Priya Rao' }))!;
    expect(upgradeLine(admin, false)).toBe('Upgraded by Admin 2 · Grow · 4 Nov');
    expect(upgradeLine(admin, true)).toBe('Upgraded by Priya Rao (Admin 2) · Grow · 4 Nov');
    // A name without a label, an unknown sender and a missing date.
    const nameOnly = upgradeMarkerOf({ upgradedBy: { self: false, label: '', name: 'Priya Rao', plan: 'Grow', approvedAt: 'soon' } });
    expect(nameOnly).toBeNull();
    const bare = upgradeMarkerOf({ upgradedBy: { self: false, label: 'Admin 2', plan: 'Grow', approvedAt: 'not a date' } })!;
    expect(upgradeLine(bare, true)).toBe('Upgraded by Admin 2 · Grow');
    expect(upgradeMarkerOf({ upgradedBy: { self: false, label: 'Admin 2', plan: { code: 'learn' } } })!.plan).toBe('learn');
  });

  it('adds who approved it only when someone else did', () => {
    const own = upgradeMarkerOf(marker({ self: false, label: 'Admin 2' }, { self: false, label: 'Admin 2' }))!;
    expect(approvedLine(own, false)).toBeNull();
    const byOwner = upgradeMarkerOf(marker({ self: false, label: 'Admin 2', name: 'Priya Rao' }, { self: true, label: 'Owner' }))!;
    expect(approvedLine(byOwner, true)).toBe('approved by you');
    const byAdmin = upgradeMarkerOf(marker({ self: true, label: 'Owner' }, { self: false, label: 'Admin 3', name: 'Sam Lee' }))!;
    expect(approvedLine(byAdmin, false)).toBe('approved by Admin 3');
    expect(approvedLine(byAdmin, true)).toBe('approved by Sam Lee (Admin 3)');
    expect(approvedLine(upgradeMarkerOf(marker({ self: true, label: 'Owner' }))!, true)).toBeNull();
    expect(approvedLine({ ...byAdmin, approvedBy: { self: false, label: '', name: null } }, false)).toBe('approved by someone');
  });

  it('reads nothing from a row without a marker or with a shape it does not know', () => {
    for (const row of [{}, { upgradedBy: null }, { upgradedBy: 'Admin 2' }, { upgradedBy: { self: false, label: '' } }]) {
      expect(upgradeMarkerOf(row)).toBeNull();
      expect(switcherUpgradeOf(row)).toBeNull();
    }
  });

  it('gives the switcher its short line', () => {
    expect(switcherUpgradeLine(switcherUpgradeOf({ upgradedBy: { self: true, label: 'Owner', plan: 'Grow', approvedAt: '' } })!)).toBe(
      'Upgraded by you · Grow',
    );
    expect(switcherUpgradeLine(switcherUpgradeOf({ upgradedBy: { self: false, label: 'Admin 2', plan: 'Grow' } })!)).toBe(
      'Upgraded by Admin 2 · Grow',
    );
    expect(switcherUpgradeLine({ self: false, label: 'Admin 2', plan: '', approvedAt: '' })).toBe('Upgraded by Admin 2');
  });

  it('reads canReset only when sent, and knows the RESET_RESERVED refusal', () => {
    expect(canResetOf({ canReset: true })).toBe(true);
    expect(canResetOf({ canReset: false })).toBe(false);
    expect(canResetOf({})).toBeNull();
    expect(canResetOf({ canReset: 'yes' })).toBeNull();
    expect(resetReserved({ status: 403, code: 'RESET_RESERVED' })).toBe(true);
    expect(resetReserved({ status: 403, code: 'PURCHASE_APPROVAL_FORBIDDEN' })).toBe(false);
    expect(resetReserved({ status: 409, code: 'RESET_RESERVED' })).toBe(false);
    expect(resetReserved(null)).toBe(false);
  });
});
