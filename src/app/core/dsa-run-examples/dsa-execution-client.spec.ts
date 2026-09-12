import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import { DsaExecutionClient, EXECUTION_FETCH } from './dsa-execution-client';

const owner = '00000000-0000-4000-8000-000000000001';
const job = {
  schemaVersion: 'execution/v1',
  id: 'job-1',
  status: 'passed',
  problemId: 'algorithmic-two-sum',
  language: 'python',
  sourceSha256: 'a'.repeat(64),
  contractVersion: 'two-sum/v1',
  fixtureVersion: 'visible/v1',
  results: ['standard', 'duplicate', 'negative'].map((fixtureId) => ({
    fixtureId,
    status: 'passed',
    actual: [3, 2],
  })),
};
const capability = {
  schemaVersion: 'execution/v1',
  enabled: true,
  problems: [
    {
      problemId: 'algorithmic-two-sum',
      languages: ['python'],
      contractVersion: 'two-sum/v1',
      fixtureVersion: 'visible/v1',
    },
  ],
  limits: { sourceBytes: 65536 },
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), { status });
describe('DsaExecutionClient boundary', () => {
  const account = {
    account: signal<any>({ accountId: owner, authorPreview: true }),
    sessionExpired: signal(false),
    apiPath: (path: string) => '/bff/api/v1' + path,
  };
  let transport: ReturnType<typeof vi.fn>;
  let client: DsaExecutionClient;
  beforeEach(() => {
    account.account.set({ accountId: owner, authorPreview: true });
    account.sessionExpired.set(false);
    transport = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: StudyPlanAccount, useValue: account },
        { provide: EXECUTION_FETCH, useValue: transport },
      ],
    });
    client = TestBed.inject(DsaExecutionClient);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('sends source only in explicit POST with CSRF, owned identity, and idempotency key', async () => {
    transport.mockResolvedValueOnce(response(capability));
    await client.capabilities(owner);
    expect(transport.mock.calls[0][1].body).toBeUndefined();
    transport
      .mockResolvedValueOnce(response({ headerName: 'X-CSRF-TOKEN', token: 'synthetic' }))
      .mockResolvedValueOnce(response(job));
    await client.start(
      owner,
      {
        problemId: 'algorithmic-two-sum',
        language: 'python',
        source: 'return [3, 2]',
        contractVersion: 'two-sum/v1',
        fixtureVersion: 'visible/v1',
      },
      'synthetic-request-id',
    );
    const [url, request] = transport.mock.calls[2];
    expect(url).toBe('/bff/api/v1/executions/jobs');
    expect(request.headers).toMatchObject({
      'X-CSRF-TOKEN': 'synthetic',
      'X-LookAhead-Account': owner,
      'Idempotency-Key': 'synthetic-request-id',
    });
    expect(request.credentials).toBe('same-origin');
  });
  it('rejects non-author, changed account and oversized UTF-8 source before sending', async () => {
    account.account.set({ accountId: owner, authorPreview: false });
    await expect(client.capabilities(owner)).rejects.toThrow('account changed');
    account.account.set({ accountId: 'other', authorPreview: true });
    await expect(client.capabilities(owner)).rejects.toThrow('account changed');
    account.account.set({ accountId: owner, authorPreview: true });
    await expect(
      client.start(
        owner,
        {
          problemId: 'algorithmic-two-sum',
          language: 'python',
          source: '😀'.repeat(17000),
          contractVersion: 'two-sum/v1',
          fixtureVersion: 'visible/v1',
        },
        'id',
      ),
    ).rejects.toThrow('too large');
    expect(transport).not.toHaveBeenCalled();
  });
  it('drops a response if account identity changes while waiting', async () => {
    transport.mockImplementation(async () => {
      account.account.set({ accountId: 'other', authorPreview: true });
      return response(capability);
    });
    await expect(client.capabilities(owner)).rejects.toThrow('account changed');
  });
  it('rejects unsafe job IDs and invalid/massive responses', async () => {
    await expect(client.status(owner, '../other')).rejects.toThrow('invalid response');
    expect(transport).not.toHaveBeenCalled();
    transport.mockResolvedValueOnce(response({ ...job, status: 'unknown' }));
    await expect(client.status(owner, 'job-1')).rejects.toThrow('invalid response');
    transport.mockResolvedValueOnce(response({ ...job, diagnostics: 'x'.repeat(65537) }));
    await expect(client.status(owner, 'job-1')).rejects.toThrow('invalid response');
    transport.mockResolvedValueOnce(response({ padding: 'x'.repeat(524289) }));
    await expect(client.capabilities(owner)).rejects.toThrow('invalid response');
  });
  it('rejects null capability entries and incomplete or contradictory passes', async () => {
    transport.mockResolvedValueOnce(response({ ...capability, problems: [null] }));
    await expect(client.capabilities(owner)).rejects.toThrow('invalid response');
    for (const results of [
      [],
      job.results.slice(0, 1),
      [
        { fixtureId: 'standard', status: 'passed', actual: [2, 3] },
        { fixtureId: 'duplicate', status: 'failed', actual: [] },
        { fixtureId: 'negative', status: 'passed', actual: [0, 2] },
      ],
    ]) {
      transport.mockResolvedValueOnce(response({ ...job, results }));
      await expect(client.status(owner, 'job-1')).rejects.toThrow('invalid response');
    }
  });
  it('never retries uncertain submissions and returns a bounded timeout', async () => {
    vi.useFakeTimers();
    transport.mockResolvedValueOnce(response({ headerName: 'X-CSRF-TOKEN', token: 'test' }));
    transport.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          ),
        ),
    );
    const pending = client.start(
      owner,
      {
        problemId: 'algorithmic-two-sum',
        language: 'python',
        source: 'pass',
        contractVersion: 'two-sum/v1',
        fixtureVersion: 'visible/v1',
      },
      'id',
    );
    const assertion = expect(pending).rejects.toThrow('may still run');
    await vi.advanceTimersByTimeAsync(10001);
    await assertion;
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
