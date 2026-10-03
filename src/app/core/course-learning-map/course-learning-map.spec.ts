import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { Location } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CourseContent, CourseLearningUnit, InterviewQuestion } from '../../content/content.models';
import { of } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { CourseLearningMap } from './course-learning-map';

function question(id: string, order: number): InterviewQuestion {
  return {
    id,
    moduleId: 'question-module',
    order,
    title: `Question ${order}`,
    difficulty: 'Intermediate',
    tags: ['Testing'],
    interviewAnswer: 'Answer.',
    explanation: ['Explanation.'],
    versionNotes: [],
    followUps: [],
    contentType: 'q-and-a',
    practiceFormat: 'explain',
  };
}

const course: CourseContent = {
  id: 'course',
  path: 'learn',
  title: 'Course',
  description: 'Course description.',
  version: '1',
  layout: 'learning-map',
  modules: [
    { id: 'theory-module', order: 1, title: 'Theory', description: 'Theory.' },
    { id: 'question-module', order: 2, title: 'Questions', description: 'Questions.' },
  ],
  questions: [
    {
      ...question('lesson', 1),
      moduleId: 'theory-module',
      title: 'Lesson',
      contentType: 'theory',
      schemaVersion: 'foundation-lesson/v1',
      sections: [{ id: 'model', heading: 'Model', body: ['Body.'] }],
    },
    question('one', 1),
    question('two', 2),
    question('three', 3),
  ],
};

