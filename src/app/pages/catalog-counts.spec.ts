import { HIDDEN_COURSE_IDS } from '../content/hidden-courses';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { CatalogOverviewItem } from '../content/content.models';
import { ContentService } from '../content/content.service';
import { LOOK_AHEAD_COURSE_GROUPS } from '../content/look-ahead-course-groups';
import {
  catalogMonogram,
  catalogQuestionCountDisplay,
} from '../core/adaptive-catalog/adaptive-catalog';
import { Grow } from './grow/grow';
import { LookAhead } from './look-ahead/look-ahead';

describe('catalog question count display', () => {
  it.each([
    [24, 20, true],
    [26, 25, true],
    [31, 30, true],
    [36, 36, false],
    [37, 36, true],
    [52, 50, true],
    [73, 70, true],
    [79, 75, true],
    [82, 80, true],
    [131, 125, true],
    [147, 125, true],
    [150, 150, false],
    [659, 650, true],
    [1471, 1450, true],
  ] as const)('presents %i as the %i minimum with qualifier %s', (exact, value, minimum) => {
    expect(catalogQuestionCountDisplay(exact)).toEqual({ value, minimum });
  });
});

describe('catalog scene fallback monogram', () => {
  it.each([
    ['Core Java', 'CJ'],
    ['SQL', 'SQL'],
    ['Linux', 'L'],
    ['Node.js', 'N'],
    ['Lead, Communicate, and Evolve', 'LC'],
    ['System & Security', 'SS'],
    ['AI Engineering and AI-Assisted Development', 'AE'],
    ['', ''],
  ] as const)('reduces %j to %j', (title, mark) => {
    expect(catalogMonogram(title)).toBe(mark);
  });
});

for (const { path, courseId, component } of [
  { path: 'grow', courseId: 'advanced-java', component: Grow },
  { path: 'look-ahead', courseId: 'resilience-production', component: LookAhead },
]) {
  describe(`${path} curriculum counts`, () => {
    async function render(lessonCount: number, questionCount: number) {
      const course: CatalogOverviewItem = {
        id: courseId,
        title: 'Sample course',
        lessonCount,
        questionCount,
        moduleCount: 26,
        topicPreview: ['Contracts', 'Recovery'],
        languages: [],
      };
      await TestBed.configureTestingModule({
        providers: [
          provideRouter([{ path, component }]),
          { provide: ContentService, useValue: { getCatalogOverview: () => of([course]) } },
        ],
      }).compileComponents();
      return RouterTestingHarness.create(`/${path}`);
    }

    it.each([
      [13, 131],
      [1, 1],
      [0, 0],
    ] as const)(
      'keeps %i lessons and %i questions off the course card without inventing a topic total',
      async (lessons, questions) => {
        const harness = await render(lessons, questions);
        const card = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.course-card')!;
        // The card carries no lesson or question count (user review, 2026-10-03).
        expect(card.querySelector('.catalog-card-kicker')).toBeNull();
        expect(card.textContent).not.toMatch(/\blessons?\b|\bquestions?\b/);
        expect(card.getAttribute('href')).toBe(`/${path}/${courseId}`);
        expect(card.textContent).not.toContain('26 topics');
        // The uniform card keeps to scene, title and description: no topic list.
        expect(card.querySelector('ul, li')).toBeNull();
      },
    );

    it('uses a minimum claim while preserving the exact published count as context', async () => {
      const harness = await render(13, 131);
      const metric = harness.routeNativeElement!.querySelectorAll('.catalog-scoreboard > div')[2];
      expect(metric.querySelector('dt')?.textContent?.trim()).toBe('125');
      expect(metric.querySelector('dt')?.getAttribute('title')).toBe(
        'Exact published total: 131 questions',
      );
      expect(metric.querySelector('dt')?.getAttribute('aria-label')).toBe(
        'More than 125 questions; exact published total 131 questions',
      );
      expect(metric.querySelector('dd')?.textContent?.trim()).toBe(
        'interview and practice questions',
      );
    });
  });
}

describe('adaptive Look Ahead catalog', () => {
  it('keeps every section visible and features only the explicitly authored course', async () => {
    const catalog: CatalogOverviewItem[] = LOOK_AHEAD_COURSE_GROUPS.flatMap((group) =>
      group.courseIds.map((id) => ({
        id,
        title: id,
        description: `Prepare with ${id}.`,
        available: true,
        reviewStatus: 'reviewed',
        lessonCount: 2,
        questionCount: 5,
        moduleCount: 2,
        topicPreview: ['Model', 'Trade-offs', 'Recovery', 'Operations'],
        languages: [],
      })),
    );
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'look-ahead', component: LookAhead }]),
        { provide: ContentService, useValue: { getCatalogOverview: () => of(catalog) } },
      ],
    }).compileComponents();
    const harness = await RouterTestingHarness.create('/look-ahead');
    const root = harness.routeNativeElement!;

    expect(root.querySelectorAll('.catalog-path-section')).toHaveLength(
      LOOK_AHEAD_COURSE_GROUPS.length,
    );
    expect(root.querySelectorAll('.catalog-jump-nav a')).toHaveLength(
      LOOK_AHEAD_COURSE_GROUPS.length,
    );
    expect(
      Array.from(root.querySelectorAll('.featured-catalog-card')).map((card) => card.id),
    ).toEqual(['design-fundamentals']);
    expect(
      root.querySelector('#design-fundamentals .catalog-featured-label')?.textContent?.trim(),
    ).toBe('New: start here');
    expect(root.querySelector('.catalog-path-section .catalog-path-title')?.textContent?.trim()).toBe(
      'System Design Ladder',
    );
    const featured = root.querySelector<HTMLElement>('#design-fundamentals')!;
    expect(featured.querySelectorAll('a')).toHaveLength(0);
  });
});

