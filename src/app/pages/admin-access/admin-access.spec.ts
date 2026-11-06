import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { AdminAccessPage } from './admin-access';
import { ACCOUNT_FETCH, StudyPlanAccount, StaffPermissions } from '../study-plan/study-plan-account';
import { canSeePreviews, visibleAdminLinks, visibleDocumentationGroups } from '../../core/author-workspace-nav/author-workspace-links';

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
  it('lists Architecture only for the owner and co-authors, and drops nothing else', () => {
    const pages = (value: object) => visibleDocumentationGroups(value as never).flatMap(group => group.pages.map(page => page.id));
    const all = pages({ ...account, authorPreview: true });
    expect(all).toContain('architecture');
    expect(pages({ ...account, permissions: permissions({ previewDocuments: true, feedbackRole: 'co-author' }) })).toEqual(all);
    const admin = pages({ ...account, permissions: permissions({ previewDocuments: true, feedbackRole: 'admin' }) });
    expect(admin).toEqual(all.filter(id => id !== 'architecture'));
    expect(canSeePreviews(null)).toBe(false);
  });
  it('keeps assignment controls owner-only even for admins and reviewers', () => {
    // DLV-969 (owner, 2026-11-04): Previews is the owner's and co-authors' only, so other staff never see it listed.
    expect(visibleAdminLinks({ ...account, permissions: permissions({ previewDocuments: true, deliveryRead: true }) }).map(row => row.id))
      .toEqual(['docs', 'feedback', 'delivery']);
    expect(visibleAdminLinks({ ...account, permissions: permissions({ previewDocuments: true, deliveryRead: true, feedbackRole: 'co-author' }) }).map(row => row.id))
      .toEqual(['docs', 'previews', 'feedback', 'delivery', 'access']);
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
  it('puts the tasks first: How access works is folded in the hero until opened (user, 2026-11-03)', async () => {
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const details = (fixture.nativeElement as HTMLElement).querySelector<HTMLDetailsElement>('.access-hero details.how-access')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent?.trim()).toBe('How access works');
    expect(details.querySelectorAll('.how-grid .how-card')).toHaveLength(3);
  });

  it('keeps the tabs on one row and shows a chevron only on an edge that hides tabs (user, 2026-11-03)', async () => {
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const page = fixture.componentInstance, root = fixture.nativeElement as HTMLElement;
    const list = root.querySelector<HTMLElement>('.tab-strip > .access-tabs[role="tablist"]')!;
    const chevrons = () => [...root.querySelectorAll<HTMLButtonElement>('.tab-strip > .tab-more')].map(button => button.hidden);
    // jsdom has no layout: everything fits, so no chevron shows.
    expect(chevrons()).toEqual([true, true]);
    Object.defineProperty(list, 'scrollWidth', { configurable: true, value: 600 });
    Object.defineProperty(list, 'clientWidth', { configurable: true, value: 300 });
    page.updateTabEdges(); fixture.detectChanges();
    expect(chevrons()).toEqual([true, false]);
    root.querySelector<HTMLButtonElement>('.tab-more.right')!.click(); fixture.detectChanges();
    expect(list.scrollLeft).toBe(210);
    expect(chevrons()).toEqual([false, false]);
    list.scrollLeft = 300; list.dispatchEvent(new Event('scroll')); fixture.detectChanges();
    expect(chevrons()).toEqual([false, true]);
    root.querySelector<HTMLButtonElement>('.tab-more.left')!.click(); fixture.detectChanges();
    expect(list.scrollLeft).toBe(90);
    expect(root.querySelector('.tab-more.right')?.getAttribute('aria-label')).toBe('Scroll to more tabs');
    expect(root.querySelector('.tab-more.left')?.getAttribute('aria-label')).toBe('Scroll to earlier tabs');
  });

  it('lays sections out by the column width, so the waiting list never runs under the Admin menu (user, 2026-11-03)', () => {
    const fs = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process
      .getBuiltinModule('node:fs') as { readFileSync(path: string, encoding: 'utf8'): string };
    const css = fs.readFileSync('src/app/pages/admin-access/admin-access.css', 'utf8').replace(/\s+/g, ' ');
    expect(css).toContain('.access-panel { container: access-panel / inline-size; }');
    expect(css).toContain('@container access-panel (max-width: 760px) { .waiting-table thead { display: none; }');
    expect(css).toContain('@container access-panel (max-width: 560px) { .section-heading.with-action { grid-template-columns: auto minmax(0, 1fr); }');
    expect(css).toContain('overflow-wrap: anywhere; text-align: start;');
    // People and Test accounts follow the same column: long names wrap, cards under 560px.
    const people = fs.readFileSync('src/app/pages/admin-access/test-accounts.css', 'utf8').replace(/\s+/g, ' ');
    expect(people).toContain('@container access-panel (max-width: 560px) { .directory-table thead { display: none; }');
    expect(people).toContain('.directory-table tbody th { font-weight: 400; /* Only the person\'s long emails break mid-word, so the table stays inside its card (user, 2026-11-03). */ overflow-wrap: anywhere; }');
    expect(people).not.toMatch(/\.person \{[^}]*nowrap/);
    // The waiting card is a grid: person; Email, Requested, Expires; Admit as (user, 2026-11-03).
    expect(css).toContain("grid-template-areas: 'person person person' 'email requested expires' 'admit admit admit';");
    expect(css).toContain("@container access-panel (max-width: 480px) { .waiting-table tbody tr { grid-template-areas: 'person person' 'email email' 'requested expires' 'admit admit';");
    // Tabs never wrap into a grid on phones any more; the row scrolls.
    expect(css).not.toMatch(/\.access-tabs \{ display: grid;/);
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

describe('Saved assignments for the owner (DLV-969)', () => {
  const saved = [{ id: 'a1', accountId: 'priya-id', pendingEmail: null, roles: ['co-author'], topicGrants: [], fullCurriculum: false, revision: 1 }];
  const directory = [{ accountId: 'priya-id', username: 'google_113773373524221303247', displayName: 'Priya Raman', email: 'priya@gmail.example',
    roles: ['co-author'], testAccount: false, fullCurriculum: false, access: { label: 'Free', labels: ['Free'], grantedCourseIds: [] },
    signIn: 'active', canDisable: true, canRemove: true }];
  it('shows the name and Gmail, never the google_ id, and opens Disable or delete on People for that person', async () => {
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: StudyPlanAccount, useValue: { account: signal({ accountId: 'owner-id', username: 'author', topicGrants: [], permissions: permissions({ manageAccess: true, feedbackRole: 'owner' }) }), apiPath: (path: string) => path } },
      { provide: ACCOUNT_FETCH, useValue: async (path: string) => Response.json({ data:
        path === '/admin/access' ? saved : path.startsWith('/admin/accounts') ? { accounts: directory, page: 0, hasNext: false }
        : path === '/admin/test-accounts' ? undefined : [] }, { status: path === '/admin/test-accounts' ? 403 : 200 }) },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ tab: 'saved' }) } } },
    ] }).overrideComponent(AdminAccessPage, { remove: { imports: [PlatformHeader] }, add: { imports: [HeaderStub] } });
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable();
    await fixture.componentInstance.reload(); await fixture.componentInstance.loadNames(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.assignment-who')?.textContent?.trim()).toBe('Priya Raman');
    expect(root.querySelector('.assignment-email')?.textContent?.trim()).toBe('priya@gmail.example');
    expect(root.textContent).not.toContain('google_1137');
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.assignment-actions button')];
    expect(buttons.map(button => button.textContent?.trim())).toEqual(['Review assignment', 'Disable or delete']);
    buttons[1].click(); fixture.detectChanges();
    expect(fixture.componentInstance.tab()).toBe('people');
    expect(fixture.componentInstance.focusAccount()).toBe('priya-id');
    // The review heading names the person with their Gmail too.
    fixture.componentInstance.review(saved[0] as never); fixture.detectChanges();
    expect(root.querySelector('#review-access-heading')?.textContent).toContain('priya@gmail.example');
    expect(fixture.componentInstance.internalName('google_1')).toBe(true);
    expect(fixture.componentInstance.internalName('sam@example.test')).toBe(false);
    expect(fixture.componentInstance.removable('unknown')).toBe(false);
  });
});