describe('CourseLearningMap', () => {
  let fixture: ComponentFixture<CourseLearningMap>;
  let http: HttpTestingController;

  const withoutLesson: CourseContent = {
    ...course,
    questions: course.questions.filter((item) => item.contentType !== 'theory'),
  };

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function cardFor(unitId: string): HTMLAnchorElement {
    return element().querySelector<HTMLAnchorElement>(`#unit-${unitId}`)!;
  }

  function metaText(card: Element): string[] {
    return Array.from(card.querySelectorAll('.unit-card-meta-item')).map(
      (item) => item.textContent?.trim() ?? '',
    );
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CourseLearningMap],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(CourseLearningMap);
    fixture.componentRef.setInput('course', course);
    fixture.componentRef.setInput('pathId', 'learn');
    fixture.componentRef.setInput('courseId', 'course');
    fixture.componentRef.setInput('units', [
      {
        id: 'unit',
        title: 'Unit',
        description: 'Unit description.',
        theoryModuleId: 'theory-module',
        questionModuleId: 'question-module',
      },
    ]);
    fixture.detectChanges();
  });

  it('shows the course banner and one card per unit without per-unit buttons', () => {
    const banner = element().querySelector('.unit-card-banner')!;
    expect(banner.querySelector('h1')?.textContent?.trim()).toBe('Course');
    expect(banner.querySelector('.unit-card-banner-intro')?.textContent).toContain(
      'Course description.',
    );
    expect(banner.querySelector('.unit-card-banner-count')?.textContent?.trim()).toBe('1 lesson');
    expect(element().querySelector('.learning-map-intro')).toBeNull();
    expect(element().querySelector('.learning-action')).toBeNull();
    expect(element().querySelector('app-interview-question-bank-link')).toBeNull();
    expect(element().querySelector('details')).toBeNull();
    expect(element().querySelectorAll('a.unit-card')).toHaveLength(1);
  });

  it('builds the card from unit data and links the whole card to its lesson', () => {
    const card = cardFor('unit');

    expect(card.tagName).toBe('A');
    expect(card.getAttribute('href')).toBe('/learn/course/lesson');
    expect(card.querySelector('.unit-card-title')?.textContent?.trim()).toBe('Unit');
    const summary = card.querySelector('.unit-card-summary')!;
    expect(summary.textContent?.trim()).toBe('Unit description.');
    expect(summary.classList).toContain('unit-card-summary-clamped');
    expect(metaText(card)).toEqual(['01', '3 questions']);
    expect(card.getAttribute('aria-labelledby')).toBe('unit-card-title-unit');
    expect(card.getAttribute('aria-describedby')).toBe(
      'unit-card-meta-unit unit-card-summary-unit',
    );
  });

  it('loads the conventional unit scene and falls back to initials when it is missing', () => {
    http
      .expectOne('/assets/scenes/units/learn/course/unit.svg')
      .flush('missing', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    const scene = cardFor('unit').querySelector('.la-card-scene')!;
    expect(scene.getAttribute('data-state')).toBe('failed');
    expect(scene.querySelector('.la-card-scene-mark')?.textContent?.trim()).toBe('U');
  });

  it('inlines the conventional unit scene when it exists', () => {
    http
      .expectOne('/assets/scenes/units/learn/course/unit.svg')
      .flush(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="10" height="10"/></svg>',
      );
    fixture.detectChanges();

    const scene = cardFor('unit').querySelector('.la-card-scene')!;
    expect(scene.getAttribute('data-state')).toBe('ready');
    expect(scene.querySelector('svg')).not.toBeNull();
    expect(scene.querySelector('.la-card-scene-mark')).toBeNull();
  });

  it('shows sub-units as their own cards with a family-specific label', () => {
    fixture.componentRef.setInput('units', [
      {
        id: 'practice-family',
        title: 'Practice family',
        description: 'Practice progressively.',
        theoryModuleId: 'theory-module',
        subUnitLabel: 'Practice track',
        subUnits: [
          {
            id: 'track',
            title: 'Track',
            description: 'Track description.',
            theoryModuleId: 'theory-module',
          },
        ],
      },
    ]);
    fixture.detectChanges();

    const cards = Array.from(element().querySelectorAll<HTMLAnchorElement>('a.unit-card'));
    expect(cards.map((card) => card.id)).toEqual(['unit-practice-family', 'unit-track']);
    expect(metaText(cards[1])).toEqual(['Practice track 1']);
    expect(cards[1].getAttribute('href')).toBe('/learn/course/lesson');
    expect(element().querySelector('.unit-card-banner-count')?.textContent?.trim()).toBe(
      '1 lesson',
    );
  });

  it('nests sub-units under their family in the side nav, linked like their cards', () => {
    fixture.componentRef.setInput('lessonNav', true);
    fixture.componentRef.setInput('units', [
      {
        id: 'practice-family',
        title: 'Practice family',
        description: 'Practice progressively.',
        theoryModuleId: 'theory-module',
        subUnits: [
          {
            id: 'track',
            title: 'Track',
            description: 'Track description.',
            theoryModuleId: 'theory-module',
          },
        ],
      },
    ]);
    fixture.detectChanges();

    const nav = element().querySelector('app-course-lesson-nav nav')!;
    const top = nav.querySelectorAll(':scope .course-lesson-nav-list > li');
    expect(top).toHaveLength(1);
    expect(top[0].querySelector('a')?.textContent).toContain('Practice family');
    const nested = top[0].querySelector<HTMLAnchorElement>('.course-lesson-nav-children a')!;
    expect(nested.textContent).toContain('Track');
    expect(nested.getAttribute('href')).toBe(cardFor('track').getAttribute('href'));
  });

  it('routes a Learn unit without a lesson to its canonical filtered Hands-On DSA library', () => {
    fixture.componentRef.setInput('course', withoutLesson);
    fixture.componentRef.setInput('units', [
      {
        id: 'hashing-lookup',
        title: 'Hashing',
        description: 'Remember relationships.',
        theoryModuleId: 'theory-module',
        practiceModuleId: 'practice-hashing',
      },
    ]);
    fixture.detectChanges();

    const card = cardFor('hashing-lookup');
    expect(card.getAttribute('href')).toBe('/learn/hands-on-dsa?pattern=course:hashing-lookup');
    expect(metaText(card)).toEqual(['01', 'Hands-on practice']);
  });

  it('uses each nested learning-unit id for its canonical Hands-On DSA filter', () => {
    fixture.componentRef.setInput('course', withoutLesson);
    fixture.componentRef.setInput('courseId', 'algorithmic-patterns');
    fixture.componentRef.setInput('units', [
      {
        id: 'linked-lists',
        title: 'Linked Lists',
        description: 'Choose the list shape before selecting a traversal.',
        theoryModuleId: 'theory-module',
        subUnits: [
          {
            id: 'fast-slow-pointers',
            title: 'Fast/Slow Pointers',
            description: 'Use relative speed for cycles and midpoints.',
            theoryModuleId: 'theory-module',
            practiceModuleId: 'practice-fast-slow-pointers',
          },
          {
            id: 'list-reversal',
            title: 'List Reversal',
            description: 'Rewire edges while preserving reachability.',
            theoryModuleId: 'theory-module',
            practiceModuleId: 'practice-list-reversal',
          },
        ],
      },
    ]);
    fixture.detectChanges();

    expect(cardFor('fast-slow-pointers').getAttribute('href')).toBe(
      '/learn/hands-on-dsa?pattern=algorithmic-patterns:fast-slow-pointers',
    );
    expect(cardFor('list-reversal').getAttribute('href')).toBe(
      '/learn/hands-on-dsa?pattern=algorithmic-patterns:list-reversal',
    );
    expect(metaText(cardFor('list-reversal'))).toEqual(['Subpattern 2', 'Hands-on practice']);
    for (const card of Array.from(element().querySelectorAll('a.unit-card'))) {
      expect(card.querySelectorAll('a')).toHaveLength(0);
    }
  });

  function withPractice(base: CourseContent, count: number): CourseContent {
    const practiceQuestions = Array.from({ length: count }, (_, index) => ({
      ...question(`practice-${index + 1}`, index + 1),
      moduleId: 'practice-module',
      practiceFormat: 'solve' as const,
    }));
    return {
      ...base,
      modules: [
        ...base.modules,
        { id: 'practice-module', order: 3, title: 'Practice', description: 'Practice.' },
      ],
      questions: [...base.questions, ...practiceQuestions],
    };
  }

  const streams: CourseLearningUnit = {
    id: 'streams',
    title: 'Streams',
    description: 'Build pipelines.',
    theoryModuleId: 'theory-module',
    questionModuleId: 'question-module',
    practiceModuleId: 'practice-module',
    practiceExperience: 'questionBank',
  };

  it('counts question-bank practice and links a unit without a lesson to that practice', () => {
    fixture.componentRef.setInput('course', withPractice(withoutLesson, 4));
    fixture.componentRef.setInput('units', [streams]);
    fixture.detectChanges();

    const card = cardFor('streams');
    expect(metaText(card)).toEqual(['01', '3 questions', '4 problems']);
    expect(card.getAttribute('href')).toBe('/learn/course/module/practice-module');
  });

  it('prefers the lesson over practice and keeps both counts in the meta line', () => {
    fixture.componentRef.setInput('course', withPractice(course, 1));
    fixture.componentRef.setInput('units', [streams]);
    fixture.detectChanges();

    const card = cardFor('streams');
    expect(card.getAttribute('href')).toBe('/learn/course/lesson');
    expect(metaText(card)).toEqual(['01', '3 questions', '1 problem']);
  });

  it('omits an empty question-bank practice count', () => {
    fixture.componentRef.setInput('course', {
      ...course,
      modules: [
        ...course.modules,
        { id: 'empty-practice', order: 3, title: 'Practice', description: 'Practice.' },
      ],
    });
    fixture.componentRef.setInput('units', [
      {
        id: 'empty',
        title: 'Empty practice',
        description: 'No published practice yet.',
        theoryModuleId: 'theory-module',
        practiceModuleId: 'empty-practice',
        practiceExperience: 'questionBank',
      },
    ]);
    fixture.detectChanges();

    expect(metaText(cardFor('empty'))).toEqual(['01']);
  });

  it('shows planned units as non-link cards with the Planned state', () => {
    fixture.componentRef.setInput('units', [
      {
        id: 'unit',
        title: 'Unit',
        description: 'Unit description.',
        theoryModuleId: 'theory-module',
      },
      {
        id: 'later',
        title: 'Later topic',
        description: 'Coming soon.',
        theoryModuleId: 'unpublished-module',
        planned: true,
      },
    ]);
    fixture.detectChanges();

    const planned = cardFor('later');
    expect(planned.tagName).toBe('ARTICLE');
    expect(planned.classList).toContain('unit-card-planned');
    expect(planned.querySelector('a')).toBeNull();
    const status = planned.querySelector('[data-review-status="planned"]');
    expect(status?.textContent?.trim()).toBe('Planned');
    expect(element().querySelector('.unit-card-banner-count')?.textContent?.trim()).toBe(
      '1 lesson',
    );
  });
});

