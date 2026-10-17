import { Location } from '@angular/common';
import { SpyLocation, provideLocationMocks } from '@angular/common/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DefaultUrlSerializer, provideRouter, Route, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import {
  RETIRED_COURSE_IDS,
  RetiredCourseIds,
  retiredContentRedirect,
  retiredContentTarget,
} from './retired-content-routes';
import { patternContextToken } from './pattern-context';

const serializer = new DefaultUrlSerializer();
const target = (url: string) => {
  const tree = retiredContentTarget(serializer.parse(url));
  return tree ? serializer.serialize(tree) : null;
};

@Component({ template: 'Page' })
class Page {}

describe('retired content routes', () => {
  it.each([
    ['algorithmic-difference-arrays', 'algorithmic-prefix-state'],
    ['algorithmic-monotonic-queue', 'algorithmic-monotonic-stack'],
    ['algorithmic-list-reversal', 'algorithmic-linked-list-patterns'],
    ['algorithmic-divide-and-conquer', 'algorithmic-recursion-recurrence'],
    ['algorithmic-two-dimensional-dp', 'algorithmic-dp-state-transition-optimization'],
  ])('sends the retired %s lesson to %s', (retired, current) => {
    expect(target(`/learn/algorithmic-patterns/${retired}`)).toBe(
      `/learn/algorithmic-patterns/${current}`,
    );
  });

  it('keeps query parameters, repeated values and the fragment', () => {
    expect(
      target('/learn/algorithmic-patterns/algorithmic-monotonic-queue?mode=surprise&tag=a&tag=b#walkthrough'),
    ).toBe('/learn/algorithmic-patterns/algorithmic-monotonic-stack?mode=surprise&tag=a&tag=b#walkthrough');
  });

  it.each([
    ['theory-difference-arrays', 'theory-prefix-state'],
    ['theory-two-dimensional-dp-pattern', 'theory-dp-state-transition-optimization'],
    ['practice-divide-and-conquer', 'practice-recursion-recurrence'],
    ['practice-two-dimensional-dp-pattern', 'practice-dp-state-transition-optimization'],
  ])('sends the retired %s module to %s', (retired, current) => {
    expect(target(`/learn/algorithmic-patterns/module/${retired}?view=list`)).toBe(
      `/learn/algorithmic-patterns/module/${current}?view=list`,
    );
  });

  it('moves a retired unit anchor on the course map', () => {
    expect(target('/learn/algorithmic-patterns#unit-divide-conquer')).toBe(
      '/learn/algorithmic-patterns#unit-recursion',
    );
    expect(target('/learn/algorithmic-patterns#unit-two-pointers')).toBeNull();
  });

  it('moves a retired Hands-On DSA group filter and keeps the other filters', () => {
    // DLV-962: the replacement is written as its opaque context id.
    const dynamicProgramming = patternContextToken('algorithmic-patterns:dynamic-programming');
    const linkedLists = patternContextToken('algorithmic-patterns:linked-lists');
    expect(
      target('/learn/hands-on-dsa?pattern=algorithmic-patterns:two-dimensional-dp&difficulty=Advanced&page=2'),
    ).toBe(`/learn/hands-on-dsa?pattern=${dynamicProgramming}&difficulty=Advanced&page=2`);
    expect(
      target('/learn/algorithmic-patterns/some-problem?pattern=algorithmic-patterns:list-reversal'),
    ).toBe(`/learn/algorithmic-patterns/some-problem?pattern=${linkedLists}`);
  });

  describe('opaque pattern context (DLV-962)', () => {
    // Synthetic course tables and ids only.
    const courses: RetiredCourseIds[] = [
      {
        path: 'learn',
        courseId: 'demo-course',
        lessons: {},
        modules: {},
        units: { 'old-unit': 'new-unit' },
      },
    ];
    const at = (url: string) => {
      const tree = retiredContentTarget(serializer.parse(url), courses);
      return tree ? serializer.serialize(tree) : null;
    };
    const current = patternContextToken('demo-course:current-unit');

    it('rewrites an old readable id to the opaque id and keeps every other parameter', () => {
      expect(at('/learn/demo-course/demo-problem?pattern=demo-course:current-unit&mode=surprise')).toBe(
        `/learn/demo-course/demo-problem?pattern=${current}&mode=surprise`,
      );
      expect(at('/learn/hands-on-dsa?view=groups&pattern=demo-course:current-unit')).toBe(
        `/learn/hands-on-dsa?view=groups&pattern=${current}`,
      );
    });

    it('leaves a URL that already carries the opaque id alone, so it never redirects twice', () => {
      expect(at(`/learn/demo-course/demo-problem?pattern=${current}`)).toBeNull();
      expect(at('/learn/demo-course/demo-problem')).toBeNull();
    });

    it('moves an old readable id off a retired unit, then makes it opaque', () => {
      expect(at('/learn/hands-on-dsa?pattern=demo-course:old-unit')).toBe(
        `/learn/hands-on-dsa?pattern=${patternContextToken('demo-course:new-unit')}`,
      );
    });

    it('moves the opaque id of a retired unit to the opaque id of its replacement', () => {
      expect(at(`/learn/hands-on-dsa?pattern=${patternContextToken('demo-course:old-unit')}`)).toBe(
        `/learn/hands-on-dsa?pattern=${patternContextToken('demo-course:new-unit')}`,
      );
    });

    it('rewrites the pattern inside returnTo, so the problem URL never names it', () => {
      const result = at(
        `/learn/demo-course/demo-problem?pattern=demo-course:current-unit&returnTo=${encodeURIComponent(
          '/learn/hands-on-dsa?view=groups&pattern=demo-course:current-unit&q=sum',
        )}`,
      )!;
      expect(result).not.toContain('current-unit');
      const tree = serializer.parse(result);
      expect(tree.queryParams['pattern']).toBe(current);
      const returnTo = serializer.parse(tree.queryParams['returnTo']);
      expect(returnTo.queryParams).toEqual({ view: 'groups', pattern: current, q: 'sum' });
    });

    it('keeps a returnTo without a pattern, or one that is not an app path, as it is', () => {
      expect(
        at(`/learn/demo-course/demo-problem?returnTo=${encodeURIComponent('/learn/hands-on-dsa?q=sum')}`),
      ).toBeNull();
      expect(
        at(`/learn/demo-course/demo-problem?returnTo=${encodeURIComponent('https://example.test/?pattern=x:y')}`),
      ).toBeNull();
    });

    it('normalises an old link in the router, records only the opaque URL and keeps it on Back/Forward', async () => {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([
            { path: 'learn/:courseId/:questionId', canActivate: [retiredContentRedirect], component: Page },
          ]),
          provideLocationMocks(),
        ],
      });
      const harness = await RouterTestingHarness.create();
      const router = TestBed.inject(Router);
      router.setUpLocationChangeListener();
      const location = TestBed.inject(Location) as SpyLocation;
      const token = patternContextToken('demo-course:current-unit');

      await harness.navigateByUrl('/learn/demo-course/first?pattern=demo-course:current-unit');
      expect(router.url).toBe(`/learn/demo-course/first?pattern=${token}`);
      await harness.navigateByUrl(`/learn/demo-course/second?pattern=${token}`);
      expect(location.urlChanges.join(' ')).not.toContain('current-unit');

      location.back();
      await vi.waitFor(() => expect(router.url).toBe(`/learn/demo-course/first?pattern=${token}`));
      location.forward();
      await vi.waitFor(() => expect(router.url).toBe(`/learn/demo-course/second?pattern=${token}`));
      expect(location.path()).toBe(`/learn/demo-course/second?pattern=${token}`);
    });

    it('rewrites every value of a repeated pattern parameter', () => {
      const tree = serializer.parse(
        at('/learn/hands-on-dsa?pattern=demo-course:current-unit&pattern=demo-course:old-unit')!,
      );
      expect(tree.queryParams['pattern']).toEqual([
        current,
        patternContextToken('demo-course:new-unit'),
      ]);
    });
  });

  it('moves retired Search course filters', () => {
    expect(
      target('/search?kind=practice&path=learn&course=algorithmic-patterns&module=practice-divide-and-conquer&unit=divide-conquer'),
    ).toBe('/search?kind=practice&path=learn&course=algorithmic-patterns&module=practice-recursion-recurrence&unit=recursion');
    expect(target('/search?course=another-course&module=practice-divide-and-conquer')).toBeNull();
  });

  it.each([
    '/learn/algorithmic-patterns/algorithmic-prefix-state',
    '/learn/algorithmic-patterns',
    '/learn/another-course/algorithmic-difference-arrays',
    '/blaze/algorithmic-patterns/algorithmic-difference-arrays',
    '/learn/algorithmic-patterns/module/theory-prefix-state',
    `/learn/hands-on-dsa?pattern=${patternContextToken('algorithmic-patterns:prefix-state')}`,
    '/learn/algorithmic-patterns/constructor',
    '/search?q=difference-arrays',
  ])('leaves %s alone', (url) => {
    expect(target(url)).toBeNull();
  });

  it('never maps a retired id to another retired id or to itself', () => {
    // A course move (targetCourseId) keeps ids unchanged, so only same-course entries are checked.
    for (const course of RETIRED_COURSE_IDS.filter((entry) => !entry.targetCourseId)) {
      for (const table of [course.lessons, course.modules, course.units]) {
        for (const [retired, current] of Object.entries(table)) {
          expect(current).not.toBe(retired);
          expect(Object.hasOwn(table, current)).toBe(false);
        }
      }
    }
  });

  it('sends lessons, units and modules that moved to Java Concurrency to the new course', () => {
    expect(target('/learn/solid-design-patterns/java-thread-safety-and-coordination')).toBe(
      '/learn/java-concurrency/java-thread-safety-and-coordination',
    );
    expect(target('/learn/solid-design-patterns/virtual-threads')).toBe(
      '/learn/java-concurrency/virtual-threads',
    );
    expect(target('/learn/solid-design-patterns#unit-threading')).toBe(
      '/learn/java-concurrency#unit-threading',
    );
    expect(target('/learn/solid-design-patterns/module/executors-async')).toBe(
      '/learn/java-concurrency/module/executors-async',
    );
    expect(target('/learn/solid-design-patterns/lld-allocation-booking-guide')).toBeNull();
  });

  it('sends the pass-by-value question that moved to Java Foundations to the new course', () => {
    expect(target('/learn/oop/java-pass-by-value')).toBe('/learn/core-java/java-pass-by-value');
    expect(target('/learn/oop/java-pass-by-value?from=plan#answer')).toBe(
      '/learn/core-java/java-pass-by-value?from=plan#answer',
    );
    // Only that question moved: the course, its units, its modules and its other questions stay.
    for (const url of [
      '/learn/oop',
      '/learn/oop#unit-oop-foundations',
      '/learn/oop/module/oop-foundations',
      '/learn/oop/access-modifiers',
      '/learn/oop/oop-state-behavior-and-invariants',
      '/learn/core-java/java-pass-by-value',
    ]) {
      expect(target(url)).toBeNull();
    }
  });

  it('sends the Singleton question that moved to Design Patterns and LLD to the new course', () => {
    expect(target('/learn/oop/singleton-pattern')).toBe(
      '/learn/solid-design-patterns/singleton-pattern',
    );
    expect(target('/learn/oop/singleton-pattern?from=plan#answer')).toBe(
      '/learn/solid-design-patterns/singleton-pattern?from=plan#answer',
    );
    // The course's other entry still works: each id is looked up in every entry of the course.
    expect(target('/learn/oop/java-pass-by-value')).toBe('/learn/core-java/java-pass-by-value');
    for (const url of [
      '/learn/oop',
      '/learn/oop#unit-design-principles',
      '/learn/oop/module/design-principles',
      '/learn/oop/solid-principles',
      '/learn/oop/solid-change-boundaries',
      '/learn/oop/enum-singleton-safety',
      '/learn/solid-design-patterns/singleton-pattern',
      '/learn/core-java/singleton-pattern',
    ]) {
      expect(target(url)).toBeNull();
    }
  });

  it('lists each moved oop question in exactly one entry of the real table', () => {
    const oop = RETIRED_COURSE_IDS.filter(
      (entry) => entry.path === 'learn' && entry.courseId === 'oop',
    );
    expect(oop.map((entry) => entry.targetCourseId)).toEqual(['core-java', 'solid-design-patterns']);
    const ids = oop.flatMap((entry) => Object.keys(entry.lessons));
    expect(ids).toEqual(['java-pass-by-value', 'singleton-pattern']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('looks an id up in every entry of a course, not only the first', () => {
    const table: RetiredCourseIds[] = [
      {
        path: 'learn',
        courseId: 'sample',
        targetCourseId: 'first-target',
        lessons: { 'lesson-a': 'lesson-a' },
        modules: { 'module-a': 'module-a' },
        units: { 'unit-a': 'unit-a' },
      },
      {
        path: 'learn',
        courseId: 'sample',
        targetCourseId: 'second-target',
        lessons: { 'lesson-b': 'lesson-b' },
        modules: { 'module-b': 'module-b' },
        units: { 'unit-b': 'unit-b' },
      },
      {
        // Same course, no target: a rename inside the course.
        path: 'learn',
        courseId: 'sample',
        lessons: { 'lesson-c': 'lesson-c2', 'lesson-a': 'ignored-duplicate' },
        modules: { 'module-c': 'module-c2' },
        units: { 'unit-c': 'unit-c2' },
      },
    ];
    const from = (url: string) => {
      const tree = retiredContentTarget(serializer.parse(url), table);
      return tree ? serializer.serialize(tree) : null;
    };
    expect(from('/learn/sample/lesson-a')).toBe('/learn/first-target/lesson-a');
    expect(from('/learn/sample/lesson-b?from=plan#answer')).toBe(
      '/learn/second-target/lesson-b?from=plan#answer',
    );
    expect(from('/learn/sample/lesson-c')).toBe('/learn/sample/lesson-c2');
    expect(from('/learn/sample/module/module-a')).toBe('/learn/first-target/module/module-a');
    expect(from('/learn/sample/module/module-b')).toBe('/learn/second-target/module/module-b');
    expect(from('/learn/sample/module/module-c')).toBe('/learn/sample/module/module-c2');
    expect(from('/learn/sample#unit-unit-a')).toBe('/learn/first-target#unit-unit-a');
    expect(from('/learn/sample#unit-unit-b')).toBe('/learn/second-target#unit-unit-b');
    expect(from('/learn/sample#unit-unit-c')).toBe('/learn/sample#unit-unit-c2');
    expect(from('/search?course=sample&module=module-c&unit=unit-c')).toBe(
      '/search?course=sample&module=module-c2&unit=unit-c2',
    );
    for (const url of [
      '/learn/sample/lesson-d',
      '/learn/sample/module/lesson-b',
      '/learn/sample#unit-lesson-b',
      '/learn/other/lesson-b',
      '/grow/sample/lesson-b',
    ]) {
      expect(from(url)).toBeNull();
    }
  });

  it('sends a removed AWS question to the lesson it belonged to', () => {
    const aws = RETIRED_COURSE_IDS.find(
      (entry) => entry.path === 'grow' && entry.courseId === 'aws-cloud',
    );
    expect(Object.keys(aws?.lessons ?? {})).toHaveLength(74);
    // Every target is a lesson of the course, and no kept question (aws-edge-01...) is listed.
    for (const [retired, lesson] of Object.entries(aws?.lessons ?? {})) {
      expect(retired).toMatch(/^aws-(?!cloud-)[a-z-]+-\d+$/);
      expect(lesson).toMatch(/^aws-cloud-[a-z-]+-guide$/);
      expect(target(`/grow/aws-cloud/${retired}`)).toBe(`/grow/aws-cloud/${lesson}`);
    }
    expect(target('/grow/aws-cloud/aws-network-01?from=search#answer')).toBe(
      '/grow/aws-cloud/aws-cloud-networking-guide?from=search#answer',
    );
    expect(target('/grow/aws-cloud/aws-compute-07')).toBe('/grow/aws-cloud/aws-cloud-compute-guide');
    expect(target('/grow/aws-cloud/aws-security-16')).toBe(
      '/grow/aws-cloud/aws-cloud-iam-security-guide',
    );
    expect(target('/grow/aws-cloud/aws-edge-06')).toBe(
      '/grow/aws-cloud/aws-cloud-edge-api-protection-guide',
    );
  });

  it.each([
    '/grow/aws-cloud/aws-edge-01',
    '/grow/aws-cloud/aws-compute-03',
    '/grow/aws-cloud/aws-cloud-networking-1',
    '/grow/aws-cloud/aws-cloud-networking-guide',
    '/grow/aws-cloud',
    '/learn/aws-cloud/aws-network-01',
    '/grow/docker-kubernetes/aws-network-01',
  ])('leaves the live Grow route %s alone', (url) => {
    expect(target(url)).toBeNull();
  });

  it('guards the Grow question route, where a removed question id arrives', () => {
    const route = routes.find((entry: Route) => entry.path === 'grow/:courseId/:questionId');
    expect(route?.canActivate ?? []).toContain(retiredContentRedirect);
  });

  it('redirects a removed Grow question in the router', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'grow/:courseId/:questionId', canActivate: [retiredContentRedirect], component: Page },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);

    await harness.navigateByUrl('/grow/aws-cloud/aws-storage-15?from=plan');
    expect(router.url).toBe('/grow/aws-cloud/aws-cloud-storage-databases-guide?from=plan');

    await harness.navigateByUrl('/grow/aws-cloud/aws-storage-02');
    expect(router.url).toBe('/grow/aws-cloud/aws-storage-02');
  });

  it('guards every Learn route that can carry a retired id', () => {
    const guarded = (path: string) =>
      (routes.find((route: Route) => route.path === path)?.canActivate ?? []).includes(
        retiredContentRedirect,
      );
    for (const path of [
      'search',
      'learn/hands-on-dsa',
      'learn/:courseId/module/:moduleId',
      'learn/:courseId/:questionId',
      'learn/:courseId',
    ]) {
      expect(guarded(path)).toBe(true);
    }
  });

  it('redirects in the router without loading the retired page', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'learn/:courseId/:questionId', canActivate: [retiredContentRedirect], component: Page },
          {
            path: 'learn/:courseId',
            canActivate: [retiredContentRedirect],
            runGuardsAndResolvers: 'always',
            component: Page,
          },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);

    await harness.navigateByUrl('/learn/algorithmic-patterns/algorithmic-difference-arrays?from=plan#check');
    expect(router.url).toBe('/learn/algorithmic-patterns/algorithmic-prefix-state?from=plan#check');

    await harness.navigateByUrl('/learn/algorithmic-patterns');
    await harness.navigateByUrl('/learn/algorithmic-patterns#unit-monotonic-queue');
    expect(router.url).toBe('/learn/algorithmic-patterns#unit-monotonic-stack');
  });
});
