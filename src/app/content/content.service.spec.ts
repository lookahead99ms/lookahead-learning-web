import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ContentService,
  DSA_DETAIL_CACHE_MAX_BYTES,
  DSA_DETAIL_CACHE_MAX_ENTRIES,
} from './content.service';

describe('ContentService canonical DSA details', () => {
  it('does not retain a stale problem detail for the application lifetime', () => {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(ContentService);
    const http = TestBed.inject(HttpTestingController);
    const titles: string[] = [];

    service.getDsaProblem('sample-problem').subscribe((problem) => titles.push(problem.title));
    http
      .expectOne('/content/learn/dsa-problems/sample-problem.json')
      .flush({ title: 'Earlier detail' });

    service.getDsaProblem('sample-problem').subscribe((problem) => titles.push(problem.title));
    http
      .expectOne('/content/learn/dsa-problems/sample-problem.json')
      .flush({ title: 'Updated detail' });

    expect(titles).toEqual(['Earlier detail', 'Updated detail']);
    http.verify();
  });

  it('reuses only a version-matched canonical problem detail', () => {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(ContentService);
    const http = TestBed.inject(HttpTestingController);
    const titles: string[] = [];

    service
      .getDsaProblem('sample-problem', 'version-a')
      .subscribe((problem) => titles.push(problem.title));
    http.expectOne('/content/learn/dsa-problems/sample-problem.json').flush({ title: 'Version A' });
    service
      .getDsaProblem('sample-problem', 'version-a')
      .subscribe((problem) => titles.push(problem.title));
    http.expectNone('/content/learn/dsa-problems/sample-problem.json');

    service
      .getDsaProblem('sample-problem', 'version-b')
      .subscribe((problem) => titles.push(problem.title));
    http.expectOne('/content/learn/dsa-problems/sample-problem.json').flush({ title: 'Version B' });

    expect(titles).toEqual(['Version A', 'Version A', 'Version B']);
    http.verify();
  });

  it('evicts the least-recently-used detail when the entry bound is exceeded', () => {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(ContentService);
    const http = TestBed.inject(HttpTestingController);

    for (let index = 0; index <= DSA_DETAIL_CACHE_MAX_ENTRIES; index++) {
      const id = `sample-problem-${index}`;
      service.getDsaProblem(id, 'version-a').subscribe();
      http.expectOne(`/content/learn/dsa-problems/${id}.json`).flush({ id, title: id });
    }

    service.getDsaProblem('sample-problem-0', 'version-a').subscribe();
    http
      .expectOne('/content/learn/dsa-problems/sample-problem-0.json')
      .flush({ id: 'sample-problem-0', title: 'Loaded again' });
    http.verify();
  });

  it('does not retain a single detail larger than the byte bound', () => {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(ContentService);
    const http = TestBed.inject(HttpTestingController);

    service.getDsaProblem('oversized-problem', 'version-a').subscribe();
    http.expectOne('/content/learn/dsa-problems/oversized-problem.json').flush({
      id: 'oversized-problem',
      title: 'x'.repeat(DSA_DETAIL_CACHE_MAX_BYTES),
    });
    service.getDsaProblem('oversized-problem', 'version-a').subscribe();
    http
      .expectOne('/content/learn/dsa-problems/oversized-problem.json')
      .flush({ id: 'oversized-problem', title: 'Loaded again' });
    http.verify();
  });

  it('removes a failed detail request so the same version can be retried', () => {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(ContentService);
    const http = TestBed.inject(HttpTestingController);

    service.getDsaProblem('retry-problem', 'version-a').subscribe({ error: () => undefined });
    http
      .expectOne('/content/learn/dsa-problems/retry-problem.json')
      .flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    service.getDsaProblem('retry-problem', 'version-a').subscribe();
    http
      .expectOne('/content/learn/dsa-problems/retry-problem.json')
      .flush({ id: 'retry-problem', title: 'Recovered' });
    http.verify();
  });

  it('loads and replays the compact Hands-On index once', () => {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(ContentService);
    const http = TestBed.inject(HttpTestingController);
    const totals: number[] = [];

    service.getHandsOnDsaIndex().subscribe((index) => totals.push(index.totals.distinctProblems));
    http.expectOne('/content/hands-on-dsa-index.json').flush({
      schemaVersion: 'hands-on-dsa-index/v1',
      totals: { groups: 1, problemPlacements: 1, distinctProblems: 1 },
      groups: [],
    });
    service.getHandsOnDsaIndex().subscribe((index) => totals.push(index.totals.distinctProblems));
    http.expectNone('/content/hands-on-dsa-index.json');

    expect(totals).toEqual([1, 1]);
    http.verify();
  });

  it('hydrates lesson essentials without preloading canonical continuation details', () => {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(ContentService);
    const http = TestBed.inject(HttpTestingController);
    let loadedCourse: any;

    service.getCourse('learn', 'sample').subscribe((course) => (loadedCourse = course));
    http.expectOne('/content/learn/sample/course.json').flush({
      id: 'sample',
      modules: [{ id: 'practice-sample', order: 1, title: 'Practice', description: '' }],
      questions: [],
    });
    http.expectOne('/content/learn/sample/modules/practice-sample.json').flush([
      {
        id: 'sample-lesson',
        schemaVersion: 'pattern-lesson/v2',
        essentialProblemRefs: [{ problemId: 'essential-problem' }],
      },
      {
        id: 'essential-route',
        canonicalProblemRef: { problemId: 'essential-problem' },
      },
      {
        id: 'continuation-route',
        canonicalProblemRef: { problemId: 'continuation-problem' },
      },
    ]);
    http.expectOne('/content/learn/dsa-problems/essential-problem.json').flush({
      id: 'essential-problem',
      placements: [
        {
          role: 'practice',
          path: 'learn',
          courseId: 'sample',
          questionId: 'essential-route',
        },
      ],
    });

    expect(loadedCourse.questions[0].essentialProblems[0].id).toBe('essential-problem');
    expect(loadedCourse.questions[1].canonicalProblem.id).toBe('essential-problem');
    expect(loadedCourse.questions[2].canonicalProblem).toBeUndefined();
    http.expectNone('/content/learn/dsa-problems/continuation-problem.json');
    http.verify();
  });
});
