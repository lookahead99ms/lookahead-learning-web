import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { authorGuard, signedInGuard, accessGuard } from './author-access';
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
      account.set({permissions});expect(TestBed.inject(Router).serializeUrl(await reader() as any)).toBe('/study-plan');
    }
    account.set(null);expect(TestBed.inject(Router).serializeUrl(await reader() as any)).toContain('/sign-in?');
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
    expect(TestBed.inject(Router).serializeUrl((await access()) as any)).toBe('/study-plan');
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
