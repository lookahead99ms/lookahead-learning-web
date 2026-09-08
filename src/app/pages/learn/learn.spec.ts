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
import { LEARN_COURSE_GROUPS } from '../../content/learn-course-groups';
import { catalogQuestionCountDisplay } from '../../core/adaptive-catalog/adaptive-catalog';
import { Learn } from './learn';

const catalog: CatalogOverviewItem[] = LEARN_COURSE_GROUPS.flatMap((group) =>
  group.courseIds.map((id) => ({
    id,
    title: id,
    description: `Learn ${id}.`,
    entryContentId: id === 'sorting-searching' ? 'sorting-searching-foundation-article' : undefined,
    available: true,
    reviewStatus: 'reviewed',
    lessonCount: 1,
    questionCount: 3,
    moduleCount: 1,
    topicPreview: [],
    languages: [],
  })),
);

describe('Learn catalog', () => {
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
          [{ path: 'learn', component: Learn }],
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

  for (const group of LEARN_COURSE_GROUPS) {
    it(`routes ${group.title} to a visible Learn section and reveals its heading`, async () => {
      const harness = await RouterTestingHarness.create('/learn');
      await ready(harness);
      const link = harness.routeNativeElement!.querySelector<HTMLAnchorElement>(
        `.catalog-jump-nav a[href="/learn?group=${group.id}"]`,
      )!;
      link.click();
      await harness.fixture.whenStable();
      expect(scrolled).toEqual([]);
      finishRouterScroll();
      harness.detectChanges();

      expect(TestBed.inject(Router).url).toBe(`/learn?group=${group.id}`);
      const section = harness.routeNativeElement!.querySelector<HTMLElement>(
        `#learn-group-${group.id}`,
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
    const harness = await RouterTestingHarness.create('/learn?group=engineering-tools');
    expect(scrolled).toEqual([]);
    await ready(harness);
    await vi.waitFor(() => expect(scrolled).toEqual(['learn-group-engineering-tools']));
  });

  it('reveals a section again when its current Jump to link is repeated', async () => {
    const harness = await RouterTestingHarness.create('/learn?group=java-platform');
    await ready(harness);
    await vi.waitFor(() => expect(scrolled).toEqual(['learn-group-java-platform']));
    harness
      .routeNativeElement!.querySelector<HTMLAnchorElement>(
        '.catalog-jump-nav a[href="/learn?group=java-platform"]',
      )!
      .click();
    await harness.fixture.whenStable();
    expect(scrolled).toEqual(['learn-group-java-platform', 'learn-group-java-platform']);
  });

  it('ignores invalid groups and cancels a pending group before data arrives', async () => {
    const harness = await RouterTestingHarness.create('/learn?group=engineering-tools');
    await harness.navigateByUrl('/learn?group=unknown', Learn);
    await ready(harness);
    expect(scrolled).toEqual([]);
  });

  it('uses immediate scrolling when reduced motion is requested', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    const harness = await RouterTestingHarness.create('/learn?group=object-design-lld');
    await ready(harness);
    await vi.waitFor(() =>
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenLastCalledWith({
        behavior: 'instant',
        block: 'start',
      }),
    );
  });

  it('shows shared depth and actions while keeping every foundation section visible', async () => {
    const harness = await RouterTestingHarness.create('/learn');
    await ready(harness);
    const hero = harness.routeNativeElement!.querySelector<HTMLElement>('.catalog-depth-hero')!;
    expect(hero.textContent).toContain(`${catalog.length}`);
    const questionMetric = hero.querySelectorAll('.catalog-scoreboard > div')[2];
    expect(questionMetric.querySelector('dt')?.textContent?.trim()).toBe(
      `${catalogQuestionCountDisplay(catalog.length * 3).value}`,
    );
    expect(questionMetric.querySelector('dt')?.getAttribute('aria-label')).toContain(
      `exact published total ${catalog.length * 3} questions`,
    );
    expect(
      hero.querySelector('a[href="/learn?group=language-foundations"]')?.textContent,
    ).toContain('Choose a starting foundation');
    expect(hero.querySelector('a[href="/interview-questions?path=learn"]')).not.toBeNull();
    expect(hero.querySelector('a[href="/study-plan"]')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelectorAll('.catalog-path-section')).toHaveLength(
      LEARN_COURSE_GROUPS.length,
    );
    expect(harness.routeNativeElement!.querySelectorAll('.catalog-group-heading')).toHaveLength(0);
  });

  it('uses h2 section headings and h3 course titles', async () => {
    const harness = await RouterTestingHarness.create('/learn');
    await ready(harness);
    expect(harness.routeNativeElement!.querySelector('.catalog-path-heading h2')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelector('.course-card h3')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelector('.course-card h2')).toBeNull();
  });

  it('labels generated module names as a bounded course preview without nested controls', async () => {
    const harness = await RouterTestingHarness.create('/learn');
    await ready(
      harness,
      catalog.map((course, index) =>
        index === 0
          ? { ...course, topicPreview: ['Syntax', 'Types', 'Exceptions', 'Generics'] }
          : course,
      ),
    );
    const card = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('#core-java')!;
    expect(card.querySelector('.catalog-course-preview-label')?.textContent?.trim()).toBe(
      'Inside this course',
    );
    const preview = card.querySelector<HTMLElement>('ul[aria-label="Course preview"]')!;
    expect([...preview.querySelectorAll('li')].map((item) => item.textContent?.trim())).toEqual([
      'Syntax',
      'Types',
      'Exceptions',
    ]);
    expect(preview.querySelector('a, button, [tabindex], .chip, .pill')).toBeNull();
  });

  it('opens the course overview instead of a direct entry lesson', async () => {
    const harness = await RouterTestingHarness.create('/learn?group=data-structures-algorithms');
    await ready(harness);
    const card = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('#sorting-searching');
    expect(card?.getAttribute('href')).toBe('/learn/sorting-searching');
    expect(card?.textContent).toContain('Explore course');
  });

  it('does not invent course cards when a deployment catalog lacks a course', async () => {
    const harness = await RouterTestingHarness.create('/learn?group=engineering-tools');
    await ready(
      harness,
      catalog.filter((course) => course.id !== 'docker'),
    );
    expect(harness.routeNativeElement!.querySelector('a[href="/learn/docker"]')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('a[href="/learn/git"]')).not.toBeNull();
  });
});
