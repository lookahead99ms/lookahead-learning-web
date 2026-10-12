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

/**
 * DLV-928: Platform reviews only needs a signed-in account here. The review service decides the
 * owner or reviewer role on every request; everyone else sees "Review access required".
 */
export const signedInGuard: CanActivateFn = async (_route, state) => {
  const accounts = inject(StudyPlanAccount),
    router = inject(Router);
  await accounts.initialize();
  return accounts.account() && !accounts.sessionExpired()
    ? true
    : router.createUrlTree(['/sign-in'], { queryParams: { returnTo: state.url } });
};

/** Staff permission checks remain server-enforced; these guards only guide navigation. */
function permissionGuard(permission: 'manageAccess' | 'previewDocuments' | 'deliveryRead'): CanActivateFn {
  return async (_route, state) => {
    const accounts = inject(StudyPlanAccount), router = inject(Router);
    await accounts.initialize();
    const account = accounts.account();
    if (!account || accounts.sessionExpired())
      return router.createUrlTree(['/sign-in'], { queryParams: { returnTo: state.url } });
    return (account.permissions?.[permission] ?? account.authorPreview === true)
      || router.createUrlTree(['/study-plan']);
  };
}
export const ownerGuard = permissionGuard('manageAccess');
export const staffGuard = permissionGuard('previewDocuments');
export const deliveryGuard = permissionGuard('deliveryRead');
