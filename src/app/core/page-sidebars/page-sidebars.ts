import { PlatformSignature } from '../platform-signature/platform-signature';
import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  Component,
  DestroyRef,
  HostListener,
  NgZone,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { PageSidebarContext } from './page-sidebar-context';
import { SidebarToggle } from './sidebar-toggle';

export interface PageSectionLink {
  id: string;
  label: string;
  target: HTMLElement;
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
  const candidates = main.querySelectorAll<HTMLElement>('h1, h2, [data-sidebar-label]');
  for (const element of candidates) {
    if (!visibleSidebarTarget(element)) continue;
    const label = (element.dataset['sidebarLabel'] || element.textContent || '')
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
    links.push({ id: target.id, label: element.tagName === 'H1' ? 'Overview' : label, target });
  }
  return links;
}

export function canDockSidebar(space: number, width = 224): boolean {
  return space >= width + 24;
}

@Component({
  selector: 'app-page-sidebars',
  imports: [PlatformSignature, SidebarToggle],
  templateUrl: './page-sidebars.html',
  styleUrl: './page-sidebars.css',
})
export class PageSidebars implements AfterViewInit, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  protected readonly context = inject(PageSidebarContext);
  protected readonly sections = signal<PageSectionLink[]>([]);
  protected readonly support = signal<PageSectionLink[]>([]);
  protected readonly title = signal('');
  protected readonly homepage = signal(false);
  protected readonly enabled = signal(false);
  protected readonly authorNavigation = signal(false);
  protected readonly leftOpen = signal(false);
  protected readonly rightOpen = signal(false);
  protected readonly leftDocked = signal(false);
  protected readonly rightDocked = signal(false);
  protected readonly headerBottom = signal(76);
  protected readonly currentId = signal('');
  protected readonly recallIndex = signal(0);
  protected readonly answerOpen = signal(false);
  protected readonly recall = computed(() => this.context.value()?.recall ?? []);
  protected readonly currentRecall = computed(
    () => this.recall()[this.recallIndex()] ?? this.recall()[0],
  );
  protected readonly showLeft = computed(
    () => this.enabled() && !this.authorNavigation() && this.sections().length > 0,
  );
  protected readonly showRight = computed(
    () =>
      this.enabled() && !this.homepage() && (this.support().length > 0 || this.recall().length > 0),
  );
  protected readonly overlay = computed(
    () => (this.leftOpen() && !this.leftDocked()) || (this.rightOpen() && !this.rightDocked()),
  );
  private main: HTMLElement | null = null;
  private observer?: MutationObserver;
  private resizeObserver?: ResizeObserver;
  private frame: number | null = null;
  private needsInventory = true;
  private initialized = false;
  private leftChosen = false;
  private rightChosen = false;
  private returnFocus: HTMLElement | null = null;
  private inertPage: HTMLElement | null = null;
  private pageWasInert = false;
  private clearanceMain: HTMLElement | null = null;

  constructor() {
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (!(event instanceof NavigationEnd)) return;
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
    effect(() => this.setPageInert(this.overlay()));
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
    this.setPageInert(false);
    this.clearEdgeClearance();
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

  private setPageInert(inert: boolean): void {
    if (this.inertPage) {
      this.inertPage.toggleAttribute('inert', this.pageWasInert);
      this.inertPage = null;
    }
    if (!inert) return;
    let page = this.main;
    while (page?.parentElement && page.parentElement.tagName !== 'APP-ROOT')
      page = page.parentElement;
    if (!page || page === this.document.body || page === this.document.documentElement) return;
    this.pageWasInert = page.hasAttribute('inert');
    this.inertPage = page;
    page.setAttribute('inert', '');
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
    this.enabled.set(!excluded);
    if (excluded || !main) {
      this.clearEdgeClearance();
      this.leftOpen.set(false);
      this.rightOpen.set(false);
      this.sections.set([]);
      this.support.set([]);
      return;
    }
    this.homepage.set(main.classList.contains('landing-page'));
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
      this.title.set(
        main.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() ?? 'This page',
      );
    }
    const header = this.document.querySelector('app-platform-header')?.getBoundingClientRect();
    const top = Math.max(0, header?.bottom ?? 76) + 8;
    this.headerBottom.set(top);
    const bounds = main.getBoundingClientRect();
    const width =
      this.document.documentElement.clientWidth || this.document.defaultView!.innerWidth;
    this.updateEdgeClearance(
      main,
      !this.authorNavigation() &&
        ((this.showLeft() && bounds.left < 54) || (this.showRight() && width - bounds.right < 54)),
    );
    const leftDocked = canDockSidebar(bounds.left);
    const rightDocked = canDockSidebar(width - bounds.right);
    if (this.leftDocked() && !leftDocked) this.close('left', true);
    if (this.rightDocked() && !rightDocked) this.close('right', true);
    this.leftDocked.set(leftDocked);
    this.rightDocked.set(rightDocked);
    if (!this.leftChosen) this.leftOpen.set(leftDocked);
    if (!this.rightChosen) this.rightOpen.set(rightDocked);
    const visible = this.sections().filter((section) => visibleSidebarTarget(section.target));
    const passed = visible.filter(
      (section) => section.target.getBoundingClientRect().top <= top + 24,
    );
    this.currentId.set((passed.at(-1) ?? visible[0])?.id ?? '');
  }

  protected toggle(side: 'left' | 'right', event: Event): void {
    const open = side === 'left' ? this.leftOpen : this.rightOpen;
    if (side === 'left') this.leftChosen = true;
    else this.rightChosen = true;
    if (open()) {
      this.close(side);
      return;
    }
    const docked = side === 'left' ? this.leftDocked() : this.rightDocked();
    if (!docked) {
      this.close(side === 'left' ? 'right' : 'left');
      this.returnFocus =
        (event.currentTarget as HTMLElement)?.closest('button') ?? (event.target as HTMLElement);
    }
    open.set(true);
  }

  protected close(side: 'left' | 'right', restore = false): void {
    const panel = this.document.getElementById(`page-sidebar-${side}`);
    const focusInside = !!panel?.contains(this.document.activeElement);
    (side === 'left' ? this.leftOpen : this.rightOpen).set(false);
    if (restore && focusInside)
      panel?.querySelector<HTMLButtonElement>('app-sidebar-toggle button')?.focus();
  }

  @HostListener('document:keydown.escape')
  protected closeOverlay(): void {
    if (!this.overlay()) return;
    if (!this.leftDocked()) {
      this.leftChosen = true;
      this.close('left');
    }
    if (!this.rightDocked()) {
      this.rightChosen = true;
      this.close('right');
    }
    this.returnFocus?.focus();
  }

  @HostListener('document:keydown', ['$event'])
  protected containOverlayFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.overlay()) return;
    const side = this.leftOpen() && !this.leftDocked() ? 'left' : 'right';
    const panel = this.document.getElementById(`page-sidebar-${side}`);
    const controls = Array.from(
      panel?.querySelectorAll<HTMLElement>('button, a[href], summary') ?? [],
    ).filter((control) => !control.closest('[hidden], [inert]'));
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (
      event.shiftKey &&
      (this.document.activeElement === first || !panel?.contains(this.document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (this.document.activeElement === last || !panel?.contains(this.document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
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
    if (!this.leftDocked()) {
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
    view.scrollBy({
      top: section.target.getBoundingClientRect().top - this.headerBottom() - 12,
      behavior: 'instant',
    });
    this.currentId.set(section.id);
  }

  protected nextRecall(): void {
    this.recallIndex.update((index) => (index + 1) % this.recall().length);
    this.answerOpen.set(false);
  }
}
