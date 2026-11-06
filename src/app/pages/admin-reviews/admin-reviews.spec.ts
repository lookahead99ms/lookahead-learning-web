import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminReviewsPage } from './admin-reviews';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import {
  PLATFORM_REVIEW_CLIENT,
  PlatformReviewClient,
  PlatformReviewDraft,
  PlatformReviewError,
  PlatformReviewItem,
  PlatformReviewSummary,
  PlatformReviewViewer,
  draftProblem,
} from './platform-review.model';

@Component({ selector: 'app-platform-header', template: '' })
class HeaderStub {}

const item = (id: string, reviewerId: string, reviewerName: string): PlatformReviewItem => ({
  id,
  reviewerId,
  reviewerName,
  category: 'problem',
  page: 'Search',
  pageUrl: '/search',
  title: `Item ${id}`,
  details: 'Results miss the Java lesson.',
  priority: 'high',
  attachments: [],
  status: 'new',
  ownerNote: '',
  createdAt: '2026-10-11T10:00:00.000Z',
  updatedAt: '2026-10-11T10:00:00.000Z',
});
const summary = (value: PlatformReviewItem): PlatformReviewSummary => ({
  id: value.id,
  reviewerId: value.reviewerId,
  reviewerName: value.reviewerName,
  category: value.category,
  page: value.page,
  title: value.title,
  priority: value.priority,
  status: value.status,
  attachmentCount: value.attachments.length,
  ownerNote: !!value.ownerNote,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
});
const draft = (change: Partial<PlatformReviewDraft> = {}): PlatformReviewDraft => ({
  category: 'idea',
  page: 'Whole platform',
  pageUrl: '',
  title: 'Add keyboard shortcuts',
  details: 'Let me move between lessons with the keyboard.',
  priority: 'low',
  keepAttachmentIds: [],
  newFiles: [],
  requestKey: 'key',
  ...change,
});

describe('platform review rules', () => {
  it('accepts a complete item and explains each rejected field', () => {
    expect(draftProblem(draft())).toBeNull();
    expect(draftProblem(draft({ title: ' ' }))).toBe('Add a short title.');
    expect(draftProblem(draft({ details: '' }))).toContain('Describe');
    expect(draftProblem(draft({ pageUrl: 'https://example.com' }))).toContain('start with /');
    expect(draftProblem(draft({ pageUrl: '//example.com' }))).toContain('start with /');
    const image = (type: string, size: number) =>
      Object.defineProperty(new File(['x'], 'shot', { type }), 'size', { value: size });
    expect(draftProblem(draft({ newFiles: [image('image/gif', 10)] }))).toContain('PNG, JPEG');
    expect(draftProblem(draft({ newFiles: [image('image/png', 6 * 1024 * 1024)] }))).toContain(
      '5 MB',
    );
    expect(
      draftProblem(draft({ newFiles: Array.from({ length: 7 }, () => image('image/png', 10)) })),
    ).toContain('at most 6');
  });
});

