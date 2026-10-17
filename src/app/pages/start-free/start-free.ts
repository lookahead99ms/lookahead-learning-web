import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import {
  AccessLevel,
  AccessLevelEntry,
  AccessLevels,
  AccessLevelsService,
  accessLevelLabel,
  accessViewerFor,
} from '../../content/access-levels';
import { CatalogId, plansIncluding } from '../../content/membership-plans';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { SalePreview } from '../../content/sale-preview';
import { CourseLearningUnit, CourseOutline } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { flattenLearningUnits } from '../../content/learning-units';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { catalogQuestionCountDisplay } from '../../core/adaptive-catalog/adaptive-catalog';

/** One open or free unit with its title and the page it opens. */
export interface StartFreeItem {
  key: string;
  level: Exclude<AccessLevel, 'pro'>;
  pathLabel: string;
  courseTitle: string;
  unitTitle: string;
  route: string[];
  fragment: string | undefined;
}

export interface StartFreeGroup {
  level: Exclude<AccessLevel, 'pro'>;
  heading: string;
  items: StartFreeItem[];
}

const PATH_ORDER = ['learn', 'grow', 'blaze'];
const PATH_LABELS: Record<string, string> = { learn: 'Learn', grow: 'Grow', blaze: 'Blaze' };

/**
 * The page a unit card would open: the unit's first lesson, else its first question; with
 * neither, the unit's card on the course page.
 */
export function startFreeTarget(
  path: string,
  course: CourseOutline,
  unit: CourseLearningUnit,
): Pick<StartFreeItem, 'route' | 'fragment'> {
  const inModule = (moduleId: string | undefined) =>
    moduleId ? course.questions.filter((item) => item.moduleId === moduleId) : [];
  const lesson = inModule(unit.theoryModuleId).find((item) => item.contentType === 'theory');
  const first =
    lesson ??
    inModule(unit.theoryModuleId)[0] ??
    inModule(unit.questionModuleId)[0] ??
    inModule(unit.practiceModuleId)[0];
  return first
    ? { route: ['/', path, course.id, first.id], fragment: undefined }
    : { route: ['/', path, course.id], fragment: `unit-${unit.id}` };
}

/**
 * Builds the two lists, Open first, from the published levels and the loaded course outlines.
 * Units whose course could not load, or that the course no longer has, are left out.
 */
export function startFreeGroups(
  levels: AccessLevels,
  outlines: ReadonlyMap<string, CourseOutline | null>,
): StartFreeGroup[] {
  const byPath = (left: AccessLevelEntry, right: AccessLevelEntry) =>
    PATH_ORDER.indexOf(left.path) - PATH_ORDER.indexOf(right.path);
  const items = (level: StartFreeGroup['level']): StartFreeItem[] =>
    levels
      .entries()
      .filter((entry) => entry.level === level)
      .sort(byPath)
      .flatMap((entry) => {
        const course = outlines.get(`${entry.path}/${entry.courseId}`);
        const unit = course
          ? flattenLearningUnits(course.learningUnits ?? []).find(
              (candidate) => candidate.id === entry.unitId && !candidate.planned,
            )
          : undefined;
        if (!course || !unit) return [];
        return [
          {
            key: `${entry.path}/${entry.courseId}/${entry.unitId}`,
            level,
            pathLabel: PATH_LABELS[entry.path] ?? entry.path,
            courseTitle: course.title,
            unitTitle: unit.title,
            ...startFreeTarget(entry.path, course, unit),
          },
        ];
      });
  return [
    { level: 'open' as const, heading: 'Open to everyone', items: items('open') },
    { level: 'free' as const, heading: 'Free with an account', items: items('free') },
  ].filter((group) => group.items.length > 0);
}

export type ShowcaseSize = 'small' | 'wide' | 'tall' | 'big';

