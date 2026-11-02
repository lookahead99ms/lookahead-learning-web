import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { AdminAccessPage } from './admin-access';
import { ACCOUNT_FETCH, StudyPlanAccount, StaffPermissions } from '../study-plan/study-plan-account';
import { visibleAdminLinks } from '../../core/author-workspace-nav/author-workspace-links';

const permissions = (overrides: Partial<StaffPermissions>): StaffPermissions => ({
  manageAccess: false, previewDocuments: false, deliveryRead: false, deliveryCreate: false,
  deliveryReview: false, deliveryDone: false, triageFeedback: false, fullCurriculum: false,
  feedbackRole: 'user', ...overrides,
});

describe('staff navigation', () => {
  const account = { accountId: 'synthetic', username: 'synthetic', displayName: 'Synthetic', topicGrants: [] };
  it('keeps tester curriculum access out of every admin menu', () => {
    expect(visibleAdminLinks({ ...account, permissions: permissions({ fullCurriculum: true, feedbackRole: 'tester' }) })).toEqual([]);
  });
  it('keeps assignment controls owner-only even for admins and reviewers', () => {
    expect(visibleAdminLinks({ ...account, permissions: permissions({ previewDocuments: true, deliveryRead: true }) }).map(row => row.id))
      .toEqual(['docs', 'previews', 'delivery']);
    expect(visibleAdminLinks({ ...account, authorPreview: true, permissions: permissions({}) })).toEqual([]);
  });
});

describe('People and access', () => {
  let requests: { path: string; init?: RequestInit }[];
  let saveStatus: number;
  let page: AdminAccessPage;
  beforeEach(() => {
    requests = []; saveStatus = 200;
    TestBed.configureTestingModule({ providers: [
      { provide: StudyPlanAccount, useValue: { account: signal({permissions:permissions({manageAccess:true})}), apiPath: (path: string) => '/bff/api/v1' + path } },
      { provide: ACCOUNT_FETCH, useValue: async (path: string, init?: RequestInit) => {
        requests.push({ path, init });
        if (path.endsWith('/auth/csrf')) return Response.json({ data: { headerName: 'X-CSRF-TOKEN', token: 'synthetic-csrf' } });
        if (path.endsWith('/lookup')) return Response.json({ data: { accountId: 'existing-id', username: 'learner', displayName: 'Learner', email: null } });
        if (init?.method === 'POST') return Response.json({ data: { ...JSON.parse(init.body as string), revision: 1 } }, { status: saveStatus });
        return Response.json({ data: [] });
      } },
    ] });
    page = TestBed.runInInjectionContext(() => new AdminAccessPage());
  });
  it('binds an existing recipient to the returned stable account ID and sends a CSRF-protected write', async () => {
    page.query = 'learner@example.invalid'; await page.find();
    expect(page.draft?.accountId).toBe('existing-id');
    expect(page.draft?.pendingEmail).toBeNull();
    page.toggle('roles', 'tester', true); await page.save();
    const write = requests.find(row => row.path.endsWith('/admin/access') && row.init?.method === 'POST')!;
    expect(write.init?.headers).toMatchObject({ 'X-CSRF-TOKEN': 'synthetic-csrf' });
    expect(JSON.parse(write.init?.body as string)).toMatchObject({ accountId: 'existing-id', roles: ['tester'], revision: 0 });
    expect(page.draft?.revision).toBe(1);
  });
  it('gives a new admin the entire curriculum by default, and lets the owner clear it', async () => {
    page.query = 'learner@example.invalid'; await page.find();
    expect(page.draft?.fullCurriculum).toBe(false);
    page.toggle('roles', 'reviewer', true);
    expect(page.draft?.fullCurriculum).toBe(false);
    page.toggle('roles', 'admin', true);
    expect(page.draft?.fullCurriculum).toBe(true);
    page.draft!.fullCurriculum = false; page.toggle('roles', 'reviewer', false);
    expect(page.draft?.fullCurriculum).toBe(false);
    await page.save();
    const write = requests.find(row => row.path.endsWith('/admin/access') && row.init?.method === 'POST')!;
    expect(JSON.parse(write.init?.body as string)).toMatchObject({ roles: ['admin'], fullCurriculum: false });
    expect(page.roleNames(['admin', 'reviewer'])).toBe('Admin, Reviewer');
    expect(page.roleNames([])).toBe('No staff role');
  });
  it('keeps pending email separate and preserves a draft on concurrent-save conflict', async () => {
    page.pendingEmail = 'Invited@Example.invalid'; page.invite(); page.toggle('roles', 'reviewer', true);
    expect(page.draft?.accountId).toBeNull(); expect(page.draft?.pendingEmail).toBe('invited@example.invalid');
    saveStatus = 409; await page.save();
    expect(page.notice()).toContain('Access changed');
    expect(page.draft?.revision).toBe(0); expect(page.assignments()).toEqual([]);
  });
});

