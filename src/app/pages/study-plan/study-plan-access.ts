import { InjectionToken, Signal, signal } from '@angular/core';
import { SearchDocument } from '../../content/content.models';

/** Replace this boundary with trusted account access when that service exists.
 * It is a planning filter; protected content must also enforce access server-side.
 */
export interface StudyPlanAccess {
  status: Signal<'ready' | 'loading' | 'error'>;
  description: string;
  canSchedule(document: SearchDocument): boolean;
}

export const STUDY_PLAN_ACCESS = new InjectionToken<StudyPlanAccess>('Study plan access', {
  providedIn: 'root',
  factory: () => ({
    status: signal<'ready'>('ready'),
    description:
      'Available published content is selectable. Account-based access is not connected.',
    canSchedule: (document) => document.access.tier === 'free',
  }),
});
