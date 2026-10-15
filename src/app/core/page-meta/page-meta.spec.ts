import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_DESCRIPTION,
  HOME_TITLE,
  PageMetaService,
  canonicalUrl,
  metaText,
  pageTitle,
} from './page-meta';
import { PublicCourseMetadata, dynamicPageMeta } from './course-page-meta';
import { pageTarget, staticPageMeta } from './page-meta-routes';
import { publicCourseMetadata } from './public-page-metadata';
import { protectedBodyFixture, clearHead, head, locatorFixture } from './page-meta.fixture';


function course(): PublicCourseMetadata {
  return publicCourseMetadata(locatorFixture(), 'learn', 'core-java')!;
}

describe('page meta text helpers', () => {
  it('builds titles with the site name last and skips empty parts', () => {
    expect(pageTitle('Lesson', '', 'Course')).toBe('Lesson | Course | LookAhead');
    expect(pageTitle()).toBe('LookAhead');
  });

  it('turns authored HTML into plain text and cuts long text at a word', () => {
    expect(metaText('Use <code>javac</code> &amp; the   JVM.')).toBe('Use javac & the JVM.');
    const long = metaText('word '.repeat(100), 40);
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith('word…')).toBe(true);
  });

  it('makes canonical addresses from the path only', () => {
    expect(canonicalUrl('https://example.test/', '/learn/core-java?tab=1#unit-a')).toBe(
      'https://example.test/learn/core-java',
    );
    expect(canonicalUrl('https://example.test', '/')).toBe('https://example.test/');
    expect(canonicalUrl('https://example.test', '/grow/')).toBe('https://example.test/grow');
  });
});

describe('route classification', () => {
  it('recognizes course, module, section and lesson routes of every catalog', () => {
    expect(pageTarget('learn/:courseId', { courseId: 'core-java' })).toEqual({
      kind: 'course',
      path: 'learn',
      courseId: 'core-java',
    });
    expect(
      pageTarget('grow/:courseId/module/:moduleId', { courseId: 'api-design', moduleId: 'rest' }),
    ).toEqual({ kind: 'module', path: 'grow', courseId: 'api-design', moduleId: 'rest' });
    expect(
      pageTarget('learn/:courseId/section/:sectionId', { courseId: 'sql', sectionId: 'practice' }),
    ).toEqual({ kind: 'section', path: 'learn', courseId: 'sql', sectionId: 'practice' });
    expect(
      pageTarget('blaze/:courseId/:questionId', { courseId: 'design-systems', questionId: 'cache' }),
    ).toEqual({ kind: 'lesson', path: 'blaze', courseId: 'design-systems', itemId: 'cache' });
  });

  it('treats unknown, malformed and non-catalog routes as static pages', () => {
    expect(pageTarget('learn/hands-on-dsa', {})).toEqual({
      kind: 'static',
      routePath: 'learn/hands-on-dsa',
    });
    expect(pageTarget('learn/:courseId', { courseId: '../secret' }).kind).toBe('static');
    expect(pageTarget('admin/:page', { page: 'x' }).kind).toBe('static');
  });
});

