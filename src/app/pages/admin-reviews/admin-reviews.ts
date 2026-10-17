import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  labelOf,
  reviewCategories,
  reviewLimits,
  reviewPriorities,
  reviewStatuses,
  reviewedPages,
} from './platform-review.model';
import { ScrollLock } from '../../core/scroll-lock/scroll-lock';

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
 * DLV-927/928: each reviewer records their own items; the owner sees and triages everyone's.
 * Shown as the Platform reviews tab of /support, which owns the page header and layout.
 * Items are grouped by the day they were sent, newest first. A row shows the summary; opening it
 * loads the description, the owner's note and the images.
 */
@Component({
  selector: 'app-admin-reviews',
  imports: [FormsModule, NgTemplateOutlet, ScrollLock],
  templateUrl: './admin-reviews.html',
  styleUrl: './admin-reviews.css',
})
export class AdminReviewsPage implements OnInit, OnDestroy {
  protected readonly accounts = inject(StudyPlanAccount);
  protected readonly client = inject(PLATFORM_REVIEW_CLIENT);
  protected readonly categories = reviewCategories;
  protected readonly priorities = reviewPriorities;
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
  protected readonly isOwner = computed(() => this.viewer()?.role === 'owner' || this.viewer()?.role === 'admin');
  /** The owner switches between everyone's items and the reviewer view of their own. */
  protected readonly ownerView = signal<'all' | 'mine'>('all');
  protected readonly showAll = computed(() => this.isOwner() && this.ownerView() === 'all');
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

  // Attachments
  protected readonly attachmentUrls = signal<Record<string, string>>({});
  protected readonly viewing = signal<{ url: string; name: string } | null>(null);
  private readonly imageDialog = viewChild<ElementRef<HTMLDialogElement>>('imageDialog');
  private readonly formHeading = viewChild<ElementRef<HTMLElement>>('formHeading');

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
        (!this.reviewerFilter() || item.reviewerId === this.reviewerFilter()) &&
        (!this.statusFilter() || item.status === this.statusFilter()) &&
        (!this.categoryFilter() || item.category === this.categoryFilter()),
    ),
  );
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
      const [viewer, page] = await Promise.all([this.client.viewer(), this.client.list()]);
      this.viewer.set(viewer);
      this.items.set(page.items);
      this.nextBefore.set(page.nextBefore);
      this.state.set('ready');
    } catch (error) {
      const kind = error instanceof PlatformReviewError ? error.kind : 'unavailable';
      this.state.set(kind === 'forbidden' ? 'denied' : kind === 'unauthorized' ? 'signed-out' : 'error');
    }
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
      this.formStatus.set(editing ? 'Your changes are saved.' : 'Your review item is saved.');
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

  protected showOwnerView(view: 'all' | 'mine'): void {
    this.ownerView.set(view);
    this.openId.set(null);
    this.formStatus.set('');
  }

  protected edit(item: PlatformReviewItem): void {
    this.resetForm();
    this.editingId.set(item.id);
    this.category = item.category;
    this.page = item.page;
    this.pageUrl = item.pageUrl;
    this.title = item.title;
    this.detailsText = item.details;
    this.priority = item.priority;
    this.keptAttachments.set([...item.attachments]);
    this.formHeading()?.nativeElement.scrollIntoView({ block: 'start' });
    this.formHeading()?.nativeElement.focus();
  }

  protected resetForm(): void {
    for (const pending of this.pendingFiles()) URL.revokeObjectURL(pending.url);
    this.editingId.set(null);
    this.category = 'problem';
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