describe('CourseLearningMap unit cards', () => {
  const sceneSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><style>.s-a{fill:var(--scene-accent)}</style><rect class="s-a" width="10" height="10"/></svg>';
  let sceneRequests: string[];

  const cardCourse: CourseContent = {
    ...course,
    id: 'design-rounds',
    path: 'look-ahead',
    title: 'Design Rounds',
    description: 'Interview practice.',
    reviewStatus: 'reviewed',
    modules: [
      ...course.modules,
      { id: 'round-module', order: 3, title: 'Round', description: 'Round.' },
      { id: 'plain-module', order: 4, title: 'Plain', description: 'Plain.' },
    ],
    questions: [
      ...course.questions,
      { ...question('round-question', 1), moduleId: 'round-module', title: 'Round question' },
      { ...question('plain-question', 1), moduleId: 'plain-module' },
    ],
  };

  const units: CourseLearningUnit[] = [
    {
      id: 'lesson-unit',
      title: 'Reservation System',
      description: 'Unit description.',
      theoryModuleId: 'theory-module',
      questionModuleId: 'question-module',
      card: {
        summary: 'Hold a seat and never sell it twice.',
        level: 'Advanced' as const,
        minutes: 45,
        scene: '/content/look-ahead/design-systems/visuals/cards/reservation.svg',
        sceneAlt: 'A seat turns from held to reserved.',
        pillGroups: [
          { label: 'Patterns', items: ['Contention'] },
          { label: 'Fundamentals', items: ['Transactions', 'Caching'] },
        ],
      },
    },
    {
      id: 'round-unit',
      title: 'Round',
      description: 'Round description.',
      theoryModuleId: 'round-module',
      practiceModuleId: 'round-module',
      practiceExperience: 'questionBank' as const,
      card: {
        summary: 'A 45-minute round.',
        scene: '/content/look-ahead/design-systems/visuals/cards/reservation.svg',
        sceneAlt: 'A seat turns from held to reserved.',
      },
    },
    {
      id: 'plain-unit',
      title: 'Plain unit',
      description: 'Plain description.',
      theoryModuleId: 'plain-module',
      practiceModuleId: 'plain-module',
      practiceExperience: 'questionBank' as const,
    },
  ];

  let lastFixture: ComponentFixture<CourseLearningMap>;

  async function render(courseId: string, mapUnits = units, initialUrl?: string) {
    sceneRequests = [];
    await TestBed.configureTestingModule({
      imports: [CourseLearningMap],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ContentService,
          useValue: {
            getCardScene: (path: string) => {
              sceneRequests.push(path);
              return of(sceneSvg);
            },
          },
        },
      ],
    }).compileComponents();
    if (initialUrl) await TestBed.inject(Router).navigateByUrl(initialUrl);
    const fixture = TestBed.createComponent(CourseLearningMap);
    fixture.componentRef.setInput('course', { ...cardCourse, id: courseId });
    fixture.componentRef.setInput('pathId', 'look-ahead');
    fixture.componentRef.setInput('courseId', courseId);
    fixture.componentRef.setInput('units', mapUnits);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    lastFixture = fixture;
    return fixture.nativeElement as HTMLElement;
  }

  it('replaces the intro paragraph with a course banner and a count line', async () => {
    const element = await render('design-rounds');

    expect(element.querySelector('.learning-map-intro')).toBeNull();
    const banner = element.querySelector('.unit-card-banner')!;
    expect(banner.querySelector('h1')?.textContent?.trim()).toBe('Design Rounds');
    expect(banner.querySelector('.unit-card-banner-intro')?.textContent).toContain(
      'Each round is a 45-minute interview question.',
    );
    expect(banner.querySelector('.unit-card-banner-count')?.textContent?.trim()).toBe('3 rounds');
  });

  it('counts lessons for courses without a custom noun', async () => {
    const element = await render('design-systems');
    expect(element.querySelector('.unit-card-banner-count')?.textContent?.trim()).toBe('3 lessons');
  });

  it('makes each card one link to its lesson, the round question, or the practice of a plain unit', async () => {
    const element = await render('design-rounds');
    const cards = Array.from(element.querySelectorAll<HTMLAnchorElement>('a.unit-card'));

    expect(cards.length).toBe(3);
    expect(cards[0].getAttribute('href')).toBe('/look-ahead/design-rounds/lesson');
    expect(cards[1].getAttribute('href')).toBe('/look-ahead/design-rounds/round-question');
    expect(cards[2].getAttribute('href')).toBe('/look-ahead/design-rounds/module/plain-module');
    expect(element.querySelector('.unit-card-grid .learning-action')).toBeNull();
    expect(element.querySelector('.unit-card-grid app-interview-question-bank-link')).toBeNull();
    expect(cards[0].getAttribute('aria-labelledby')).toBe('unit-card-title-lesson-unit');
    expect(element.querySelector('#unit-card-title-lesson-unit')?.textContent?.trim()).toBe(
      'Reservation System',
    );
  });

  it('shows the level on the title row, the meta line, and family pills below the link', async () => {
    const element = await render('design-rounds');
    const card = element.querySelector('a.unit-card')!;

    expect(card.querySelector('.unit-card-minutes')?.textContent?.trim()).toBe('45 min');
    expect(card.querySelector('.unit-card-level')?.textContent).toBe('Advanced');
    // Drawing, then title, then description; the unit facts follow as plain meta, not a pill.
    expect(
      Array.from(
        card.querySelectorAll(
          'app-card-scene, .unit-card-title, .unit-card-summary, .unit-card-meta',
        ),
      ).map((node) => node.classList[0]),
    ).toEqual(['unit-card-scene', 'unit-card-title', 'unit-card-summary', 'unit-card-meta']);
    // Drawing words take the shared card text styling; the map carries the path for the title colour.
    expect(card.querySelector('app-card-scene')?.classList).toContain('la-card-scene-card');
    expect(element.querySelector('.learning-map')?.getAttribute('data-path')).toBe('look-ahead');
    // The level is plain text beside the title (not a pill, not in the meta line).
    const level = card.querySelector('.unit-card-level')!;
    expect(level.closest('.unit-card-meta')).toBeNull();
    expect(level.parentElement?.classList).toContain('unit-card-title-row');
    expect(level.previousElementSibling?.classList).toContain('unit-card-title');
    expect(card.getAttribute('aria-describedby')).toBe(
      'unit-card-level-lesson-unit unit-card-meta-lesson-unit unit-card-summary-lesson-unit',
    );
    expect(card.querySelector('.unit-card-summary')?.textContent).toContain('never sell it twice');
    // Family pills are filter buttons, so they sit in the card frame but outside the link.
    expect(card.querySelector('.unit-card-pills, button')).toBeNull();
    const frame = card.closest('.unit-card-frame')!;
    const rows = frame.querySelectorAll('.unit-card-pill-row');
    expect(rows.length).toBe(2);
    expect(rows[0].classList).toContain('primary');
    expect(rows[0].getAttribute('role')).toBe('group');
    expect(rows[0].getAttribute('aria-label')).toBe('Filter lessons by Patterns');
    // Pills only: the group name is the accessible label, not visible text.
    expect(frame.querySelector('.unit-card-pill-label')).toBeNull();
    expect(frame.querySelector('.unit-card-pills')?.textContent).not.toContain('Patterns');
    expect(frame.querySelector('.unit-card-pills')?.textContent).not.toContain('Fundamentals');
    const pills = Array.from(rows[1].querySelectorAll<HTMLButtonElement>('button.unit-card-pill'));
    expect(pills.map((pill) => pill.textContent?.trim())).toEqual(['Transactions', 'Caching']);
    for (const pill of pills) {
      expect(pill.type).toBe('button');
      expect(pill.getAttribute('aria-pressed')).toBe('false');
    }
    expect(element.querySelectorAll('a.unit-card a, a.unit-card button').length).toBe(0);
  });

  it('filters the map to one family when its pill is pressed, and clears it again', async () => {
    const shared = units.map((unit) =>
      unit.id === 'round-unit'
        ? {
            ...unit,
            card: { ...unit.card!, pillGroups: [{ label: 'Fundamentals', items: ['Caching'] }] },
          }
        : unit,
    );
    const element = await render('design-rounds', shared);
    const titles = () =>
      Array.from(element.querySelectorAll('.unit-card-title')).map((title) =>
        title.textContent?.trim(),
      );
    const pill = (name: string) =>
      Array.from(element.querySelectorAll<HTMLButtonElement>('button.unit-card-pill')).find(
        (button) => button.textContent?.trim() === name,
      )!;
    const settle = async () => {
      lastFixture.detectChanges();
      await lastFixture.whenStable();
    };
    expect(titles()).toEqual(['Reservation System', 'Round', 'Plain unit']);
    expect(element.querySelector('.unit-card-filter')).toBeNull();

    pill('Caching').click();
    await settle();
    expect(titles()).toEqual(['Reservation System', 'Round']);
    expect(element.querySelector('.unit-card-filter-status')?.getAttribute('role')).toBe('status');
    expect(
      element.querySelector('.unit-card-filter-status')?.textContent?.replace(/\s+/g, ' ').trim(),
    ).toBe('Showing 2 rounds with Caching');
    expect(
      Array.from(element.querySelectorAll('button.unit-card-pill[aria-pressed="true"]')).map(
        (button) => button.textContent?.trim(),
      ),
    ).toEqual(['Caching', 'Caching']);

    pill('Transactions').click();
    await settle();
    expect(titles()).toEqual(['Reservation System']);
    expect(pill('Transactions').getAttribute('aria-pressed')).toBe('true');
    expect(pill('Caching').getAttribute('aria-pressed')).toBe('false');

    // Pressing the selected pill again clears the filter.
    pill('Transactions').click();
    await settle();
    expect(titles()).toEqual(['Reservation System', 'Round', 'Plain unit']);

    pill('Contention').click();
    await settle();
    expect(titles()).toEqual(['Reservation System']);
    const clear = element.querySelector<HTMLButtonElement>('.unit-card-filter-clear')!;
    expect(clear.type).toBe('button');
    expect(clear.textContent?.trim()).toBe('Show all rounds');
    clear.click();
    await settle();
    expect(titles()).toEqual(['Reservation System', 'Round', 'Plain unit']);
    expect(element.querySelector('.unit-card-filter')).toBeNull();
  });

  describe('family filter in the URL', () => {
    const titles = (element: HTMLElement) =>
      Array.from(element.querySelectorAll('.unit-card-title')).map((title) =>
        title.textContent?.trim(),
      );
    const settle = async () => {
      lastFixture.detectChanges();
      await lastFixture.whenStable();
      lastFixture.detectChanges();
    };
    const familyInUrl = () =>
      TestBed.inject(Router).parseUrl(TestBed.inject(Location).path(true)).queryParams['family'];

    it('writes the pressed pill to ?family= and removes it when cleared', async () => {
      const element = await render('design-rounds', units, '/?tab=map');
      Array.from(element.querySelectorAll<HTMLButtonElement>('button.unit-card-pill'))
        .find((button) => button.textContent?.trim() === 'Contention')!
        .click();
      await settle();
      expect(familyInUrl()).toBe('Contention');
      expect(
        TestBed.inject(Router).parseUrl(TestBed.inject(Location).path()).queryParams['tab'],
      ).toBe('map');
      element.querySelector<HTMLButtonElement>('.unit-card-filter-clear')!.click();
      await settle();
      expect(familyInUrl()).toBeUndefined();
      expect(titles(element)).toEqual(['Reservation System', 'Round', 'Plain unit']);
    });

    it('restores the filter from the URL on load', async () => {
      const element = await render('design-rounds', units, '/?family=Transactions');
      expect(titles(element)).toEqual(['Reservation System']);
      expect(
        element.querySelector('.unit-card-filter-status')?.textContent?.replace(/\s+/g, ' ').trim(),
      ).toBe('Showing 1 round with Transactions');
      const pressed = element.querySelector('button.unit-card-pill[aria-pressed="true"]');
      expect(pressed?.textContent?.trim()).toBe('Transactions');
    });

    it('follows the URL when it changes, as back and forward do', async () => {
      const element = await render('design-rounds', units, '/?family=Caching');
      expect(titles(element)).toEqual(['Reservation System']);
      await TestBed.inject(Router).navigateByUrl('/');
      await settle();
      expect(titles(element)).toEqual(['Reservation System', 'Round', 'Plain unit']);
      expect(element.querySelector('.unit-card-filter')).toBeNull();
      await TestBed.inject(Router).navigateByUrl('/?family=Transactions');
      await settle();
      expect(titles(element)).toEqual(['Reservation System']);
    });

    it.each(['Not a family', '', 'transactions'])(
      'shows every card when ?family=%s matches no pill',
      async (family) => {
        const element = await render(
          'design-rounds',
          units,
          `/?family=${encodeURIComponent(family)}`,
        );
        expect(titles(element)).toEqual(['Reservation System', 'Round', 'Plain unit']);
        expect(element.querySelector('.unit-card-filter')).toBeNull();
        expect(element.querySelector('button.unit-card-pill[aria-pressed="true"]')).toBeNull();
      },
    );
  });

  it('inlines the scene with an accessible image label', async () => {
    const element = await render('design-rounds');
    const scene = element.querySelector('a.unit-card .la-card-scene')!;

    expect(scene.getAttribute('role')).toBe('img');
    expect(scene.getAttribute('aria-label')).toBe('A seat turns from held to reserved.');
    expect(scene.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('gives units without a card a conventional card in the same grid', async () => {
    const element = await render('design-rounds');
    const plain = element.querySelector('#unit-plain-unit')!;

    expect(plain.tagName).toBe('A');
    expect(plain.closest('.unit-card-grid')).not.toBeNull();
    expect(plain.querySelector('.unit-card-summary')?.textContent?.trim()).toBe(
      'Plain description.',
    );
    expect(plain.querySelector('.learning-action')).toBeNull();
    expect(sceneRequests).not.toContain(
      '/assets/scenes/units/look-ahead/design-rounds/plain-unit.svg',
    );
    TestBed.inject(HttpTestingController).expectOne(
      '/assets/scenes/units/look-ahead/design-rounds/plain-unit.svg',
    );
  });

  it('keeps the banner and uses conventional cards when no unit has a card', async () => {
    const element = await render(
      'design-rounds',
      units.map(({ card: _card, ...unit }) => unit),
    );

    expect(element.querySelector('.unit-card-banner-intro')?.textContent).toContain(
      'Each round is a 45-minute interview question.',
    );
    expect(element.querySelector('.learning-map-intro')).toBeNull();
    expect(element.querySelectorAll('a.unit-card')).toHaveLength(3);
    expect(element.querySelector('.unit-card-pills')).toBeNull();
  });

  describe('course side nav', () => {
    function navLinks(element: HTMLElement): HTMLAnchorElement[] {
      return Array.from(
        element.querySelectorAll<HTMLAnchorElement>(
          'app-course-lesson-nav .course-lesson-nav-list a',
        ),
      );
    }

    function currentTitle(element: HTMLElement): string | undefined {
      return element
        .querySelector('app-course-lesson-nav [aria-current="location"] .course-lesson-nav-text')
        ?.textContent?.trim();
    }

    function placeCards(element: HTMLElement, bottoms: number[]): void {
      element.querySelectorAll<HTMLElement>('.unit-card-item').forEach((item, index) => {
        vi.spyOn(item, 'getBoundingClientRect').mockReturnValue({
          top: bottoms[index] - 300,
          bottom: bottoms[index],
        } as DOMRect);
      });
    }

    let frames: FrameRequestCallback[] = [];

    /** Scroll the window and run the queued animation frame, as the browser would. */
    function scroll(): void {
      window.dispatchEvent(new Event('scroll'));
      frames.splice(0).forEach((callback) => callback(0));
      lastFixture.detectChanges();
    }

    beforeEach(() => {
      frames = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
    });

    async function renderWithNav(): Promise<HTMLElement> {
      const element = await render('design-systems');
      lastFixture.componentRef.setInput('lessonNav', true);
      lastFixture.detectChanges();
      return element;
    }

    afterEach(() => vi.restoreAllMocks());

    it('is off unless the course page asks for it', async () => {
      const element = await render('design-systems');
      expect(element.querySelector('app-course-lesson-nav')).toBeNull();
      expect(element.querySelector('.learning-map-layout.with-lesson-nav')).toBeNull();
    });

    it('lists every lesson in course order, each linked like its card', async () => {
      const element = await renderWithNav();
      const links = navLinks(element);
      const cards = Array.from(element.querySelectorAll<HTMLAnchorElement>('a.unit-card'));

      expect(element.querySelector('.learning-map-layout.with-lesson-nav')).not.toBeNull();
      expect(element.querySelector('app-course-lesson-nav nav')?.getAttribute('aria-label')).toBe(
        'Lessons in Design Rounds',
      );
      expect(
        links.map((link) => link.querySelector('.course-lesson-nav-text')?.textContent),
      ).toEqual(['Reservation System', 'Round', 'Plain unit']);
      expect(links.map((link) => link.getAttribute('href'))).toEqual(
        cards.map((card) => card.getAttribute('href')),
      );
      expect(
        links.map((link) => link.querySelector('.course-lesson-nav-order')?.textContent),
      ).toEqual(['01', '02', '03']);
    });

    it('leaves the lesson numbers to the side nav, not the cards', async () => {
      const element = await renderWithNav();
      const cards = Array.from(element.querySelectorAll<HTMLAnchorElement>('a.unit-card'));

      expect(
        cards.map((card) => card.querySelector('.unit-card-meta')?.textContent?.trim()),
      ).toEqual(['45 min', undefined, '1 practice']);
      // A card with nothing for the meta line has none, and is described by its summary alone.
      expect(cards[1].getAttribute('aria-describedby')).toBe('unit-card-summary-round-unit');
      expect(
        navLinks(element).map(
          (link) => link.querySelector('.course-lesson-nav-order')?.textContent,
        ),
      ).toEqual(['01', '02', '03']);
    });

    it('keeps listing all lessons while the map is filtered to one family', async () => {
      const element = await renderWithNav();
      const caching = Array.from(
        element.querySelectorAll<HTMLButtonElement>('.unit-card-pill'),
      ).find((pill) => pill.textContent?.trim() === 'Caching')!;
      caching.click();
      await lastFixture.whenStable();
      lastFixture.detectChanges();

      expect(element.querySelectorAll('a.unit-card')).toHaveLength(1);
      expect(navLinks(element)).toHaveLength(3);
    });

    it('marks the lesson whose card is in view as the reader scrolls', async () => {
      const element = await renderWithNav();

      placeCards(element, [400, 400, 900]);
      scroll();
      expect(currentTitle(element)).toBe('Reservation System');
      expect(element.querySelectorAll('app-course-lesson-nav [aria-current]')).toHaveLength(1);

      placeCards(element, [-200, -200, 500]);
      scroll();
      expect(currentTitle(element)).toBe('Plain unit');
    });

    it('marks the lesson under the pointer or holding keyboard focus', async () => {
      const element = await renderWithNav();
      placeCards(element, [400, 400, 900]);
      scroll();
      const items = element.querySelectorAll<HTMLElement>('.unit-card-item');

      items[1].dispatchEvent(new MouseEvent('mouseenter'));
      lastFixture.detectChanges();
      expect(currentTitle(element)).toBe('Round');

      items[1].dispatchEvent(new MouseEvent('mouseleave'));
      lastFixture.detectChanges();
      expect(currentTitle(element)).toBe('Reservation System');

      element.querySelector<HTMLAnchorElement>('#unit-plain-unit')!.focus();
      lastFixture.detectChanges();
      expect(currentTitle(element)).toBe('Plain unit');
    });
  });
});
