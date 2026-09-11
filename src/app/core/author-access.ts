import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StudyPlanAccount } from '../pages/study-plan/study-plan-account';

/** The UI capability comes from the authenticated API, never a URL or browser flag. */
export const authorGuard: CanActivateFn = async (_route, state) => {
  const accounts = inject(StudyPlanAccount),
    router = inject(Router);
  await accounts.initialize();
  if (!accounts.account() || accounts.sessionExpired())
    return router.createUrlTree(['/sign-in'], { queryParams: { returnTo: state.url } });
  return accounts.account()?.authorPreview === true || router.createUrlTree(['/study-plan']);
};
