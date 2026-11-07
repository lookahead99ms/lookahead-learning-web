import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ACCOUNT_FETCH, StudyPlanAccount } from '../pages/study-plan/study-plan-account';
import { DeliveryDevPlanService, DeliveryPlanApiError } from './delivery-dev-plan.service';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const csrf = () => json(200, { data: { token: 't', headerName: 'X-CSRF-TOKEN' } });
const item = {
  title: 'A ticket',
  summary: 'Outcome.',
  type: 'story' as const,
  stageId: 'foundation',
  statusId: 'backlog',
  priorityId: 'P2',
  labels: [],
  acceptanceCriteria: [],
  dependencies: [],
  blockedBy: [],
  notes: [],
};

describe('DeliveryDevPlanService (DLV-971 runtime stores)', () => {
  let calls: { url: string; init: RequestInit }[];
  let responses: (Response | Error)[];
  let service: DeliveryDevPlanService;
  const account = signal<unknown>({ accountId: 'a' });
  const sessionExpired = signal(false);

  beforeEach(() => {
    calls = [];
    responses = [];
    account.set({ accountId: 'a' });
    sessionExpired.set(false);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ACCOUNT_FETCH,
          useValue: async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            const next = responses.shift()!;
            if (next instanceof Error) throw next;
            return next;
          },
        },
        {
          provide: StudyPlanAccount,
          useValue: { account, sessionExpired, apiPath: (path: string) => '/bff/api/v1' + path },
        },
      ],
    });
    service = TestBed.inject(DeliveryDevPlanService);
  });

  it('reads the plan through the Gateway session', async () => {
    responses.push(
      json(200, { data: { schemaVersion: 'delivery-plan/v1', version: 7, workItems: [] } }),
    );
    expect(await service.load()).toEqual({
      schemaVersion: 'delivery-plan/v1',
      version: 7,
      workItems: [],
    });
    expect(calls[0].url).toBe('/bff/api/v1/delivery/plan');
    expect(calls[0].init.method).toBeUndefined();
    expect(calls[0].init.credentials).toBe('same-origin');
    expect(calls[0].init.cache).toBe('no-store');
  });

  it('writes with the CSRF token, an Idempotency-Key and the expected version', async () => {
    responses.push(csrf(), json(201, { data: { version: 8, item: { id: 'DLV-0042', ...item } } }));
    expect(await service.create(7, item)).toEqual({
      version: 8,
      item: { id: 'DLV-0042', ...item },
    });
    expect(calls[0].url).toBe('/bff/api/v1/auth/csrf');
    expect(calls[1].url).toBe('/bff/api/v1/delivery/plan/work-items');
    expect(calls[1].init.method).toBe('POST');
    const headers = calls[1].init.headers as Record<string, string>;
    expect(headers['X-CSRF-TOKEN']).toBe('t');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Idempotency-Key']).toMatch(/[0-9a-f-]{36}/);
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ expectedVersion: 7, item });

    responses.push(csrf(), json(200, { data: { version: 9, item: { id: 'DLV-0042', ...item } } }));
    await service.update('DLV-0042', 8, item);
    expect(calls[3].url).toBe('/bff/api/v1/delivery/plan/work-items/DLV-0042');
    expect(calls[3].init.method).toBe('PUT');
    expect(JSON.parse(calls[3].init.body as string)).toEqual({ expectedVersion: 8, item });

    responses.push(csrf(), json(200, { data: { version: 10, item: { id: 'DLV-0042', ...item } } }));
    await service.resolveConflict('DLV-0042', 9, 'local');
    expect(calls[5].url).toBe('/bff/api/v1/delivery/plan/work-items/DLV-0042/resolve-conflict');
    expect(calls[5].init.method).toBe('POST');
    expect(JSON.parse(calls[5].init.body as string)).toEqual({ expectedVersion: 9, keep: 'local' });
    // Ids are path-encoded, never spliced.
    responses.push(csrf(), json(200, { data: { version: 11, item } }));
    await service.update('a/b', 10, item);
    expect(calls[7].url).toBe('/bff/api/v1/delivery/plan/work-items/a%2Fb');
  });

  it('uploads the plan file as written and syncs the inbox already on DEV, both with the CSRF token and an Idempotency-Key', async () => {
    const fileText = '{\n  "schemaVersion": "delivery-plan/v1",\n  "version": 7,\n  "workItems": []\n}\n';
    const merged = {
      synced: true,
      version: 8,
      reason: null,
      counts: { added: 2, takenLocal: 1, keptDev: 0, conflicts: 0, unchanged: 5, deletedOnDev: 0 },
    };
    responses.push(csrf(), json(200, { data: merged }));
    expect(await service.uploadInbox(fileText)).toEqual(merged);
    expect(calls[0].url).toBe('/bff/api/v1/auth/csrf');
    expect(calls[1].url).toBe('/bff/api/v1/delivery/plan/inbox');
    expect(calls[1].init.method).toBe('PUT');
    const headers = calls[1].init.headers as Record<string, string>;
    expect(headers['X-CSRF-TOKEN']).toBe('t');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Idempotency-Key']).toMatch(/[0-9a-f-]{36}/);
    // The file goes as written: the Domain reads its baseVersion itself; the page never re-serialises it.
    expect(calls[1].init.body).toBe(fileText);

    const nothing = { synced: false, version: 8, reason: 'no inbox file', counts: null };
    responses.push(csrf(), json(200, { data: nothing }));
    expect(await service.syncInbox()).toEqual(nothing);
    expect(calls[3].url).toBe('/bff/api/v1/delivery/plan/inbox/sync');
    expect(calls[3].init.method).toBe('POST');
    expect(calls[3].init.body).toBeUndefined();
    const syncHeaders = calls[3].init.headers as Record<string, string>;
    expect(syncHeaders['X-CSRF-TOKEN']).toBe('t');
    expect(syncHeaders['Content-Type']).toBeUndefined();
    expect(syncHeaders['Idempotency-Key']).toMatch(/[0-9a-f-]{36}/);

    responses.push(csrf(), json(422, { error: { code: 'DELIVERY_INBOX_BASE_UNKNOWN', message: 'Base version 3 is not known on DEV.' } }));
    const rejected = (await service.uploadInbox('{}').catch((error) => error)) as DeliveryPlanApiError;
    expect(rejected).toBeInstanceOf(DeliveryPlanApiError);
    expect(rejected.status).toBe(422);
    expect(rejected.code).toBe('DELIVERY_INBOX_BASE_UNKNOWN');
    expect(rejected.message).toBe('Base version 3 is not known on DEV.');
    responses.push(csrf(), json(403, { error: { code: 'DELIVERY_ACCESS_DENIED' } }));
    const denied = (await service.syncInbox().catch((error) => error)) as DeliveryPlanApiError;
    expect(denied.status).toBe(403);
    expect(denied.code).toBe('DELIVERY_ACCESS_DENIED');
  });

  it('names the Domain error code so the page can tell a missing plan from a version conflict', async () => {
    responses.push(json(404, { code: 'DELIVERY_PLAN_MISSING', message: 'No plan yet.' }));
    const missing = (await service.load().catch((error) => error)) as DeliveryPlanApiError;
    expect(missing).toBeInstanceOf(DeliveryPlanApiError);
    expect(missing.status).toBe(404);
    expect(missing.code).toBe('DELIVERY_PLAN_MISSING');
    expect(missing.message).toBe('No plan yet.');
    expect(missing.planMissing).toBe(true);
    expect(missing.versionConflict).toBe(false);

    responses.push(csrf(), json(409, { error: { code: 'VERSION_CONFLICT' } }));
    const conflict = (await service
      .create(1, item)
      .catch((error) => error)) as DeliveryPlanApiError;
    expect(conflict.code).toBe('VERSION_CONFLICT');
    expect(conflict.versionConflict).toBe(true);
    expect(conflict.planMissing).toBe(false);
    expect(conflict.message).toBe('VERSION_CONFLICT');

    responses.push(json(404, { error: 'NOT_FOUND' }));
    const plain = (await service.load().catch((error) => error)) as DeliveryPlanApiError;
    expect(plain.code).toBe('NOT_FOUND');
    expect(plain.planMissing).toBe(false);

    responses.push(new Response('gone', { status: 503 }));
    const statusOnly = (await service.load().catch((error) => error)) as DeliveryPlanApiError;
    expect(statusOnly.status).toBe(503);
    expect(statusOnly.code).toBeNull();
    expect(statusOnly.message).toBe('delivery plan request failed (503)');

    responses.push(new Response('not json', { status: 200 }));
    expect(((await service.load().catch((error) => error)) as DeliveryPlanApiError).message).toBe(
      'The delivery plan answer could not be read.',
    );
  });

  it('reports an unreachable service, a missing CSRF token and a signed-out session without calling the Domain', async () => {
    responses.push(new TypeError('network'));
    const down = (await service.load().catch((error) => error)) as DeliveryPlanApiError;
    expect(down.status).toBe(0);
    expect(down.message).toBe('The delivery plan service could not be reached.');

    responses.push(json(200, { data: { token: 42 } }));
    const noCsrf = (await service.create(1, item).catch((error) => error)) as DeliveryPlanApiError;
    expect(noCsrf.message).toBe('The CSRF token could not be read.');
    expect(calls).toHaveLength(2);

    sessionExpired.set(true);
    const expired = (await service.load().catch((error) => error)) as DeliveryPlanApiError;
    expect(expired.status).toBe(401);
    sessionExpired.set(false);
    account.set(null);
    expect(
      ((await service.update('x', 1, item).catch((error) => error)) as DeliveryPlanApiError).status,
    ).toBe(401);
    expect(calls).toHaveLength(2);
  });
});
