import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { CatalogOverviewItem } from '../content/content.models';
import { ContentService } from '../content/content.service';
import { LOOK_AHEAD_COURSE_GROUPS } from '../content/look-ahead-course-groups';
import { Grow } from './grow/grow';
import { LookAhead } from './look-ahead/look-ahead';

for (const { path, courseId, component } of [
  { path: 'grow', courseId: 'advanced-java', component: Grow },
  { path: 'look-ahead', courseId: 'system-design', component: LookAhead },
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
      [13, 131, '13 lessons · 131 questions'],
      [1, 1, '1 lesson · 1 question'],
      [0, 0, '0 lessons · 0 questions'],
    ] as const)(
      'labels %i lessons and %i questions without inventing a topic total',
      async (lessons, questions, label) => {
        const harness = await render(lessons, questions);
        const card = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.course-card')!;
        expect(
          card.querySelector('.catalog-card-kicker')?.textContent?.replace(/\s+/g, ' ').trim(),
        ).toBe(label);
        expect(card.getAttribute('href')).toBe(`/${path}/${courseId}`);
        expect(card.textContent).toContain('Contracts');
        expect(card.textContent).toContain('Recovery');
        expect(card.textContent).not.toContain('26 topics');
      },
    );

    it('explains that the question total includes interview and practice questions', async () => {
      const harness = await render(13, 131);
      const metric = harness.routeNativeElement!.querySelectorAll('.catalog-scoreboard > div')[2];
      expect(metric.querySelector('dt')?.textContent?.trim()).toBe('131');
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
    expect(root.querySelectorAll('.featured-catalog-card')).toHaveLength(1);
    const featured = root.querySelector<HTMLElement>('#system-design')!;
    expect(featured.classList.contains('featured-catalog-card')).toBe(true);
    expect(featured.querySelector('.catalog-featured-label')?.textContent?.trim()).toBe(
      'Recommended starting point',
    );
    expect(
      root.querySelector('#distributed-systems')?.classList.contains('featured-catalog-card'),
    ).toBe(false);
    expect(featured.querySelectorAll('.catalog-topic-preview li')).toHaveLength(3);
  });
});
