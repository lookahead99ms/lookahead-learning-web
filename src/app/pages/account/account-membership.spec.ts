import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AccountAccessRecords } from './account-access-records';
import { AccessRecord, accessRecordView, accountMembership, accountRoleLabel, membershipName, joinPaths } from './account-membership';

/** Purchase records in the proposed DLV-209 shape; the server sends none today. */
function record(overrides: Partial<AccessRecord>): AccessRecord {
  return {
    id: 'r1',
    planId: 'learn',
    courses: [],
    startsAt: '2026-01-12T00:00:00Z',
    endsAt: '2027-01-12T00:00:00Z',
    status: 'active',
    pricePaidCents: 6999,
    discount: null,
    ...overrides,
  };
}

describe('account membership', () => {
  it('reads Author, course access or Free account from server grants only', () => {
    expect(accountMembership({ topicGrants: [], authorPreview: true }).level).toBe('Author');
    expect(accountMembership({ topicGrants: [] })).toEqual({
      level: 'Free account',
      courseCount: 0,
      paths: [],
      pathCourses: {},
      records: [],
    });
    expect(
      accountMembership({
        topicGrants: ['look-ahead:design-systems', 'learn:core-java', 'learn:core-java', 'blaze:x'],
      }),
    ).toEqual({
      level: 'Course access',
      courseCount: 3,
      paths: ['Learn', 'Blaze'],
      pathCourses: { Learn: 1, Blaze: 2 },
      records: [],
    });
  });

  it('ignores grants that are not path-qualified courses', () => {
    expect(accountMembership({ topicGrants: ['everything'] }).level).toBe('Free account');
  });

  it('keeps a paid membership apart from a Course Pass and from expired plans', () => {
    expect(accountMembership({ topicGrants: [] }, [record({})]).level).toBe('Paid membership');
    expect(
      accountMembership({ topicGrants: [] }, [record({ planId: 'course-pass', courses: [{ id: 'learn:sql', title: 'SQL' }] })]).level,
    ).toBe('Course access');
    expect(accountMembership({ topicGrants: [] }, [record({ status: 'expired' })]).level).toBe(
      'Free account',
    );
  });

  it('shows name, scope, length, price paid, discount and dates with manual renewal', () => {
    expect(
      accessRecordView(
        record({
          planId: 'advance',
          pricePaidCents: 12999,
          discount: { label: 'Student discount', amountCents: 1500 },
        }),
      ),
    ).toEqual({
      id: 'r1',
      name: 'Advance',
      includes: 'Learn + Grow',
      duration: '1 year',
      paid: '$129.99',
      discount: 'Student discount −$15.00',
      started: '12 Jan 2026',
      ends: 'Expires 12 Jan 2027 · Manual renewal',
      status: 'active',
      canRenew: true,
      upgrades: ['Complete'],
      changeFrom: 'Smaller or different plan from 5 Jan 2027',
    });
  });

  it('describes both interview passes with an expiry and manual renewal, and no plan changes', () => {
    for (const [planId, name] of [
      ['interview-sprint', 'Interview Sprint'],
      ['interview-pass-promo', 'Interview Pass Promo'],
    ] as const) {
      const view = accessRecordView(record({ planId, endsAt: '2026-04-22T00:00:00Z' }))!;
      expect(view.name).toBe(name);
      expect(view.ends).toBe('Expires 22 Apr 2026 · Manual renewal');
      expect(view.upgrades).toEqual([]);
      expect(view.changeFrom).toBeNull();
    }
  });

  it('lists Course Pass courses and handles expired and scheduled purchases', () => {
    expect(
      accessRecordView(
        record({
          planId: 'course-pass',
          courses: [
            { id: 'learn:core-java', title: 'Java Foundations' },
            { id: 'grow:api-design', title: 'API Design' },
          ],
        }),
      )!
        .includes,
    ).toBe('Java Foundations (Learn), API Design (Grow)');
    const expired = accessRecordView(record({ status: 'expired' }))!;
    expect(expired.ends).toBe('Expired 12 Jan 2027 · Manual renewal');
    expect(expired.canRenew).toBe(true);
    expect(expired.upgrades).toEqual([]);
    const scheduled = accessRecordView(record({ status: 'scheduled', planId: 'grow' }))!;
    expect(scheduled.ends).toBe('Starts 12 Jan 2026');
    expect(scheduled.canRenew).toBe(false);
    expect(accessRecordView(record({ planId: 'free' }))).toBeNull();
  });

  it('joins path names for a sentence', () => {
    expect(joinPaths([])).toBe('');
    expect(joinPaths(['Learn'])).toBe('Learn');
    expect(joinPaths(['Learn', 'Grow', 'Blaze'])).toBe('Learn, Grow and Blaze');
  });
});

