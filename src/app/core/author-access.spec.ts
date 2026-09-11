import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { authorGuard } from './author-access';
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
    TestBed.runInInjectionContext(() => authorGuard({} as any, { url: '/author' } as any));
  it('preserves the author destination through sign-in', async () => {
    expect(TestBed.inject(Router).serializeUrl((await access()) as any)).toBe(
      '/sign-in?returnTo=%2Fauthor',
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
});
