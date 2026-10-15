import { HttpClient } from '@angular/common/http';
import { Injectable, Signal, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';

/**
 * DLV-942: who can open a learning unit, shown before a visitor clicks.
 * The levels come from the content repository's sample policy (policies/content-samples.json),
 * published as the public metadata file /content/access-levels.json. The server still enforces
 * access; these labels never hide content or change routing. What a page shows depends on who is
 * looking (accessLabelFor): signed-out visitors see every level, signed-in learners only "Paid
 * plan" on courses they cannot open.
 */
export type AccessLevel = 'open' | 'free' | 'pro';

export const ACCESS_LEVELS_HREF = '/content/access-levels.json';

const LABELS: Record<AccessLevel, string> = {
  open: 'Open',
  free: 'Free with account',
  // The server tier stays `pro`; learners see "Paid" (no plan is called Pro, user 2026-10-15).
  pro: 'Paid',
};

/**
 * The plain-text label for a level, whoever is looking: "Open", "Free with account" or "Paid".
 * Pages that know the viewer (course unit cards, module pages) use accessLabelFor instead.
 */
export function accessLevelLabel(level: AccessLevel): string {
  return LABELS[level];
}

/**
 * Who is looking at an access label: a signed-out visitor, or a signed-in learner with or
 * without access to the unit's course.
 */
export type AccessViewer = 'signed-out' | 'has-access' | 'no-access';

/** The account fields that decide course access, as the account API returns them. */
export interface AccessAccount {
  topicGrants: readonly string[];
  authorPreview?: boolean;
  permissions?: { fullCurriculum?: boolean; feedbackRole?: string };
}

/**
 * DLV-209: the viewer of one course's labels. `account` is null when signed out (or the session
 * has expired). Access is a course grant (`<path>:<courseId>`, legacy `look-ahead:` read as
 * `blaze:`), the full curriculum, author preview or the tester role. Only a hint: the server
 * still enforces access.
 */
export function accessViewerFor(
  account: AccessAccount | null,
  path: string,
  courseId: string,
): AccessViewer {
  if (!account) return 'signed-out';
  const course = `${path.replace(/^look-ahead$/, 'blaze')}:${courseId}`;
  const granted =
    account.permissions?.fullCurriculum === true ||
    account.authorPreview === true ||
    account.permissions?.feedbackRole === 'tester' ||
    account.topicGrants.some((grant) => grant.replace(/^look-ahead:/, 'blaze:') === course);
  return granted ? 'has-access' : 'no-access';
}

/**
 * DLV-209: the unit label for one viewer, or null for no label. A signed-out visitor sees
 * "Open", "Sign in to read" or "Paid plan"; a signed-in learner sees "Paid plan" only on a paid
 * unit of a course they cannot open, and nothing otherwise.
 */
export function accessLabelFor(level: AccessLevel, viewer: AccessViewer): string | null {
  if (viewer === 'signed-out')
    return { open: 'Open', free: 'Sign in to read', pro: 'Paid plan' }[level];
  return viewer === 'no-access' && level === 'pro' ? 'Paid plan' : null;
}

/** Accessible wording that names the level, for example "Access: Free with account". */
export function accessLevelAccessibleText(level: AccessLevel): string {
  return `Access: ${LABELS[level]}`;
}

/** Catalog card line: "3 free lessons", or null when the course has no open or free units. */
export function freeLessonsLabel(count: number): string | null {
  if (!Number.isInteger(count) || count <= 0) return null;
  return `${count} free ${count === 1 ? 'lesson' : 'lessons'}`;
}

/** One open or free unit, by its catalog path, course and unit ID. */
export interface AccessLevelEntry {
  path: string;
  courseId: string;
  unitId: string;
  level: Exclude<AccessLevel, 'pro'>;
}

const UNIT_KEY = /^(learn|grow|blaze)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * The published levels. Units it lists are Open or Free with account; every other unit of the
 * curriculum is Paid (the policy's default level, `pro`).
 */
export class AccessLevels {
  private readonly byKey: ReadonlyMap<string, AccessLevelEntry>;

  constructor(
    readonly policyVersion: string,
    entries: readonly AccessLevelEntry[],
  ) {
    this.byKey = new Map(entries.map((entry) => [unitKey(entry), entry]));
  }

  /** The level of one unit; units the policy does not list are Paid. */
  levelFor(path: string, courseId: string, unitId: string): AccessLevel {
    return this.byKey.get(`${path}/${courseId}/${unitId}`)?.level ?? 'pro';
  }

  /** Open and free units of one course, for the catalog card line. */
  freeUnitCount(path: string, courseId: string): number {
    return this.entries().filter((entry) => entry.path === path && entry.courseId === courseId)
      .length;
  }

  /** Every open or free unit, in policy order. */
  entries(): AccessLevelEntry[] {
    return [...this.byKey.values()];
  }
}

function unitKey(entry: Pick<AccessLevelEntry, 'path' | 'courseId' | 'unitId'>): string {
  return `${entry.path}/${entry.courseId}/${entry.unitId}`;
}

/**
 * Validates the published document. Anything unexpected returns null, so pages show no labels
 * rather than a wrong one.
 */
export function parseAccessLevels(value: unknown): AccessLevels | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const document = value as Record<string, unknown>;
  if (
    document['schemaVersion'] !== 'content-access-levels/v1' ||
    document['defaultLevel'] !== 'pro' ||
    typeof document['policyVersion'] !== 'string' ||
    !document['units'] ||
    typeof document['units'] !== 'object' ||
    Array.isArray(document['units'])
  ) {
    return null;
  }
  const entries: AccessLevelEntry[] = [];
  for (const [key, level] of Object.entries(document['units'] as Record<string, unknown>)) {
    const match = UNIT_KEY.exec(key);
    if (!match || (level !== 'open' && level !== 'free')) return null;
    entries.push({ path: match[1]!, courseId: match[2]!, unitId: match[3]!, level });
  }
  return new AccessLevels(document['policyVersion'], entries);
}

/**
 * Loads the public access levels once per app. A missing file (the public demo, or a protected
 * publication built before DLV-942) or a failed request means "no labels", never an error page.
 * HttpClient is optional so components keep working in tests that provide no HTTP backend.
 */
@Injectable({ providedIn: 'root' })
export class AccessLevelsService {
  private readonly http = inject(HttpClient, { optional: true });

  readonly levels$: Observable<AccessLevels | null> = this.http
    ? this.http.get<unknown>(ACCESS_LEVELS_HREF).pipe(
        map(parseAccessLevels),
        catchError(() => of(null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      )
    : of(null);

  readonly levels: Signal<AccessLevels | null> = toSignal(this.levels$, { initialValue: null });
}
