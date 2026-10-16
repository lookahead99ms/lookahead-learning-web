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
    expect(tabs().map(tab => [tab.textContent?.trim(), tab.getAttribute('aria-selected')])).toEqual([
      ['Give access', 'true'], ['Saved assignments', 'false'], ['Test accounts', 'false'], ['People', 'false'],
    ]);
    expect(root.querySelector('#access-panel #choose-person')).not.toBeNull();
    expect(root.querySelector('app-test-accounts')).toBeNull();

    tabs()[1].click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(root.querySelector('#access-panel #saved-assignments h2')?.textContent).toBe('Saved assignments');
    expect(root.querySelector('#saved-assignments .section-note')?.textContent?.trim()).toBe('0 people have a staff role or course access from this page.');
    expect(root.querySelector('#saved-assignments .empty')?.textContent).toBe('No saved assignments.');
    expect(root.querySelector('#choose-person')).toBeNull();

    tabs()[2].click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
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
