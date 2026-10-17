import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ContentService } from './content.service';
import {
  APPROACH_CHOICE_KEY,
  StudyPlanApproaches,
  approachChoiceKey,
  approachCompletedIds,
  planApproachMembers,
  readApproachChoices,
  rememberApproachChoice,
} from './study-plan-approaches';

// Synthetic family: a grid count problem published as two equally optimal approaches.
const sibling = {
  problemId: 'grid-count-approach-2',
  approach: 2,
  title: 'Grid Count (Approach-2)',
  path: 'learn',
  courseId: 'sample-course',
  questionId: 'grid-count-approach-2-route',
};
const self = { problemId: 'grid-count', title: 'Grid Count (Approach-1)', route: ['/', 'learn', 'sample-course', 'grid-count-route'] };

describe('study plan approach families (DLV-962)', () => {
  const store = new Map<string, string>();
  let failWrites = false;
  let descriptor: PropertyDescriptor | undefined;
  beforeEach(() => {
    store.clear();
    failWrites = false;
    descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (failWrites) throw new Error('quota');
          store.set(key, value);
        },
      },
    });
  });
  afterEach(() => {
    if (descriptor) Object.defineProperty(window, 'localStorage', descriptor);
    else Reflect.deleteProperty(window, 'localStorage');
  });

  it('lists the plan problem and its siblings in approach order, numbers and routes only', () => {
    const members = planApproachMembers(self, {
      approach: 1,
      siblings: [{ ...sibling, approach: 3, problemId: 'grid-count-approach-3' }, sibling],
    });
    expect(members.map(({ problemId, approach }) => [problemId, approach])).toEqual([
      ['grid-count', 1],
      ['grid-count-approach-2', 2],
      ['grid-count-approach-3', 3],
    ]);
    expect(members[1].route).toEqual(['/', 'learn', 'sample-course', 'grid-count-approach-2-route']);
    expect(Object.keys(members[0]).sort()).toEqual(['approach', 'problemId', 'route', 'title']);
  });

  it('is empty for a problem without a family or with unusable siblings', () => {
    expect(planApproachMembers(self, null)).toEqual([]);
    expect(planApproachMembers(self, { approach: 1, siblings: [] })).toEqual([]);
    expect(planApproachMembers(self, { approach: 1, siblings: [{ ...sibling, questionId: '' }] })).toEqual([]);
    expect(planApproachMembers(self, { approach: 1, siblings: [{ ...sibling, problemId: 'grid-count' }] })).toEqual([]);
  });

  it('counts the plan problem as complete when any approach is complete', () => {
    const families = new Map([['grid-count', planApproachMembers(self, { approach: 1, siblings: [sibling] })]]);
    expect([...approachCompletedIds(new Set(['grid-count-approach-2']), families)]).toEqual([
      'grid-count-approach-2',
      'grid-count',
    ]);
    expect([...approachCompletedIds(new Set(['other']), families)]).toEqual(['other']);
    expect(approachCompletedIds(new Set(['grid-count']), families).has('grid-count')).toBe(true);
  });

  it('remembers the chosen approach per plan item and survives broken storage', () => {
    rememberApproachChoice('local:browser', 'item-1', 'grid-count-approach-2');
    expect(readApproachChoices()[approachChoiceKey('local:browser', 'item-1')]).toBe('grid-count-approach-2');
    expect(rememberApproachChoice('local:browser', 'item-1', 'grid-count-approach-2')).toEqual(readApproachChoices());
    store.set(APPROACH_CHOICE_KEY, '[1]');
    expect(readApproachChoices()).toEqual({});
    store.set(APPROACH_CHOICE_KEY, '{bad');
    expect(readApproachChoices()).toEqual({});
    store.set(APPROACH_CHOICE_KEY, JSON.stringify({ a: 'x', b: 3 }));
    expect(readApproachChoices()).toEqual({ a: 'x' });
    failWrites = true;
    expect(rememberApproachChoice('local:browser', 'item-2', 'grid-count')['local:browser|item-2']).toBe('grid-count');
  });

  function service(content: Record<string, unknown>) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: ContentService, useValue: content as never }] });
    return TestBed.inject(StudyPlanApproaches);
  }

  it('reads every family from the Hands-On index without loading problem details', async () => {
    const getDsaProblem = vi.fn();
    const approaches = service({
      getHandsOnDsaIndex: () =>
        of({ approachFamilies: { 'grid-count': { approach: 1, bestProblemId: 'grid-count', siblings: [sibling] } } } as never),
      getDsaProblem,
    });
    await approaches.resolve([self, { problemId: 'plain', title: 'Plain', route: ['/', 'learn', 'x', 'plain'] }], []);
    expect([...approaches.families().keys()]).toEqual(['grid-count']);
    expect(getDsaProblem).not.toHaveBeenCalled();
    await approaches.resolve([self]);
    expect(approaches.families().size).toBe(1);
    approaches.choose('local:browser', 'item-1', 'grid-count-approach-2');
    expect(approaches.chosen('local:browser', 'item-1')).toBe('grid-count-approach-2');
  });

  it('falls back to the visible problems details when the index predates families', async () => {
    const getDsaProblem = vi.fn((id: string) =>
      id === 'grid-count'
        ? of({ approachFamily: { approach: 1, bestProblemId: 'grid-count', siblings: [sibling] } } as never)
        : throwError(() => new Error('missing')),
    );
    const approaches = service({ getHandsOnDsaIndex: () => of({ groups: [] } as never), getDsaProblem });
    const hidden = { problemId: 'hidden', title: 'Hidden', route: ['/', 'learn', 'x', 'hidden'] };
    const broken = { problemId: 'broken', title: 'Broken', route: ['/', 'learn', 'x', 'broken'] };
    await approaches.resolve([self, hidden, broken], [self, broken]);
    expect(getDsaProblem.mock.calls.map(([id]) => id)).toEqual(['grid-count', 'broken']);
    expect(approaches.families().get('grid-count')?.map(({ approach }) => approach)).toEqual([1, 2]);
  });

  it('treats an unavailable index like an old one', async () => {
    const approaches = service({
      getHandsOnDsaIndex: () => throwError(() => new Error('offline')),
      getDsaProblem: () => of({} as never),
    });
    await approaches.resolve([self]);
    expect(approaches.families().size).toBe(0);
  });
});
