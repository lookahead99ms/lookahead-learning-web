import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  ElementRef,
  Injector,
  TemplateRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HandsOnDsaIndexGroup, HandsOnDsaIndexProblem, HandsOnSort } from '../../content/hands-on-dsa';
import { PracticeProgressService } from '../../core/practice-progress/practice-progress';
import { PracticeStatusMark } from '../../core/practice-progress/practice-status-mark';
import {
  SORT_COLUMNS,
  SortColumn,
  SortColumnId,
  columnSortArrow,
  columnSortDirection,
  columnSortLabel,
} from './catalog-sort';

/** One pattern in the grouped view: its problems after the filters, and its progress on this device. */
export interface PatternEntry {
  group: HandsOnDsaIndexGroup;
  /** Problems that match the current filters, in the table's current sort. */
  problems: HandsOnDsaIndexProblem[];
  /** Every problem the pattern publishes, for "solved of total". */
  total: number;
  solved: number;
  mix: { beginner: number; intermediate: number; advanced: number };
}

type PendingFocus = { kind: 'detail' } | { kind: 'list'; id: string } | { kind: 'heading' };

/**
 * "By pattern": every pattern in preparation order on the left, one pattern's problems on
 * the right. Below 700px of width the two panes become two screens; the URL says which one.
 */
