import { DOCUMENT } from '@angular/common';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { DEFAULT_DESCRIPTION, HOME_TITLE } from './page-meta';
import { protectedBodyFixture, clearHead, head, locatorFixture } from './page-meta.fixture';
import { PageTitleStrategy } from './page-title-strategy';
import { PUBLIC_METADATA_URL } from './public-page-metadata';

@Component({ template: '' })
class Blank {}

const LOCATOR = '/content/learn/core-java/content-locator.json';
const LESSON_DETAIL = '/content/learn/core-java/modules/java-platform.json';

describe('PageTitleStrategy', () => {
  let router: Router;
  let http: HttpTestingController;
  let document: Document;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Blank },
          { path: 'learn', component: Blank },
          { path: 'account', component: Blank },
          { path: 'learn/:courseId', component: Blank },
          { path: 'learn/:courseId/:questionId', component: Blank },
          { path: 'titled', title: 'Explicit | LookAhead', component: Blank },
          { path: '**', component: Blank },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideLocationMocks(),
        { provide: TitleStrategy, useExisting: PageTitleStrategy },
      ],
    });
    router = TestBed.inject(Router);
    http = TestBed.inject(HttpTestingController);
    document = TestBed.inject(DOCUMENT);
    clearHead(document);
  });

  afterEach(() => http.verify());

  /** The course part loads lazily, so its request appears shortly after navigation. */
  async function pendingRequests(): Promise<TestRequest[]> {
    let requests: TestRequest[] = [];
    await vi.waitFor(() => {
      requests = http.match(() => true);
      expect(requests.length).toBeGreaterThan(0);
    });
    return requests;
  }

  const description = () =>
    document.head.querySelector('meta[name="description"]')?.getAttribute('content');
  const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute('content');

  it('keeps the home page title and default description', async () => {
    await router.navigateByUrl('/');
    expect(document.title).toBe(HOME_TITLE);
    expect(description()).toBe(DEFAULT_DESCRIPTION);
    expect(robots()).toBeUndefined();
  });

  it('marks personal pages and unknown addresses noindex', async () => {
    await router.navigateByUrl('/account');
    expect(document.title).toBe('Account | LookAhead');
    expect(robots()).toBe('noindex');
    await router.navigateByUrl('/no/such/page');
    expect(document.title).toBe('Page not found | LookAhead');
    await router.navigateByUrl('/learn');
    expect(robots()).toBeUndefined();
  });

  it('uses a route title when one is configured', async () => {
    await router.navigateByUrl('/titled');
    expect(document.title).toBe('Explicit | LookAhead');
  });

  it('describes a lesson from public metadata and never from its protected body', async () => {
    await router.navigateByUrl('/learn/core-java/java-platform-execution-model');
    // Until the public metadata arrives, the catalog's meta is shown.
    expect(document.title).toBe('Learn | LookAhead');

    // The only request the meta system makes is the public course locator.
    const requests = await pendingRequests();
    expect(requests.map(({ request }) => request.url)).toEqual([LOCATOR]);
    expect(PUBLIC_METADATA_URL.test(LOCATOR)).toBe(true);
    requests[0].flush(locatorFixture());

    expect(document.title).toBe('How Java runs your code | Java Foundations | LookAhead');
    expect(description()).toBe(
      'Lesson from Java Foundations: How Java runs your code. How a Java file becomes a running program.',
    );
    expect(
      document.head.querySelector('meta[property="og:type"]')?.getAttribute('content'),
    ).toBe('article');
    expect(
      document.head.querySelector('meta[property="og:image"]')?.getAttribute('content'),
    ).toBe(`${document.location.origin}/assets/scenes/units/learn/core-java/java-platform.svg`);

    // The lesson page then loads its protected body with a grant; the meta tags do not change.
    const before = head(document);
    TestBed.inject(HttpClient).get(LESSON_DETAIL).subscribe();
    http.expectOne(LESSON_DETAIL).flush([
      {
        id: 'java-platform-execution-model',
        title: 'How Java runs your code',
        summary: protectedBodyFixture,
        interviewAnswer: protectedBodyFixture,
        code: protectedBodyFixture,
      },
    ]);
    expect(head(document)).toBe(before);
    expect(head(document)).not.toContain(protectedBodyFixture);
  });

  it('reuses loaded course metadata across pages of the same course', async () => {
    await router.navigateByUrl('/learn/core-java');
    (await pendingRequests()).forEach((request) => request.flush(locatorFixture()));
    expect(document.title).toBe('Java Foundations | Learn | LookAhead');
    await router.navigateByUrl('/learn/core-java/compiled-or-interpreted');
    await vi.waitFor(() =>
      expect(document.title).toBe('Is Java compiled or interpreted? | Java Foundations | LookAhead'),
    );
    http.expectNone(LOCATOR);
    expect(head(document)).not.toContain(protectedBodyFixture);
  });

  it('does not let a slow lookup overwrite a later page', async () => {
    await router.navigateByUrl('/learn/core-java');
    const [locator] = await pendingRequests();
    await router.navigateByUrl('/account');
    locator.flush(locatorFixture());
    expect(document.title).toBe('Account | LookAhead');
    expect(robots()).toBe('noindex');
  });

  it('keeps the catalog meta when public metadata fails, and retries on the next visit', async () => {
    await router.navigateByUrl('/learn/core-java');
    const [failed] = await pendingRequests();
    expect(failed.request.url).toBe(LOCATOR);
    failed.flush('missing', { status: 404, statusText: 'Not Found' });
    expect(document.title).toBe('Learn | LookAhead');
    await router.navigateByUrl('/learn');
    await router.navigateByUrl('/learn/core-java');
    const [retry] = await pendingRequests();
    expect(retry.request.url).toBe(LOCATOR);
    retry.flush(locatorFixture());
    expect(document.title).toBe('Java Foundations | Learn | LookAhead');
  });
});
