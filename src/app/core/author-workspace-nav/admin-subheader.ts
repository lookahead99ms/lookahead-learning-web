import { Component, computed, inject, input } from '@angular/core';
import { AuthorWorkspacePageId, visibleAdminLinks } from './author-workspace-links';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';

/**
 * DLV-971 (owner, 2026-11-06): the Admin sub-header, one full-width strip directly under the platform header with the
 * "Admin" eyebrow and the admin links as pills: the same pages, icons and labels as the account menu and the Admin
 * menu, role-aware the same way (the owner sees People & Access and Previews; admins Test Accounts and no Previews;
 * co-authors Test Accounts and Previews), the current page marked. An admin page that adopts it drops its side bars and
 * gives the whole width to its content. It renders nothing when the account has no admin links.
 */
@Component({
  selector: 'app-admin-subheader',
  templateUrl: './admin-subheader.html',
  styleUrl: './admin-subheader.css',
})
export class AdminSubheader {
  /** The id of the open page, marked aria-current="page". */
  readonly pageId = input<AuthorWorkspacePageId | null>(null);
  private readonly accounts = inject(StudyPlanAccount);
  protected readonly links = computed(() => visibleAdminLinks(this.accounts.account()));
}
