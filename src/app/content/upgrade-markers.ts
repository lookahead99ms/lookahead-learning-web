/**
 * DLV-969 (owner, 2026-11-04): a DEV test account whose purchase request was approved carries an "upgraded by" marker,
 * so other staff are careful before using or resetting it. Every Domain field name for the marker lives here.
 *
 * - Each row of `GET /admin/test-accounts` may carry `upgradedBy: { self, label, name?, approvedBy: { self, label, name? },
 *   plan: {code,name}, kind, approvedAt } | null` and `canReset` (this viewer may reset the row; the marker reserves
 *   Reset for the owner and the person who upgraded it).
 * - Each account of `GET /auth/test-accounts` (the switcher) may carry `upgradedBy: { self, label, name?, plan, approvedAt }`.
 * - A reset someone else reserved is refused with 403 RESET_RESERVED "Only the owner or <label>, who upgraded this
 *   account, can reset it."
 */
export const UPGRADE_MARKERS = {
  rowField: 'upgradedBy',
  canResetField: 'canReset',
  resetReservedCode: 'RESET_RESERVED',
} as const;

/** A person as the marker names them: `name` reaches the owner only (owner-only identities). */
export interface MarkerPerson {
  self: boolean;
  label: string;
  name: string | null;
}

/** The marker on a People and access row. */
export interface UpgradeMarker extends MarkerPerson {
  approvedBy: MarkerPerson | null;
  /** The plan's name ("Grow"). */
  plan: string;
  kind: string;
  approvedAt: string;
}

/** The marker on a switcher row. */
export interface SwitcherUpgrade {
  self: boolean;
  label: string;
  name?: string | null;
  plan: string;
  approvedAt: string;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function person(value: unknown): MarkerPerson | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const self = v['self'] === true;
  const label = text(v['label']);
  return self || label ? { self, label, name: text(v['name']) || null } : null;
}

/** "Grow" from `{code,name}` or a plain "Grow". */
function planName(value: unknown): string {
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    return text(v['name']) || text(v['code']);
  }
  return text(value);
}

/** The row's marker, or null when it has none or nobody can be named. */
export function upgradeMarkerOf(row: object): UpgradeMarker | null {
  const value = (row as Record<string, unknown>)[UPGRADE_MARKERS.rowField];
  const by = person(value);
  if (!by) return null;
  const v = value as Record<string, unknown>;
  return { ...by, approvedBy: person(v['approvedBy']), plan: planName(v['plan']), kind: text(v['kind']), approvedAt: text(v['approvedAt']) };
}

/** The switcher account's marker, or null. */
export function switcherUpgradeOf(account: object): SwitcherUpgrade | null {
  const value = (account as Record<string, unknown>)[UPGRADE_MARKERS.rowField];
  const by = person(value);
  if (!by) return null;
  const v = value as Record<string, unknown>;
  return { ...by, plan: planName(v['plan']), approvedAt: text(v['approvedAt']) };
}

/** The row's own answer to "may I reset it"; null when an older Domain does not send one. */
export function canResetOf(row: object): boolean | null {
  const value = (row as Record<string, unknown>)[UPGRADE_MARKERS.canResetField];
  return typeof value === 'boolean' ? value : null;
}

/** True for 403 RESET_RESERVED. */
export function resetReserved(failure: unknown): boolean {
  const refusal = failure as { status?: unknown; code?: unknown } | null;
  return refusal?.status === 403 && refusal.code === UPGRADE_MARKERS.resetReservedCode;
}

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
/** "4 Nov"; null when it is not a date. */
function shortDay(value: string): string | null {
  const when = new Date(value);
  return value && !Number.isNaN(when.getTime()) ? dayFormat.format(when) : null;
}

/** "You", the label, or (owner only, when sent) "Priya Rao (Admin 2)". */
function who(p: MarkerPerson, viewerIsOwner: boolean, you: string): string {
  if (p.self) return you;
  if (viewerIsOwner && p.name) return p.label ? `${p.name} (${p.label})` : p.name;
  return p.label || 'someone';
}

/** "Upgraded by You · Grow · 4 Nov", "Upgraded by Admin 2 · Grow · 4 Nov", or for the owner "Upgraded by Priya Rao (Admin 2) · …". */
export function upgradeLine(marker: UpgradeMarker, viewerIsOwner: boolean): string {
  return ['Upgraded by ' + who(marker, viewerIsOwner, 'You'), marker.plan, shortDay(marker.approvedAt)].filter(Boolean).join(' · ');
}

/** "approved by Admin 3" when someone other than the requester approved it; null otherwise. */
export function approvedLine(marker: UpgradeMarker, viewerIsOwner: boolean): string | null {
  const by = marker.approvedBy;
  if (!by) return null;
  const same = by.self === marker.self && by.label === marker.label && (by.name ?? '') === (marker.name ?? '');
  return same ? null : 'approved by ' + who(by, viewerIsOwner, 'you');
}

/**
 * The switcher's short line: "Upgraded by you · Grow", "Upgraded by Admin 2 · Grow". The Domain sends the name to the
 * owner only, so a name that came is shown with its label.
 */
export function switcherUpgradeLine(marker: SwitcherUpgrade): string {
  return ['Upgraded by ' + who({ self: marker.self, label: marker.label, name: marker.name ?? null }, true, 'you'), marker.plan]
    .filter(Boolean)
    .join(' · ');
}
