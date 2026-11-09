import { DOCUMENT } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { documentationGroupHref, documentationLandingGroup, visibleDocumentationGroups } from '../../core/author-workspace-nav/author-workspace-links';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { AuthorWorkspaceNav } from '../../core/author-workspace-nav/author-workspace-nav';
import { AuthorAdminMenu } from '../../core/author-workspace-nav/author-admin-menu';
import { PlatformHeader } from '../../core/platform-header/platform-header';

/** Documentation home: every protected reference, grouped by the reader who starts there. */
@Component({
  host: { class: 'admin-surface' },
  selector: 'app-author-docs',
  imports: [PlatformHeader, RouterLink, AuthorWorkspaceNav, AuthorAdminMenu],
  templateUrl: './author-docs.html',
  styleUrl: './author-docs.css',
})
export class AuthorDocsPage {
  private readonly document = inject(DOCUMENT);
  private readonly accounts = inject(StudyPlanAccount);
  protected readonly groupHref = documentationGroupHref;
  /** Only pages available to the current account are listed. */
  protected readonly groups = computed(() => visibleDocumentationGroups(this.accounts.account()));
  protected readonly selectedGroup = computed(() => {
    const id = documentationLandingGroup(this.document.location.search, this.document.location.hash);
    return this.groups().find(group => group.id === id);
  });
}