@Component({
  selector: 'app-pattern-browser',
  imports: [NgTemplateOutlet, PracticeStatusMark, RouterLink],
  template: `
    <div class="panes" [attr.data-screen]="screen()">
      <div class="pattern-list-pane">
        <p class="pane-label" id="pattern-list-label">Patterns</p>
        <div
          class="pattern-list"
          role="listbox"
          aria-labelledby="pattern-list-label"
          aria-describedby="pattern-list-help"
          (keydown)="onListKeydown($event)"
        >
          @for (course of courses(); track course.id) {
            <div role="group" [attr.aria-labelledby]="namesHidden() ? null : 'pattern-course-' + $index"
              [attr.aria-label]="namesHidden() ? 'Patterns ' + course.range : null">
              @if (!namesHidden()) {
                <p class="course-label" role="presentation" [id]="'pattern-course-' + $index">
                  {{ course.title }}
                </p>
              }
              @for (entry of course.entries; track entry.group.id) {
                @let id = entry.group.id;
                <div
                  class="pattern-option"
                  role="option"
                  [id]="optionDomId(id)"
                  [attr.data-pattern-id]="id"
                  [attr.aria-selected]="id === selectedId()"
                  [attr.aria-label]="optionLabel(entry)"
                  [class.is-empty]="!entry.problems.length"
                  [tabindex]="id === rovingId() ? 0 : -1"
                  (focus)="focusedId.set(id)"
                  (click)="choose(id)"
                >
                  <span class="option-order" aria-hidden="true">{{ orderLabel(entry.group) }}</span>
                  <span class="option-name" [class.hidden-name]="!nameShown(entry.group)" aria-hidden="true">
                    {{ patternName(entry.group) }}
                  </span>
                  <span class="option-count" aria-hidden="true">{{ entry.problems.length }}</span>
                  <span class="option-facts" aria-hidden="true">
                    <span class="mix-bar">
                      <i class="beginner" [style.flex-grow]="entry.mix.beginner"></i>
                      <i class="intermediate" [style.flex-grow]="entry.mix.intermediate"></i>
                      <i class="advanced" [style.flex-grow]="entry.mix.advanced"></i>
                    </span>
                    <span class="option-progress">{{ entry.solved }}/{{ entry.total }} solved</span>
                  </span>
                </div>
              }
            </div>
          }
        </div>
        <p class="visually-hidden" id="pattern-list-help">
          Use the arrow keys to move between patterns and Enter to open one.
        </p>
      </div>

      @if (selected(); as entry) {
        @let group = entry.group;
        <section class="pattern-detail" role="region" aria-labelledby="pattern-detail-title">
          <div class="detail-head">
            <button type="button" class="back-to-patterns" (click)="goBack(group.id)">
              <span aria-hidden="true">‹</span> All patterns
            </button>
            <div class="detail-title-row">
              <h3 id="pattern-detail-title" tabindex="-1">
                <span class="detail-order">{{ orderLabel(group) }}</span>&ngsp;<span [class.hidden-name]="!nameShown(group)">{{ patternName(group) }}</span>
              </h3>
              @if (!nameShown(group)) {
                <button type="button" class="show-name" (click)="showName(group.id)">
                  Show name
                </button>
              }
            </div>
            @if (nameShown(group)) {
              <p class="detail-description">{{ group.description }}</p>
            }
            <div class="detail-facts">
              <span class="detail-count">
                {{ entry.problems.length }} {{ entry.problems.length === 1 ? 'problem' : 'problems' }}
                @if (entry.problems.length !== entry.total) {
                  <span class="of-total">of {{ entry.total }}</span>
                }
              </span>
              <span class="detail-mix">
                <span class="mix-bar wide" aria-hidden="true">
                  <i class="beginner" [style.flex-grow]="entry.mix.beginner"></i>
                  <i class="intermediate" [style.flex-grow]="entry.mix.intermediate"></i>
                  <i class="advanced" [style.flex-grow]="entry.mix.advanced"></i>
                </span>
                <span class="mix-legend">
                  <span class="dot beginner"></span>{{ entry.mix.beginner }} Beginner
                  <span class="dot intermediate"></span>{{ entry.mix.intermediate }} Intermediate
                  <span class="dot advanced"></span>{{ entry.mix.advanced }} Advanced
                </span>
              </span>
              <span class="detail-progress">
                <span class="meter" aria-hidden="true"
                  ><span [style.width.%]="entry.total ? (entry.solved / entry.total) * 100 : 0"></span
                ></span>
                {{ entry.solved }} of {{ entry.total }} solved
              </span>
              @if (nameShown(group)) {
                <a class="lesson-link" [routerLink]="['/learn', group.courseId, group.lessonId]"
                  >{{ group.title }} lesson</a
                >
              }
            </div>
            <div class="detail-actions">
              @if (nextUnsolved(); as next) {
                <a
                  class="next-unsolved"
                  [routerLink]="next.route"
                  [queryParams]="problemQueryParams(group.id)"
                  [attr.aria-label]="'Next unsolved: ' + next.title"
                  aria-describedby="next-unsolved-help"
                >
                  Next unsolved <span class="next-title">{{ next.title }}</span>
                </a>
                <p class="visually-hidden" id="next-unsolved-help">{{ nextUnsolvedHelp() }}</p>
              } @else if (entry.problems.length) {
                <p class="all-solved">Every problem shown here is solved.</p>
              }
            </div>
          </div>
          <p class="visually-hidden" role="status" aria-live="polite">{{ status() }}</p>

          @if (entry.problems.length) {
            <table class="pattern-problems" role="table" [attr.aria-label]="patternName(group) + ' problems'">
              <thead role="rowgroup">
                <!-- The flat table's sortable headers: one sort, shared by both views. -->
                <tr role="row">
                  @for (column of sortColumns; track column.id) {
                    <th
                      scope="col"
                      role="columnheader"
                      [class]="'col-' + column.id"
                      [attr.data-column]="column.id"
                      [attr.aria-sort]="sortDirection(column.id)"
                    >
                      <button
                        type="button"
                        class="column-sort"
                        [attr.data-sort-column]="column.id"
                        [disabled]="column.id === 'difficulty' && difficultyFiltered()"
                        [attr.aria-label]="sortLabel(column)"
                        (click)="sortColumn.emit(column.id)"
                      >
                        {{ column.label }}<span aria-hidden="true">{{ sortArrow(column.id) }}</span>
                      </button>
                    </th>
                  }
                  <th scope="col" role="columnheader" class="col-status">Status</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                @for (problem of entry.problems; track problem.id) {
                  @let previewOpen = openPreviewId() === problem.id;
                  <tr class="pattern-problem-row" role="row" [class.is-previewing]="previewOpen">
                    <td class="cell-learning" role="cell">
                      <span class="cell-tag" aria-hidden="true">Learning order </span>{{ problem.studyOrder ?? '—' }}
                    </td>
                    <td class="cell-title" role="cell">
                      <div class="title-layout">
                        <a
                          class="problem-link"
                          [routerLink]="problem.route"
                          [queryParams]="problemQueryParams(group.id)"
                          >{{ problem.title }}</a
                        >
                        <button
                          type="button"
                          class="preview-toggle"
                          [attr.aria-expanded]="previewOpen"
                          [attr.aria-controls]="previewRowId(problem.id)"
                          [attr.aria-label]="(previewOpen ? 'Hide preview of ' : 'Preview ') + problem.title"
                          (click)="previewToggle.emit(problem)"
                        >
                          {{ previewOpen ? 'Hide preview' : 'Preview' }}
                        </button>
                      </div>
                    </td>
                    <td class="cell-difficulty" role="cell" [attr.data-difficulty]="problem.difficulty">
                      {{ problem.difficulty }}
                    </td>
                    <td class="cell-interview" role="cell">
                      <span class="cell-tag" aria-hidden="true">Interview priority </span>{{ problem.interviewRank ?? '—' }}
                    </td>
                    <td class="cell-status" role="cell">
                      <app-practice-status-mark
                        [status]="progress.displayStatus(problem.id)"
                        [compact]="true"
                        [markOnly]="true"
                      />
                    </td>
                  </tr>
                  @if (previewOpen) {
                    <tr class="preview-row" role="row" [id]="previewRowId(problem.id)">
                      <td colspan="5" role="cell">
                        <ng-container
                          [ngTemplateOutlet]="previewTemplate()"
                          [ngTemplateOutletContext]="{ $implicit: problem, patternId: group.id }"
                        />
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          } @else {
            <p class="pattern-empty">
              No problems in this pattern match your filters. Change or clear a filter to see them.
            </p>
          }
        </section>
      }
    </div>
  `,
  styleUrl: './pattern-browser.css',
})
export class PatternBrowser {
  protected readonly progress = inject(PracticeProgressService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly entries = input.required<PatternEntry[]>();
  readonly selected = input.required<PatternEntry | null>();
  /** `detail` once the URL names a pattern; a phone then shows that pattern instead of the list. */
  readonly screen = input.required<'list' | 'detail'>();
  readonly namesHidden = input.required<boolean>();
  readonly revealed = input.required<ReadonlySet<string>>();
  /** The flat table's sort, which also orders the problems inside a pattern. */
  readonly sort = input.required<HandsOnSort>();
  /** How the list is sorted, in words, for Next unsolved's description. */
  readonly sortDescription = input.required<string>();
  /** One difficulty is shown, so sorting by difficulty has nothing to do. */
  readonly difficultyFiltered = input(false);
  readonly openPreviewId = input<string | null>(null);
  readonly previewTemplate = input.required<TemplateRef<unknown>>();

  readonly choosePattern = output<string>();
  readonly back = output<void>();
  readonly reveal = output<string>();
  readonly sortColumn = output<SortColumnId>();
  readonly previewToggle = output<HandsOnDsaIndexProblem>();

  protected readonly sortColumns = SORT_COLUMNS;
  /** The option that holds the list's single tab stop (roving tabindex). */
  protected readonly focusedId = signal<string | null>(null);
  protected readonly selectedId = computed(() => this.selected()?.group.id ?? null);
  protected readonly rovingId = computed(() => {
    const focused = this.focusedId();
    const ids = this.entries().map(({ group }) => group.id);
    return focused && ids.includes(focused) ? focused : (this.selectedId() ?? ids[0] ?? null);
  });
  /** Consecutive patterns of one course, with the course name as a label. */
  protected readonly courses = computed(() => {
    const courses: { id: string; title: string; range: string; entries: PatternEntry[] }[] = [];
    for (const entry of this.entries()) {
      const last = courses.at(-1);
      if (last && last.id === entry.group.courseId) last.entries.push(entry);
      else
        courses.push({ id: entry.group.courseId, title: entry.group.courseTitle, range: '', entries: [entry] });
    }
    for (const course of courses) {
      const first = course.entries[0].group.preparationOrder;
      const last = course.entries.at(-1)!.group.preparationOrder;
      course.range = first === last ? `${first}` : `${first} to ${last}`;
    }
    return courses;
  });
  /** The first unsolved problem in the current sort order, so it follows the column sort. */
  protected readonly nextUnsolved = computed(() => {
    const solved = this.progress.solvedIds();
    return this.selected()?.problems.find(({ id }) => !solved.has(id)) ?? null;
  });
  protected readonly nextUnsolvedHelp = computed(
    () => `The first unsolved problem in this pattern, in the current order: ${this.sortDescription()}.`,
  );
  protected readonly status = computed(() => {
    const entry = this.selected();
    if (!entry) return '';
    const count = entry.problems.length;
    return `${this.patternName(entry.group)}: ${count} ${count === 1 ? 'problem' : 'problems'} shown, ${entry.solved} of ${entry.total} solved.`;
  });
  private pendingFocus: PendingFocus | null = null;

  constructor() {
    // Focus follows the change the learner asked for, once the new pattern or screen has rendered.
    effect(() => {
      this.selectedId();
      this.screen();
      this.revealed();
      untracked(() => this.flushFocus());
    });
    afterNextRender(() => this.revealSelectedOption());
  }

  protected sortDirection(id: SortColumnId): 'ascending' | 'descending' | 'none' {
    return columnSortDirection(this.sort(), id);
  }

  protected sortArrow(id: SortColumnId): string {
    return columnSortArrow(this.sort(), id);
  }

  protected sortLabel(column: SortColumn): string {
    return columnSortLabel(this.sort(), column, this.difficultyFiltered());
  }

  protected nameShown(group: HandsOnDsaIndexGroup): boolean {
    return !this.namesHidden() || this.revealed().has(group.id);
  }

  protected patternName(group: HandsOnDsaIndexGroup): string {
    return this.nameShown(group) ? group.title : `Pattern ${group.preparationOrder}`;
  }

  protected orderLabel(group: HandsOnDsaIndexGroup): string {
    return group.preparationOrder.toString().padStart(2, '0');
  }

  protected optionLabel(entry: PatternEntry): string {
    const count = entry.problems.length;
    const name = this.nameShown(entry.group)
      ? `${entry.group.preparationOrder}. ${entry.group.title}`
      : `Pattern ${entry.group.preparationOrder}`;
    const matches = count ? `${count} ${count === 1 ? 'problem' : 'problems'}` : 'no matching problems';
    return `${name}, ${matches}, ${entry.solved} of ${entry.total} solved`;
  }

  protected optionDomId(id: string): string {
    return `pattern-option-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  protected previewRowId(problemId: string): string {
    return `pattern-preview-${problemId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  protected problemQueryParams(pattern: string): Record<string, string> {
    return { pattern, returnTo: this.router.url };
  }

  protected choose(id: string): void {
    this.focusedId.set(id);
    this.pendingFocus = { kind: 'detail' };
    if (id === this.selectedId() && this.screen() === 'detail') this.flushFocus();
    else this.choosePattern.emit(id);
  }

  protected goBack(id: string): void {
    this.focusedId.set(id);
    this.pendingFocus = { kind: 'list', id };
    this.back.emit();
  }

  protected showName(id: string): void {
    this.pendingFocus = { kind: 'heading' };
    this.reveal.emit(id);
  }

  protected onListKeydown(event: KeyboardEvent): void {
    const options = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[role="option"]')];
    const current = options.findIndex((option) => option === document.activeElement);
    if (current < 0) return;
    let next = current;
    switch (event.key) {
      case 'ArrowDown':
        next = Math.min(options.length - 1, current + 1);
        break;
      case 'ArrowUp':
        next = Math.max(0, current - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = options.length - 1;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.choose(options[current].dataset['patternId']!);
        return;
      default:
        return;
    }
    event.preventDefault();
    const option = options[next];
    this.focusedId.set(option.dataset['patternId']!);
    option.focus({ preventScroll: true });
    this.revealOption(option);
  }

  private flushFocus(): void {
    const pending = this.pendingFocus;
    if (!pending) return;
    this.pendingFocus = null;
    afterNextRender(() => this.applyFocus(pending), { injector: this.injector });
  }

  private applyFocus(pending: PendingFocus): void {
    const root = this.host.nativeElement;
    const heading = root.querySelector<HTMLElement>('#pattern-detail-title');
    if (pending.kind === 'heading') {
      heading?.focus({ preventScroll: true });
      return;
    }
    if (pending.kind === 'list') {
      const option = root.querySelector<HTMLElement>(`[data-pattern-id="${pending.id}"]`);
      option?.focus({ preventScroll: true });
      option?.scrollIntoView?.({ block: 'center' });
      return;
    }
    const detail = root.querySelector<HTMLElement>('.pattern-detail');
    // Two screens (phone): the list is hidden, so the pattern's heading takes focus.
    if (this.listHidden()) {
      heading?.focus({ preventScroll: true });
      this.scrollToTop(detail);
      return;
    }
    // Two panes: focus stays on the chosen option; bring the pattern's top into view if needed.
    this.revealSelectedOption();
    const top = detail?.getBoundingClientRect().top ?? 0;
    if (top < this.stickyBottom() || top > window.innerHeight * 0.6) this.scrollToTop(detail);
  }

  /** Bottom edge of the page's sticky header and breadcrumb, which cover the top of the window. */
  private stickyBottom(): number {
    const stack = document.querySelector('.reader-sticky-stack');
    const header = document.querySelector('app-platform-header header, app-platform-header');
    return Math.max(
      stack?.getBoundingClientRect().bottom ?? 0,
      header?.getBoundingClientRect().bottom ?? 0,
      0,
    );
  }

  /** Scrolls the window so an element's top sits just below the sticky header and breadcrumb. */
  private scrollToTop(element: HTMLElement | null): void {
    if (!element || typeof window.scrollTo !== 'function') return;
    const top = window.scrollY + element.getBoundingClientRect().top - this.stickyBottom() - 12;
    try {
      window.scrollTo({ top: Math.max(0, top) });
    } catch {
      // jsdom has no scrolling.
    }
  }

  private listHidden(): boolean {
    const list = this.host.nativeElement.querySelector<HTMLElement>('.pattern-list');
    return !list || list.getClientRects().length === 0;
  }

  private revealSelectedOption(): void {
    const id = this.selectedId();
    if (!id || this.listHidden()) return;
    const option = this.host.nativeElement.querySelector<HTMLElement>(
      `[data-pattern-id="${id}"]`,
    );
    if (option) this.revealOption(option);
  }

  /** Scrolls the pattern list itself (never the page) so an option is fully visible. */
  private revealOption(option: HTMLElement): void {
    const list = this.host.nativeElement.querySelector<HTMLElement>('.pattern-list');
    if (!list || list.scrollHeight <= list.clientHeight) return;
    const box = list.getBoundingClientRect();
    const item = option.getBoundingClientRect();
    if (item.top < box.top) list.scrollTop -= box.top - item.top + 8;
    else if (item.bottom > box.bottom) list.scrollTop += item.bottom - box.bottom + 8;
  }
}
