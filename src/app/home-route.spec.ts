import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { routes } from './app.routes';
import { ContentService } from './content/content.service';
import { Landing } from './pages/landing/landing';
import { StudyPlanAccount } from './pages/study-plan/study-plan-account';

describe('canonical homepage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
      ],
    });
    vi.spyOn(TestBed.inject(StudyPlanAccount), 'initialize').mockResolvedValue();
  });

  it.each([
    ['signed out', false, false, false],
    ['learner without plans', true, false, false],
    ['learner with a plan', true, false, true],
    ['author without plans', true, true, false],
    ['author with a plan', true, true, true],
  ] as const)('keeps Landing at / for %s', async (_label, signedIn, author, hasPlan) => {
    const store = TestBed.inject(StudyPlanAccount);
    if (signedIn)
      store.account.set({
        accountId: 'sample',
        username: 'sample@example.test',
        displayName: 'Sample learner',
        authorPreview: author,
        topicGrants: ['learn:sample'],
      });
    if (hasPlan)
      store.plans.set([
        {
          planId: 'sample-plan',
          goal: 'Sample plan',
          revision: 1,
          updatedAt: '2026-09-19T00:00:00Z',
        },
      ]);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/', Landing);
    expect(TestBed.inject(Router).url).toBe('/');
    expect(
      harness.routeNativeElement?.querySelector('.hero-slide.active h1')?.textContent,
    ).toContain('Become the engineer');
    expect(
      harness.routeNativeElement
        ?.querySelector('a[aria-label="Look Ahead home"]')
        ?.getAttribute('href'),
    ).toBe('/');
    expect(
      harness.routeNativeElement?.querySelector(
        'a.navigation-utility[href="/study-plan?view=plans"]',
      ),
    ).not.toBeNull();
  });

  it('stays on Landing while identity, plan state and expiry change', async () => {
    const harness = await RouterTestingHarness.create();
    const landing = await harness.navigateByUrl('/#paths', Landing);
    const store = TestBed.inject(StudyPlanAccount);
    store.account.set({
      accountId: 'sample',
      username: 'sample@example.test',
      displayName: 'Sample author',
      authorPreview: true,
      topicGrants: [],
    });
    store.plans.set([
      {
        planId: 'sample-plan',
        goal: 'Sample plan',
        revision: 1,
        updatedAt: '2026-09-19T00:00:00Z',
      },
    ]);
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/#paths');
    store.sessionExpired.set(true);
    harness.detectChanges();
    expect(harness.routeDebugElement?.componentInstance).toBe(landing);
    expect(TestBed.inject(Router).url).toBe('/#paths');
  });
});
