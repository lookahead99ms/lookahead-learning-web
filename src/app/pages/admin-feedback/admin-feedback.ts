import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { AuthorWorkspaceNav } from '../../core/author-workspace-nav/author-workspace-nav';
import { AuthorAdminMenu } from '../../core/author-workspace-nav/author-admin-menu';
import { ScrollLock } from '../../core/scroll-lock/scroll-lock';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import {
  PLATFORM_REVIEW_CLIENT,
  PlatformReviewError,
  PlatformReviewItem,
  PlatformReviewSummary,
  PlatformReviewViewer,
  isRequest,
  requestTypes,
  reviewCategories,
  reviewStatuses,
} from '../admin-reviews/platform-review.model';
import { FeedbackItemView } from './feedback-item';
import { kindLabel, matchesSearch, sortNewest, statusLabel, statusTone, typeLabel, updatedLabel } from './feedback-backlog';

/** The html class that stops the page behind the dialog from scrolling. */
export const DIALOG_OPEN_CLASS = 'feedback-dialog-open';
/** The Type filter: a review category, or a ticket kind under this prefix. */
export const TICKET_TYPE_PREFIX = 'ticket:';

/**
 * DLV-971 (owner, 2026-11-06): Support tickets and feedback, the backlog: one table row per item (key, summary, from,
 * type, page, status, Delivery Plan ticket, last update), newest update first, with the pills All / Support tickets /
 * Feedback / Mine, the search and the filters. A row opens the item in a dialog on top of the list (the page behind it
 * stops scrolling); the ↗ opens the item's own page. The older /admin/reviews address and the former Team Reviews tab
 * of Support both arrive here. A reviewer sees only their own feedback; the owner and admins see everything.
 */
@Component({
  selector: 'app-admin-feedback',
  imports: [PlatformHeader, AuthorWorkspaceNav, AuthorAdminMenu, FormsModule, RouterLink, ScrollLock, FeedbackItemView],
  templateUrl: './admin-feedback.html',
  styleUrl: './admin-feedback.css',
})
export class AdminFeedbackPage implements OnInit, OnDestroy {
  protected readonly accounts = inject(StudyPlanAccount);
  protected readonly client = inject(PLATFORM_REVIEW_CLIENT);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('itemDialog');
  protected readonly statuses = reviewStatuses;
  protected readonly categories = reviewCategories;
  protected readonly requestTypes = requestTypes;
  protected readonly ticketTypePrefix = TICKET_TYPE_PREFIX;
  protected readonly kindLabel = kindLabel;
  protected readonly typeLabel = typeLabel;
  protected readonly statusLabel = statusLabel;
  protected readonly statusTone = statusTone;
  protected readonly isRequest = isRequest;
  protected readonly outline = [{ label: 'Backlog', href: '#feedback-backlog' }] as const;

  protected readonly signedIn = computed(() => !!this.accounts.account() && !this.accounts.sessionExpired());
  protected readonly state = signal<'loading' | 'ready' | 'denied' | 'signed-out' | 'error'>('loading');
  protected readonly viewer = signal<PlatformReviewViewer | null>(null);
  protected readonly items = signal<PlatformReviewSummary[]>([]);
  protected readonly nextBefore = signal<string | null>(null);
  protected readonly loadingOlder = signal(false);
  protected readonly seesAll = computed(() => this.viewer()?.role === 'owner' || this.viewer()?.role === 'admin');

  // Pills, search and filters
  protected readonly view = signal<'all' | 'mine'>('all');
  protected readonly kindFilter = signal<'' | 'ticket' | 'feedback'>('');
  protected readonly search = signal('');
  protected readonly fromFilter = signal('');
  protected readonly statusFilter = signal('');
  protected readonly typeFilter = signal('');
  protected readonly ticketItems = computed(() => this.items().filter(isRequest));
  protected readonly feedbackItems = computed(() => this.items().filter((item) => !isRequest(item)));
  protected readonly ownItems = computed(() => this.items().filter((item) => item.reviewerId === this.viewer()?.reviewerId));
  protected readonly senders = computed(() => {
    const byId = new Map<string, string>();
    for (const item of this.items()) byId.set(item.reviewerId, item.reviewerName);
    return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });
  /** Sorted by last update, newest first, after the pills, the search and the filters. */
  protected readonly rows = computed(() =>
    sortNewest(
      this.items().filter(
        (item) =>
          (this.view() === 'all' || item.reviewerId === this.viewer()?.reviewerId) &&
          (!this.kindFilter() || (this.kindFilter() === 'ticket') === isRequest(item)) &&
          (!this.fromFilter() || item.reviewerId === this.fromFilter()) &&
          (!this.statusFilter() || item.status === this.statusFilter()) &&
          this.matchesType(item) &&
          matchesSearch(item, this.search()),
      ),
    ),
  );
  protected readonly now = signal(new Date());

