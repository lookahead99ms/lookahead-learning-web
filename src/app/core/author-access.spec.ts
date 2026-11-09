import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { authorGuard, signedInGuard, accessGuard, previewsGuard, documentationGuard } from './author-access';
import { StudyPlanAccount } from '../pages/study-plan/study-plan-account';

describe('author workspace access', () => {
  const account = signal<any>(null),
    expired = signal(false);
  beforeEach(() => {
    account.set(null);
    expired.set(false);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: StudyPlanAccount,
          useValue: { account, sessionExpired: expired, initialize: async () => {} },
        },
      ],
    });
  });
  const access = () =>
    TestBed.runInInjectionContext(() => authorGuard({} as any, { url: '/admin' } as any));
  it('shows access readers only their server-authorized surface', async () => {
    const reader = () => TestBed.runInInjectionContext(() => accessGuard({} as any, {url:'/admin/access'} as any));
    for (const permissions of [{manageAccess:true},{triageFeedback:true},{feedbackRole:'co-author'}]) {
      account.set({permissions});expect(await reader()).toBe(true);
    }
    for (const permissions of [{feedbackRole:'tester'},{feedbackRole:'reviewer'},{}]) {
      account.set({permissions});expect(TestBed.inject(Router).serializeUrl(await reader() as any)).toBe('/welcome?access=denied');
    }
    account.set(null);expect(TestBed.inject(Router).serializeUrl(await reader() as any)).toContain('/sign-in?');
  });
  it('opens Previews and Architecture to the owner and co-authors only, and sends everyone else to the no-access page', async () => {
    const previews = () => TestBed.runInInjectionContext(() => previewsGuard({} as any, { url: '/admin/architecture' } as any));
    const router = () => TestBed.inject(Router);
    for (const value of [{ authorPreview: true }, { permissions: { feedbackRole: 'co-author', previewDocuments: true } }]) {
      account.set(value); expect(await previews()).toBe(true);
    }
    for (const role of ['admin', 'reviewer', 'tester']) {
      account.set({ permissions: { feedbackRole: role, previewDocuments: role !== 'tester' } });
      expect(router().serializeUrl(await previews() as any)).toBe('/welcome?access=denied');
    }
    account.set(null);
    expect(router().serializeUrl(await previews() as any)).toBe('/sign-in?returnTo=%2Fadmin%2Farchitecture');
  });
  it('opens each documentation page only to the roles its group is written for, and sends others to Documentation (owner, 2026-11-09)', async () => {
    const docs = (url: string) => TestBed.runInInjectionContext(() => documentationGuard({} as any, { url } as any));
    const router = () => TestBed.inject(Router);
    const result = async (url: string) => { const r = await docs(url); return r === true ? true : router().serializeUrl(r as any); };
    account.set({ permissions: { manageAccess: true, previewDocuments: true, feedbackRole: 'owner' } });
    for (const url of ['/admin/screen-names', '/admin/api', '/admin/local-development', '/admin/aws-deployment', '/admin/operations', '/admin/aws-dev-status#records']) expect(await result(url)).toBe(true);
    account.set({ permissions: { previewDocuments: true, feedbackRole: 'co-author' } });
    for (const url of ['/admin/screen-names', '/admin/api', '/admin/local-development', '/admin/authentication']) expect(await result(url)).toBe(true);
    for (const url of ['/admin/aws-deployment', '/admin/operations', '/admin/release-gates', '/admin/support-runbooks']) expect(await result(url)).toBe('/admin/docs');
    account.set({ permissions: { previewDocuments: true, triageFeedback: true, feedbackRole: 'admin' } });
    for (const url of ['/admin/screen-names', '/admin/local-development', '/admin/plans']) expect(await result(url)).toBe(true);
    for (const url of ['/admin/api', '/admin/aws-deployment', '/admin/operations', '/admin/architecture']) expect(await result(url)).toBe('/admin/docs');
    account.set({ permissions: { previewDocuments: true, feedbackRole: 'reviewer' } });
    expect(await result('/admin/reviewer-guide')).toBe(true);
    for (const url of ['/admin/local-development', '/admin/api', '/admin/operations']) expect(await result(url)).toBe('/admin/docs');
    // Not a documentation page: this guard stays out of the way.
    expect(await result('/admin/feedback')).toBe(true);
    account.set(null);
    expect(await result('/admin/operations')).toBe('/sign-in?returnTo=%2Fadmin%2Foperations');
  });
  it('preserves the admin destination through sign-in', async () => {
    expect(TestBed.inject(Router).serializeUrl((await access()) as any)).toBe(
      '/sign-in?returnTo=%2Fadmin',
    );
  });
  it('does not infer capability from username, display name, or paid content grants', async () => {
    account.set({
      username: 'author@lookahead.test',
      displayName: 'Author',
      topicGrants: ['learn:core-java'],
    });
    expect(TestBed.inject(Router).serializeUrl((await access()) as any)).toBe('/welcome?access=denied');
  });
  it('accepts the authenticated server capability and rejects it after session expiry', async () => {
    account.set({ authorPreview: true });
    expect(await access()).toBe(true);
    expired.set(true);
    expect(TestBed.inject(Router).serializeUrl((await access()) as any)).toContain('/sign-in?');
  });
  it('lets any signed-in account reach Platform reviews, where the server decides the role', async () => {
    const reviews = () =>
      TestBed.runInInjectionContext(() =>
        signedInGuard({} as any, { url: '/admin/reviews' } as any),
      );
    expect(TestBed.inject(Router).serializeUrl((await reviews()) as any)).toBe(
      '/sign-in?returnTo=%2Fadmin%2Freviews',
    );
    account.set({ username: 'reviewer@example.test' });
    expect(await reviews()).toBe(true);
    expired.set(true);
    expect(TestBed.inject(Router).serializeUrl((await reviews()) as any)).toContain('/sign-in?');
  });
});
