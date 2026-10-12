import type { StudyAccount } from '../study-plan/study-plan-account';

export interface AccountMembership {
  level: 'Author' | 'Course access' | 'Free';
  courseCount: number;
  /** Learn, Grow and Blaze, in catalog order, for the paths the grants cover. */
  paths: string[];
  /** Granted courses per path name. */
  pathCourses: Record<string, number>;
}

const pathNames: Record<string, string> = {
  learn: 'Learn',
  grow: 'Grow',
  blaze: 'Blaze',
  'look-ahead': 'Blaze',
};
const pathOrder = ['Learn', 'Grow', 'Blaze'];

/**
 * The account's membership as Manage account shows it, from server-owned grants only. Paid plans
 * (DLV-209) are not active, so no product name is shown or implied.
 */
export function accountMembership(
  account: Pick<StudyAccount, 'topicGrants' | 'authorPreview'>,
): AccountMembership {
  const courses = new Set(account.topicGrants.filter((grant) => grant.includes(':')));
  const pathCourses: Record<string, number> = {};
  for (const grant of courses) {
    const path = pathNames[grant.split(':', 1)[0]];
    if (path) pathCourses[path] = (pathCourses[path] ?? 0) + 1;
  }
  return {
    level: account.authorPreview ? 'Author' : courses.size ? 'Course access' : 'Free',
    courseCount: courses.size,
    paths: pathOrder.filter((path) => pathCourses[path]),
    pathCourses,
  };
}

/** "Learn, Grow and Blaze" */
export function joinPaths(paths: readonly string[]): string {
  return paths.length < 2 ? (paths[0] ?? '') : `${paths.slice(0, -1).join(', ')} and ${paths.at(-1)}`;
}
