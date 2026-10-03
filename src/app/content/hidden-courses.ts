/**
 * Courses retired from discovery. Their pages and content stay reachable by direct URL,
 * but learners no longer find them in catalogs, menus, search or study-plan offerings.
 */
export const HIDDEN_COURSE_IDS: readonly string[] = [
  'look-ahead:system-design',
  'look-ahead:distributed-systems',
  'look-ahead:scalability-performance',
];

const HIDDEN = new Set<string>(HIDDEN_COURSE_IDS);

export function isHiddenCourse(path: string, courseId: string | undefined | null): boolean {
  return !!courseId && HIDDEN.has(`${path}:${courseId}`);
}

export function withoutHiddenCourses<T extends { id?: string }>(path: string, items: readonly T[]): T[] {
  return items.filter((item) => !isHiddenCourse(path, item.id));
}

export function withoutHiddenCourseDocuments<T extends { path: string; courseId: string }>(
  documents: readonly T[],
): T[] {
  return documents.filter((document) => !isHiddenCourse(document.path, document.courseId));
}
