import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AdminFeedbackItemPage } from './admin-feedback-item';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { ReviewEditIntent } from '../admin-reviews/review-edit-intent';
import {
  PLATFORM_REVIEW_CLIENT,
  PlatformReviewClient,
  PlatformReviewError,
  PlatformReviewItem,
  PlatformReviewViewer,
} from '../admin-reviews/platform-review.model';

@Component({ selector: 'app-platform-header', template: '' })
class HeaderStub {}
@Component({ template: '<p>backlog</p>' })
class BacklogStub {}

/** Fixed local times on a past day, so the labels never say today or yesterday and never depend on the time zone. */
const at = (hour: number, minute: number) => new Date(2026, 9, 20, hour, minute).toISOString();
const ticket: PlatformReviewItem = {
  id: 'SUP-000014',
  reviewerId: 'l7',
  reviewerName: 'learner07',
  submitterRole: 'user',
  category: 'problem',
  page: 'Lesson Reader',
  pageUrl: '/learn/core-java/4',
  title: 'Cannot open lesson 4 of Core Java',
  details: 'The lesson shows "Planned" although my plan includes Core Java.',
  priority: 'medium',
  attachments: [{ id: 'att-1', name: 'lesson-4.png', contentType: 'image/png', size: 2048 }],
  status: 'new',
  ownerNote: '',
  kind: 'request',
  requestType: 'problem',
  reference: 'SUP-000014',
  createdAt: at(9, 12),
  updatedAt: at(9, 12),
};
const feedback: PlatformReviewItem = {
  ...ticket,
  id: 'REV-000021',
  reviewerId: 'r1',
  reviewerName: 'Priya Raman',
  submitterRole: 'reviewer',
  category: 'change',
  page: 'Welcome',
  pageUrl: '',
  title: 'Welcome page: the Essence text is hard to read',
  attachments: [],
  status: 'planned',
  ownerNote: 'Planned for the next Web release.',
  kind: 'review',
  requestType: null,
  reference: null,
  ticketId: 'DLV-1042',
  ticketStatus: 'In progress',
  updatedAt: at(10, 0),
};