export interface ShowcaseCourse {
  /** "learn/algorithmic-patterns" */
  key: string;
  /** Grid area name in start-free.css. */
  area: string;
  size: ShowcaseSize;
  /** Locked units listed before "and N more", tuned so every tile is full with no gap. */
  shown: number;
  /** Units in two columns (wide tiles with long lists). */
  columns: 1 | 2;
}

/**
 * DLV-209 "What you're missing" (user, 2026-10-15): a curated bento of catchy, in-demand courses,
 * mostly not tied to one language. Mixed sizes fill a 4×6 grid exactly: one big (2×2), two wide
 * (2×1), three tall (1×2, courses with long lists) and eleven small (1×1). Tiles have fixed heights; each lists as many
 * lessons as fit and counts the rest in "and N more" (fitShowcase), so every tile is full.
 */
export const MISSING_SHOWCASE: readonly ShowcaseCourse[] = [
  { key: 'learn/algorithmic-patterns', area: 'alg', size: 'wide', shown: 60, columns: 2 },
  { key: 'learn/sql', area: 'sql', size: 'small', shown: 60, columns: 1 },
  { key: 'grow/spring-framework', area: 'spring', size: 'tall', shown: 60, columns: 1 },
  { key: 'grow/distributed-systems', area: 'dist', size: 'small', shown: 60, columns: 1 },
  { key: 'grow/ai-assisted-development', area: 'aieng', size: 'small', shown: 60, columns: 1 },
  { key: 'learn/git', area: 'git', size: 'small', shown: 60, columns: 1 },
  { key: 'grow/api-design', area: 'sec', size: 'tall', shown: 60, columns: 1 },
  { key: 'grow/react', area: 'react', size: 'small', shown: 60, columns: 1 },
  { key: 'grow/docker-kubernetes', area: 'docker', size: 'small', shown: 60, columns: 1 },
  { key: 'blaze/design-fundamentals', area: 'fund', size: 'small', shown: 60, columns: 1 },
  { key: 'blaze/design-systems', area: 'systems', size: 'big', shown: 60, columns: 2 },
  { key: 'grow/aws-cloud', area: 'cloud', size: 'tall', shown: 60, columns: 1 },
  { key: 'grow/ai-code-verification', area: 'aicv', size: 'small', shown: 60, columns: 1 },
  { key: 'blaze/system-design', area: 'sysd', size: 'small', shown: 60, columns: 1 },
  { key: 'blaze/behavioral-carl', area: 'stories', size: 'small', shown: 60, columns: 1 },
  { key: 'blaze/ai-systems-architecture', area: 'aibuild', size: 'wide', shown: 60, columns: 2 },
];

/** Desktop row length of the lesson cards (start-free.css). */
const CARDS_PER_ROW = 4;


export interface PaidCourse {
  key: string;
  path: string;
  pathLabel: string;
  courseTitle: string;
  courseRoute: string[];
  area: string;
  size: ShowcaseSize;
  columns: 1 | 2;
  /** "From $69.99/year": the short plans note for small tiles. */
  fromPrice: string | null;
  /** Locked units, each opening its card on the course page. */
  units: { key: string; title: string; fragment: string }[];
  /** Paid units beyond the ones shown. */
  more: number;
  /** Every paid unit of the course, for the hero count. */
  paidTotal: number;
  /** "Included in Learn, Advance and Complete, from $69.99/year." */
  plansLine: string | null;
}

