import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { routes } from '../../app.routes';
import { ContentService } from '../../content/content.service';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { PricingPage } from './pricing';
import { START_FREE_ROUTE } from './pricing-plans';

describe('/pricing route (DLV-209)', () => {
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

  it('opens for signed-out visitors too: everyone can see prices, buying needs an account', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/pricing', PricingPage);
    expect(TestBed.inject(Router).url).toBe('/pricing');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent?.trim()).toBe(
      'Start free. Pay for the catalogs you need.',
    );
  });

  it('opens the sample pricing page for a signed-in learner, with the shared header and a page title', async () => {
    TestBed.inject(StudyPlanAccount).account.set({
      accountId: 'learner',
      username: 'learner@example.test',
      displayName: 'Learner',
      topicGrants: [],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/pricing', PricingPage);
    expect(TestBed.inject(Router).url).toBe('/pricing');
    const page = harness.routeNativeElement!;
    expect(page.querySelector('app-platform-header')).not.toBeNull();
    expect(page.querySelector('main#main-content')).not.toBeNull();
    expect(page.querySelector('h1')?.textContent?.trim()).toBe(
      'Start free. Pay for the catalogs you need.',
    );
    expect(document.title).toContain('Pricing');
  });

  it('links Start free to a route the app has', () => {
    expect(routes.some((route) => `/${route.path}` === START_FREE_ROUTE)).toBe(true);
  });
});
