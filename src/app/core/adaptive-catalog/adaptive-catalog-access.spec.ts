import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { AccessLevels, AccessLevelsService, parseAccessLevels } from '../../content/access-levels';
import { CatalogOverviewItem } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { LEARN_COURSE_GROUPS } from '../../content/learn-course-groups';
import { Learn } from '../../pages/learn/learn';

/** DLV-942: catalog cards say "N free lessons" in plain text, and the hero links to Start free. */
const catalog: CatalogOverviewItem[] = LEARN_COURSE_GROUPS.flatMap((group) =>
  group.courseIds.map((id) => ({
    id,
    title: id,
    description: `Learn ${id}.`,
    available: true,
    reviewStatus: 'reviewed' as const,
    lessonCount: 1,
    questionCount: 3,
    moduleCount: 1,
    topicPreview: [],
    languages: [],
  })),
);

const levels = parseAccessLevels({
  schemaVersion: 'content-access-levels/v1',
  policyVersion: 'test',
  defaultLevel: 'pro',
  units: {
    'learn/core-java/java-platform': 'open',
    'learn/core-java/error-handling': 'free',
    'learn/core-java/generics': 'free',
    'learn/sql/sql-query-and-storage': 'open',
    'grow/advanced-java/io-nio': 'open',
  },
});

describe('Catalog free lesson lines', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
  });

  async function render(published: AccessLevels | null) {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'learn', component: Learn }]),
        { provide: ContentService, useValue: { getCatalogOverview: () => of(catalog) } },
        {
          provide: AccessLevelsService,
          useValue: { levels$: of(published), levels: signal(published) },
        },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    const harness = await RouterTestingHarness.create('/learn');
    harness.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  it('shows the count only on courses with open or free units, as plain described text', async () => {
    const root = await render(levels);

    const coreJava = root.querySelector<HTMLAnchorElement>('a#core-java')!;
    const line = coreJava.querySelector<HTMLElement>('.catalog-course-free')!;
    expect(line.textContent?.trim()).toBe('3 free lessons');
    expect(line.tagName).toBe('P');
    expect(coreJava.getAttribute('aria-describedby')?.split(' ')).toContain(line.id);
    expect(root.querySelector('a#sql .catalog-course-free')?.textContent?.trim()).toBe(
      '1 free lesson',
    );
    // A course with no open or free unit gets no line.
    const others = [...root.querySelectorAll('a.catalog-course-card')].filter(
      (card) => !['core-java', 'sql'].includes(card.id),
    );
    expect(others.length).toBeGreaterThan(0);
    for (const card of others) expect(card.querySelector('.catalog-course-free')).toBeNull();
  });

  it('links to Start free from the catalog hero when the path has free units', async () => {
    const root = await render(levels);

    const link = root.querySelector<HTMLAnchorElement>('.catalog-start-free-action');
    expect(link?.textContent?.trim()).toBe('Start free');
    expect(link?.getAttribute('href')).toBe('/start-free');
  });

  it('shows no line and no Start free link without published access levels', async () => {
    const root = await render(null);

    expect(root.querySelectorAll('.catalog-course-free')).toHaveLength(0);
    expect(root.querySelector('.catalog-start-free-action')).toBeNull();
    expect(root.querySelector('a#core-java')?.getAttribute('aria-describedby')).toBe(
      'learn-course-core-java-description',
    );
  });
});
