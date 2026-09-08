import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { routes } from '../../app.routes';
import { CourseOutline } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { Course } from './course';

const javaFoundations: CourseOutline = {
  id: 'core-java',
  path: 'learn',
  title: 'Java Foundations',
  description: 'Learn Java foundations.',
  version: 'Java 21+',
  learningPath: {
    guidance: 'Start here when Java is your target language.',
    backgroundCourseIds: [],
    recommendedNext: {
      courseId: 'java-data-structures',
      reason: 'Build fluency with Java collection contracts.',
    },
    otherDirections: [],
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
  moduleDetailRefs: [],
};

const modernJava: CourseOutline = {
  id: 'modern-java',
  path: 'learn',
  title: 'Modern Java',
  chips: ['Java 8', 'Functional interfaces', 'Optional'],
  description: 'Learn modern Java APIs.',
  version: 'Java 21+',
  learningPath: {
    guidance: 'Continue after Java Foundations.',
    backgroundCourseIds: ['core-java'],
    recommendedNext: {
      courseId: 'garbage-collection',
      reason: 'Connect modern APIs to JVM runtime behavior.',
    },
    otherDirections: [],
  },
  modules: [],
  questions: [],
  moduleDetailRefs: [],
};

const springFramework: CourseOutline = {
  id: 'spring-framework',
  path: 'grow',
  title: 'Spring Framework',
  description: 'Reason about container and transaction boundaries.',
  version: 'Spring',
  learningPath: {
    guidance: 'Understand Java and object lifecycle before tracing the container.',
    backgroundCourseIds: ['advanced-java'],
    recommendedNext: {
      courseId: 'spring-boot',
      reason: 'Apply framework contracts in production-oriented services.',
    },
    otherDirections: [],
  },
  modules: [],
  questions: [],
  moduleDetailRefs: [],
};

const springBoot: CourseOutline = {
  id: 'spring-boot',
  path: 'grow',
  title: 'Spring Boot',
  description: 'Build observable, testable services.',
  version: 'Spring',
  learningPath: {
    guidance: 'Combine framework, persistence and API contracts.',
    backgroundCourseIds: ['spring-framework', 'data-access', 'api-design'],
    recommendedNext: {
      courseId: 'distributed-systems',
      reason: 'Extend one service into distributed failure and consistency reasoning.',
    },
    otherDirections: [
      {
        courseId: 'quality-engineering',
        reason: 'Choose this when test architecture is the immediate skill gap.',
      },
    ],
  },
  modules: [],
  questions: [],
  moduleDetailRefs: [],
};

describe('Course learning path', () => {
  beforeEach(async () => {
    const content = {
      getCourseOutline: vi.fn((_pathId: string, courseId: string) =>
        of(
          [javaFoundations, modernJava, springFramework, springBoot].find(
            (course) => course.id === courseId,
          ) ?? javaFoundations,
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
          { id: 'data-access', title: 'Data Access' },
          { id: 'api-design', title: 'API Design and Security' },
          { id: 'distributed-systems', title: 'Distributed Systems Engineering' },
          { id: 'quality-engineering', title: 'Quality Engineering' },
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

  it('renders a next-only map without an empty background column', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/core-java', Course);

    const learningPath = harness.routeNativeElement?.querySelector('.course-learning-path');
    const map = learningPath?.querySelector('.course-relationship-map');
    expect(map?.classList).toContain('next-only');
    expect(map?.querySelector('.course-background-column')).toBeNull();
    expect(map?.querySelector('.course-current-node')?.textContent).toContain('Java Foundations');
    expect(map?.querySelector('.course-next-column a')?.textContent).toContain('Java Collections');
    expect(map?.querySelector('.course-next-column')?.textContent).toContain(
      'Build fluency with Java collection contracts.',
    );
    expect(learningPath?.textContent).not.toContain('No prerequisite');
    expect(harness.routeNativeElement?.querySelector('.course-navigation-bar')).toBeNull();
    expect(
      map?.querySelector('.course-current-node .course-group-return')?.getAttribute('href'),
    ).toBe('/learn?group=language-foundations');
    expect(learningPath?.querySelector(':scope > .course-group-return')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('.course-chips')).toBeNull();
  });

  it('does not present informational course topics as interactive-looking pills', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/modern-java', Course);

    expect(harness.routeNativeElement?.querySelector('.course-chips')).toBeNull();
    expect(harness.routeNativeElement?.textContent).not.toContain('Functional interfaces');
  });

  it('renders both direct relationship columns without catalog-order navigation', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/grow/spring-framework', Course);

    const map = harness.routeNativeElement?.querySelector('.course-relationship-map');

    expect(map?.closest('.course-learning-path')?.textContent).toContain(
      springFramework.learningPath!.guidance,
    );
    expect(map?.querySelector('.course-background-column a')?.getAttribute('href')).toBe(
      '/grow/advanced-java',
    );
    expect(map?.querySelector('.course-next-column a')?.getAttribute('href')).toBe(
      '/grow/spring-boot',
    );
    expect(map?.textContent).toContain('completing every linked course is not required');
    expect(harness.routeNativeElement?.textContent).not.toContain('Previous in group');
    expect(harness.routeNativeElement?.textContent).not.toContain('Next in group');
  });

  it('separates the recommended next step from explained alternatives', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/grow/spring-boot', Course);

    const background = harness.routeNativeElement!.querySelector('.course-background-column')!;
    const next = harness.routeNativeElement!.querySelector('.course-next-column')!;
    expect(
      Array.from(background.querySelectorAll('a'), (link) => link.textContent?.trim()),
    ).toEqual(['Spring Framework', 'Data Access', 'API Design and Security']);
    expect(next.querySelector(':scope > .course-relationship-list a')?.textContent?.trim()).toBe(
      'Distributed Systems Engineering',
    );
    expect(next.querySelector(':scope > .course-relationship-list')?.textContent).toContain(
      'distributed failure and consistency reasoning',
    );
    const alternatives = next.querySelector('.course-other-directions') as HTMLDetailsElement;
    expect(alternatives.open).toBe(false);
    expect(alternatives.querySelector('summary')?.textContent).toContain('Other directions (1)');
    expect(alternatives.querySelector('a')?.textContent?.trim()).toBe('Quality Engineering');
    expect(alternatives.textContent).toContain('test architecture is the immediate skill gap');
    expect(next.textContent).not.toContain('Data Access');
  });

  it('keeps one recommendation visible and collapses all other directions', async () => {
    vi.spyOn(TestBed.inject(ContentService), 'getCourseOutline').mockReturnValue(
      of({
        ...javaFoundations,
        learningPath: {
          ...javaFoundations.learningPath!,
          recommendedNext: {
            courseId: 'java-data-structures',
            reason: 'Build collection fluency first.',
          },
          otherDirections: [
            { courseId: 'modern-java', reason: 'Choose modern APIs next.' },
            { courseId: 'garbage-collection', reason: 'Choose JVM diagnostics next.' },
            {
              courseId: 'language-comparative-analysis',
              reason: 'Choose language comparison next.',
            },
          ],
        },
      }),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/core-java', Course);

    const next = harness.routeNativeElement!.querySelector('.course-next-column')!;
    expect(
      next.querySelector(':scope > .course-relationship-list')?.querySelectorAll('a'),
    ).toHaveLength(1);
    const alternatives = next.querySelector('.course-other-directions') as HTMLDetailsElement;
    expect(alternatives.open).toBe(false);
    expect(alternatives.querySelector('summary')?.textContent).toContain('Other directions (3)');
    expect(
      Array.from(alternatives.querySelectorAll('a'), (link) => link.textContent?.trim()),
    ).toEqual([
      'Modern Java',
      'JVM Memory and Garbage Collection',
      'Language Selection and Migration',
    ]);
    expect(alternatives.querySelectorAll('.course-direction-reason')).toHaveLength(3);
  });

  it('keeps unavailable relationships visible but noninteractive', async () => {
    vi.spyOn(TestBed.inject(ContentService), 'getCatalog').mockReturnValue(
      of([
        { id: 'advanced-java', title: 'Advanced Java', available: false },
        { id: 'spring-framework', title: 'Spring Framework' },
        { id: 'spring-boot', title: 'Spring Boot', available: false },
      ]),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/grow/spring-framework', Course);

    const map = harness.routeNativeElement!.querySelector('.course-relationship-map')!;
    expect(map.querySelectorAll('.course-background-column a, .course-next-column a')).toHaveLength(
      0,
    );
    expect(map.querySelectorAll('.course-current-node .course-group-return')).toHaveLength(1);
    expect(map.querySelectorAll('.unavailable')).toHaveLength(2);
    expect(map.textContent?.match(/coming next/g)).toHaveLength(2);
  });

  it('renders a background-only map without an empty next column', async () => {
    vi.spyOn(TestBed.inject(ContentService), 'getCourseOutline').mockReturnValue(
      of({
        ...modernJava,
        learningPath: {
          ...modernJava.learningPath!,
          recommendedNext: null,
          otherDirections: [],
        },
      }),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/modern-java', Course);

    const map = harness.routeNativeElement!.querySelector('.course-relationship-map')!;
    expect(map.classList).toContain('background-only');
    expect(map.querySelector('.course-background-column')).not.toBeNull();
    expect(map.querySelector('.course-next-column')).toBeNull();
    expect(map.textContent).not.toContain('Recommended next');
  });

  it('hides the relationship map when neither side has authored relationships', async () => {
    vi.spyOn(TestBed.inject(ContentService), 'getCourseOutline').mockReturnValue(
      of({
        ...modernJava,
        learningPath: {
          ...modernJava.learningPath!,
          backgroundCourseIds: [],
          recommendedNext: null,
          otherDirections: [],
        },
      }),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/modern-java', Course);

    expect(harness.routeNativeElement!.querySelector('.course-learning-path')).toBeNull();
    expect(harness.routeNativeElement!.textContent).not.toContain('Helpful background');
    expect(harness.routeNativeElement!.textContent).not.toContain('Recommended next');
  });

  it('clears the local map when navigating to a course without learning-path metadata', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/grow/spring-framework', Course);
    vi.spyOn(TestBed.inject(ContentService), 'getCourseOutline').mockReturnValue(
      of({ ...springFramework, id: 'spring-boot', title: 'Spring Boot', learningPath: undefined }),
    );
    await harness.navigateByUrl('/grow/spring-boot', Course);

    const intro = harness.routeNativeElement!.querySelector('.course-page-intro')!;
    expect(intro.querySelector('.course-learning-path')).toBeNull();
    expect(intro.textContent).not.toContain('Helpful background');
    expect(intro.textContent).not.toContain('Recommended next');
    expect(intro.textContent).not.toContain('Previous in group');
    expect(intro.textContent).not.toContain('Next in group');
  });
});