function joinNames(names: readonly string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/**
 * The showcase tiles the viewer cannot open yet, in showcase order. Titles come from the public
 * course outlines; nothing here opens a paid lesson. Courses the viewer can already open, or
 * whose outline did not load, are left out (the page then falls back to an even grid).
 */
export function startFreeShowcase(
  levels: AccessLevels,
  outlines: ReadonlyMap<string, CourseOutline | null>,
  hasAccess: (path: string, courseId: string) => boolean,
  showcase: readonly ShowcaseCourse[] = MISSING_SHOWCASE,
): PaidCourse[] {
  const listed = new Set(levels.entries().map((entry) => `${entry.path}/${entry.courseId}/${entry.unitId}`));
  return showcase.flatMap((tile) => {
    const [path, courseId] = tile.key.split('/');
    const course = outlines.get(tile.key);
    if (!course || hasAccess(path, courseId)) return [];
    const paid = flattenLearningUnits(course.learningUnits ?? []).filter(
      (unit) => !unit.planned && !listed.has(`${tile.key}/${unit.id}`),
    );
    if (!paid.length) return [];
    const shown = tile.shown;
    const plans = plansIncluding(path as CatalogId);
    return [
      {
        key: tile.key,
        path,
        pathLabel: PATH_LABELS[path] ?? path,
        courseTitle: course.title,
        courseRoute: ['/', path, courseId],
        area: tile.area,
        size: tile.size,
        columns: tile.columns,
        fromPrice: plans ? `From ${plans.from}` : null,
        units: paid.slice(0, shown).map((unit) => ({
          key: `${tile.key}/${unit.id}`,
          title: unit.title,
          fragment: `unit-${unit.id}`,
        })),
        more: Math.max(0, paid.length - shown),
        paidTotal: paid.length,
        plansLine: plans ? `Included in ${joinNames(plans.names)}, from ${plans.from}.` : null,
      },
    ];
  });
}

/**
 * Shows as many locked units in each showcase tile as fit its fixed height and counts the rest
 * in the tile's "and N more" line, so no tile has empty space or cut-off lines.
 */
export function fitShowcase(list: HTMLElement): void {
  for (const tile of Array.from(list.querySelectorAll<HTMLElement>(':scope > li'))) {
    const units = tile.querySelector<HTMLElement>('.locked-units');
    const more = tile.querySelector<HTMLElement>('.more');
    if (!units || !more) continue;
    const items = Array.from(units.children) as HTMLElement[];
    items.forEach((item) => (item.hidden = false));
    const bottom = units.getBoundingClientRect().bottom + 0.5;
    let hidden = 0;
    for (const item of items) {
      if (hidden || item.getBoundingClientRect().bottom > bottom) {
        item.hidden = true;
        hidden += 1;
      }
    }
    const rest = Number(more.dataset['more'] ?? 0) + hidden;
    more.textContent = rest ? `and ${rest} more` : '';
    more.style.visibility = rest ? '' : 'hidden';
  }
}

/**
 * The lessons a plan adds, as a conservative promise: a clean total stays exact, any other total
 * shows a lower milestone with "+" (203 → "200+"), using the shared catalog count rule.
 */
export function paidLessonsShown(paid: number): string {
  const shown = catalogQuestionCountDisplay(paid);
  return `${shown.value}${shown.minimum ? '+' : ''}`;
}

/**
 * DLV-942: every open and free unit, so a visitor can start without meeting a locked page.
 * DLV-209 (user, 2026-10-15): styled as cards, with a "What you're missing" section showing the
 * paid units of the same courses and the plans that include them. The server still decides every
 * request; labels never hide content or grant access.
 */
@Component({
  selector: 'app-start-free',
  imports: [PlatformHeader, RouterLink],
  templateUrl: './start-free.html',
  styleUrl: './start-free.css',
})
export class StartFreePage implements OnInit {
  private readonly content = inject(ContentService);
  private readonly accessLevels = inject(AccessLevelsService);
  private readonly accounts = inject(StudyPlanAccount);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<'loading' | 'ready' | 'unavailable'>('loading');
  protected readonly groups = signal<StartFreeGroup[]>([]);
  protected readonly label = accessLevelLabel;
  /** Groups whose last, incomplete row of four is shown (user, 2026-10-15: full rows of four). */
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  private readonly loaded = signal<{
    levels: AccessLevels;
    outlines: ReadonlyMap<string, CourseOutline | null>;
  } | null>(null);
  protected readonly signedIn = computed(
    () => !!this.accounts.account() && !this.accounts.sessionExpired(),
  );
  /** Authors and admins (user, 2026-10-16): they always see everything a visitor would. */
  protected readonly staffView = inject(SalePreview).isStaff;
  /** Visitors and staff see the full page; a signed-in learner sees what fits their access. */
  protected readonly showAsVisitor = computed(() => !this.signedIn() || this.staffView());
  protected readonly paidCourses = computed(() => {
    const loaded = this.loaded();
    if (!loaded) return [];
    const account = this.showAsVisitor() ? null : this.accounts.account();
    return startFreeShowcase(
      loaded.levels,
      loaded.outlines,
      (path, courseId) => accessViewerFor(account, path, courseId) === 'has-access',
    );
  });
  /** The bento fits only when every tile is there; otherwise the tiles use an even grid. */
  protected readonly showcaseComplete = computed(
    () => this.paidCourses().length === MISSING_SHOWCASE.length,
  );
  protected readonly counts = computed(() => {
    const groups = this.groups();
    const count = (level: StartFreeGroup['level']) =>
      groups.find((group) => group.level === level)?.items.length ?? 0;
    return {
      open: count('open'),
      free: count('free'),
      paid: this.paidCourses().reduce((total, course) => total + course.paidTotal, 0),
    };
  });
  protected readonly paidShown = computed(() => paidLessonsShown(this.counts().paid));


  private readonly showcase = viewChild<ElementRef<HTMLElement>>('showcase');

  constructor() {
    // Refit after every render of the tiles and whenever the grid changes size.
    afterRenderEffect(() => {
      this.paidCourses();
      const list = this.showcase()?.nativeElement;
      if (!list) return;
      fitShowcase(list);
      // Web fonts change line heights without resizing the grid; fit again once they load.
      void list.ownerDocument.fonts?.ready.then(() => fitShowcase(list));
    });
    afterRenderEffect((onCleanup) => {
      const list = this.showcase()?.nativeElement;
      const view = list?.ownerDocument.defaultView;
      if (!list || !view || typeof view.ResizeObserver !== 'function') return;
      const observer = new view.ResizeObserver(() => fitShowcase(list));
      observer.observe(list);
      onCleanup(() => observer.disconnect());
    });
  }

  /** Full rows of four; the rest waits behind "Show N more" until the learner asks. */
  protected visibleItems(group: StartFreeGroup): StartFreeItem[] {
    const full = group.items.length - (group.items.length % CARDS_PER_ROW);
    return group.items.length <= CARDS_PER_ROW || this.expanded().has(group.level) || full === group.items.length
      ? group.items
      : group.items.slice(0, full);
  }

  protected showAll(level: StartFreeGroup['level']): void {
    this.expanded.update((levels) => new Set([...levels, level]));
  }

  ngOnInit(): void {
    this.accessLevels.levels$
      .pipe(
        switchMap((levels) => {
          if (!levels || !levels.entries().length) return of(null);
          // The courses with free units, plus the showcase courses for "What you're missing".
          const courses = [
            ...new Set([
              ...levels.entries().map((entry) => `${entry.path}/${entry.courseId}`),
              ...MISSING_SHOWCASE.map((tile) => tile.key),
            ]),
          ];
          // Course outlines are public metadata; one that fails to load drops only its units.
          return forkJoin(
            courses.map((key) => {
              const [path, courseId] = key.split('/') as [string, string];
              return this.content.getCourseOutline(path, courseId).pipe(
                map((outline): [string, CourseOutline | null] => [key, outline]),
                catchError(() => of<[string, CourseOutline | null]>([key, null])),
              );
            }),
          ).pipe(map((outlines) => ({ levels, outlines: new Map(outlines) })));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((loaded) => {
        const groups = loaded ? startFreeGroups(loaded.levels, loaded.outlines) : [];
        this.loaded.set(loaded);
        this.groups.set(groups);
        this.state.set(groups.length ? 'ready' : 'unavailable');
      });
  }
}
