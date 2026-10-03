import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { routes } from '../../app.routes';
import {
  CourseContent,
  CourseLearningUnit,
  CourseOutline,
  InterviewQuestion,
} from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { SceneAssets } from '../../core/card-scene/scene-assets';
import { Question } from './question';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect class="unit-art"/></svg>';

function item(overrides: Partial<InterviewQuestion>): InterviewQuestion {
  return {
    id: 'item',
    moduleId: 'module',
    order: 1,
    title: 'Item',
    difficulty: 'Advanced',
    tags: ['Design'],
    interviewAnswer: 'Answer.',
    explanation: [],
    versionNotes: [],
    followUps: [],
    contentType: 'q-and-a',
    ...overrides,
  } as InterviewQuestion;
}

function course(
  id: string,
  path: 'learn' | 'grow' | 'look-ahead',
  questions: InterviewQuestion[],
  learningUnits?: CourseLearningUnit[],
): CourseContent {
  return {
    id,
    path,
    title: id,
    description: 'Course.',
    version: '1',
    ...(learningUnits ? { layout: 'learning-map' as const, learningUnits } : {}),
    modules: [...new Set(questions.map((question) => question.moduleId))].map((moduleId, index) => ({
      id: moduleId,
      order: index + 1,
      title: moduleId,
      description: '',
    })),
    questions,
  };
}

function outlineFor(content: CourseContent): CourseOutline {
  return {
    ...content,
    questions: content.questions.map((question) => ({
      id: question.id,
      moduleId: question.moduleId,
      order: question.order,
      title: question.title,
      difficulty: question.difficulty,
      tags: question.tags,
      contentType: question.contentType ?? 'q-and-a',
      isTheoryArticle: question.contentType === 'theory',
      detailRef: {
        kind: 'content-item',
        href: `/content/details/${content.path}/${content.id}/${question.moduleId}/${question.id}.json`,
        version: 'fixture',
      },
    })),
    moduleDetailRefs: [],
  };
}

const round = item({
  id: 'design-rounds-reservation-design',
  moduleId: 'reservation-round',
  title: 'Design a reservation system: 60,000 seats',
  practiceFormat: 'design',
} as Partial<InterviewQuestion>);
const roundsCourse = course('design-rounds', 'look-ahead', [round], [
  {
    id: 'reservation-round',
    title: 'Reservation System',
    description: 'A round.',
    theoryModuleId: 'reservation-round',
    practiceModuleId: 'reservation-round',
    card: {
      summary: 'A 45-minute round.',
      scene: '/content/look-ahead/design-systems/visuals/cards/reservation.svg',
      sceneAlt: 'Two fans tap the same seat.',
    },
  },
]);

const lesson = item({ id: 'spring-boot-config-guide', moduleId: 'configuration', title: 'Configuration', contentType: 'theory' });
const practice = item({ id: 'spring-boot-config-1', moduleId: 'configuration-practice', order: 2, title: 'Why profiles?' });
const growCourse = course('spring-boot', 'grow', [lesson, practice], [
  {
    id: 'configuration',
    title: 'Configuration',
    description: 'Config.',
    theoryModuleId: 'configuration',
    practiceModuleId: 'configuration-practice',
  },
]);
const tileCourse = course('legacy-tiles', 'grow', [item({ id: 'legacy-question', moduleId: 'basics' })]);

describe('Question unit scene header', () => {
  const courses = new Map([roundsCourse, growCourse, tileCourse].map((entry) => [entry.id, entry]));
  const content = {
    getCatalog: vi.fn(() => of([...courses.values()].map(({ id, title }) => ({ id, title })))),
    getCourseOutline: vi.fn((_: string, courseId: string) => of(outlineFor(courses.get(courseId)!))),
    getContentItem: vi.fn((summary: { id: string }) => {
      for (const entry of courses.values()) {
        const found = entry.questions.find(({ id }) => id === summary.id);
        if (found) return of(found);
      }
      return throwError(() => new Error('404'));
    }),
    getCardScene: vi.fn(() => of(svg)),
  };
  const sceneAssets = { get: vi.fn(() => of(svg)) };

  beforeEach(async () => {
    content.getCardScene.mockClear().mockReturnValue(of(svg));
    sceneAssets.get.mockReset().mockReturnValue(of(svg));
    await TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: ContentService, useValue: content },
        { provide: SceneAssets, useValue: sceneAssets },
      ],
    }).compileComponents();
  });

  async function open(url: string): Promise<HTMLElement> {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, Question);
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    return harness.routeNativeElement!;
  }

  it('shows the Design Round unit card scene with its authored description beside the title', async () => {
    const root = await open('/look-ahead/design-rounds/design-rounds-reservation-design');

    const block = root.querySelector('.reader-title-block') as HTMLElement;
    expect(block.classList).toContain('has-unit-scene');
    const scene = block.querySelector('app-card-scene.reader-unit-scene') as HTMLElement;
    expect(content.getCardScene).toHaveBeenCalledWith(
      '/content/look-ahead/design-systems/visuals/cards/reservation.svg',
    );
    expect(scene.getAttribute('aria-hidden')).toBeNull();
    expect(scene.querySelector('.la-card-scene')?.getAttribute('aria-label')).toBe(
      'Two fans tap the same seat.',
    );
    expect(scene.querySelector('svg rect.unit-art')).not.toBeNull();
    // The scene comes before the title in the DOM so phones stack it above the heading.
    const title = block.querySelector('h1') as HTMLElement;
    expect(scene.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(['/grow/spring-boot/spring-boot-config-guide', '/grow/spring-boot/spring-boot-config-1'])(
    'uses the conventional unit scene, decorative, for lessons and practice of the same unit (%s)',
    async (url) => {
      const root = await open(url);
      const scene = root.querySelector('app-card-scene.reader-unit-scene') as HTMLElement;
      expect(sceneAssets.get).toHaveBeenCalledWith('/assets/scenes/units/grow/spring-boot/configuration.svg');
      expect(scene.getAttribute('aria-hidden')).toBe('true');
      expect(scene.classList).not.toContain('la-card-scene-missing');
      expect(scene.querySelector('svg rect.unit-art')).not.toBeNull();
    },
  );

  it('renders nothing, not an empty box or initials, when the unit scene file is missing', async () => {
    sceneAssets.get.mockReturnValue(throwError(() => new Error('404')));
    const root = await open('/grow/spring-boot/spring-boot-config-guide');

    const scene = root.querySelector('app-card-scene.reader-unit-scene') as HTMLElement;
    expect(scene.classList).toContain('la-card-scene-missing');
    expect(scene.querySelector('.la-card-scene-fallback')).toBeNull();
    expect(scene.textContent?.trim()).toBe('');
  });

  it('reserves no scene space for tile courses', async () => {
    const root = await open('/grow/legacy-tiles/legacy-question');

    expect(root.querySelector('h1')).not.toBeNull();
    expect(root.querySelector('.reader-title-block')?.classList).not.toContain('has-unit-scene');
    expect(root.querySelector('app-card-scene')).toBeNull();
  });

  it('keeps DSA problem pages without a unit scene', () => {
    const page = TestBed.createComponent(Question).componentInstance as any;
    const problem = item({ id: 'two-sum', moduleId: 'configuration', contentType: 'dsa-problem' });
    page.pathId.set('grow');
    page.courseId.set('spring-boot');
    page.course.set(outlineFor(growCourse));
    page.question.set(problem);
    expect(page.unitScene()).toBeNull();

    page.question.set(lesson);
    expect(page.unitScene()?.src).toBe('/assets/scenes/units/grow/spring-boot/configuration.svg');
  });
});
