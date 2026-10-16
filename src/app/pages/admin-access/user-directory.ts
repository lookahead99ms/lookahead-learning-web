import { accountRoleLabel } from '../account/account-membership';

/**
 * DLV-961 People directory (user, 2026-10-16): every account the signed-in operator may inspect,
 * with human role names and the access the account has now. Roles and access stay separate:
 * access comes from plans, passes and grants, never from the role. Pure functions, no requests.
 */

/** An owner-only staff assignment (`GET /admin/access`). */
export interface DirectoryAssignment {
  id: string;
  accountId: string | null;
  pendingEmail: string | null;
  roles: string[];
  topicGrants: string[];
  fullCurriculum: boolean;
}

/** A managed Local test account (`GET /admin/test-accounts`). */
export interface DirectoryTestAccount {
  accountId: string;
  username: string;
  roles: string[];
  access: { label: string; labels?: string[]; grantedCourseIds?: string[] };
  revision: number;
  lastChangedBy: string;
  lastChangedAt: string;
  legacyPresetAvailable: boolean;
  creatorId?: string;
  canDelete?: boolean;
}

/** The signed-in operator, from the account session. */
export interface DirectorySelf {
  accountId: string;
  username: string;
  displayName?: string;
  /** feedbackRole from the server: owner, co-author, admin, reviewer, tester or user. */
  role?: string;
  topicGrants?: string[];
  fullCurriculum?: boolean;
}

/** Owner-only Identity directory enriched by Domain with current access. */
export interface DirectoryAccount {
  accountId: string; username: string; displayName: string; email: string | null;
  roles: string[]; testAccount: boolean; fullCurriculum: boolean;
  access: { label: string; labels: string[]; grantedCourseIds: string[] };
  canDowngrade?: boolean; canDelete?: boolean;
}

export interface DirectoryRow {
  key: string;
  accountId: string | null;
  name: string;
  /** Second line under the name: display name, pending email note or "Test account". */
  detail: string | null;
  roles: string[];
  access: string[];
  isTest: boolean;
  isSelf: boolean;
  pending: boolean;
  changedBy: string | null;
  changedAt: string | null;
  test: DirectoryTestAccount | null;
  canDowngrade?: boolean;
  canDelete?: boolean;
}

export const ROLE_FILTERS = ['Author (owner)', 'Co-author', 'Admin', 'Reviewer', 'Tester', 'Learner'] as const;

const CATALOG_NAMES: Readonly<Record<string, string>> = {
  learn: 'Learn',
  grow: 'Grow',
  blaze: 'Blaze',
  'look-ahead': 'Blaze',
};
/** Generic words the server puts before a plan name; the directory shows the plan name only. */
const PREFIXES = /^(regular|paid|paid membership|membership|promo)$/i;

/** The owner-only directory, every page (`GET /admin/accounts`). Throws on a missing or malformed page. */
export async function loadDirectory(request: <T>(path: string) => Promise<T>): Promise<DirectoryAccount[]> {
  const accounts: DirectoryAccount[] = [];
  for (let page = 0; page <= 100000; page++) {
    const result = await request<{ accounts: DirectoryAccount[]; page: number; hasNext: boolean }>(`/admin/accounts?query=&page=${page}`);
    if (!Array.isArray(result.accounts) || result.page !== page || typeof result.hasNext !== 'boolean') throw new Error('Invalid directory');
    accounts.push(...result.accounts);
    if (!result.hasNext) return accounts;
    if (page === 100000 || !result.accounts.length) throw new Error('Incomplete directory');
  }
  throw new Error('Incomplete directory');
}

/** An account's username when a list could name it, otherwise a short ID. */
export function accountName(accountId: string, names: ReadonlyMap<string, string>): string {
  return names.get(accountId) ?? `Account ${accountId.slice(0, 8)}`;
}

/** "learn:core-java" with its catalog title -> "Java Foundations (Learn)". */
export function courseLabel(courseId: string, titles: ReadonlyMap<string, string>): string {
  const [path, id = ''] = courseId.split(':');
  const catalog = CATALOG_NAMES[path];
  const title =
    titles.get(courseId) ??
    id
      .split('-')
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(' ');
  return catalog ? `${title} (${catalog})` : title;
}

/**
 * Plain access names from the server's derived labels and granted courses:
 * "Regular · Advance" -> "Advance", "Promo · Annual Promo" -> "Annual Promo", course grants ->
 * course titles with their catalog. Staff with the entire curriculum show "Full curriculum";
 * nothing at all shows "Free".
 */
export function plainAccess(
  labels: readonly string[],
  courseIds: readonly string[],
  titles: ReadonlyMap<string, string>,
  fullCurriculum: boolean,
): string[] {
  if (fullCurriculum) return ['Full curriculum'];
  const plans = labels.flatMap((label) => {
    const parts = label
      .split('·')
      .map((part) => part.trim())
      .filter((part) => part && !PREFIXES.test(part));
    // Course Pass and course-grant labels are described by the course titles below.
    if (!parts.length || parts.some((part) => /course pass|course access/i.test(part) || part.includes(':'))) {
      return [];
    }
    return [parts.at(-1)!];
  });
  const courses = courseIds.filter((id) => id.includes(':')).map((id) => courseLabel(id, titles));
  const names = [...new Set([...plans.filter((name) => name !== 'Free'), ...courses])];
  return names.length ? names : ['Free'];
}

