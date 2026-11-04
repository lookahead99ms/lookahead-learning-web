import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StudyPlanAccount } from '../pages/study-plan/study-plan-account';
import { canSeePreviews } from './author-workspace-nav/author-workspace-links';

/**
 * DLV-969 (owner, 2026-11-04): a page your account cannot open shows a plain "not open to your account" notice with
 * the Essence, never the Study Plan page.
 */
export const noAccessPage = (router: Router) => router.createUrlTree(['/welcome'], { queryParams: { access: 'denied' } });

/** The UI capability comes from the authenticated API, never a URL or browser flag. */
export const authorGuard: CanActivateFn = async (_route, state) => {
  const accounts = inject(StudyPlanAccount),
    router = inject(Router);
  await accounts.initialize();
  if (!accounts.account() || accounts.sessionExpired())
    return router.createUrlTree(['/sign-in'], { queryParams: { returnTo: state.url } });
  return accounts.account()?.authorPreview === true || noAccessPage(router);
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
      || noAccessPage(router);
  };
}
export const ownerGuard = permissionGuard('manageAccess');
export const staffGuard = permissionGuard('previewDocuments');
export const deliveryGuard = permissionGuard('deliveryRead');

/** DLV-969 (owner, 2026-11-04): Previews and Architecture are the owner's and co-authors'; other staff go to Documentation. */
export const previewsGuard: CanActivateFn = async (_route, state) => {
  const accounts = inject(StudyPlanAccount), router = inject(Router);
  await accounts.initialize();
  const account = accounts.account();
  if (!account || accounts.sessionExpired())
    return router.createUrlTree(['/sign-in'], { queryParams: { returnTo: state.url } });
  if (canSeePreviews(account)) return true;
  return noAccessPage(router);
};

export const accessGuard: CanActivateFn = async (_route, state) => {
  const accounts = inject(StudyPlanAccount), router = inject(Router);
  await accounts.initialize();
  const account = accounts.account();
  if (!account || accounts.sessionExpired()) return router.createUrlTree(['/sign-in'], { queryParams: { returnTo: state.url } });
  const permissions = account.permissions;
  return !!(permissions?.manageAccess || permissions?.triageFeedback || permissions?.feedbackRole === 'co-author' || (!permissions && account.authorPreview)) || noAccessPage(router);
};
