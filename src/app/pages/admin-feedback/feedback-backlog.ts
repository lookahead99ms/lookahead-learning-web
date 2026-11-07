import {
  PlatformReviewItem,
  PlatformReviewSummary,
  ReviewStatus,
  SweepJob,
  SweepRunResult,
  isRequest,
  labelOf,
  requestTypes,
  reviewCategories,
} from '../admin-reviews/platform-review.model';

/**
 * DLV-971 (owner, 2026-11-06): the Support tickets and feedback backlog, a Jira-style table. These helpers are pure so
 * the table, the dialog and the item page say the same words.
 */
export type BacklogItem = PlatformReviewSummary | PlatformReviewItem;

/** "Ticket" for a learner support ticket, "Feedback" for a staff item. */
export function kindLabel(item: { kind?: string | null }): 'Ticket' | 'Feedback' {
  return isRequest(item as never) ? 'Ticket' : 'Feedback';
}

/** The Type column: a ticket's kind as the Support page names it, a feedback item's category. */
export function typeLabel(item: BacklogItem): string {
  if (isRequest(item)) {
    switch (item.requestType) {
      case 'problem':
        return 'Report a problem';
      case 'question':
        return 'Ask a question';
      case 'feedback':
        return 'Share an idea';
      default:
        return item.requestType ? labelOf(requestTypes, item.requestType) : 'Support ticket';
    }
  }
  return labelOf(reviewCategories, item.category);
}

/** The colour of the status pill: New accent, Planned blue, Done green, Accepted neutral, Closed and Declined muted. */
export function statusTone(status: ReviewStatus | string): 'new' | 'planned' | 'done' | 'neutral' | 'muted' {
  switch (status) {
    case 'new':
      return 'new';
    case 'planned':
      return 'planned';
    case 'done':
      return 'done';
    case 'accepted':
      return 'neutral';
    default:
      return 'muted';
  }
}

/** A closed support ticket says Closed; feedback keeps Declined. */
export function statusLabel(item: { status: string; kind?: string | null }): string {
  if (item.status === 'declined' && isRequest(item as never)) return 'Closed';
  const known = { new: 'New', accepted: 'Accepted', planned: 'Planned', done: 'Done', declined: 'Declined' } as Record<string, string>;
  return known[item.status] ?? item.status;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Today 09:12", "Yesterday", "4 Nov" (with the year when it is not this year). */
export function updatedLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (sameDay(date, now))
    return `Today ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** "today 09:12" / "yesterday 18:40" / "4 Nov 2026, 09:12" for the item header and the details list. */
export function momentLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (sameDay(date, now)) return `today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return `yesterday ${time}`;
  return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${time}`;
}

/** Newest update first; a tie keeps the newer creation first, then the id. */
export function sortNewest<T extends BacklogItem>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      b.id.localeCompare(a.id),
  );
}

/** Search by key (REV-000001, SUP-000014, a ticket id) or by words in the summary, sender, type or page. */
export function matchesSearch(item: BacklogItem, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [item.id, item.ticketId ?? '', item.title, item.reviewerName, typeLabel(item), item.page, item.reference ?? '']
    .join(' ')
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** DLV-971 (owner, 2026-11-06): the owner's Jobs buttons on Support tickets and feedback, in order. */
export const SWEEP_JOBS: readonly { job: SweepJob; label: string }[] = [
  { job: 'support-requests', label: 'Close stale tickets' },
  { job: 'delivery-inbox', label: 'Sync plan inbox' },
  { job: 'admissions', label: 'Clean up admissions' },
  { job: 'all', label: 'Run all' },
];

export function jobLabel(job: SweepJob): string {
  return SWEEP_JOBS.find((entry) => entry.job === job)?.label ?? job;
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/**
 * The line under the title after a job ran: "Close stale tickets ran at 19:52: 0 tickets closed", "Sync plan inbox ran
 * at 19:53: plan version 3" (or "inbox: no inbox file"), "Clean up admissions ran at 19:54: 0 removed", and for all
 * three "All jobs ran at 19:55: 2 tickets closed, inbox merged (plan version 12), 1 admission removed" (a local Domain
 * has no admission cleanup: that part is left out).
 */
export function jobsRanLine(result: SweepRunResult): string {
  const time = new Date(result.ranAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const inbox = result.inboxMerged ? `plan version ${result.inboxResult}` : `inbox: ${result.inboxResult}`;
  switch (result.job) {
    case 'support-requests':
      return `Close stale tickets ran at ${time}: ${count(result.supportRequestsClosed ?? 0, 'ticket')} closed`;
    case 'delivery-inbox':
      return `Sync plan inbox ran at ${time}: ${inbox}`;
    case 'admissions':
      return `Clean up admissions ran at ${time}: ${result.admissionsRemoved ?? 0} removed`;
    default: {
      const parts = [`${count(result.supportRequestsClosed ?? 0, 'ticket')} closed`, result.inboxMerged ? `inbox merged (${inbox})` : inbox];
      if (result.admissionsRemoved !== null) parts.push(`${count(result.admissionsRemoved, 'admission')} removed`);
      return `All jobs ran at ${time}: ${parts.join(', ')}`;
    }
  }
}
