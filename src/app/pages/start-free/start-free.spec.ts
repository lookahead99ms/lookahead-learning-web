import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of, throwError } from 'rxjs';
import { AccessLevels, AccessLevelsService, parseAccessLevels } from '../../content/access-levels';
import { CourseLearningUnit, CourseOutline } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import {
  MISSING_SHOWCASE,
  StartFreePage,
  fitShowcase,
  paidLessonsShown,
  startFreeGroups,
  startFreeShowcase,
  startFreeTarget,
} from './start-free';

function outline(path: string, id: string, title: string, units: CourseLearningUnit[]): CourseOutline {
  return {
    id,
    path,
    title,
    description: `${title}.`,
    version: '1',
    layout: 'learning-map',
    learningUnits: units,
    modules: units.map((unit, index) => ({
      id: unit.theoryModuleId,
      order: index + 1,
      title: unit.title,
      description: unit.description,
    })),
    questions: units
      .filter((unit) => unit.id !== 'no-lesson')
      .map((unit, index) => ({
        id: `${unit.id}-lesson`,
        moduleId: unit.theoryModuleId,
        order: index + 1,
        title: `${unit.title} lesson`,
        difficulty: 'Beginner' as const,
        tags: [],
        contentType: 'theory' as const,
        isTheoryArticle: true,
        detailRef: {
          kind: 'content-item' as const,
          href: `/content/details/${path}/${id}/${unit.theoryModuleId}/${unit.id}-lesson.json`,
          version: 'v1',
        },
      })),
    moduleDetailRefs: [],
  };
}

const unit = (id: string, title: string): CourseLearningUnit => ({
  id,
  title,
  description: `${title} description.`,
  theoryModuleId: `${id}-module`,
});

const outlines: Record<string, CourseOutline> = {
  'learn/core-java': outline('learn', 'core-java', 'Java Foundations', [
    unit('java-platform', 'Java Platform'),
    unit('error-handling', 'Error Handling'),
    unit('collections', 'Collections'),
  ]),
  'blaze/system-design': outline('blaze', 'system-design', 'System Design', [
    unit('interview-method', 'Interview Method'),
    unit('no-lesson', 'Case Studies'),
  ]),
  'grow/broken': outline('grow', 'broken', 'Broken', [unit('lost', 'Lost')]),
};

const levels = parseAccessLevels({
  schemaVersion: 'content-access-levels/v1',
  policyVersion: 'test',
  defaultLevel: 'pro',
  units: {
    'blaze/system-design/interview-method': 'open',
    'learn/core-java/java-platform': 'open',
    'learn/core-java/error-handling': 'free',
    'blaze/system-design/no-lesson': 'free',
    'grow/broken/lost': 'free',
  },
})!;

describe('startFreeShowcase (what you are missing)', () => {
  const map = new Map<string, CourseOutline | null>(Object.entries(outlines));
  const showcase = [
    { key: 'learn/core-java', area: 'alg', size: 'big' as const, shown: 1, columns: 2 as const },
    { key: 'blaze/missing', area: 'sql', size: 'small' as const, shown: 3, columns: 1 as const },
  ];

  it('lists the paid units of each showcase course, with the plans that include them', () => {
    expect(startFreeShowcase(levels, map, () => false, showcase)).toEqual([
      {
        key: 'learn/core-java',
        path: 'learn',
        pathLabel: 'Learn',
        courseTitle: 'Java Foundations',
        courseRoute: ['/', 'learn', 'core-java'],
        area: 'alg',
        size: 'big',
        columns: 2,
        fromPrice: 'From $69.99/year',
        units: [{ key: 'learn/core-java/collections', title: 'Collections', fragment: 'unit-collections' }],
        more: 0,
        paidTotal: 1,
        plansLine: 'Included in Learn, Advance and Complete, from $69.99/year.',
      },
    ]);
  });

  it('leaves out courses the learner can already open', () => {
    expect(startFreeShowcase(levels, map, (path) => path === 'learn', showcase)).toEqual([]);
  });

  it('fills a 4×6 grid exactly with mixed tile sizes', () => {
    const cells = { big: 4, wide: 2, tall: 2, small: 1 };
    expect(MISSING_SHOWCASE.reduce((total, tile) => total + cells[tile.size], 0)).toBe(24);
    for (const added of ['grow/api-design', 'grow/aws-cloud', 'blaze/ai-systems-architecture', 'grow/distributed-systems'])
      expect(MISSING_SHOWCASE.map((tile) => tile.key)).toContain(added);
    const keys = MISSING_SHOWCASE.map((tile) => tile.key);
    expect(keys).toContain('blaze/design-systems');
    expect(MISSING_SHOWCASE.find((tile) => tile.key === 'blaze/design-systems')?.size).toBe('big');
    expect(MISSING_SHOWCASE.find((tile) => tile.key === 'blaze/design-fundamentals')?.size).toBe('small');
    expect(MISSING_SHOWCASE.find((tile) => tile.key === 'learn/algorithmic-patterns')?.size).toBe('wide');
    for (const dropped of ['learn/core-data-structures', 'grow/advanced-java']) expect(keys).not.toContain(dropped);
  });
});

