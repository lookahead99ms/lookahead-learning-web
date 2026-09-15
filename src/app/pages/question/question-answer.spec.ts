import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { routes } from '../../app.routes';
import { ContentService } from '../../content/content.service';
import { CourseOutline, InterviewQuestion } from '../../content/content.models';
import { Question } from './question';

// Synthetic content: no private curriculum belongs in the public test suite.
const example: InterviewQuestion = {
  id: 'example',
  moduleId: 'basics',
  order: 1,
  title: 'Explain the example',
  difficulty: 'Beginner',
  tags: [],
  contentType: 'q-and-a',
  interviewAnswer: 'Keep <strong>one</strong> clear contract.',
  explanation: ['Use <code>value</code> consistently.', 'Preserve the input.'],
  code: {
    language: 'java',
    title: 'A small example',
    source: 'String value = "<sample>";\nreturn value;',
  },
  compatibility: [{ technology: 'Java', version: '17+' }],
  versionNotes: ['Use <em>supported</em> versions.'],
  followUps: [{ question: 'What changes?', answer: 'Keep the <strong>contract</strong> stable.' }],
  relatedArticleId: 'theory',
};

async function render(path: 'learn' | 'grow' | 'look-ahead', item = example) {
  const outline: CourseOutline = {
    id: 'sample',
    path,
    title: 'Sample course',
    description: '',
    version: '1',
    modules: [{ id: 'basics', title: 'Basics', order: 1, description: '' }],
    moduleDetailRefs: [],
    questions: [
      item,
      { ...item, id: 'theory', title: 'Example theory', contentType: 'theory' as const },
    ].map((q) => ({
      id: q.id,
      title: q.title,
      moduleId: q.moduleId,
      order: q.order,
      difficulty: q.difficulty,
      tags: q.tags,
      contentType: q.contentType!,
      isTheoryArticle: q.contentType === 'theory',
      detailRef: { kind: 'content-item' as const, href: '/content/example.json', version: '1' },
    })),
  };
  await TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      {
        provide: ContentService,
        useValue: {
          getCatalog: () => of([{ id: 'sample', title: 'Sample course' }]),
          getCourseOutline: () => of(outline),
          getContentItem: () => of(item),
          getHandsOnDsaIndex: () =>
            of({
              schemaVersion: 'hands-on-dsa-index/v1',
              totals: { groups: 0, problemPlacements: 0, distinctProblems: 0 },
              groups: [],
            }),
        },
      },
    ],
  }).compileComponents();
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(`/${path}/sample/example`, Question);
  return harness.routeNativeElement!;
}

describe('Non-DSA Answer + Example', () => {
  it.each(['learn', 'grow', 'look-ahead'] as const)(
    'uses the same content flow for %s',
    async (path) => {
      const root = await render(path);
      const layout = root.querySelector('.non-dsa-answer-layout')!;
      expect(layout).not.toBeNull();
      expect(layout.querySelector('.harbor-answer-layout')).toBeNull();
      const answer = layout.querySelector('.reader-interview-panel')!;
      const details = layout.querySelector('.details-content')!;
      expect(
        answer.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(answer.querySelector('strong')?.textContent).toBe('one');
      expect(layout.querySelector('.explanation-panel code')?.textContent).toBe('value');
      expect(layout.querySelector('.code-panel pre')?.textContent).toBe(example.code!.source);
      expect(layout.querySelector('.code-panel pre')?.getAttribute('tabindex')).toBe('0');
      expect(layout.querySelector('.code-panel app-code-copy-button')).not.toBeNull();
      expect(layout.querySelector('.compatibility-notes')?.textContent).toContain('17+');
      expect(layout.querySelector('.related-theory-link')?.getAttribute('href')).toBe(
        `/${path}/sample/theory`,
      );
      expect(root.querySelector('app-dsa-problem-pilot')).toBeNull();
      expect(root.textContent).not.toContain('Answer layout comparison');
    },
  );

  it('omits the editor when the question has no code', async () => {
    const root = await render('grow', { ...example, code: undefined });
    expect(root.querySelector('.explanation-panel')).not.toBeNull();
    expect(root.querySelector('.code-panel')).toBeNull();
    expect(root.querySelector('.has-reference-code')).toBeNull();
  });

  it('preserves native disclosures and rich canonical notes and follow-ups', async () => {
    const root = await render('grow');
    const notes = root.querySelector<HTMLDetailsElement>('.answer-version-notes')!;
    const followUp = root.querySelector<HTMLDetailsElement>('.main-followups details')!;
    expect(notes.open).toBe(false);
    notes.querySelector('summary')!.click();
    expect(notes.open).toBe(true);
    expect(notes.querySelector('em')?.textContent).toBe('supported');
    expect(followUp.open).toBe(false);
    followUp.querySelector('summary')!.click();
    expect(followUp.open).toBe(true);
    expect(followUp.querySelector('strong')?.textContent).toBe('contract');
  });

  it('omits empty supplemental sections', async () => {
    const root = await render('learn', { ...example, versionNotes: [], followUps: [] });
    expect(root.querySelector('.answer-version-notes')).toBeNull();
    expect(root.querySelector('.main-followups')).toBeNull();
  });
});
