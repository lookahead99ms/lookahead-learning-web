import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SupportPage } from './support';
import { ACCOUNT_FETCH, StudyPlanAccount } from '../study-plan/study-plan-account';
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const token = () => response({ data: { headerName: 'X-CSRF-TOKEN', token: 'test-token' } });
function setup(transport: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    providers: [
      { provide: ACCOUNT_FETCH, useValue: transport },
      { provide: StudyPlanAccount, useValue: { account: () => ({ accountId: 'synthetic-owner' }), sessionExpired: () => false, apiPath: (path: string) => '/api/v1' + path } },
    ],
  });
  const page = TestBed.runInInjectionContext(() => new SupportPage());
  Object.assign(page, {
    subject: 'A subject',
    message: 'A message',
    replyTo: 'reply@example.test',
  });
  return page;
}
describe('support request recovery', () => {
  it('retries an uncertain submission with the identical payload and key', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(token())
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        response({ data: { reference: 'receipt-1', status: 'accepted' } }, 202),
      );
    const page = setup(transport);
    await page.submit();
    Object.assign(page, { message: 'Changed outside the disabled form' });
    await page.submit();
    const first = transport.mock.calls[1][1],
      retry = transport.mock.calls[3][1];
    expect(retry.body).toBe(first.body);
    expect(retry.headers['Idempotency-Key']).toBe(first.headers['Idempotency-Key']);
    await page.submit();
    expect(transport).toHaveBeenCalledTimes(4);
  });
  it('permits corrected input after the server rejects an unsent request', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(response({ message: 'Invalid image' }, 422))
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        response({ data: { reference: 'receipt-2', status: 'accepted' } }, 202),
      );
    const page = setup(transport);
    await page.submit();
    Object.assign(page, { message: 'Corrected message' });
    await page.submit();
    expect(JSON.parse(transport.mock.calls[3][1].body).message).toBe('Corrected message');
    expect(transport.mock.calls[3][1].headers['Idempotency-Key']).not.toBe(
      transport.mock.calls[1][1].headers['Idempotency-Key'],
    );
  });
  it('does not retry a pending message under a different account', async () => {
    const transport = vi.fn().mockResolvedValueOnce(token()).mockRejectedValueOnce(new Error('Connection lost'));
    const page = setup(transport);
    await page.submit();
    (TestBed.inject(StudyPlanAccount) as any).account = () => ({ accountId: 'another-owner' });
    await page.submit();
    expect(transport).toHaveBeenCalledTimes(2);
    expect((page as any).error()).toContain('account that started');
    expect(transport.mock.calls[1][1].headers['X-LookAhead-Account']).toBe('synthetic-owner');
  });

});
