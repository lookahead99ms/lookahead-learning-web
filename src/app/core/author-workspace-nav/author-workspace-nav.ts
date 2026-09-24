import { DOCUMENT } from '@angular/common';
import {
  Component,
  HostListener,
  inject,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  signal,
  SimpleChanges,
} from '@angular/core';
import { authorDocumentationLinks, authorWorkspaceLinks } from './author-workspace-links';

export interface AuthorOutlineItem {
  label: string;
  href: string;
}

export type AuthorWorkspacePageId =
  'author' | 'previews' | 'delivery' | 'architecture' | 'local-development' | 'operations' | 'api';

let navigationInstance = 0;

/** Shared author outline and direct navigation between protected workspace pages. */
@Component({
  selector: 'app-author-workspace-nav',
  imports: [],
  templateUrl: './author-workspace-nav.html',
  styleUrl: './author-workspace-nav.css',
})
export class AuthorWorkspaceNav implements OnChanges {
  private readonly document = inject(DOCUMENT);
  @Input() pageTitle = '';
  @Input() pageId: AuthorWorkspacePageId | null = null;
  @Input() headingLevel: 1 | 2 = 1;
  @Input() outline: readonly AuthorOutlineItem[] = [];
  @Output() embeddedSectionSelected = new EventEmitter<string>();
  protected readonly workspaceLinks = authorWorkspaceLinks;
  protected readonly documentationLinks = authorDocumentationLinks;
  protected readonly documentationOpen = signal(false);
  protected readonly documentationId = `author-documentation-links-${++navigationInstance}`;
  protected readonly currentSection = signal(this.document.defaultView?.location.hash ?? '');

  protected get onDocumentationPage(): boolean {
    return this.documentationLinks.some((page) => page.id === this.pageId);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['pageId']) this.documentationOpen.set(this.onDocumentationPage);
  }

  protected toggleDocumentation(): void {
    this.documentationOpen.update((open) => !open);
  }

  protected sectionIsCurrent(item: AuthorOutlineItem): boolean {
    if (!this.currentSection()) return item.href === this.outline[0]?.href;
    const url = new URL(this.linkHref(item.href), 'https://author.invalid');
    return (
      !!url.hash &&
      url.pathname === this.document.defaultView?.location.pathname &&
      url.hash === this.currentSection()
    );
  }

  @HostListener('window:hashchange')
  @HostListener('window:popstate')
  protected syncCurrentSection(): void {
    this.currentSection.set(this.document.defaultView?.location.hash ?? '');
  }

  protected linkHref(href: string): string {
    if (!href.startsWith('#')) return href;
    const location = this.document.defaultView?.location;
    return `${location?.pathname ?? ''}${location?.search ?? ''}${href}`;
  }

  protected followSection(event: MouseEvent, item: AuthorOutlineItem): void {
    this.currentSection.set(new URL(this.linkHref(item.href), 'https://author.invalid').hash);
    if (
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    const location = this.document.defaultView?.location;
    if (!location) return;
    const url = new URL(this.linkHref(item.href), location.href);
    if (url.pathname !== location.pathname || url.search !== location.search || !url.hash) return;
    let sectionId: string;
    try {
      sectionId = decodeURIComponent(url.hash.slice(1));
    } catch {
      return;
    }
    const section = this.document.getElementById(sectionId);
    if (!section) {
      event.preventDefault();
      if (location.hash !== url.hash)
        this.document.defaultView?.history.pushState(null, '', url.pathname + url.search + url.hash);
      this.embeddedSectionSelected.emit(url.hash);
      return;
    }
    event.preventDefault();
    this.document.defaultView?.history.pushState(null, '', url.pathname + url.search + url.hash);
    section.scrollIntoView();
  }
}