describe('hidden Look Ahead courses', () => {
  it('stay out of the catalog, its groups, the More to explore section and the counts', async () => {
    const item = (id: string): CatalogOverviewItem => ({
      id,
      title: id,
      description: id,
      available: true,
      lessonCount: 3,
      questionCount: 7,
      moduleCount: 1,
      topicPreview: [],
      languages: [],
    });
    const catalog = [
      item('design-fundamentals'),
      item('resilience-production'),
      ...HIDDEN_COURSE_IDS.map((id) => item(id.split(':')[1])),
    ];
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'look-ahead', component: LookAhead }]),
        { provide: ContentService, useValue: { getCatalogOverview: () => of(catalog) } },
      ],
    }).compileComponents();
    const harness = await RouterTestingHarness.create('/look-ahead');
    const root = harness.routeNativeElement!;
    for (const id of HIDDEN_COURSE_IDS) {
      expect(root.querySelector(`#${id.split(':')[1]}`)).toBeNull();
    }
    expect(root.textContent).not.toContain('More to explore');
    expect(root.querySelectorAll('.course-card')).toHaveLength(2);
    expect(root.querySelectorAll('.catalog-scoreboard > div')[0].querySelector('dt')?.textContent?.trim()).toBe('2');
  });
});

describe('planned Look Ahead course', () => {
  it('renders an unavailable course as a Planned card without a link', async () => {
    const catalog: CatalogOverviewItem[] = [
      {
        id: 'ai-systems-architecture',
        title: 'AI Systems Architecture',
        available: true,
        lessonCount: 2,
        questionCount: 5,
        moduleCount: 2,
        topicPreview: [],
        languages: [],
      },
      {
        id: 'ai-collaborators',
        title: 'AI Collaborators',
        description: 'Work with AI teammates.',
        available: false,
        lessonCount: 0,
        questionCount: 0,
        moduleCount: 0,
        topicPreview: [],
        languages: [],
      },
    ];
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'look-ahead', component: LookAhead }]),
        { provide: ContentService, useValue: { getCatalogOverview: () => of(catalog) } },
      ],
    }).compileComponents();
    const harness = await RouterTestingHarness.create('/look-ahead');
    const card = harness.routeNativeElement!.querySelector<HTMLElement>('#ai-collaborators')!;

    expect(card.tagName).toBe('ARTICLE');
    expect(card.classList).toContain('unavailable');
    expect(card.getAttribute('href')).toBeNull();
    expect(card.querySelector('.review-status')?.textContent?.trim()).toBe('Planned');
    expect(card.querySelector('h3')?.textContent?.trim()).toBe('AI Collaborators');
    expect(card.querySelector('a, [href]')).toBeNull();
    expect(card.textContent).toContain('Work with AI teammates.');
    expect(card.querySelector('app-card-scene [role="img"]')?.getAttribute('aria-label')).toBe(
      'AI Collaborators illustration',
    );
    expect(
      harness.routeNativeElement!.querySelector('#ai-systems-architecture')?.tagName,
    ).toBe('A');
  });
});

describe('adaptive catalog recovery', () => {
  it('retries the same catalog after a transient load failure', async () => {
    const course: CatalogOverviewItem = {
      id: 'advanced-java',
      title: 'Advanced Java',
      lessonCount: 1,
      questionCount: 1,
      moduleCount: 1,
      topicPreview: ['Concurrency'],
      languages: ['java'],
    };
    const getCatalogOverview = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('temporary outage')))
      .mockReturnValueOnce(of([course]));
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'grow', component: Grow }]),
        { provide: ContentService, useValue: { getCatalogOverview } },
      ],
    }).compileComponents();
    const harness = await RouterTestingHarness.create('/grow');
    const retry = harness.routeNativeElement!.querySelector<HTMLButtonElement>(
      'app-content-recovery button.primary-action',
    )!;

    expect(harness.routeNativeElement?.textContent).toContain('We couldn’t load this content');
    retry.click();
    harness.detectChanges();

    expect(getCatalogOverview).toHaveBeenCalledTimes(2);
    expect(harness.routeNativeElement?.textContent).toContain('Advanced Java');
    expect(harness.routeNativeElement?.textContent).not.toContain('We couldn’t load this content');
  });
});
