import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { routes } from '../../app.routes';
import { CourseContent } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { Module } from './module';

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

describe('Module question labels', () => {
  beforeEach(async () => {
    const content = {
      getCatalog: vi.fn(() => of([{ id: streamsCourse.id, title: streamsCourse.title }])),
      getCourse: vi.fn(() => of(streamsCourse)),
    };
    await TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: ContentService, useValue: content }],
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
});