describe('static page meta', () => {
  it('keeps the home title and the default description', () => {
    expect(staticPageMeta({ kind: 'static', routePath: '' })).toEqual({
      title: HOME_TITLE,
      description: DEFAULT_DESCRIPTION,
    });
  });

  it('describes catalogs with their landing scene', () => {
    const blaze = staticPageMeta({ kind: 'static', routePath: 'blaze' });
    expect(blaze.title).toBe('Blaze | LookAhead');
    expect(blaze.image).toBe('/assets/scenes/landing/blaze.svg');
    expect(blaze.index).toBeUndefined();
  });

  it('gives other public pages their own indexable title', () => {
    for (const [routePath, title] of [
      ['learn/hands-on-dsa', 'Hands-On DSA | Learn | LookAhead'],
      ['start-free', 'Start free | LookAhead'],
    ]) {
      const page = staticPageMeta({ kind: 'static', routePath });
      expect(page.title).toBe(title);
      expect(page.index).toBeUndefined();
    }
  });

  it('keeps sample pricing noindex with a plain description', () => {
    expect(staticPageMeta({ kind: 'static', routePath: 'pricing' })).toEqual({
      title: 'Pricing | LookAhead',
      description: 'Sample plans and prices for Look Ahead. Prices are not final.',
      index: false,
    });
  });

  it('marks personal, internal and unknown pages noindex', () => {
    for (const routePath of [
      'account',
      'sign-in',
      'sign-in/choose',
      'sign-up',
      'support',
      'study-plan',
      'delivery-plan',
      'admin/previews',
      'admin/aws-dev-plan',
      'preview/landing/1',
      'search',
      '**',
    ]) {
      expect(staticPageMeta({ kind: 'static', routePath }).index, routePath).toBe(false);
    }
    expect(staticPageMeta({ kind: 'static', routePath: 'sign-up' }).title).toBe(
      'Create account | LookAhead',
    );
  });

  it('shows the catalog meta while a course page loads', () => {
    expect(staticPageMeta({ kind: 'course', path: 'grow', courseId: 'x' }).title).toBe(
      'Grow | LookAhead',
    );
  });
});

describe('course-scoped page meta (public metadata only)', () => {
  it('copies only allowlisted title and description fields from a locator', () => {
    const metadata = course();
    expect(JSON.stringify(metadata)).not.toContain(protectedBodyFixture);
    expect(metadata.items[0]).toEqual({
      id: 'java-platform-execution-model',
      moduleId: 'java-platform',
      title: 'How Java runs your code',
      contentType: 'theory',
    });
    expect(metadata.units.map(({ id }) => id)).toEqual(['java-platform', 'generics']);
    // Protected /content/ scenes are not public images; only shipped /assets/scenes/ files are.
    expect(metadata.units[1].scene).toBeUndefined();
  });

  it('rejects a locator for another course or schema', () => {
    expect(publicCourseMetadata(locatorFixture(), 'grow', 'core-java')).toBeNull();
    expect(publicCourseMetadata(locatorFixture(), 'learn', 'sql')).toBeNull();
    expect(publicCourseMetadata({ ...locatorFixture(), schemaVersion: 'x' }, 'learn', 'core-java')).toBeNull();
    expect(publicCourseMetadata(null, 'learn', 'core-java')).toBeNull();
  });

  it('describes a course with its catalog description and course scene', () => {
    const page = dynamicPageMeta({ kind: 'course', path: 'learn', courseId: 'core-java' }, course());
    expect(page.title).toBe('Java Foundations | Learn | LookAhead');
    expect(metaText(page.description)).toBe('LEARN Java from your first program.');
    expect(page.image).toBe('/assets/scenes/courses/learn-core-java.svg');
  });

  it('describes a lesson by its title, course and unit description', () => {
    const page = dynamicPageMeta(
      { kind: 'lesson', path: 'learn', courseId: 'core-java', itemId: 'java-platform-execution-model' },
      course(),
    );
    expect(page).toEqual({
      title: 'How Java runs your code | Java Foundations | LookAhead',
      description:
        'Lesson from Java Foundations: How Java runs your code. How a Java file becomes a running program.',
      image: '/assets/scenes/units/learn/core-java/java-platform.svg',
      type: 'article',
    });
  });

  it('labels questions and falls back to the course scene when the unit scene is protected', () => {
    const page = dynamicPageMeta(
      { kind: 'lesson', path: 'learn', courseId: 'core-java', itemId: 'compiled-or-interpreted' },
      course(),
    );
    expect(page.description).toBe(
      'Interview question from Java Foundations: Is Java compiled or interpreted? Typed collections without casts.',
    );
    expect(page.image).toBe('/assets/scenes/courses/learn-core-java.svg');
  });

  it('describes modules and sections, and falls back to the course for unknown ids', () => {
    const module = dynamicPageMeta(
      { kind: 'module', path: 'learn', courseId: 'core-java', moduleId: 'java-platform' },
      course(),
    );
    expect(module.title).toBe('Java Platform Fundamentals | Java Foundations | LookAhead');
    expect(module.description).toBe('Write and run your first Java program.');
    const section = dynamicPageMeta(
      { kind: 'section', path: 'learn', courseId: 'core-java', sectionId: 'practice' },
      course(),
    );
    expect(section.title).toBe('Practice set | Java Foundations | LookAhead');
    const missing = dynamicPageMeta(
      { kind: 'lesson', path: 'learn', courseId: 'core-java', itemId: 'nope' },
      course(),
    );
    expect(missing.title).toBe('Java Foundations | Learn | LookAhead');
  });
});

