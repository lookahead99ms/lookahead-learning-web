import { Component, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SupportPage, supportKinds } from './support';
import { SupportRequestForm } from './support-request-form';
import { AdminReviewsPage } from '../admin-reviews/admin-reviews';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import {
  PLATFORM_REVIEW_CLIENT,
  PlatformReviewClient,
  PlatformReviewError,
  PlatformReviewItem,
  PlatformReviewViewer,
} from '../admin-reviews/platform-review.model';
import { ReviewEditIntent } from '../admin-reviews/review-edit-intent';

@Component({ selector: 'app-platform-header', template: '' })
class HeaderStub {}
@Component({ selector: 'app-support-request-form', template: '<p>ticket form {{ kind() }}</p>' })
class FormStub {
  readonly kind = input<string | null>(null);
  readonly compact = input(false);
}
@Component({ selector: 'app-admin-reviews', template: '<p>feedback form {{ category() }}</p>' })
class ReviewsStub {
  readonly section = input<string>('all');
  readonly category = input<string | null>(null);
  readonly compact = input(false);
  readonly editing = output<string | null>();
}

async function open(url: string, viewer: () => Promise<PlatformReviewViewer>, prepare?: () => void) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'support', component: SupportPage }]),
      {
        provide: StudyPlanAccount,
        useValue: {
          account: signal({ accountId: 'a', username: 'me@example.test' }),
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
  prepare?.();
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, SupportPage);
  await settle(harness);
  return harness;
}

