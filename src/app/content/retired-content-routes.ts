import { inject } from '@angular/core';
import {
  CanActivateFn,
  DefaultUrlSerializer,
  Params,
  Router,
  UrlSegment,
  UrlSegmentGroup,
  UrlTree,
} from '@angular/router';
import retiredContent from './retired-content-ids.json';
import {
  PATTERN_CONTEXT_PARAM,
  isPatternContextToken,
  patternContextToken,
} from './pattern-context';

/**
 * Ids a course retired when it was restructured, each mapped to the id that now teaches the
 * same thing. The data lives in `retired-content-ids.json` so the search index generator can
 * read the same table.
 */
export interface RetiredCourseIds {
  readonly path: string;
  readonly courseId: string;
  /**
   * Set when the ids moved to another course of the same path (DLV-410: Java Concurrency). One
   * course may have several entries with different targets: each id is looked up in all of them.
   */
  readonly targetCourseId?: string;
  /** Lesson (question) ids: `/<path>/<course>/<lesson>`. */
  readonly lessons: Readonly<Record<string, string>>;
  /** Module ids: `/<path>/<course>/module/<module>` and Search `?module=`. */
  readonly modules: Readonly<Record<string, string>>;
  /** Unit ids: `#unit-<unit>` anchors, Search `?unit=` and Hands-On `?pattern=<course>:<unit>`. */
  readonly units: Readonly<Record<string, string>>;
}

// JSON imports infer one union type for all entries, which no longer fits once entries differ in shape
// (DLV-410 added targetCourseId), so the table is typed explicitly here.
export const RETIRED_COURSE_IDS: readonly RetiredCourseIds[] =
  retiredContent.courses as unknown as readonly RetiredCourseIds[];

const replacement = (table: Readonly<Record<string, string>>, id: unknown): string | undefined =>
  typeof id === 'string' && Object.hasOwn(table, id) ? table[id] : undefined;

type RetiredTable = 'lessons' | 'modules' | 'units';

/** The first entry, among all entries of one course, whose table lists the id. */
const entryListing = (
  entries: readonly RetiredCourseIds[],
  table: RetiredTable,
  id: unknown,
): RetiredCourseIds | undefined =>
  entries.find((entry) => replacement(entry[table], id) !== undefined);

/** `algorithmic-patterns:difference-arrays` -> `algorithmic-patterns:prefix-state`. */
function replaceGroupId(value: string, courses: readonly RetiredCourseIds[]): string {
  const separator = value.indexOf(':');
  if (separator < 0) return value;
  const courseId = value.slice(0, separator);
  const unit = courses
    .filter((course) => course.courseId === courseId)
    .map((course) => replacement(course.units, value.slice(separator + 1)))
    .find(Boolean);
  return unit ? `${courseId}:${unit}` : value;
}

/**
 * DLV-962: the URL form of one `?pattern=` value. An old readable group id is moved off a retired
 * unit and then made opaque; an opaque id of a retired group becomes the opaque id of its
 * replacement; any other opaque id is kept.
 */
function patternContextParam(value: string, courses: readonly RetiredCourseIds[]): string {
  if (!value) return value;
  if (!isPatternContextToken(value)) return patternContextToken(replaceGroupId(value, courses));
  for (const course of courses) {
    for (const [retired, current] of Object.entries(course.units)) {
      if (patternContextToken(`${course.courseId}:${retired}`) === value) {
        return patternContextToken(`${course.courseId}:${current}`);
      }
    }
  }
  return value;
}

/** Rewrites `?pattern=` (one value or several) in place; true when anything changed. */
function normalizePatternParams(params: Params, courses: readonly RetiredCourseIds[]): boolean {
  const value = params[PATTERN_CONTEXT_PARAM];
  const next =
    typeof value === 'string'
      ? patternContextParam(value, courses)
      : Array.isArray(value)
        ? value.map((entry) => patternContextParam(String(entry), courses))
        : value;
  if (JSON.stringify(next) === JSON.stringify(value)) return false;
  params[PATTERN_CONTEXT_PARAM] = next;
  return true;
}

