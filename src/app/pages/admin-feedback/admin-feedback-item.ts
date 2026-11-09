import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { AuthorAdminMenu } from '../../core/author-workspace-nav/author-admin-menu';
import { FeedbackItemView } from './feedback-item';

/**
 * DLV-971 (owner, 2026-11-06): one ticket or feedback item on its own page, /admin/feedback/:id (the ↗ on a backlog
 * row and "Open in new tab" in the dialog), with a breadcrumb back to the backlog. The content is the same two-column
 * view the dialog shows; a key that does not exist says so with a link back. Like the backlog, the page has no side
 * outline: the shared Admin rail carries the links and the item fills the content area.
 */
@Component({
  host: { class: 'admin-surface' },
  selector: 'app-admin-feedback-item',
  imports: [PlatformHeader, AuthorAdminMenu, RouterLink, FeedbackItemView],
  templateUrl: './admin-feedback-item.html',
  styleUrl: './admin-feedback-item.css',
})
export class AdminFeedbackItemPage {
  private readonly route = inject(ActivatedRoute);
  protected readonly itemId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id') ?? '')), { initialValue: this.route.snapshot.paramMap.get('id') ?? '' });
  protected readonly kind = computed(() => (this.itemId().startsWith('SUP-') ? 'Ticket' : 'Feedback'));
}
