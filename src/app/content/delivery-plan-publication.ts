import { DeliveryPlan } from './delivery-plan.models';
import { DeliverySnapshot } from './delivery-editor.service';

/** The raw delivery plan inside the staff section of the Content publication. */
export const PUBLISHED_DELIVERY_PLAN_HREF = '/content/staff/delivery-plan.json';

export class DeliveryPlanShapeError extends Error {}

/**
 * Shape the raw `runtime/delivery/delivery-plan.json` text exactly as the local editor API does
 * (scripts/delivery-editor.mjs `readPlan`): parse, check the supported structure, and name the
 * revision by the SHA-256 of the bytes, so whitespace-only edits change the revision too.
 */
export function parseDeliveryPlanSource(text: string): DeliveryPlan {
  let plan: unknown;
  try {
    plan = JSON.parse(text);
  } catch {
    throw new DeliveryPlanShapeError('The private delivery JSON is invalid. Repair it before saving.');
  }
  const record = plan as Record<string, unknown> | null;
  if (
    !record ||
    typeof record !== 'object' ||
    Array.isArray(record) ||
    record['schemaVersion'] !== 'delivery-plan/v1' ||
    !['workItems', 'stages', 'workflow', 'priorities'].every((key) => Array.isArray(record[key]))
  )
    throw new DeliveryPlanShapeError('The private delivery plan has an unsupported structure.');
  return record as unknown as DeliveryPlan;
}

export async function deliveryPlanRevision(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function shapeDeliverySnapshot(text: string): Promise<DeliverySnapshot> {
  const plan = parseDeliveryPlanSource(text);
  return { plan, revision: await deliveryPlanRevision(text) };
}
