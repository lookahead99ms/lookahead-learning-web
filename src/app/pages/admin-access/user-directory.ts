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
  /** DLV-969: what a non-owner is sent instead of the account and email ("Co-author 2", "Pending invitation"). */
  label?: string;
  pending?: boolean;
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
  /**
   * DLV-969 (DEV sign-in accounts): whether the account can sign in now, and which of the owner's
   * removal actions apply. Absent from an older Domain, so the buttons stay hidden.
   */
  signIn?: 'active' | 'disabled'; canDisable?: boolean; canEnable?: boolean; canRemove?: boolean;
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
  /** DLV-969: sign-in is switched off for this account (Disable). */
  disabled?: boolean;
  canDisable?: boolean;
  canEnable?: boolean;
  canRemove?: boolean;
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
/**
 * How the owner sees a person (DLV-969, owner 2026-11-03): their name first, then their email (a Google account's Gmail).
 * Cognito's own name for a Google account ("google_1176…") is an internal id and never shown; a readable username
 * (an email or a test login) is used when there is no name.
 */
export function personLines(account: { username: string; displayName?: string | null; email?: string | null }): { name: string; detail: string | null } {
  const internal = /^google_/i.test(account.username);
  const display = account.displayName?.trim() && account.displayName !== account.username ? account.displayName.trim() : '';
  const name = display || account.email || (internal ? 'Google account' : account.username);
  const details = [account.email && account.email !== name ? account.email : '',
    !internal && account.username !== name && account.username !== account.email ? account.username : ''].filter(Boolean);
  return { name, detail: details.join(' · ') || null };
}

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
    const pending = !!assignment.pendingEmail || assignment.pending === true;
    rows.push({
      key: assignment.id,
      accountId: assignment.accountId,
      // Your own row names you as a person, never by Cognito's internal google_… id (DLV-969, user 2026-11-03).
      name: isSelf ? personLines(self!).name : (assignment.label ?? assignment.pendingEmail ?? accountName(assignment.accountId!, new Map())),
      detail: pending ? 'Waiting for a verified sign-in' : null,
      roles: roleNames(assignment.roles),
      access: plainAccess([], assignment.topicGrants, titles, full),
      isTest: false,
      isSelf,
      pending,
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
    const lines = personLines(self);
    rows.push({
      key: self.accountId,
      accountId: self.accountId,
      name: lines.name,
      detail: lines.detail,
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
    const lines = personLines(account);
    const current = {
      name: lines.name,
      detail: lines.detail,
      roles: roleNames(account.roles),
      access: plainAccess(account.access.labels, account.access.grantedCourseIds, titles, account.fullCurriculum),
      isTest: account.testAccount,
      canDowngrade: account.canDowngrade,
      canDelete: account.canDelete,
      disabled: account.signIn === 'disabled',
      canDisable: account.canDisable === true,
      canEnable: account.canEnable === true,
      canRemove: account.canRemove === true,
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
