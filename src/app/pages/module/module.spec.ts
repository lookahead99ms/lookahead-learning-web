import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { CourseContent, CourseOutline } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { Module } from './module';

@Component({ template: '' })
class NavigationTarget {}

const streamsCourse: CourseContent = {
  id: 'modern-java',
  path: 'learn',
  title: 'Modern Java',
  description: 'Modern Java course.',
  version: 'Java 21+',
  modules: [
    {
      id: 'streams',
      order: 1,
      title: 'Streams',
      description: 'Learn Stream reasoning.',
    },
    {
      id: 'streams-practice',
      order: 2,
      title: 'Streams Practice',
      description: 'Practice Stream and collection problems.',
    },
  ],
  learningUnits: [
    {
      id: 'streams',
      title: 'Streams',
      description: 'Learn and practice Stream reasoning.',
      theoryModuleId: 'streams',
      questionModuleId: 'streams',
      practiceModuleId: 'streams-practice',
      practiceExperience: 'questionBank',
    },
  ],
  questions: [
    {
      id: 'stream-concept',
      moduleId: 'streams',
      order: 1,
      title: 'How do Streams work?',
      difficulty: 'Intermediate',
      tags: ['Streams'],
      interviewAnswer: 'A Stream describes a lazy data-processing pipeline.',
      explanation: ['A terminal operation starts traversal.'],
      versionNotes: [],
      followUps: [],
    },
    {
      id: 'stream-practice',
      moduleId: 'streams-practice',
      order: 1,
      title: 'Filter merit students',
      difficulty: 'Beginner',
      tags: ['Streams'],
      interviewAnswer: 'Filter by the published merit threshold.',
      explanation: ['The predicate applies the selection contract.'],
      versionNotes: [],
      followUps: [],
    },
  ],
};

const streamsOutline: CourseOutline = {
  ...streamsCourse,
  questions: streamsCourse.questions.map((question) => ({
    id: question.id,
    moduleId: question.moduleId,
    order: question.order,
    title: question.title,
    difficulty: question.difficulty,
    tags: question.tags,
    contentType: question.contentType ?? 'q-and-a',
    isTheoryArticle: false,
    detailRef: {
      kind: 'content-item',
      href: `/content/details/learn/modern-java/${question.moduleId}/${question.id}.json`,
      version: 'test-v1',
    },
  })),
  moduleDetailRefs: streamsCourse.modules.map((module) => ({
    moduleId: module.id,
    href: `/content/learn/modern-java/modules/${module.id}.json`,
    version: 'test-v1',
    itemIds: streamsCourse.questions
      .filter((question) => question.moduleId === module.id)
      .map((question) => question.id),
  })),
};

describe('Module question labels', () => {
  beforeEach(async () => {
    const content = {
      getCatalog: vi.fn(() => of([{ id: streamsCourse.id, title: streamsCourse.title }])),
      getCourseOutline: vi.fn(() => of(streamsOutline)),
      getModuleQuestions: vi.fn((_course: CourseOutline, moduleId: string) =>
        of(streamsCourse.questions.filter((question) => question.moduleId === moduleId)),
      ),
    };
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          ...['learn', 'grow', 'look-ahead'].map((path) => ({
            path: `${path}/:courseId/module/:moduleId`,
            component: Module,
            data: { pathId: path },
          })),
          { path: 'search', component: NavigationTarget },
          { path: ':pathId/:courseId/:questionId', component: NavigationTarget },
        ]),
        { provide: ContentService, useValue: content },
      ],
    }).compileComponents();
  });

  it('labels explicitly mapped question-bank exercises as Practice', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/modern-java/module/streams-practice', Module);

    const labels = [...(harness.routeNativeElement?.querySelectorAll('.question-filter-tag') ?? [])]
      .map((element) => element.textContent?.trim())
      .filter(Boolean);

    expect(labels).toContain('Practice');
    expect(labels).not.toContain('Q&A');
  });

  it('retains the Q&A label for the conceptual interview module', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/modern-java/module/streams', Module);

    const labels = [...(harness.routeNativeElement?.querySelectorAll('.question-filter-tag') ?? [])]
      .map((element) => element.textContent?.trim())
      .filter(Boolean);

    expect(labels).toContain('Q&A');
    expect(labels).not.toContain('Practice');
  });

  for (const path of ['learn', 'grow', 'look-ahead']) {
    for (const [moduleId, questionId] of [
      ['streams', 'stream-concept'],
      ['streams-practice', 'stream-practice'],
    ]) {
      it(`provides a native primary link for ${path}/${moduleId} without nesting filter links`, async () => {
        const harness = await RouterTestingHarness.create();
        await harness.navigateByUrl(`/${path}/modern-java/module/${moduleId}`, Module);
        const card = harness.routeNativeElement!.querySelector('.question-card')!;
        const primary = card.querySelector<HTMLAnchorElement>('h3 a.question-card-link');

        expect(primary).not.toBeNull();
        expect(primary?.getAttribute('href')).toBe(`/${path}/modern-java/${questionId}`);
        expect(primary?.textContent?.trim()).toBe(
          streamsCourse.questions.find((question) => question.id === questionId)!.title,
        );
        expect(card.querySelector('a a, a button, button a')).toBeNull();
        expect(card.querySelector('button, .question-card-open')).toBeNull();
        expect(card.textContent).not.toContain('Open question');
        expect(card.getAttribute('tabindex')).toBeNull();
        expect(card.querySelector('a')).toBe(primary);

        primary!.click();
        await harness.fixture.whenStable();
        expect(TestBed.inject(Router).url).toBe(`/${path}/modern-java/${questionId}`);
      });
    }
  }

  it('keeps each pill as its own Search link rather than opening the card answer', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/grow/modern-java/module/streams-practice', Module);
    const card = harness.routeNativeElement!.querySelector('.question-card')!;
    const tags = Array.from(card.querySelectorAll<HTMLAnchorElement>('.question-filter-tag'));
    for (const tag of tags) {
      expect(tag.closest('.question-card-link')).toBeNull();
      const url = TestBed.inject(Router).parseUrl(tag.getAttribute('href')!);
      expect(url.queryParams['tags']).toBe(tag.textContent?.trim());
    }
    tags.find((tag) => tag.textContent?.trim() === 'Streams')!.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/search?tags=Streams');
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }])(
    'preserves native modified-link behavior for %o',
    async (modifier) => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/learn/modern-java/module/streams-practice', Module);
      const primary =
        harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.question-card-link')!;
      expect(primary).not.toBeNull();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...modifier });
      let handledByRouter = true;
      primary.addEventListener(
        'click',
        (click) => {
          handledByRouter = click.defaultPrevented;
          // Suppress jsdom navigation only after observing RouterLink's native-link decision.
          click.preventDefault();
        },
        { once: true },
      );
      primary.dispatchEvent(event);
      expect(handledByRouter).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    },
  );
});
