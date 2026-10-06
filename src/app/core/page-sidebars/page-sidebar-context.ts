import { Directive, Injectable, OnDestroy, effect, inject, input, signal } from '@angular/core';

export interface SidebarRecall {
  id: string;
  prompt: string;
  answer: string;
}

export interface SidebarLessonLink {
  title: string;
  route: readonly string[];
  queryParams?: Record<string, string> | null;
}

/**
 * The lesson's place in the catalog, shown in the right sidebar as an outline (user review #5;
 * outline 2026-10-05): path, group, course, previous / current / next lesson, the next course, the
 * next group, and a search preset to the lesson's course and module.
 */
export interface SidebarLessonNav {
  /** Learn, Grow or Look Ahead. */
  path?: SidebarLessonLink;
  /** The catalog group the course is listed under, when there is one. */
  group?: SidebarLessonLink | null;
  /** The group after this one on the path page. */
  nextGroup?: SidebarLessonLink | null;
  /** True when the next course belongs to the next group (it is then shown inside that group). */
  nextCourseInNextGroup?: boolean;
  course: SidebarLessonLink;
  current: string;
  previous?: SidebarLessonLink | null;
  next?: SidebarLessonLink | null;
  nextCourse?: SidebarLessonLink | null;
  search: { path: string; course: string; module: string };
}

export interface PageSidebarContextValue {
  excluded: boolean;
  hideNavigation?: boolean;
  groupLabel?: string;
  recall?: readonly SidebarRecall[];
  lessonNav?: SidebarLessonNav;
  groups?: readonly { id: string; sectionId?: string; title: string; courses: readonly { id: string; title: string; url: string }[] }[];
  /**
   * Page-level option for wide working surfaces (the Hands-On DSA catalog): below this viewport width
   * the docked left navigation starts collapsed and the page takes its column (main gets
   * `data-sidebar-left-collapsed`; the page's own CSS decides how much). Opening it docks it again,
   * and the learner's choice is kept while they stay on the page, query changes included.
   */
  collapseLeftBelow?: number;
}

/** Transient view data only: no history, account mutation, storage, or content requests. */
@Injectable({ providedIn: 'root' })
export class PageSidebarContext {
  readonly value = signal<PageSidebarContextValue | null>(null);
  private owner: object | null = null;

  set(owner: object, value: PageSidebarContextValue): void {
    this.owner = owner;
    this.value.set(value);
  }

  clear(owner: object): void {
    if (this.owner !== owner) return;
    this.owner = null;
    this.value.set(null);
  }
}

@Directive({ selector: '[pageSidebarContext]' })
export class PageSidebarContextDirective implements OnDestroy {
  readonly pageSidebarContext = input.required<PageSidebarContextValue>();
  private readonly context = inject(PageSidebarContext);

  constructor() {
    effect(() => this.context.set(this, this.pageSidebarContext()));
  }

  ngOnDestroy(): void {
    this.context.clear(this);
  }
}