@Component({ selector: 'app-platform-header', template: '' })
class HeaderStub {}

describe('People and access layout', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: StudyPlanAccount, useValue: { account: signal({ accountId: 'owner', username: 'owner', displayName: 'Owner', topicGrants: [], permissions: permissions({ manageAccess: true, previewDocuments: true, deliveryRead: true }) }), apiPath: (path: string) => '/bff/api/v1' + path } },
      { provide: ACCOUNT_FETCH, useValue: async () => Response.json({ data: [] }) },
    ] }).overrideComponent(AdminAccessPage, { remove: { imports: [PlatformHeader] }, add: { imports: [HeaderStub] } });
  });
  it('lays out like the other admin pages: outline, content, then the Admin menu', async () => {
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const main = fixture.nativeElement.querySelector('main') as HTMLElement;
    expect([...main.children].map(child => child.tagName.toLowerCase().replace(/^div$/, 'div.' + child.className)))
      .toEqual(['aside', 'div.workspace-content', 'app-author-admin-menu']);
    expect(main.querySelector('aside app-author-workspace-nav')).not.toBeNull();
    expect(fixture.componentInstance.outline().map(item => item.href)).toEqual(['#choose-person']);
    fixture.componentInstance.invite();
    expect(fixture.componentInstance.outline().map(item => item.href)).toEqual(['#choose-person']);
    fixture.componentInstance.pendingEmail = 'person@example.invalid'; fixture.componentInstance.invite();
    expect(fixture.componentInstance.outline().map(item => item.href)).toEqual(['#choose-person', '#review-access']);
    fixture.componentInstance.selectTab('saved');
    expect(fixture.componentInstance.outline().map(item => item.href)).toEqual(['#saved-assignments']);
    fixture.componentInstance.selectTab('people');
    expect(fixture.componentInstance.outline().map(item => item.href)).toEqual(['#people']);
  });
  it('fills the centre column on wide monitors while notes keep a readable line length', async () => {
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const rules = Array.from(document.styleSheets)
      .flatMap(sheet => Array.from(sheet.cssRules))
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule);
    const maxWidths = (element: Element) =>
      rules.filter(rule => element.matches(rule.selectorText) && rule.style.getPropertyValue('max-width'))
        .map(rule => rule.style.getPropertyValue('max-width'));
    // A fixed cap left a wide empty band before the Admin menu on large monitors (2026-10-16).
    expect(maxWidths(root.querySelector('.workspace-content')!)).toEqual([]);
    expect(maxWidths(root.querySelector('.context-note')!)).toEqual(['110ch']);
  });
  it('explains roles, grants and plans, links plans to the documentation and shows no purchases (DLV-209)', async () => {
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect([...root.querySelectorAll('.how-card h3')].map(h => h.textContent?.trim())).toEqual(['Staff roles', 'Course access grants', 'Plans and purchases']);
    expect(root.querySelector('.how-link')?.getAttribute('href')).toBe('/admin/plans');
    expect(root.textContent).toContain('Local purchases use mock payments');
    // The catalog table lives on the Plans and purchases documentation page now.
    expect(root.querySelector('#configured-plans, .plan-table')).toBeNull();
    // Find and the saved list sit side by side.
    // How access works sits in the hero; the hero has no facts line.
    expect(root.querySelectorAll('.access-hero .how-card')).toHaveLength(3);
    expect(root.querySelector('.hero-facts')).toBeNull();
    expect(root.querySelector('.access-hero .lede')?.textContent).toContain('Only the owner changes roles and course access');
    // Give access holds only Choose a person; the saved list has its own tab.
    expect([...root.querySelectorAll('#access-panel > section')].map(section => section.id)).toEqual(['choose-person']);

    // The draft is a plain field, so open it in a fresh page before its first render.
    const review = TestBed.createComponent(AdminAccessPage);
    review.componentInstance.pendingEmail = 'person@example.invalid'; review.componentInstance.invite();
    review.detectChanges(); await review.whenStable(); review.detectChanges();
    const reviewRoot = review.nativeElement as HTMLElement;
    const panel = reviewRoot.querySelector('.review-side .membership-panel')!;
    expect(panel.textContent).toContain('Purchases require an existing account.');
    expect(panel.querySelector('app-admin-memberships')).toBeNull();
    expect(panel.textContent).not.toMatch(/sent|delivered|scheduled/i);
    expect([...reviewRoot.querySelectorAll('.review-main legend')].map(legend => legend.textContent?.trim())).toEqual(['Roles', 'Course access grants']);
  });
});

