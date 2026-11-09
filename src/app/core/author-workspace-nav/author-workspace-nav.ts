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
import { AuthorDocumentationTabs } from './author-documentation-tabs';
import { isAuthorDocumentationPage, AuthorWorkspacePageId } from './author-workspace-links';

export interface AuthorOutlineItem {
  label: string;
  href: string;
}

export type { AuthorWorkspacePageId };

/**
 * Main-area page heading and persistent section navigation. Admin navigation lives in the left rail.
 */
@Component({
  selector: 'app-author-workspace-nav',
  imports: [AuthorDocumentationTabs],
  host: { '[class.section-tabs]': 'tabbed' },
  templateUrl: './author-workspace-nav.html',
  styleUrl: './author-workspace-nav.css',
})
export class AuthorWorkspaceNav implements OnChanges, AfterViewInit, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  @Input() tabbed = false;
  @Input() pageTitle = '';
  @Input() eyebrow = 'Admin';
  @Input() pageId: AuthorWorkspacePageId | null = null;
  protected readonly isDocumentationPage = isAuthorDocumentationPage;
  @Input() headingLevel: 1 | 2 = 1;
  @Input() outline: readonly AuthorOutlineItem[] = [];
  @Input() embeddedFrame?: HTMLIFrameElement;
  @Input() embeddedDocumentId = '';
  @Input() embeddedHeight: number | null = null;
  private embeddedPositions = new Map<string, number>();
  private pendingFrame: number | null = null;
  private outlineRequest = 0;
  protected readonly embeddedIntroduction = signal('');
  @Output() embeddedSectionSelected = new EventEmitter<string>();
  protected readonly currentSection = signal(this.document.defaultView?.location.hash ?? '');

  constructor() {
    afterRenderEffect(() => {
      this.currentSection();
      this.applyPanels();
      this.revealCurrentOutlineItem();
    });
  }

  private revealCurrentOutlineItem(): void {
    const host = this.element.nativeElement;
    const active = host.querySelector<HTMLElement>('.heading-outline [aria-current="location"]');
    const view = this.document.defaultView;
    if (!active || !view) return;
    if (this.tabbed) {
      const row = active.parentElement!;
      const bounds = row.getBoundingClientRect(), item = active.getBoundingClientRect();
      if (item.left < bounds.left) row.scrollLeft += item.left - bounds.left;
      if (item.right > bounds.right) row.scrollLeft += item.right - bounds.right;
      return;
    }
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
    if (changes['embeddedDocumentId']) this.embeddedIntroduction.set('');
    if (changes['embeddedFrame'] || changes['outline'] || changes['embeddedDocumentId'])
      this.embeddedPositions.clear();
    this.requestOutline();
    this.scheduleScrollUpdate();
  }

  ngAfterViewInit(): void {
    const root = this.element.nativeElement.closest('main');
    if (root && this.tabbed) {
      this.panelObserver = new MutationObserver(() => this.applyPanels());
      this.panelObserver.observe(root, { childList: true, subtree: true });
    }
    this.applyPanels();
    this.scheduleScrollUpdate();
  }

  ngOnDestroy(): void {
    this.panelObserver?.disconnect();
    for (const panel of this.managedPanels) {
      panel.hidden = false;
      panel.removeAttribute('inert');
    }
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
    if (this.tabbed && data.type === 'lookahead:author-document:introduction' && data.documentId === this.embeddedDocumentId && typeof data.text === 'string' && data.text.length <= 5000) {
      this.embeddedIntroduction.set(data.text);
      this.embeddedFrame.contentWindow?.postMessage({type:'lookahead:author-document:introduction-accepted',version:1,documentId:this.embeddedDocumentId}, '*');
      return;
    }
    if (this.tabbed && data.type === 'lookahead:author-document:tab-selected' && data.documentId === this.embeddedDocumentId && this.outline.some(item => this.sectionId(item) === data.anchor)) {
      const hash = `#${data.anchor}`;
      const fragmentMatches = typeof data.fragment === 'string' && /^[a-z0-9-]+$/.test(data.fragment) &&
        this.document.defaultView?.location.hash === `#${data.fragment}`;
      if (!fragmentMatches) this.document.defaultView?.history.pushState(null, '', hash);
      this.currentSection.set(hash);
      this.applyPanels();
      return;
    }
    if (this.tabbed && data.type === 'lookahead:author-document:tabs-ready' && data.documentId === this.embeddedDocumentId) {
      this.applyPanels();
      return;
    }
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
      if (this.tabbed && this.pendingPanelReveal) {
        this.document.defaultView?.requestAnimationFrame(() => {
          if (this.pendingPanelReveal) this.revealPanelStart();
        });
      }
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
    if (this.tabbed) return;
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

  private panelObserver?: MutationObserver;
  private pendingPanelReveal = false;
  private readonly managedPanels = new Set<HTMLElement>();

  private selectedItem(): AuthorOutlineItem | undefined {
    const direct = this.outline.find(item => `#${this.sectionId(item)}` === this.currentSection());
    if (direct) return direct;
    const hash = this.currentSection().slice(1);
    const target = this.document.getElementById(hash) ?? this.document.getElementById(`ticket-${hash}`);
    return this.outline.find(item => {
      const id = this.sectionId(item), section = id ? this.document.getElementById(id) : null;
      return !!target && !!section?.contains(target);
    }) ?? this.outline[0];
  }

  protected tabId(item: AuthorOutlineItem): string { return `workspace-tab-${this.sectionId(item)}`; }

  protected panelId(item: AuthorOutlineItem): string | null {
    const id = this.sectionId(item);
    if (!id) return null;
    const target = this.document.getElementById(id);
    return target ? `workspace-panel-${id}` : (this.embeddedFrame ? 'workspace-embedded-panel' : null);
  }

  private applyPanels(): void {
    if (!this.tabbed) return;
    const selected = this.selectedItem();
    if (!selected) return;
    const activeId = this.sectionId(selected);
    const root = this.element.nativeElement.closest('main');
    if (!root) return;
    for (const item of this.outline) {
      const id = this.sectionId(item);
      const target = id ? this.document.getElementById(id) : null;
      if (!target || !root.contains(target)) continue;
      let panel = target.matches('section, header, details') ? target : target.closest<HTMLElement>('section');
      if (!panel || panel.contains(this.element.nativeElement)) continue;
      // Keep the anchor intact for existing links while exposing a distinct tab panel ID.
      if (!panel.parentElement?.matches('[data-workspace-panel]')) {
        const wrapper = this.document.createElement('div');
        wrapper.dataset['workspacePanel'] = '';
        panel.before(wrapper);
        wrapper.append(panel);
      }
      panel = panel.parentElement!;
      panel.id = `workspace-panel-${id}`;
      this.setPanel(panel, id === activeId, this.tabId(item));
    }
    const embeddedPanel = this.embeddedFrame?.closest<HTMLElement>('section');
    if (embeddedPanel && root.contains(embeddedPanel)) {
      const native = activeId ? this.document.getElementById(activeId) : null;
      embeddedPanel.id = 'workspace-embedded-panel';
      this.setPanel(embeddedPanel, !native, this.tabId(selected));
      if (!native) this.embeddedFrame?.contentWindow?.postMessage({
        type: 'lookahead:author-document:tab-request', version: 1,
        documentId: this.embeddedDocumentId, anchor: activeId,
      }, '*');
    }
  }

  private setPanel(panel: HTMLElement, active: boolean, label: string): void {
    this.managedPanels.add(panel);
    panel.dataset['workspacePanel'] = '';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', label);
    panel.setAttribute('tabindex', '0');
    panel.hidden = !active;
    panel.toggleAttribute('inert', !active);
  }

  @HostListener('window:wheel')
  @HostListener('window:pointerdown')
  @HostListener('window:touchstart')
  @HostListener('window:keydown', ['$event'])
  protected cancelPanelReveal(event?: KeyboardEvent): void {
    if (event && !event.ctrlKey && !event.metaKey && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key) &&
        (event.target as Element | null)?.closest?.('[role="tab"]')) return;
    this.pendingPanelReveal = false;
  }

  private revealPanelStart(): void {
    const marker = this.element.nativeElement.querySelector('.tab-position');
    const view = this.document.defaultView;
    const headerBottom = this.document.querySelector('app-platform-header')?.getBoundingClientRect().bottom ?? 0;
    if (marker && view && marker.getBoundingClientRect().top < headerBottom)
      view.scrollTo({top: Math.max(0, marker.getBoundingClientRect().top + view.scrollY - headerBottom), behavior: 'instant'});
  }

  selectSection(id: string): void {
    if (!this.outline.some(item => this.sectionId(item) === id)) return;
    this.document.defaultView?.history.pushState(null, '', `#${id}`);
    this.currentSection.set(`#${id}`);
    this.pendingPanelReveal = !!this.embeddedFrame;
    this.applyPanels();
    this.revealPanelStart();
  }

  protected onTabKey(event: KeyboardEvent, item: AuthorOutlineItem): void {
    if (event.altKey || event.ctrlKey || event.metaKey || !this.tabbed || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = this.outline.indexOf(item);
    const rtl = this.document.defaultView?.getComputedStyle(this.element.nativeElement).direction === 'rtl';
    const step = (event.key === 'ArrowRight' ? 1 : -1) * (rtl ? -1 : 1);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? this.outline.length - 1 : (index + step + this.outline.length) % this.outline.length;
    const link = this.element.nativeElement.querySelectorAll<HTMLAnchorElement>('[role="tab"]')[next];
    link?.click();
    link?.focus({ preventScroll: true });
  }

  protected sectionIsCurrent(item: AuthorOutlineItem): boolean {
    if (this.tabbed) return item === this.selectedItem();
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
    this.applyPanels();
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
    if (this.tabbed) {
      event.preventDefault();
      if (location.hash !== url.hash)
        this.document.defaultView?.history.pushState(null, '', url.pathname + url.search + url.hash);
      this.pendingPanelReveal = !!this.embeddedFrame;
      this.applyPanels();
      this.revealPanelStart();
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