/** A problem page's `returnTo` (the catalog URL it came from) may carry `?pattern=` too. */
function normalizeReturnTo(value: unknown, courses: readonly RetiredCourseIds[]): unknown {
  if (typeof value !== 'string' || !value.startsWith('/')) return value;
  const serializer = new DefaultUrlSerializer();
  const tree = serializer.parse(value);
  const params: Params = { ...tree.queryParams };
  if (!normalizePatternParams(params, courses)) return value;
  tree.queryParams = params;
  return serializer.serialize(tree);
}

/**
 * Returns the URL a retired lesson, module, unit anchor or group filter now lives at, keeping
 * every other query parameter and the fragment. A readable `?pattern=` id (DLV-962) is also
 * rewritten to its opaque context id. Returns null when nothing in the URL needs to change.
 */
export function retiredContentTarget(
  url: UrlTree,
  courses: readonly RetiredCourseIds[] = RETIRED_COURSE_IDS,
): UrlTree | null {
  const primary = url.root.children['primary'];
  const paths = primary?.segments.map((segment) => segment.path) ?? [];
  let nextPaths = paths;
  let fragment = url.fragment;
  const queryParams: Params = { ...url.queryParams };

  // A course can have several entries (ids that moved to different courses), so the entry is
  // chosen per id: the one whose table lists it.
  const entries = courses.filter(
    ({ path, courseId }) => path === paths[0] && courseId === paths[1],
  );
  if (paths.length === 3) {
    const course = entryListing(entries, 'lessons', paths[2]);
    if (course) {
      nextPaths = [paths[0], course.targetCourseId ?? paths[1], course.lessons[paths[2]]];
    }
  } else if (paths.length === 4 && paths[2] === 'module') {
    const course = entryListing(entries, 'modules', paths[3]);
    if (course) {
      nextPaths = [paths[0], course.targetCourseId ?? paths[1], paths[2], course.modules[paths[3]]];
    }
  } else if (paths.length === 2 && fragment?.startsWith('unit-')) {
    const retiredUnit = fragment.slice('unit-'.length);
    const course = entryListing(entries, 'units', retiredUnit);
    if (course) {
      fragment = `unit-${course.units[retiredUnit]}`;
      if (course.targetCourseId) nextPaths = [paths[0], course.targetCourseId];
    }
  }

  // Hands-On DSA group filter, on the catalog and on the problem pages it links to. DLV-962: an
  // old readable id is rewritten to the opaque context id, here and inside `returnTo`.
  normalizePatternParams(queryParams, courses);
  if (queryParams['returnTo'] !== undefined) {
    queryParams['returnTo'] = normalizeReturnTo(queryParams['returnTo'], courses);
  }

  // Search's course filters: /search?path=learn&course=algorithmic-patterns&module=...&unit=...
  if (paths.length === 1 && paths[0] === 'search') {
    const searchEntries = courses.filter(
      ({ path, courseId }) =>
        courseId === queryParams['course'] &&
        (queryParams['path'] === undefined || queryParams['path'] === path),
    );
    const module = searchEntries
      .map((entry) => replacement(entry.modules, queryParams['module']))
      .find(Boolean);
    const unit = searchEntries
      .map((entry) => replacement(entry.units, queryParams['unit']))
      .find(Boolean);
    if (module) queryParams['module'] = module;
    if (unit) queryParams['unit'] = unit;
  }

  const unchanged =
    nextPaths === paths &&
    fragment === url.fragment &&
    Object.keys(queryParams).every(
      (key) => JSON.stringify(queryParams[key]) === JSON.stringify(url.queryParams[key]),
    );
  if (unchanged || !primary) return null;

  const segments = nextPaths.map(
    (path, index) => new UrlSegment(path, primary.segments[index]?.parameters ?? {}),
  );
  return new UrlTree(
    new UrlSegmentGroup([], {
      ...url.root.children,
      primary: new UrlSegmentGroup(segments, primary.children),
    }),
    queryParams,
    fragment,
  );
}

/**
 * Sends a retired URL to its replacement before the page loads. The router writes only the
 * new URL: a link click pushes the replacement (the old URL is never recorded), and a direct
 * load, reload or back/forward replaces the current entry, so history holds no dead URL.
 */
export const retiredContentRedirect: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return retiredContentTarget(router.parseUrl(state.url)) ?? true;
};