describe('fitShowcase (every tile full, no cut-off lines)', () => {
  /** A tile whose list ends at y=100 and whose units end at the given y positions. */
  function tile(bottoms: number[], baseMore: number): HTMLElement {
    const li = document.createElement('li');
    const units = document.createElement('ul');
    units.className = 'locked-units';
    units.getBoundingClientRect = () => ({ bottom: 100 }) as DOMRect;
    for (const bottom of bottoms) {
      const item = document.createElement('li');
      item.getBoundingClientRect = () => ({ bottom }) as DOMRect;
      units.append(item);
    }
    const more = document.createElement('p');
    more.className = 'more';
    more.dataset['more'] = String(baseMore);
    li.append(units, more);
    return li;
  }

  it('hides the units that do not fit and counts them in "and N more"', () => {
    const list = document.createElement('ul');
    const full = tile([40, 80, 120, 160], 3);
    const fits = tile([30, 60], 0);
    list.append(full, fits, document.createElement('li'));
    fitShowcase(list);
    expect([...full.querySelectorAll('.locked-units > li')].map((item) => (item as HTMLElement).hidden)).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect(full.querySelector('.more')?.textContent).toBe('and 5 more');
    expect(fits.querySelector<HTMLElement>('.more')!.style.visibility).toBe('hidden');
    expect(fits.querySelector('.more')?.textContent).toBe('');
  });
});

describe('startFreeGroups', () => {
  it('lists Open units first, then Free with account, Learn before Blaze, with lesson routes', () => {
    const groups = startFreeGroups(
      levels,
      new Map<string, CourseOutline | null>([
        ['learn/core-java', outlines['learn/core-java']!],
        ['blaze/system-design', outlines['blaze/system-design']!],
        ['grow/broken', null],
      ]),
    );
    expect(
      groups.map((group) => [
        group.heading,
        group.items.map((item) => [item.unitTitle, item.courseTitle, item.route.join('/'), item.fragment]),
      ]),
    ).toEqual([
      [
        'Open to everyone',
        [
          ['Java Platform', 'Java Foundations', '//learn/core-java/java-platform-lesson', undefined],
          ['Interview Method', 'System Design', '//blaze/system-design/interview-method-lesson', undefined],
        ],
      ],
      [
        'Free with an account',
        [
          ['Error Handling', 'Java Foundations', '//learn/core-java/error-handling-lesson', undefined],
          // No lesson: the unit's card on the course page.
          ['Case Studies', 'System Design', '//blaze/system-design', 'unit-no-lesson'],
        ],
      ],
    ]);
  });

  it('opens the unit lesson, not a question, when both exist', () => {
    const course = outlines['learn/core-java']!;
    const target = startFreeTarget('learn', course, course.learningUnits![0]!);
    expect(target).toEqual({ route: ['/', 'learn', 'core-java', 'java-platform-lesson'], fragment: undefined });
  });
});

