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
  AfterViewInit,
  OnDestroy,
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
export class AuthorWorkspaceNav implements OnChanges, AfterViewInit, OnDestroy {
  private readonly document = inject(DOCUMENT);
  @Input() pageTitle = '';
  @Input() pageId: AuthorWorkspacePageId | null = null;
  @Input() headingLevel: 1 | 2 = 1;
  @Input() outline: readonly AuthorOutlineItem[] = [];
  @Input() embeddedFrame?: HTMLIFrameElement;
  @Input() embeddedDocumentId = '';
  @Input() embeddedHeight: number | null = null;
  private embeddedPositions = new Map<string, number>();
  private pendingFrame: number | null = null;
  private outlineRequest = 0;
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
    if (changes['embeddedFrame'] || changes['outline'] || changes['embeddedDocumentId'])
      this.embeddedPositions.clear();
    this.requestOutline();
    this.scheduleScrollUpdate();
  }

  ngAfterViewInit(): void {
    this.scheduleScrollUpdate();
  }

  ngOnDestroy(): void {
    if (this.pendingFrame !== null)
      this.document.defaultView?.cancelAnimationFrame(this.pendingFrame);
  }

  private sectionId(item: AuthorOutlineItem): string | null {
    const location = this.document.defaultView?.location;
    if (!location) return null;
    try {
      const url = new URL(this.linkHref(item.href), location.href);
      if (url.pathname !== location.pathname || url.search !== location.search) return null;
      const id = decodeURIComponent(url.hash.slice(1));
      return /^[a-z0-9-]+$/.test(id) ? id : null;
    } catch {
      return null;
    }
  }

  private requestOutline(): void {
    if (!this.embeddedFrame || !this.embeddedDocumentId) return;
    this.embeddedFrame.contentWindow?.postMessage(
      {
        type: 'lookahead:author-document:outline-request',
        version: 1,
        documentId: this.embeddedDocumentId,
        requestId: ++this.outlineRequest,
        anchors: this.outline.map((item) => this.sectionId(item)).filter(Boolean),
      },
      '*',
    );
  }

  @HostListener('window:resize')
  protected onResize(): void {
    this.requestOutline();
    this.scheduleScrollUpdate();
  }

  @HostListener('window:message', ['$event'])
  protected onOutlineMessage(event: MessageEvent): void {
    if (
      !this.embeddedFrame ||
      event.source !== this.embeddedFrame.contentWindow ||
      event.origin !== 'null'
    )
      return;
    const data = event.data;
    if (!data || data.version !== 1) return;
    if (
      (data.type === 'lookahead:author-document:height' &&
        data.documentId === this.embeddedDocumentId) ||
      (data.type === 'lookahead:architecture:height' &&
        this.embeddedDocumentId === 'architecture-reference')
    ) {
      this.requestOutline();
      return;
    }
    if (
      data.type !== 'lookahead:author-document:outline' ||
      data.documentId !== this.embeddedDocumentId ||
      data.requestId !== this.outlineRequest ||
      !Array.isArray(data.sections) ||
      data.sections.length > this.outline.length
    )
      return;
    const allowed = new Set(this.outline.map((item) => this.sectionId(item)));
    const positions = new Map<string, number>();
    for (const section of data.sections) {
      if (
        !section ||
        !allowed.has(section.anchor) ||
        positions.has(section.anchor) ||
        typeof section.offset !== 'number' ||
        !Number.isFinite(section.offset) ||
        section.offset < 0 ||
        section.offset > (this.embeddedHeight ?? 100_000)
      )
        return;
      positions.set(section.anchor, section.offset);
    }
    this.embeddedPositions = positions;
    this.scheduleScrollUpdate();
  }

  @HostListener('window:scroll')
  protected scheduleScrollUpdate(): void {
    const view = this.document.defaultView;
    if (!view || this.pendingFrame !== null) return;
    this.pendingFrame = view.requestAnimationFrame(() => {
      this.pendingFrame = null;
      this.updateFromScroll();
    });
  }

  private updateFromScroll(): void {
    const view = this.document.defaultView;
    if (!view) return;
    const header = this.document.querySelector('app-platform-header');
    const readingLine = (header?.getBoundingClientRect().bottom ?? 76) + 24;
    const frameTop = this.embeddedFrame?.getBoundingClientRect().top ?? 0;
    const sections = this.outline
      .flatMap((item) => {
        const id = this.sectionId(item);
        if (!id) return [];
        const native = this.document.getElementById(id);
        if (native?.getClientRects().length)
          return [{ id, top: native.getBoundingClientRect().top }];
        const offset = this.embeddedPositions.get(id);
        return offset === undefined ? [] : [{ id, top: frameTop + offset }];
      })
      .sort((a, b) => a.top - b.top);
    if (!sections.length) return;
    const passed = sections.filter((section) => section.top <= readingLine);
    let active = passed.at(-1) ?? sections[0];
    if (
      view.scrollY > 0 &&
      view.scrollY + view.innerHeight >= this.document.documentElement.scrollHeight - 2
    )
      active = sections.at(-1)!;
    // Scrolling must not create history entries, move focus, or navigate the frame.
    this.currentSection.set(`#${active.id}`);
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
    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    this.currentSection.set(new URL(this.linkHref(item.href), 'https://author.invalid').hash);
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
        this.document.defaultView?.history.pushState(
          null,
          '',
          url.pathname + url.search + url.hash,
        );
      this.embeddedSectionSelected.emit(url.hash);
      return;
    }
    event.preventDefault();
    this.document.defaultView?.history.pushState(null, '', url.pathname + url.search + url.hash);
    section.scrollIntoView();
  }
}