describe('The item page /admin/feedback/:id (DLV-971)', () => {
  let viewer: PlatformReviewViewer;
  let client: PlatformReviewClient & { remove: ReturnType<typeof vi.fn>; attachmentUrl: ReturnType<typeof vi.fn>; releaseAttachmentUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    viewer = { role: 'owner', reviewerId: 'owner', displayName: 'Owner' };
    client = {
      viewer: async () => viewer,
      list: async () => ({ items: [], nextBefore: null }),
      item: async (id) => {
        if (id === ticket.id) return ticket;
        if (id === feedback.id) return feedback;
        throw new PlatformReviewError('not-found');
      },
      save: async () => ticket,
      remove: vi.fn(async () => {}),
      triage: async (_id, status, ownerNote) => ({ ...ticket, status, ownerNote }),
      promote: async () => ({ ticketId: 'DLV-0042', item: { ...ticket, ticketId: 'DLV-0042' } }),
      runSweeps: async (job) => ({ job, ranAt: '2026-11-06T18:30:00Z', supportRequestsClosed: null, inboxMerged: null, inboxResult: null, admissionsRemoved: null }),
      attachmentUrl: vi.fn(async () => 'blob:test'),
      releaseAttachmentUrl: vi.fn((_url: string) => {}),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'admin/feedback', component: BacklogStub },
          { path: 'admin/feedback/:id', component: AdminFeedbackItemPage },
        ]),
        { provide: PLATFORM_REVIEW_CLIENT, useValue: client },
        { provide: StudyPlanAccount, useValue: { account: signal({ accountId: 'a', authorPreview: true }), sessionExpired: () => false } },
      ],
    });
    TestBed.overrideComponent(AdminFeedbackItemPage, {
      remove: { imports: [PlatformHeader] },
      add: { imports: [HeaderStub] },
    });
  });

  async function settle(harness: RouterTestingHarness) {
    for (let pass = 0; pass < 3; pass++) {
      await new Promise((resolve) => setTimeout(resolve));
      await harness.fixture.whenStable();
      harness.detectChanges();
    }
  }
  async function open(url: string) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, AdminFeedbackItemPage);
    await settle(harness);
    return harness;
  }
  const text = (node: Node | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();

  it('renders a known ticket with the breadcrumb, the bar, the two columns, screenshots and the history', async () => {
    const harness = await open('/admin/feedback/SUP-000014');
    const root = harness.routeNativeElement!;
    expect(text(root.querySelector('.crumbs'))).toBe('Support tickets and feedback › SUP-000014');
    expect(root.querySelector('.crumbs a')?.getAttribute('href')).toBe('/admin/feedback');
    // The Admin sub-header instead of the side bars; one content column (owner, 2026-11-06).
    const subheader = root.querySelector('app-admin-subheader')!;
    expect(subheader.querySelector('nav')?.getAttribute('aria-label')).toBe('Admin navigation');
    expect(subheader.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/admin/feedback');
    expect(subheader.compareDocumentPosition(root.querySelector('main')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(root.querySelector('app-author-workspace-nav')).toBeNull();
    expect(root.querySelector('app-author-admin-menu')).toBeNull();
    expect(root.querySelector('.workspace-sidebar')).toBeNull();
    expect(root.querySelectorAll('main > *')).toHaveLength(1);
    expect(root.querySelector('main > .workspace-content > .crumbs')).not.toBeNull();
    expect(text(root.querySelector('.item-bar .kind-badge'))).toBe('Ticket');
    expect(root.querySelector('.item-bar .kind-badge')?.classList.contains('ticket')).toBe(true);
    expect(text(root.querySelector('.item-bar .item-key'))).toBe('SUP-000014');
    expect(root.querySelector('.item-main')).not.toBeNull();
    expect(root.querySelector('.item-side')).not.toBeNull();
    expect(text(root.querySelector('.item-head .status-pill'))).toBe('New');
    expect(text(root.querySelector('.item-head .hint'))).toBe('Learner support ticket');
    expect(text(root.querySelector('.item-title'))).toBe('Cannot open lesson 4 of Core Java');
    expect(text(root.querySelector('.item-meta'))).toContain('learner07 · Report a problem · Lesson Reader · /learn/core-java/4 · created');
    expect(text(root.querySelector('.description'))).toBe('The lesson shows "Planned" although my plan includes Core Java.');
    expect(client.attachmentUrl).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.thumbnails img')?.getAttribute('src')).toBe('blob:test');
    expect(text(root.querySelector('.thumbnails li > span:last-child'))).toBe('lesson-4.png · 2 KB');
    expect([...root.querySelectorAll('.history li')].map(text)).toEqual(['Opened by learner07 · 20 Oct 2026, 09:12 · reference sent by email']);
    expect([...root.querySelectorAll('.details dd')].map(text)).toEqual(['Support ticket', 'Report a problem', 'learner07', 'Lesson Reader', 'SUP-000014', '20 Oct 2026, 09:12', '20 Oct 2026, 09:12', '7 days after the last update']);
    expect(text(root.querySelector('.side-box:last-child .hint'))).toBe('Not a ticket yet.');
    expect(root.querySelector('select[name="status"]')).not.toBeNull();
    expect(text(root.querySelector('.reply h3'))).toBe('Note to the learner');
    expect(root.textContent).not.toMatch(/importance/i);
  });

  it('renders feedback with its ticket link and the second history row, and follows a route change to another key', async () => {
    const harness = await open('/admin/feedback/REV-000021');
    const root = harness.routeNativeElement!;
    expect(text(root.querySelector('.item-bar .kind-badge'))).toBe('Feedback');
    expect(text(root.querySelector('.item-head .status-pill'))).toBe('Planned');
    expect(root.querySelector('.item-head .status-pill')?.getAttribute('data-tone')).toBe('planned');
    expect([...root.querySelectorAll('.history li')].map(text)).toEqual([
      'Opened by Priya Raman · 20 Oct 2026, 09:12',
      'Status Planned · 20 Oct 2026, 10:00 · with a note',
    ]);
    expect(root.querySelector('.ticket-link')?.getAttribute('href')).toBe('/delivery-plan#DLV-1042');
    expect(text(root.querySelector('.ticket-link'))).toBe('🗺️ DLV-1042 · In progress');
    expect(root.querySelector('.thumbnails')).toBeNull();
    expect(text(root.querySelector('.reply h3'))).toBe('Owner’s note');
    expect((root.querySelector('textarea[name="note"]') as HTMLTextAreaElement).value).toBe('Planned for the next Web release.');
    await harness.navigateByUrl('/admin/feedback/SUP-000014', AdminFeedbackItemPage);
    await settle(harness);
    expect(text(harness.routeNativeElement!.querySelector('.item-title'))).toBe('Cannot open lesson 4 of Core Java');
  });

  it('says No such item for an unknown key, with a link back', async () => {
    const harness = await open('/admin/feedback/REV-999999');
    const root = harness.routeNativeElement!;
    expect(text(root.querySelector('.crumbs'))).toBe('Support tickets and feedback › REV-999999');
    expect(text(root.querySelector('.state h2'))).toBe('No such item');
    expect(root.querySelector('.state a')?.getAttribute('href')).toBe('/admin/feedback');
    expect(root.querySelector('.item-main')).toBeNull();
  });

  it('lets the sender edit (Support with the item loaded) or delete their own New feedback, and nobody else', async () => {
    viewer = { role: 'reviewer', reviewerId: 'r1', displayName: 'Priya Raman' };
    client.item = async () => ({ ...feedback, status: 'new', ticketId: null, ticketStatus: null, ownerNote: '' });
    const harness = await open('/admin/feedback/REV-000021');
    const root = harness.routeNativeElement!;
    expect(root.querySelector('select[name="status"]')).toBeNull();
    expect(root.querySelector('.side-box:last-child button')).toBeNull();
    expect([...root.querySelectorAll('.own-actions button')].map(text)).toEqual(['Edit', 'Delete']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (root.querySelector('.own-actions button') as HTMLButtonElement).click();
    expect(TestBed.inject(ReviewEditIntent).itemId()).toBe('REV-000021');
    expect(navigate).toHaveBeenCalledWith(['/support']);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    (root.querySelectorAll('.own-actions button')[1] as HTMLButtonElement).click();
    await settle(harness);
    expect(client.remove).toHaveBeenCalledWith('REV-000021');
    TestBed.inject(ReviewEditIntent).take();
  });

  it('reports a failed load with Try again and releases image URLs when it leaves', async () => {
    let fail = true;
    client.item = async (id) => {
      if (fail) throw new PlatformReviewError('unavailable');
      return ticket;
    };
    const harness = await open('/admin/feedback/SUP-000014');
    const root = harness.routeNativeElement!;
    expect(text(root.querySelector('.state h2'))).toBe('Tickets and feedback are unavailable');
    fail = false;
    (root.querySelector('.state button') as HTMLButtonElement).click();
    await settle(harness);
    expect(text(root.querySelector('.item-title'))).toBe('Cannot open lesson 4 of Core Java');
    harness.fixture.destroy();
    expect(client.releaseAttachmentUrl).toHaveBeenCalledWith('blob:test');
  });
});
