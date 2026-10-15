import type { StudyAccount } from '../study-plan/study-plan-account';
import {
  CATALOG_NAMES,
  CatalogId,
  PlanDefinition,
  PlanId,
  changeWindowOpens,
  durationLabel,
  formatUsd,
  planById,
  renewalLabel,
  scopeLabel,
  upgradesFrom,
} from '../../content/membership-plans';

/**
 * Free account, paid membership and individual course access are three different things:
 * - 'Paid membership': an active plan or interview pass (a purchase record);
 * - 'Course access': individual course grants or a Course Pass, without a paid plan;
 * - 'Free account': signed in, with neither.
 */
export type MembershipLevel = 'Author' | 'Paid membership' | 'Course access' | 'Free account';

export interface AccountMembership {
  level: MembershipLevel;
  courseCount: number;
  /** Learn, Grow and Blaze, in catalog order, for the paths the grants cover. */
  paths: string[];
  /** Granted courses per path name. */
  pathCourses: Record<string, number>;
  /** Plan and pass purchases, newest first. Empty until the server reports them (see below). */
  records: AccessRecordView[];
}

/**
 * DLV-209 server-owned access record, independent of existing course grants.
 */
export interface AccessRecord {
  id: string;
  planId: PlanId;
  /** Course Pass only: the chosen courses, id "learn:core-java" with its catalog title. */
  courses: { id: string; title: string }[];
  /** ISO 8601 instants. */
  startsAt: string;
  endsAt: string | null;
  status: 'scheduled' | 'active' | 'expired';
  /** What the learner actually paid, in US cents, after any discount. */
  pricePaidCents: number;
  /** Student, regional or sale discount: kept apart from the plan name. */
  discount: { label: string; amountCents: number } | null;
}

export interface AccessRecordView {
  id: string;
  name: string;
  includes: string;
  duration: string;
  paid: string;
  discount: string | null;
  started: string | null;
  /** "Expires 12 Jan 2027 · Manual renewal", "Expired …", "Starts …". */
  ends: string | null;
  status: AccessRecord['status'];
  canRenew: boolean;
  /** Names of the larger yearly plans this one can upgrade to now. */
  upgrades: string[];
  /** "Smaller or different plan from 5 Jan 2027", for yearly plans only. */
  changeFrom: string | null;
}

const pathNames: Record<string, string> = {
  learn: 'Learn',
  grow: 'Grow',
  blaze: 'Blaze',
  'look-ahead': 'Blaze',
};
const pathOrder = ['Learn', 'Grow', 'Blaze'];
const YEARLY: ReadonlySet<PlanId> = new Set(['learn', 'grow', 'advance', 'complete']);

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function date(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : dateFormat.format(parsed);
}

/** "Core Java (Learn)": the course title with its catalog. */
function courseLabel(course: { id: string; title: string }): string {
  const path = course.id.split(':', 1)[0];
  const catalog = CATALOG_NAMES[path as CatalogId] ?? pathNames[path];
  return catalog ? `${course.title} (${catalog})` : course.title;
}

function includes(plan: PlanDefinition, record: AccessRecord): string {
  if (plan.scope.kind === 'courses' && record.courses.length) {
    return record.courses.map(courseLabel).join(', ');
  }
  return scopeLabel(plan.scope);
}

/** One purchase as Manage account shows it; null for an unknown plan id. */
export function accessRecordView(record: AccessRecord): AccessRecordView | null {
  const plan = planById(record.planId);
  if (!plan || plan.id === 'free') return null;
  const ends = date(record.endsAt);
  const renewal = renewalLabel(plan.renewal);
  const active = record.status === 'active';
  const endsLine =
    record.status === 'scheduled'
      ? `Starts ${date(record.startsAt)}`
      : ends
        ? `${active ? 'Expires' : 'Expired'} ${ends} · ${renewal}`
        : null;
  const windowOpens =
    active && YEARLY.has(plan.id) && record.endsAt
      ? date(changeWindowOpens(new Date(record.endsAt)).toISOString())
      : null;
  return {
    id: record.id,
    name: plan.name,
    includes: includes(plan, record),
    duration: durationLabel(plan.duration),
    paid: formatUsd(record.pricePaidCents),
    discount: record.discount
      ? `${record.discount.label} −${formatUsd(record.discount.amountCents)}`
      : null,
    started: record.status === 'scheduled' ? null : date(record.startsAt),
    ends: endsLine,
    status: record.status,
    canRenew: record.status !== 'scheduled' && plan.renewal === 'manual',
    upgrades: active ? upgradesFrom(plan.id).map((upgrade) => upgrade.name) : [],
    changeFrom: windowOpens ? `Smaller or different plan from ${windowOpens}` : null,
  };
}

/**
 * The account's membership as Manage account shows it, from server-owned grants and, once the
 * server reports them, purchase records. No plan name is shown without a purchase record.
 */
export function accountMembership(
  account: Pick<StudyAccount, 'topicGrants' | 'authorPreview'>,
  records: readonly AccessRecord[] = [],
): AccountMembership {
  const courses = new Set(account.topicGrants.filter((grant) => grant.includes(':')));
  const pathCourses: Record<string, number> = {};
  for (const grant of courses) {
    const path = pathNames[grant.split(':', 1)[0]];
    if (path) pathCourses[path] = (pathCourses[path] ?? 0) + 1;
  }
  const views = records
    .map(accessRecordView)
    .filter((view): view is AccessRecordView => view !== null);
  const activePlans = records.filter((record) => record.status === 'active');
  const level: MembershipLevel = account.authorPreview
    ? 'Author'
    : activePlans.some((record) => record.planId !== 'course-pass')
      ? 'Paid membership'
      : courses.size || activePlans.length
        ? 'Course access'
        : 'Free account';
  return {
    level,
    courseCount: courses.size,
    paths: pathOrder.filter((path) => pathCourses[path]),
    pathCourses,
    records: views,
  };
}

/** "Learn, Grow and Blaze" */
export function joinPaths(paths: readonly string[]): string {
  return paths.length < 2 ? (paths[0] ?? '') : `${paths.slice(0, -1).join(', ')} and ${paths.at(-1)}`;
}
