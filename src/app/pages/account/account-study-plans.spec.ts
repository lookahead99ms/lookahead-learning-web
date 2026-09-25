import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AccountStudyPlans } from './account-study-plans';
import { ACCOUNT_FETCH, PlanSummary, StudyPlanAccount } from '../study-plan/study-plan-account';

const plan: PlanSummary = {
  planId: 'owned-plan',
  goal: 'Prepare Java',
  revision: 4,
  updatedAt: '2026-09-18T12:00:00Z',
  card: {
    schemaVersion: 'plan-card/v1',
    metadataStatus: 'available',
    selectedTopicIds: ['learn:core-java'],
    durationDays: 14,
    configuredDailyMinutes: 45,
    completedSessionCount: 2,
    totalSessionCount: 8,
    nextScheduledActivity: null,
    lifecycleState: null,
    reservation: null,
  },
};

describe('Manage account learning summary', () => {
  let store: StudyPlanAccount;
  let transport: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    transport = vi.fn();
    TestBed.configureTestingModule({
      imports: [AccountStudyPlans],
      providers: [provideRouter([]), { provide: ACCOUNT_FETCH, useValue: transport }],
    });
    store = TestBed.inject(StudyPlanAccount);
  });
  function render() {
    const fixture = TestBed.createComponent(AccountStudyPlans);
    fixture.detectChanges();
    return fixture;
  }
  it.each(['idle', 'loading', 'error'] as const)(
    'does not describe an empty account while the list is %s',
    (state) => {
      store.planSummariesState.set(state);
      const element: HTMLElement = render().nativeElement;
      expect(element.textContent).not.toContain('No saved study plans');
      expect(element.querySelector('[role="status"]')).not.toBeNull();
      expect(transport).not.toHaveBeenCalled();
    },
  );
  it('shows an empty state only after a successful list load without creating a plan', () => {
    store.planSummariesState.set('ready');
    const element: HTMLElement = render().nativeElement;
    expect(element.textContent).toContain('No saved study plans yet');
    expect(element.querySelectorAll('li')).toHaveLength(0);

    expect(store.active()).toBeNull();
    expect(transport).not.toHaveBeenCalled();
  });
  it('renders authoritative progress and schedule with a native link to the exact owned plan', () => {
    store.plans.set([structuredClone(plan)]);
    store.planSummariesState.set('ready');
    const element: HTMLElement = render().nativeElement;
    expect(element.textContent).toContain('1 saved study plan');
    expect(element.querySelector('h3')?.textContent).toBe('Prepare Java');
    expect(element.querySelector('.plan-progress')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '2 of 8 sessions completed',
    );
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/study-plan?plan=owned-plan');
    expect(element.querySelector('a')?.getAttribute('aria-label')).toBe('Open plan: Prepare Java');
    expect(element.querySelector('time')?.getAttribute('datetime')).toBe(plan.updatedAt);
    expect(element.textContent).toContain('14 days');
    expect(element.textContent).toContain('45 min');
    expect(element.textContent).not.toMatch(/Active|Lifecycle/);
    expect(store.active()).toBeNull();
    expect(transport).not.toHaveBeenCalled();
  });
  it('preserves multiple plans and does not infer progress from old dates or unavailable metadata', () => {
    store.planSummariesState.set('ready');
    store.plans.set([
      plan,
      {
        ...plan,
        planId: 'second & owned',
        goal: 'Prepare architecture',
        updatedAt: '2020-01-01T00:00:00Z',
        card: { ...plan.card!, metadataStatus: 'unavailable' },
      },
      { ...plan, planId: 'legacy', goal: 'Legacy plan', card: undefined },
    ]);
    const element: HTMLElement = render().nativeElement;
    expect(element.textContent).toContain('3 saved study plans');
    expect(element.querySelectorAll('li')).toHaveLength(3);
    expect(element.querySelectorAll('.navigation-card [data-card-primary]')).toHaveLength(3);
    expect(element.querySelector('.navigation-card a a')).toBeNull();
    expect(element.querySelectorAll('.unavailable')).toHaveLength(2);
    expect(element.querySelectorAll('a')[1].getAttribute('href')).toBe(
      '/study-plan?plan=second%20%26%20owned',
    );
    expect(element.querySelectorAll('li')[1].querySelectorAll('dt')).toHaveLength(1);
    expect(element.querySelectorAll('li')[1].textContent).not.toContain('completed');
    expect(store.active()).toBeNull();
  });
  it.each([
    [-1, 8],
    [9, 8],
    [0.5, 8],
    [0, NaN],
    [null, 8],
    [0, null],
  ])('does not invent progress for invalid counts %s / %s', (completed, total) => {
    store.plans.set([
      {
        ...plan,
        card: { ...plan.card!, completedSessionCount: completed, totalSessionCount: total },
      },
    ]);
    const element: HTMLElement = render().nativeElement;
    expect(element.querySelector('.unavailable')?.textContent).toContain('not available');
    expect(element.textContent).not.toContain('sessions completed');
  });
  it('preserves an explicit zero total and omits invalid schedule/date fields', () => {
    store.plans.set([
      {
        ...plan,
        updatedAt: 'not-a-date',
        card: {
          ...plan.card!,
          completedSessionCount: 0,
          totalSessionCount: 0,
          durationDays: -1,
          configuredDailyMinutes: NaN,
        },
      },
    ]);
    const element: HTMLElement = render().nativeElement;
    expect(element.textContent?.replace(/\s+/g, ' ')).toContain('0 of 0 sessions completed');
    expect(element.querySelector('dl')).toBeNull();
    expect(element.textContent).not.toContain('100%');
  });
  it('keeps previously loaded details clearly labelled after a failed refresh', () => {
    store.plans.set([plan]);
    store.planSummariesState.set('error');
    const element: HTMLElement = render().nativeElement;
    expect(element.textContent).toContain('Showing the last loaded details');
    expect(element.querySelectorAll('li')).toHaveLength(1);
  });
});
