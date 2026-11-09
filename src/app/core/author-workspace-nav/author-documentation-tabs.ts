import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import { AuthorDocumentationGroup, authorDocumentationGroup, authorDocumentationSection, documentationGroupHref, documentationLandingGroup, visibleDocumentationGroups } from './author-workspace-links';

/**
 * The documentation header (owner, 2026-11-09): the groups as one row of tabs, the open group marked and each group tab
 * opening its first page; under it the open group's pages as a plain sub tab bar, the open page marked, so the page
 * needs no heading of its own. A page split into sub-pages adds a third row for them (Overview, then each sub-page), so
 * the reader never meets "page 8 of 17" copy. The document's own sections follow as pills. The landing shows the pages
 * as cards and a single-page group is its own page, so neither shows the page row.
 */
@Component({
  selector: 'app-author-documentation-tabs',
  template: `<nav class="documentation-tabs" [class.first-active]="firstGroupActive()" aria-label="Documentation groups">
    @for (group of groups(); track group.id) {
      <a [href]="groupLink(group)" [attr.aria-current]="group.id === activeGroup() ? 'page' : null">{{ group.label }}</a>
    }
  </nav>
  @if (pages().length) {
    <nav class="documentation-pages" [class.first-active]="firstPageActive()" [attr.aria-label]="activeGroupLabel() + ' pages'">
      @for (page of pages(); track page.id) {
        <a [href]="page.href" [attr.aria-current]="isCurrent(page.id) ? 'page' : null">{{ page.label }}</a>
      }
    </nav>
  }
  @if (subPages(); as section) {
    <nav class="documentation-subpages" [attr.aria-label]="section.parent.label + ' section pages'">
      @for (page of section.pages; track page.id) {
        <a [href]="page.href" [attr.aria-current]="page.id === pageId() ? 'page' : null">{{ page.id === section.parent.id ? 'Overview' : page.label }}</a>
      }
    </nav>
  }`,
  styles: `
    /* Connected tabs (owner, 2026-11-09): the open group tab is a shape whose outline runs around it and opens into the
       band of page tabs below; the open page tab is the same shape and opens downward into the page itself. Inactive
       tabs are plain text. */
    :host { display:block; min-width:0; margin:0 0 14px; --tab-radius:10px; }
    .documentation-tabs, .documentation-pages { display:flex; align-items:flex-end; overflow-x:auto; overscroll-behavior-x:contain; scrollbar-width:none; }
    a { flex:0 0 auto; display:inline-flex; align-items:center; padding:0 14px; border:1px solid transparent; border-bottom:0; border-radius:var(--tab-radius) var(--tab-radius) 0 0; color:var(--text-subtle); text-decoration:none; white-space:nowrap; }
    a:hover { color:var(--accent-strong); }
    a:focus-visible { outline:3px solid var(--accent-focus); outline-offset:-3px; }
    /* Group row: the band's top edge is the line; the open tab covers the segment under itself with the band's colour. */
    .documentation-tabs { position:relative; z-index:1; }
    .documentation-tabs a { min-height:44px; font-size:13px; font-weight:650; }
    .documentation-tabs a[aria-current] { margin-bottom:-1px; border-color:var(--line); background:var(--surface-muted); color:var(--accent-strong); }
    .documentation-tabs:not(:has(+ .documentation-pages)) { border-bottom:1px solid var(--line); }
    .documentation-tabs:not(:has(+ .documentation-pages)) a[aria-current] { background:var(--surface-page); }
    /* Page band: bordered and tinted; its top-left corner stays square while the first group tab sits on it. */
    .documentation-pages { gap:4px; padding:6px 8px 0; border:1px solid var(--line); border-radius:var(--tab-radius); background:var(--surface-muted); }
    .documentation-tabs.first-active + .documentation-pages { border-top-left-radius:0; }
    .documentation-pages a { min-height:36px; font-size:13px; font-weight:600; }
    .documentation-pages a[aria-current] { margin-bottom:-1px; border-color:var(--line); background:var(--surface-page); color:var(--text-strong); }
    /* Sub-page band: hangs from the page band, so the open page tab opens straight into it; the open sub-page opens into the page. */
    .documentation-pages:has(+ .documentation-subpages) { border-bottom-left-radius:0; border-bottom-right-radius:0; }
    .documentation-subpages { display:flex; flex-wrap:wrap; align-items:flex-end; gap:0 2px; padding:4px 8px 0; border:1px solid var(--line); border-top:0; border-radius:0 0 var(--tab-radius) var(--tab-radius); background:var(--surface-page); }
    .documentation-subpages a { min-height:34px; padding:0 12px; font-size:12.5px; font-weight:600; }
    .documentation-subpages a[aria-current] { margin-bottom:-1px; border-color:var(--line); background:var(--surface-page); color:var(--accent-strong); }
  `,
})
export class AuthorDocumentationTabs {
  readonly pageId = input<string | null>(null);
  private readonly account = inject(StudyPlanAccount);
  private readonly document = inject(DOCUMENT);
  protected readonly groups = computed(() => visibleDocumentationGroups(this.account.account()));
  protected readonly activeGroup = computed(() => this.pageId() === 'docs'
    ? documentationLandingGroup(this.document.location.search, this.document.location.hash)
    : authorDocumentationGroup(this.pageId())?.id);
  /** The first group tab sits on the band's top-left corner, which then stays square so the two outlines meet. */
  protected readonly firstGroupActive = computed(() => this.groups()[0]?.id === this.activeGroup());
  protected readonly firstPageActive = computed(() => !!this.pages()[0] && this.isCurrent(this.pages()[0].id));
  protected readonly activeGroupLabel = computed(() => this.groups().find((group) => group.id === this.activeGroup())?.label ?? '');
  /** A group tab opens the group's first page (owner, 2026-11-09: Overview opens Pages & screen names); the landing stays reachable from the menu. */
  protected groupLink(group: AuthorDocumentationGroup): string {
    return group.pages[0]?.href ?? documentationGroupHref(group.id);
  }
  /** The open group's pages for the sub tab bar: none on the landing (cards) and none for a single-page group. */
  protected readonly pages = computed(() => {
    if (this.pageId() === 'docs') return [];
    const pages = this.groups().find((group) => group.id === this.activeGroup())?.pages ?? [];
    return pages.length > 1 ? pages : [];
  });
  /** The section a split page belongs to (its parent first, shown as Overview), for the third row; null when standalone. */
  protected readonly subPages = computed(() => this.pageId() === 'docs' ? null : authorDocumentationSection(this.pageId()));
  /** True when the sub tab bar names the open page, so the page needs no heading of its own. */
  readonly namesCurrentPage = computed(() => this.pages().some((page) => this.isCurrent(page.id)));
  /** The open page, or the parent of an open sub-page, is the current tab. */
  protected isCurrent(id: string): boolean {
    const page = this.pages().find((candidate) => candidate.id === id);
    return id === this.pageId() || !!page?.children?.some((child) => child.id === this.pageId());
  }
}
