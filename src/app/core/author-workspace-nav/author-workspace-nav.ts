import { DOCUMENT } from '@angular/common';
import {
  Component,
  ElementRef,
  afterRenderEffect,
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
import { AuthorWorkspacePageId } from './author-workspace-links';
import { SidebarToggle } from '../page-sidebars/sidebar-toggle';

export interface AuthorOutlineItem {
  label: string;
  href: string;
}

export type { AuthorWorkspacePageId };

let navigationInstance = 0;

/**
 * Left sidebar of every admin page: the page title and its "On this page" outline. Navigation
 * between admin pages lives in the right-hand AuthorAdminMenu.
 */
@Component({
  selector: 'app-author-workspace-nav',
  imports: [SidebarToggle],
  host: { '[class.sidebar-collapsed]': '!sidebarOpen()' },
  templateUrl: './author-workspace-nav.html',
  styleUrls: ['./author-workspace-nav.css', './sidebar-outline.css'],
})
export class AuthorWorkspaceNav implements OnChanges, AfterViewInit, OnDestroy {
  protected readonly sidebarOpen = signal(true);
  protected readonly sidebarContentId = `author-sidebar-content-${++navigationInstance}`;
  private readonly document = inject(DOCUMENT);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
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
  protected readonly currentSection = signal(this.document.defaultView?.location.hash ?? '');

  constructor() {
    afterRenderEffect(() => {
      this.currentSection();
      if (this.sidebarOpen()) this.revealCurrentOutlineItem();
    });
  }

  private revealCurrentOutlineItem(): void {
    const host = this.element.nativeElement;
    const active = host.querySelector<HTMLElement>('.heading-outline [aria-current="location"]');
    const view = this.document.defaultView;
    if (!active || !view) return;
    // Scroll only the sidebar's own scroll container, never its page or document frame.
    for (
      let container: HTMLElement | null = host;
      container && container !== this.document.body;
      container = container.parentElement
    ) {
      if (
        !/(auto|scroll)/.test(view.getComputedStyle(container).overflowY) ||
        container.scrollHeight <= container.clientHeight
      )
        continue;
      const bounds = container.getBoundingClientRect();
      const item = active.getBoundingClientRect();
      if (item.bottom <= item.top) return;
      const top = bounds.top + 8;
      const bottom = bounds.bottom - 8;
      if (item.top < top) container.scrollTop += item.top - top;
      else if (item.bottom > bottom) container.scrollTop += item.bottom - bottom;
      return;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
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
    if (data.type === 'lookahead:author-document:copy') {
      void this.copyForDocument(event.source as Window, data);
      return;
    }
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

  /**
   * The scripts-only document sandbox has no clipboard access, so its Copy buttons ask this page to
   * copy. The browser still requires the reader's click, which activates this page too.
   */
  private async copyForDocument(source: Window, data: { requestId?: unknown; text?: unknown }) {
    const { requestId, text } = data;
    if (!Number.isSafeInteger(requestId) || typeof text !== 'string' || text.length > 100_000) return;
    let copied = false;
    try {
      await this.document.defaultView?.navigator.clipboard.writeText(text);
      copied = !!this.document.defaultView;
    } catch {
      copied = false;
    }
    source.postMessage(
      { type: 'lookahead:author-document:copy-result', version: 1, requestId, copied },
      '*',
    );
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
