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

describe('support ticket on the one-card Support page (owner, 2026-11-06)', () => {
  function mount(kind: 'problem' | 'question' | 'feedback' | null, compact: boolean, transport = vi.fn()) {
    TestBed.configureTestingModule({
      imports: [SupportRequestForm],
      providers: [
        provideRouter([]),
        { provide: ACCOUNT_FETCH, useValue: transport },
        { provide: StudyPlanAccount, useValue: { account: () => ({ accountId: 'synthetic-owner', username: 'me@example.test' }), sessionExpired: () => false, apiPath: (path: string) => '/api/v1' + path } },
      ],
    });
    const fixture = TestBed.createComponent(SupportRequestForm);
    fixture.componentRef.setInput('kind', kind);
    fixture.componentRef.setInput('compact', compact);
    fixture.detectChanges();
    return fixture;
  }
  const text = (node: Node | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();

  it('prefills the reply email from an email sign-in name, from a learner test account as name@lookahead.dev, and leaves it empty otherwise', () => {
    expect(SupportRequestForm.replyEmailFor('me@example.test')).toBe('me@example.test');
    expect(SupportRequestForm.replyEmailFor('learner05')).toBe('learner05@lookahead.dev');
    expect(SupportRequestForm.replyEmailFor('learner27')).toBe('learner27@lookahead.dev');
    expect(SupportRequestForm.replyEmailFor('learner5')).toBe('');
    expect(SupportRequestForm.replyEmailFor('owner')).toBe('');
    expect(SupportRequestForm.replyEmailFor('')).toBe('');
  });

  it('takes the kind from the page, hides its own picker and shows the shared fields with the email prefilled', async () => {
    const fixture = mount('question', true);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.type-picker')).toBeNull();
    expect((fixture.componentInstance as any).type).toBe('question');
    expect([...root.querySelectorAll('label:not(.file-picker)')].map((label) => text(label.childNodes[0]))).toEqual([
      'Page',
      'Page address',
      'Title',
      'What you saw and what should change',
      'Reply email',
    ]);
    expect(text(root.querySelector('.file-picker'))).toBe('📎 Add screenshots');
    expect([...root.querySelectorAll('.field-row > label')].map((label) => text(label.childNodes[0]))).toEqual(['Page', 'Page address']);
    expect((root.querySelector('select[name="page"]') as HTMLSelectElement).value).toBe('Whole platform');
    expect((root.querySelector('input[name="email"]') as HTMLInputElement).value).toBe('me@example.test');
    expect(root.querySelector('textarea[name="message"]')?.getAttribute('maxlength')).toBe('4000');
    expect(text(root.querySelector('.hint'))).toBe('0 of 4000 characters');
    expect(root.textContent).toContain('Prefilled from your account; shown for problems, questions and ideas.');
    expect(root.textContent).toContain('Up to three images, 2 MB each.');
    expect([...root.querySelectorAll('.form-actions button')].map((button) => text(button))).toEqual(['✉️ Send', 'Clear']);
    expect(root.textContent).not.toMatch(/\breview/i);
  });

  it('keeps its own picker, Subject and Message, and the Send ticket button when used on its own', () => {
    const root = mount(null, false).nativeElement as HTMLElement;
    expect(root.querySelector('.type-picker')).not.toBeNull();
    expect(root.querySelector('select[name="page"]')).toBeNull();
    expect(root.querySelector('textarea[name="message"]')?.getAttribute('maxlength')).toBe('5000');
    expect([...root.querySelectorAll('.form-actions button')].map((button) => text(button))).toEqual(['✉️ Send ticket']);
  });

  it('sends the page and its address inside the message only when they were given, and Clear empties the fields but keeps the kind and the email', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(response({ data: { reference: 'SUP-7', status: 'recorded' } }, 202));
    const fixture = mount('problem', true, transport);
    const page = fixture.componentInstance as any;
    Object.assign(page, { subject: 'Lesson 4 locked', message: 'It says Planned.', page: 'Lesson Reader', pageUrl: '/learn/core-java/4' });
    await page.submit();
    const body = JSON.parse(transport.mock.calls[1][1].body);
    expect(body).toEqual(expect.objectContaining({ type: 'problem', subject: 'Lesson 4 locked', replyTo: 'me@example.test' }));
    expect(body.message).toBe('It says Planned.\n\nPage: Lesson Reader\nPage address: /learn/core-java/4');
    TestBed.resetTestingModule();
    const plain = mount('feedback', true).componentInstance as any;
    Object.assign(plain, { subject: 'Idea', message: 'Rename a week.' });
    expect(plain.messageBody()).toBe('Rename a week.');
    plain.pageUrl = ' /study-plan ';
    expect(plain.messageBody()).toBe('Rename a week.\n\nPage address: /study-plan');
    plain.clear();
    expect(plain.subject).toBe('');
    expect(plain.message).toBe('');
    expect(plain.pageUrl).toBe('');
    expect(plain.page).toBe('Whole platform');
    expect(plain.type).toBe('feedback');
    expect(plain.replyTo).toBe('me@example.test');
  });
});

describe('support request receipt (DLV-971)', () => {
  const recorded = 'Ticket recorded. The owner and admins see it under Support tickets and feedback; we also reply by email. ';
  it('says the request is under Support tickets and feedback after an accepted send', async () => {
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
  it('says the request is under Support tickets and feedback with no email when the Domain answers recorded (mail not configured)', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(response({ data: { reference: 'SUP-3', status: 'recorded' } }, 202));
    const page = setup(transport);
    await page.submit();
    expect((page as any).receipt()).toBe(
      'Ticket recorded. The owner and admins see it under Support tickets and feedback. Email replies are not switched on yet, so there is no email for this one. Reference: SUP-3',
    );
  });
  it('says the request is under Support tickets and feedback even when mail delivery is unconfirmed', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(response({ data: { reference: 'SUP-2', status: 'unconfirmed' } }, 202));
    const page = setup(transport);
    await page.submit();
    expect((page as any).receipt()).toBe(
      'Delivery could not be confirmed. This ticket will not be sent again automatically. ' +
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
