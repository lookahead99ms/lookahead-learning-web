import { InjectionToken } from '@angular/core';

/** DLV-927: reviewer feedback on the whole platform, collected before public release. */
export const reviewCategories = [
  { id: 'problem', label: 'Problem' },
  { id: 'change', label: 'Change request' },
  { id: 'idea', label: 'Idea' },
  { id: 'content', label: 'Content correction' },
] as const;
export type ReviewCategory = (typeof reviewCategories)[number]['id'];

export const reviewPriorities = [
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
] as const;
export type ReviewPriority = (typeof reviewPriorities)[number]['id'];

/** Set only by the owner; a reviewer sees the status of their own items. */
export const reviewStatuses = [
  { id: 'new', label: 'New' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'planned', label: 'Planned' },
  { id: 'done', label: 'Done' },
  { id: 'declined', label: 'Declined' },
] as const;
export type ReviewStatus = (typeof reviewStatuses)[number]['id'];

/** Page names from the Pages & screen names inventory, so reports use shared names. */
export const reviewedPages = [
  'Home',
  'Learn Catalog',
  'Grow Catalog',
  'Blaze Catalog',
  'Course Overview',
  'Lesson Reader',
  'Question & Answer Reader',
  'Hands-on DSA Catalog',
  'Coding Problem Workspace',
  'Search',
  'Create Study Plan',
  'Study Desk',
  'Sign In',
  'Sign Up',
  'Manage Account',
  'Support',
  'Admin pages',
  'Whole platform',
  'Other',
] as const;

/**
 * DLV-971 (owner, 2026-11-06): a learner's support request (Report a problem / Share feedback / Ask a question) is
 * stored as an item of kind "request" beside the reviews; absent or null means a review.
 */
export const reviewKinds = ['review', 'request'] as const;
export type ReviewKind = (typeof reviewKinds)[number];

export const requestTypes = [
  { id: 'problem', label: 'Problem' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'question', label: 'Question' },
] as const;
export type RequestType = (typeof requestTypes)[number]['id'];

export function isRequest(item: { kind?: ReviewKind | null }): boolean {
  return item.kind === 'request';
}

/**
 * DLV-971 runtime stores (owner, 2026-11-06): once the owner (or an admin, for a learner request) promotes an item, the
 * Domain adds a ticket to the DEV delivery plan and stamps the record with `ticketId`; `ticketStatus` is that ticket's
 * current workflow status, read when the item is listed. Null until promoted.
 */
export interface TicketLink {
  ticketId?: string | null;
  ticketStatus?: string | null;
}

/** The ticket pill text: "DLV-0042 · In progress"; the id alone when the status is not known; empty when not promoted. */
export function ticketPill(item: TicketLink): string {
  if (!item.ticketId) return '';
  return item.ticketStatus ? `${item.ticketId} · ${item.ticketStatus}` : item.ticketId;
}

/** The row badge of a learner request: "Learner request · Problem"; empty for a review. */
export function kindBadge(item: {
  kind?: ReviewKind | null;
  requestType?: RequestType | null;
}): string {
  if (!isRequest(item)) return '';
  const type = item.requestType ? labelOf(requestTypes, item.requestType) : '';
  return type ? `Learner request · ${type}` : 'Learner request';
}

export const reviewLimits = {
  titleLength: 120,
  detailsLength: 5000,
  noteLength: 2000,
  attachmentsPerItem: 6,
  attachmentBytes: 5 * 1024 * 1024,
  itemBytes: 20 * 1024 * 1024,
  attachmentTypes: ['image/png', 'image/jpeg', 'image/webp'] as readonly string[],
};

export interface ReviewAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

