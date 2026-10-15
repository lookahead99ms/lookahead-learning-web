import { AUTHOR_DOCUMENTS_CLIENT } from './core/author-documents-client';
import { AuthorDocumentsApi } from './core/author-documents-api';
import { AUTHOR_REVIEW_CLIENT } from './pages/author-previews/author-review-client';
import { AuthorReviewApi } from './pages/author-previews/author-review-api';
import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { PLATFORM_REVIEW_CLIENT } from './pages/admin-reviews/platform-review.model';
import { ConnectedPlatformReviewClient } from './pages/admin-reviews/connected-platform-review-client';
import { authorGuard, ownerGuard, staffGuard, deliveryGuard } from './core/author-access';
import { SIGN_IN_CHALLENGE_CLIENT } from './pages/account/sign-in-challenge-client';
import { SignInManagementApi } from './pages/account/sign-in-management-api';
import type { DeliveryPlanPage } from './pages/delivery-plan/delivery-plan';
import { legacyAiItemRedirect, legacyAiModuleRedirect } from './content/ai-route-compatibility';
import { legacyInterviewSearchRedirect } from './content/search-route-compatibility';
import { retiredContentRedirect } from './content/retired-content-routes';

export const routes: Routes = [
  { path: 'admin/access', canActivate: [ownerGuard], loadComponent: () => import('./pages/admin-access/admin-access').then(page => page.AdminAccessPage) },
  { path: 'admin/content-access', canActivate: [staffGuard], loadComponent: () => import('./pages/author-content-access/author-content-access').then(page => page.AuthorContentAccess) },
  {
    path: 'admin/operations',
    canActivate: [staffGuard],
    providers: [{ provide: AUTHOR_DOCUMENTS_CLIENT, useExisting: AuthorDocumentsApi }],
    loadComponent: () =>
      import('./pages/author-operations/author-operations').then(
        (page) => page.AuthorOperationsPage,
      ),
  },
  // DLV-926: each documentation route names one published private document.
  ...(
    [
      ['admin/local-development', 'local-development'],
      ['admin/review-guide', 'reviewer-guide'],
      ['admin/screen-names', 'screen-names'],
      ['admin/access-checks', 'access-checks'],
      ['admin/authentication', 'authentication'],
      ['admin/authentication-walkthrough', 'authentication-walkthrough'],
      ['admin/aws-deployment', 'aws-deployment'],
      ['admin/aws-dev-plan', 'aws-dev-plan'],
      ['admin/aws-dev-decisions', 'aws-dev-decisions'],
      ['admin/aws-dev-operations', 'aws-dev-operations'],
      ['admin/aws-dev-permissions', 'aws-dev-permissions'],
      ['admin/aws-dev-budget', 'aws-dev-budget'],
      ['admin/aws-dev-status', 'aws-dev-status'],
      ['admin/aws-dev-setup', 'aws-dev-setup'],
      ['admin/aws-dev-workflow', 'aws-dev-workflow'],
      ['admin/aws-candidate-design', 'aws-candidate-design'],
      ['admin/aws-candidate-files', 'aws-candidate-files'],
      ['admin/aws-candidate-commands', 'aws-candidate-commands'],
      ['admin/aws-candidate-updates', 'aws-candidate-updates'],
      ['admin/release-gates', 'release-gates'],
      ['admin/production-support', 'production-support'],
      ['admin/support-runbooks', 'support-runbooks'],
    ] as const
  ).map(([path, authorDocument]) => ({
    path,
    canActivate: [staffGuard],
    data: { authorDocument },
    providers: [{ provide: AUTHOR_DOCUMENTS_CLIENT, useExisting: AuthorDocumentsApi }],
    loadComponent: () =>
      import('./pages/author-operations/author-operations').then(
        (page) => page.AuthorOperationsPage,
      ),
  })),
  // Platform reviews are a tab of Support and feedback; the old address opens that tab.
  { path: 'admin/reviews', redirectTo: () => inject(Router).parseUrl('/support?view=reviews') },
  {
    path: 'admin/docs',
    canActivate: [staffGuard],
    loadComponent: () =>
      import('./pages/author-docs/author-docs').then((page) => page.AuthorDocsPage),
  },
  {
    path: 'admin/previews/study-plan',
    canActivate: [authorGuard],
    providers: [{ provide: AUTHOR_REVIEW_CLIENT, useExisting: AuthorReviewApi }],
    loadComponent: () =>
      import('./pages/author-previews/author-review').then((page) => page.AuthorReviewPage),
  },
  {
    path: 'sign-in/choose',
    providers: [{ provide: SIGN_IN_CHALLENGE_CLIENT, useExisting: SignInManagementApi }],
    loadComponent: () =>
      import('./pages/account/sign-in-challenge').then((page) => page.SignInChallengePage),
  },
  {
    path: 'admin/previews',
    canActivate: [staffGuard],
    loadComponent: () =>
      import('./pages/author-previews/author-previews').then((page) => page.AuthorPreviewsPage),
  },
  {
    path: 'admin/architecture',
    canActivate: [staffGuard],
    data: { architectureOnly: true },
    loadComponent: () =>
      import('./pages/author-previews/author-previews').then((page) => page.AuthorPreviewsPage),
  },
  {
    path: 'admin/api',
    canActivate: [staffGuard],
    loadComponent: () => import('./pages/author-api/author-api').then((page) => page.AuthorApiPage),
  },
  // DLV-926: the admin area lives under /admin; /admin itself opens Previews.
  { path: 'admin', pathMatch: 'full', redirectTo: 'admin/previews' },
  // Former /author addresses keep working (bookmarks, evidence, gateway sign-in return).
  { path: 'author', pathMatch: 'full', redirectTo: 'admin/previews' },
  { path: 'author/previews/study-plan', redirectTo: 'admin/previews/study-plan' },
  { path: 'author/:page', redirectTo: 'admin/:page' },
  {
    path: 'sign-in',
    data: { accountMode: 'signin' },
    loadComponent: () => import('./pages/account/account').then((page) => page.AccountPage),
  },
  {
    path: 'sign-up',
    data: { accountMode: 'signup' },
    loadComponent: () => import('./pages/account/account').then((page) => page.AccountPage),
  },
  {
    path: 'support',
    // DLV-928: the shared review service; the server decides owner, reviewer or no access.
    providers: [{ provide: PLATFORM_REVIEW_CLIENT, useClass: ConnectedPlatformReviewClient }],
    loadComponent: () => import('./pages/support/support').then((page) => page.SupportPage),
  },
  {
    path: 'account',
    loadComponent: () => import('./pages/account/account').then((page) => page.AccountPage),
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/landing/landing').then((page) => page.Landing),
  },
  { path: 'learn', loadComponent: () => import('./pages/learn/learn').then((page) => page.Learn) },
  { path: 'grow', loadComponent: () => import('./pages/grow/grow').then((page) => page.Grow) },
  {
    path: 'search',
    canActivate: [retiredContentRedirect],
    loadComponent: () => import('./pages/search/search').then((page) => page.Search),
  },
  {
    path: 'interview-questions',
    pathMatch: 'full',
    redirectTo: legacyInterviewSearchRedirect,
  },
  {
    path: 'study-plan',
    loadComponent: () => import('./pages/study-plan/study-plan').then((page) => page.StudyPlanPage),
  },
  {
    path: 'delivery-plan',
    canActivate: [deliveryGuard],
    canDeactivate: [(page: DeliveryPlanPage) => page.canDeactivate()],
    loadComponent: () =>
      import('./pages/delivery-plan/delivery-plan').then((page) => page.DeliveryPlanPage),
  },
  { path: 'delivery', redirectTo: 'delivery-plan', pathMatch: 'full' },
  {
    path: 'grow/:courseId/module/:moduleId',
    data: { pathId: 'grow' },
    loadComponent: () => import('./pages/module/module').then((page) => page.Module),
  },
  {
    path: 'grow/:courseId/:questionId',
    data: { pathId: 'grow' },
    // DLV-410: a removed question's route opens its lesson (retired-content-ids.json).
    canActivate: [retiredContentRedirect],
    loadComponent: () => import('./pages/question/question').then((page) => page.Question),
  },
  {
    path: 'grow/:courseId',
    data: { pathId: 'grow' },
    loadComponent: () => import('./pages/course/course').then((page) => page.Course),
  },
  // Blaze catalog. Old /look-ahead/... links open here through CatalogUrlSerializer (core/catalog-url.ts).
  {
    path: 'blaze',
    loadComponent: () => import('./pages/blaze/blaze').then((page) => page.Blaze),
  },
  {
    path: 'blaze/ai-assisted-development/module/:moduleId',
    redirectTo: legacyAiModuleRedirect,
  },
  {
    path: 'blaze/ai-assisted-development/:questionId',
    redirectTo: legacyAiItemRedirect,
  },
  {
    path: 'blaze/ai-assisted-development',
    redirectTo: 'grow/ai-assisted-development',
    pathMatch: 'full',
  },
  {
    path: 'blaze/:courseId/module/:moduleId',
    data: { pathId: 'blaze' },
    loadComponent: () => import('./pages/module/module').then((page) => page.Module),
  },
  {
    path: 'blaze/:courseId/:questionId',
    data: { pathId: 'blaze' },
    loadComponent: () => import('./pages/question/question').then((page) => page.Question),
  },
  {
    path: 'blaze/:courseId',
    data: { pathId: 'blaze' },
    loadComponent: () => import('./pages/course/course').then((page) => page.Course),
  },
  {
    path: 'learn/hands-on-dsa',
    canActivate: [retiredContentRedirect],
    loadComponent: () =>
      import('./pages/hands-on-dsa/hands-on-dsa').then((page) => page.HandsOnDsa),
  },
  {
    path: 'learn/:courseId/module/:moduleId',
    canActivate: [retiredContentRedirect],
    loadComponent: () => import('./pages/module/module').then((page) => page.Module),
  },
  {
    path: 'learn/:courseId/section/theory',
    redirectTo: 'learn/:courseId',
    pathMatch: 'full',
  },
  {
    path: 'learn/:courseId/section/:sectionId',
    loadComponent: () =>
      import('./pages/course-section/course-section').then((page) => page.CourseSection),
  },
  {
    path: 'learn/:courseId/:questionId',
    canActivate: [retiredContentRedirect],
    loadComponent: () => import('./pages/question/question').then((page) => page.Question),
  },
  {
    path: 'learn/:courseId',
    canActivate: [retiredContentRedirect],
    // Re-check on fragment-only changes so an old #unit- anchor also redirects in-app.
    runGuardsAndResolvers: 'always',
    loadComponent: () => import('./pages/course/course').then((page) => page.Course),
  },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found').then((page) => page.NotFoundPage),
  },
];