function roleNames(codes: readonly string[]): string[] {
  const names = [...new Set(codes.map((code) => accountRoleLabel(code)))];
  // Learner only when there is no staff role.
  const staff = names.filter((name) => name !== 'Learner');
  return staff.length ? staff : ['Learner'];
}

/** Sorted by role (user, 2026-10-16): Author, Co-author, Admin, Reviewer, Tester, Learner, then pending invitations. */
function roleRank(row: DirectoryRow): number {
  const order: readonly string[] = ROLE_FILTERS;
  if (row.pending) return order.length + 1;
  return Math.min(...row.roles.map((role) => (order.includes(role) ? order.indexOf(role) : order.length)));
}

function byName(left: DirectoryRow, right: DirectoryRow): number {
  return left.name.localeCompare(right.name, 'en', { numeric: true });
}

/**
 * One row per account, sorted by role and then by name, with pending invitations last. A test account and a staff assignment for the same account merge into one row.
 */
export function directoryRows(
  self: DirectorySelf | null,
  assignments: readonly DirectoryAssignment[],
  tests: readonly DirectoryTestAccount[],
  titles: ReadonlyMap<string, string>,
  accounts: readonly DirectoryAccount[] = [],
): DirectoryRow[] {
  const byAccount = new Map(assignments.filter((item) => item.accountId).map((item) => [item.accountId!, item]));
  const rows: DirectoryRow[] = [];
  const seen = new Set<string>();

  for (const test of tests) {
    const assignment = byAccount.get(test.accountId);
    const codes = [...test.roles, ...(assignment?.roles ?? [])];
    const full = !!assignment?.fullCurriculum || codes.includes('tester');
    rows.push({
      key: test.accountId,
      accountId: test.accountId,
      name: test.username,
      detail: 'Test account',
      roles: roleNames(codes),
      access: plainAccess(
        test.access.labels?.length ? test.access.labels : [test.access.label],
        [...(test.access.grantedCourseIds ?? []), ...(assignment?.topicGrants ?? [])],
        titles,
        full,
      ),
      isTest: true,
      isSelf: test.accountId === self?.accountId,
      pending: false,
      changedBy: test.lastChangedBy,
      changedAt: test.lastChangedAt,
      test,
      canDelete: test.canDelete,
    });
    seen.add(test.accountId);
  }

  for (const assignment of assignments) {
    if (assignment.accountId && seen.has(assignment.accountId)) continue;
    const full = assignment.fullCurriculum || assignment.roles.includes('tester');
    const isSelf = !!assignment.accountId && assignment.accountId === self?.accountId;
    rows.push({
      key: assignment.id,
      accountId: assignment.accountId,
      name: isSelf ? self!.username : (assignment.pendingEmail ?? accountName(assignment.accountId!, new Map())),
      detail: assignment.pendingEmail ? 'Waiting for a verified sign-in' : null,
      roles: roleNames(assignment.roles),
      access: plainAccess([], assignment.topicGrants, titles, full),
      isTest: false,
      isSelf,
      pending: !!assignment.pendingEmail,
      changedBy: null,
      changedAt: null,
      test: null,
      canDowngrade: false,
      canDelete: false,
    });
    if (assignment.accountId) seen.add(assignment.accountId);
  }

  if (self && !seen.has(self.accountId)) {
    const owner = self.role === 'owner';
    rows.push({
      key: self.accountId,
      accountId: self.accountId,
      name: self.username,
      detail: self.displayName && self.displayName !== self.username ? self.displayName : null,
      roles: roleNames([self.role ?? 'user']),
      access: plainAccess([], self.topicGrants ?? [], titles, owner || !!self.fullCurriculum),
      isTest: false,
      isSelf: true,
      pending: false,
      changedBy: null,
      changedAt: null,
      test: null,
      canDowngrade: false,
      canDelete: false,
    });
  }

  for (const account of accounts) {
    const existing = rows.find(row => row.accountId === account.accountId);
    const current = {
      name: account.username,
      detail: [account.displayName !== account.username ? account.displayName : '', account.email ?? ''].filter(Boolean).join(' · ') || null,
      roles: roleNames(account.roles),
      access: plainAccess(account.access.labels, account.access.grantedCourseIds, titles, account.fullCurriculum),
      isTest: account.testAccount,
      canDowngrade: account.canDowngrade,
      canDelete: account.canDelete,
    };
    if (existing) Object.assign(existing, current);
    else rows.push({ ...current, key: account.accountId, accountId: account.accountId,
      isSelf: account.accountId === self?.accountId, pending: false, changedBy: null, changedAt: null, test: null });
  }

  return rows.sort((left, right) => roleRank(left) - roleRank(right) || byName(left, right));
}

/** Search by name, role or access text; role filter by human role name. */
export function matchesFilter(row: DirectoryRow, query: string, role: string): boolean {
  if (role && !row.roles.includes(role)) return false;
  const text = query.trim().toLowerCase();
  if (!text) return true;
  return [row.name, row.detail ?? '', ...row.roles, ...row.access].some((value) =>
    value.toLowerCase().includes(text),
  );
}
