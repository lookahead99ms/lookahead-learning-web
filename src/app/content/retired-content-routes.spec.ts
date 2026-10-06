import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DefaultUrlSerializer, provideRouter, Route, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import {
  RETIRED_COURSE_IDS,
  retiredContentRedirect,
  retiredContentTarget,
} from './retired-content-routes';

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
    expect(
      target('/learn/hands-on-dsa?pattern=algorithmic-patterns:two-dimensional-dp&difficulty=Advanced&page=2'),
    ).toBe('/learn/hands-on-dsa?pattern=algorithmic-patterns:dynamic-programming&difficulty=Advanced&page=2');
    expect(
      target('/learn/algorithmic-patterns/some-problem?pattern=algorithmic-patterns:list-reversal'),
    ).toBe('/learn/algorithmic-patterns/some-problem?pattern=algorithmic-patterns:linked-lists');
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
    '/look-ahead/algorithmic-patterns/algorithmic-difference-arrays',
    '/learn/algorithmic-patterns/module/theory-prefix-state',
    '/learn/hands-on-dsa?pattern=algorithmic-patterns:prefix-state',
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
