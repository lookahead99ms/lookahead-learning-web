import { InjectionToken, Signal, computed, inject } from '@angular/core';
import { SearchDocument } from '../../content/content.models';
import { PROTECTED_CONTENT } from '../../content/content-delivery';
import { StudyPlanAccount } from './study-plan-account';

/** Planning filter over account grants; protected content also enforces access server-side. */
export interface StudyPlanAccess {
  status: Signal<'ready' | 'loading' | 'error'>;
  description: string;
  canSchedule(document: SearchDocument): boolean;
}

export const STUDY_PLAN_ACCESS = new InjectionToken<StudyPlanAccess>('Study plan access', {
  providedIn: 'root',
  factory: () => {
    const accounts = inject(StudyPlanAccount);
    const protectedContent = inject(PROTECTED_CONTENT);
    return {
      status: computed(() => (accounts.sessionExpired() ? 'error' : 'ready')),
      get description() {
        return accounts.account()
          ? 'Offerings follow your account access. Saved history remains when access changes.'
          : 'Preview a plan using the content available to you.';
      },
      canSchedule: (document: SearchDocument) => {
        const account = accounts.account();
        if (!account)
          return protectedContent
            ? document.access.public === true
            : document.access.tier === 'free';
        return (
          !accounts.sessionExpired() &&
          (account.contentGrants?.includes(document.canonicalContentId ?? document.id) ||
            document.access.scopes?.some((scope) => account.topicGrants.includes(scope)) ||
            account.topicGrants.includes(`${document.path}:${document.courseId}`) ||
            (document.contentType === 'dsa-problem' &&
              account.topicGrants.includes('learn:hands-on-dsa')))
        );
      },
    };
  },
});