describe('PageMetaService', () => {
  let document: Document;
  let service: PageMetaService;

  beforeEach(() => {
    service = TestBed.inject(PageMetaService);
    document = TestBed.inject(DOCUMENT);
    clearHead(document);
  });

  const content = (selector: string) =>
    document.head.querySelector(selector)?.getAttribute('content') ?? null;

  it('sets title, description, canonical, Open Graph and Twitter tags', () => {
    const origin = document.location.origin;
    service.apply(
      {
        title: 'Java Foundations | Learn | LookAhead',
        description: 'Start with <em>Java</em>.',
        image: '/assets/scenes/courses/learn-core-java.svg',
      },
      '/learn/core-java?from=search#unit-a',
    );
    expect(document.title).toBe('Java Foundations | Learn | LookAhead');
    expect(content('meta[name="description"]')).toBe('Start with Java.');
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${origin}/learn/core-java`,
    );
    expect(content('meta[property="og:title"]')).toBe('Java Foundations | Learn | LookAhead');
    expect(content('meta[property="og:description"]')).toBe('Start with Java.');
    expect(content('meta[property="og:type"]')).toBe('website');
    expect(content('meta[property="og:url"]')).toBe(`${origin}/learn/core-java`);
    expect(content('meta[property="og:image"]')).toBe(
      `${origin}/assets/scenes/courses/learn-core-java.svg`,
    );
    expect(content('meta[property="og:site_name"]')).toBe('LookAhead');
    expect(content('meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(content('meta[name="twitter:image"]')).toBe(
      `${origin}/assets/scenes/courses/learn-core-java.svg`,
    );
    expect(content('meta[name="robots"]')).toBeNull();
  });

  it('removes the previous image and adds noindex for private pages', () => {
    service.apply(
      { title: 'A', description: 'B', image: '/assets/scenes/landing/learn.svg' },
      '/learn',
    );
    service.apply({ title: 'Account | LookAhead', description: '', index: false }, '/account');
    expect(content('meta[property="og:image"]')).toBeNull();
    expect(content('meta[name="twitter:image"]')).toBeNull();
    expect(content('meta[name="twitter:card"]')).toBe('summary');
    expect(content('meta[name="robots"]')).toBe('noindex');
    expect(content('meta[name="description"]')).toBe(DEFAULT_DESCRIPTION);
    expect(document.head.querySelectorAll('link[rel="canonical"]').length).toBe(1);
    expect(document.head.querySelectorAll('meta[name="description"]').length).toBe(1);
  });

  it('ignores images outside the shipped scene folder', () => {
    service.apply(
      { title: 'A', description: 'B', image: '/content/learn/core-java/visuals/cards/a.svg' },
      '/learn',
    );
    expect(content('meta[property="og:image"]')).toBeNull();
    service.apply({ title: 'A', description: 'B', image: 'https://evil.test/a.svg' }, '/learn');
    expect(content('meta[property="og:image"]')).toBeNull();
    expect(head(document)).not.toContain('evil.test');
  });
});
