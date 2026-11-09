import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import {
  authorWorkspaceLinks,
  visibleAdminLinks,
  visibleDocumentationGroups,
  AuthorWorkspacePageId,
  isAuthorDocumentationPage,
  authorDocumentationSection,
  authorDocumentationGroup,
  documentationLandingGroup,
} from './author-workspace-links';
import { SidebarToggle } from '../page-sidebars/sidebar-toggle';

import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';

let menuInstance = 0;

/**
 * Admin navigation on the left; a separate documentation-only instance on the right. The host element is the page's navigation column.
 */
@Component({
  selector: 'app-author-admin-menu',
  imports: [SidebarToggle],
  host: { '[class.sidebar-collapsed]': '!open()', '[class.documentation-rail]': 'documentationOnly()' },
  templateUrl: './author-admin-menu.html',
  styleUrl: './author-admin-menu.css',
})
export class AuthorAdminMenu {
  readonly documentationOnly = input(false);
  readonly pageId = input<AuthorWorkspacePageId | null>(null);
  /** Narrow screens stack the menu above the page, so it starts collapsed to its Admin row. */
  protected readonly open = signal(
    !inject(DOCUMENT).defaultView?.matchMedia?.('(max-width: 900px)').matches,
  );
  protected readonly instance = ++menuInstance;
  protected readonly contentId = `author-admin-menu-${this.instance}`;
  private readonly document = inject(DOCUMENT);
  private readonly accounts = inject(StudyPlanAccount);
  protected readonly workspaceLinks = computed(() => visibleAdminLinks(this.accounts.account()));
  protected readonly documentationGroups = computed(() => {
    const groupId = this.pageId() === 'docs'
      ? documentationLandingGroup(this.document.location.search, this.document.location.hash)
      : authorDocumentationGroup(this.pageId())?.id;
    return visibleDocumentationGroups(this.accounts.account()).filter(group => group.id === groupId);
  });
  protected readonly onDocumentationPage = computed(() => isAuthorDocumentationPage(this.pageId()));

  /** The parent page and sub-pages around the open page, when it belongs to one. */
  protected readonly section = computed(() => authorDocumentationSection(this.pageId()));

  /** A parent page is the current section while one of its sub-pages is open. */
  protected documentationState(id: string): 'page' | 'true' | null {
    if (id === this.pageId()) return 'page';
    return this.section()?.parent.id === id ? 'true' : null;
  }

  /** The open page is "page"; Documentation is the current section on any single document. */
  protected currentState(id: string): 'page' | 'true' | null {
    if (id === this.pageId()) return 'page';
    return id === 'docs' && this.onDocumentationPage() ? 'true' : null;
  }
}
