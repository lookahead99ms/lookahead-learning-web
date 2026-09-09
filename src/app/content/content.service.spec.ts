import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ContentService,
  DSA_DETAIL_CACHE_MAX_BYTES,
  DSA_DETAIL_CACHE_MAX_ENTRIES,
} from './content.service';

describe('ContentService canonical DSA details', () => {
  it('does not retain a stale problem detail for the application lifetime', () => {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(ContentService);
    const http = TestBed.inject(HttpTestingController);
    const titles: string[] = [];

    service.getDsaProblem('sample-problem').subscribe((problem) => titles.push(problem.title));
    http
      .expectOne('/content/learn/dsa-problems/sample-problem.json')
      .flush({ title: 'Earlier detail' });

    service.getDsaProblem('sample-problem').subscribe((problem) => titles.push(problem.title));
    http
      .expectOne('/content/learn/dsa-problems/sample-problem.json')
      .flush({ title: 'Updated detail' });

    expect(titles).toEqual(['Earlier detail', 'Updated detail']);
    http.verify();
  });

  it('reuses only a version-matched canonical problem detail', () => {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(ContentService);
    const http = TestBed.inject(HttpTestingController);
    const titles: string[] = [];

    service
      .getDsaProblem('sample-problem', 'version-a')
      .subscribe((problem) => titles.push(problem.title));
    http.expectOne('/content/learn/dsa-problems/sample-problem.json').flush({ title: 'Version A' });
    service
      .getDsaProblem('sample-problem', 'version-a')
      .subscribe((problem) => titles.push(problem.title));
    http.expectNone('/content/learn/dsa-problems/sample-problem.json');

    service
      .getDsaProblem('sample-problem', 'version-b')
      .subscribe((problem) => titles.push(problem.title));
    http.expectOne('/content/learn/dsa-problems/sample-problem.json').flush({ title: 'Version B' });

    expect(titles).toEqual(['Version A', 'Version A', 'Version B']);
    http.verify();
  });

  it('evicts the least-recently-used detail when the entry bound is exceeded', () => {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(ContentService);
    const http = TestBed.inject(HttpTestingController);

    for (let index = 0; index <= DSA_DETAIL_CACHE_MAX_ENTRIES; index++) {
      const id = `sample-problem-${index}`;
      service.getDsaProblem(id, 'version-a').subscribe();
      http.expectOne(`/content/learn/dsa-problems/${id}.json`).flush({ id, title: id });
    }

    service.getDsaProblem('sample-problem-0', 'version-a').subscribe();
    http
      .expectOne('/content/learn/dsa-problems/sample-problem-0.json')
      .flush({ id: 'sample-problem-0', title: 'Loaded again' });
    http.verify();
  });

  it('does not retain a single detail larger than the byte bound', () => {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(ContentService);
    const http = TestBed.inject(HttpTestingController);

    service.getDsaProblem('oversized-problem', 'version-a').subscribe();
    http.expectOne('/content/learn/dsa-problems/oversized-problem.json').flush({
      id: 'oversized-problem',
      title: 'x'.repeat(DSA_DETAIL_CACHE_MAX_BYTES),
    });
    service.getDsaProblem('oversized-problem', 'version-a').subscribe();
    http
      .expectOne('/content/learn/dsa-problems/oversized-problem.json')
      .flush({ id: 'oversized-problem', title: 'Loaded again' });
    http.verify();
  });

  it('removes a failed detail request so the same version can be retried', () => {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(ContentService);
    const http = TestBed.inject(HttpTestingController);

    service.getDsaProblem('retry-problem', 'version-a').subscribe({ error: () => undefined });
    http
      .expectOne('/content/learn/dsa-problems/retry-problem.json')
      .flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    service.getDsaProblem('retry-problem', 'version-a').subscribe();
    http
      .expectOne('/content/learn/dsa-problems/retry-problem.json')
      .flush({ id: 'retry-problem', title: 'Recovered' });
    http.verify();
  });

  it('loads and replays the compact Hands-On index once', () => {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(ContentService);
    const http = TestBed.inject(HttpTestingController);
    const totals: number[] = [];

    service.getHandsOnDsaIndex().subscribe((index) => totals.push(index.totals.distinctProblems));
    http.expectOne('/content/hands-on-dsa-index.json').flush({
      schemaVersion: 'hands-on-dsa-index/v1',
      totals: { groups: 1, problemPlacements: 1, distinctProblems: 1 },
      groups: [],
    });
    service.getHandsOnDsaIndex().subscribe((index) => totals.push(index.totals.distinctProblems));
    http.expectNone('/content/hands-on-dsa-index.json');

    expect(totals).toEqual([1, 1]);
    http.verify();
  });

  it('shares the entry bound across generated items and canonical DSA details', () => {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(ContentService);
    const http = TestBed.inject(HttpTestingController);

    const item = {
      id: 'selected-item',
      detailRef: {
        kind: 'content-item' as const,
        href: '/content/details/learn/sample/intro/selected-item.json',
        version: 'version-a',
      },
    } as any;
    service.getContentItem(item).subscribe();
    http.expectOne(item.detailRef.href).flush({ id: item.id });
    for (let index = 0; index < DSA_DETAIL_CACHE_MAX_ENTRIES; index++) {
      const id = `shared-cache-problem-${index}`;
      service.getDsaProblem(id, 'version-a').subscribe();
      http.expectOne(`/content/learn/dsa-problems/${id}.json`).flush({ id, title: id });
    }
    service.getContentItem(item).subscribe();
    http.expectOne(item.detailRef.href).flush({ id: item.id });
    http.verify();
  });
});