async function settle(harness: RouterTestingHarness) {
  for (let pass = 0; pass < 3; pass++) {
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
}

const reviewer = async (): Promise<PlatformReviewViewer> => ({
  role: 'reviewer',
  reviewerId: 'r',
  displayName: 'Reviewer',
});

const text = (node: Node | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();
const kindLabels = (root: HTMLElement) => [...root.querySelectorAll('.kind-option strong')].map(text);
const kindHints = (root: HTMLElement) => [...root.querySelectorAll('.kind-option small')].map(text);
const selectedKind = (root: HTMLElement) => text(root.querySelector('.kind-option.selected strong'));
async function pick(harness: RouterTestingHarness, label: string) {
  const root = harness.routeNativeElement!;
  const card = [...root.querySelectorAll<HTMLLabelElement>('.kind-option')].find((option) => text(option.querySelector('strong')) === label)!;
  const input = card.querySelector('input') as HTMLInputElement;
  input.click();
  input.dispatchEvent(new Event('change'));
  await settle(harness);
}

describe('Support and feedback page (one card, owner 2026-11-06)', () => {
  it('uses the shared theme and contextual outline without exposing Admin navigation', async () => {
    const harness = await open('/support', reviewer);
    const root = harness.routeNativeElement!;
    expect(root.classList.contains('admin-surface')).toBe(true);
    expect(root.querySelector('main')?.classList.contains('admin-workspace')).toBe(true);
    expect(root.querySelector('h1.support-title')?.textContent).toBe('Support and feedback');
    expect(root.querySelector('app-author-admin-menu')).toBeNull();
    expect(root.querySelector('.support-navigation .eyebrow')?.textContent).toBe('Help');
    const links = [...root.querySelectorAll<HTMLAnchorElement>('.heading-outline a')];
    expect(links.map(link => link.hash)).toEqual(['#support-intro', '#support-request']);
    const request = root.querySelector<HTMLElement>('#support-request')!;
    request.scrollIntoView = vi.fn();
    links[1].click();
    expect(request.scrollIntoView).toHaveBeenCalled();
    expect(kindLabels(root)).toHaveLength(5);
  });

  it('maps the five kinds to the two paths without touching the API values', () => {
    expect(supportKinds.map((kind) => [kind.id, kind.path, kind.value])).toEqual([
      ['problem', 'ticket', 'problem'],
      ['question', 'ticket', 'question'],
      ['idea', 'ticket', 'feedback'],
      ['change', 'feedback', 'change'],
      ['content', 'feedback', 'content'],
    ]);
  });

  it('gives a learner one card: the heading, the tips, three ticket kinds and the ticket form, and never says "review"', async () => {
    const harness = await open('/support', async () => {
      throw new PlatformReviewError('forbidden');
    });
    const root = harness.routeNativeElement!;
    expect(root.querySelector('[role="tablist"]')).toBeNull();
    expect(root.querySelector('.request-fold')).toBeNull();
    // Two cards and no hero: the intro (headings, facts, tips) and the form (What is it?, the kinds, the fields).
    const cards = [...root.querySelectorAll('.support-body > *')];
    expect(cards.map((card) => card.className)).toEqual(['panel intro-panel', 'panel form-panel']);
    expect(root.querySelector('.support-hero')).toBeNull();
    expect(root.querySelector('[role="tablist"]')).toBeNull();
    const [intro, form] = cards;
    expect(intro.getAttribute('aria-labelledby')).toBe('contact-heading');
    expect(form.getAttribute('aria-labelledby')).toBe('kind-heading');
    // A learner gets the Support heading alone, at full width, as plain text (nothing in the intro card is a control).
    const headings = [...intro.querySelectorAll('.intro-heading-block')];
    expect(headings).toHaveLength(1);
    expect(intro.querySelector('.intro-headings')?.classList.contains('alone')).toBe(true);
    expect(text(headings[0].querySelector('.eyebrow'))).toBe('Support');
    expect(text(headings[0].querySelector('h2'))).toBe('Tell us what happened.');
    expect(text(headings[0].querySelector('.intro-text'))).toBe('A broken page, a question, or an idea. We answer by email.');
    expect(intro.querySelectorAll('button, input, [aria-pressed]')).toHaveLength(0);
    expect([...intro.querySelectorAll('.hero-facts li')].map(text)).toEqual([
      '✉️ We reply to the email you give',
      '🧾 Every item gets a reference',
      '🔒 Never include passwords',
    ]);
    expect(text(intro.querySelector('app-report-tips .tips-label'))).toBe('A helpful report');
    const order = ['.intro-headings', '.hero-facts', 'app-report-tips'].map((selector) => intro.querySelector(selector)!);
    for (let index = 1; index < order.length; index++)
      expect(order[index - 1].compareDocumentPosition(order[index]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(text(form.querySelector('.kind-heading'))).toBe('What is it?');
    expect(form.querySelector('.kind-picker')!.compareDocumentPosition(form.querySelector('app-support-request-form')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(kindLabels(root)).toEqual(['Report a problem', 'Ask a question', 'Share an idea']);
    expect(kindHints(root)).toEqual(['Something broke or looks wrong', 'Not sure how something works', 'Something to add or improve']);
    expect(selectedKind(root)).toBe('Report a problem');
    expect(root.querySelector('.kind-options')?.classList.contains('five')).toBe(false);
    expect(root.textContent).toContain('ticket form problem');
    expect(root.textContent).not.toContain('feedback form');
    expect(root.textContent).not.toMatch(/\breview/i);
    await pick(harness, 'Share an idea');
    expect(selectedKind(root)).toBe('Share an idea');
    expect(root.textContent).toContain('ticket form feedback');
    await pick(harness, 'Ask a question');
    expect(root.textContent).toContain('ticket form question');
  });

  it('gives a learner or test account the service answers with role "user" the same three kinds (DLV-971)', async () => {
    const harness = await open('/support', async () => ({ ...(await reviewer()), role: 'user' }));
    const root = harness.routeNativeElement!;
    expect(kindLabels(root)).toHaveLength(3);
    expect(root.textContent).toContain('ticket form problem');
    expect(root.textContent).not.toContain('feedback form');
  });

  it.each(['reviewer', 'admin', 'owner'] as const)('gives staff (%s) five kinds; the last two open the feedback form with their category', async (role) => {
    const harness = await open('/support', async () => ({ ...(await reviewer()), role }));
    const root = harness.routeNativeElement!;
    expect(kindLabels(root)).toEqual(['Report a problem', 'Ask a question', 'Share an idea', 'Change request', 'Content correction']);
    expect(kindHints(root).slice(3)).toEqual(['Works, but should work differently', 'A lesson, text or example is wrong']);
    expect(root.querySelector('.kind-options')?.classList.contains('five')).toBe(true);
    expect(root.textContent).toContain('ticket form problem');
    // Two headings side by side as plain text; the kinds are the only selectable thing.
    const headings = [...root.querySelectorAll('.intro-heading-block')];
    expect(headings.map((block) => text(block.querySelector('h2')))).toEqual(['Tell us what happened.', 'Tell us what should change.']);
    expect(headings.map((block) => text(block.querySelector('.eyebrow')))).toEqual(['Support', 'Feedback']);
    expect(text(headings[1].querySelector('.intro-text'))).toBe('A change to how something works, or a lesson that is wrong. The owner sets a status you can follow.');
    expect(headings[1].classList.contains('feedback')).toBe(true);
    expect(root.querySelector('.intro-headings')?.classList.contains('alone')).toBe(false);
    expect(root.querySelector('.intro-panel')!.querySelectorAll('button, input, [aria-pressed]')).toHaveLength(0);
    await pick(harness, 'Change request');
    expect(root.textContent).toContain('feedback form');
    expect(root.textContent).not.toContain('ticket form');
    const page = harness.fixture.debugElement.query((node) => node.componentInstance instanceof SupportPage).componentInstance as SupportPage;
    expect(page['feedbackCategory']()).toBe('change');
    await pick(harness, 'Content correction');
    expect(page['feedbackCategory']()).toBe('content');
    await pick(harness, 'Report a problem');
    expect(root.textContent).toContain('ticket form problem');
    expect(page['path']()).toBe('ticket');
  });

  it('Edit from Support tickets and feedback lands here with the kind card and the fields loaded, whatever the item\'s older category (DLV-971)', async () => {
    const own: PlatformReviewItem = {
      id: 'a',
      reviewerId: 'r',
      reviewerName: 'Reviewer',
      category: 'content',
      page: 'Search',
      pageUrl: '/search',
      title: 'Search misses lessons',
      details: 'Searching for PKCE shows nothing.',
      priority: 'high',
      attachments: [],
      status: 'new',
      ownerNote: '',
      kind: 'review',
      requestType: null,
      reference: null,
      createdAt: '2026-10-11T10:00:00.000Z',
      updatedAt: '2026-10-11T10:00:00.000Z',
    };
    const client: PlatformReviewClient = {
      viewer: reviewer,
      list: async () => ({ items: [], nextBefore: null }),
      item: vi.fn(async () => own),
      save: async () => own,
      remove: async () => {},
      triage: async () => own,
      promote: async () => ({ ticketId: 'DLV-0001', item: own }),
      runSweeps: async (job) => ({ job, ranAt: '2026-11-06T18:30:00Z', supportRequestsClosed: null, inboxMerged: null, inboxResult: null, admissionsRemoved: null }),
      attachmentUrl: async () => 'blob:test',
      releaseAttachmentUrl: () => {},
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'support', component: SupportPage }]),
        {
          provide: StudyPlanAccount,
          useValue: {
            account: signal({ accountId: 'a', username: 'me@example.test' }),
            sessionExpired: () => false,
            initialize: async () => {},
          },
        },
        { provide: PLATFORM_REVIEW_CLIENT, useValue: client },
      ],
    });
    // The real feedback form; only the header and the ticket form are stubbed.
    TestBed.overrideComponent(SupportPage, {
      remove: { imports: [PlatformHeader, SupportRequestForm] },
      add: { imports: [HeaderStub, FormStub] },
    });
    TestBed.inject(ReviewEditIntent).set('a');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/support', SupportPage);
    await settle(harness);
    await settle(harness);
    const root = harness.routeNativeElement!;
    expect(selectedKind(root)).toBe('Content correction');
    expect(root.querySelector<HTMLFieldSetElement>('.kind-picker')?.disabled).toBe(true);
    expect(root.querySelector('#review-form')?.textContent?.trim()).toBe('Edit your feedback');
    expect(root.querySelector('.type-picker')).toBeNull();
    expect((root.querySelector('input[name="title"]') as HTMLInputElement).value).toBe('Search misses lessons');
    expect((root.querySelector('textarea[name="details"]') as HTMLTextAreaElement).value).toBe('Searching for PKCE shows nothing.');
    expect(root.querySelector('select[name="priority"]')).toBeNull();
    expect(TestBed.inject(ReviewEditIntent).itemId()).toBeNull();
    expect(root.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Save changes');
    // Cancel editing frees the kind cards again and the Clear button comes back.
    [...root.querySelectorAll<HTMLButtonElement>('.form-actions button')].find((button) => button.textContent?.includes('Cancel editing'))!.click();
    await settle(harness);
    expect(root.querySelector<HTMLFieldSetElement>('.kind-picker')?.disabled).toBe(false);
    expect(root.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Send');
    expect([...root.querySelectorAll('.form-actions button')].map((button) => button.textContent?.trim())).toEqual(['Send', 'Clear']);
  });

  it('waits for the access check before showing a form when an Edit is pending', async () => {
    const harness = await open('/support', async () => ({ ...(await reviewer()), role: 'owner' }), () => TestBed.inject(ReviewEditIntent).set('a'));
    const root = harness.routeNativeElement!;
    // The stubbed feedback form never takes the intent, so the page keeps the feedback path open on Change request.
    expect(root.textContent).toContain('feedback form');
    expect(selectedKind(root)).toBe('Change request');
    TestBed.inject(ReviewEditIntent).take();
  });
});
