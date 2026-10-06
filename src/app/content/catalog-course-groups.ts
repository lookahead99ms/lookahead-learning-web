import { GROW_COURSE_GROUPS } from './grow-course-groups';
import { LEARN_COURSE_GROUPS } from './learn-course-groups';
import { LOOK_AHEAD_COURSE_GROUPS } from './look-ahead-course-groups';

export interface CatalogCourseGroup {
  id: string;
  title: string;
  description: string;
  courseIds: string[];
  featuredCourseId?: string;
  featuredLabel?: string;
}

/**
 * The catalog group a course is listed under on its path page (Learn, Grow or Look Ahead), or
 * null when no group lists it. Breadcrumbs use it for the group level between the path and the
 * course, linking to `/<path>?group=<id>`.
 */
export function catalogGroupForCourse(pathId: string, courseId: string): CatalogCourseGroup | null {
  return pathGroups(pathId).find((group) => group.courseIds.includes(courseId)) ?? null;
}

/** The group listed after `groupId` on its path page, or null for the last group. */
export function nextCatalogGroup(pathId: string, groupId: string): CatalogCourseGroup | null {
  const groups = pathGroups(pathId);
  const index = groups.findIndex((group) => group.id === groupId);
  return index >= 0 ? (groups[index + 1] ?? null) : null;
}

function pathGroups(pathId: string): readonly CatalogCourseGroup[] {
  return pathId === 'learn'
    ? LEARN_COURSE_GROUPS
    : pathId === 'grow'
      ? GROW_COURSE_GROUPS
      : pathId === 'look-ahead'
        ? LOOK_AHEAD_COURSE_GROUPS
        : [];
}
