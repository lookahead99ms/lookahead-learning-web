import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { StudyPlanReaderNavigation } from './study-plan-reader-navigation';
import { StudyPlanAccount } from '../pages/study-plan/study-plan-account';

const assignment = (id: string, kind: 'new' | 'review' = 'new') => ({
  id,
  kind,
  title: id,
  minutes: 15,
  route: ['/learn', 'course', id],
  sourceContentId: kind === 'review' ? 'original' : id,
});
const saved = () => ({
  schemaVersion: 'study-plan-local/v1',
  completedIds: ['original'],
  sessionOutcomes: {},
  snapshot: {
    config: { days: 2 },
    focusedDailyHours: 1,
    days: [
      { day: 1, assignments: [assignment('original')] },
      { day: 2, assignments: [assignment('current'), assignment('recall', 'review')] },
    ],
  },
});
describe('Study Plan reader navigation', () => {
  let storage: PropertyDescriptor | undefined;
  const expired = signal(false);
  beforeEach(async () => {
    storage = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: { getItem: () => JSON.stringify(saved()) },
    });
    expired.set(false);
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'learn/course/:activity', component: StudyPlanReaderNavigation }]),
        {
          provide: StudyPlanAccount,
          useValue: {
            account: signal(null),
            sessionExpired: expired,
            initialize: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compileComponents();
  });
  afterEach(() => {
    if (storage) Object.defineProperty(window, 'localStorage', storage);
  });
  it('returns to the selected day and follows the eligible plan sequence', async () => {
    const harness = await RouterTestingHarness.create();
    const nav = await harness.navigateByUrl(
      '/learn/course/recall?plan=browser&day=2&activity=recall',
      StudyPlanReaderNavigation,
    );
    await TestBed.inject(StudyPlanAccount).initialize();
    harness.detectChanges();
    expect(nav.valid()).toBe(true);
    expect(nav.next()?.id).toBe('current');
    const links = Array.from(harness.routeNativeElement!.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    );
    expect(links[0]).toBe('/study-plan?day=2&plan=browser&activity=recall');
    expect(links[1]).toContain('/learn/course/current?day=2&plan=browser&activity=current');
    expired.set(true);
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('nav')).toBeNull();
  });
  it('rejects a mismatched route, invalid day and changed plan context', async () => {
    const harness = await RouterTestingHarness.create();
    for (const url of [
      '/learn/course/current?plan=browser&day=2&activity=recall',
      '/learn/course/recall?plan=browser&day=99&activity=recall',
      '/learn/course/recall?plan=another&day=2&activity=recall',
    ]) {
      const nav = await harness.navigateByUrl(url, StudyPlanReaderNavigation);
      await TestBed.inject(StudyPlanAccount).initialize();
      harness.detectChanges();
      expect(nav.valid()).toBe(false);
    }
  });
  it('uses pinned canonical problem order across days and retains plan context', async () => {
    const plan = saved();
    const dsa = (id: string) => ({ ...assignment(id), contentType: 'dsa-problem' });
    plan.snapshot.days = [
      { day: 1, assignments: [dsa('last-ranked'), dsa('current')] },
      {
        day: 2,
        assignments: [
          dsa('first-ranked'),
          { ...dsa('recall'), sourceContentId: 'last-ranked', kind: 'review' },
        ],
      },
    ];
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: { getItem: () => JSON.stringify(plan) },
    });
    const harness = await RouterTestingHarness.create();
    const nav = await harness.navigateByUrl(
      '/learn/course/current?plan=browser&day=1&activity=current',
      StudyPlanReaderNavigation,
    );
    await TestBed.inject(StudyPlanAccount).initialize();
    harness.detectChanges();
    expect(nav.problemNeighbors()?.previous?.title).toBe('last-ranked');
    expect(nav.problemNeighbors()?.next?.title).toBe('first-ranked');
    expect(nav.problemNeighbors()?.next?.query).toEqual({
      plan: 'browser',
      day: '2',
      activity: 'first-ranked',
    });
    await harness.navigateByUrl(
      '/learn/course/first-ranked?plan=browser&day=2&activity=first-ranked',
      StudyPlanReaderNavigation,
    );
    expect(nav.problemNeighbors()?.next).toBeUndefined();
    await harness.navigateByUrl(
      '/learn/course/last-ranked?plan=browser&day=1&activity=last-ranked',
      StudyPlanReaderNavigation,
    );
    expect(nav.problemNeighbors()?.previous).toBeUndefined();
    await harness.navigateByUrl('/learn/course/current', StudyPlanReaderNavigation);
    expect(nav.problemNeighbors()).toBeNull();
  });
  it('ignores corrupt local plan data instead of breaking the reader', async () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: { getItem: () => JSON.stringify({ ...saved(), snapshot: { days: [] } }) },
    });
    const harness = await RouterTestingHarness.create();
    const nav = await harness.navigateByUrl(
      '/learn/course/recall?plan=browser&day=2&activity=recall',
      StudyPlanReaderNavigation,
    );
    await TestBed.inject(StudyPlanAccount).initialize();
    harness.detectChanges();
    expect(nav.valid()).toBe(false);
  });
});