describe('People and access tabs', () => {
  it('opens on Give access, shows the test accounts only when chosen, and moves with the arrow keys', async () => {
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: StudyPlanAccount, useValue: { account: signal({ accountId: 'owner', username: 'owner', displayName: 'Owner', topicGrants: [], permissions: permissions({ manageAccess: true }) }), apiPath: (path: string) => '/bff/api/v1' + path } },
      { provide: ACCOUNT_FETCH, useValue: async () => Response.json({ data: [] }) },
    ] }).overrideComponent(AdminAccessPage, { remove: { imports: [PlatformHeader] }, add: { imports: [HeaderStub] } });
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const tabs = () => [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    // DLV-969: with nobody waiting, the owner's Waiting for access sits after Saved assignments.
    expect(tabs().map(tab => [tab.textContent?.trim(), tab.getAttribute('aria-selected')])).toEqual([
      ['Give access', 'true'], ['Saved assignments', 'false'], ['Waiting for access', 'false'], ['Test accounts', 'false'], ['People', 'false'],
    ]);
    expect(root.querySelector('#access-panel #choose-person')).not.toBeNull();
    expect(root.querySelector('app-test-accounts')).toBeNull();

    tabs()[1].click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(root.querySelector('#access-panel #saved-assignments h2')?.textContent).toBe('Saved assignments');
    expect(root.querySelector('#saved-assignments .section-note')?.textContent?.trim()).toBe('0 people have a staff role or course access from this page.');
    expect(root.querySelector('#saved-assignments .empty')?.textContent).toBe('No saved assignments.');
    expect(root.querySelector('#choose-person')).toBeNull();

    tabs()[2].click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(root.querySelector('#access-panel #waiting-for-access h2')?.textContent).toBe('Waiting for access');
    expect(root.querySelector('#waiting-for-access .empty')?.textContent).toBe('Nobody is waiting for access.');
    expect(root.querySelector('#waiting-for-access .section-note')?.textContent).toContain('removed after 48 hours');

    tabs()[3].click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(root.querySelector('#access-panel #test-accounts h2')?.textContent).toBe('Test accounts');
    expect(root.querySelector('#choose-person')).toBeNull();
    expect(root.querySelector('#access-panel')?.getAttribute('aria-labelledby')).toBe('access-tab-test');

    const page = fixture.componentInstance;
    page.onTabKey(new KeyboardEvent('keydown', { key: 'ArrowRight' })); expect(page.tab()).toBe('people');
    page.onTabKey(new KeyboardEvent('keydown', { key: 'ArrowRight' })); expect(page.tab()).toBe('assign');
    page.onTabKey(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); expect(page.tab()).toBe('people');
    page.onTabKey(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); expect(page.tab()).toBe('test');
    page.onTabKey(new KeyboardEvent('keydown', { key: 'End' })); expect(page.tab()).toBe('people');
    page.onTabKey(new KeyboardEvent('keydown', { key: 'Home' })); expect(page.tab()).toBe('assign');
    page.onTabKey(new KeyboardEvent('keydown', { key: 'End' })); expect(page.tab()).toBe('people');
    page.onTabKey(new KeyboardEvent('keydown', { key: 'a' })); expect(page.tab()).toBe('people');
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(root.querySelector('#access-panel #people h2')?.textContent).toBe('People');
  });

  it('opens Give access for a person chosen on another tab, from their saved assignment or by lookup', async () => {
    const saved = { id: 's1', accountId: 'saved-id', pendingEmail: null, roles: ['reviewer'], topicGrants: [], fullCurriculum: false, revision: 2 };
    const paths: string[] = [];
    TestBed.configureTestingModule({ providers: [
      { provide: StudyPlanAccount, useValue: { account: signal({ permissions: permissions({ manageAccess: true }) }), apiPath: (path: string) => path } },
      { provide: ACCOUNT_FETCH, useValue: async (path: string, init?: RequestInit) => {
        paths.push(path + (init?.body ? ' ' + init.body : ''));
        if (path.endsWith('/auth/csrf')) return Response.json({ data: { headerName: 'X-CSRF-TOKEN', token: 't' } });
        if (path.endsWith('/lookup')) return Response.json({ data: { accountId: 'new-id', username: 'learner07', displayName: 'learner07', email: null } });
        return Response.json({ data: path === '/admin/access' ? [saved] : [] });
      } },
    ] });
    const page = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await page.reload();
    const row = (accountId: string, name: string) => ({ key: accountId, accountId, name, detail: null, roles: ['Learner'], access: ['Free'], isTest: true, isSelf: false, pending: false, changedBy: null, changedAt: null, test: null });

    page.selectTab('test');
    await page.giveAccessTo(row('saved-id', 'reviewer01'));
    expect(page.tab()).toBe('assign');
    expect(page.draft).toMatchObject({ id: 's1', roles: ['reviewer'] });
    expect(page.recipient()?.displayName).toBe('reviewer01');
    expect(paths.some(path => path.endsWith('/lookup'))).toBe(false);

    await page.giveAccessTo(row('new-id', 'learner07'));
    expect(paths.find(path => path.includes('/lookup'))).toContain('"query":"learner07"');
    expect(page.draft).toMatchObject({ accountId: 'new-id', roles: [], revision: 0 });

    page.selectTab('saved');
    page.review(page.assignments()[0]);
    expect(page.tab()).toBe('assign');
    expect(page.draft).toMatchObject({ id: 's1' });
    expect(page.recipient()).toBeNull();
    expect(page.nameOf(page.draft!)).toBe('Account saved-id');

    page.draft = null;
    await page.giveAccessTo({ ...row('x', 'x'), accountId: null as unknown as string });
    expect(page.draft).toBeNull();
  });
});

