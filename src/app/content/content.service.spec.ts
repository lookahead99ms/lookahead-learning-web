import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ContentService } from './content.service';

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
