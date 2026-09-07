import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { routes } from '../../app.routes';
import { CourseContent } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { Course } from './course';

const javaFoundations: CourseContent = {
  id: 'core-java',
  path: 'learn',
  title: 'Java Foundations',
  description: 'Learn Java foundations.',
  version: 'Java 21+',
  learningPath: {
    guidance: 'Start here when Java is your target language.',
    preparation: { requirement: 'none', courseIds: [] },
    nextCourseIds: ['java-data-structures'],
  },
  modules: [
    {
      id: 'java-platform',
      order: 1,
      title: 'Java Platform Fundamentals',
      description: 'Understand the Java platform.',
    },
  ],
  questions: [],
};

const modernJava: CourseContent = {
  id: 'modern-java',
  path: 'learn',
  title: 'Modern Java',
  chips: ['Java 8', 'Functional interfaces', 'Optional'],
  description: 'Learn modern Java APIs.',
  version: 'Java 21+',
  learningPath: {
    guidance: 'Continue after Java Foundations.',
    preparation: { requirement: 'all', courseIds: ['core-java'] },
    nextCourseIds: ['garbage-collection'],
  },
  modules: [],
  questions: [],
};

const springFramework: CourseContent = {
  id: 'spring-framework',
  path: 'grow',
  title: 'Spring Framework',
  description: 'Reason about container and transaction boundaries.',
  version: 'Spring',
  learningPath: {
    guidance: 'Understand Java and object lifecycle before tracing the container.',
    preparation: { requirement: 'all', courseIds: ['advanced-java'] },
    nextCourseIds: ['spring-boot'],
  },
  modules: [],
  questions: [],
};

