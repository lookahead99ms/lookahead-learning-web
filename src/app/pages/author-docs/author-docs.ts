import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { visibleDocumentationGroups } from '../../core/author-workspace-nav/author-workspace-links';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { AuthorWorkspaceNav } from '../../core/author-workspace-nav/author-workspace-nav';
import { AuthorAdminMenu } from '../../core/author-workspace-nav/author-admin-menu';
import { PlatformHeader } from '../../core/platform-header/platform-header';

/** Documentation home: every protected reference, grouped by the reader who starts there. */
@Component({
  selector: 'app-author-docs',
  imports: [PlatformHeader, RouterLink, AuthorWorkspaceNav, AuthorAdminMenu],
  templateUrl: './author-docs.html',
  styleUrl: './author-docs.css',
})
export class AuthorDocsPage {
  private readonly accounts = inject(StudyPlanAccount);
  /** DLV-969: only the pages this account may open are listed and counted. */
  protected readonly groups = computed(() => visibleDocumentationGroups(this.accounts.account()));
  protected readonly pageCount = computed(() =>
    this.groups().reduce((count, group) => count + group.pages.reduce((sum, page) => sum + 1 + (page.children?.length ?? 0), 0), 0));
  protected readonly outline = computed(() => this.groups().map((group) => ({
    label: group.label,
    href: `#docs-${group.id}`,
  })));
}