  // The open item
  protected readonly openId = signal<string | null>(null);
  private lastRow: HTMLElement | null = null;

  ngOnInit(): void {
    void this.load();
  }

  ngOnDestroy(): void {
    this.document.documentElement.classList.remove(DIALOG_OPEN_CLASS);
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const viewer = await this.client.viewer();
      this.viewer.set(viewer);
      if (viewer.role === 'user') {
        this.state.set('denied');
        return;
      }
      const page = await this.client.list();
      this.items.set(page.items);
      this.nextBefore.set(page.nextBefore);
      this.now.set(new Date());
      this.state.set('ready');
      // A ticket's "From review" link on the Delivery Plan opens /admin/feedback#<id>: that item opens in the dialog.
      const requested = this.route.snapshot.fragment;
      if (requested && page.items.some((item) => item.id === requested)) this.open(requested);
    } catch (error) {
      const kind = error instanceof PlatformReviewError ? error.kind : 'unavailable';
      this.state.set(kind === 'forbidden' ? 'denied' : kind === 'unauthorized' ? 'signed-out' : 'error');
    }
  }

  protected async loadOlder(): Promise<void> {
    const before = this.nextBefore();
    if (!before || this.loadingOlder()) return;
    this.loadingOlder.set(true);
    try {
      const page = await this.client.list(before);
      this.items.update((items) => [...items, ...page.items]);
      this.nextBefore.set(page.nextBefore);
    } catch {
      // The button stays; the next click tries again.
    } finally {
      this.loadingOlder.set(false);
    }
  }

  private matchesType(item: PlatformReviewSummary): boolean {
    const filter = this.typeFilter();
    if (!filter) return true;
    if (filter.startsWith(TICKET_TYPE_PREFIX)) return isRequest(item) && item.requestType === filter.slice(TICKET_TYPE_PREFIX.length);
    return !isRequest(item) && item.category === filter;
  }

  protected showView(view: 'all' | 'mine', kind: '' | 'ticket' | 'feedback' = ''): void {
    this.view.set(view);
    this.kindFilter.set(kind);
  }

  protected updated(iso: string): string {
    return updatedLabel(iso, this.now());
  }

  /** Opens the item in the dialog; the row that opened it gets the focus back on close. */
  protected open(id: string, row?: HTMLElement): void {
    this.lastRow = row ?? null;
    this.openId.set(id);
    const dialog = this.dialog()?.nativeElement;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    this.document.documentElement.classList.add(DIALOG_OPEN_CLASS);
  }

  protected close(): void {
    const dialog = this.dialog()?.nativeElement;
    if (dialog?.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
    this.closed();
  }

  /** The dialog's close event: Esc, the ×, a click outside, or close() above. */
  protected closed(): void {
    this.openId.set(null);
    this.document.documentElement.classList.remove(DIALOG_OPEN_CLASS);
    this.lastRow?.focus();
    this.lastRow = null;
  }

  /** A click on the backdrop (the dialog element itself, outside its box) closes it. */
  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) this.close();
  }

  /** The dialog reports a change: the row follows it; a deleted item leaves the list. */
  protected onChanged(item: PlatformReviewItem | null): void {
    if (!item) {
      const id = this.openId();
      this.items.update((items) => items.filter((entry) => entry.id !== id));
      this.close();
      return;
    }
    this.items.update((items) =>
      items.map((summary) =>
        summary.id === item.id
          ? {
              ...summary,
              title: item.title,
              category: item.category,
              page: item.page,
              status: item.status,
              ownerNote: !!item.ownerNote,
              attachmentCount: item.attachments.length,
              ticketId: item.ticketId,
              ticketStatus: item.ticketStatus,
              updatedAt: item.updatedAt,
            }
          : summary,
      ),
    );
  }

  /** A row click opens the item unless the click was the ↗ link. */
  protected onRowClick(event: MouseEvent, id: string, row: HTMLElement): void {
    if ((event.target as HTMLElement).closest('a')) return;
    this.open(id, row);
  }

  /** Arrow keys move between rows, Home and End jump, Enter opens the focused row. */
  protected onRowKey(event: KeyboardEvent, id: string, row: HTMLElement): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.open(id, row);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const rows = [...(row.parentElement?.querySelectorAll<HTMLElement>('tr[tabindex]') ?? [])];
    const index = rows.indexOf(row);
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : event.key === 'ArrowDown' ? Math.min(rows.length - 1, index + 1) : Math.max(0, index - 1);
    rows[next]?.focus();
  }
}