describe('Saved assignments', () => {
  const assignment = (id: string, accountId: string | null, roles: string[], pendingEmail: string | null = null) =>
    ({ id, accountId, pendingEmail, roles, topicGrants: [], fullCurriculum: false, revision: 1 });
  const saved = [
    assignment('1', 'learner-id', []), assignment('2', 'admin-id', ['admin']), assignment('3', null, ['reviewer'], 'new@example.test'),
    assignment('4', 'real-id', ['admin']), assignment('5', 'coauthor-id', ['co-author', 'reviewer']), assignment('6', 'unknown-id-123', ['tester']),
  ];
  const setup = (manageAccess: boolean, directory: 'ok' | 'down' = 'ok') => {
    TestBed.configureTestingModule({ providers: [
      { provide: StudyPlanAccount, useValue: { account: signal({ accountId: 'owner-id', username: 'author', permissions: permissions({ manageAccess, feedbackRole: manageAccess ? 'owner' : 'co-author' }) }), apiPath: (path: string) => path } },
      { provide: ACCOUNT_FETCH, useValue: async (path: string) => {
        if (path === '/admin/access') return Response.json({ data: saved });
        if (path === '/admin/test-accounts') return Response.json({ data: [
          { accountId: 'learner-id', username: 'learner03' }, { accountId: 'admin-id', username: 'admin01' }, { accountId: 'coauthor-id', username: 'coauthor01' },
        ] });
        if (path.startsWith('/admin/accounts')) return directory === 'ok'
          ? Response.json({ data: { accounts: [{ accountId: 'real-id', username: 'sam.k' }], page: 0, hasNext: false } })
          : new Response('', { status: 500 });
        return Response.json({ data: [] });
      } },
    ] });
    return TestBed.runInInjectionContext(() => new AdminAccessPage());
  };

  it('shows usernames instead of account IDs, sorted by role then name, pending last', async () => {
    const page = setup(true);
    await page.reload(); await page.loadNames();
    expect(page.sortedAssignments().map(row => page.nameOf(row))).toEqual([
      'coauthor01', 'admin01', 'sam.k', 'Account unknown-', 'learner03', 'new@example.test',
    ]);
    expect(page.names().get('owner-id')).toBe('author');
    expect([saved[0], { ...saved[0], topicGrants: ['learn:a'] }, { ...saved[0], topicGrants: ['learn:a', 'grow:b'] }, saved[5], { ...saved[0], fullCurriculum: true }]
      .map(row => page.courseText(row))).toEqual(['No course access', '1 selected course', '2 selected courses', 'Entire curriculum', 'Entire curriculum']);
  });

  it('falls back to short IDs when the owner directory cannot load, and co-authors never ask for it', async () => {
    const owner = setup(true, 'down');
    await owner.reload(); await owner.loadNames();
    expect(owner.nameOf(saved[3])).toBe('Account real-id');
    expect(owner.nameOf(saved[1])).toBe('admin01');
    TestBed.resetTestingModule();
    const coauthor = setup(false);
    await coauthor.reload(); await coauthor.loadNames();
    expect(coauthor.nameOf(saved[3])).toBe('Account real-id');
    expect(coauthor.nameOf(saved[0])).toBe('learner03');
  });
});

