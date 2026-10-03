import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

/** One lesson row in the course side nav, in course order. */
export interface CourseLessonNavItem {
  /** Unique within the course; matches the card the row stands for. */
  key: string;
  /** The unit title from the content record, shown whole (it wraps, never truncates). */
  title: string;
  /** Two-digit course position, or null for units outside the numbered sequence. */
  order: string | null;
  route: string[];
  queryParams: Record<string, string> | null;
  /** Planned units stay listed but are not links. */
  planned: boolean;
  /** A family's sub-units sit under their parent row. */
  children: CourseLessonNavItem[];
}

/** Below this width the list folds into a disclosure above the cards. */
export const COURSE_LESSON_NAV_NARROW_QUERY = '(max-width: 899px)';

/**
 * DLV-408: the sticky course side nav. It lists every lesson of a course, links each one to
 * its lesson, and marks the lesson whose card is in view (or under the pointer). One shared
 * implementation for every course page; rows reuse the lesson page sidebar outline styles.
 */
@Component({
  selector: 'app-course-lesson-nav',
  imports: [RouterLink, NgTemplateOutlet],
  template: `
    <nav class="course-lesson-nav" [attr.aria-label]="label()">
      <div class="course-lesson-nav-head">
        <p class="sidebar-title">{{ courseTitle() }}</p>
        <p class="sidebar-group-label">{{ countLabel() }}</p>
      </div>
      @if (narrow()) {
        <button
          type="button"
          class="course-lesson-nav-toggle"
          [attr.aria-expanded]="expanded()"
          [attr.aria-controls]="listId()"
          (click)="expanded.set(!expanded())"
        >
          <span>{{ expanded() ? 'Hide lessons' : 'Show all ' + countLabel() }}</span>
          <svg
            class="course-lesson-nav-chevron"
            [class.open]="expanded()"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      }
      <ol
        class="shared-sidebar-outline course-lesson-nav-list"
        [id]="listId()"
        [hidden]="narrow() && !expanded()"
      >
        @for (item of items(); track item.key) {
          <li>
            <ng-container *ngTemplateOutlet="row; context: { $implicit: item }" />
            @if (item.children.length) {
              <ol class="course-lesson-nav-children">
                @for (child of item.children; track child.key) {
                  <li>
                    <ng-container *ngTemplateOutlet="row; context: { $implicit: child }" />
                  </li>
                }
              </ol>
            }
          </li>
        }
      </ol>
    </nav>
    <ng-template #row let-item>
      @if (item.planned) {
        <span class="course-lesson-nav-planned" [attr.data-lesson-key]="item.key">
          @if (item.order) {
            <span class="course-lesson-nav-order" aria-hidden="true">{{ item.order }}</span>
          }
          <span class="course-lesson-nav-text">{{ item.title }} (planned)</span>
        </span>
      } @else {
        <a
          [routerLink]="item.route"
          [queryParams]="item.queryParams"
          [attr.data-lesson-key]="item.key"
          [attr.aria-current]="activeKey() === item.key ? 'location' : null"
        >
          @if (item.order) {
            <span class="course-lesson-nav-order" aria-hidden="true">{{ item.order }}</span>
          }
          <span class="course-lesson-nav-text">{{ item.title }}</span>
        </a>
      }
    </ng-template>
  `,
  styleUrls: ['../author-workspace-nav/sidebar-outline.css', './course-lesson-nav.css'],
})
export class CourseLessonNav {
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly courseTitle = input.required<string>();
  readonly items = input.required<CourseLessonNavItem[]>();
  /** The lesson whose card is in view or under the pointer. */
  readonly activeKey = input<string | null>(null);
  readonly nouns = input<readonly [string, string]>(['lesson', 'lessons']);

  protected readonly expanded = signal(false);
  protected readonly narrow = signal(false);
  /** "Lessons in Fundamentals", "Rounds in Design Rounds". */
  protected readonly label = computed(() => {
    const plural = this.nouns()[1];
    return `${plural.charAt(0).toUpperCase()}${plural.slice(1)} in ${this.courseTitle()}`;
  });
  protected readonly listId = computed(() => `course-lesson-nav-${slug(this.courseTitle())}`);
  protected readonly countLabel = computed(() => {
    const count = this.items().reduce((total, item) => total + 1 + item.children.length, 0);
    const [singular, plural] = this.nouns();
    return `${count} ${count === 1 ? singular : plural}`;
  });

  constructor() {
    const view = this.document.defaultView;
    const query = view?.matchMedia?.(COURSE_LESSON_NAV_NARROW_QUERY);
    if (query) {
      this.narrow.set(query.matches);
      const update = (event: MediaQueryListEvent) => this.narrow.set(event.matches);
      query.addEventListener?.('change', update);
      inject(DestroyRef).onDestroy(() => query.removeEventListener?.('change', update));
    }
    // Keep the highlighted row visible inside the sticky list without moving the page.
    afterRenderEffect(() => {
      const key = this.activeKey();
      if (!key || this.narrow()) return;
      const list = this.host.nativeElement.querySelector<HTMLElement>('.course-lesson-nav');
      const row = Array.from(
        this.host.nativeElement.querySelectorAll<HTMLElement>('[data-lesson-key]'),
      ).find((element) => element.dataset['lessonKey'] === key);
      if (!list || !row || list.scrollHeight <= list.clientHeight) return;
      const listBox = list.getBoundingClientRect();
      const rowBox = row.getBoundingClientRect();
      if (rowBox.top < listBox.top) list.scrollTop -= listBox.top - rowBox.top + 8;
      else if (rowBox.bottom > listBox.bottom) list.scrollTop += rowBox.bottom - listBox.bottom + 8;
    });
  }
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'course'
  );
}
