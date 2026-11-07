import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AdminFeedbackPage, DIALOG_OPEN_CLASS } from './admin-feedback';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import {
  PLATFORM_REVIEW_CLIENT,
  PlatformReviewClient,
  PlatformReviewError,
  PlatformReviewItem,
  PlatformReviewSummary,
  PlatformReviewViewer,
  SweepJob,
  SweepRunResult,
} from '../admin-reviews/platform-review.model';
import { routes } from '../../app.routes';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { environment } from '../../../environments/environment';

@Component({ selector: 'app-platform-header', template: '' })
class HeaderStub {}

const today = new Date();
const at = (daysAgo: number, hour = 9, minute = 12) => {
  const date = new Date(today);
  date.setDate(today.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

function item(over: Partial<PlatformReviewItem>): PlatformReviewItem {
  return {
    id: 'REV-000001',
    reviewerId: 'r1',
    reviewerName: 'Priya Raman',
    submitterRole: 'reviewer',
    category: 'problem',
    page: 'People and access',
    pageUrl: '/admin/access?tab=test',
    title: 'Reset all button stays greyed after a reset',
    details: 'After Reset all finished, the button stayed greyed out.',
    priority: 'medium',
    attachments: [],
    status: 'new',
    ownerNote: '',
    kind: 'review',
    requestType: null,
    reference: null,
    createdAt: at(2),
    updatedAt: at(2),
    ...over,
  };
}
const summaryOf = (full: PlatformReviewItem): PlatformReviewSummary => ({
  id: full.id,
  reviewerId: full.reviewerId,
  reviewerName: full.reviewerName,
  submitterRole: full.submitterRole,
  category: full.category,
  page: full.page,
  title: full.title,
  priority: full.priority,
  status: full.status,
  attachmentCount: full.attachments.length,
  ownerNote: !!full.ownerNote,
  kind: full.kind,
  requestType: full.requestType,
  reference: full.reference,
  ticketId: full.ticketId,
  ticketStatus: full.ticketStatus,
  createdAt: full.createdAt,
  updatedAt: full.updatedAt,
});

/** What the Domain answers for each job (DLV-971): only that job's counts are filled. */
const ran = (job: SweepJob): SweepRunResult => ({
  job,
  ranAt: '2026-11-06T18:30:00Z',
  supportRequestsClosed: job === 'support-requests' || job === 'all' ? 2 : null,
  inboxMerged: job === 'delivery-inbox' || job === 'all' ? true : null,
  inboxResult: job === 'delivery-inbox' || job === 'all' ? '12' : null,
  admissionsRemoved: job === 'admissions' || job === 'all' ? 1 : null,
});
const ranTime = new Date('2026-11-06T18:30:00Z').toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

describe('Support tickets and feedback backlog (DLV-971)', () => {
  let viewer: PlatformReviewViewer;
  let stored: PlatformReviewItem[];
  let failing: boolean;
  let client: PlatformReviewClient & { promote: ReturnType<typeof vi.fn>; triage: ReturnType<typeof vi.fn>; runSweeps: ReturnType<typeof vi.fn> };
  let listCalls: number;

  beforeEach(() => {
    failing = false;
    listCalls = 0;
    viewer = { role: 'owner', reviewerId: 'owner', displayName: 'Owner' };
    stored = [
      item({ id: 'REV-000001', updatedAt: at(2), createdAt: at(2) }),
      item({ id: 'SUP-000014', reviewerId: 'l7', reviewerName: 'learner07', submitterRole: 'user', kind: 'request', requestType: 'problem', reference: 'SUP-000014', page: 'Lesson Reader', pageUrl: '/learn/core-java/4', title: 'Cannot open lesson 4 of Core Java', createdAt: at(0, 9, 12), updatedAt: at(0, 9, 12) }),
      item({ id: 'REV-000002', reviewerId: 'a2', reviewerName: 'Admin 2', submitterRole: 'admin', category: 'change', page: 'Welcome', title: 'Welcome page: the Essence text is hard to read', status: 'planned', ticketId: 'DLV-1042', ticketStatus: 'In progress', createdAt: at(3), updatedAt: at(0, 8, 2) }),
      item({ id: 'SUP-000011', reviewerId: 'l12', reviewerName: 'learner12', submitterRole: 'user', kind: 'request', requestType: 'question', reference: 'SUP-000011', page: 'Support', title: 'How do I change my reply email?', status: 'declined', createdAt: at(1), updatedAt: at(1) }),
      item({ id: 'REV-000003', reviewerId: 'owner', reviewerName: 'Owner', submitterRole: 'owner', category: 'idea', page: 'Admin pages', title: 'Add a search box to this page', createdAt: at(5), updatedAt: at(5) }),
    ];
    client = {
      viewer: async () => viewer,
      list: async () => {
        listCalls++;
        if (failing) throw new PlatformReviewError('unavailable');
        const mine = viewer.role === 'reviewer' ? stored.filter((entry) => entry.reviewerId === viewer.reviewerId) : stored;
        return { items: mine.map(summaryOf), nextBefore: null };
      },
      item: async (id) => {
        const found = stored.find((entry) => entry.id === id);
        if (!found) throw new PlatformReviewError('not-found');
        return found;
      },
      save: async () => stored[0],
      remove: async () => {},
      triage: vi.fn(async (id: string, status, ownerNote) => {
        const changed = { ...stored.find((entry) => entry.id === id)!, status, ownerNote, updatedAt: at(0, 10, 0) };
        stored = stored.map((entry) => (entry.id === id ? changed : entry));
        return changed;
      }),
      promote: vi.fn(async (id: string) => {
        const promoted = { ...stored.find((entry) => entry.id === id)!, ticketId: 'DLV-0042', ticketStatus: 'Backlog' };
        stored = stored.map((entry) => (entry.id === id ? promoted : entry));
        return { ticketId: 'DLV-0042', item: promoted };
      }),
      runSweeps: vi.fn(async (job: SweepJob) => ran(job)),
      attachmentUrl: async () => 'blob:test',
      releaseAttachmentUrl: () => {},
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'admin/feedback', component: AdminFeedbackPage }, { path: 'admin/feedback/:id', component: AdminFeedbackPage }]),
        { provide: PLATFORM_REVIEW_CLIENT, useValue: client },
        {
          provide: StudyPlanAccount,
          useValue: { account: signal({ accountId: 'a', authorPreview: true }), sessionExpired: () => false, initialize: async () => {} },
        },
      ],
    });
    TestBed.overrideComponent(AdminFeedbackPage, {
      remove: { imports: [PlatformHeader] },
      add: { imports: [HeaderStub] },
    });
  });

  afterEach(() => document.documentElement.classList.remove(DIALOG_OPEN_CLASS));

  async function settle(harness: RouterTestingHarness) {
    for (let pass = 0; pass < 3; pass++) {
      await new Promise((resolve) => setTimeout(resolve));
      await harness.fixture.whenStable();
      harness.detectChanges();
    }
  }
  async function open(url = '/admin/feedback') {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, AdminFeedbackPage);
    await settle(harness);
    return harness;
  }
  const text = (node: Node | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();
  const keys = (root: HTMLElement) => [...root.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-key'));
  const cells = (row: Element) => [...row.querySelectorAll('td')].map(text);
  const dialog = (root: HTMLElement) => root.querySelector<HTMLDialogElement>('dialog.item-dialog')!;

  it('lists one row per item in fixed columns, sorted by last update newest first, with the kind badge, status pill, ticket and the ↗ link', async () => {
    const harness = await open();
    const root = harness.routeNativeElement!;
    expect(text(root.querySelector('h1'))).toBe('Support tickets and feedback');
    expect([...root.querySelectorAll('thead th')].map(text)).toEqual(['ID', 'Summary', 'From', 'Type', 'Status', 'Ticket', 'Updated', 'Open']);
    expect(root.querySelectorAll('colgroup col')).toHaveLength(8);
    expect(root.querySelector('thead th.right')?.textContent?.trim()).toBe('Updated');
    // Sticky edges (owner, 2026-11-06): ID on the left; Ticket, Updated and the ↗ on the right, each with its own offset class.
    expect([...root.querySelectorAll('thead th.sticky-left')].map(text)).toEqual(['ID']);
    expect([...root.querySelectorAll('thead th.sticky-right')].map(text)).toEqual(['Ticket', 'Updated', 'Open']);
    expect(root.querySelector('thead th.sticky-ticket')?.classList.contains('sticky-right')).toBe(true);
    expect(root.querySelector('thead th.sticky-updated')?.classList.contains('right')).toBe(true);
    expect(root.querySelector('thead th.sticky-act .visually-hidden')).not.toBeNull();
    expect(root.querySelector('.table-scroll')?.getAttribute('role')).toBe('region');
    expect(keys(root)).toEqual(['SUP-000014', 'REV-000002', 'SUP-000011', 'REV-000001', 'REV-000003']);
    const first = root.querySelector('tbody tr')!;
    expect(first.getAttribute('tabindex')).toBe('0');
    // The page sits under the summary (one Summary column, no Page column; owner, 2026-11-06: the backlog reads tidier).
    expect(cells(first)).toEqual(['Ticket SUP-000014', 'Cannot open lesson 4 of Core Java Lesson Reader', 'learner07', 'Report a problem', 'New', '—', 'Today 09:12', '↗']);
    expect(first.querySelector('.kind-badge')?.classList.contains('ticket')).toBe(true);
    expect(first.querySelector('td.key')?.classList.contains('sticky-left')).toBe(true);
    expect([...first.querySelectorAll('td.sticky-right')].map((cell) => cell.className)).toEqual([
      'ticket sticky-right sticky-ticket',
      'updated sticky-right sticky-updated',
      'act sticky-right sticky-act',
    ]);
    expect(first.querySelectorAll('td.sticky-left, td.sticky-right')).toHaveLength(4);
    expect(first.querySelector('.status-pill')?.getAttribute('data-tone')).toBe('new');
    expect(first.querySelector('a.new-tab')?.getAttribute('href')).toBe('/admin/feedback/SUP-000014');
    expect(first.querySelector('a.new-tab')?.getAttribute('target')).toBe('_blank');
    const second = root.querySelectorAll('tbody tr')[1];
    expect(cells(second)).toEqual(['Feedback REV-000002', 'Welcome page: the Essence text is hard to read Welcome', 'Admin 2', 'Change request', 'Planned', 'DLV-1042', 'Today 08:02', '↗']);
    expect(second.querySelector('.status-pill')?.getAttribute('data-tone')).toBe('planned');
    const third = root.querySelectorAll('tbody tr')[2];
    expect(cells(third).slice(4, 7)).toEqual(['Closed', '—', 'Yesterday']);
    expect(third.querySelector('.status-pill')?.getAttribute('data-tone')).toBe('muted');
    expect(text(root.querySelector('.result-count'))).toBe('5 of 5 items · sorted by last update, newest first');
    expect(root.querySelector('#review-overview')).toBeNull();
    expect(root.textContent).not.toMatch(/importance/i);
  });

  it('has the Admin sub-header under the platform header and one content column, no outline and no Admin menu', async () => {
    const harness = await open();
    const root = harness.routeNativeElement!;
    const subheader = root.querySelector('app-admin-subheader')!;
    expect(subheader).not.toBeNull();
    // Directly under the header, before the page's main content.
    expect(subheader.compareDocumentPosition(root.querySelector('main')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(subheader.querySelector('nav')?.getAttribute('aria-label')).toBe('Admin navigation');
    expect(subheader.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/admin/feedback');
    expect(root.querySelector('app-author-workspace-nav')).toBeNull();
    expect(root.querySelector('app-author-admin-menu')).toBeNull();
    expect(root.querySelector('.workspace-sidebar')).toBeNull();
    expect(root.querySelector('main > .workspace-content')).not.toBeNull();
    expect(root.querySelectorAll('main > *')).toHaveLength(1);
    expect(root.querySelector('.title-row .eyebrow')?.textContent).toBe('Admin');
    expect(text(root.querySelector('.title-row h1'))).toBe('Support tickets and feedback');
  });

  it('filters by the pills, the search and the Kind, From, Status and Type filters', async () => {
    const harness = await open();
    const root = harness.routeNativeElement!;
    const pills = [...root.querySelectorAll<HTMLButtonElement>('.view-tabs button')];
    expect(pills.map(text)).toEqual(['All 5', 'Support tickets 2', 'Feedback 3', 'Mine 1']);
    expect(pills.map((pill) => pill.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
    pills[1].click();
    await settle(harness);
    expect(keys(root)).toEqual(['SUP-000014', 'SUP-000011']);
    expect((root.querySelector('select[name="kind"]') as HTMLSelectElement).value).toBe('ticket');
    pills[2].click();
    await settle(harness);
    expect(keys(root)).toEqual(['REV-000002', 'REV-000001', 'REV-000003']);
    pills[3].click();
    await settle(harness);
    expect(keys(root)).toEqual(['REV-000003']);
    expect(pills[3].getAttribute('aria-pressed')).toBe('true');
    pills[0].click();
    await settle(harness);
    expect(keys(root)).toHaveLength(5);
    const select = async (name: string, value: string) => {
      const control = root.querySelector(`select[name="${name}"]`) as HTMLSelectElement;
      control.value = value;
      control.dispatchEvent(new Event('change'));
      await settle(harness);
    };
    expect([...root.querySelectorAll('.filters label')].map((label) => text(label.childNodes[0]))).toEqual(['Search', 'Kind', 'From', 'Status', 'Type']);
    expect([...(root.querySelector('select[name="from"]') as HTMLSelectElement).options].map((option) => option.textContent)).toEqual(['Everyone', 'Admin 2', 'learner07', 'learner12', 'Owner', 'Priya Raman']);
    await select('from', 'a2');
    expect(keys(root)).toEqual(['REV-000002']);
    await select('from', '');
    await select('status', 'declined');
    expect(keys(root)).toEqual(['SUP-000011']);
    await select('status', '');
    await select('type', 'ticket:question');
    expect(keys(root)).toEqual(['SUP-000011']);
    await select('type', 'problem');
    expect(keys(root)).toEqual(['REV-000001']);
    await select('type', '');
    await select('kind', 'feedback');
    expect(keys(root)).toHaveLength(3);
    expect(pills[2].getAttribute('aria-pressed')).toBe('true');
    await select('kind', '');
    const search = root.querySelector('input[name="search"]') as HTMLInputElement;
    const type = async (value: string) => {
      search.value = value;
      search.dispatchEvent(new Event('input'));
      await settle(harness);
    };
    await type('dlv-1042');
    expect(keys(root)).toEqual(['REV-000002']);
    await type('reply email');
    expect(keys(root)).toEqual(['SUP-000011']);
    expect(text(root.querySelector('.result-count'))).toBe('1 of 5 items · sorted by last update, newest first');
    await type('zzz');
    expect(root.querySelector('tbody')).toBeNull();
    expect(text(root.querySelector('.empty'))).toBe('No items match these filters.');
  });

  it('opens a row in the dialog, locks the page behind it, and closes on Esc, the × or a click outside', async () => {
    const harness = await open();
    const root = harness.routeNativeElement!;
    const rows = [...root.querySelectorAll<HTMLTableRowElement>('tbody tr')];
    expect(dialog(root).hasAttribute('open')).toBe(false);
    rows[0].click();
    await settle(harness);
    expect(dialog(root).hasAttribute('open')).toBe(true);
    expect(dialog(root).getAttribute('aria-modal')).toBe('true');
    expect(dialog(root).getAttribute('role')).toBe('dialog');
    expect(document.documentElement.classList.contains(DIALOG_OPEN_CLASS)).toBe(true);
    expect(rows[0].getAttribute('aria-selected')).toBe('true');
    const bar = dialog(root).querySelector('.dialog-bar')!;
    expect(text(bar.querySelector('.kind-badge'))).toBe('Ticket');
    expect(text(bar.querySelector('.item-key'))).toBe('SUP-000014');
    expect(bar.querySelector('a')?.getAttribute('href')).toBe('/admin/feedback/SUP-000014');
    expect(text(bar.querySelector('a'))).toBe('Open in new tab ↗');
    expect(text(dialog(root).querySelector('.item-title'))).toBe('Cannot open lesson 4 of Core Java');
    expect(dialog(root).querySelector('.item-main')).not.toBeNull();
    expect(dialog(root).querySelector('.item-side')).not.toBeNull();
    // ×
    (bar.querySelector('button.close') as HTMLButtonElement).click();
    await settle(harness);
    expect(dialog(root).hasAttribute('open')).toBe(false);
    expect(document.documentElement.classList.contains(DIALOG_OPEN_CLASS)).toBe(false);
    expect(rows[0].getAttribute('aria-selected')).toBe('false');
    // A click on the ↗ link does not open the dialog.
    rows[1].querySelector<HTMLAnchorElement>('a.new-tab')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle(harness);
    expect(dialog(root).hasAttribute('open')).toBe(false);
    // Esc: the dialog's close event (what the browser raises on Esc) unlocks the page.
    rows[1].click();
    await settle(harness);
    expect(document.documentElement.classList.contains(DIALOG_OPEN_CLASS)).toBe(true);
    dialog(root).removeAttribute('open');
    dialog(root).dispatchEvent(new Event('close'));
    await settle(harness);
    expect(document.documentElement.classList.contains(DIALOG_OPEN_CLASS)).toBe(false);
    expect(dialog(root).querySelector('.dialog-box')).toBeNull();
    // A click outside the box (on the dialog element itself) closes it.
    rows[1].click();
    await settle(harness);
    dialog(root).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle(harness);
    expect(dialog(root).hasAttribute('open')).toBe(false);
    expect(document.documentElement.classList.contains(DIALOG_OPEN_CLASS)).toBe(false);
  });

  it('moves between rows with the arrow keys, Home and End, and opens the focused row with Enter', async () => {
    const harness = await open();
    const root = harness.routeNativeElement!;
    const rows = [...root.querySelectorAll<HTMLTableRowElement>('tbody tr')];
    rows[0].focus();
    const press = (row: HTMLElement, key: string) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      row.dispatchEvent(event);
      harness.detectChanges();
      return event.defaultPrevented;
    };
    expect(press(rows[0], 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(rows[1]);
    press(rows[1], 'ArrowDown');
    expect(document.activeElement).toBe(rows[2]);
    press(rows[2], 'ArrowUp');
    expect(document.activeElement).toBe(rows[1]);
    press(rows[1], 'End');
    expect(document.activeElement).toBe(rows[4]);
    press(rows[4], 'ArrowDown');
    expect(document.activeElement).toBe(rows[4]);
    press(rows[4], 'Home');
    expect(document.activeElement).toBe(rows[0]);
    press(rows[0], 'ArrowUp');
    expect(document.activeElement).toBe(rows[0]);
    expect(press(rows[0], 'Tab')).toBe(false);
    press(rows[0], 'Enter');
    await settle(harness);
    expect(dialog(root).hasAttribute('open')).toBe(true);
    expect(text(dialog(root).querySelector('.item-key'))).toBe('SUP-000014');
  });

  it('hides Promote on a production build without a DEV session; a DEV session brings it back (owner, 2026-11-07)', async () => {
    const env = environment as { production: boolean };
    env.production = true;
    try {
      TestBed.inject(DevSession).gated.set(false);
      TestBed.inject(DevSession).status.set(null);
      const harness = await open();
      const root = harness.routeNativeElement!;
      [...root.querySelectorAll<HTMLTableRowElement>('tbody tr')][3].click(); // REV-000001, Priya's feedback
      await settle(harness);
      const box = dialog(root);
      expect(box.querySelector('select[name="status"]')).not.toBeNull();
      expect(box.querySelector('.side-box:last-child button')).toBeNull();
      TestBed.inject(DevSession).gated.set(true);
      await settle(harness);
      expect(text(box.querySelector('.side-box:last-child button'))).toBe('🗺️ Promote to ticket');
    } finally {
      env.production = false;
      TestBed.inject(DevSession).gated.set(false);
    }
  });

  it('gives the owner the status select, the note and Promote on everything; the row follows a saved change', async () => {
    const harness = await open();
    const root = harness.routeNativeElement!;
    const rows = [...root.querySelectorAll<HTMLTableRowElement>('tbody tr')];
    rows[3].click(); // REV-000001, Priya's feedback
    await settle(harness);
    const box = dialog(root);
    expect(box.querySelector('select[name="status"]')).not.toBeNull();
    expect(text(box.querySelector('.reply h3'))).toBe('Owner’s note');
    expect(text(box.querySelector('.side-box:last-child .hint'))).toBe('Not a ticket yet.');
    expect(text(box.querySelector('.side-box:last-child button'))).toBe('🗺️ Promote to ticket');
    expect([...box.querySelectorAll('.details dt')].map(text)).toEqual(['Kind', 'Type', 'From', 'Page', 'Created', 'Updated']);
    const status = box.querySelector('select[name="status"]') as HTMLSelectElement;
    status.value = 'accepted';
    status.dispatchEvent(new Event('change'));
    const note = box.querySelector('textarea[name="note"]') as HTMLTextAreaElement;
    note.value = 'Confirmed on DEV.';
    note.dispatchEvent(new Event('input'));
    await settle(harness);
    box.querySelector<HTMLFormElement>('form.reply')!.dispatchEvent(new Event('submit'));
    await settle(harness);
    expect(client.triage).toHaveBeenCalledWith('REV-000001', 'accepted', 'Confirmed on DEV.');
    expect(text(box.querySelector('.reply .message'))).toBe('Saved.');
    // The row moved to the top (newest update) and shows the new status.
    expect(keys(root)[0]).toBe('REV-000001');
    expect(cells(root.querySelector('tbody tr')!)[4]).toBe('Accepted');
    (box.querySelector('.side-box:last-child button') as HTMLButtonElement).click();
    await settle(harness);
    expect(client.promote).toHaveBeenCalledWith('REV-000001');
    expect(box.querySelector('.ticket-link')?.getAttribute('href')).toBe('/delivery-plan#DLV-0042');
    expect(text(box.querySelector('.ticket-link'))).toBe('🗺️ DLV-0042 · Backlog');
    expect(cells(root.querySelector('tbody tr')!)[5]).toBe('DLV-0042');
  });

  it('gives an admin the controls on a learner ticket only, and the owner’s note read-only on feedback', async () => {
    viewer = { role: 'admin', reviewerId: 'a2', displayName: 'Admin 2' };
    stored[0] = { ...stored[0], status: 'accepted', ownerNote: 'Confirmed on DEV.' };
    const harness = await open();
    const root = harness.routeNativeElement!;
    expect(root.querySelectorAll('.view-tabs button')).toHaveLength(4);
    const rows = [...root.querySelectorAll<HTMLTableRowElement>('tbody tr')];
    rows[0].click(); // the learner ticket
    await settle(harness);
    let box = dialog(root);
    expect(box.querySelector('select[name="status"]')).not.toBeNull();
    expect(text(box.querySelector('.reply h3'))).toBe('Note to the learner');
    expect([...(box.querySelector('select[name="status"]') as HTMLSelectElement).options].map((option) => option.textContent)).toEqual(['New', 'Accepted', 'Planned', 'Done', 'Closed']);
    expect([...box.querySelectorAll('.details dt')].map(text)).toEqual(['Kind', 'Type', 'From', 'Page', 'Reference', 'Created', 'Updated', 'Auto-close']);
    expect(text(box.querySelector('.side-box:last-child button'))).toBe('🗺️ Promote to ticket');
    (box.querySelector('button.close') as HTMLButtonElement).click();
    await settle(harness);
    rows[3].click(); // Priya's feedback
    await settle(harness);
    box = dialog(root);
    expect(box.querySelector('select[name="status"]')).toBeNull();
    expect(box.querySelector('form.reply')).toBeNull();
    expect(text(box.querySelector('.owner-note'))).toBe('Owner’s note: Confirmed on DEV.');
    expect(text(box.querySelector('.item-side .lock'))).toBe('Only the owner sets the status of a feedback item.');
    expect(box.querySelector('.side-box:last-child button')).toBeNull();
    expect(box.querySelector('.own-actions')).toBeNull();
    (box.querySelector('button.close') as HTMLButtonElement).click();
    await settle(harness);
    rows[1].click(); // the admin's own feedback, Planned: no Edit
    await settle(harness);
    expect(dialog(root).querySelector('.own-actions')).toBeNull();
  });

  it('shows a reviewer only their own feedback, without pills, with Edit and Delete while it is New', async () => {
    viewer = { role: 'reviewer', reviewerId: 'r1', displayName: 'Priya Raman' };
    const harness = await open();
    const root = harness.routeNativeElement!;
    expect(root.querySelector('.view-tabs')).toBeNull();
    expect(keys(root)).toEqual(['REV-000001']);
    root.querySelector<HTMLTableRowElement>('tbody tr')!.click();
    await settle(harness);
    const box = dialog(root);
    expect(box.querySelector('select[name="status"]')).toBeNull();
    expect([...box.querySelectorAll('.own-actions button')].map(text)).toEqual(['Edit', 'Delete']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (box.querySelector('.own-actions button') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(['/support']);
  });

  it('says Nothing submitted yet, reports a failed load with Try again, and opens the item a #fragment names', async () => {
    stored = [];
    let harness = await open();
    expect(text(harness.routeNativeElement!.querySelector('.empty'))).toBe('Nothing submitted yet.');
    expect(harness.routeNativeElement!.querySelector('table')).toBeNull();
    TestBed.resetTestingModule();
    failing = true;
    stored = [item({})];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'admin/feedback', component: AdminFeedbackPage }]),
        { provide: PLATFORM_REVIEW_CLIENT, useValue: client },
        { provide: StudyPlanAccount, useValue: { account: signal({ accountId: 'a' }), sessionExpired: () => false } },
      ],
    }).overrideComponent(AdminFeedbackPage, { remove: { imports: [PlatformHeader] }, add: { imports: [HeaderStub] } });
    harness = await open();
    let root = harness.routeNativeElement!;
    expect(text(root.querySelector('.state-panel h2'))).toBe('Tickets and feedback are unavailable');
    failing = false;
    (root.querySelector('.state-panel button') as HTMLButtonElement).click();
    await settle(harness);
    expect(keys(root)).toEqual(['REV-000001']);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'admin/feedback', component: AdminFeedbackPage }]),
        { provide: PLATFORM_REVIEW_CLIENT, useValue: client },
        { provide: StudyPlanAccount, useValue: { account: signal({ accountId: 'a' }), sessionExpired: () => false } },
      ],
    }).overrideComponent(AdminFeedbackPage, { remove: { imports: [PlatformHeader] }, add: { imports: [HeaderStub] } });
    harness = await open('/admin/feedback#REV-000001');
    root = harness.routeNativeElement!;
    expect(dialog(root).hasAttribute('open')).toBe(true);
    expect(text(dialog(root).querySelector('.item-key'))).toBe('REV-000001');
  });

  const jobButtons = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>('.title-row .jobs button.run-job')];
  const jobButton = (root: HTMLElement, job: SweepJob) => root.querySelector<HTMLButtonElement>(`button.run-job[data-job="${job}"]`)!;

  it('gives the owner one Jobs button at the right of the title: Close idle tickets (owner, 2026-11-07)', async () => {
    const harness = await open();
    const root = harness.routeNativeElement!;
    expect(root.querySelector('.title-row h1')).not.toBeNull();
    expect(root.querySelector('.title-row .jobs')?.getAttribute('aria-label')).toBe('Jobs');
    expect(jobButtons(root).map(text)).toEqual(['Close idle tickets']);
    expect(jobButtons(root).map((button) => button.getAttribute('data-job'))).toEqual(['support-requests']);
    expect(jobButton(root, 'support-requests').title).toBe('Closes tickets with no update for 7 days');
    expect(jobButton(root, 'support-requests').disabled).toBe(false);
    // Sync plan inbox moved to the Delivery Plan, Clean up admissions to People & Access; Run all went with them.
    for (const job of ['delivery-inbox', 'admissions', 'all'] as const) expect(root.querySelector(`button.run-job[data-job="${job}"]`)).toBeNull();
    expect(root.textContent).not.toContain('Sync plan inbox');
    expect(root.textContent).not.toContain('Clean up admissions');
    expect(root.textContent).not.toContain('Run all');
    expect(root.querySelector('.jobs-line')).toBeNull();
  });

  it('keeps the Jobs strip off PROD: a production build without a DEV session has none, the DEV build shows it (owner, 2026-11-07)', async () => {
    const production = environment.production;
    environment.production = true;
    try {
      const harness = await open();
      const root = harness.routeNativeElement!;
      expect(root.querySelector('.jobs')).toBeNull();
      expect(root.textContent).not.toContain('Close idle tickets');
      // The protected DEV build is a production build too; its DEV gate tells it apart from PROD.
      TestBed.inject(DevSession).gated.set(true);
      await settle(harness);
      expect(jobButtons(root).map(text)).toEqual(['Close idle tickets']);
      TestBed.inject(DevSession).gated.set(false);
      TestBed.inject(DevSession).status.set({ ok: true } as never);
      await settle(harness);
      expect(jobButtons(root).map(text)).toEqual(['Close idle tickets']);
    } finally {
      environment.production = production;
      TestBed.inject(DevSession).gated.set(false);
      TestBed.inject(DevSession).status.set(null);
    }
  });

  it('shows an admin no Jobs strip', async () => {
    viewer = { role: 'admin', reviewerId: 'a2', displayName: 'Admin 2' };
    const harness = await open();
    expect(harness.routeNativeElement!.querySelector('.jobs')).toBeNull();
    expect(harness.routeNativeElement!.querySelectorAll('.view-tabs button')).toHaveLength(4);
  });

  it('shows a reviewer no Jobs strip', async () => {
    viewer = { role: 'reviewer', reviewerId: 'r1', displayName: 'Priya Raman' };
    const harness = await open();
    expect(harness.routeNativeElement!.querySelector('.jobs')).toBeNull();
  });

  it('Close idle tickets: disables itself while it runs, says how many tickets closed and why, and reloads the list', async () => {
    let finish!: (result: SweepRunResult) => void;
    client.runSweeps.mockImplementationOnce(() => new Promise<SweepRunResult>((resolve) => (finish = resolve)));
    const harness = await open();
    const root = harness.routeNativeElement!;
    const loadsBefore = listCalls;
    jobButton(root, 'support-requests').click();
    await settle(harness);
    expect(jobButton(root, 'support-requests').disabled).toBe(true);
    expect(jobButton(root, 'support-requests').getAttribute('aria-busy')).toBe('true');
    expect(client.runSweeps).toHaveBeenCalledWith('support-requests');
    // A second click while it runs sends nothing.
    jobButton(root, 'support-requests').click();
    expect(client.runSweeps).toHaveBeenCalledTimes(1);
    finish(ran('support-requests'));
    await settle(harness);
    const line = root.querySelector('.jobs-line')!;
    expect(text(line)).toBe(`Close idle tickets ran at ${ranTime}: 2 tickets closed (a ticket closes after 7 days without an update)`);
    expect(line.getAttribute('role')).toBe('status');
    expect(line.classList.contains('failed')).toBe(false);
    expect(listCalls).toBe(loadsBefore + 1);
    expect(jobButton(root, 'support-requests').disabled).toBe(false);
    expect(keys(root)).toHaveLength(5);
  });

  it('says a job is not available on this environment when the Domain answers conflict (a local Domain has no admission cleanup)', async () => {
    const harness = await open();
    const root = harness.routeNativeElement!;
    const loadsBefore = listCalls;
    client.runSweeps.mockImplementationOnce(async () => {
      throw new PlatformReviewError('conflict', 'The admission cleanup runs only in cloud mode; this Domain has none.');
    });
    const page = harness.routeDebugElement!.componentInstance as AdminFeedbackPage;
    await page['runJob']('admissions');
    await settle(harness);
    const line = root.querySelector('.jobs-line')!;
    expect(text(line)).toBe('Clean up admissions: not available on this environment.');
    expect(line.getAttribute('role')).toBe('status');
    expect(line.classList.contains('failed')).toBe(false);
    expect(listCalls).toBe(loadsBefore);
    // A job that closes nothing says so without reloading twice.
    client.runSweeps.mockImplementationOnce(async () => ({ ...ran('delivery-inbox'), inboxMerged: false, inboxResult: 'no inbox file' }));
    await page['runJob']('delivery-inbox');
    await settle(harness);
    expect(text(root.querySelector('.jobs-line'))).toBe(`Sync plan inbox ran at ${ranTime}: inbox: no inbox file`);
    expect(listCalls).toBe(loadsBefore);
  });

  it('says the job could not be run when the Domain fails, leaves the list as it was, and the next click runs again', async () => {
    client.runSweeps.mockImplementationOnce(async () => {
      throw new PlatformReviewError('unavailable');
    });
    const harness = await open();
    const root = harness.routeNativeElement!;
    const loadsBefore = listCalls;
    jobButton(root, 'support-requests').click();
    await settle(harness);
    const line = root.querySelector('.jobs-line')!;
    expect(text(line)).toBe('Close idle tickets could not be run. Nothing changed; try again.');
    expect(line.getAttribute('role')).toBe('alert');
    expect(line.classList.contains('failed')).toBe(true);
    expect(listCalls).toBe(loadsBefore);
    expect(jobButton(root, 'support-requests').disabled).toBe(false);
    jobButton(root, 'support-requests').click();
    await settle(harness);
    expect(text(root.querySelector('.jobs-line'))).toMatch(/^Close idle tickets ran at /);
    expect(client.runSweeps).toHaveBeenCalledTimes(2);
  });

  it('is the target of the former /admin/reviews address and has the item route', () => {
    expect(routes.find((route) => route.path === 'admin/reviews')?.redirectTo).toBe('admin/feedback');
    expect(routes.find((route) => route.path === 'admin/feedback')?.canActivate).toHaveLength(1);
    const page = routes.find((route) => route.path === 'admin/feedback/:id');
    expect(page?.canActivate).toHaveLength(1);
    expect(page?.providers).toHaveLength(1);
  });
});