describe('Saved assignments for a co-author (DLV-969)', () => {
  // What the Domain sends a non-owner: the role label, never the account id or the invitation email.
  const shared = [
    { id: 'a1', accountId: null, pendingEmail: null, label: 'Co-author 2', pending: false, roles: ['co-author'], topicGrants: [], fullCurriculum: false, revision: 1 },
    { id: 'a2', accountId: null, pendingEmail: null, label: 'Pending invitation', pending: true, roles: ['tester'], topicGrants: [], fullCurriculum: true, revision: 1 },
  ];
  it('shows labels, marks the invitation pending and offers no Review assignment', async () => {
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: StudyPlanAccount, useValue: { account: signal({ accountId: 'coauthor-id', username: 'co', topicGrants: [], permissions: permissions({ feedbackRole: 'co-author' }) }), apiPath: (path: string) => path } },
      { provide: ACCOUNT_FETCH, useValue: async (path: string) => Response.json({ data: path === '/admin/access' ? shared : [] }) },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ tab: 'saved' }) } } },
    ] }).overrideComponent(AdminAccessPage, { remove: { imports: [PlatformHeader] }, add: { imports: [HeaderStub] } });
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable();
    await fixture.componentInstance.reload(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect([...root.querySelectorAll('.assignment-who')].map(name => name.textContent?.trim())).toEqual(['Co-author 2', 'Pending invitation']);
    expect([...root.querySelectorAll('.assignment')].map(row => row.classList.contains('pending'))).toEqual([false, true]);
    expect(root.querySelector('.assignment-state')?.textContent?.trim()).toBe('Assigned');
    expect([...root.querySelectorAll('.assignment-state')][1].textContent?.trim()).toBe('Pending verified sign-in');
    expect(root.textContent).not.toContain('Review assignment');
    expect([...root.querySelectorAll('[role="tab"]')].map(tab => tab.textContent?.trim())).toEqual(['Saved assignments', 'Test accounts', 'People']);
  });
});

