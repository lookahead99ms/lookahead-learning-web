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

describe('Course learning path', () => {
  beforeEach(async () => {
    const content = {
      getCourse: vi.fn((_pathId: string, courseId: string) =>
        of(courseId === modernJava.id ? modernJava : javaFoundations),
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
});