describe('AccountAccessRecords', () => {
  it('renders each purchase with Renew and Upgrade leading to the plans page, never recurring billing', () => {
    TestBed.configureTestingModule({ imports: [AccountAccessRecords], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(AccountAccessRecords);
    fixture.componentRef.setInput('records', [
      accessRecordView(record({ discount: { label: 'Regional discount', amountCents: 2000 }, pricePaidCents: 4999 }))!,
      accessRecordView(record({ id: 'r2', planId: 'interview-sprint', endsAt: '2026-04-22T00:00:00Z' }))!,
    ]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const rows = [...root.querySelectorAll('.access-record')];
    expect(rows.map((row) => row.querySelector('h3')?.textContent?.trim())).toEqual([
      'Learn',
      'Interview Sprint',
    ]);
    const text = (row: Element) => row.textContent!.replace(/\s+/g, ' ');
    expect(text(rows[0])).toContain('Expires 12 Jan 2027 · Manual renewal');
    expect(text(rows[0])).toContain('$49.99 (Regional discount −$20.00)');
    expect(text(rows[1])).toContain('Expires 22 Apr 2026 · Manual renewal');
    expect(
      [...rows[0].querySelectorAll('a')].map((link) => [link.textContent?.trim(), link.getAttribute('href')]),
    ).toEqual([
      ['Renew', '/pricing'],
      ['Upgrade to Advance or Complete', '/pricing'],
    ]);
    expect(root.textContent).not.toMatch(/auto-?renew|renews (each|every)|recurring|subscription/i);
  });
});


describe('managed-account display semantics', () => {
  it('uses learner and staff role labels instead of internal user codes', () => {
    expect(accountRoleLabel('user')).toBe('Learner');
    expect(accountRoleLabel()).toBe('Learner');
    expect(accountRoleLabel('co-author')).toBe('Co-author');
    expect(accountRoleLabel('owner')).toBe('Author (owner)');
  });
  it('keeps superseded purchases as history without future-expiry or renewal claims', () => {
    const superseded = record({ status: 'expired', supersededAt: '2026-10-16T01:00:00Z' });
    expect(accessRecordView(superseded)).toMatchObject({ ends: 'Replaced 16 Oct 2026 · History retained', canRenew: false, upgrades: [] });
    expect(accountMembership({ topicGrants: [] }, [{ ...superseded, status: 'active' }]).level).toBe('Free account');
  });
});

describe('membership hero name', () => {
  const account = { topicGrants: [] };
  it('names regular memberships and combines concurrent purchases', () => {
    for (const [planId, name] of [['learn', 'Learn'], ['grow', 'Grow'], ['advance', 'Advance'], ['complete', 'Complete']] as const) {
      expect(membershipName(account, [record({ planId })])).toBe(name);
    }
    expect(membershipName(account, [record({}), record({ planId: 'grow' }), record({})])).toBe('Learn + Grow');
  });
  it('keeps Promo as a suffix and names selected courses', () => {
    for (const [planId, name] of [['monthly-promo', 'Monthly Promo'], ['annual-promo', 'Annual Promo'], ['interview-pass-promo', 'Interview Pass Promo']] as const) {
      expect(membershipName(account, [record({ planId })])).toBe(name);
    }
    expect(membershipName(account, [record({ planId: 'course-pass', courses: [{id: 'learn:sql', title: 'SQL'}] })])).toBe('SQL');
  });
  it('excludes future, expired and replaced purchases', () => {
    expect(membershipName(account, [record({status:'scheduled'}), record({status:'expired'}), record({supersededAt:'2026-10-16T00:00:00Z'})])).toBe('Free account');
    expect(membershipName({...account, authorPreview: true}, [record({})])).toBe('Author');
  });
});