describe('ContentService answer slide details', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    return {
      service: TestBed.inject(ContentService),
      http: TestBed.inject(HttpTestingController),
    };
  }

  const question = {
    id: 'sample-question',
    title: 'What is the contract?',
    interviewAnswer: 'The canonical answer remains in the detail record.',
    explanation: ['The projection references this explanation.'],
  } as any;
  const detailRef = {
    kind: 'content-item' as const,
    href: '/content/details/learn/sample/intro/sample-question.json',
    version: 'source-v1',
  };
  const answerSlidesRef = {
    kind: 'answer-slides' as const,
    href: '/content/answer-slides/learn/sample/intro/sample-question.json',
    version: 'deck-v1',
    sourceVersion: 'source-v1',
  };
  const summary = { id: question.id, detailRef, answerSlidesRef } as any;
  const deck = {
    schemaVersion: 'answer-slides/v1',
    id: 'sample-question-answer',
    mode: 'derived',
    sourceContentId: question.id,
    source: detailRef,
    slides: [
      {
        id: 'sample-question-answer-question',
        order: 1,
        kind: 'interview-question',
        contentRefs: [{ contentId: question.id, field: 'title' }],
      },
      {
        id: 'sample-question-answer-answer',
        order: 2,
        kind: 'interview-answer',
        contentRefs: [{ contentId: question.id, field: 'interviewAnswer' }],
      },
    ],
  };

  it('uses the existing full-answer path when legacy content has no deck reference', () => {
    const { service, http } = setup();
    let result: unknown = 'not-set';

    service
      .getAnswerSlideDeck({ id: question.id, detailRef } as any, question)
      .subscribe((value) => (result = value));

    expect(result).toBeUndefined();
    http.expectNone(answerSlidesRef.href);
    http.verify();
  });

  it('loads, validates, and reuses a version-matched answer slide deck', () => {
    const { service, http } = setup();
    const ids: string[] = [];

    service.getAnswerSlideDeck(summary, question).subscribe((value) => ids.push(value!.id));
    http.expectOne(answerSlidesRef.href).flush(deck);
    service.getAnswerSlideDeck(summary, question).subscribe((value) => ids.push(value!.id));
    http.expectNone(answerSlidesRef.href);

    expect(ids).toEqual(['sample-question-answer', 'sample-question-answer']);
    http.verify();
  });

  it('rejects a stale source reference before requesting the deck', () => {
    const { service, http } = setup();
    let error: Error | undefined;

    service
      .getAnswerSlideDeck(
        { ...summary, answerSlidesRef: { ...answerSlidesRef, sourceVersion: 'source-v0' } },
        question,
      )
      .subscribe({ error: (cause) => (error = cause) });

    expect(error?.message).toContain('Invalid answer slide reference');
    http.expectNone(answerSlidesRef.href);
    http.verify();
  });

  it('rejects a fetched deck with duplicate stable slide IDs', () => {
    const { service, http } = setup();
    let error: Error | undefined;

    service.getAnswerSlideDeck(summary, question).subscribe({ error: (cause) => (error = cause) });
    http.expectOne(answerSlidesRef.href).flush({
      ...deck,
      slides: [deck.slides[0], { ...deck.slides[1], id: deck.slides[0].id }],
    });

    expect(error?.message).toContain('duplicate slide id');
    http.verify();
  });
});

