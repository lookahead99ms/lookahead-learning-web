import { PlatformReviewSummary, SweepRunResult } from '../admin-reviews/platform-review.model';
import { SWEEP_JOBS, jobLabel, jobsRanLine, kindLabel, matchesSearch, momentLabel, sortNewest, statusLabel, statusTone, typeLabel, updatedLabel } from './feedback-backlog';

const summary = (over: Partial<PlatformReviewSummary>): PlatformReviewSummary => ({
  id: 'REV-000001',
  reviewerId: 'r1',
  reviewerName: 'Priya Raman',
  category: 'problem',
  page: 'People and access',
  title: 'Reset all button stays greyed after a reset',
  priority: 'medium',
  status: 'new',
  attachmentCount: 0,
  ownerNote: false,
  kind: 'review',
  requestType: null,
  reference: null,
  createdAt: '2026-11-04T09:00:00.000Z',
  updatedAt: '2026-11-04T09:00:00.000Z',
  ...over,
});

describe('Support tickets and feedback backlog helpers (DLV-971)', () => {
  it('names the kind, the type and the status the way the Support page does', () => {
    expect(kindLabel(summary({}))).toBe('Feedback');
    expect(kindLabel(summary({ kind: 'request' }))).toBe('Ticket');
    expect(typeLabel(summary({ category: 'change' }))).toBe('Change request');
    expect(typeLabel(summary({ category: 'content' }))).toBe('Content correction');
    expect(typeLabel(summary({ kind: 'request', requestType: 'problem' }))).toBe('Report a problem');
    expect(typeLabel(summary({ kind: 'request', requestType: 'question' }))).toBe('Ask a question');
    expect(typeLabel(summary({ kind: 'request', requestType: 'feedback' }))).toBe('Share an idea');
    expect(typeLabel(summary({ kind: 'request', requestType: null }))).toBe('Support ticket');
    expect(statusLabel(summary({ status: 'declined' }))).toBe('Declined');
    expect(statusLabel(summary({ status: 'declined', kind: 'request' }))).toBe('Closed');
    expect(statusLabel(summary({ status: 'planned' }))).toBe('Planned');
    expect(statusTone('new')).toBe('new');
    expect(statusTone('planned')).toBe('planned');
    expect(statusTone('done')).toBe('done');
    expect(statusTone('accepted')).toBe('neutral');
    expect(statusTone('declined')).toBe('muted');
  });

  it('writes the last update as Today with the time, Yesterday, or the day and month', () => {
    const now = new Date(2026, 10, 6, 15, 30);
    const at = (y: number, m: number, d: number, h = 9, min = 12) => new Date(y, m, d, h, min).toISOString();
    expect(updatedLabel(at(2026, 10, 6), now)).toBe('Today 09:12');
    expect(updatedLabel(at(2026, 10, 5), now)).toBe('Yesterday');
    expect(updatedLabel(at(2026, 10, 4), now)).toBe('4 Nov');
    expect(updatedLabel(at(2025, 10, 4), now)).toBe('4 Nov 2025');
    expect(updatedLabel('not a date', now)).toBe('');
    expect(momentLabel(at(2026, 10, 6), now)).toBe('today 09:12');
    expect(momentLabel(at(2026, 10, 5, 18, 40), now)).toBe('yesterday 18:40');
    expect(momentLabel(at(2026, 10, 4), now)).toBe('4 Nov 2026, 09:12');
    expect(momentLabel('x', now)).toBe('');
  });

  it('sorts by last update, newest first, then by creation, then by id', () => {
    const rows = [
      summary({ id: 'REV-000001', updatedAt: '2026-11-04T09:00:00.000Z', createdAt: '2026-11-01T00:00:00.000Z' }),
      summary({ id: 'SUP-000003', updatedAt: '2026-11-06T09:12:00.000Z', createdAt: '2026-11-06T09:12:00.000Z' }),
      summary({ id: 'REV-000002', updatedAt: '2026-11-04T09:00:00.000Z', createdAt: '2026-11-02T00:00:00.000Z' }),
      summary({ id: 'REV-000009', updatedAt: '2026-11-04T09:00:00.000Z', createdAt: '2026-11-02T00:00:00.000Z' }),
    ];
    expect(sortNewest(rows).map((row) => row.id)).toEqual(['SUP-000003', 'REV-000009', 'REV-000002', 'REV-000001']);
    expect(rows[0].id).toBe('REV-000001'); // the input is not reordered
  });

  it('searches by key, ticket id or words across the summary, sender, type and page', () => {
    const row = summary({ ticketId: 'DLV-1042', kind: 'request', requestType: 'question', reference: 'SUP-000014', id: 'SUP-000014', title: 'How do I change my reply email?', page: 'Support' });
    expect(matchesSearch(row, '')).toBe(true);
    expect(matchesSearch(row, '  ')).toBe(true);
    expect(matchesSearch(row, 'sup-000014')).toBe(true);
    expect(matchesSearch(row, 'DLV-1042')).toBe(true);
    expect(matchesSearch(row, 'reply email')).toBe(true);
    expect(matchesSearch(row, 'priya question')).toBe(true);
    expect(matchesSearch(row, 'support')).toBe(true);
    expect(matchesSearch(row, 'lesson')).toBe(false);
  });
});

describe('jobsRanLine (DLV-971)', () => {
  const ranAt = '2026-11-06T18:30:00Z';
  const time = new Date(ranAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const ran = (over: Partial<SweepRunResult>): SweepRunResult => ({ job: 'all', ranAt, supportRequestsClosed: null, inboxMerged: null, inboxResult: null, admissionsRemoved: null, ...over });

  it('names each job, the time and its count, singular or plural', () => {
    expect(jobsRanLine(ran({ job: 'support-requests', supportRequestsClosed: 0 }))).toBe(`Close stale tickets ran at ${time}: 0 tickets closed`);
    expect(jobsRanLine(ran({ job: 'support-requests', supportRequestsClosed: 1 }))).toBe(`Close stale tickets ran at ${time}: 1 ticket closed`);
    expect(jobsRanLine(ran({ job: 'delivery-inbox', inboxMerged: true, inboxResult: '3' }))).toBe(`Sync plan inbox ran at ${time}: plan version 3`);
    expect(jobsRanLine(ran({ job: 'delivery-inbox', inboxMerged: false, inboxResult: 'no inbox file' }))).toBe(`Sync plan inbox ran at ${time}: inbox: no inbox file`);
    expect(jobsRanLine(ran({ job: 'admissions', admissionsRemoved: 0 }))).toBe(`Clean up admissions ran at ${time}: 0 removed`);
    expect(SWEEP_JOBS.map((entry) => entry.label)).toEqual(['Close stale tickets', 'Sync plan inbox', 'Clean up admissions', 'Run all']);
    expect(jobLabel('admissions')).toBe('Clean up admissions');
  });

  it('sums all three for Run all and leaves admissions out on a local Domain', () => {
    expect(jobsRanLine(ran({ supportRequestsClosed: 2, inboxMerged: true, inboxResult: '12', admissionsRemoved: 1 }))).toBe(
      `All jobs ran at ${time}: 2 tickets closed, inbox merged (plan version 12), 1 admission removed`,
    );
    expect(jobsRanLine(ran({ supportRequestsClosed: 0, inboxMerged: false, inboxResult: 'did not complete (IllegalStateException)', admissionsRemoved: null }))).toBe(
      `All jobs ran at ${time}: 0 tickets closed, inbox: did not complete (IllegalStateException)`,
    );
  });
});
