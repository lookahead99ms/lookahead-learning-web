import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { AccessLevels, AccessLevelsService, parseAccessLevels } from '../../content/access-levels';
import { BLAZE_COURSE_GROUPS } from '../../content/blaze-course-groups';
import { CatalogCourseGroup } from '../../content/catalog-course-groups';
import { CatalogOverviewItem, ContentPath } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { GROW_COURSE_GROUPS } from '../../content/grow-course-groups';
import { LEARN_COURSE_GROUPS } from '../../content/learn-course-groups';
import { Blaze } from '../../pages/blaze/blaze';
import { Grow } from '../../pages/grow/grow';
import { Learn } from '../../pages/learn/learn';

/**
 * DLV-803 balance review: every catalog hero groups its actions by meaning (AGENTS Button
 * Placement). The primary and its alternative are the two buttons; the study plan and Start free
 * destinations are one prose text line below them.
 */
interface HeroCase {
  path: ContentPath;
  page: Type<unknown>;
  groups: readonly CatalogCourseGroup[];
  primary: [label: string, href: string];
  alternative: [label: string, href: string];
}

const CASES: HeroCase[] = [
  {
    path: 'learn',
    page: Learn,
    groups: LEARN_COURSE_GROUPS,
    primary: ['Choose a starting foundation', '/learn?group=language-foundations'],
    alternative: ['Practice Learn questions', '/interview-questions?path=learn'],
  },
  {
    path: 'grow',
    page: Grow,
    groups: GROW_COURSE_GROUPS,
    primary: ['Start with Spring Boot', '/grow/spring-boot'],
    alternative: ['Practice Grow questions', '/interview-questions?path=grow'],
  },
  {
    path: 'blaze',
    page: Blaze,
    groups: BLAZE_COURSE_GROUPS,
    primary: ['Start the System Design Ladder', '/blaze/design-fundamentals'],
    alternative: ['Practice senior questions', '/interview-questions?path=blaze'],
  },
];