describe('ContentService compact indexes and selected details', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    return {
      service: TestBed.inject(ContentService),
      http: TestBed.inject(HttpTestingController),
    };
  }

  function record(id: string, contentType: 'theory' | 'q-and-a' | 'dsa-problem' | 'guide') {
    return {
      id,
      contentId: id,
      courseId: 'sample',
      courseTitle: 'Sample course',
      moduleId: 'intro',
      moduleTitle: 'Introduction',
      title: id,
      contentType,
      tags: ['Contracts'],
      languages: ['java'],
      difficulty: 'Beginner',
      preview: 'A compact preview.',
      access: { tier: 'free' },
      detailRef: {
        kind: contentType === 'dsa-problem' ? 'canonical-dsa' : 'content-item',
        href:
          contentType === 'dsa-problem'
            ? `/content/learn/dsa-problems/${id}.json`
            : `/content/details/learn/sample/intro/${id}.json`,
        version: 'version-a',
      },
    };
  }

  it('loads and replays the manifest and path shards as one compact index', () => {
    const { service, http } = setup();
    const searchIds: string[][] = [];
    const practiceIds: string[][] = [];

    service
      .getSearchIndex()
      .subscribe((documents) => searchIds.push(documents.map(({ id }) => id)));
    service
      .getInterviewQuestionIndex()
      .subscribe((documents) => practiceIds.push(documents.map(({ id }) => id)));
    http.expectOne('/content/content-index-manifest.json').flush({
      schemaVersion: 'content-index-manifest/v1',
      totals: { searchDocuments: 3, practiceDocuments: 2 },
      practiceContentTypes: ['q-and-a', 'dsa-problem'],
      shards: [
        {
          path: 'learn',
          href: '/content/indexes/learn.json',
          documentCount: 2,
          practiceDocumentCount: 1,
        },
        {
          path: 'grow',
          href: '/content/indexes/grow.json',
          documentCount: 1,
          practiceDocumentCount: 1,
        },
        {
          path: 'look-ahead',
          href: '/content/indexes/look-ahead.json',
          documentCount: 0,
          practiceDocumentCount: 0,
        },
      ],
    });
    http.expectOne('/content/indexes/learn.json').flush({
      schemaVersion: 'content-index-shard/v1',
      path: 'learn',
      documents: [record('lesson', 'theory'), record('coding-problem', 'dsa-problem')],
    });
    http.expectOne('/content/indexes/grow.json').flush({
      schemaVersion: 'content-index-shard/v1',
      path: 'grow',
      documents: [record('question', 'q-and-a')],
    });
    http.expectOne('/content/indexes/look-ahead.json').flush({
      schemaVersion: 'content-index-shard/v1',
      path: 'look-ahead',
      documents: [],
    });

    expect(searchIds).toEqual([['lesson', 'coding-problem', 'question']]);
    expect(practiceIds).toEqual([['coding-problem', 'question']]);
    service.getSearchIndex().subscribe();
    http.expectNone('/content/content-index-manifest.json');
    http.verify();
  });

  it('loads only the requested path shard and reuses it for a later full index', () => {
    const { service, http } = setup();
    const scopedIds: string[][] = [];
    const fullIds: string[][] = [];

    service
      .getInterviewQuestionIndex('grow')
      .subscribe((documents) => scopedIds.push(documents.map(({ id }) => id)));
    http.expectOne('/content/content-index-manifest.json').flush({
      schemaVersion: 'content-index-manifest/v1',
      totals: { searchDocuments: 3, practiceDocuments: 2 },
      practiceContentTypes: ['q-and-a', 'dsa-problem'],
      shards: [
        {
          path: 'learn',
          href: '/content/indexes/learn.json',
          documentCount: 1,
          practiceDocumentCount: 1,
        },
        {
          path: 'grow',
          href: '/content/indexes/grow.json',
          documentCount: 1,
          practiceDocumentCount: 1,
        },
        {
          path: 'look-ahead',
          href: '/content/indexes/look-ahead.json',
          documentCount: 1,
          practiceDocumentCount: 0,
        },
      ],
    });
    http.expectOne('/content/indexes/grow.json').flush({
      schemaVersion: 'content-index-shard/v1',
      path: 'grow',
      documents: [record('grow-question', 'q-and-a')],
    });
    http.expectNone('/content/indexes/learn.json');
    http.expectNone('/content/indexes/look-ahead.json');
    expect(scopedIds).toEqual([['grow-question']]);

    service.getSearchIndex().subscribe((documents) => fullIds.push(documents.map(({ id }) => id)));
    http.expectOne('/content/indexes/learn.json').flush({
      schemaVersion: 'content-index-shard/v1',
      path: 'learn',
      documents: [record('learn-question', 'q-and-a')],
    });
    http.expectOne('/content/indexes/look-ahead.json').flush({
      schemaVersion: 'content-index-shard/v1',
      path: 'look-ahead',
      documents: [record('look-ahead-lesson', 'theory')],
    });
    http.expectNone('/content/indexes/grow.json');
    expect(fullIds).toEqual([['learn-question', 'grow-question', 'look-ahead-lesson']]);
    http.verify();
  });

  it('accepts navigation-only discovery records and excludes them from interview practice', () => {
    const { service, http } = setup();
    const searchKinds: string[][] = [];
    const practiceIds: string[][] = [];

    service
      .getSearchIndex('learn')
      .subscribe((documents) =>
        searchKinds.push(documents.map(({ discoveryKind }) => discoveryKind ?? 'legacy')),
      );
    service
      .getInterviewQuestionIndex('learn')
      .subscribe((documents) => practiceIds.push(documents.map(({ id }) => id)));
    http.expectOne('/content/content-index-manifest.json').flush({
      schemaVersion: 'content-index-manifest/v1',
      totals: { searchDocuments: 2, practiceDocuments: 1 },
      practiceContentTypes: ['q-and-a'],
      practiceFormats: ['explain', 'solve', 'design', 'debug', 'rehearse'],
      shards: [
        {
          path: 'learn',
          href: '/content/indexes/learn.json',
          documentCount: 2,
          practiceDocumentCount: 1,
        },
      ],
    });
    http.expectOne('/content/indexes/learn.json').flush({
      schemaVersion: 'content-index-shard/v1',
      path: 'learn',
      documents: [
        {
          ...record('course:learn:sample', 'guide'),
          contentId: 'sample',
          discoveryKind: 'course',
          subjects: ['Contracts'],
          route: ['/', 'learn', 'sample'],
          detailRef: undefined,
        },
        {
          ...record('question', 'q-and-a'),
          discoveryKind: 'practice',
          practiceFormat: 'explain',
        },
      ],
    });

    expect(searchKinds).toEqual([['course', 'practice']]);
    expect(practiceIds).toEqual([['question']]);
    http.verify();
  });

  it('fails closed when the requested path has no manifest shard', () => {
    const { service, http } = setup();
    let error: Error | undefined;

    service.getSearchIndex('grow').subscribe({ error: (cause) => (error = cause) });
    http.expectOne('/content/content-index-manifest.json').flush({
      schemaVersion: 'content-index-manifest/v1',
      totals: { searchDocuments: 0, practiceDocuments: 0 },
      practiceContentTypes: ['q-and-a'],
      shards: [
        {
          path: 'learn',
          href: '/content/indexes/learn.json',
          documentCount: 0,
          practiceDocumentCount: 0,
        },
      ],
    });

    expect(error?.message).toBe('Content index shard is missing for grow');
    http.expectNone('/content/indexes/learn.json');
    http.verify();
  });

  it('rejects a practice total that disagrees with the manifest', () => {
    const { service, http } = setup();
    let error: Error | undefined;
    service.getInterviewQuestionIndex().subscribe({ error: (cause) => (error = cause) });
    http.expectOne('/content/content-index-manifest.json').flush({
      schemaVersion: 'content-index-manifest/v1',
      totals: { searchDocuments: 1, practiceDocuments: 0 },
      practiceContentTypes: ['q-and-a'],
      shards: [
        {
          path: 'learn',
          href: '/content/indexes/learn.json',
          documentCount: 1,
          practiceDocumentCount: 1,
        },
      ],
    });
    http.expectOne('/content/indexes/learn.json').flush({
      schemaVersion: 'content-index-shard/v1',
      path: 'learn',
      documents: [record('question', 'q-and-a')],
    });
    expect(error?.message).toBe('Practice index total does not match its manifest');
    http.verify();
  });

  it('rejects an unsafe shard reference before requesting it', () => {
    const { service, http } = setup();
    let error: Error | undefined;
    service.getSearchIndex().subscribe({ error: (cause) => (error = cause) });
    http.expectOne('/content/content-index-manifest.json').flush({
      schemaVersion: 'content-index-manifest/v1',
      totals: { searchDocuments: 1, practiceDocuments: 0 },
      practiceContentTypes: ['q-and-a'],
      shards: [
        {
          path: 'learn',
          href: '/content/../private.json',
          documentCount: 1,
          practiceDocumentCount: 0,
        },
      ],
    });
    expect(error?.message).toBe('Invalid content index manifest');
    http.expectNone('/content/../private.json');
    http.verify();
  });

  it('loads a locator first and requests only the selected module', () => {
    const { service, http } = setup();
    let outline: any;
    let questions: any[] = [];
    service.getCourseOutline('learn', 'sample').subscribe((value) => (outline = value));
    http.expectOne('/content/learn/sample/content-locator.json').flush({
      schemaVersion: 'course-content-locator/v1',
      course: {
        id: 'sample',
        path: 'learn',
        title: 'Sample course',
        description: 'Description',
        version: '1',
        modules: [
          { id: 'intro', title: 'Introduction', order: 1 },
          { id: 'advanced', title: 'Advanced', order: 2 },
        ],
      },
      items: [],
      modules: [
        {
          moduleId: 'intro',
          href: '/content/learn/sample/modules/intro.json',
          version: 'intro-v1',
          itemIds: ['selected-item'],
        },
        {
          moduleId: 'advanced',
          href: '/content/learn/sample/modules/advanced.json',
          version: 'advanced-v1',
          itemIds: ['other-item'],
        },
      ],
    });
    service.getModuleQuestions(outline, 'intro').subscribe((value) => (questions = value));
    http
      .expectOne('/content/learn/sample/modules/intro.json')
      .flush([{ id: 'selected-item', title: 'Selected item' }]);
    http.expectNone('/content/learn/sample/modules/advanced.json');
    service.getModuleQuestions(outline, 'intro').subscribe();
    http.expectNone('/content/learn/sample/modules/intro.json');
    expect(questions[0].id).toBe('selected-item');
    http.verify();
  });

  it('rejects invalid practice formats in compact course metadata', () => {
    const { service, http } = setup();
    let error: Error | undefined;
    service.getCourseOutline('learn', 'sample').subscribe({ error: (cause) => (error = cause) });
    http.expectOne('/content/learn/sample/content-locator.json').flush({
      schemaVersion: 'course-content-locator/v1',
      course: {
        id: 'sample',
        path: 'learn',
        title: 'Sample course',
        modules: [{ id: 'questions', title: 'Questions', order: 1 }],
      },
      items: [
        {
          id: 'question',
          moduleId: 'questions',
          order: 1,
          title: 'Question',
          difficulty: 'Beginner',
          tags: [],
          contentType: 'q-and-a',
          isTheoryArticle: false,
          practiceFormat: 'quiz',
          detailRef: {
            kind: 'content-item',
            href: '/content/details/learn/sample/questions/question.json',
            version: 'v1',
          },
        },
      ],
      modules: [
        {
          moduleId: 'questions',
          href: '/content/learn/sample/modules/questions.json',
          version: 'v1',
          itemIds: ['question'],
        },
      ],
    });

    expect(error?.message).toBe('Invalid course content locator: learn/sample');
    http.verify();
  });

  it('loads and caches only the selected generated detail', () => {
    const { service, http } = setup();
    const summary = {
      id: 'selected-item',
      detailRef: {
        kind: 'content-item' as const,
        href: '/content/details/learn/sample/intro/selected-item.json',
        version: 'item-v1',
      },
    } as any;
    const titles: string[] = [];
    service.getContentItem(summary).subscribe((item) => titles.push(item.title));
    http.expectOne(summary.detailRef.href).flush({ id: summary.id, title: 'Selected item' });
    service.getContentItem(summary).subscribe((item) => titles.push(item.title));
    http.expectNone(summary.detailRef.href);
    expect(titles).toEqual(['Selected item', 'Selected item']);
    http.verify();
  });

  it('removes a failed generated detail so the same version can be retried', () => {
    const { service, http } = setup();
    const result = {
      ...record('retry-item', 'q-and-a'),
      path: 'learn',
      filterTags: [],
      searchableText: '',
    } as any;
    service.getInterviewQuestion(result).subscribe({ error: () => undefined });
    http
      .expectOne(result.detailRef.href)
      .flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    service.getInterviewQuestion(result).subscribe();
    http.expectOne(result.detailRef.href).flush({ id: result.contentId });
    http.verify();
  });

  it('rejects unsafe locator and detail references without requesting them', () => {
    const { service, http } = setup();
    let locatorError: Error | undefined;
    service
      .getCourseOutline('learn', 'sample')
      .subscribe({ error: (cause) => (locatorError = cause) });
    http.expectOne('/content/learn/sample/content-locator.json').flush({
      schemaVersion: 'course-content-locator/v1',
      course: { id: 'sample', path: 'learn' },
      items: [],
      modules: [
        { moduleId: 'intro', href: '/content/../private.json', version: 'v1', itemIds: [] },
      ],
    });
    expect(locatorError?.message).toContain('Invalid course content locator');

    let detailError: Error | undefined;
    service
      .getContentItem({
        id: 'unsafe-item',
        detailRef: {
          kind: 'content-item',
          href: '/content/../private.json',
          version: 'v1',
        },
      } as any)
      .subscribe({ error: (cause) => (detailError = cause) });
    expect(detailError?.message).toContain('Invalid content detail reference');
    http.expectNone('/content/../private.json');
    http.verify();
  });
});
