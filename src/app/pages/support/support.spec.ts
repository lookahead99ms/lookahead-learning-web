import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SupportPage } from './support';
import { SupportRequestForm } from './support-request-form';
import { AdminReviewsPage } from '../admin-reviews/admin-reviews';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import {
  PLATFORM_REVIEW_CLIENT,
  PlatformReviewError,
  PlatformReviewViewer,
} from '../admin-reviews/platform-review.model';

@Component({ selector: 'app-platform-header', template: '' })
class HeaderStub {}
@Component({ selector: 'app-support-request-form', template: '<p>contact form</p>' })
class FormStub {}
@Component({ selector: 'app-admin-reviews', template: '<p>review items</p>' })
class ReviewsStub {}

async function open(url: string, viewer: () => Promise<PlatformReviewViewer>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'support', component: SupportPage }]),
      {
        provide: StudyPlanAccount,
        useValue: {
          account: signal({ accountId: 'a' }),
          sessionExpired: () => false,
          initialize: async () => {},
        },
      },
      { provide: PLATFORM_REVIEW_CLIENT, useValue: { viewer } },
    ],
  });
  TestBed.overrideComponent(SupportPage, {
    remove: { imports: [PlatformHeader, SupportRequestForm, AdminReviewsPage] },
    add: { imports: [HeaderStub, FormStub, ReviewsStub] },
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, SupportPage);
  // Let the account and review-access checks settle.
  await new Promise((resolve) => setTimeout(resolve));
  await harness.fixture.whenStable();
  harness.detectChanges();
  return harness;
}

const reviewer = async (): Promise<PlatformReviewViewer> => ({
  role: 'reviewer',
  reviewerId: 'r',
  displayName: 'Reviewer',
});

describe('Support and feedback page', () => {
  it('shows only Contact support to an account without review access', async () => {
    const harness = await open('/support?view=reviews', async () => {
      throw new PlatformReviewError('forbidden');
    });
    const root = harness.routeNativeElement!;
    expect(root.querySelector('[role="tablist"]')).toBeNull();
    expect(root.textContent).toContain('contact form');
    expect(root.textContent).not.toContain('review items');
  });

  it('shows only Contact support to a learner or test account the service answers with role "user" (DLV-971)', async () => {
    const harness = await open('/support?view=reviews', async () => ({ ...(await reviewer()), role: 'user' }));
    const root = harness.routeNativeElement!;
    expect(root.querySelector('[role="tablist"]')).toBeNull();
    expect(root.textContent).toContain('contact form');
    expect(root.textContent).not.toContain('review items');
    expect(root.querySelector('.tips-note')).toBeNull();
  });

  it('gives reviewers Write Review (form above the support form) and Team Reviews, and keeps the tab in the address', async () => {
    const harness = await open('/support', reviewer);
    const root = harness.routeNativeElement!;
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      '📝 Write Review',
      '🧪 Team Reviews Reviewer',
    ]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    // DLV-971: the add-item panel sits above the support form; the tips point at Team Reviews.
    const panels = [...root.querySelectorAll('.support-body > section')].map((panel) => panel.getAttribute('aria-label') ?? panel.getAttribute('aria-labelledby'));
    expect(panels).toEqual(['Write Review', 'contact-heading']);
    expect(root.querySelector('.submit-panel app-admin-reviews')?.getAttribute('section')).toBe('submit');
    expect(root.querySelector('.tips-note')?.textContent?.replace(/\s+/g, ' ')).toContain('Team Reviews');
    tabs[1].click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/support?view=reviews');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(root.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(
      'support-tab-reviews',
    );
    expect(root.textContent).toContain('review items');
    expect(root.querySelector('[aria-label="Team Reviews"] app-admin-reviews')?.getAttribute('section')).toBe('submitted');
    expect(root.textContent).not.toContain('contact form');
  });

  it('opens the reviews tab directly from the former /admin/reviews address', async () => {
    const harness = await open('/support?view=reviews', async () => ({
      ...(await reviewer()),
      role: 'owner',
    }));
    const root = harness.routeNativeElement!;
    expect(root.querySelector('#support-tab-reviews')?.textContent).toContain('Owner');
    expect(root.textContent).toContain('review items');
    expect(root.textContent).not.toContain('contact form');
  });
});
