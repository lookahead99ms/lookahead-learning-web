import { DevSession } from '../../core/dev-session-notice/dev-session';
import { environment } from '../../../environments/environment';
import { Component, computed, effect, ElementRef, inject, input, OnDestroy, OnInit, output, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import {
  PLATFORM_REVIEW_CLIENT,
  PlatformReviewDraft,
  PlatformReviewError,
  PlatformReviewItem,
  PlatformReviewSummary,
  PlatformReviewViewer,
  ReviewAttachment,
  ReviewCategory,
  ReviewPriority,
  ReviewStatus,
  draftProblem,
  isRequest,
  kindBadge,
  labelOf,
  requestTypes,
  reviewCategories,
  reviewLimits,
  reviewStatuses,
  reviewedPages,
  ticketPill,
} from './platform-review.model';
import { ReviewEditIntent } from './review-edit-intent';
import { ScrollLock } from '../../core/scroll-lock/scroll-lock';
import { ReportTips } from '../support/report-tips';

/** A Type filter value for learner requests: "request:problem", "request:feedback" or "request:question". */
const requestFilterPrefix = 'request:';

interface PendingFile {
  file: File;
  url: string;
}

interface DayGroup {
  key: string;
  label: string;
  items: PlatformReviewSummary[];
}

/**
 * DLV-927/928: each reviewer records their own items; the owner and admins see everyone's, the owner alone triages.
 * Shown under the Give feedback tab of /support and on the Support tickets and feedback admin page (/admin/feedback),
 * which own the page header and layout. Two nouns on the page (owner, 2026-11-06): a ticket (kind "request", a
 * learner needs a reply) and feedback (kind "review", staff say what should change); the ids and the API are unchanged.
 * Items are grouped by the day they were sent, newest first. A row shows the summary; opening it
 * loads the description, the owner's note and the images.
 */
@Component({
  selector: 'app-admin-reviews',
  imports: [FormsModule, NgTemplateOutlet, ScrollLock, ReportTips, RouterLink],
  templateUrl: './admin-reviews.html',
  styleUrl: './admin-reviews.css',
})
export class AdminReviewsPage implements OnInit, OnDestroy {
  protected readonly accounts = inject(StudyPlanAccount);
  /**
   * DLV-971 (owner, 2026-11-06): "submit" is the form under Give feedback on /support; "submitted" is what was
   * submitted and where each item stands on Support tickets and feedback (the owner's overview and every reviewer's
   * items, a reviewer's own). "all" is the whole panel, as before.
   */
  readonly section = input<'submit' | 'submitted' | 'all'>('all');
  /**
   * DLV-971 (owner, 2026-11-06): on Support the kind cards live in the page, so the form takes its category from here
   * and shows no type picker; the page also owns the heading and the tips (compact), and the button says Send.
   */
  readonly category$ = input<ReviewCategory | null>(null, { alias: 'category' });
  readonly compact = input(false);
  /** The category of the item loaded for editing (Edit from the admin page), null when the form is cleared. */
  readonly editing = output<ReviewCategory | null>();
  protected readonly client = inject(PLATFORM_REVIEW_CLIENT);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly editIntent = inject(ReviewEditIntent);
  private readonly devSession = inject(DevSession);
  /** Owner decision 2026-11-07: promoting writes the DEV plan, so the button exists on DEV and local only. */
  protected readonly devOrLocal = computed(() => !environment.production || this.devSession.status() !== null || this.devSession.gated());
  protected readonly categories = reviewCategories;
  protected readonly requestTypes = requestTypes;
  protected readonly requestFilterPrefix = requestFilterPrefix;
  protected readonly isRequest = isRequest;
  protected readonly kindBadge = kindBadge;
  protected readonly ticketPill = ticketPill;
  protected readonly statuses = reviewStatuses;
  protected readonly pages = reviewedPages;
  protected readonly limits = reviewLimits;
  protected readonly labelOf = labelOf;

  protected readonly state = signal<'loading' | 'ready' | 'denied' | 'signed-out' | 'error'>('loading');
  protected readonly viewer = signal<PlatformReviewViewer | null>(null);
  protected readonly items = signal<PlatformReviewSummary[]>([]);
  protected readonly nextBefore = signal<string | null>(null);
  protected readonly loadingOlder = signal(false);
  protected readonly olderError = signal('');
  /**
   * DLV-971 (owner, 2026-11-06): the owner and admins see the overview, the filters and every reviewer's items;
   * only the owner sets a status and writes the note on a review. An admin reads the note like a reviewer does.
   */
  protected readonly seesAll = computed(() => this.viewer()?.role === 'owner' || this.viewer()?.role === 'admin');
  protected readonly isOwner = computed(() => this.viewer()?.role === 'owner');
  /**
   * Triage rule (owner, 2026-11-06): the owner sets the status of every item; an admin only of a learner request
   * (kind "request"); nobody else.
   */
  protected canTriage(item: PlatformReviewItem | PlatformReviewSummary): boolean {
    const role = this.viewer()?.role;
    if (role === 'owner') return true;
    if (role === 'admin') return isRequest(item);
    return false;
  }
  /**
   * DLV-971 runtime stores (owner, 2026-11-06): Promote adds a ticket to the DEV delivery plan. Whoever may set the
   * status may promote (owner: any item; admin: a learner request), once; an item that already has a ticket shows
   * the ticket pill instead.
   */
  protected canPromote(item: PlatformReviewItem): boolean {
    return this.devOrLocal() && this.canTriage(item) && !item.ticketId;
  }
  /** Reviews are edited and deleted by their reviewer while New; a learner request is never editable here. */
  protected canEdit(item: PlatformReviewItem): boolean {
    return this.isOwn(item) && !isRequest(item) && item.status === 'new';
  }
  /** The owner and admins switch between everyone's items (all, or one kind) and the reviewer view of their own. */
  protected readonly ownerView = signal<'all' | 'mine'>('all');
  protected readonly showAll = computed(() => this.seesAll() && this.ownerView() === 'all');
  /** DLV-971 (owner, 2026-11-06): the Kind filter and the Support tickets / Feedback pills share this value. */
  protected readonly kindFilter = signal<'' | 'ticket' | 'feedback'>('');
  protected readonly ticketItems = computed(() => this.items().filter(isRequest));
  protected readonly feedbackItems = computed(() => this.items().filter((item) => !isRequest(item)));
  /** The type cards of the feedback form: the review categories with an icon and a one-line hint, like the ticket kinds. */
  protected readonly categoryCards = [
    { id: 'problem', icon: '🐞', label: 'Problem', hint: 'Something broke or looks wrong' },
    { id: 'change', icon: '🔧', label: 'Change request', hint: 'Works, but should work differently' },
    { id: 'idea', icon: '💡', label: 'Idea', hint: 'Something new worth adding' },
    { id: 'content', icon: '📖', label: 'Content correction', hint: 'A lesson, text or example is wrong' },
  ] as const;
  /** The viewer may edit or delete their own item while it is still New, whichever list shows it. */
  protected isOwn(item: PlatformReviewItem): boolean {
    return item.reviewerId === this.viewer()?.reviewerId;
  }
  protected readonly ownItems = computed(() =>
    this.items().filter((item) => item.reviewerId === this.viewer()?.reviewerId),
  );

  // Opened item
  protected readonly openId = signal<string | null>(null);
  protected readonly details = signal<Record<string, PlatformReviewItem>>({});
  protected readonly detailState = signal<Record<string, 'loading' | 'error'>>({});

  // Reviewer form
  protected readonly editingId = signal<string | null>(null);
  protected category: ReviewCategory = 'problem';
  protected page = 'Whole platform';
  protected pageUrl = '';
  protected title = '';
  protected detailsText = '';
  protected priority: ReviewPriority = 'medium';
  /** The key of the last unconfirmed save, reused when exactly the same form is sent again. */
  private pendingSave: { signature: string; key: string } | null = null;
  protected readonly keptAttachments = signal<ReviewAttachment[]>([]);
  protected readonly pendingFiles = signal<PendingFile[]>([]);
  protected readonly formError = signal('');
  protected readonly formStatus = signal('');
  protected readonly saving = signal(false);

  // Owner filters and triage drafts
  protected readonly reviewerFilter = signal('');
  protected readonly statusFilter = signal('');
  protected readonly categoryFilter = signal('');
  protected readonly triageDrafts = signal<Record<string, { status: ReviewStatus; note: string }>>(
    {},
  );
  protected readonly triageMessage = signal<Record<string, string>>({});
  /** "Copied" or "Copy failed" after the reference copy button, per item. */
  protected readonly copyStatus = signal<Record<string, string>>({});
  /** The item whose Promote is in flight, and the outcome text per item. */
  protected readonly promoting = signal<string | null>(null);
  protected readonly promoteMessage = signal<Record<string, string>>({});
  /** The item an /admin/feedback#<id> link asked for: opened on load and marked in the list. */
  protected readonly targetId = signal<string | null>(null);

  // Attachments
  protected readonly attachmentUrls = signal<Record<string, string>>({});
  protected readonly viewing = signal<{ url: string; name: string } | null>(null);
  private readonly imageDialog = viewChild<ElementRef<HTMLDialogElement>>('imageDialog');
  private readonly formHeading = viewChild<ElementRef<HTMLElement>>('formHeading');
  private readonly followCategory = effect(() => {
    const chosen = this.category$();
    if (chosen && !this.editingId()) this.category = chosen;
  });

  protected readonly reviewers = computed(() => {
    const byReviewer = new Map<
      string,
      { id: string; name: string; items: PlatformReviewSummary[] }
    >();
    for (const item of this.items()) {
      const entry = byReviewer.get(item.reviewerId) ?? {
        id: item.reviewerId,
        name: item.reviewerName,
        items: [],
      };
      entry.items.push(item);
      byReviewer.set(item.reviewerId, entry);
    }
    return [...byReviewer.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
  protected readonly visibleItems = computed(() =>
    this.items().filter(
      (item) =>
        (!this.kindFilter() || (this.kindFilter() === 'ticket') === isRequest(item)) &&
        (!this.reviewerFilter() || item.reviewerId === this.reviewerFilter()) &&
        (!this.statusFilter() || item.status === this.statusFilter()) &&
        this.matchesType(item),
    ),
  );
  /** The Type filter holds a review category or a learner request type ("request:<type>"). */
  private matchesType(item: PlatformReviewSummary): boolean {
    const filter = this.categoryFilter();
    if (!filter) return true;
    if (filter.startsWith(requestFilterPrefix))
      return isRequest(item) && item.requestType === filter.slice(requestFilterPrefix.length);
    return item.category === filter;
  }
  protected countRequests(items: PlatformReviewSummary[]): number {
    return items.filter(isRequest).length;
  }
  protected readonly allDays = computed(() => this.byDay(this.visibleItems()));
  protected readonly ownDays = computed(() => this.byDay(this.ownItems()));
  ngOnInit(): void {
    void this.load();
  }

  ngOnDestroy(): void {
    this.releaseUrls();
    for (const pending of this.pendingFiles()) URL.revokeObjectURL(pending.url);
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    this.releaseUrls();
    this.openId.set(null);
    this.details.set({});
    this.detailState.set({});
    this.triageMessage.set({});
    try {
      // DLV-971 (owner, 2026-11-06): the Give feedback form needs only the viewer's role, so it no longer waits for, or
      // fails with, the item list; a list that cannot load is reported where the list is shown (Support tickets and feedback).
      const viewer = await this.client.viewer();
      // "user" is the service's word for an account with no review role; this page denies it itself, wherever it is
      // embedded, instead of relying on the Support page's filter.
      if (viewer.role === 'user') {
        this.viewer.set(viewer);
        this.state.set('denied');
        return;
      }
      this.viewer.set(viewer);
      if (this.section() === 'submit') {
        this.items.set([]);
        this.nextBefore.set(null);
        this.state.set('ready');
        const pendingEdit = this.editIntent.take();
        if (pendingEdit) await this.editById(pendingEdit);
        return;
      }
      const page = await this.client.list();
      this.items.set(page.items);
      this.nextBefore.set(page.nextBefore);
      this.state.set('ready');
      this.openRequestedItem();
    } catch (error) {
      const kind = error instanceof PlatformReviewError ? error.kind : 'unavailable';
      this.state.set(kind === 'forbidden' ? 'denied' : kind === 'unauthorized' ? 'signed-out' : 'error');
    }
  }

  /**
   * A ticket's "From review REV-000001" link on the Delivery Plan opens /admin/feedback#<id>: the item named in
   * the fragment opens and scrolls into view when it is in the loaded list.
   */
  private openRequestedItem(): void {
    const requested = this.route.snapshot.fragment;
    if (!requested || !this.items().some((item) => item.id === requested)) return;
    this.targetId.set(requested);
    this.openId.set(requested);
    void this.loadDetail(requested);
    setTimeout(() => document.getElementById(`review-${requested}`)?.scrollIntoView?.({ block: 'start' }));
  }

  protected async loadOlder(): Promise<void> {
    const before = this.nextBefore();
    if (!before || this.loadingOlder()) return;
    this.loadingOlder.set(true);
    this.olderError.set('');
    try {
      const page = await this.client.list(before);
      this.items.update((items) => [...items, ...page.items]);
      this.nextBefore.set(page.nextBefore);
    } catch {
      this.olderError.set('Older days could not be loaded. Try again.');
    } finally {
      this.loadingOlder.set(false);
    }
  }

  /** Opens one item at a time and loads its details and images the first time. */
  protected async toggle(summary: PlatformReviewSummary): Promise<void> {
    if (this.openId() === summary.id) {
      this.openId.set(null);
      return;
    }
    this.openId.set(summary.id);
    if (this.details()[summary.id] && this.detailState()[summary.id] !== 'error') return;
    await this.loadDetail(summary.id);
  }

  protected async loadDetail(id: string): Promise<void> {
    this.detailState.update((states) => ({ ...states, [id]: 'loading' }));
    try {
      const item = await this.client.item(id);
      this.remember(item);
      this.detailState.update(({ [id]: _, ...rest }) => rest);
      void this.loadAttachmentUrls(item);
    } catch {
      this.detailState.update((states) => ({ ...states, [id]: 'error' }));
    }
  }

  private remember(item: PlatformReviewItem): void {
    this.details.update((details) => ({ ...details, [item.id]: item }));
    this.triageDrafts.update((drafts) => ({
      ...drafts,
      [item.id]: { status: item.status, note: item.ownerNote },
    }));
    this.items.update((items) =>
      items.map((summary) =>
        summary.id === item.id
          ? {
              ...summary,
              title: item.title,
              category: item.category,
              page: item.page,
              priority: item.priority,
              status: item.status,
              ownerNote: !!item.ownerNote,
              attachmentCount: item.attachments.length,
              kind: item.kind,
              requestType: item.requestType,
              reference: item.reference,
              ticketId: item.ticketId,
              ticketStatus: item.ticketStatus,
              updatedAt: item.updatedAt,
            }
          : summary,
      ),
    );
  }

  private async loadAttachmentUrls(item: PlatformReviewItem): Promise<void> {
    for (const attachment of item.attachments) {
      if (this.attachmentUrls()[attachment.id]) continue;
      try {
        const url = await this.client.attachmentUrl(item, attachment);
        this.attachmentUrls.update((urls) => ({ ...urls, [attachment.id]: url }));
      } catch {
        // A missing image shows its file name instead of a thumbnail.
      }
    }
  }

  private releaseUrls(): void {
    for (const url of Object.values(this.attachmentUrls())) this.client.releaseAttachmentUrl(url);
    this.attachmentUrls.set({});
  }

  protected addFiles(files: FileList | File[] | null): void {
    const chosen = [...(files ?? [])];
    if (!chosen.length) return;
    this.pendingFiles.update((pending) => [
      ...pending,
      ...chosen.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
    this.formError.set(draftProblem(this.draft(), this.keptAttachments()) ?? '');
  }

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(input.files);
    input.value = '';
  }

  /** Screenshots pasted into the form become attachments. */
  protected onPaste(event: ClipboardEvent): void {
    const images = [...(event.clipboardData?.files ?? [])].filter((file) =>
      file.type.startsWith('image/'),
    );
    if (!images.length) return;
    event.preventDefault();
    this.addFiles(
      images.map(
        (file, index) =>
          new File(
            [file],
            file.name && file.name !== 'image.png'
              ? file.name
              : `pasted-screenshot-${Date.now()}-${index + 1}.png`,
            { type: file.type },
          ),
      ),
    );
  }

  protected removePending(index: number): void {
    const removed = this.pendingFiles()[index];
    if (removed) URL.revokeObjectURL(removed.url);
    this.pendingFiles.update((pending) => pending.filter((_, position) => position !== index));
    this.formError.set(draftProblem(this.draft(), this.keptAttachments()) ?? '');
  }

  protected removeKept(id: string): void {
    this.keptAttachments.update((kept) => kept.filter((file) => file.id !== id));
  }

  private draft(): PlatformReviewDraft {
    const fields = {
      editing: this.editingId(),
      category: this.category,
      page: this.page,
      pageUrl: this.pageUrl.trim(),
      title: this.title,
      details: this.detailsText,
      priority: this.priority,
      keepAttachmentIds: this.keptAttachments().map((file) => file.id),
    };
    const newFiles = this.pendingFiles().map((pending) => pending.file);
    const signature = JSON.stringify([
      fields,
      newFiles.map((file) => [file.name, file.type, file.size, file.lastModified]),
    ]);
    if (this.pendingSave?.signature !== signature)
      this.pendingSave = { signature, key: crypto.randomUUID() };
    const { editing: _, ...draft } = fields;
    return { ...draft, newFiles, requestKey: this.pendingSave.key };
  }

  protected async submit(): Promise<void> {
    const draft = this.draft();
    const problem = draftProblem(draft, this.keptAttachments());
    this.formStatus.set('');
    if (problem) {
      this.formError.set(problem);
      return;
    }
    this.formError.set('');
    this.saving.set(true);
    const editing = this.editingId();
    try {
      await this.client.save(draft, editing ?? undefined);
      this.resetForm();
      await this.load();
      this.formStatus.set(editing ? 'Your changes are saved.' : 'Your feedback is sent.');
    } catch (error) {
      this.formError.set(
        error instanceof PlatformReviewError && error.message !== error.kind
          ? error.message
          : 'The item could not be saved. Your text is still here; try again.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected showOwnerView(view: 'all' | 'mine', kind: '' | 'ticket' | 'feedback' = ''): void {
    this.ownerView.set(view);
    this.kindFilter.set(kind);
    this.openId.set(null);
    this.formStatus.set('');
  }

  /**
   * DLV-971 (owner, 2026-11-06): on Support tickets and feedback the form is on another page, so Edit records the id
   * and opens /support, whose feedback form instance loads the item on init.
   */
  protected edit(item: PlatformReviewItem): void {
    if (this.section() === 'submitted') {
      this.editIntent.set(item.id);
      // The Support page's final shape is pending (owner, 2026-11-06); until then Edit opens its default tab.
      void this.router.navigate(['/support'], { queryParams: { view: null }, queryParamsHandling: 'merge' });
      return;
    }
    this.fillForm(item);
  }

  private async editById(id: string): Promise<void> {
    try {
      const item = await this.client.item(id);
      if (isRequest(item)) throw new PlatformReviewError('forbidden');
      this.fillForm(item);
      void this.loadAttachmentUrls(item);
    } catch {
      this.formStatus.set('The item could not be opened for editing. Open it again under Support tickets and feedback.');
    }
  }

  private fillForm(item: PlatformReviewItem): void {
    this.resetForm();
    this.editingId.set(item.id);
    this.category = item.category;
    this.editing.emit(item.category);
    this.page = item.page;
    this.pageUrl = item.pageUrl;
    this.title = item.title;
    this.detailsText = item.details;
    // DLV-971 (owner, 2026-11-06): no importance on the page; the stored value is ignored and the default sent back.
    this.keptAttachments.set([...item.attachments]);
    const heading = this.formHeading()?.nativeElement;
    heading?.scrollIntoView?.({ block: 'start' });
    heading?.focus();
  }

  protected resetForm(): void {
    for (const pending of this.pendingFiles()) URL.revokeObjectURL(pending.url);
    const wasEditing = this.editingId() !== null;
    this.editingId.set(null);
    this.category = this.category$() ?? 'problem';
    if (wasEditing) this.editing.emit(null);
    this.page = 'Whole platform';
    this.pageUrl = '';
    this.title = '';
    this.detailsText = '';
    this.priority = 'medium';
    this.pendingSave = null;
    this.keptAttachments.set([]);
    this.pendingFiles.set([]);
    this.formError.set('');
  }

  protected async remove(item: PlatformReviewItem): Promise<void> {
    if (!confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
    try {
      await this.client.remove(item.id);
      if (this.editingId() === item.id) this.resetForm();
      await this.load();
      this.formStatus.set('The item was deleted.');
    } catch (error) {
      this.formStatus.set(
        error instanceof PlatformReviewError && error.message !== error.kind
          ? error.message
          : 'The item could not be deleted. Try again.',
      );
    }
  }

  protected setTriage(id: string, change: Partial<{ status: ReviewStatus; note: string }>): void {
    this.triageDrafts.update((drafts) => ({ ...drafts, [id]: { ...drafts[id], ...change } }));
    this.triageMessage.update((messages) => ({ ...messages, [id]: '' }));
  }

  protected async saveTriage(item: PlatformReviewItem): Promise<void> {
    const draft = this.triageDrafts()[item.id];
    try {
      this.remember(await this.client.triage(item.id, draft.status, draft.note));
      this.triageMessage.update((messages) => ({ ...messages, [item.id]: 'Saved.' }));
    } catch {
      this.triageMessage.update((messages) => ({
        ...messages,
        [item.id]: 'Not saved. Try again.',
      }));
    }
  }

  /**
   * Promote to ticket: the Domain adds the ticket to the DEV plan and returns the item with its `ticketId`. A 409 means
   * someone promoted it first; the item is reloaded so its pill shows.
   */
  protected async promote(item: PlatformReviewItem): Promise<void> {
    if (this.promoting()) return;
    this.promoting.set(item.id);
    this.promoteMessage.update((messages) => ({ ...messages, [item.id]: '' }));
    try {
      const result = await this.client.promote(item.id);
      this.remember({ ...result.item, ticketId: result.item.ticketId ?? result.ticketId });
      this.promoteMessage.update((messages) => ({ ...messages, [item.id]: `Ticket ${result.ticketId} created.` }));
    } catch (error) {
      const kind = error instanceof PlatformReviewError ? error.kind : 'unavailable';
      if (kind === 'conflict') {
        this.promoteMessage.update((messages) => ({ ...messages, [item.id]: 'This item already has a ticket.' }));
        await this.loadDetail(item.id);
      } else {
        this.promoteMessage.update((messages) => ({
          ...messages,
          [item.id]: kind === 'forbidden' ? 'Your role cannot promote this item.' : 'Not promoted. Try again.',
        }));
      }
    } finally {
      this.promoting.set(null);
    }
  }

  /** Copies the support reference of a learner request; the status text says whether it worked. */
  protected async copyReference(item: PlatformReviewItem): Promise<void> {
    const reference = item.reference ?? '';
    let copied = false;
    try {
      const clipboard = navigator.clipboard;
      if (clipboard?.writeText) {
        await clipboard.writeText(reference);
        copied = true;
      }
    } catch {
      copied = false;
    }
    this.copyStatus.update((status) => ({ ...status, [item.id]: copied ? 'Copied' : 'Copy failed' }));
  }

  protected countWith(items: PlatformReviewSummary[], status: ReviewStatus): number {
    return items.filter((item) => item.status === status).length;
  }

  protected openImage(attachment: ReviewAttachment): void {
    const url = this.attachmentUrls()[attachment.id];
    if (!url) return;
    this.viewing.set({ url, name: attachment.name });
    this.imageDialog()?.nativeElement.showModal();
  }

  protected closeImage(): void {
    this.imageDialog()?.nativeElement.close();
    this.viewing.set(null);
  }

  protected size(bytes: number): string {
    return bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  protected time(value: string): string {
    return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  protected images(count: number): string {
    return count === 1 ? '1 image' : `${count} images`;
  }

  /** Groups by the reader's local date; items arrive newest first and keep that order. */
  private byDay(items: PlatformReviewSummary[]): DayGroup[] {
    const groups: DayGroup[] = [];
    for (const item of items) {
      const date = new Date(item.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      let group = groups.at(-1);
      if (group?.key !== key) {
        group = {
          key,
          label: date.toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
          items: [],
        };
        groups.push(group);
      }
      group.items.push(item);
    }
    return groups;
  }
}
