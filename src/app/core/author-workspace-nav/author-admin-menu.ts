import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import {
  authorDocumentationGroups,
  authorWorkspaceLinks,
  visibleAdminLinks,
  AuthorWorkspacePageId,
  isAuthorDocumentationPage,
  authorDocumentationSection,
} from './author-workspace-links';
import { SidebarToggle } from '../page-sidebars/sidebar-toggle';

import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';

let menuInstance = 0;

/**
 * Right sidebar of every admin page: the Admin menu, plus the documentation pages while the
 * reader is on one of them. The host element is the page's right-hand grid column.
 */
@Component({
  selector: 'app-author-admin-menu',
  imports: [SidebarToggle],
  host: { '[class.sidebar-collapsed]': '!open()' },
  templateUrl: './author-admin-menu.html',
  styleUrl: './author-admin-menu.css',
})
export class AuthorAdminMenu {
  readonly pageId = input<AuthorWorkspacePageId | null>(null);
  /** Narrow screens stack the menu above the page, so it starts collapsed to its Admin row. */
  protected readonly open = signal(
    !inject(DOCUMENT).defaultView?.matchMedia?.('(max-width: 900px)').matches,
  );
  protected readonly instance = ++menuInstance;
  protected readonly contentId = `author-admin-menu-${this.instance}`;
  private readonly accounts = inject(StudyPlanAccount);
  protected readonly workspaceLinks = computed(() => visibleAdminLinks(this.accounts.account()));
  protected readonly documentationGroups = authorDocumentationGroups;
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