describe('Platform reviews page', () => {
  let viewer: PlatformReviewViewer;
  let denied: boolean;
  let failing: boolean;
  let stored: PlatformReviewItem[];
  let client: PlatformReviewClient & {
    save: ReturnType<typeof vi.fn>;
    item: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    denied = false;
    failing = false;
    stored = [
      { ...item('a', 'reviewer-1', 'Reviewer 1'), createdAt: '2026-10-12T15:00:00.000Z' },
      item('b', 'reviewer-2', 'Reviewer 2'),
    ];
    const visible = () =>
      viewer.role === 'owner'
        ? stored
        : stored.filter((entry) => entry.reviewerId === viewer.reviewerId);
    client = {
      viewer: async () => {
        if (denied) throw new PlatformReviewError('forbidden');
        return viewer;
      },
      // The service decides visibility; the page renders exactly what it receives.
      list: async () => {
        if (failing) throw new PlatformReviewError('unavailable');
        return { items: visible().map(summary), nextBefore: null };
      },
      item: vi.fn(async (id: string) => visible().find((entry) => entry.id === id)!),
      save: vi.fn(async (value: PlatformReviewDraft) => {
        const saved = { ...item('c', viewer.reviewerId, viewer.displayName), title: value.title };
        stored = [saved, ...stored];
        return saved;
      }),
      remove: async () => {},
      triage: async (id, status, ownerNote) => ({
        ...stored.find((entry) => entry.id === id)!,
        status,
        ownerNote,
      }),
      attachmentUrl: async () => 'blob:test',
      releaseAttachmentUrl: () => {},
    };
    TestBed.configureTestingModule({
      imports: [AdminReviewsPage],
      providers: [
        provideRouter([]),
        { provide: PLATFORM_REVIEW_CLIENT, useValue: client },
        {
          provide: StudyPlanAccount,
          useValue: {
            account: signal({ accountId: 'a', authorPreview: true }),
            sessionExpired: signal(false),
          },
        },
      ],
    }).overrideComponent(AdminReviewsPage, {
      remove: { imports: [PlatformHeader] },
      add: { imports: [HeaderStub] },
    });
  });

  async function settle() {
    for (let pass = 0; pass < 3; pass++) {
      await new Promise((resolve) => setTimeout(resolve));
      await current.whenStable();
      current.detectChanges();
    }
  }
  async function render(section?: 'submit' | 'submitted') {
    current = TestBed.createComponent(AdminReviewsPage);
    if (section) current.componentRef.setInput('section', section);
    current.detectChanges();
    await settle();
    return current.nativeElement as HTMLElement;
  }
  const titles = (root: HTMLElement) =>
    [...root.querySelectorAll('.summary-title')].map((title) => title.textContent?.trim());
  let current: ReturnType<typeof TestBed.createComponent<AdminReviewsPage>>;

  it('shows a reviewer only their own items and the add form, without triage controls', async () => {
    viewer = { role: 'reviewer', reviewerId: 'reviewer-1', displayName: 'Reviewer 1' };
    const root = await render();
    expect(root.querySelector('#review-form')).not.toBeNull();
    expect(titles(root)).toEqual(['Item a']);
    expect(root.textContent).not.toContain('Reviewer 2');
    expect(root.querySelector('.triage')).toBeNull();
  });

  it('groups items by day, newest day first, and loads details only when a row opens', async () => {
    viewer = { role: 'owner', reviewerId: 'owner', displayName: 'Owner' };
    const root = await render();
    expect([...root.querySelectorAll('.day-heading')].map((h) => h.firstChild?.textContent?.trim())).toEqual([
      'Monday, 12 October 2026',
      'Sunday, 11 October 2026',
    ]);
    expect(root.querySelector('.item-details')).toBeNull();
    expect(client.item).not.toHaveBeenCalled();
    const row = root.querySelectorAll('.item-summary')[1] as HTMLButtonElement;
    expect(row.getAttribute('aria-expanded')).toBe('false');
    row.click();
    await settle();
    expect(client.item).toHaveBeenCalledWith('b');
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('.item-details')?.textContent).toContain('Results miss the Java lesson.');
    expect(root.querySelectorAll('.triage')).toHaveLength(1);
    row.click();
    await settle();
    expect(root.querySelector('.item-details')).toBeNull();
  });

  it('saves a reviewer item and reuses its request key when the same form is retried', async () => {
    viewer = { role: 'reviewer', reviewerId: 'reviewer-1', displayName: 'Reviewer 1' };
    const root = await render();
    const title = root.querySelector('input[name="title"]') as HTMLInputElement;
    const details = root.querySelector('textarea[name="details"]') as HTMLTextAreaElement;
    title.value = 'Search misses lessons';
    title.dispatchEvent(new Event('input'));
    details.value = 'Searching for PKCE shows nothing.';
    details.dispatchEvent(new Event('input'));
    current.detectChanges();
    await current.whenStable();
    client.save.mockRejectedValueOnce(new PlatformReviewError('unavailable'));
    const form = root.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    await settle();
    expect(root.querySelector('.form-error')?.textContent).toContain('Your text is still here');
    form.dispatchEvent(new Event('submit'));
    await settle();
    const [first, second] = client.save.mock.calls.map(([value]) => value as PlatformReviewDraft);
    expect(second).toEqual(
      expect.objectContaining({ title: 'Search misses lessons', newFiles: [], requestKey: first.requestKey }),
    );
    expect(client.save.mock.calls[1][1]).toBeUndefined();
    expect(titles(root)).toContain('Search misses lessons');
  });

  it('shows the owner every reviewer, per-reviewer counts, filters and the reviewer view', async () => {
    viewer = { role: 'owner', reviewerId: 'owner', displayName: 'Owner' };
    const root = await render();
    expect(root.querySelector('#review-form')).toBeNull();
    expect([...root.querySelectorAll('tbody th')].map((cell) => cell.textContent?.trim())).toEqual([
      'Reviewer 1',
      'Reviewer 2',
    ]);
    (root.querySelectorAll('tbody th button')[1] as HTMLButtonElement).click();
    current.detectChanges();
    expect(titles(root)).toEqual(['Item b']);
    expect(root.querySelector('.result-count')?.textContent?.trim()).toBe('1 of 2 items');
    // The owner can switch to the reviewer view of their own items and add one.
    const mine = [...root.querySelectorAll('.view-tabs button')].find((button) =>
      button.textContent?.includes('My reviews'),
    ) as HTMLButtonElement;
    mine.click();
    current.detectChanges();
    expect(mine.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('#review-form')).not.toBeNull();
    expect(root.querySelector('.triage')).toBeNull();
    expect(root.textContent).toContain('You have not added an item yet.');
  });

  it('splits into Write Review (the form) and Team Reviews (the items and their status) for a reviewer (DLV-971)', async () => {
    viewer = { role: 'reviewer', reviewerId: 'reviewer-1', displayName: 'Reviewer 1' };
    let root = await render('submit');
    expect(root.querySelector('.intro-heading')?.textContent?.trim()).toBe('Tell us what should change.');
    expect(root.querySelector('.lede')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Add one item for each problem, change or idea. Attach screenshots when they help. Other reviewers cannot see your items.');
    expect(root.querySelector('#review-form')).not.toBeNull();
    expect(root.querySelector('#review-items')).toBeNull();
    expect(root.querySelector('.view-tabs')).toBeNull();
    current.destroy();
    root = await render('submitted');
    expect(root.querySelector('.intro-heading')?.textContent?.trim()).toBe('Your reviews, and where each one stands.');
    expect(root.querySelector('.lede')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Each item shows the status the owner set. Add new items under Write Review.');
    expect(root.querySelector('#review-form')).toBeNull();
    expect(root.querySelector('#review-items')?.textContent?.trim()).toBe('Your review items');
    expect(titles(root)).toEqual(['Item a']);
  });

  it('gives the owner the form alone under Write Review, and the overview with every item under Team Reviews (DLV-971)', async () => {
    viewer = { role: 'owner', reviewerId: 'owner', displayName: 'Owner' };
    let root = await render('submit');
    expect(root.querySelector('.intro-heading')?.textContent?.trim()).toBe('Tell us what should change.');
    expect(root.querySelector('#review-form')).not.toBeNull();
    expect(root.querySelector('.view-tabs')).toBeNull();
    expect(root.querySelector('#review-overview')).toBeNull();
    expect(root.querySelector('#review-items')).toBeNull();
    current.destroy();
    root = await render('submitted');
    expect(root.querySelector('.intro-heading')?.textContent?.trim()).toBe('See what reviewers want to change.');
    expect(root.querySelector('#review-overview')).not.toBeNull();
    expect(root.querySelector('#review-form')).toBeNull();
    const mine = [...root.querySelectorAll('.view-tabs button')].find((button) => button.textContent?.includes('My reviews')) as HTMLButtonElement;
    mine.click();
    current.detectChanges();
    expect(root.querySelector('#review-form')).toBeNull();
    expect(root.querySelector('#review-items')?.textContent?.trim()).toBe('Your review items');
  });

  it('names the unavailable state after the items, not the reviews (DLV-971)', async () => {
    viewer = { role: 'reviewer', reviewerId: 'reviewer-1', displayName: 'Reviewer 1' };
    failing = true;
    const root = await render('submitted');
    expect(root.querySelector('.state-panel h2')?.textContent).toBe('Review items are unavailable');
  });

  it('denies an account the service answers with role "user" itself, wherever the page is embedded (DLV-971, audit finding 2)', async () => {
    viewer = { role: 'user', reviewerId: 'learner-1', displayName: 'Learner 1' };
    const root = await render('submit');
    expect(root.textContent).toContain('Review access required');
    expect(root.querySelector('#review-form')).toBeNull();
    expect(root.querySelector('#review-items')).toBeNull();
  });

  it('tells an account without a review role that access is required', async () => {
    viewer = { role: 'reviewer', reviewerId: 'x', displayName: 'X' };
    denied = true;
    const root = await render();
    expect(root.textContent).toContain('Review access required');
    expect(root.querySelector('#review-form')).toBeNull();
  });
});
