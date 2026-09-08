import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { routes } from '../app.routes';
import { CourseContent, CourseOutline } from '../content/content.models';
import { ContentService } from '../content/content.service';
import { Course } from './course/course';
import { CourseSection } from './course-section/course-section';
import { Module } from './module/module';
import { Question } from './question/question';

// Synthetic content only: these tests must also run in a public checkout.
const course: CourseContent = {
  id: 'sample',
  path: 'learn',
  title: 'Sample course',
  description: 'Route test',
  version: '1',
  modules: [{ id: 'module', order: 1, title: 'Sample module', description: 'Module test' }],
  sections: [
    { id: 'section', title: 'Sample section', description: 'Section test', moduleIds: ['module'] },
  ],
  questions: [
    {
      id: 'question',
      moduleId: 'module',
      order: 1,
      title: 'Sample question',
      difficulty: 'Beginner',
      tags: [],
      interviewAnswer: 'An example answer.',
      explanation: ['An example explanation.'],
      versionNotes: [],
      followUps: [],
    },
  ],
};

function outlineFor(path: string): CourseOutline {
  return {
    ...course,
    path,
    questions: course.questions.map((question) => ({
      id: question.id,
      moduleId: question.moduleId,
      order: question.order,
      title: question.title,
      difficulty: question.difficulty,
      tags: question.tags,
      contentType: question.contentType ?? 'q-and-a',
      isTheoryArticle: false,
      detailRef: {
        kind: 'content-item',
        href: `/content/details/${path}/sample/module/question.json`,
        version: 'test-v1',
      },
    })),
    moduleDetailRefs: [
      {
        moduleId: 'module',
        href: `/content/${path}/sample/modules/module.json`,
        version: 'test-v1',
        itemIds: ['question'],
      },
    ],
  };
}

const surfaces: { name: string; component: Type<unknown>; suffix: string; title: string }[] = [
  { name: 'course', component: Course, suffix: '', title: course.title },
  { name: 'module', component: Module, suffix: '/module/module', title: 'Sample module' },
  { name: 'question', component: Question, suffix: '/question', title: 'Sample question' },
  {
    name: 'section',
    component: CourseSection,
    suffix: '/section/section',
    title: 'Sample section',
  },
];

const routeCases = surfaces.flatMap((surface) =>
  (surface.name === 'section' ? ['learn'] : ['learn', 'grow', 'look-ahead']).map((contentPath) => ({
    ...surface,
    contentPath,
  })),
);

describe.each(routeCases)(
  '$contentPath $name route recovery',
  ({ component, contentPath, suffix, title }) => {
    let pending: Subject<CourseOutline>;
    const content = {
      getCatalog: vi.fn(() => of([{ id: course.id, title: course.title }])),
      getCourseOutline: vi.fn<(...args: string[]) => Observable<CourseOutline>>(),
      getModuleQuestions: vi.fn((_course: CourseOutline, moduleId: string) =>
        of(moduleId === 'module' ? course.questions : []),
      ),
      getContentItem: vi.fn(() => of(course.questions[0])),
      getHandsOnDsaIndex: vi.fn(() =>
        of({
          schemaVersion: 'hands-on-dsa-index/v1',
          totals: { groups: 0, problemPlacements: 0, distinctProblems: 0 },
          groups: [],
        }),
      ),
    };

    beforeEach(async () => {
      pending = new Subject<CourseOutline>();
      content.getCourseOutline.mockReset().mockImplementation((_path, id) => {
        if (id === 'missing') return throwError(() => new Error('404'));
        if (id === 'pending') return pending;
        return of(outlineFor(contentPath));
      });
      await TestBed.configureTestingModule({
        providers: [provideRouter(routes), { provide: ContentService, useValue: content }],
      }).compileComponents();
    });

    it('replaces previous content with an unavailable message after an HTTP failure', async () => {
      const harness = await RouterTestingHarness.create();
      const first = await harness.navigateByUrl(`/${contentPath}/sample${suffix}`, component);
      expect(content.getCourseOutline).toHaveBeenCalledWith(contentPath, 'sample');
      expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(title);
      const reused = await harness.navigateByUrl(`/${contentPath}/missing${suffix}`, component);
      expect(reused).toBe(first);
      expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(
        'Content unavailable',
      );
      expect(harness.routeNativeElement?.textContent).not.toContain(title);
    });

    it('recovers on the same component after a failed request', async () => {
      const harness = await RouterTestingHarness.create();
      const first = await harness.navigateByUrl(`/${contentPath}/missing${suffix}`, component);
      expect(harness.routeNativeElement?.textContent).toContain('Content unavailable');
      const reused = await harness.navigateByUrl(`/${contentPath}/sample${suffix}`, component);
      expect(reused).toBe(first);
      expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(title);
      expect(harness.routeNativeElement?.textContent).not.toContain('Content unavailable');
    });

    it('clears stale content while loading and ignores a superseded response', async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(`/${contentPath}/sample${suffix}`, component);
      await harness.navigateByUrl(`/${contentPath}/pending${suffix}`, component);
      expect(harness.routeNativeElement?.textContent).not.toContain(title);
      await harness.navigateByUrl(`/${contentPath}/missing${suffix}`, component);
      pending.next(outlineFor(contentPath));
      pending.complete();
      harness.detectChanges();
      expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(
        'Content unavailable',
      );
    });

    if (suffix) {
      it('does not retain a valid item when the next item ID is absent from the course', async () => {
        const harness = await RouterTestingHarness.create();
        await harness.navigateByUrl(`/${contentPath}/sample${suffix}`, component);
        await harness.navigateByUrl(
          `/${contentPath}/sample${suffix.replace(/[^/]+$/, 'absent')}`,
          component,
        );
        expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(
          'Content unavailable',
        );
        expect(harness.routeNativeElement?.textContent).not.toContain(title);
        await harness.navigateByUrl(`/${contentPath}/sample${suffix}`, component);
        expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(title);
      });
    }
  },
);