describe('Course learning path', () => {
  beforeEach(async () => {
    const content = {
      getCourse: vi.fn((_pathId: string, courseId: string) =>
        of(
          [javaFoundations, modernJava, springFramework].find((course) => course.id === courseId) ??
            javaFoundations,
        ),
      ),
      getCatalog: vi.fn(() =>
        of([
          { id: 'core-java', title: 'Java Foundations' },
          { id: 'python-fundamentals', title: 'Python Foundations' },
          { id: 'go-fundamentals', title: 'Go Foundations' },
          { id: 'language-comparative-analysis', title: 'Language Selection and Migration' },
          { id: 'java-data-structures', title: 'Java Collections' },
          { id: 'modern-java', title: 'Modern Java' },
          { id: 'garbage-collection', title: 'JVM Memory and Garbage Collection' },
          { id: 'advanced-java', title: 'Advanced Java' },
          { id: 'spring-framework', title: 'Spring Framework' },
          { id: 'spring-boot', title: 'Spring Boot' },
        ]),
      ),
    };
    await TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: ContentService, useValue: content }],
    }).compileComponents();
  });

  it('shows the group and current course in the breadcrumb', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/core-java', Course);

    const breadcrumb = harness.routeNativeElement?.querySelector('.breadcrumbs');
    expect(breadcrumb?.textContent).toContain('Programming Language Foundations');
    expect(breadcrumb?.querySelector('[aria-current="page"]')?.textContent).toContain(
      'Java Foundations',
    );
  });

  it('renders prerequisites and continuations as instructional links, not pills', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/core-java', Course);

    const learningPath = harness.routeNativeElement?.querySelector('.course-learning-path');
    expect(learningPath?.textContent).toContain('No prerequisite course.');
    expect(learningPath?.querySelector('a')?.textContent).toContain('Java Collections');
    expect(harness.routeNativeElement?.querySelector('.course-chips')).toBeNull();
  });

  it('does not present informational course topics as interactive-looking pills', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/modern-java', Course);

    expect(harness.routeNativeElement?.querySelector('.course-chips')).toBeNull();
    expect(harness.routeNativeElement?.textContent).not.toContain('Functional interfaces');
  });

  it('places previous and next courses at opposite ends of a dedicated navigation row', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/modern-java', Course);

    const navigation = harness.routeNativeElement?.querySelector('.course-navigation-bar');
    const links = navigation?.querySelectorAll('.reader-footer-link');

    expect(navigation?.parentElement?.classList).toContain('course-page-intro');
    expect(links?.length).toBe(2);
    expect(links?.item(0).classList).toContain('previous');
    expect(links?.item(0).textContent).toContain('Java Collections');
    expect(links?.item(1).classList).toContain('next');
    expect(links?.item(1).textContent).toContain('JVM Memory and Garbage Collection');
  });

  it('shows matching recommendations once in the adjacent navigation, preserving their meaning', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/grow/spring-framework', Course);

    const intro = harness.routeNativeElement!.querySelector('.course-page-intro')!;
    expect(intro.querySelector('.course-learning-path')?.textContent).toContain(
      springFramework.learningPath!.guidance,
    );
    expect(intro.querySelectorAll('.course-learning-path-row')).toHaveLength(0);
    expect(intro.querySelectorAll('a[href="/grow/advanced-java"]')).toHaveLength(1);
    expect(intro.querySelectorAll('a[href="/grow/spring-boot"]')).toHaveLength(1);
    expect(intro.querySelector('.previous')?.textContent).toContain('Recommended preparation');
    expect(intro.querySelector('.next')?.textContent).toContain('Recommended continuation');
  });

  it('keeps a distinct prerequisite without treating the previous course as preparation', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/modern-java', Course);

    const intro = harness.routeNativeElement!.querySelector('.course-page-intro')!;
    expect(intro.querySelector('.course-learning-path a')?.getAttribute('href')).toBe(
      '/learn/core-java',
    );
    expect(intro.querySelectorAll('a[href="/learn/garbage-collection"]')).toHaveLength(1);
    expect(intro.querySelector('.course-learning-path')?.textContent).not.toContain(
      'Continue with',
    );
    expect(intro.querySelector('.previous')?.textContent).not.toContain('Recommended preparation');
  });

  it.each(['any', 'all'] as const)(
    'preserves the complete %s prerequisite set when one item is also the previous course',
    async (requirement) => {
      vi.spyOn(TestBed.inject(ContentService), 'getCourse').mockReturnValue(
        of({
          ...modernJava,
          learningPath: {
            ...modernJava.learningPath!,
            preparation: { requirement, courseIds: ['core-java', 'java-data-structures'] },
          },
        }),
      );
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/learn/modern-java', Course);

      const preparation = harness.routeNativeElement!.querySelector('.course-learning-path-row')!;
      expect(
        Array.from(preparation.querySelectorAll('a'), (link) => link.getAttribute('href')),
      ).toEqual(['/learn/core-java', '/learn/java-data-structures']);
      expect(preparation.textContent?.includes('Complete any one:')).toBe(requirement === 'any');
      expect(harness.routeNativeElement!.querySelector('.previous')?.textContent).not.toContain(
        'Recommended preparation',
      );
    },
  );

  it('preserves multiple recommended continuations rather than silently dropping an option', async () => {
    vi.spyOn(TestBed.inject(ContentService), 'getCourse').mockReturnValue(
      of({
        ...modernJava,
        learningPath: {
          ...modernJava.learningPath!,
          nextCourseIds: ['garbage-collection', 'language-comparative-analysis'],
        },
      }),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/modern-java', Course);

    const continuation = harness.routeNativeElement!.querySelectorAll(
      '.course-learning-path-row',
    )[1];
    expect(continuation.textContent).toContain('Continue with');
    expect(continuation.querySelectorAll('a')).toHaveLength(2);
    expect(harness.routeNativeElement!.querySelector('.next')?.textContent).not.toContain(
      'Recommended continuation',
    );
  });

  it('keeps an unavailable matching recommendation noninteractive and displays it once', async () => {
    vi.spyOn(TestBed.inject(ContentService), 'getCatalog').mockReturnValue(
      of([
        { id: 'advanced-java', title: 'Advanced Java', available: false },
        { id: 'spring-framework', title: 'Spring Framework' },
        { id: 'spring-boot', title: 'Spring Boot', available: false },
      ]),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/grow/spring-framework', Course);

    const intro = harness.routeNativeElement!.querySelector('.course-page-intro')!;
    expect(intro.querySelectorAll('.course-learning-path-row')).toHaveLength(0);
    expect(intro.querySelectorAll('.course-navigation-bar a')).toHaveLength(0);
    expect(intro.querySelectorAll('.course-navigation-bar .unavailable')).toHaveLength(2);
    expect(intro.textContent?.match(/Coming next/g)).toHaveLength(2);
    expect(intro.textContent).toContain('Recommended preparation');
    expect(intro.textContent).toContain('Recommended continuation');
  });

  it('recomputes recommendations on navigation to a course without learning-path metadata', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/grow/spring-framework', Course);
    vi.spyOn(TestBed.inject(ContentService), 'getCourse').mockReturnValue(
      of({ ...springFramework, id: 'spring-boot', title: 'Spring Boot', learningPath: undefined }),
    );
    await harness.navigateByUrl('/grow/spring-boot', Course);

    const intro = harness.routeNativeElement!.querySelector('.course-page-intro')!;
    expect(intro.querySelector('.course-learning-path')).toBeNull();
    expect(intro.textContent).not.toContain('Recommended preparation');
    expect(intro.textContent).not.toContain('Recommended continuation');
    expect(intro.querySelector('.previous')?.getAttribute('href')).toBe('/grow/spring-framework');
  });
});
