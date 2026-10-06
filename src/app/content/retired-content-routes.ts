import { inject } from '@angular/core';
import {
  CanActivateFn,
  Params,
  Router,
  UrlSegment,
  UrlSegmentGroup,
  UrlTree,
} from '@angular/router';
import retiredContent from './retired-content-ids.json';

/**
 * Ids a course retired when it was restructured, each mapped to the id that now teaches the
 * same thing. The data lives in `retired-content-ids.json` so the search index generator can
 * read the same table.
 */
export interface RetiredCourseIds {
  readonly path: string;
  readonly courseId: string;
  /** Set when the ids moved to another course of the same path (DLV-410: Java Concurrency). */
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
 * Returns the URL a retired lesson, module, unit anchor or group filter now lives at, keeping
 * every other query parameter and the fragment. Returns null when nothing in the URL is retired.
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

  const course = courses.find(({ path, courseId }) => path === paths[0] && courseId === paths[1]);
  if (course && paths.length === 3) {
    const lesson = replacement(course.lessons, paths[2]);
    if (lesson) nextPaths = [paths[0], course.targetCourseId ?? paths[1], lesson];
  } else if (course && paths.length === 4 && paths[2] === 'module') {
    const module = replacement(course.modules, paths[3]);
    if (module) nextPaths = [paths[0], course.targetCourseId ?? paths[1], paths[2], module];
  } else if (course && paths.length === 2 && fragment?.startsWith('unit-')) {
    const unit = replacement(course.units, fragment.slice('unit-'.length));
    if (unit) {
      fragment = `unit-${unit}`;
      if (course.targetCourseId) nextPaths = [paths[0], course.targetCourseId];
    }
  }

  // Hands-On DSA group filter, on the catalog and on the problem pages it links to.
  const pattern = queryParams['pattern'];
  if (typeof pattern === 'string') queryParams['pattern'] = replaceGroupId(pattern, courses);
  else if (Array.isArray(pattern)) {
    queryParams['pattern'] = pattern.map((value) => replaceGroupId(String(value), courses));
  }

  // Search's course filters: /search?path=learn&course=algorithmic-patterns&module=...&unit=...
  if (paths.length === 1 && paths[0] === 'search') {
    const searchCourse = courses.find(
      ({ path, courseId }) =>
        courseId === queryParams['course'] &&
        (queryParams['path'] === undefined || queryParams['path'] === path),
    );
    if (searchCourse) {
      const module = replacement(searchCourse.modules, queryParams['module']);
      const unit = replacement(searchCourse.units, queryParams['unit']);
      if (module) queryParams['module'] = module;
      if (unit) queryParams['unit'] = unit;
    }
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
