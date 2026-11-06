import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SupportRequestForm } from './support-request-form';
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
  const page = TestBed.runInInjectionContext(() => new SupportRequestForm());
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

describe('support request receipt (DLV-971)', () => {
  const recorded = 'Request recorded. The owner and admins see it under Team Reviews; we also reply by email. ';
  it('says the request is under Team Reviews after an accepted send', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(response({ data: { reference: 'SUP-1', status: 'accepted' } }, 202));
    const page = setup(transport);
    await page.submit();
    expect((page as any).receipt()).toBe(
      'The mail server accepted your message. ' + recorded + 'Reference: SUP-1',
    );
    expect((page as any).error()).toBe('');
  });
  it('says the request is under Team Reviews with no email when the Domain answers recorded (mail not configured)', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(response({ data: { reference: 'SUP-3', status: 'recorded' } }, 202));
    const page = setup(transport);
    await page.submit();
    expect((page as any).receipt()).toBe(
      'Request recorded. The owner and admins see it under Team Reviews. Email replies are not switched on yet, so there is no email for this one. Reference: SUP-3',
    );
  });
  it('says the request is under Team Reviews even when mail delivery is unconfirmed', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(response({ data: { reference: 'SUP-2', status: 'unconfirmed' } }, 202));
    const page = setup(transport);
    await page.submit();
    expect((page as any).receipt()).toBe(
      'Delivery could not be confirmed. This request will not be sent again automatically. ' +
        recorded +
        'Reference: SUP-2',
    );
  });
});

describe('support request form layout (DLV-971)', () => {
  function render() {
    TestBed.configureTestingModule({
      imports: [SupportRequestForm],
      providers: [
        provideRouter([]),
        { provide: ACCOUNT_FETCH, useValue: vi.fn() },
        {
          provide: StudyPlanAccount,
          useValue: {
            account: () => ({ accountId: 'synthetic-owner' }),
            sessionExpired: () => false,
            apiPath: (path: string) => '/api/v1' + path,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(SupportRequestForm);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }
  const png = (name: string, size = 10) =>
    Object.defineProperty(new File(['x'], name, { type: 'image/png' }), 'size', { value: size });
  const choose = (input: HTMLInputElement, files: File[]) => {
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change'));
  };

  it('opens with the kind picker, then the fields, then one slim screenshots row', () => {
    const { root } = render();
    const fields = root.querySelector('.request-fields')!;
    const picker = fields.querySelector('.type-picker')!;
    expect(picker.previousElementSibling?.tagName).toBe('LEGEND'); // the hidden group name alone
    expect(picker.compareDocumentPosition(fields.querySelector('.field-row')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect([...fields.querySelectorAll('.type-option strong')].map((o) => o.textContent?.trim())).toEqual([
      'Report a problem',
      'Share feedback',
      'Ask a question',
    ]);
    const attach = root.querySelector('.attach')!;
    expect(attach.querySelector('.file-picker')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('📎 Add screenshots');
    expect(attach.querySelector('.hint')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Up to three images, 2 MB each.');
    const input = attach.querySelector('input[type="file"]')!;
    expect(input.getAttribute('accept')).toBe('image/png,image/jpeg');
    expect(input.hasAttribute('multiple')).toBe(true);
  });

  it('keeps the attachment limits: three images, 2 MB each, PNG or JPEG', () => {
    const createUrl = vi.fn((file: File) => 'blob:' + file.name);
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revoke });
    const { fixture, root } = render();
    const input = root.querySelector<HTMLInputElement>('.attach input[type="file"]')!;
    choose(input, [png('too-big.png', 3 * 1024 * 1024)]);
    fixture.detectChanges();
    expect(root.querySelector('.banner-error')?.textContent).toContain('up to three PNG or JPEG images');
    expect(root.querySelectorAll('figure')).toHaveLength(0);
    choose(input, [png('one.png'), png('two.png'), png('three.png')]);
    fixture.detectChanges();
    expect(root.querySelector('.banner-error')).toBeNull();
    expect([...root.querySelectorAll('figcaption')].map((c) => c.textContent?.trim())).toEqual([
      'one.png',
      'two.png',
      'three.png',
    ]);
    choose(input, [png('four.png')]);
    fixture.detectChanges();
    expect(root.querySelector('.banner-error')).not.toBeNull();
    expect(root.querySelectorAll('figure')).toHaveLength(3);
    root.querySelector<HTMLButtonElement>('figure button')!.click();
    fixture.detectChanges();
    expect(revoke).toHaveBeenCalledWith('blob:one.png');
    expect(root.querySelectorAll('figure')).toHaveLength(2);
    fixture.destroy();
    expect(revoke).toHaveBeenCalledTimes(3);
  });
});
