import { TestBed } from '@angular/core/testing';
import {
  Event,
  NavigationEnd,
  provideRouter,
  Router,
  Scroll,
  withInMemoryScrolling,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { CatalogOverviewItem } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { GROW_COURSE_GROUPS } from '../../content/grow-course-groups';
import { Grow } from './grow';

const catalog: CatalogOverviewItem[] = GROW_COURSE_GROUPS.flatMap((group) =>
  group.courseIds.map((id) => ({
    id,
    title: id,
    description: `Build ${id} capabilities.`,
    available: true,
    reviewStatus: 'reviewed',
    lessonCount: 1,
    questionCount: 3,
    moduleCount: 1,
    topicPreview: [],
    languages: [],
  })),
);

describe('Grow catalog', () => {
  let loaded: Subject<CatalogOverviewItem[]>;
  let scrolled: string[];
  const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');

  beforeAll(() => {
    if (!originalScroll) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        writable: true,
        value: () => {},
      });
    }
  });

  afterAll(() => {
    if (!originalScroll) Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });

  beforeEach(async () => {
    loaded = new Subject<CatalogOverviewItem[]>();
    scrolled = [];
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (
      this: HTMLElement,
    ) {
      scrolled.push(this.id);
    });
    await TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [{ path: 'grow', component: Grow }],
          withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
        ),
        { provide: ContentService, useValue: { getCatalogOverview: () => loaded } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function ready(harness: RouterTestingHarness, courses = catalog) {
    finishRouterScroll();
    loaded.next(courses);
    harness.detectChanges();
    await harness.fixture.whenStable();
  }

  function finishRouterScroll() {
    const router = TestBed.inject(Router);
    (router.events as Subject<Event>).next(
      new Scroll(new NavigationEnd(1, router.url, router.url), null, null),
    );
  }

  for (const group of GROW_COURSE_GROUPS) {
    it(`routes ${group.title} to a visible Grow section and reveals its heading`, async () => {
      const harness = await RouterTestingHarness.create('/grow');
      await ready(harness);
      harness
        .routeNativeElement!.querySelector<HTMLAnchorElement>(
          `.catalog-jump-nav a[href="/grow?group=${group.id}"]`,
        )!
        .click();
      await harness.fixture.whenStable();
      expect(scrolled).toEqual([]);
      finishRouterScroll();
      harness.detectChanges();

      expect(TestBed.inject(Router).url).toBe(`/grow?group=${group.id}`);
      const section = harness.routeNativeElement!.querySelector<HTMLElement>(
        `#grow-group-${group.id}`,
      )!;
      expect(section.querySelector('button')).toBeNull();
      expect(section.querySelector('.catalog-path-title')?.textContent).toContain(group.title);
      expect(section.querySelector('.catalog-path-summary')?.textContent).toContain(
        `${group.courseIds.length} ${group.courseIds.length === 1 ? 'course' : 'courses'}`,
      );
      expect(section.querySelector('.catalog-course-grid')).not.toBeNull();
      await vi.waitFor(() => expect(scrolled.at(-1)).toBe(section.id));
      expect(section.style.scrollMarginTop).toBeTruthy();
    });
  }

  it('waits for delayed catalog data before revealing a direct group URL', async () => {
    const harness = await RouterTestingHarness.create('/grow?group=cloud-delivery');
    expect(scrolled).toEqual([]);
    await ready(harness);
    await vi.waitFor(() => expect(scrolled).toEqual(['grow-group-cloud-delivery']));
  });

  it('reveals a section again when its current Jump to link is repeated', async () => {
    const harness = await RouterTestingHarness.create('/grow?group=system-security');
    await ready(harness);
    await vi.waitFor(() => expect(scrolled).toEqual(['grow-group-system-security']));
    harness
      .routeNativeElement!.querySelector<HTMLAnchorElement>(
        '.catalog-jump-nav a[href="/grow?group=system-security"]',
      )!
      .click();
    await harness.fixture.whenStable();
    expect(scrolled).toEqual(['grow-group-system-security', 'grow-group-system-security']);
  });

  it('ignores invalid groups and cancels a pending group before data arrives', async () => {
    const harness = await RouterTestingHarness.create('/grow?group=cloud-delivery');
    await harness.navigateByUrl('/grow?group=unknown', Grow);
    await ready(harness);
    expect(scrolled).toEqual([]);
  });

  it('uses immediate scrolling when reduced motion is requested', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    const harness = await RouterTestingHarness.create('/grow?group=frontend-engineering');
    await ready(harness);
    await vi.waitFor(() =>
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenLastCalledWith({
        behavior: 'instant',
        block: 'start',
      }),
    );
  });

  it('shows every production capability without accordion disclosure', async () => {
    const harness = await RouterTestingHarness.create('/grow');
    await ready(harness);
    expect(harness.routeNativeElement!.querySelectorAll('.catalog-path-section')).toHaveLength(
      GROW_COURSE_GROUPS.length,
    );
    expect(harness.routeNativeElement!.querySelectorAll('.catalog-group-heading')).toHaveLength(0);
  });

  it('shows key topics as a styled, bounded curriculum preview without nested controls', async () => {
    const harness = await RouterTestingHarness.create('/grow');
    await ready(
      harness,
      catalog.map((course, index) =>
        index === 0
          ? {
              ...course,
              topicPreview: ['REST', 'GraphQL', 'OAuth 2.0', 'CSRF', 'Rate limiting'],
            }
          : course,
      ),
    );
    const card = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.course-card')!;
    const preview = card.querySelector<HTMLElement>('.catalog-course-preview')!;
    expect(preview.querySelector('.catalog-course-preview-label')?.textContent?.trim()).toBe(
      'Key topics',
    );
    expect(
      [...preview.querySelectorAll('ul[aria-label="Key topics"] li')].map((item) =>
        item.textContent?.trim(),
      ),
    ).toEqual(['REST', 'GraphQL', 'OAuth 2.0']);
    expect(preview.querySelector('a, button, [tabindex], .chip, .pill')).toBeNull();
  });

  for (const [courseId, groupId] of [
    ['vue', 'frontend-engineering'],
    ['nodejs', 'backend-engineering'],
  ]) {
    it(`links ${courseId} to its course overview in the correct group`, async () => {
      const harness = await RouterTestingHarness.create(`/grow?group=${groupId}`);
      await ready(harness);
      const group = harness.routeNativeElement!.querySelector(`#grow-group-${groupId}`)!;
      expect(group.querySelector(`a.course-card[href="/grow/${courseId}"]`)).not.toBeNull();
    });
  }

  it('does not invent course cards when a deployment catalog lacks a course', async () => {
    const harness = await RouterTestingHarness.create('/grow?group=frontend-engineering');
    await ready(
      harness,
      catalog.filter((course) => course.id !== 'vue' && course.id !== 'nodejs'),
    );
    expect(harness.routeNativeElement!.querySelector('a[href="/grow/vue"]')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('a[href="/grow/nodejs"]')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('a[href="/grow/angular"]')).not.toBeNull();
  });
});