describe('People and access links', () => {
  const setup = (tab: string | null, feedbackRole = 'owner', extra: Record<string, string> = {}, dev = false) => {
    const replaceState = vi.fn();
    TestBed.configureTestingModule({ providers: [
      { provide: StudyPlanAccount, useValue: { account: signal({ permissions: permissions({ manageAccess: feedbackRole === 'owner', triageFeedback: feedbackRole === 'admin', feedbackRole }) }) } },
      { provide: ACCOUNT_FETCH, useValue: async () => Response.json({ data: [] }) },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ ...(tab ? { tab } : {}), ...extra }) } } },
      { provide: Location, useValue: { replaceState } },
    ] });
    if (dev) TestBed.inject(DevSession).gated.set(true);
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
  it('opens Waiting for access → Purchase requests on the request a Review request names, once, and takes it out of the address (DLV-969)', () => {
    for (const role of ['owner', 'admin']) {
      TestBed.resetTestingModule();
      const { page, replaceState } = setup('waiting', role, { view: 'purchases', request: 'pur-9', return: '/grow/java/streams?unit=2', account: 'acc-06' }, true);
      expect(page.tab()).toBe('waiting');
      expect(page.waitingView()).toBe('purchases');
      expect(page.requestReview()).toEqual({ purchaseId: 'pur-9', returnTo: '/grow/java/streams?unit=2', accountId: 'acc-06' });
      // The address keeps only the tab and sub-tab, so a reload does not open the review again.
      expect(replaceState).toHaveBeenCalledExactlyOnceWith('/admin/access', 'tab=waiting&view=purchases');
    }
    // The older Test accounts form (owner, before 2026-11-04 DEV testing) lands in the same place.
    TestBed.resetTestingModule();
    const old = setup('test', 'admin', { request: 'pur-9', return: '/grow/java', account: 'acc-06' }, true);
    expect(old.page.tab()).toBe('waiting');
    expect(old.page.waitingView()).toBe('purchases');
    expect(old.page.requestReview()).toEqual({ purchaseId: 'pur-9', returnTo: '/grow/java', accountId: 'acc-06' });
    expect(old.replaceState).toHaveBeenCalledExactlyOnceWith('/admin/access', 'tab=waiting&view=purchases');
    // A review opens it even without the tab, and an unsafe return path is dropped.
    TestBed.resetTestingModule();
    const { page, replaceState } = setup(null, 'owner', { request: 'pur-9', return: '//elsewhere.example' }, true);
    expect(page.tab()).toBe('waiting');
    expect(page.waitingView()).toBe('purchases');
    expect(page.requestReview()).toEqual({ purchaseId: 'pur-9', returnTo: null, accountId: null });
    expect(replaceState).toHaveBeenCalledExactlyOnceWith('/admin/access', 'tab=waiting&view=purchases');
  });
  it('leaves the address alone without review values, and clears stray ones without opening anything', () => {
    const { page, replaceState } = setup('saved');
    expect(page.requestReview()).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    const stray = setup('saved', 'owner', { return: '/learn' });
    expect(stray.page.requestReview()).toBeNull();
    expect(stray.page.tab()).toBe('saved');
    expect(stray.replaceState).toHaveBeenCalledExactlyOnceWith('/admin/access', 'tab=saved');
    TestBed.resetTestingModule();
    expect(setup(null, 'owner', { account: 'acc-06' }).replaceState).toHaveBeenCalledExactlyOnceWith('/admin/access', '');
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
    // DLV-969 (owner, 2026-11-04): admins see no People list, so the tab is not shown at all.
    expect(page.tabs().map(tab => tab.label)).toEqual(['Test accounts']);
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
  let rejectStatus: number;
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
        if (/^\/admin\/accounts\/[^/]+\/(disable|remove)$/.test(path)) return rejectStatus === 200
          ? Response.json({ data: { accountId: path.split('/')[3], state: path.endsWith('disable') ? 'disabled' : 'removed' } })
          : new Response('', { status: rejectStatus });
        return Response.json({ data: [] });
      } },
    ] }).overrideComponent(AdminAccessPage, { remove: { imports: [PlatformHeader] }, add: { imports: [HeaderStub] } });
  };
  const admitCalls = () => requests.filter(row => row.path === '/admin/access/admit');
  beforeEach(() => { waiting = { waiting: [alex, sam], expiryHours: 48 }; waitingStatus = 200; admitStatus = 200; rejectStatus = 200; });

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
    // Give access finds people by email or username, so it is the owner's alone (DLV-969, 2026-11-03).
    expect(coauthor.tabs().map(tab => tab.id)).toEqual(['saved', 'test', 'people']);
    expect(coauthor.tab()).toBe('saved');
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

  it('rejects a waiting request with Disable or Delete through the same confirmed writes as People (DLV-971)', async () => {
    setup('owner');
    const page = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await page.reload();
    const rejectCalls = () => requests.filter(row => /\/admin\/accounts\/.+\/(disable|remove)$/.test(row.path));
    // Nothing is sent before a choice and the typed word.
    page.startReject(alex);
    expect(page.rejecting()).toEqual({ row: alex, action: null });
    await page.confirmReject();
    page.chooseReject('disable');
    page.rejectConfirmation = 'DELETE';
    await page.confirmReject();
    expect(rejectCalls()).toHaveLength(0);
    // Disable: the Domain's disable route with DISABLE, the row leaves the list, People's words.
    page.rejectConfirmation = 'DISABLE';
    await page.confirmReject();
    const disable = rejectCalls()[0];
    expect(disable.path).toBe('/admin/accounts/alex-id/disable');
    expect(disable.init?.method).toBe('POST');
    expect(disable.init?.headers).toMatchObject({ 'X-CSRF-TOKEN': 'synthetic-csrf' });
    expect(JSON.parse(disable.init?.body as string)).toEqual({ confirmation: 'DISABLE' });
    expect(page.waiting().map(row => row.accountId)).toEqual(['sam-id']);
    expect(page.rejecting()).toBeNull();
    expect(page.notice()).toBe('Alex Example is disabled. They cannot sign in or ask for access again until you enable them on People.');
    // Delete: the remove route with DELETE.
    page.startReject(sam); page.chooseReject('remove'); page.rejectConfirmation = 'DELETE';
    await page.confirmReject();
    expect(rejectCalls()[1].path).toBe('/admin/accounts/sam-id/remove');
    expect(JSON.parse(rejectCalls()[1].init?.body as string)).toEqual({ confirmation: 'DELETE' });
    expect(page.waiting()).toEqual([]);
    expect(page.notice()).toBe("sam.k's request is deleted. If they sign in again, they appear here as a new person.");
    expect(page.tab()).toBe('waiting');
    expect(page.busy()).toBe(false);
  });

  it('names what a refused rejection means and leaves the row and the panel in place (DLV-971)', async () => {
    setup('owner');
    const page = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await page.reload();
    for (const [status, text] of [[404, 'This request was already removed. Refresh the list.'], [409, 'Alex Example was already deleted.'], [422, 'Type DELETE exactly to confirm.'], [403, 'Only the owner can reject people.']] as const) {
      rejectStatus = status;
      page.startReject(alex); page.chooseReject('remove'); page.rejectConfirmation = 'DELETE';
      await page.confirmReject();
      expect(page.notice()).toBe(text);
      expect(page.waiting().map(row => row.accountId)).toEqual(['alex-id', 'sam-id']);
      expect(page.rejecting()?.row).toEqual(alex);
    }
    page.cancelReject();
    expect(page.rejecting()).toBeNull();
    // Co-authors never see the list and cannot start a rejection.
    TestBed.resetTestingModule();
    setup('co-author');
    const other = TestBed.runInInjectionContext(() => new AdminAccessPage());
    other.startReject(alex);
    expect(other.rejecting()).toBeNull();
  });

  it('shows Reject beside Admit, then the two choices with their words and a typed confirmation (DLV-971)', async () => {
    setup('owner');
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable();
    await fixture.componentInstance.reload(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const row = root.querySelector<HTMLTableRowElement>('#waiting-for-access tbody tr')!;
    const buttons = [...row.querySelectorAll<HTMLButtonElement>('button')].map(button => button.textContent?.trim());
    expect(buttons).toEqual(['Admit', 'Reject']);
    expect(root.querySelector('#reject-panel')).toBeNull();
    row.querySelectorAll<HTMLButtonElement>('button')[1].click(); fixture.detectChanges();
    const panel = root.querySelector('#reject-panel')!;
    expect(panel.getAttribute('aria-label')).toBe('Reject Alex Example');
    expect(panel.querySelector('h3')?.textContent).toBe('Reject Alex Example');
    expect(panel.querySelector('.danger-button')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('⚠ Disable');
    expect(panel.querySelector('.caution-button')?.textContent?.trim()).toBe('Delete');
    expect(panel.querySelector('#reject-disable')?.textContent).toBe('Strongest. Blocks every sign-in, with email or Google. They cannot ask for access again until you enable them on People.');
    expect(panel.querySelector('#reject-remove')?.textContent).toBe('Removes the request and their sign-in. If they sign in again with the same email or Google account, they appear here as a new person.');
    expect(panel.querySelector('.reset-panel')).toBeNull();
    panel.querySelector<HTMLButtonElement>('.caution-button')!.click(); fixture.detectChanges();
    const confirmPanel = panel.querySelector('.reset-panel')!;
    expect(confirmPanel.classList.contains('danger-panel')).toBe(false);
    expect(confirmPanel.querySelector('h4')?.textContent).toBe("Delete Alex Example's request");
    expect(confirmPanel.querySelector('label')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Type DELETE to confirm');
    const confirm = confirmPanel.querySelector<HTMLButtonElement>('.caution-button')!;
    expect(confirm.textContent?.trim()).toBe('Confirm deletion');
    expect(confirm.disabled).toBe(true);
    const input = confirmPanel.querySelector<HTMLInputElement>('input')!;
    input.value = 'DELETE'; input.dispatchEvent(new Event('input')); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(confirm.disabled).toBe(false);
    confirm.click(); await fixture.whenStable(); fixture.detectChanges();
    expect(requests.filter(request => request.path === '/admin/accounts/alex-id/remove')).toHaveLength(1);
    expect(root.querySelector('#reject-panel')).toBeNull();
    expect([...root.querySelectorAll('#waiting-for-access tbody tr')].map(item => item.getAttribute('data-account'))).toEqual(['sam.k']);
    expect(root.querySelector('.notice')?.textContent).toBe("Alex Example's request is deleted. If they sign in again, they appear here as a new person.");
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

  it('shows the owner each waiting person\'s sign-in methods and flags other accounts on the same Gmail (DLV-969 account linking)', async () => {
    const linked = { ...alex, email: 'alex@gmail.com', sameEmailAccounts: 1,
      signInMethods: [{ provider: 'cognito', email: 'alex@gmail.com' }, { provider: 'google', email: 'alex@gmail.com' }] };
    const many = { ...sam, accountId: 'many-id', username: 'many', email: 'many@example.test', sameEmailAccounts: 3, signInMethods: [{ provider: 'cognito' }] };
    waiting = { waiting: [linked, { ...sam, sameEmailAccounts: 0 }, many] };
    setup('owner');
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable();
    await fixture.componentInstance.reload(); fixture.detectChanges();
    const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLTableRowElement>('#waiting-for-access tbody tr')];
    const email = (row: HTMLElement) => row.querySelector('[data-label="Email"]')!;
    expect(email(rows[0]).firstChild?.textContent).toBe('alex@gmail.com');
    expect([...email(rows[0]).querySelectorAll('.method-label')].map(label => label.textContent)).toEqual(['Google', 'Password']);
    expect(email(rows[0]).querySelector('.sign-in-labels .visually-hidden')?.textContent).toBe('Sign-in methods: ');
    expect(email(rows[0]).querySelector('.same-email-flag')?.textContent?.trim()).toBe('⚠ Same Gmail as 1 other account');
    // No count and no methods from the Domain: the cell is only the email, as before.
    expect(email(rows[1]).textContent).toBe('No verified email');
    expect(email(rows[1]).querySelector('.sign-in-labels, .same-email-flag')).toBeNull();
    expect([...email(rows[2]).querySelectorAll('.method-label')].map(label => label.textContent)).toEqual(['Password']);
    expect(email(rows[2]).querySelector('.same-email-flag')?.textContent?.trim()).toBe('⚠ Same email as 3 other accounts');
    // Malformed counts never raise a flag.
    const page = fixture.componentInstance;
    expect(page.sameEmail({ ...alex, sameEmailAccounts: -1 })).toBe('');
    expect(page.sameEmail({ ...alex, sameEmailAccounts: 1.5 })).toBe('');
    expect(page.sameEmail(alex)).toBe('');
    expect(page.methodLabels(alex)).toEqual([]);
  });
});

/**
 * DLV-969 (owner, DEV test 2026-11-04): Waiting for access has two sub-tabs. DEV access (waiting people) is the owner's;
 * Purchase requests is the owner's and the admins'. Admins never ask for the owner-only waiting list.
 */
describe('Waiting for access sub-tabs', () => {
  const alex = { accountId: 'alex-id', username: 'alex.example', displayName: 'Alex Example', email: 'alex@example.test', requestedAt: '2026-11-02T14:05:00Z', expiresAt: '2026-11-04T14:05:00Z' };
  const purchase = (id: string, at: string) => ({ purchaseId: id, kind: 'new', fromPlan: null, toPlan: { code: 'learn', name: 'Learn' }, priceCents: 6999, requestedAt: at, requestedBy: { self: false, label: 'Admin 2' } });
  const testRow = (id: string, pendingPurchase: unknown) => ({ accountId: id, username: id + '@lookahead.dev', roles: [], revision: 1, access: { label: 'Free' }, lastChangedBy: 'seed', lastChangedAt: '2026-10-16', legacyPresetAvailable: false, pendingPurchase });
  let requests: string[];
  let testAccounts: unknown;
  let testStatus: number;
  let waiting: unknown;
  let replaceState: ReturnType<typeof vi.fn>;
  const setup = (feedbackRole: 'owner' | 'admin' | 'co-author', options: { dev?: boolean; tab?: string; view?: string } = {}) => {
    requests = [];
    replaceState = vi.fn();
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: StudyPlanAccount, useValue: { account: signal({ accountId: 'me', username: 'staff', displayName: 'Staff', topicGrants: [], permissions: permissions({ manageAccess: feedbackRole === 'owner', triageFeedback: feedbackRole !== 'co-author', feedbackRole }) }), apiPath: (path: string) => path } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ ...(options.tab ? { tab: options.tab } : {}), ...(options.view ? { view: options.view } : {}) }) } } },
      { provide: Location, useValue: { replaceState } },
      { provide: ACCOUNT_FETCH, useValue: async (path: string) => {
        requests.push(path);
        if (path === '/admin/access/waiting') return Response.json({ data: waiting });
        if (path === '/admin/test-accounts') return testStatus === 200 ? Response.json({ data: testAccounts }) : new Response('', { status: testStatus });
        if (path === '/admin/test-accounts/allowance') return Response.json({ data: { limit: 10, used: 0, remaining: 10, roster: null, scenarios: [] } });
        return Response.json({ data: [] });
      } },
    ] }).overrideComponent(AdminAccessPage, { remove: { imports: [PlatformHeader] }, add: { imports: [HeaderStub] } });
    if (options.dev ?? true) TestBed.inject(DevSession).gated.set(true);
  };
  beforeEach(() => {
    waiting = { waiting: [alex], expiryHours: 48 };
    testAccounts = [testRow('learner07', purchase('pur-1', '2026-11-04T09:00:00Z')), testRow('learner12', purchase('pur-2', '2026-11-04T10:00:00Z')), testRow('learner03', null)];
    testStatus = 200;
  });
  const text = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('gives the owner DEV access and Purchase requests, with each count and their sum on the tab label', async () => {
    setup('owner');
    const page = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await page.ngOnInit();
    expect(requests).toContain('/admin/access/waiting');
    expect(page.tabs()[0]).toEqual({ id: 'waiting', label: 'Waiting for access · 3' });
    expect(page.waitingViews()).toEqual([{ id: 'access', label: 'DEV access', count: 1 }, { id: 'purchases', label: 'Purchase requests', count: 2 }]);
    expect(page.waitingView()).toBe('access');
    page.selectWaitingView('purchases');
    expect(page.waitingView()).toBe('purchases');
    expect(replaceState).toHaveBeenLastCalledWith('/admin/access', 'tab=waiting&view=purchases');
    page.onWaitingKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(page.waitingView()).toBe('access');
    page.onWaitingKey(new KeyboardEvent('keydown', { key: 'End' }));
    expect(page.waitingView()).toBe('purchases');
    page.onWaitingKey(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(page.waitingView()).toBe('purchases');
    // Nobody waits for DEV access but purchases do: the sub-tab opens on Purchase requests.
    TestBed.resetTestingModule();
    waiting = { waiting: [] };
    setup('owner');
    const quiet = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await quiet.ngOnInit();
    expect(quiet.tabs()[0].label).toBe('Waiting for access · 2');
    expect(quiet.waitingView()).toBe('purchases');
  });

  it('shows an admin Waiting for access with Purchase requests alone, and never asks for the waiting people', async () => {
    setup('admin');
    const page = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await page.ngOnInit();
    expect(requests).not.toContain('/admin/access/waiting');
    expect(requests).toContain('/admin/test-accounts');
    expect(page.tabs().map(tab => tab.label)).toEqual(['Waiting for access · 2', 'Test accounts']);
    expect(page.waitingViews().map(view => view.id)).toEqual(['purchases']);
    expect(page.waitingView()).toBe('purchases');
    // ?view=access is not theirs: it stays on Purchase requests.
    TestBed.resetTestingModule();
    testAccounts = [testRow('learner03', null)];
    setup('admin', { tab: 'waiting', view: 'access' });
    const none = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await none.ngOnInit();
    expect(none.tabs().map(tab => tab.label)).toEqual(['Test accounts', 'Waiting for access']);
    expect(none.tab()).toBe('waiting');
    expect(none.waitingView()).toBe('purchases');
    // Even asked directly, the page does not call the owner-only list for an admin.
    await none.loadWaiting();
    expect(requests).not.toContain('/admin/access/waiting');
    expect(none.waiting()).toEqual([]);
  });

  it('renders the admin’s sub-tab and the requests, and loads them again after a decision', async () => {
    setup('admin');
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const section = root.querySelector('#waiting-for-access')!;
    expect(text(section.querySelector('h2'))).toBe('Waiting for access');
    expect(text(section.querySelector('.section-note'))).toContain('In DEV only test accounts can buy.');
    expect([...section.querySelectorAll('.waiting-tabs [role="tab"]')].map(text)).toEqual(['Purchase requests 2']);
    expect(section.querySelector('#waiting-panel')?.getAttribute('aria-labelledby')).toBe('waiting-tab-purchases');
    expect(section.querySelector('.waiting-table')).toBeNull();
    expect(text(section.querySelector('app-purchase-requests .request-count'))).toBe('2 purchase requests waiting');
    expect(section.querySelectorAll('app-purchase-requests .request-item')).toHaveLength(2);
    const loads = () => requests.filter(path => path === '/admin/test-accounts').length;
    const before = loads();
    section.querySelector<HTMLButtonElement>('.section-heading.with-action button')!.click();
    await fixture.whenStable();
    expect(loads()).toBe(before + 1);
    // A failed load is said inside the panel.
    testStatus = 500;
    await fixture.componentInstance.loadPurchases(); fixture.detectChanges();
    expect(text(section.querySelector('app-purchase-requests [role="alert"]'))).toBe('Purchase requests could not be loaded. Refresh to retry.');
    testStatus = 200;
    await fixture.componentInstance.loadPurchases(); fixture.detectChanges();
    expect(section.querySelector('app-purchase-requests [role="alert"]')).toBeNull();
  });

  it('switches the owner between DEV access and Purchase requests', async () => {
    setup('owner', { tab: 'waiting' });
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable();
    await fixture.componentInstance.reload(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const subTabs = () => [...root.querySelectorAll<HTMLButtonElement>('.waiting-tabs [role="tab"]')];
    expect(subTabs().map(text)).toEqual(['DEV access 1', 'Purchase requests 2']);
    expect(subTabs().map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    expect(root.querySelector('.waiting-table')).not.toBeNull();
    expect(root.querySelector('app-purchase-requests')).toBeNull();
    subTabs()[1].click(); fixture.detectChanges();
    expect(root.querySelector('.waiting-table')).toBeNull();
    expect(root.querySelector('app-purchase-requests')).not.toBeNull();
    expect(replaceState).toHaveBeenLastCalledWith('/admin/access', 'tab=waiting&view=purchases');
    subTabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); fixture.detectChanges();
    expect(root.querySelector('.waiting-table')).not.toBeNull();
    expect(document.activeElement?.id).toBe('waiting-tab-access');
  });

  it('shows co-authors no purchase requests and no Waiting for access', async () => {
    setup('co-author');
    const page = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await page.ngOnInit();
    expect(page.canDecide()).toBe(false);
    expect(page.purchaseCount()).toBe(0);
    expect(page.waitingViews()).toEqual([]);
    expect(page.tabs().map(tab => tab.id)).toEqual(['saved', 'test', 'people']);
    expect(requests).not.toContain('/admin/access/waiting');
    await page.loadPurchases();
    expect(page.purchaseRows()).toEqual([]);
  });

  it('outside DEV keeps Waiting for access as it was: no sub-tabs for the owner, no tab for an admin', async () => {
    testAccounts = [testRow('learner03', null)];
    setup('owner', { dev: false, tab: 'waiting' });
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable();
    await fixture.componentInstance.reload(); fixture.detectChanges();
    expect(fixture.componentInstance.waitingViews().map(view => view.id)).toEqual(['access']);
    expect((fixture.nativeElement as HTMLElement).querySelector('.waiting-tabs')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('#waiting-panel')?.getAttribute('role')).toBeNull();
    TestBed.resetTestingModule();
    setup('admin', { dev: false });
    const admin = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await admin.ngOnInit();
    expect(admin.tabs().map(tab => tab.id)).toEqual(['test']);
  });
});