export interface PlatformReviewItem extends TicketLink {
  id: string;
  reviewerId: string;
  reviewerName: string;
  submitterRole?: 'owner' | 'admin' | 'reviewer' | 'tester' | 'user' | 'legacy';
  category: ReviewCategory;
  page: string;
  pageUrl: string;
  title: string;
  details: string;
  priority: ReviewPriority;
  attachments: ReviewAttachment[];
  status: ReviewStatus;
  ownerNote: string;
  /** "request" for a learner's support request; absent or null means a review. */
  kind?: ReviewKind | null;
  requestType?: RequestType | null;
  /** The support receipt reference; present on requests. */
  reference?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One row of the day-grouped list; details and images load when the row is opened. */
export interface PlatformReviewSummary extends TicketLink {
  id: string;
  reviewerId: string;
  reviewerName: string;
  submitterRole?: 'owner' | 'admin' | 'reviewer' | 'tester' | 'user' | 'legacy';
  category: ReviewCategory;
  page: string;
  title: string;
  priority: ReviewPriority;
  status: ReviewStatus;
  attachmentCount: number;
  /** True when the owner has written a note. */
  ownerNote: boolean;
  /** "request" for a learner's support request; absent or null means a review. */
  kind?: ReviewKind | null;
  requestType?: RequestType | null;
  /** The support receipt reference; present on requests. */
  reference?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Newest first. `nextBefore` loads older days; null when there are none. */
export interface PlatformReviewPage {
  items: PlatformReviewSummary[];
  nextBefore: string | null;
}

export interface PlatformReviewDraft {
  category: ReviewCategory;
  page: string;
  pageUrl: string;
  title: string;
  details: string;
  priority: ReviewPriority;
  /** Existing attachments to keep when editing; others are removed. */
  keepAttachmentIds: string[];
  newFiles: File[];
  /** Kept across retries of one save so the server stores it once (Idempotency-Key). */
  requestKey: string;
}

export interface PlatformReviewViewer {
  /** `owner` sees every reviewer's items; a `reviewer` sees only their own. */
  role: 'owner' | 'admin' | 'reviewer' | 'tester' | 'user';
  reviewerId: string;
  displayName: string;
}

/** The Domain's answer to a promote: the new ticket id and the item as stored afterwards. */
export interface PromoteResult {
  ticketId: string;
  item: PlatformReviewItem;
}

export type PlatformReviewFailure =
  'unauthorized' | 'forbidden' | 'not-found' | 'invalid' | 'conflict' | 'unavailable';
export class PlatformReviewError extends Error {
  constructor(
    readonly kind: PlatformReviewFailure,
    message: string = kind,
  ) {
    super(message);
  }
}

/** The storage boundary; DLV-928 serves it from the Domain API through the Gateway. */
export interface PlatformReviewClient {
  viewer(): Promise<PlatformReviewViewer>;
  /** Owner: every item. Reviewer: only their own. Newest first, about 30 days per page. */
  list(before?: string): Promise<PlatformReviewPage>;
  item(id: string): Promise<PlatformReviewItem>;
  save(draft: PlatformReviewDraft, id?: string): Promise<PlatformReviewItem>;
  remove(id: string): Promise<void>;
  triage(id: string, status: ReviewStatus, ownerNote: string): Promise<PlatformReviewItem>;
  /**
   * Adds a ticket to the DEV delivery plan from this item (owner: any item; admin: a learner request). Throws a
   * `conflict` error when the item already has a ticket.
   */
  promote(id: string): Promise<PromoteResult>;
  /** A URL the browser can display; revoke it with `releaseAttachmentUrl`. */
  attachmentUrl(item: PlatformReviewItem, attachment: ReviewAttachment): Promise<string>;
  releaseAttachmentUrl(url: string): void;
}

export const PLATFORM_REVIEW_CLIENT = new InjectionToken<PlatformReviewClient>(
  'Platform review storage',
);

/** Shared validation; the server must apply the same rules. Returns a reader-facing message. */
export function draftProblem(
  draft: PlatformReviewDraft,
  keptAttachments: ReviewAttachment[] = [],
): string | null {
  if (!draft.title.trim()) return 'Add a short title.';
  if (draft.title.length > reviewLimits.titleLength)
    return `Keep the title within ${reviewLimits.titleLength} characters.`;
  if (!draft.details.trim()) return 'Describe what you saw and what should change.';
  if (draft.details.length > reviewLimits.detailsLength)
    return `Keep the description within ${reviewLimits.detailsLength} characters.`;
  if (draft.pageUrl && !/^\/(?!\/)\S*$/.test(draft.pageUrl))
    return 'The page address must start with / and be on this site, for example /learn/core-java.';
  const files = draft.newFiles;
  if (keptAttachments.length + files.length > reviewLimits.attachmentsPerItem)
    return `Attach at most ${reviewLimits.attachmentsPerItem} images to one item.`;
  if (files.some((file) => !reviewLimits.attachmentTypes.includes(file.type)))
    return 'Attach PNG, JPEG or WebP images only.';
  if (files.some((file) => file.size > reviewLimits.attachmentBytes))
    return 'Each image must be 5 MB or smaller.';
  const total =
    keptAttachments.reduce((sum, file) => sum + file.size, 0) +
    files.reduce((sum, file) => sum + file.size, 0);
  if (total > reviewLimits.itemBytes) return 'Images on one item must total 20 MB or less.';
  return null;
}

export function labelOf<T extends { id: string; label: string }>(
  options: readonly T[],
  id: string,
): string {
  return options.find((option) => option.id === id)?.label ?? id;
}
