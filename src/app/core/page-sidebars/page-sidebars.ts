import { LearningPrompt } from '../platform-signature/learning-prompt';
import { ReasoningPrompt } from '../platform-signature/reasoning-prompt';
import { PlatformSignature } from '../platform-signature/platform-signature';
import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, RouterLink, Router } from '@angular/router';
import { PageSidebarContext } from './page-sidebar-context';
import { SidebarToggle } from './sidebar-toggle';

export interface PageSectionLink {
  id: string;
  label: string;
  target: HTMLElement;
  /** DLV-408: a lesson stage heading (Brief … Keep) that groups the links after it. */
  level?: 'stage';
  /** The stage this link belongs to, from the nearest [data-sidebar-stage]. */
  group?: string;
}

/** Only rendered page content can become navigation. Hidden dialogs and cards are not an outline. */
export function visibleSidebarTarget(element: HTMLElement): boolean {
  if (
    element.closest(
      '[hidden], [aria-hidden="true"], dialog:not([open]), [role="dialog"], app-author-workspace-nav, app-page-sidebars, .hero-slide, a, button',
    )
  )
    return false;
  const inertAncestor = element.closest('[inert]');
  if (inertAncestor && element.closest('main')?.contains(inertAncestor)) return false;
  const closedDetails = element.closest('details:not([open])');
  if (closedDetails && closedDetails !== element && !element.closest('summary')) return false;
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
    const style = view.getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

export function collectPageSections(main: HTMLElement): PageSectionLink[] {
  const links: PageSectionLink[] = [];
  const seen = new Set<string>();
  let titleLink: PageSectionLink | null = null;
  const candidates = main.querySelectorAll<HTMLElement>('h1, h2, [data-sidebar-label]');
  for (const element of candidates) {
    if (!visibleSidebarTarget(element)) continue;
    const label = (element.dataset['sidebarLabel'] || element.querySelector('.result-title-text')?.textContent || element.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!label || seen.has(label)) continue;
    // Explicit section identities and authored heading IDs always win.
    const parentSection = element.closest<HTMLElement>('section[id], details[id], article[id]');
    const target = element.id ? element : (parentSection ?? element);
    if (!target.id) {
      const slug =
        label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'section';
      const base = `page-section-${slug}`;
      let id = base;
      let suffix = 2;
      while (main.ownerDocument.getElementById(id)) id = `${base}-${suffix++}`;
      target.id = id;
    }
    if (links.some((link) => link.id === target.id)) continue;
    seen.add(label);
    const level = element.dataset['sidebarLevel'] === 'stage' ? ('stage' as const) : undefined;
    const group = element.closest<HTMLElement>('[data-sidebar-stage]')?.dataset['sidebarStage'];
    const link: PageSectionLink = {
      id: target.id,
      label: element.tagName === 'H1' ? 'Overview' : label,
      target,
      ...(level ? { level } : {}),
      ...(group ? { group } : {}),
    };
    if (element.tagName === 'H1') titleLink ??= link;
    links.push(link);
  }
  // A lesson with its own Overview stage does not need a second "Overview" link for the title.
  const overviewStage = links.some((link) => link.level === 'stage' && link.label === 'Overview');
  return overviewStage ? links.filter((link) => link !== titleLink) : links;
}

/** The sidebar heading: an authored short title (data-sidebar-title) or the page's h1 text. */
export function sidebarPageTitle(main: HTMLElement): string {
  const heading = main.querySelector<HTMLElement>('h1');
  const short = heading?.dataset['sidebarTitle']?.replace(/\s+/g, ' ').trim();
  return short || heading?.textContent?.replace(/\s+/g, ' ').trim() || 'This page';
}

/** Which Practice & review icon a practice link gets, from its label. */
export function practiceIcon(label: string): string {
  if (/revision|cheat sheet/i.test(label)) return 'revision';
  if (/understanding|quick check/i.test(label)) return 'check';
  if (/practice|exercise|try it/i.test(label)) return 'practice';
  if (/interview|follow-ups/i.test(label)) return 'interview';
  return 'section';
}

export function canDockSidebar(space: number, width = 224): boolean {
  // Browser zoom can round a reserved gutter down by a fraction of a CSS pixel.
  return space + 0.5 >= width + 24;
}

@Component({
  selector: 'app-page-sidebars',
  imports: [NgTemplateOutlet, RouterLink, LearningPrompt, PlatformSignature, ReasoningPrompt, SidebarToggle],
  templateUrl: './page-sidebars.html',
  styleUrls: ['./page-sidebars.css', '../author-workspace-nav/sidebar-outline.css'],
})
export class PageSidebars implements AfterViewInit, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  protected readonly context = inject(PageSidebarContext);
  protected readonly sections = signal<PageSectionLink[]>([]);
  /** Stage-grouped pages show every stage but only the current stage's sections. */
  protected readonly outline = computed(() => {
    const links = this.sections();
    if (!links.some((link) => link.level === 'stage')) return links;
    const current = links.find((link) => link.id === this.currentId());
    const active = current?.group ?? links.find((link) => link.level === 'stage')?.group;
    return links.filter((link) => link.level === 'stage' || !link.group || link.group === active);
  });
  protected readonly support = signal<PageSectionLink[]>([]);
  protected readonly catalogGroups = computed(() => this.context.value()?.groups ?? []);
  protected readonly expandedGroups = signal<ReadonlySet<string>>(new Set());
  protected toggleGroup(id: string, event: MouseEvent): void {
    const wasExpanded = this.expandedGroups().has(id);
    this.expandedGroups.update((ids) => {
      const next = new Set(ids);
      if (wasExpanded) next.delete(id); else next.add(id);
      return next;
    });
    if (wasExpanded) {
      const group = this.catalogGroups().find((item) => item.id === id);
      const section = this.sections().find((item) => item.id === group?.sectionId);
      if (section) this.follow(event, section);
    }
  }
  protected readonly title = signal('');
  protected readonly homepage = signal(false);
  protected readonly learningPage = signal(false);
  protected readonly enabled = signal(false);
  protected readonly navigationExcluded = signal(false);
  protected readonly authorNavigation = signal(false);
  protected readonly leftOpen = signal(false);
  protected readonly rightOpen = signal(false);
  /** Room the sidebars leave at the bottom of the window for a corner statement. */
  protected readonly cornerReserve = 96;
  protected readonly leftDocked = signal(false);
  protected readonly rightDocked = signal(false);
  protected readonly headerBottom = signal(76);
  protected readonly leftWidth = signal(224);
  protected readonly rightWidth = signal(224);
  protected readonly leftInset = signal(6);
  protected readonly rightInset = signal(6);
  protected readonly currentId = signal('');
  /** The content column (viewport px) that an in-flow signature strip lines up with. */
  protected readonly signatureColumn = signal<{ left: number; width: number } | null>(null);
  protected readonly catalogOverviewActive = computed(() =>
    this.catalogGroups().length > 0 &&
    !this.catalogGroups().some((group) => group.sectionId === this.currentId()),
  );
  protected readonly recallIndex = signal(0);
  protected readonly answerOpen = signal(false);
  protected readonly recall = computed(() => this.context.value()?.recall ?? []);
  protected readonly currentRecall = computed(
    () => this.recall()[this.recallIndex()] ?? this.recall()[0],
  );
  protected readonly showLeft = computed(
    () => this.enabled() && !this.navigationExcluded() && !this.authorNavigation() && this.sections().length > 0,
  );
  protected readonly lessonNav = computed(() => this.context.value()?.lessonNav ?? null);
  /**
   * Practice & review rows (user review, 2026-10-05): the page's practice links with an icon each, and
   * Quick recall (a dialog, no section) right after Quick revision, or first when there is no revision.
   */
  protected readonly practiceRows = computed(() => {
    const rows: { key: string; label: string; icon: string; section: PageSectionLink | null }[] =
      this.support().map((section) => ({ key: section.id, label: section.label, icon: practiceIcon(section.label), section }));
    if (this.recall().length) {
      const revision = rows.findIndex((row) => row.icon === 'revision');
      rows.splice(revision + 1, 0, { key: 'quick-recall', label: 'Quick recall', icon: 'recall', section: null });
    }
    return rows;
  });
  private readonly recallDialog = viewChild<ElementRef<HTMLDialogElement>>('recallDialog');
  private readonly recallOpener = viewChild<ElementRef<HTMLButtonElement>>('recallOpener');
  private readonly recallQuestion = viewChild<ElementRef<HTMLElement>>('recallQuestion');
  protected readonly hasRightContent = computed(
    () => this.support().length > 0 || this.recall().length > 0 || !!this.lessonNav(),
  );
  protected readonly showRight = computed(
    () =>
      this.enabled() &&
      !this.navigationExcluded() &&
      !this.homepage() &&
      (this.learningPage() ||
        this.support().length > 0 ||
        this.recall().length > 0 ||
        !!this.lessonNav()),
  );

  /** Opens search with the lesson's course and module already selected. */
  protected searchLesson(event: Event, query: string): void {
    event.preventDefault();
    const nav = this.lessonNav();
    if (!nav) return;
    const q = query.trim();
    void this.router.navigate(['/search'], {
      queryParams: { ...(q ? { q } : {}), ...nav.search },
    });
  }
  protected readonly overlay = computed(
    () => (!this.homepage() && this.leftOpen() && !this.leftDocked()) || (this.rightOpen() && !this.rightDocked()),
  );
  private main: HTMLElement | null = null;
  private observer?: MutationObserver;
  private resizeObserver?: ResizeObserver;
  private frame: number | null = null;
  private needsInventory = true;
  private initialized = false;
  private leftChosen = false;
  private rightChosen = false;
  /**
   * The page asked for a collapsed left navigation at this width (context collapseLeftBelow), and the
   * panel would dock if it got its column back.
   */
  private leftReclaimable = false;
  /** On such a page, the learner's last open/close choice; kept across query-only navigation. */
  private leftMemory: { path: string; open: boolean } | null = null;
  private reflowing = false;
  private returnFocus: HTMLElement | null = null;
  private clearanceMain: HTMLElement | null = null;

  constructor() {
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (!(event instanceof NavigationEnd)) return;
      if (this.leftMemory && this.leftMemory.path !== this.document.location.pathname) this.leftMemory = null;
      this.expandedGroups.set(new Set());
      this.leftChosen = this.rightChosen = false;
      this.leftOpen.set(false);
      this.rightOpen.set(false);
      this.recallIndex.set(0);
      this.answerOpen.set(false);
      this.schedule(true);
    });
    effect(() => {
      this.context.value();
      this.recallIndex.set(0);
      this.answerOpen.set(false);
      this.schedule(true);
    });
  }

  ngAfterViewInit(): void {
    this.initialized = true;
    const view = this.document.defaultView;
    if (!view) return;
    this.zone.runOutsideAngular(() => {
      this.observer = new view.MutationObserver((records) => {
        if (
          records.some((record) => {
            const target =
              record.target instanceof view.Element ? record.target : record.target.parentElement;
            return !target?.closest('app-page-sidebars, app-platform-header');
          })
        )
          this.schedule(true);
      });
      const root = this.document.querySelector('app-root');
      if (root)
        this.observer.observe(root, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['hidden', 'open', 'aria-hidden', 'class'],
        });
      if (typeof view.ResizeObserver === 'function')
        this.resizeObserver = new view.ResizeObserver(() => this.schedule());
    });
    this.schedule(true);
  }

  ngOnDestroy(): void {
    this.clearEdgeClearance();
    this.main?.removeAttribute('data-sidebar-columns');
    this.main?.removeAttribute('data-sidebar-nav-shown');
    this.main?.removeAttribute('data-sidebar-left-collapsed');
    this.observer?.disconnect();
    this.resizeObserver?.disconnect();
    if (this.frame !== null) this.document.defaultView?.cancelAnimationFrame(this.frame);
  }

  private clearEdgeClearance(): void {
    this.clearanceMain?.removeAttribute('data-sidebar-edge-controls');
    this.clearanceMain?.style.removeProperty('--sidebar-original-padding-top');
    this.clearanceMain = null;
  }

  private updateEdgeClearance(main: HTMLElement, needed: boolean): void {
    if (!needed) {
      this.clearEdgeClearance();
      return;
    }
    if (this.clearanceMain === main) return;
    this.clearEdgeClearance();
    const padding = this.document.defaultView?.getComputedStyle(main).paddingTop ?? '0px';
    main.style.setProperty('--sidebar-original-padding-top', padding);
    main.setAttribute('data-sidebar-edge-controls', '');
    this.clearanceMain = main;
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  protected schedule(inventory = false): void {
    this.needsInventory ||= inventory;
    if (!this.initialized || this.frame !== null) return;
    const view = this.document.defaultView;
    if (!view) return;
    this.frame = view.requestAnimationFrame(() => {
      this.frame = null;
      this.zone.run(() => this.refresh());
    });
  }

  private refresh(): void {
    const main = this.document.querySelector<HTMLElement>('main#main-content');
    if (main !== this.main) {
      this.main?.removeAttribute('data-sidebar-columns');
      this.main?.removeAttribute('data-sidebar-nav-shown');
      this.main?.removeAttribute('data-sidebar-left-collapsed');
      this.resizeObserver?.disconnect();
      this.main = main;
      if (main) this.resizeObserver?.observe(main);
      const header = this.document.querySelector('app-platform-header');
      if (header) this.resizeObserver?.observe(header);
      this.needsInventory = true;
    }
    const excluded =
      !main ||
      this.context.value()?.excluded ||
      main.matches('.focus-studio-page, .studio-pilot-page') ||
      !!main.querySelector('app-coding-problem-detail, app-dsa-problem-pilot');
    this.navigationExcluded.set(!!this.context.value()?.hideNavigation || !!main?.matches('.course-page, .search-page, .account-page, .challenge-page'));
    this.enabled.set(!excluded);
    if (excluded || !main) {
      main?.removeAttribute('data-sidebar-columns');
      main?.removeAttribute('data-sidebar-nav-shown');
      main?.removeAttribute('data-sidebar-left-collapsed');
      this.leftReclaimable = false;
      this.clearEdgeClearance();
      this.signatureColumn.set(null);
      this.leftOpen.set(false);
      this.rightOpen.set(false);
      this.sections.set([]);
      this.support.set([]);
      return;
    }
    this.homepage.set(main.classList.contains('landing-page'));
    this.learningPage.set(/^\/(learn|grow|look-ahead)(\/|$)/.test(this.document.location.pathname));
    if (this.needsInventory) {
      this.needsInventory = false;
      this.authorNavigation.set(!!main.querySelector('app-author-workspace-nav'));
      const sections = collectPageSections(main).filter(
        (section) => !this.homepage() || section.label !== 'Overview',
      );
      this.sections.set(sections);
      this.support.set(
        sections.filter(
          (section) =>
            section.target.hasAttribute('data-sidebar-support') ||
            /\b(practice|recall|exercise|understanding|quick check|follow-ups)\b/i.test(
              section.label,
            ),
        ),
      );
      this.title.set(sidebarPageTitle(main));
    }
    const header = this.document.querySelector('app-platform-header')?.getBoundingClientRect();
    const top = Math.max(0, header?.bottom ?? 76) + 8;
    this.headerBottom.set(top);
    // Reserve desktop columns before measuring; panels must never cover the reader.
    main.toggleAttribute('data-sidebar-columns', !this.authorNavigation() && (this.showLeft() || this.showRight()));
    // The main container owns its padding on catalogs, courses and lessons alike.
    const reader = main.querySelector<HTMLElement>(':scope > .question-reader, :scope > .page-message, :scope > .search-shell');
    const outerBounds = main.getBoundingClientRect();
    const readerBounds = reader?.getBoundingClientRect();
    const width =
      this.document.documentElement.clientWidth || this.document.defaultView!.innerWidth;
    // Some reader shells span the viewport; use their centered reader gutter instead.
    const bounds = readerBounds && outerBounds.left < 54 && width - outerBounds.right < 54
      ? { left: Math.max(0, readerBounds.left - 24), right: Math.min(width, readerBounds.right + 24) }
      : outerBounds;
    this.updateEdgeClearance(
      main,
      !this.authorNavigation() &&
        ((this.showLeft() && bounds.left < 54) || (this.showRight() && width - bounds.right < 54)),
    );
    const column =
      main.querySelector<HTMLElement>('[data-signature-column]') ?? reader ?? main;
    const columnBounds = column.getBoundingClientRect();
    // When the page itself is the column, line up with its content, not its padding edge: on a
    // full-width page (Manage account below 1280px, user review 2026-10-03) the padding edge is
    // the window edge, and the statements would sit cut off against it.
    const columnStyle =
      column === main ? this.document.defaultView!.getComputedStyle(main) : null;
    const paddingLeft = parseFloat(columnStyle?.paddingLeft ?? '') || 0;
    const paddingRight = parseFloat(columnStyle?.paddingRight ?? '') || 0;
    const columnWidth = columnBounds.width - paddingLeft - paddingRight;
    this.signatureColumn.set(
      columnWidth > 0
        ? {
            left: Math.max(0, Math.round(columnBounds.left + paddingLeft)),
            width: Math.round(columnWidth),
          }
        : null,
    );
    const rtl = this.document.defaultView!.getComputedStyle(main).direction === 'rtl';
    const startSpace = rtl ? width - bounds.right : bounds.left;
    const endSpace = rtl ? bounds.left : width - bounds.right;
    this.leftInset.set(6);
    this.rightInset.set(6);
    const leftDocked = canDockSidebar(startSpace);
    const rightDocked = canDockSidebar(endSpace);
    // A page can ask for its left column below a width (collapseLeftBelow). While the page holds
    // that column, the gutter the panel would get back mirrors the end gutter, which the page
    // reserves the same way.
    const reclaimed = main.hasAttribute('data-sidebar-left-collapsed');
    const collapseBelow = this.context.value()?.collapseLeftBelow ?? 0;
    this.leftReclaimable =
      collapseBelow > 0 &&
      width < collapseBelow &&
      this.showLeft() &&
      !this.homepage() &&
      canDockSidebar(reclaimed ? endSpace : startSpace);
    // A resize must never carry an expanded desktop panel over the reader. Handing the column to
    // the page is not a resize: the learner's choice stays.
    if (this.leftDocked() && !leftDocked && !reclaimed) {
      this.close('left', true);
      this.leftChosen = false;
    }
    if (this.rightDocked() && !rightDocked) {
      this.close('right', true);
      this.rightChosen = false;
    }
    this.leftWidth.set(leftDocked ? startSpace - 6 : Math.min(280, width - 24));
    this.rightWidth.set(rightDocked ? endSpace - 6 : Math.min(280, width - 24));
    this.leftDocked.set(leftDocked);
    this.rightDocked.set(rightDocked);
    const remembered =
      this.leftMemory?.path === this.document.location.pathname && collapseBelow > 0
        ? this.leftMemory.open
        : null;
    if (this.homepage()) this.leftOpen.set(true);
    else if (!this.leftChosen && remembered !== null)
      this.leftOpen.set(remembered && (leftDocked || this.leftReclaimable));
    else if (!this.leftChosen) this.leftOpen.set(leftDocked && !this.leftReclaimable);
    // Handing the column over (or back) moves the page; measure again before anything paints.
    if (this.syncNavShown() && !this.reflowing) {
      this.reflowing = true;
      try {
        this.refresh();
      } finally {
        this.reflowing = false;
      }
      return;
    }
    if (!this.rightChosen) this.rightOpen.set(rightDocked);
    const visible = this.sections().filter((section) => visibleSidebarTarget(section.target));
    // Track the reading area below both the platform header and sticky lesson tools.
    // A section already occupying that area must not leave the previous item selected.
    const stickyBottom = Array.from(main.querySelectorAll<HTMLElement>(
      '.reader-sticky-stack, .question-sticky-utility, .catalog-sticky-utility, .module-sticky-utility',
    )).reduce((bottom, element) => {
      const rect = element.getBoundingClientRect();
      return rect.top <= top + 24 && rect.bottom > 0 ? Math.max(bottom, rect.bottom) : bottom;
    }, top);
    const readingLine = stickyBottom + Math.min(160, this.document.defaultView!.innerHeight * 0.2);
    const passed = visible.filter(
      (section) => section.target.getBoundingClientRect().top <= readingLine,
    );
    const view = this.document.defaultView!;
    const atBottom = view.scrollY > 0 &&
      view.scrollY + view.innerHeight >= this.document.documentElement.scrollHeight - 2;
    this.currentId.set((atBottom ? visible.at(-1) : passed.at(-1) ?? visible[0])?.id ?? '');
  }

  /**
   * Marks the page while the docked left navigation is open, so the page can drop in-page
   * shortcuts that repeat it (the catalog's "Jump to" row, user review 2026-10-03). An overlay
   * panel doesn't count: it stays closed until the reader asks for it.
   */
  private syncNavShown(): boolean {
    const main = this.main;
    main?.toggleAttribute(
      'data-sidebar-nav-shown',
      this.showLeft() && this.leftDocked() && this.leftOpen() && !this.homepage(),
    );
    // A page with collapseLeftBelow takes the left column while the navigation is closed there.
    const collapse = this.leftReclaimable && !this.leftOpen();
    if (!main || main.hasAttribute('data-sidebar-left-collapsed') === collapse) return false;
    main.toggleAttribute('data-sidebar-left-collapsed', collapse);
    // Opened, the panel gets its column back and docks there instead of covering the page.
    if (!collapse && this.leftOpen() && this.leftReclaimable) this.leftDocked.set(true);
    this.schedule();
    return true;
  }

  protected toggle(side: 'left' | 'right', event: Event): void {
    const open = side === 'left' ? this.leftOpen : this.rightOpen;
    if (side === 'left') this.leftChosen = true;
    else this.rightChosen = true;
    if (side === 'left' && this.context.value()?.collapseLeftBelow)
      this.leftMemory = { path: this.document.location.pathname, open: !open() };
    if (open()) {
      this.close(side);
      return;
    }
    const docked =
      side === 'left' ? this.leftDocked() || this.leftReclaimable : this.rightDocked();
    if (!docked) {
      const other = side === 'left' ? 'right' : 'left';
      this.close(other);
      if (other === 'left') this.leftChosen = true;
      else this.rightChosen = true;
      this.returnFocus =
        (event.currentTarget as HTMLElement)?.closest('button') ?? (event.target as HTMLElement);
    }
    open.set(true);
    this.syncNavShown();
  }

  protected close(side: 'left' | 'right', restore = false): void {
    const panel = this.document.getElementById(`page-sidebar-${side}`);
    const focusInside = !!panel?.contains(this.document.activeElement);
    (side === 'left' ? this.leftOpen : this.rightOpen).set(false);
    this.syncNavShown();
    if (restore && focusInside)
      panel?.querySelector<HTMLButtonElement>('app-sidebar-toggle button')?.focus();
  }

  @HostListener('document:keydown.escape')
  protected closeOverlay(): void {
    if (!this.overlay()) return;
    const focusInSidebar = !!(this.document.activeElement as HTMLElement | null)?.closest(
      'app-page-sidebars',
    );
    if (!this.leftDocked() && !this.homepage()) {
      this.leftChosen = true;
      this.close('left');
    }
    if (!this.rightDocked()) {
      this.rightChosen = true;
      this.close('right');
    }
    if (focusInSidebar) this.returnFocus?.focus();
  }

  protected href(section: PageSectionLink): string {
    const location = this.document.location;
    return `${location.pathname}${location.search}#${encodeURIComponent(section.id)}`;
  }

  protected follow(event: MouseEvent, section: PageSectionLink): void {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    for (
      let ancestor: HTMLElement | null = section.target;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      if (ancestor.tagName === 'DETAILS') (ancestor as HTMLDetailsElement).open = true;
    }
    const view = this.document.defaultView;
    if (!view) return;
    view.history.pushState(view.history.state, '', this.href(section));
    if (!this.leftDocked() && !this.leftReclaimable && !this.homepage()) {
      this.leftChosen = true;
      this.close('left');
    }
    if (!this.rightDocked()) {
      this.rightChosen = true;
      this.close('right');
    }
    if (!section.target.hasAttribute('tabindex')) {
      section.target.setAttribute('tabindex', '-1');
      section.target.addEventListener('blur', () => section.target.removeAttribute('tabindex'), {
        once: true,
      });
    }
    section.target.focus({ preventScroll: true });
    const stickyHeight = Math.max(0, ...Array.from(this.main?.querySelectorAll<HTMLElement>(
      '.reader-sticky-stack, .question-sticky-utility, .catalog-sticky-utility, .module-sticky-utility',
    ) ?? []).map((element) => element.getBoundingClientRect().height));
    // Heading IDs remain the accessible fragment, but reveal their complete card.
    const scrollTarget = section.target.matches('h2')
      ? section.target.closest<HTMLElement>('section') ?? section.target
      : section.target;
    const authoredMargin = parseFloat(view.getComputedStyle(scrollTarget).scrollMarginTop) || 0;
    const clearance = Math.max(authoredMargin, this.headerBottom() + stickyHeight + 12);
    view.scrollBy({
      top: scrollTarget.getBoundingClientRect().top - clearance,
      behavior: 'instant',
    });
    this.currentId.set(section.id);
  }

  protected nextRecall(): void {
    this.recallIndex.update((index) => (index + 1) % this.recall().length);
    this.answerOpen.set(false);
    this.recallQuestion()?.nativeElement.focus();
  }

  /**
   * Opens Quick recall at the question the learner left it on. An overlay sidebar closes first so a panel
   * and a dialog never stack. Nothing here records progress.
   */
  protected openRecall(): void {
    const dialog = this.recallDialog()?.nativeElement;
    if (!dialog) return;
    if (!this.rightDocked()) {
      this.rightChosen = true;
      this.close('right');
    }
    this.answerOpen.set(false);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    this.recallQuestion()?.nativeElement.focus();
  }

  protected closeRecall(): void {
    const dialog = this.recallDialog()?.nativeElement;
    if (!dialog?.hasAttribute('open')) return;
    if (typeof dialog.close === 'function') dialog.close();
    else {
      dialog.removeAttribute('open');
      this.recallClosed();
    }
  }

  /** After Close recall, Escape or a backdrop click: focus returns to a visible control. */
  protected recallClosed(): void {
    const opener = this.recallOpener()?.nativeElement;
    const visible = opener && !opener.closest('[hidden]') ? opener : null;
    (visible ?? this.document.querySelector<HTMLElement>('#page-sidebar-right app-sidebar-toggle button'))?.focus();
  }

  @HostListener('click', ['$event'])
  protected backdropClick(event: MouseEvent): void {
    const dialog = this.recallDialog()?.nativeElement;
    if (dialog?.hasAttribute('open') && event.target === dialog) this.closeRecall();
  }
}
