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

  async function ready(harness: RouterTestingHarness) {
    finishRouterScroll();
    loaded.next(catalog);
    harness.detectChanges();
    await harness.fixture.whenStable();
  }

  function finishRouterScroll() {
    // The harness does not bootstrap RouterScroller; model its public post-navigation event.
    const router = TestBed.inject(Router);
    (router.events as Subject<Event>).next(
      new Scroll(new NavigationEnd(1, router.url, router.url), null, null),
    );
  }

  for (const group of GROW_COURSE_GROUPS) {
    it(`routes ${group.title} to Grow, expands it and reveals the heading`, async () => {
      const harness = await RouterTestingHarness.create('/grow');
      await ready(harness);
      const link = harness.routeNativeElement!.querySelector<HTMLAnchorElement>(
        `.catalog-jump-nav a[href="/grow?group=${group.id}"]`,
      )!;
      expect(link).not.toBeNull();
      link.click();
      await harness.fixture.whenStable();
      expect(scrolled).toEqual([]);
      finishRouterScroll();
      harness.detectChanges();

      expect(TestBed.inject(Router).url).toBe(`/grow?group=${group.id}`);
      const section = harness.routeNativeElement!.querySelector<HTMLElement>(
        `#grow-group-${group.id}`,
      )!;
      expect(section.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
      expect(section.querySelector('.catalog-group-summary')?.textContent).toContain(
        `${group.courseIds.length} ${group.courseIds.length === 1 ? 'course' : 'courses'}`,
      );
      expect(section.querySelector('.course-grid')).not.toBeNull();
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

  it('opens a manually collapsed group on a repeated jump to the same URL', async () => {
    const harness = await RouterTestingHarness.create('/grow?group=system-security');
    await ready(harness);
    await vi.waitFor(() => expect(scrolled).toEqual(['grow-group-system-security']));
    const section = harness.routeNativeElement!.querySelector<HTMLElement>(
      '#grow-group-system-security',
    )!;
    section.querySelector<HTMLButtonElement>('button')!.click();
    harness.detectChanges();
    expect(section.querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
    harness
      .routeNativeElement!.querySelector<HTMLAnchorElement>(
        '.catalog-jump-nav a[href="/grow?group=system-security"]',
      )!
      .click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(section.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
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

  it('shows key topics as a labelled curriculum highlight without nested controls', async () => {
    const harness = await RouterTestingHarness.create('/grow');
    finishRouterScroll();
    loaded.next(
      catalog.map((course, index) =>
        index === 0
          ? {
              ...course,
              description: 'Build services with explicit production contracts.',
              topicPreview: ['REST', 'GraphQL', 'OAuth 2.0', 'CSRF', 'Rate limiting'],
            }
          : course,
      ),
    );
    harness.detectChanges();
    await harness.fixture.whenStable();
    const card = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.course-card')!;
    expect(card.textContent).toContain('Build services with explicit production contracts.');
    expect(card.getAttribute('href')).toBe(`/grow/${catalog[0].id}`);
    const topics = card.querySelector<HTMLElement>('ul[aria-label="Key topics"]')!;
    const label = card.querySelector<HTMLElement>('.catalog-key-topics-label')!;
    expect(label.textContent?.trim()).toBe('Key topics');
    expect(label.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(label.querySelector('svg')?.getAttribute('focusable')).toBe('false');
    expect(topics.getAttribute('role')).toBe('list');
    expect([...topics.querySelectorAll('li')].map((item) => item.textContent?.trim())).toEqual([
      'REST',
      'GraphQL',
      'OAuth 2.0',
      'CSRF',
      'Rate limiting',
    ]);
    expect(
      card
        .querySelector('.catalog-key-topics')
        ?.querySelector('a, button, [tabindex], .chip, .pill'),
    ).toBeNull();
    expect(card.querySelector('.catalog-topic-preview')).toBeNull();
  });

  it('bounds the topic preview and omits the section for courses without topics', async () => {
    const harness = await RouterTestingHarness.create('/grow');
    finishRouterScroll();
    loaded.next(
      catalog.map((course, index) =>
        index === 0
          ? {
              ...course,
              topicPreview: Array.from({ length: 12 }, (_, i) => `Topic ${i + 1}`),
            }
          : course,
      ),
    );
    harness.detectChanges();
    await harness.fixture.whenStable();
    const cards = harness.routeNativeElement!.querySelectorAll('.course-card');
    expect(cards[0].querySelectorAll('.catalog-key-topics li')).toHaveLength(8);
    expect(cards[1].querySelector('.catalog-key-topics')).toBeNull();
  });

  for (const [courseId, groupId] of [
    ['vue', 'frontend-engineering'],
    ['nodejs', 'backend-engineering'],
  ]) {
    it(`links ${courseId} to its course overview in the correct group`, async () => {
      const harness = await RouterTestingHarness.create(`/grow?group=${groupId}`);
      await ready(harness);
      const group = harness.routeNativeElement!.querySelector(`#grow-group-${groupId}`)!;
      const card = group.querySelector<HTMLAnchorElement>(
        `a.course-card[href="/grow/${courseId}"]`,
      );
      expect(card).not.toBeNull();
      expect(card?.getAttribute('href')).toBe(`/grow/${courseId}`);
    });
  }

  it('does not invent course cards when a deployment catalog lacks a course', async () => {
    const harness = await RouterTestingHarness.create('/grow?group=frontend-engineering');
    finishRouterScroll();
    loaded.next(catalog.filter((course) => course.id !== 'vue' && course.id !== 'nodejs'));
    harness.detectChanges();
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement!.querySelector('a.course-card[href="/grow/vue"]')).toBeNull();
    expect(
      harness.routeNativeElement!.querySelector('a.course-card[href="/grow/nodejs"]'),
    ).toBeNull();
    expect(
      harness.routeNativeElement!.querySelector('a.course-card[href="/grow/angular"]'),
    ).not.toBeNull();
  });
});
