// DLV-942: contract for the public unit access levels (/content/access-levels.json).
// The content repository derives the file from policies/content-samples.json
// (tools/utilities/build_access_levels.py); the web app only reads it. It may hold unit IDs and
// levels and nothing else: no titles, routes or lesson bodies.

export const accessLevelsFile = 'access-levels.json';

const allowedKeys = ['schemaVersion', 'policyVersion', 'defaultLevel', 'units'];
const unitKey = /^(learn|grow|blaze)\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Every learning unit ID of a course manifest, sub-units included. */
export function learningUnitIds(manifest) {
  const ids = new Set();
  const pending = [...(manifest.learningUnits ?? [])];
  while (pending.length) {
    const unit = pending.pop();
    ids.add(unit.id);
    pending.push(...(unit.subUnits ?? []));
  }
  return ids;
}

/**
 * Problems with an access-levels document; empty when valid. `unitIdsByCourse` maps
 * "path/course" to that course's learning unit IDs, so every listed unit must exist.
 */
export function accessLevelErrors(document, unitIdsByCourse) {
  const label = accessLevelsFile;
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return [`${label}: expected an object`];
  }
  const errors = [];
  const extra = Object.keys(document).filter((key) => !allowedKeys.includes(key));
  if (extra.length) errors.push(`${label}: unexpected field(s) ${extra.join(', ')}`);
  if (document.schemaVersion !== 'content-access-levels/v1') {
    errors.push(`${label}: unsupported schema ${document.schemaVersion}`);
  }
  if (typeof document.policyVersion !== 'string' || !document.policyVersion) {
    errors.push(`${label}: missing policyVersion`);
  }
  if (document.defaultLevel !== 'pro') errors.push(`${label}: defaultLevel must be pro`);
  const units = document.units;
  if (!units || typeof units !== 'object' || Array.isArray(units)) {
    errors.push(`${label}: units must map unit IDs to levels`);
    return errors;
  }
  for (const [key, level] of Object.entries(units)) {
    if (!unitKey.test(key)) {
      errors.push(`${label}: invalid unit ID ${key}`);
      continue;
    }
    if (level !== 'open' && level !== 'free') errors.push(`${label}: ${key} has invalid level ${level}`);
    const [path, courseId, unitId] = key.split('/');
    if (!unitIdsByCourse.get(`${path}/${courseId}`)?.has(unitId)) {
      errors.push(`${label}: ${key} is not a learning unit of ${path}/${courseId}`);
    }
  }
  return errors;
}