const freeUnits = parseAccessLevels({
  schemaVersion: 'content-access-levels/v1',
  policyVersion: 'test',
  defaultLevel: 'pro',
  units: {
    'learn/core-java/java-platform': 'open',
    'grow/advanced-java/io-nio': 'open',
    'blaze/design-fundamentals/caching': 'free',
  },
});

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('Catalog hero actions', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  async function render(hero: HeroCase, published: AccessLevels | null) {
    const catalog: CatalogOverviewItem[] = hero.groups.flatMap((group) =>
      group.courseIds.map((id) => ({
        id,
        title: id,
        description: `About ${id}.`,
        available: true,
        reviewStatus: 'reviewed' as const,
        lessonCount: 1,
        questionCount: 3,
        moduleCount: 1,
        topicPreview: [],
        languages: [],
      })),
    );
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: hero.path, component: hero.page }]),
        { provide: ContentService, useValue: { getCatalogOverview: () => of(catalog) } },
        {
          provide: AccessLevelsService,
          useValue: { levels$: of(published), levels: signal(published) },
        },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    const harness = await RouterTestingHarness.create('/' + hero.path);
    harness.detectChanges();
    await harness.fixture.whenStable();
    return harness.routeNativeElement!.querySelector<HTMLElement>('.catalog-depth-hero')!;
  }

  for (const hero of CASES) {
    it(`${hero.path}: two buttons in one row, then one text line with study plan and Start free`, async () => {
      const root = await render(hero, freeUnits);

      const group = root.querySelector<HTMLElement>('.catalog-primary-actions')!;
      expect(group.getAttribute('role')).toBe('group');
      expect(group.getAttribute('aria-label')).toBe(
        `${hero.path[0].toUpperCase()}${hero.path.slice(1)} starting points`,
      );

      // The row holds exactly the primary and its alternative, primary first.
      const buttons = [...group.querySelectorAll<HTMLAnchorElement>('.catalog-action-row > a')];
      expect(buttons.map((a) => [text(a), a.getAttribute('href')])).toEqual([
        hero.primary,
        hero.alternative,
      ]);
      expect(buttons[0].classList).toContain('catalog-primary-action');
      expect(buttons[1].classList).toContain('catalog-secondary-action');

      // The other destinations read as one sentence of prose links, not buttons or pills.
      const line = group.querySelector<HTMLElement>(
        '.catalog-action-row + p.catalog-more-actions',
      )!;
      expect(text(line)).toBe('Or build a study plan or start free');
      const links = [...line.querySelectorAll<HTMLAnchorElement>('a')];
      expect(links.map((a) => [text(a), a.getAttribute('href')])).toEqual([
        ['build a study plan', '/study-plan'],
        ['start free', '/start-free'],
      ]);
      for (const link of links) {
        expect(link.classList).toContain('catalog-text-action');
        expect(link.classList).not.toContain('catalog-secondary-action');
        expect(link.classList).not.toContain('catalog-primary-action');
      }
      // Every hero action still reaches its destination: nothing else hides in the group.
      expect(group.querySelectorAll('a')).toHaveLength(4);
      // The scoreboard stays in the hero.
      expect(root.querySelectorAll('.catalog-scoreboard > div')).toHaveLength(3);
    });
  }

  it('leaves Start free out of the line when no access levels are published', async () => {
    const root = await render(CASES[1], null);

    const line = root.querySelector('.catalog-more-actions');
    expect(text(line)).toBe('Or build a study plan');
    expect(root.querySelector('.catalog-start-free-action')).toBeNull();
    expect(root.querySelectorAll('.catalog-action-row > a')).toHaveLength(2);
  });

  it('styles the hero for the first screen: rem-based compact title, grouped actions, stacking', async () => {
    await render(CASES[0], freeUnits);
    // Component styles are emitted as <style> elements; read them as written.
    const css = [...document.querySelectorAll('style')]
      .map((style) => style.textContent ?? '')
      .join('\n')
      .replace(/\s+/g, ' ');

    // About 52-55px at 100% on 1512-2560px screens; the rem base keeps browser zoom working.
    expect(css).toMatch(
      /\.catalog-depth-hero\[[^\]]+\] \.reader-question-title\[[^\]]+\] \{ font-size: clamp\(2\.4rem, 2\.9rem \+ 0\.35vw, 3\.5rem\);/,
    );
    // Title and scoreboard share the first row; the copy spans below.
    expect(css).toMatch(
      /\.catalog-depth-hero\[[^\]]+\] \{ margin: 8px 0 22px; padding: 18px clamp\(20px, 2\.4vw, 36px\); display: grid; grid-template-columns: minmax\(0, 1fr\) auto; grid-template-areas: ["']heading board["'] ["']copy copy["'];/,
    );
    // The two buttons share a row; the text line sits under it.
    expect(css).toMatch(
      /\.catalog-primary-actions\[[^\]]+\] \{ margin-top: 14px; display: flex; flex-direction: column; align-items: flex-start;/,
    );
    expect(css).toMatch(
      /\.catalog-action-row\[[^\]]+\] \{ display: flex; align-items: center; flex-wrap: wrap;/,
    );
    // Prose links: link colour and underline, no pill radius or border.
    expect(css).toMatch(
      /\.catalog-text-action\[[^\]]+\] \{ border-radius: 3px; color: var\(--accent-link\); font-weight: 700; text-decoration-line: underline;/,
    );
    expect(css).not.toMatch(/\.catalog-text-action\[[^\]]+\] \{[^}]*border:/);
    // At 980px and below the buttons stack full width, primary on top.
    expect(css).toMatch(
      /@media \(max-width: 980px\) \{ \.catalog-depth-hero\[[^\]]+\] \.catalog-depth-copy\[[^\]]+\] \{ max-width: none; \} \.catalog-primary-actions\[[^\]]+\] \{ align-items: stretch; \} \.catalog-action-row\[[^\]]+\] \{ flex-direction: column; align-items: stretch; \} \.catalog-primary-action\[[^\]]+\], \.catalog-secondary-action\[[^\]]+\] \{ width: 100%;/,
    );
  });
});
