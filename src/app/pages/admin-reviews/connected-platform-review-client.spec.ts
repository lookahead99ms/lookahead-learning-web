import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ACCOUNT_FETCH, StudyPlanAccount } from '../study-plan/study-plan-account';
import { ConnectedPlatformReviewClient } from './connected-platform-review-client';
import { PlatformReviewDraft, PlatformReviewError } from './platform-review.model';

const itemId = '6c8bc359-1141-4c98-83e6-a5ca967fe180';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('ConnectedPlatformReviewClient', () => {
  let calls: { url: string; init: RequestInit }[];
  let responses: Response[];
  let client: ConnectedPlatformReviewClient;
  const account = signal<unknown>({ accountId: 'a' });

  beforeEach(() => {
    calls = [];
    responses = [];
    account.set({ accountId: 'a' });
    TestBed.configureTestingModule({
      providers: [
        ConnectedPlatformReviewClient,
        {
          provide: ACCOUNT_FETCH,
          useValue: async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            return responses.shift()!;
          },
        },
        {
          provide: StudyPlanAccount,
          useValue: {
            account,
            sessionExpired: signal(false),
            apiPath: (path: string) => '/bff/api/v1' + path,
          },
        },
      ],
    });
    client = TestBed.inject(ConnectedPlatformReviewClient);
  });

  it('sends a new item as multipart with CSRF and its request key', async () => {
    responses.push(json(200, { data: { token: 't', headerName: 'X-CSRF-TOKEN' } }));
    responses.push(json(201, { data: { id: itemId } }));
    const image = new File(['png'], 'shot.png', { type: 'image/png' });
    const draft: PlatformReviewDraft = {
      category: 'problem',
      page: 'Search',
      pageUrl: '/search',
      title: 'Title',
      details: 'Details',
      priority: 'high',
      keepAttachmentIds: [],
      newFiles: [image],
      requestKey: 'request-1',
    };
    await client.save(draft);
    const [csrf, save] = calls;
    expect(csrf.url).toBe('/bff/api/v1/auth/csrf');
    expect(save.url).toBe('/bff/api/v1/platform-reviews');
    expect(save.init.method).toBe('POST');
    expect(save.init.headers).toEqual({ 'X-CSRF-TOKEN': 't', 'Idempotency-Key': 'request-1' });
    expect(save.init.credentials).toBe('same-origin');
    const form = save.init.body as FormData;
    expect(JSON.parse(await (form.get('item') as Blob).text())).toEqual({
      category: 'problem',
      page: 'Search',
      pageUrl: '/search',
      title: 'Title',
      details: 'Details',
      priority: 'high',
    });
    expect((form.getAll('image')[0] as File).name).toBe('shot.png');
  });

  it('keeps chosen images when editing and uses PUT', async () => {
    responses.push(json(200, { data: { token: 't', headerName: 'X-CSRF-TOKEN' } }));
    responses.push(json(200, { data: { id: itemId } }));
    await client.save(
      {
        category: 'idea',
        page: 'Home',
        pageUrl: '',
        title: 't',
        details: 'd',
        priority: 'low',
        keepAttachmentIds: ['kept'],
        newFiles: [],
        requestKey: 'k',
      },
      itemId,
    );
    expect(calls[1].url).toBe(`/bff/api/v1/platform-reviews/${itemId}`);
    expect(calls[1].init.method).toBe('PUT');
    const form = calls[1].init.body as FormData;
    expect(JSON.parse(await (form.get('item') as Blob).text()).keepAttachmentIds).toEqual(['kept']);
  });

  it('turns server failures into reader-facing errors', async () => {
    responses.push(json(200, { data: { token: 't', headerName: 'X-CSRF-TOKEN' } }));
    responses.push(json(409, { code: 'PLATFORM_REVIEW_LOCKED', message: 'The owner has already reviewed this item.' }));
    const failure = await client.remove(itemId).catch((error) => error);
    expect(failure).toEqual(new PlatformReviewError('conflict', 'The owner has already reviewed this item.'));
    responses.push(json(403, { code: 'PLATFORM_REVIEW_ACCESS_DENIED' }));
    expect((await client.viewer().catch((error) => error)).kind).toBe('forbidden');
    responses.push(new Response(null, { status: 503 }));
    expect((await client.list().catch((error) => error)).kind).toBe('unavailable');
    expect((await client.item('../plans').catch((error) => error)).kind).toBe('not-found');
    account.set(null);
    expect((await client.list().catch((error) => error)).kind).toBe('unauthorized');
  });

  it('pages older days and shows images through blob URLs', async () => {
    responses.push(json(200, { data: { items: [], nextBefore: null } }));
    await client.list('2026-09-01');
    expect(calls[0].url).toBe('/bff/api/v1/platform-reviews?before=2026-09-01');
    responses.push(new Response(new Blob(['png'], { type: 'image/png' }), { status: 200 }));
    const url = await client.attachmentUrl({ id: itemId } as never, { id: itemId } as never);
    expect(calls[1].url).toBe(`/bff/api/v1/platform-reviews/${itemId}/attachments/${itemId}`);
    expect(url.startsWith('blob:')).toBe(true);
    client.releaseAttachmentUrl(url);
  });
});
