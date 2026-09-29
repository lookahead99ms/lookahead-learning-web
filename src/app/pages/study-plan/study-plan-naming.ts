/** Names are independent of goals and schedule snapshots. Dates use UTC, as account creation does. */
export function defaultPlanName(
  number: number,
  createdAt: Date,
  hours: number,
  days: number,
): string {
  const date = `${String(createdAt.getUTCDate()).padStart(2, '0')}${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}${createdAt.getUTCFullYear()}`;
  return `Study plan #${number}_${date}_${hours}X${days}`;
}
export function planNameError(name: string): string {
  if (!name.trim()) return 'Enter a plan name.';
  if (name.length > 160) return 'Use 160 characters or fewer.';
  if (/[\u0000-\u001f\u007f-\u009f]/.test(name))
    return 'Use a single line without control characters.';
  return '';
}
