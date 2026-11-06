import { Component, OnDestroy, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  PLATFORM_REVIEW_CLIENT,
  PlatformReviewError,
  PlatformReviewItem,
  PlatformReviewViewer,
  ReviewAttachment,
  ReviewStatus,
  isRequest,
  reviewStatuses,
  ticketPill,
} from '../admin-reviews/platform-review.model';
import { ReviewEditIntent } from '../admin-reviews/review-edit-intent';
import { ScrollLock } from '../../core/scroll-lock/scroll-lock';
import { kindLabel, momentLabel, statusLabel, statusTone, typeLabel } from './feedback-backlog';

/**
 * DLV-971 (owner, 2026-11-06): one item of Support tickets and feedback in two columns, shared by the backlog's
 * dialog and the item's own page (/admin/feedback/:id). Main: status, title, meta, description, screenshots, history
 * and, for whoever may set the status, the note with Save. Side: the Status select, the details and the Delivery Plan
 * box. Rules unchanged: the owner sets status and note on everything; an admin only on a learner support ticket; a
 * reviewer sees only their own feedback; Edit and Delete on own feedback while New (Edit opens /support).
 */
@Component({
  selector: 'app-feedback-item',
  imports: [FormsModule, RouterLink, ScrollLock],
  templateUrl: './feedback-item.html',
  styleUrl: './feedback-item.css',
})
export class FeedbackItemView implements OnDestroy {
  readonly itemId = input.required<string>();
  /** The viewer the host already knows; fetched here when the host gives none (the item page). */
  readonly viewer = input<PlatformReviewViewer | null>(null);
  /** Fired with the item after a status, note, promote or reload; null after a delete. */
  readonly changed = output<PlatformReviewItem | null>();

  protected readonly client = inject(PLATFORM_REVIEW_CLIENT);
  private readonly router = inject(Router);
  private readonly editIntent = inject(ReviewEditIntent);
  protected readonly statuses = reviewStatuses;
  protected readonly kindLabel = kindLabel;
  protected readonly typeLabel = typeLabel;
  protected readonly statusLabel = statusLabel;
  protected readonly statusTone = statusTone;
  protected readonly ticketPill = ticketPill;
  protected readonly isRequest = isRequest;
  protected readonly momentLabel = momentLabel;

  protected readonly state = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');
  protected readonly item = signal<PlatformReviewItem | null>(null);
  protected readonly who = signal<PlatformReviewViewer | null>(null);
  protected readonly attachmentUrls = signal<Record<string, string>>({});
  protected readonly viewing = signal<{ url: string; name: string } | null>(null);
  protected status: ReviewStatus = 'new';
  protected note = '';
  protected readonly saving = signal(false);
  protected readonly message = signal('');
  protected readonly promoting = signal(false);
  protected readonly promoteMessage = signal('');

  protected readonly canTriage = computed(() => {
    const item = this.item(), role = this.who()?.role;
    if (!item) return false;
    return role === 'owner' || (role === 'admin' && isRequest(item));
  });
  protected readonly canPromote = computed(() => this.canTriage() && !this.item()?.ticketId);
  protected readonly canEdit = computed(() => {
    const item = this.item();
    return !!item && item.reviewerId === this.who()?.reviewerId && !isRequest(item) && item.status === 'new';
  });
  /** The history the record carries: when it was opened, and the last change when one followed. */
  protected readonly history = computed(() => {
    const item = this.item();
    if (!item) return [];
    const rows = [{ what: 'Opened', who: item.reviewerName, when: momentLabel(item.createdAt), extra: item.reference ? 'reference sent by email' : '' }];
    if (item.updatedAt !== item.createdAt)
      rows.push({ what: statusLabel(item) === 'New' ? 'Updated' : `Status ${statusLabel(item)}`, who: '', when: momentLabel(item.updatedAt), extra: item.ownerNote ? 'with a note' : '' });
    return rows;
  });

  /** Loads the item whenever the key changes; nothing load() touches is tracked, so a load never re-triggers itself. */
  private readonly reload = effect(() => {
    const id = this.itemId();
    untracked(() => void this.load(id));
  });

  ngOnDestroy(): void {
    this.releaseUrls();
  }

  protected async load(id = this.itemId()): Promise<void> {
    this.state.set('loading');
    this.message.set('');
    this.promoteMessage.set('');
    this.releaseUrls();
    try {
      this.who.set(this.viewer() ?? (await this.client.viewer()));
      const item = await this.client.item(id);
      this.take(item);
      this.state.set('ready');
      void this.loadAttachmentUrls(item);
    } catch (error) {
      const kind = error instanceof PlatformReviewError ? error.kind : 'unavailable';
      this.state.set(kind === 'not-found' || kind === 'forbidden' ? 'missing' : 'error');
    }
  }

  private take(item: PlatformReviewItem): void {
    this.item.set(item);
    this.status = item.status;
    this.note = item.ownerNote;
  }

  protected async save(): Promise<void> {
    const item = this.item();
    if (!item || this.saving()) return;
    this.saving.set(true);
    this.message.set('');
    try {
      const saved = await this.client.triage(item.id, this.status, this.note);
      this.take(saved);
      this.message.set('Saved.');
      this.changed.emit(saved);
    } catch {
      this.message.set('Not saved. Try again.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async promote(): Promise<void> {
    const item = this.item();
    if (!item || this.promoting()) return;
    this.promoting.set(true);
    this.promoteMessage.set('');
    try {
      const result = await this.client.promote(item.id);
      const promoted = { ...result.item, ticketId: result.item.ticketId ?? result.ticketId };
      this.take(promoted);
      this.promoteMessage.set(`Ticket ${result.ticketId} created.`);
      this.changed.emit(promoted);
    } catch (error) {
      const kind = error instanceof PlatformReviewError ? error.kind : 'unavailable';
      if (kind === 'conflict') {
        this.promoteMessage.set('This item already has a ticket.');
        await this.load();
      } else this.promoteMessage.set(kind === 'forbidden' ? 'Your role cannot promote this item.' : 'Not promoted. Try again.');
    } finally {
      this.promoting.set(false);
    }
  }

  /** Edit opens Support with the item in the feedback form. */
  protected edit(): void {
    const item = this.item();
    if (!item) return;
    this.editIntent.set(item.id);
    void this.router.navigate(['/support']);
  }

  protected async remove(): Promise<void> {
    const item = this.item();
    if (!item || !confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
    try {
      await this.client.remove(item.id);
      this.changed.emit(null);
    } catch {
      this.message.set('The item could not be deleted. Try again.');
    }
  }

  private async loadAttachmentUrls(item: PlatformReviewItem): Promise<void> {
    for (const attachment of item.attachments) {
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

  protected openImage(attachment: ReviewAttachment, dialog: HTMLDialogElement): void {
    const url = this.attachmentUrls()[attachment.id];
    if (!url) return;
    this.viewing.set({ url, name: attachment.name });
    dialog.showModal();
  }

  protected size(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
}
