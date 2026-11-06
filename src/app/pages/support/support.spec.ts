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

const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();
const lede =
  'A broken page, an idea, or a question. We answer by email and every request gets a reference.';

describe('Support and feedback page', () => {
  it('gives an account without review access one card: the tips, then the request form, and no aside', async () => {
    const harness = await open('/support?view=reviews', async () => {
      throw new PlatformReviewError('forbidden');
    });
    const root = harness.routeNativeElement!;
    expect(root.querySelector('[role="tablist"]')).toBeNull();
    expect(root.textContent).not.toContain('review items');
    const cards = [...root.querySelectorAll('.support-body > *')];
    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card.querySelector('h2')?.id).toBe('contact-heading');
    expect(text(card.querySelector('h2'))).toBe('Need a reply from us?');
    expect(text(card.querySelector('.card-lede'))).toBe(lede);
    expect(text(card.querySelector('app-report-tips .tips-label'))).toBe('A helpful report');
    expect(card.querySelectorAll('app-report-tips li')).toHaveLength(4);
    // The tips come before the request form (whose first control is the kind picker).
    const tips = card.querySelector('app-report-tips')!;
    const form = card.querySelector('app-support-request-form')!;
    expect(tips.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(root.textContent).toContain('contact form');
    expect(root.querySelector('aside')).toBeNull();
    expect(root.querySelector('.tips')).toBeNull();
    expect(root.querySelector('.request-fold')).toBeNull();
  });

  it('gives a learner or test account the service answers with role "user" the same single card (DLV-971)', async () => {
    const harness = await open('/support?view=reviews', async () => ({ ...(await reviewer()), role: 'user' }));
    const root = harness.routeNativeElement!;
    expect(root.querySelector('[role="tablist"]')).toBeNull();
    expect(root.querySelectorAll('.support-body > *')).toHaveLength(1);
    expect(text(root.querySelector('#contact-heading'))).toBe('Need a reply from us?');
    expect(root.querySelector('app-report-tips')).not.toBeNull();
    expect(root.textContent).toContain('contact form');
    expect(root.textContent).not.toContain('review items');
    expect(root.querySelector('aside')).toBeNull();
  });

  it('gives reviewers Write Review (the review card, then a folded request) and Team Reviews, and keeps the tab in the address', async () => {
    const harness = await open('/support', reviewer);
    const root = harness.routeNativeElement!;
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map(text)).toEqual(['📝 Write Review', '🧪 Team Reviews Reviewer']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    // DLV-971: the review card comes first and full width; the support request is folded under it.
    const children = [...root.querySelectorAll('.support-body > *')];
    expect(children.map((child) => child.tagName.toLowerCase() + '.' + child.className.split(' ')[0])).toEqual([
      'section.panel',
      'button.request-fold',
    ]);
    expect(children[0].getAttribute('aria-label')).toBe('Write Review');
    expect(root.querySelector('.submit-panel app-admin-reviews')?.getAttribute('section')).toBe('submit');
    expect(root.querySelector('aside')).toBeNull();
    expect(root.querySelector('.tips-note')).toBeNull();
    expect(root.querySelector('app-report-tips')).toBeNull(); // the stubbed review card carries them
    const fold = root.querySelector<HTMLButtonElement>('.request-fold')!;
    expect(fold.getAttribute('type')).toBe('button');
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    expect(text(fold.querySelector('.fold-text'))).toBe('Not a review item? Send a request and get a reply by email.');
    expect(text(fold.querySelector('.fold-text b'))).toBe('Not a review item?');
    expect([...fold.querySelectorAll('.fold-chip')].map(text)).toEqual([
      '🐞 Report a problem',
      '💡 Share feedback',
      '❓ Ask a question',
    ]);
    expect(fold.querySelector('.fold-chevron')).not.toBeNull();
    expect(root.querySelector('#request-panel')).toBeNull();
    expect(root.textContent).not.toContain('contact form');
    fold.click();
    harness.detectChanges();
    expect(fold.getAttribute('aria-expanded')).toBe('true');
    const request = root.querySelector('#request-panel')!;
    expect(request.getAttribute('aria-labelledby')).toBe('contact-heading');
    expect(text(request.querySelector('h2'))).toBe('Need a reply from us?');
    expect(text(request.querySelector('.card-lede'))).toBe(lede);
    expect(request.querySelector('app-report-tips')).toBeNull();
    expect(request.querySelector('app-support-request-form')).not.toBeNull();
    expect(root.textContent).toContain('contact form');
    fold.click();
    harness.detectChanges();
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('#request-panel')).toBeNull();
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
    expect(root.querySelector('.request-fold')).toBeNull();
  });

  it('names the role on the Team Reviews badge: Owner, Admin or Reviewer (DLV-971)', async () => {
    for (const [role, badge] of [
      ['owner', 'Owner'],
      ['admin', 'Admin'],
      ['reviewer', 'Reviewer'],
    ] as const) {
      TestBed.resetTestingModule();
      const harness = await open('/support', async () => ({ ...(await reviewer()), role }));
      const root = harness.routeNativeElement!;
      expect(text(root.querySelector('#support-tab-reviews .role-badge'))).toBe(badge);
      expect(root.querySelector('.submit-panel')).not.toBeNull();
      expect(root.querySelector('.request-fold')?.getAttribute('aria-expanded')).toBe('false');
    }
  });
});
