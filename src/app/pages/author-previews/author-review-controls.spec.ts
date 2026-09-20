import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthorReviewControls } from './author-review-controls';
import {
  AUTHOR_REVIEW_CLIENT,
  AuthorReviewError,
  AuthorReviewSubmission,
} from './author-review-client';
import { AuthorDocument } from '../../core/author-documents-client';
import { StudyPlanAccount } from '../study-plan/study-plan-account';

const packet: AuthorDocument = {
  id: 'study-plan-review',
  title: 'Study Plan review',
  version: 'review/test.1',
  htmlSha256: 'a'.repeat(64),
  sourceSha256: 'b'.repeat(64),
  href: '/bff/author/previews/review/index.html',
  owningTicket: 'DLV-704',
  scope: 'A review',
  decisionDependencies: ['DLV-921'],
  remainingDecisions: [],
  evidence: [],
  sections: [],
  references: [],
};
function receipt(value: AuthorReviewSubmission) {
  return {
    ...value,
    recordId: 'record-1',
    recordedAt: '2026-09-19T12:00:00Z',
    recordedBy: 'Server author',
  };
}
function savedReview() {
  return receipt({
    artifactId: packet.id,
    artifactVersion: packet.version,
    owningTicket: packet.owningTicket,
    sourceSha256: packet.sourceSha256!,
    decision: 'approve',
    comment: 'Earlier decision',
    idempotencyKey: '00000000-0000-4000-8000-000000000002',
    supersedesEventId: null,
  });
}
describe('Trusted author review controls', () => {
  const account = signal<any>({ accountId: 'author', authorPreview: true });
  const sessionExpired = signal(false);
  let record: ReturnType<typeof vi.fn>;
  let load: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    account.set({ accountId: 'author', authorPreview: true });
    sessionExpired.set(false);
    record = vi.fn().mockImplementation(async (value) => receipt(value));
    load = vi.fn().mockResolvedValue({ entries: [], nextCursor: null });
    TestBed.configureTestingModule({
      imports: [AuthorReviewControls],
      providers: [
        { provide: StudyPlanAccount, useValue: { account, sessionExpired } },
        { provide: AUTHOR_REVIEW_CLIENT, useValue: { record, load } },
      ],
    });
  });
  async function create() {
    const fixture = TestBed.createComponent(AuthorReviewControls);
    fixture.componentRef.setInput('artifact', packet);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  function choose(fixture: any, choice: string, comment = '') {
    fixture.nativeElement.querySelector(`input[value="${choice}"]`).click();
    const input = fixture.nativeElement.querySelector('textarea');
    input.value = comment;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }
  async function submit(fixture: any) {
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  function button(fixture: any, label: string): HTMLButtonElement {
    return [...fixture.nativeElement.querySelectorAll('button')].find(
      (item: any) => item.textContent.trim() === label,
    );
  }
  async function settle(fixture: any) {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  it('has no decision selected and makes no write on viewing', async () => {
    const fixture = await create();
    expect(fixture.nativeElement.querySelector('input:checked')).toBeNull();
    expect(record).not.toHaveBeenCalled();
  });
  it.each(['decline', 'need-more'])(
    'requires an explanation for %s and focuses the error',
    async (choice) => {
      const fixture = await create();
      choose(fixture, choice, '   ');
      await submit(fixture);
      expect(record).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
        'Add an explanation',
      );
      expect(document.activeElement).toBe(fixture.nativeElement.querySelector('[role="alert"]'));
    },
  );
  it('records exact artifact/version/hash and displays server attribution only after acknowledgement', async () => {
    const fixture = await create();
    choose(fixture, 'approve', 'Ready for the next review.');
    await submit(fixture);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: packet.id,
        artifactVersion: packet.version,
        owningTicket: packet.owningTicket,
        sourceSha256: packet.sourceSha256,
        decision: 'approve',
        comment: 'Ready for the next review.',
      }),
    );
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
      'Recorded',
    );
    expect(fixture.nativeElement.textContent).toContain('Pending Main reconciliation');
    expect(fixture.nativeElement.textContent).toContain('Server author');
    expect(fixture.nativeElement.querySelector('button[type=submit]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Review a different decision');
  });
  it('preserves an uncertain submission and reuses its exact idempotency key on retry', async () => {
    record.mockRejectedValueOnce(new Error('Timeout'));
    const fixture = await create();
    choose(fixture, 'need-more', 'Need a recovery example.');
    await submit(fixture);
    const first = record.mock.calls[0][0];
    expect(fixture.nativeElement.querySelector('textarea').value).toBe('Need a recovery example.');
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Retry same submission');
    await submit(fixture);
    expect(record.mock.calls[1][0]).toEqual(first);
    expect(fixture.nativeElement.textContent).toContain('Recorded');
  });
  it.each(['artifactId', 'artifactVersion', 'owningTicket', 'sourceSha256'])(
    'does not call a mismatched %s acknowledgement Recorded',
    async (key) => {
      record.mockImplementation(async (value) => ({
        ...receipt(value),
        [key]: 'different',
      }));
      const fixture = await create();
      choose(fixture, 'approve');
      await submit(fixture);
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
        'could not be confirmed',
      );
      expect(fixture.nativeElement.textContent).not.toContain('Pending Main reconciliation');
    },
  );
  it('does not substitute a rendered HTML hash for a missing canonical source hash', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('artifact', { ...packet, sourceSha256: undefined });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    choose(fixture, 'approve');
    await submit(fixture);
    expect(record).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('no verified source binding');
  });
  it('hides controls and discards a late acknowledgement after author access expires', async () => {
    let resolve!: (value: any) => void;
    record.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const fixture = await create();
    choose(fixture, 'approve');
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Saving…');
    sessionExpired.set(true);
    fixture.detectChanges();
    resolve(receipt(record.mock.calls[0][0]));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });
  it('shows an honest disconnected state when no Domain adapter is configured', async () => {
    TestBed.overrideProvider(AUTHOR_REVIEW_CLIENT, { useValue: null });
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('Decision recording is not connected yet');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(record).not.toHaveBeenCalled();
  });
  it('restores the current server decision and requires an explicit replacement action', async () => {
    const previous = savedReview();
    load.mockResolvedValue({ entries: [previous], nextCursor: null });
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('Pending Main reconciliation');
    expect(fixture.nativeElement.querySelector('textarea').value).toBe(previous.comment);
    expect(record).not.toHaveBeenCalled();
    button(fixture, 'Review a different decision').click();
    await settle(fixture);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('input'));
    choose(fixture, 'need-more', 'A newer concern.');
    await submit(fixture);
    expect(record.mock.calls[0][0]).toMatchObject({
      decision: 'need-more',
      comment: 'A newer concern.',
      supersedesEventId: previous.recordId,
    });
  });
  it('blocks recording if history could not be confirmed and supports an explicit reload', async () => {
    load.mockRejectedValueOnce(new AuthorReviewError('unconfirmed'));
    const fixture = await create();
    choose(fixture, 'approve');
    await submit(fixture);
    expect(record).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
    button(fixture, 'Reload review history').click();
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(false);
  });
  it('requires a fresh review of a conflict before preparing a new replacement key', async () => {
    record.mockRejectedValueOnce(new AuthorReviewError('supersession-conflict'));
    const fixture = await create();
    choose(fixture, 'decline', 'Preserve this concern.');
    await submit(fixture);
    const first = record.mock.calls[0][0],
      latest = savedReview();
    load.mockResolvedValue({ entries: [latest], nextCursor: null });
    button(fixture, 'Reload review history').click();
    await settle(fixture);
    await submit(fixture);
    expect(record).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('textarea').value).toBe('Preserve this concern.');
    button(fixture, 'Prepare replacement from latest review').click();
    await settle(fixture);
    await submit(fixture);
    expect(record).toHaveBeenCalledTimes(2);
    expect(record.mock.calls[1][0]).toMatchObject({
      comment: first.comment,
      supersedesEventId: latest.recordId,
    });
    expect(record.mock.calls[1][0].idempotencyKey).not.toBe(first.idempotencyKey);
  });
  it('loads earlier actor-scoped history without changing the newest replacement target', async () => {
    const latest = savedReview();
    load
      .mockResolvedValueOnce({ entries: [latest], nextCursor: 'next-page' })
      .mockResolvedValueOnce({
        entries: [{ ...latest, recordId: 'older', comment: 'Older review' }],
        nextCursor: null,
      });
    const fixture = await create();
    button(fixture, 'Load earlier reviews').click();
    await settle(fixture);
    expect(load.mock.calls[1][1]).toBe('next-page');
    expect(fixture.nativeElement.querySelectorAll('.review-history li')).toHaveLength(2);
    button(fixture, 'Review a different decision').click();
    await settle(fixture);
    choose(fixture, 'approve');
    await submit(fixture);
    expect(record.mock.calls[0][0].supersedesEventId).toBe(latest.recordId);
  });
});