describe('People and access links', () => {
  const setup = (tab: string | null, feedbackRole = 'owner') => {
    const replaceState = vi.fn();
    TestBed.configureTestingModule({ providers: [
      { provide: StudyPlanAccount, useValue: { account: signal({ permissions: permissions({ manageAccess: feedbackRole === 'owner', triageFeedback: feedbackRole === 'admin', feedbackRole }) }) } },
      { provide: ACCOUNT_FETCH, useValue: async () => Response.json({ data: [] }) },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(tab ? { tab } : {}) } } },
      { provide: Location, useValue: { replaceState } },
    ] });
    return { page: TestBed.runInInjectionContext(() => new AdminAccessPage()), replaceState };
  };
  it('opens the tab named in the address and keeps the address in step', () => {
    const { page, replaceState } = setup('test');
    expect(page.tab()).toBe('test');
    page.selectTab('saved');
    expect(replaceState).toHaveBeenLastCalledWith('/admin/access', 'tab=saved');
    page.selectTab('assign');
    expect(replaceState).toHaveBeenLastCalledWith('/admin/access', '');
  });
  it('ignores unknown tabs and tabs the person cannot see', () => {
    expect(setup('nonsense').page.tab()).toBe('assign');
    TestBed.resetTestingModule();
    expect(setup('saved', 'admin').page.tab()).toBe('test');
  });
});

