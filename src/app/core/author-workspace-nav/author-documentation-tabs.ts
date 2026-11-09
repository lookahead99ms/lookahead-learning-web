import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import { authorDocumentationGroup, documentationGroupHref, documentationLandingGroup, visibleDocumentationGroups } from './author-workspace-links';

/** Route-level group navigation, separate from each document's content section tabs. */
@Component({
  selector: 'app-author-documentation-tabs',
  template: `<nav class="documentation-tabs" aria-label="Documentation groups">
    @for (group of groups(); track group.id) {
      <a [href]="groupHref(group.id)" [attr.aria-current]="group.id === activeGroup() ? 'page' : null">{{ group.label }}</a>
    }
  </nav>`,
  styles: `
    :host { display:block; min-width:0; margin:0 0 20px; }
    .documentation-tabs { display:flex; gap:20px; overflow-x:auto; overscroll-behavior-x:contain; border-bottom:1px solid var(--line); padding:0 0 2px; }
    a { flex:0 0 auto; display:inline-flex; align-items:center; min-height:44px; border-bottom:3px solid transparent; color:var(--text-subtle); text-decoration:none; font-size:13px; font-weight:650; }
    a:hover { color:var(--accent-strong); }
    a[aria-current] { border-color:var(--accent-strong); color:var(--accent-strong); }
    a:focus-visible { outline:3px solid var(--accent-focus); outline-offset:-3px; }
  `,
})
export class AuthorDocumentationTabs {
  protected readonly groupHref = documentationGroupHref;
  readonly pageId = input<string | null>(null);
  private readonly account = inject(StudyPlanAccount);
  private readonly document = inject(DOCUMENT);
  protected readonly groups = computed(() => visibleDocumentationGroups(this.account.account()));
  protected readonly activeGroup = computed(() => this.pageId() === 'docs'
    ? documentationLandingGroup(this.document.location.search, this.document.location.hash)
    : authorDocumentationGroup(this.pageId())?.id);
}
