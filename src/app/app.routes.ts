import { AUTHOR_DOCUMENTS_CLIENT } from './core/author-documents-client';
import { AuthorDocumentsApi } from './core/author-documents-api';
import { AUTHOR_REVIEW_CLIENT } from './pages/author-previews/author-review-client';
import { AuthorReviewApi } from './pages/author-previews/author-review-api';
import { Routes } from '@angular/router';
import { authorGuard } from './core/author-access';
import { SIGN_IN_CHALLENGE_CLIENT } from './pages/account/sign-in-challenge-client';
import { SignInManagementApi } from './pages/account/sign-in-management-api';
import type { DeliveryPlanPage } from './pages/delivery-plan/delivery-plan';
import { legacyAiItemRedirect, legacyAiModuleRedirect } from './content/ai-route-compatibility';
import { legacyInterviewSearchRedirect } from './content/search-route-compatibility';

export const routes: Routes = [
  {
    path: 'author/operations',
    canActivate: [authorGuard],
    providers: [{ provide: AUTHOR_DOCUMENTS_CLIENT, useExisting: AuthorDocumentsApi }],
    loadComponent: () =>
      import('./pages/author-operations/author-operations').then(
        (page) => page.AuthorOperationsPage,
      ),
  },
  {
    path: 'author/previews/study-plan',
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
    path: 'author/previews',
    canActivate: [authorGuard],
    loadComponent: () =>
      import('./pages/author-previews/author-previews').then((page) => page.AuthorPreviewsPage),
  },
  {
    path: 'author/architecture',
    canActivate: [authorGuard],
    data: { architectureOnly: true },
    loadComponent: () =>
      import('./pages/author-previews/author-previews').then((page) => page.AuthorPreviewsPage),
  },
  {
    path: 'author/api',
    canActivate: [authorGuard],
    loadComponent: () => import('./pages/author-api/author-api').then((page) => page.AuthorApiPage),
  },
  {
    path: 'author',
    canActivate: [authorGuard],
    loadComponent: () => import('./pages/author/author').then((page) => page.AuthorPage),
  },
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
    canActivate: [authorGuard],
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
    loadComponent: () => import('./pages/question/question').then((page) => page.Question),
  },
  {
    path: 'grow/:courseId',
    data: { pathId: 'grow' },
    loadComponent: () => import('./pages/course/course').then((page) => page.Course),
  },
  {
    path: 'look-ahead',
    loadComponent: () => import('./pages/look-ahead/look-ahead').then((page) => page.LookAhead),
  },
  {
    path: 'look-ahead/ai-assisted-development/module/:moduleId',
    redirectTo: legacyAiModuleRedirect,
  },
  {
    path: 'look-ahead/ai-assisted-development/:questionId',
    redirectTo: legacyAiItemRedirect,
  },
  {
    path: 'look-ahead/ai-assisted-development',
    redirectTo: 'grow/ai-assisted-development',
    pathMatch: 'full',
  },
  {
    path: 'look-ahead/:courseId/module/:moduleId',
    data: { pathId: 'look-ahead' },
    loadComponent: () => import('./pages/module/module').then((page) => page.Module),
  },
  {
    path: 'look-ahead/:courseId/:questionId',
    data: { pathId: 'look-ahead' },
    loadComponent: () => import('./pages/question/question').then((page) => page.Question),
  },
  {
    path: 'look-ahead/:courseId',
    data: { pathId: 'look-ahead' },
    loadComponent: () => import('./pages/course/course').then((page) => page.Course),
  },
  {
    path: 'learn/hands-on-dsa',
    loadComponent: () =>
      import('./pages/hands-on-dsa/hands-on-dsa').then((page) => page.HandsOnDsa),
  },
  {
    path: 'learn/:courseId/module/:moduleId',
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
    loadComponent: () => import('./pages/question/question').then((page) => page.Question),
  },
  {
    path: 'learn/:courseId',
    loadComponent: () => import('./pages/course/course').then((page) => page.Course),
  },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found').then((page) => page.NotFoundPage),
  },
];