describe('StartFreePage', () => {
  async function render(published: AccessLevels | null) {
    const getCourseOutline = vi.fn(
      (path: string, courseId: string): Observable<CourseOutline> =>
        outlines[`${path}/${courseId}`] && courseId !== 'broken'
          ? of(outlines[`${path}/${courseId}`]!)
          : throwError(() => new Error('unavailable')),
    );
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'start-free', component: StartFreePage }]),
        { provide: ContentService, useValue: { getCourseOutline } },
        {
          provide: AccessLevelsService,
          useValue: { levels$: of(published), levels: signal(published) },
        },
      ],
    }).compileComponents();
    const harness = await RouterTestingHarness.create('/start-free');
    harness.detectChanges();
    return { root: harness.routeNativeElement as HTMLElement, getCourseOutline, harness };
  }

  it('fills the space between the sidebars on large monitors instead of the 1440px reader', async () => {
    const { root } = await render(levels);
    // Component styles are emitted as <style> elements; read them as written (2026-10-16).
    const css = [...document.querySelectorAll('style')].map(style => style.textContent ?? '').join('\n').replace(/\s+/g, ' ');
    expect(root.querySelector('main')?.classList).toContain('start-free-page');
    expect(css).toMatch(/@media \(min-width: 1100px\) \{ \.start-free-page\[data-sidebar-columns\]\[[^\]]+\] \{ max-width: min\(1840px, calc\(100% - 2 \* var\(--reader-sidebar-space\)\)\) !important; \}/);
  });

  it('lists every open and free unit with plain labels and level-bearing link names', async () => {
    const { root, getCourseOutline } = await render(levels);

    expect(root.querySelector('h1')?.textContent).toContain('Start learning today, free.');
    expect([...root.querySelectorAll('h2')].map((heading) => heading.textContent?.trim())).toEqual([
      'Open to everyone',
      'Free with an account',
    ]);
    // The showcase courses are not in this fixture, so there is nothing to show as missing.
    expect(root.querySelector('#missing')).toBeNull();
    expect([...root.querySelectorAll('.hero-stats li')].map((item) => item.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      '2 open to everyone',
      '2 more with a free account',
    ]);
    // Each section is a card with one action on the right; Sign in stays in the header.
    expect(
      [...root.querySelectorAll('[data-access-level="free"] .group-heading a')].map((link) => [link.textContent?.trim(), link.getAttribute('href')]),
    ).toEqual([['Create a free account', '/sign-up?returnTo=%2Fstart-free']]);
    expect(root.querySelector('[data-access-level="open"] .group-heading a')).toBeNull();
    // The hero also leads to every plan, next to Create a free account.
    expect(
      [...root.querySelectorAll('.hero-actions a')].map((link) => [link.textContent?.trim(), link.getAttribute('href')]),
    ).toEqual([
      ['Create a free account', '/sign-up'],
      ['See all plans', '/pricing'],
    ]);
    const links = [...root.querySelectorAll<HTMLAnchorElement>('.start-free-link')];
    expect(links.map((link) => [link.textContent?.trim(), link.getAttribute('href')])).toEqual([
      ['Java Platform, Open', '/learn/core-java/java-platform-lesson'],
      ['Interview Method, Open', '/blaze/system-design/interview-method-lesson'],
      ['Error Handling, Free with account', '/learn/core-java/error-handling-lesson'],
      ['Case Studies, Free with account', '/blaze/system-design#unit-no-lesson'],
    ]);
    const meta = root.querySelector(`#${links[2]!.getAttribute('aria-describedby')}`);
    expect(meta?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Learn · Java Foundations · Free with account',
    );
    expect(meta?.querySelector('.start-free-access')?.tagName).toBe('SPAN');
    // One outline request per course (free-unit courses plus the showcase, no repeats);
    // a failed course drops only its own units.
    const requested = new Set([
      'learn/core-java', 'blaze/system-design', 'grow/broken',
      ...MISSING_SHOWCASE.map((tile) => tile.key),
    ]);
    expect(getCourseOutline).toHaveBeenCalledTimes(requested.size);
    expect(root.textContent).not.toContain('Lost');
  });

  it('shows staff the full visitor page, and a signed-in learner only what fits (DLV-209)', async () => {
    const { root, harness } = await render(levels);
    const accounts = TestBed.inject(StudyPlanAccount);
    const heroLinks = () => [...root.querySelectorAll('.hero-actions a')].map((link) => link.textContent?.trim());

    // A signed-in learner: no sign-up prompts, and the free section says their account can read it.
    accounts.account.set({ accountId: 'learner', username: 'l', displayName: 'L', topicGrants: [] } as never);
    harness.detectChanges();
    expect(root.querySelector('.staff-note')).toBeNull();
    expect(heroLinks()).toEqual(['See all plans']);
    expect(root.querySelector('[data-access-level="free"] .start-free-note')?.textContent?.trim()).toBe(
      'Your account can read these.',
    );

    // An author sees everything a visitor does, with a note saying so.
    accounts.account.set({ accountId: 'author', username: 'a', displayName: 'A', topicGrants: [], authorPreview: true } as never);
    harness.detectChanges();
    expect(root.querySelector('.staff-note')?.textContent).toContain('Staff view.');
    expect(heroLinks()).toEqual(['Create a free account', 'See all plans']);
    expect(root.querySelector('[data-access-level="free"] .group-heading a')?.textContent?.trim()).toBe(
      'Create a free account',
    );
  });

  it('renders a showcase course and refits its tiles when the grid resizes (DLV-209)', async () => {
    const observed: Element[] = [];
    let resize: (() => void) | undefined;
    class FakeResizeObserver {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe(target: Element) {
        observed.push(target);
      }
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    outlines['learn/sql'] = outline('learn', 'sql', 'SQL Fundamentals', [
      unit('joins', 'Joins and Aggregation'),
      unit('windows', 'Window Functions'),
    ]);
    try {
      const { root, harness } = await render(levels);
      harness.detectChanges();
      await harness.fixture.whenStable();
      const missing = root.querySelector('#missing')!;
      expect(missing.querySelector('.missing-course h3')?.textContent?.trim()).toBe('SQL Fundamentals');
      expect(missing.querySelector('.group-heading a')?.getAttribute('href')).toBe('/pricing');
      expect(observed).toContain(missing.querySelector('.missing-courses'));
      resize?.();
      expect(missing.querySelector('.more')).not.toBeNull();
    } finally {
      delete outlines['learn/sql'];
      vi.unstubAllGlobals();
    }
  });

  it('shows full rows of four and keeps the rest behind Show more (DLV-209)', async () => {
    const { harness } = await render(levels);
    const page = harness.routeDebugElement!.componentInstance as unknown as {
      visibleItems(group: { level: 'free'; heading: string; items: { key: string }[] }): unknown[];
      showAll(level: 'free'): void;
    };
    const group = (count: number) => ({
      level: 'free' as const,
      heading: 'Free with an account',
      items: Array.from({ length: count }, (_, index) => ({ key: `unit-${index}` })),
    });
    expect(page.visibleItems(group(8))).toHaveLength(8);
    expect(page.visibleItems(group(3))).toHaveLength(3);
    expect(page.visibleItems(group(13))).toHaveLength(12);
    page.showAll('free');
    expect(page.visibleItems(group(13))).toHaveLength(13);
  });

  it('explains that the list is unavailable when no access levels are published', async () => {
    const { root, getCourseOutline } = await render(null);

    expect(root.querySelector('.start-free-status')?.textContent).toContain(
      'The free lesson list is not available right now.',
    );
    expect(root.querySelectorAll('.start-free-link')).toHaveLength(0);
    expect(getCourseOutline).not.toHaveBeenCalled();
  });

  it('promises the lessons a plan adds conservatively: clean totals exact, others a lower milestone', () => {
    expect(paidLessonsShown(203)).toBe('200+');
    expect(paidLessonsShown(249)).toBe('225+');
    expect(paidLessonsShown(200)).toBe('200');
    expect(paidLessonsShown(87)).toBe('85+');
    expect(paidLessonsShown(7)).toBe('7');
  });
});