describe('test account admin outline', () => {
  it('admins without the saved assignments start on Test accounts', () => {
    TestBed.configureTestingModule({ providers: [
      { provide: StudyPlanAccount, useValue: { account: signal({ permissions: permissions({ feedbackRole: 'admin', triageFeedback: true }) }) } },
      { provide: ACCOUNT_FETCH, useValue: async () => Response.json({ data: [] }) },
    ] });
    const page = TestBed.runInInjectionContext(() => new AdminAccessPage());
    expect(page.tabs().map(tab => tab.label)).toEqual(['Test accounts', 'People']);
    expect(page.tab()).toBe('test');
    page.selectTab('assign');
    expect(page.tab()).toBe('test');
    expect(page.outline().map(item => item.href)).toEqual(['#test-accounts']);
  });
});

/** DLV-969 (2026-11-02): people who signed in to DEV but wait for the owner's admission. */
describe('Waiting for access', () => {
  const alex = { accountId: 'alex-id', username: 'alex.example', displayName: 'Alex Example', email: 'alex@example.test', requestedAt: '2026-11-02T14:05:00Z', expiresAt: '2026-11-04T14:05:00Z' };
  const sam = { accountId: 'sam-id', username: 'sam.k', displayName: 'sam.k', email: null, requestedAt: '2026-11-02T09:00:00Z', expiresAt: '2026-11-04T09:00:00Z' };
  let requests: { path: string; init?: RequestInit }[];
  let waiting: unknown;
  let waitingStatus: number;
  let admitStatus: number;
  const setup = (feedbackRole: 'owner' | 'co-author', tab: string | null = null) => {
    requests = [];
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: StudyPlanAccount, useValue: { account: signal({ accountId: 'owner-id', username: 'author', displayName: 'Author', topicGrants: [], permissions: permissions({ manageAccess: feedbackRole === 'owner', feedbackRole }) }), apiPath: (path: string) => path } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(tab ? { tab } : {}) } } },
      { provide: Location, useValue: { replaceState: vi.fn() } },
      { provide: ACCOUNT_FETCH, useValue: async (path: string, init?: RequestInit) => {
        requests.push({ path, init });
        if (path === '/auth/csrf') return Response.json({ data: { headerName: 'X-CSRF-TOKEN', token: 'synthetic-csrf' } });
        if (path === '/admin/access/waiting') return waitingStatus === 200 ? Response.json({ data: waiting }) : new Response('', { status: waitingStatus });
        if (path === '/admin/access/admit') return admitStatus === 200
          ? Response.json({ data: { ...JSON.parse(init!.body as string), admittedAt: '2026-11-02T15:00:00Z' } })
          : new Response('', { status: admitStatus });
        if (path === '/admin/access') return Response.json({ data: [{ id: 's1', accountId: 'saved-id', pendingEmail: null, roles: ['reviewer'], topicGrants: [], fullCurriculum: false, revision: 1 }] });
        return Response.json({ data: [] });
      } },
    ] }).overrideComponent(AdminAccessPage, { remove: { imports: [PlatformHeader] }, add: { imports: [HeaderStub] } });
  };
  const admitCalls = () => requests.filter(row => row.path === '/admin/access/admit');
  beforeEach(() => { waiting = { waiting: [alex, sam], expiryHours: 48 }; waitingStatus = 200; admitStatus = 200; });

  it('sits after Saved assignments while nobody waits, first with a count once somebody does, and never for co-authors', async () => {
    waiting = { waiting: [] };
    setup('owner');
    const page = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await page.reload();
    expect(page.tabs().map(tab => tab.id)).toEqual(['assign', 'saved', 'waiting', 'test', 'people']);
    expect(page.tab()).toBe('assign');
    waiting = { waiting: [alex, sam], expiryHours: 72 };
    await page.loadWaiting();
    expect(page.tabs().map(tab => tab.label)).toEqual(['Waiting for access · 2', 'Give access', 'Saved assignments', 'Test accounts', 'People']);
    expect(page.tab()).toBe('waiting');
    expect(page.expiryHours()).toBe(72);
    expect(page.outline().map(item => item.href)).toEqual(['#waiting-for-access']);
    page.onTabKey(new KeyboardEvent('keydown', { key: 'ArrowRight' })); expect(page.tab()).toBe('assign');
    page.onTabKey(new KeyboardEvent('keydown', { key: 'Home' })); expect(page.tab()).toBe('waiting');
    page.onTabKey(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); expect(page.tab()).toBe('people');

    TestBed.resetTestingModule();
    setup('co-author');
    const coauthor = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await coauthor.reload();
    expect(coauthor.tabs().map(tab => tab.id)).toEqual(['assign', 'saved', 'test', 'people']);
    expect(requests.some(row => row.path === '/admin/access/waiting')).toBe(false);
    expect(coauthor.assignments()).toHaveLength(1);
  });

  it('opens from ?tab=waiting even while the list is empty, and keeps loading the page when the list fails', async () => {
    waitingStatus = 500;
    setup('owner', 'waiting');
    const page = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await page.reload();
    expect(page.tab()).toBe('waiting');
    expect(page.waiting()).toEqual([]);
    expect(page.assignments()).toHaveLength(1);
    expect(page.notice()).toBe('Access service is unavailable. Retry shortly.');
  });

  it('admits with the chosen role through a CSRF-protected write, removes the row and reloads the saved list', async () => {
    setup('owner');
    const page = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await page.reload();
    expect(page.tab()).toBe('waiting');
    const listLoads = () => requests.filter(row => row.path === '/admin/access').length;
    const before = listLoads();
    page.admitRole['alex-id'] = 'reviewer';
    await page.admit(alex);
    const write = admitCalls()[0];
    expect(write.init?.method).toBe('POST');
    expect(write.init?.headers).toMatchObject({ 'X-CSRF-TOKEN': 'synthetic-csrf' });
    expect(JSON.parse(write.init?.body as string)).toEqual({ accountId: 'alex-id', roles: ['reviewer'] });
    expect(page.notice()).toBe('Alex Example admitted as Reviewer. It applies to their next sign-in.');
    expect(listLoads()).toBe(before + 1);
    expect(page.admitRole['alex-id']).toBeUndefined();
    // The server list is the truth after a reload; here it still names both, so the second admit works on it.
    waiting = { waiting: [sam] };
    await page.loadWaiting();
    expect(page.waiting().map(row => row.accountId)).toEqual(['sam-id']);
    await page.admit(sam);
    expect(JSON.parse(admitCalls()[1].init?.body as string)).toEqual({ accountId: 'sam-id', roles: [] });
    expect(page.notice()).toBe('sam.k admitted as Learner. It applies to their next sign-in.');
    // The list is empty now and the tab moved behind Saved assignments, but the owner stays on it.
    waiting = { waiting: [] };
    await page.loadWaiting();
    expect(page.tabs()[0].id).toBe('assign');
    expect(page.tab()).toBe('waiting');
    expect(page.busy()).toBe(false);
  });

  it('names what each refusal means and leaves the row in place', async () => {
    setup('owner');
    const page = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await page.reload();
    const expected: [number, string][] = [
      [404, 'This request was already removed. Refresh the list.'],
      [409, 'Alex Example is already admitted.'],
      [422, 'Choose a known role.'],
      [403, 'Only the owner can admit people.'],
      [500, 'Access service is unavailable. Retry shortly.'],
    ];
    for (const [status, message] of expected) {
      admitStatus = status;
      await page.admit(alex);
      expect(page.notice()).toBe(message);
      expect(page.waiting()).toHaveLength(2);
    }
    expect(admitCalls()).toHaveLength(expected.length);
    page.busy.set(true);
    await page.admit(alex);
    expect(admitCalls()).toHaveLength(expected.length);
  });

  it('formats requested and expiry times the same for every operator', () => {
    setup('owner');
    const page = TestBed.runInInjectionContext(() => new AdminAccessPage());
    const now = Date.parse('2026-11-03T07:05:00Z');
    expect(page.timeText(alex.requestedAt)).toBe('2 Nov 2026, 14:05 UTC');
    expect(page.timeText('not a date')).toBe('—');
    expect(page.expiresText(alex, now)).toBe('in 31 h');
    expect(page.expiresText({ expiresAt: '2026-11-03T07:35:00Z' }, now)).toBe('in less than 1 h');
    expect(page.expiresText({ expiresAt: '2026-11-03T07:00:00Z' }, now)).toBe('Due for removal');
    expect(page.expiresText({ expiresAt: '2026-11-10T07:05:00Z' }, now)).toBe('10 Nov 2026, 07:05 UTC');
    expect(page.expiresText({ expiresAt: '' }, now)).toBe('—');
    expect(page.admitLabel('')).toBe('Learner');
    expect(page.admitLabel('co-author')).toBe('Co-author');
    expect(page.admitRoleOptions.map(option => option.label)).toEqual(['Co-author', 'Admin', 'Reviewer', 'Tester']);
  });

  it('renders the waiting people as rows with an Admit menu, and admits from the row', async () => {
    setup('owner');
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable();
    // The waiting list loads after the assignments; wait for the whole reload before reading the tabs.
    await fixture.componentInstance.reload(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs[0].textContent?.trim()).toBe('Waiting for access · 2');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(root.querySelector('#access-panel')?.getAttribute('aria-labelledby')).toBe('access-tab-waiting');
    const section = root.querySelector('#waiting-for-access')!;
    expect(section.querySelector('.section-heading.with-action button')?.textContent?.trim()).toBe('Refresh');
    expect(section.querySelector('.section-note')?.textContent?.trim())
      .toBe('People who signed in but are not admitted yet. A request that nobody admits is removed after 48 hours.');
    const rows = [...section.querySelectorAll<HTMLTableRowElement>('tbody tr')];
    expect(rows.map(row => row.getAttribute('data-account'))).toEqual(['alex.example', 'sam.k']);
    expect([...rows[0].querySelectorAll('th span')].map(span => span.textContent)).toEqual(['Alex Example', 'alex.example']);
    expect([...rows[1].querySelectorAll('th span')].map(span => span.textContent)).toEqual(['sam.k']);
    expect(rows[0].querySelector('[data-label="Email"]')?.textContent).toBe('alex@example.test');
    expect(rows[1].querySelector('[data-label="Email"]')?.textContent).toBe('No verified email');
    expect(rows[0].querySelector('[data-label="Requested"]')?.textContent).toBe('2 Nov 2026, 14:05 UTC');
    const select = rows[0].querySelector<HTMLSelectElement>('select')!;
    expect([...select.options].map(option => [option.value, option.textContent])).toEqual([
      ['', 'Learner'], ['co-author', 'Co-author'], ['admin', 'Admin'], ['reviewer', 'Reviewer'], ['tester', 'Tester'],
    ]);
    select.value = 'admin'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(fixture.componentInstance.admitRole['alex-id']).toBe('admin');
    waiting = { waiting: [sam] };
    rows[0].querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(JSON.parse(admitCalls()[0].init?.body as string)).toEqual({ accountId: 'alex-id', roles: ['admin'] });
    expect(root.querySelector('.notice')?.textContent).toBe('Alex Example admitted as Admin. It applies to their next sign-in.');
    expect([...root.querySelectorAll('#waiting-for-access tbody tr')].map(row => row.getAttribute('data-account'))).toEqual(['sam.k']);
    expect(root.querySelector('[role="tab"]')?.textContent?.trim()).toBe('Waiting for access · 1');
  });
});
