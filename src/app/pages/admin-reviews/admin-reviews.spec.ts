import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { AdminReviewsPage } from './admin-reviews';
import { ReviewEditIntent } from './review-edit-intent';
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
  kindBadge,
  ticketPill,
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
  kind: 'review',
  requestType: null,
  reference: null,
  createdAt: '2026-10-11T10:00:00.000Z',
  updatedAt: '2026-10-11T10:00:00.000Z',
});
/** A learner's support request as the Domain stores it beside the reviews (DLV-971). */
const request = (
  id: string,
  requestType: 'problem' | 'feedback' | 'question',
  reviewerId = 'learner-1',
): PlatformReviewItem => ({
  ...item(id, reviewerId, 'Learner 1'),
  submitterRole: 'user',
  kind: 'request',
  requestType,
  reference: `SUP-${id.toUpperCase()}-2026`,
  category: requestType === 'problem' ? 'problem' : 'idea',
  page: 'Support',
  priority: 'medium',
  title: `Request ${id}`,
  details: 'The lesson page shows a blank card.',
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
  kind: value.kind,
  requestType: value.requestType,
  reference: value.reference,
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
  it('names the kind badge of a learner request after its type and leaves a review without one (DLV-971)', () => {
    expect(kindBadge(request('r', 'problem'))).toBe('Learner request · Problem');
    expect(kindBadge(request('r', 'feedback'))).toBe('Learner request · Feedback');
    expect(kindBadge(request('r', 'question'))).toBe('Learner request · Question');
    expect(kindBadge({ kind: 'request', requestType: null })).toBe('Learner request');
    expect(kindBadge(item('a', 'x', 'X'))).toBe('');
    expect(kindBadge({ kind: null })).toBe('');
    expect(kindBadge({})).toBe('');
  });

  it('writes the ticket pill as id and status, the id alone without a status, nothing before a promote (DLV-971)', () => {
    expect(ticketPill({ ticketId: 'DLV-0042', ticketStatus: 'In progress' })).toBe('DLV-0042 · In progress');
    expect(ticketPill({ ticketId: 'DLV-0042', ticketStatus: null })).toBe('DLV-0042');
    expect(ticketPill({ ticketId: null, ticketStatus: null })).toBe('');
    expect(ticketPill({})).toBe('');
  });

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
    promote: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    denied = false;
    failing = false;
    stored = [
      { ...item('a', 'reviewer-1', 'Reviewer 1'), createdAt: '2026-10-12T15:00:00.000Z' },
      item('b', 'reviewer-2', 'Reviewer 2'),
    ];
    const visible = () =>
      viewer.role === 'owner' || viewer.role === 'admin'
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
      // The Domain adds the ticket to the DEV plan and stamps the record; the page shows what comes back.
      promote: vi.fn(async (id: string) => {
        const promoted = { ...stored.find((entry) => entry.id === id)!, ticketId: 'DLV-0042', ticketStatus: 'Backlog' };
        stored = stored.map((entry) => (entry.id === id ? promoted : entry));
        return { ticketId: 'DLV-0042', item: promoted };
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
    expect(root.textContent).toContain('No reviews submitted yet.');
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

  it('shows the Write Review form even when the item list cannot load, and never asks for the list there (DLV-971)', async () => {
    viewer = { role: 'reviewer', reviewerId: 'reviewer-1', displayName: 'Reviewer 1' };
    failing = true;
    const listed = vi.spyOn(client, 'list');
    const root = await render('submit');
    expect(root.querySelector('#review-form')).not.toBeNull();
    expect(root.querySelector('.state-panel')).toBeNull();
    expect(root.textContent).not.toContain('Review items are unavailable');
    expect(listed).not.toHaveBeenCalled();
  });

  it('says No reviews submitted yet for a reviewer or the owner with nothing recorded (DLV-971)', async () => {
    stored = [];
    viewer = { role: 'reviewer', reviewerId: 'reviewer-1', displayName: 'Reviewer 1' };
    let root = await render('submitted');
    expect(root.querySelector('.state-panel')).toBeNull();
    expect(root.textContent).toContain('No reviews submitted yet.');
    current.destroy();
    viewer = { role: 'owner', reviewerId: 'owner', displayName: 'Owner' };
    root = await render('submitted');
    expect(root.textContent).toContain('No reviews submitted yet.');
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

  it('shows an admin the overview and every item like the owner, but never the triage form (DLV-971)', async () => {
    viewer = { role: 'admin', reviewerId: 'reviewer-2', displayName: 'Reviewer 2' };
    stored[1] = { ...stored[1], status: 'planned', ownerNote: 'Scheduled for the next release.' };
    stored.push({ ...item('d', 'reviewer-2', 'Reviewer 2'), createdAt: '2026-10-11T09:00:00.000Z' });
    const root = await render('submitted');
    expect(root.querySelector('.intro-heading')?.textContent?.trim()).toBe('See what reviewers want to change.');
    expect(root.querySelector('.lede')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      "Every reviewer's items and every learner request, newest day first. Open an item to read it and see its images. The owner sets each review's status and note; you set the status of learner requests.",
    );
    expect(root.querySelector('#review-overview')).not.toBeNull();
    expect([...root.querySelectorAll('.view-tabs button')].map((b) => b.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'All reviews 3',
      'My reviews 2',
    ]);
    expect(root.querySelectorAll('.filters select')).toHaveLength(3);
    expect(titles(root)).toEqual(['Item a', 'Item b', 'Item d']);
    // Another reviewer's item: the owner's note is read-only, no status or note controls.
    const rows = [...root.querySelectorAll<HTMLButtonElement>('.item-summary')];
    rows[0].click();
    await settle();
    expect(root.querySelector('.item-details')?.textContent).toContain('Results miss the Java lesson.');
    expect(root.querySelector('.triage')).toBeNull();
    expect(root.textContent).not.toContain('Save status');
    expect(root.querySelector('.item-actions')).toBeNull();
    rows[0].click();
    await settle();
    rows[1].click();
    await settle();
    expect(root.querySelector('.owner-note')?.textContent).toContain('Scheduled for the next release.');
    expect(root.querySelector('.triage')).toBeNull();
    expect(root.querySelector('.item-detail select')).toBeNull();
    expect(root.querySelector('.item-detail textarea')).toBeNull();
    expect(root.querySelector('.item-actions')).toBeNull();
    rows[1].click();
    await settle();
    // The admin's own item, still New: Edit and Delete, as a reviewer has.
    rows[2].click();
    await settle();
    expect(root.querySelector('.triage')).toBeNull();
    expect([...root.querySelectorAll('.item-actions button')].map((b) => b.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Edit Item d',
      'Delete Item d',
    ]);
  });

  it('keeps the triage form for the owner alone (DLV-971)', async () => {
    viewer = { role: 'owner', reviewerId: 'owner', displayName: 'Owner' };
    const root = await render('submitted');
    (root.querySelector('.item-summary') as HTMLButtonElement).click();
    await settle();
    expect(root.querySelector('.triage')).not.toBeNull();
    expect(root.querySelector('.triage button[type="submit"]')?.textContent?.trim()).toBe('Save status');
    const note = root.querySelector('.triage textarea') as HTMLTextAreaElement;
    note.value = 'Thanks, scheduled.';
    note.dispatchEvent(new Event('input'));
    await settle();
    root.querySelector<HTMLFormElement>('.triage')!.dispatchEvent(new Event('submit'));
    await settle();
    expect(root.querySelector('.triage [role="status"]')?.textContent).toBe('Saved.');
    expect(root.querySelector('.owner-note')?.textContent).toContain('Thanks, scheduled.');
  });

  it('carries the report tips inside the Write Review card and keeps the screenshots as one slim row (DLV-971)', async () => {
    viewer = { role: 'reviewer', reviewerId: 'reviewer-1', displayName: 'Reviewer 1' };
    let root = await render('submit');
    const tips = root.querySelector('app-report-tips')!;
    expect(tips).not.toBeNull();
    expect(tips.querySelector('.tips-label')?.textContent?.trim()).toBe('A helpful report');
    // Under the lede, above the form.
    const header = root.querySelector('header')!;
    const form = root.querySelector('form')!;
    expect(header.compareDocumentPosition(tips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tips.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const attach = root.querySelector('.attachments-field .attach')!;
    expect(attach.querySelector('.file-picker')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('📎 Add screenshots');
    expect(attach.querySelector('input[type="file"]')?.getAttribute('accept')).toBe('image/png,image/jpeg,image/webp');
    expect(attach.querySelector('.hint')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Up to 6 images, 5 MB each; or paste one into the form.',
    );
    expect(root.querySelector('.attachments-field legend')?.classList.contains('visually-hidden')).toBe(true);
    current.destroy();
    root = await render('submitted');
    expect(root.querySelector('app-report-tips')).toBeNull();
  });

  it('badges learner requests, filters by request type and counts them in the Overview (DLV-971)', async () => {
    viewer = { role: 'owner', reviewerId: 'owner', displayName: 'Owner' };
    stored = [
      { ...request('p', 'problem'), createdAt: '2026-10-12T16:00:00.000Z' },
      { ...request('f', 'feedback'), createdAt: '2026-10-12T15:30:00.000Z' },
      { ...request('q', 'question', 'learner-2'), reviewerName: 'Learner 2', createdAt: '2026-10-12T15:10:00.000Z' },
      ...stored,
    ];
    const root = await render('submitted');
    expect([...root.querySelectorAll('thead th')].map((cell) => cell.textContent?.trim())).toEqual([
      'Reviewer',
      'Items',
      'Requests',
      'New',
      'Accepted',
      'Planned',
      'Done',
      'Declined',
    ]);
    const rowOf = (name: string) =>
      [...root.querySelectorAll('tbody tr')]
        .find((row) => row.querySelector('th')?.textContent?.trim() === name)!
        .querySelectorAll('td');
    expect([...rowOf('Learner 1')].map((cell) => cell.textContent?.trim())).toEqual(['2', '2', '2', '0', '0', '0', '0']);
    expect([...rowOf('Learner 2')].map((cell) => cell.textContent?.trim())).toEqual(['1', '1', '1', '0', '0', '0', '0']);
    expect([...rowOf('Reviewer 1')].map((cell) => cell.textContent?.trim())).toEqual(['1', '0', '1', '0', '0', '0', '0']);
    const badges = [...root.querySelectorAll('.item-row')].map((row) => row.querySelector('.kind-badge')?.textContent?.trim() ?? null);
    expect(badges).toEqual([
      'Learner request · Problem',
      'Learner request · Feedback',
      'Learner request · Question',
      null,
      null,
    ]);
    const type = root.querySelectorAll<HTMLSelectElement>('.filters select')[2];
    expect([...type.options].map((option) => option.textContent?.trim())).toEqual([
      'All types',
      'Problem',
      'Change request',
      'Idea',
      'Content correction',
      'Learner request: Problem',
      'Learner request: Feedback',
      'Learner request: Question',
    ]);
    type.value = 'request:feedback';
    type.dispatchEvent(new Event('change'));
    current.detectChanges();
    expect(titles(root)).toEqual(['Request f']);
    expect(root.querySelector('.result-count')?.textContent?.trim()).toBe('1 of 5 items');
    type.value = 'request:problem';
    type.dispatchEvent(new Event('change'));
    current.detectChanges();
    expect(titles(root)).toEqual(['Request p']);
    // A review category still matches reviews (and requests stored under it).
    type.value = 'problem';
    type.dispatchEvent(new Event('change'));
    current.detectChanges();
    expect(titles(root)).toEqual(['Request p', 'Item a', 'Item b']);
    type.value = '';
    type.dispatchEvent(new Event('change'));
    current.detectChanges();
    expect(titles(root)).toHaveLength(5);
  });

  it('lets an admin set the status of a learner request but not of a review; the owner sets both (DLV-971)', async () => {
    stored = [{ ...request('p', 'problem'), createdAt: '2026-10-12T16:00:00.000Z' }, ...stored];
    viewer = { role: 'admin', reviewerId: 'reviewer-2', displayName: 'Reviewer 2' };
    let root = await render('submitted');
    let rows = [...root.querySelectorAll<HTMLButtonElement>('.item-summary')];
    rows[0].click();
    await settle();
    expect(root.querySelector('.triage')).not.toBeNull();
    expect(root.querySelector('.triage button[type="submit"]')?.textContent?.trim()).toBe('Save status');
    expect(root.querySelector('.item-actions')).toBeNull();
    rows[0].click();
    await settle();
    rows[1].click();
    await settle();
    expect(root.querySelector('.triage')).toBeNull();
    expect(root.textContent).not.toContain('Save status');
    current.destroy();
    viewer = { role: 'owner', reviewerId: 'owner', displayName: 'Owner' };
    root = await render('submitted');
    rows = [...root.querySelectorAll<HTMLButtonElement>('.item-summary')];
    rows[0].click();
    await settle();
    expect(root.querySelector('.triage')).not.toBeNull();
    rows[0].click();
    await settle();
    rows[1].click();
    await settle();
    expect(root.querySelector('.triage')).not.toBeNull();
  });

  it('shows the reference of an open request with a copy button that reports Copied or Copy failed (DLV-971)', async () => {
    stored = [{ ...request('p', 'problem'), createdAt: '2026-10-12T16:00:00.000Z' }, ...stored];
    viewer = { role: 'admin', reviewerId: 'reviewer-2', displayName: 'Reviewer 2' };
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const root = await render('submitted');
    const rows = [...root.querySelectorAll<HTMLButtonElement>('.item-summary')];
    rows[0].click();
    await settle();
    const reference = root.querySelector('.item-reference')!;
    expect(reference.textContent?.replace(/\s+/g, ' ').trim()).toBe('Reference: SUP-P-2026 Copy reference SUP-P-2026');
    expect(reference.querySelector('code')?.textContent).toBe('SUP-P-2026');
    const copy = reference.querySelector<HTMLButtonElement>('.copy-reference')!;
    copy.click();
    await settle();
    expect(writeText).toHaveBeenCalledWith('SUP-P-2026');
    expect(reference.querySelector('.copy-status')?.textContent).toBe('Copied');
    copy.click();
    await settle();
    expect(reference.querySelector('.copy-status')?.textContent).toBe('Copy failed');
    // A review has no reference line.
    rows[0].click();
    await settle();
    rows[1].click();
    await settle();
    expect(root.querySelector('.item-reference')).toBeNull();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });

  it('never offers Edit or Delete on a learner request, even the viewer\'s own, and shows no lock hint (DLV-971)', async () => {
    viewer = { role: 'reviewer', reviewerId: 'reviewer-1', displayName: 'Reviewer 1' };
    stored = [
      { ...request('p', 'problem', 'reviewer-1'), reviewerName: 'Reviewer 1', createdAt: '2026-10-12T16:00:00.000Z' },
      ...stored,
    ];
    const root = await render('submitted');
    expect(titles(root)).toEqual(['Request p', 'Item a']);
    const rows = [...root.querySelectorAll<HTMLButtonElement>('.item-summary')];
    expect(rows[0].querySelector('.kind-badge')?.textContent?.trim()).toBe('Learner request · Problem');
    rows[0].click();
    await settle();
    expect(root.querySelector('.item-actions')).toBeNull();
    expect(root.querySelector('.triage')).toBeNull();
    expect(root.textContent).not.toContain('can no longer be changed');
    rows[0].click();
    await settle();
    rows[1].click();
    await settle();
    expect([...root.querySelectorAll('.item-actions button')].map((b) => b.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Edit Item a',
      'Delete Item a',
    ]);
  });

  it('Edit under Team Reviews records the item and opens Write Review, which loads it into the form (DLV-971)', async () => {
    viewer = { role: 'reviewer', reviewerId: 'reviewer-1', displayName: 'Reviewer 1' };
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const intent = TestBed.inject(ReviewEditIntent);
    let root = await render('submitted');
    (root.querySelector('.item-summary') as HTMLButtonElement).click();
    await settle();
    expect(root.querySelector('#review-form')).toBeNull();
    [...root.querySelectorAll<HTMLButtonElement>('.item-actions button')]
      .find((button) => button.textContent?.includes('Edit'))!
      .click();
    await settle();
    expect(intent.itemId()).toBe('a');
    expect(navigate).toHaveBeenCalledWith(['/support'], {
      queryParams: { view: null },
      queryParamsHandling: 'merge',
    });
    current.destroy();
    // The Write Review instance on the other tab takes the id on init and clears it.
    client.item.mockClear();
    root = await render('submit');
    expect(client.item).toHaveBeenCalledWith('a');
    expect(intent.itemId()).toBeNull();
    expect(root.querySelector('#review-form')?.textContent?.trim()).toBe('Edit your review item');
    expect((root.querySelector('input[name="title"]') as HTMLInputElement).value).toBe('Item a');
    expect((root.querySelector('textarea[name="details"]') as HTMLTextAreaElement).value).toBe('Results miss the Java lesson.');
    expect(root.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Save changes');
    current.destroy();
    // A fresh Write Review instance with nothing pending opens the empty form.
    client.item.mockClear();
    root = await render('submit');
    expect(client.item).not.toHaveBeenCalled();
    expect(root.querySelector('#review-form')?.textContent?.trim()).toBe('Add a review item');
  });

  it('tells the reviewer when a recorded edit cannot be opened, and never loads a request into the form (DLV-971)', async () => {
    viewer = { role: 'reviewer', reviewerId: 'reviewer-1', displayName: 'Reviewer 1' };
    const intent = TestBed.inject(ReviewEditIntent);
    intent.set('missing');
    client.item.mockRejectedValueOnce(new PlatformReviewError('not-found'));
    let root = await render('submit');
    expect(root.querySelector('#review-form')?.textContent?.trim()).toBe('Add a review item');
    expect(root.querySelector('.form-status')?.textContent).toContain('could not be opened for editing');
    current.destroy();
    stored = [request('p', 'problem', 'reviewer-1')];
    intent.set('p');
    root = await render('submit');
    expect(root.querySelector('#review-form')?.textContent?.trim()).toBe('Add a review item');
    expect((root.querySelector('input[name="title"]') as HTMLInputElement).value).toBe('');
  });

  it('offers Promote to ticket to the owner on any item, to an admin on a learner request only, and shows the ticket pill once promoted (DLV-971)', async () => {
    stored = [{ ...request('p', 'problem'), createdAt: '2026-10-12T16:00:00.000Z' }, ...stored];
    viewer = { role: 'owner', reviewerId: 'owner', displayName: 'Owner' };
    let root = await render('submitted');
    let rows = [...root.querySelectorAll<HTMLButtonElement>('.item-summary')];
    expect(root.querySelector('.ticket-pill')).toBeNull();
    rows[1].click();
    await settle();
    const button = root.querySelector<HTMLButtonElement>('.promote button')!;
    expect(button.textContent?.replace(/\s+/g, ' ').trim()).toBe('Promote to ticket Item a');
    button.click();
    await settle();
    expect(client.promote).toHaveBeenCalledWith('a');
    expect(root.querySelector('.promote')).toBeNull();
    const pill = root.querySelector<HTMLAnchorElement>('.item-ticket a.ticket-pill')!;
    expect(pill.textContent?.trim()).toBe('DLV-0042 · Backlog');
    expect(pill.getAttribute('href')).toBe('/delivery-plan#DLV-0042');
    expect(root.querySelector('.item-ticket .promote-status')?.textContent).toBe('Ticket DLV-0042 created.');
    // The row carries the pill too, as text inside the row button.
    expect(rows[1].querySelector('.summary-head .ticket-pill')?.textContent?.trim()).toBe('DLV-0042 · Backlog');
    expect(rows[1].querySelector('a')).toBeNull();
    // The status form stays: promoting does not replace triage.
    expect(root.querySelector('.triage')).not.toBeNull();
    current.destroy();

    viewer = { role: 'admin', reviewerId: 'reviewer-2', displayName: 'Reviewer 2' };
    root = await render('submitted');
    rows = [...root.querySelectorAll<HTMLButtonElement>('.item-summary')];
    rows[0].click();
    await settle();
    expect(root.querySelector('.promote button')).not.toBeNull();
    rows[0].click();
    await settle();
    rows[2].click();
    await settle();
    expect(root.querySelector('.promote')).toBeNull();
    expect(root.textContent).not.toContain('Promote to ticket');
    current.destroy();

    viewer = { role: 'reviewer', reviewerId: 'reviewer-1', displayName: 'Reviewer 1' };
    root = await render('submitted');
    (root.querySelector('.item-summary') as HTMLButtonElement).click();
    await settle();
    expect(root.querySelector('.promote')).toBeNull();
    expect(root.querySelector('.item-ticket a.ticket-pill')?.textContent?.trim()).toBe('DLV-0042 · Backlog');
  });

  it('reports a refused promote, and reloads an item someone promoted first so its pill shows (DLV-971)', async () => {
    viewer = { role: 'owner', reviewerId: 'owner', displayName: 'Owner' };
    const root = await render('submitted');
    const rows = [...root.querySelectorAll<HTMLButtonElement>('.item-summary')];
    rows[0].click();
    await settle();
    const promote = () => {
      root.querySelector<HTMLButtonElement>('.promote button')!.click();
      return settle();
    };
    client.promote.mockRejectedValueOnce(new PlatformReviewError('unavailable'));
    await promote();
    expect(root.querySelector('.promote .promote-status')?.textContent).toBe('Not promoted. Try again.');
    expect(root.querySelector('.ticket-pill')).toBeNull();
    client.promote.mockRejectedValueOnce(new PlatformReviewError('forbidden'));
    await promote();
    expect(root.querySelector('.promote .promote-status')?.textContent).toBe('Your role cannot promote this item.');
    // Promoted by someone else meanwhile: the Domain answers 409 and the reloaded item carries the ticket.
    stored = stored.map((entry) => (entry.id === 'a' ? { ...entry, ticketId: 'DLV-0007', ticketStatus: 'Planned' } : entry));
    client.item.mockClear();
    client.promote.mockRejectedValueOnce(new PlatformReviewError('conflict', 'Already promoted.'));
    await promote();
    expect(client.item).toHaveBeenCalledWith('a');
    expect(root.querySelector('.promote')).toBeNull();
    expect(root.querySelector('.item-ticket a.ticket-pill')?.textContent?.trim()).toBe('DLV-0007 · Planned');
    expect(root.querySelector('.item-ticket .promote-status')?.textContent).toBe('This item already has a ticket.');
  });

  it('opens and marks the item a /support?view=reviews#<id> link names, and ignores an unknown id (DLV-971)', async () => {
    viewer = { role: 'owner', reviewerId: 'owner', displayName: 'Owner' };
    const route = { snapshot: { fragment: 'b' as string | null } };
    TestBed.overrideProvider(ActivatedRoute, { useValue: route });
    let root = await render('submitted');
    const open = root.querySelector('.item-row.open')!;
    expect(open.id).toBe('review-b');
    expect(open.classList.contains('targeted')).toBe(true);
    expect(client.item).toHaveBeenCalledWith('b');
    expect(open.querySelector('.item-detail .item-details')?.textContent).toContain('Results miss the Java lesson.');
    expect(root.querySelectorAll('.item-row.open')).toHaveLength(1);
    current.destroy();
    route.snapshot.fragment = 'REV-999999';
    client.item.mockClear();
    root = await render('submitted');
    expect(root.querySelector('.item-row.open')).toBeNull();
    expect(client.item).not.toHaveBeenCalled();
  });

  it('tells an account without a review role that access is required', async () => {
    viewer = { role: 'reviewer', reviewerId: 'x', displayName: 'X' };
    denied = true;
    const root = await render();
    expect(root.textContent).toContain('Review access required');
    expect(root.querySelector('#review-form')).toBeNull();
  });
});
