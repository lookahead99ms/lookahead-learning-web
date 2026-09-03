import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/landing/landing').then((page) => page.Landing) },
  { path: 'learn', loadComponent: () => import('./pages/learn/learn').then((page) => page.Learn) },
  { path: 'grow', loadComponent: () => import('./pages/grow/grow').then((page) => page.Grow) },
  {
    path: 'search',
    loadComponent: () => import('./pages/search/search').then((page) => page.Search),
  },
  {
    path: 'interview-questions',
    data: { experience: 'interview-questions' },
    loadComponent: () => import('./pages/search/search').then((page) => page.Search),
  },
  {
    path: 'study-plan',
    loadComponent: () => import('./pages/study-plan/study-plan').then((page) => page.StudyPlanPage),
  },
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
  { path: '**', redirectTo: '' },
];
