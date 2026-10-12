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

export interface PlatformReviewItem {
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
  createdAt: string;
  updatedAt: string;
}

/** One row of the day-grouped list; details and images load when the row is opened. */
export interface PlatformReviewSummary {
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
