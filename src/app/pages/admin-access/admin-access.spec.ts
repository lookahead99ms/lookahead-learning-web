import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { AdminAccessPage } from './admin-access';
import { ACCOUNT_FETCH, StudyPlanAccount, StaffPermissions } from '../study-plan/study-plan-account';
import { canSeePreviews, visibleAdminLinks, visibleDocumentationGroups } from '../../core/author-workspace-nav/author-workspace-links';
import { PLATFORM_REVIEW_CLIENT, PlatformReviewError, SweepRunResult } from '../admin-reviews/platform-review.model';
import type { DirectoryRow } from './user-directory';

const permissions = (overrides: Partial<StaffPermissions>): StaffPermissions => ({
  manageAccess: false, previewDocuments: false, deliveryRead: false, deliveryCreate: false,
  deliveryReview: false, deliveryDone: false, triageFeedback: false, fullCurriculum: false,
  feedbackRole: 'user', ...overrides,
});
/** A People row as the list component emits it with Manage access. */
const row = (accountId: string, name: string, extra: Partial<DirectoryRow> = {}): DirectoryRow =>
  ({ key: accountId, accountId, name, detail: null, roles: ['Learner'], access: ['Free'], isTest: false, isSelf: false, pending: false, changedBy: null, changedAt: null, test: null, ...extra });
const text = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

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
      .toEqual(['docs', 'delivery', 'feedback']);
    expect(visibleAdminLinks({ ...account, permissions: permissions({ previewDocuments: true, deliveryRead: true, feedbackRole: 'co-author' }) }).map(row => row.id))
      .toEqual(['docs', 'delivery', 'feedback', 'access', 'previews']);
    // Admins and co-authors see the access entry as Test Accounts; the owner as People & Access.
    expect(visibleAdminLinks({ ...account, permissions: permissions({ previewDocuments: true, deliveryRead: true, feedbackRole: 'co-author' }) }).find(row => row.id === 'access')?.label).toBe('Test Accounts');
    expect(visibleAdminLinks({ ...account, permissions: permissions({ previewDocuments: true, deliveryRead: true, manageAccess: true }) }).find(row => row.id === 'access')?.label).toBe('People & Access');
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
        if (init?.method === 'POST') return Response.json({ data: { ...JSON.parse(init.body as string), revision: 1 } }, { status: saveStatus });
        return Response.json({ data: [] });
      } },
    ] });
    page = TestBed.runInInjectionContext(() => new AdminAccessPage());
  });
  it('opens a person from a row, lists the change under Review & confirm and saves it through a CSRF-protected write', async () => {
    await page.giveAccessTo(row('existing-id', 'Learner'));
    expect(page.person()).toMatchObject({ accountId: 'existing-id', name: 'Learner', pendingEmail: null });
    expect(page.draft).toMatchObject({ accountId: 'existing-id', pendingEmail: null, revision: 0 });
    expect(page.changes()).toEqual([]);
    expect(page.personTabs().at(-1)).toEqual({ id: 'review', label: 'Review & confirm' });
    page.toggle('roles', 'tester', true);
    expect(page.changes()).toEqual([{ kind: 'Role', text: 'Tester', added: true }]);
    expect(page.personTabs().at(-1)).toEqual({ id: 'review', label: 'Review & confirm · 1' });
    page.selectPersonTab('review');
    await page.save();
    const write = requests.find(row => row.path.endsWith('/admin/access') && row.init?.method === 'POST')!;
    expect(write.init?.headers).toMatchObject({ 'X-CSRF-TOKEN': 'synthetic-csrf' });
    expect(JSON.parse(write.init?.body as string)).toMatchObject({ accountId: 'existing-id', roles: ['tester'], revision: 0 });
    // Saved: the list shows again with the notice, and the assignment carries the server's revision.
    expect(page.person()).toBeNull();
    expect(page.draft).toBeNull();
    expect(page.assignments()[0]).toMatchObject({ accountId: 'existing-id', revision: 1 });
    expect(page.notice()).toBe('Access saved for Learner. It applies to their next request.');
  });
  it('gives a new admin the entire curriculum by default, lets the owner clear it, and lists every change', async () => {
    await page.giveAccessTo(row('existing-id', 'Learner'));
    expect(page.draft?.fullCurriculum).toBe(false);
    page.toggle('roles', 'reviewer', true);
    expect(page.draft?.fullCurriculum).toBe(false);
    page.toggle('roles', 'admin', true);
    expect(page.draft?.fullCurriculum).toBe(true);
    page.toggle('topicGrants', 'learn:core-java', true);
    expect(page.changes()).toEqual([
      { kind: 'Role', text: 'Reviewer', added: true }, { kind: 'Role', text: 'Admin', added: true },
      { kind: 'Curriculum', text: 'Entire curriculum', added: true }, { kind: 'Course', text: 'Learn · Core Java', added: true },
    ]);
    page.setFullCurriculum(false); page.toggle('roles', 'reviewer', false); page.toggle('topicGrants', 'learn:core-java', false);
    expect(page.changes()).toEqual([{ kind: 'Role', text: 'Admin', added: true }]);
    await page.save();
    const write = requests.find(row => row.path.endsWith('/admin/access') && row.init?.method === 'POST')!;
    expect(JSON.parse(write.init?.body as string)).toMatchObject({ roles: ['admin'], fullCurriculum: false });
    expect(page.roleNames(['admin', 'reviewer'])).toBe('Admin, Reviewer');
    expect(page.roleNames([])).toBe('No staff role');
    // Removed lines show what goes away.
    page.edit({ id: 'x', accountId: 'a', pendingEmail: null, roles: ['tester'], topicGrants: ['grow:b'], fullCurriculum: true, revision: 3 });
    page.toggle('roles', 'tester', false); page.toggle('topicGrants', 'grow:b', false); page.setFullCurriculum(false);
    expect(page.changes()).toEqual([
      { kind: 'Role', text: 'Tester', added: false }, { kind: 'Curriculum', text: 'Entire curriculum', added: false }, { kind: 'Course', text: 'Grow · B', added: false },
    ]);
  });
  it('prepares access for an email, keeps the draft open on a concurrent-save conflict, and refuses an empty address', async () => {
    page.invite('Invited@Example.invalid'); page.toggle('roles', 'reviewer', true);
    expect(page.person()).toMatchObject({ accountId: null, pendingEmail: 'invited@example.invalid', name: 'invited@example.invalid' });
    expect(page.draft?.accountId).toBeNull(); expect(page.draft?.pendingEmail).toBe('invited@example.invalid');
    expect(page.admission().state).toBe('prepared');
    saveStatus = 409; page.selectPersonTab('review'); await page.save();
    expect(page.notice()).toContain('Access changed');
    expect(page.personTab()).toBe('review');
    expect(page.person()).not.toBeNull();
    expect(page.draft?.revision).toBe(0); expect(page.assignments()).toEqual([]);
    saveStatus = 200; await page.save();
    expect(page.person()).toBeNull();
    expect(page.notice()).toBe('Access prepared for invited@example.invalid. The first time this email signs in on DEV, the person is admitted with it. No email has been sent.');
    page.invite('   ');
    expect(page.person()).toBeNull();
    expect(page.notice()).toBe('Enter an email address.');
    // An existing prepared entry opens as it is.
    page.assignments.set([{ id: 'p1', accountId: null, pendingEmail: 'sam@example.invalid', roles: ['reviewer'], topicGrants: [], fullCurriculum: false, revision: 2 }]);
    page.invite('SAM@example.invalid');
    expect(page.draft).toMatchObject({ id: 'p1', revision: 2 });
    page.closePerson();
    page.reviewPrepared(page.assignments()[0]);
    expect(page.person()?.pendingEmail).toBe('sam@example.invalid');
    expect(page.fromTab()).toBe('people');
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
    const page = fixture.componentInstance;
    expect(page.outline().map(item => item.href)).toEqual(['#people']);
    page.invite('person@example.invalid');
    expect(page.outline().map(item => item.href)).toEqual(['#person-panel']);
    page.selectTab('test');
    expect(page.person()).toBeNull();
    expect(page.outline().map(item => item.href)).toEqual(['#test-accounts']);
    page.selectTab('waiting');
    expect(page.outline().map(item => item.href)).toEqual(['#waiting-for-access']);
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
    // Owner, 2026-11-08: the dialogs sit over the page and become a bottom sheet on phones; the save bar sticks.
    expect(css).toContain('.dialog-scrim { position: fixed; inset: 0;');
    expect(css).toContain('.save-bar { position: sticky; bottom: 0;');
    expect(css).toContain('@media (max-width: 640px) { .removal-option { grid-template-columns: minmax(0, 1fr); } .dialog-scrim { place-items: end center;');
  });

  it('fills the centre column on wide monitors while notes keep a readable line length', async () => {
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.componentInstance.invite('person@example.invalid');
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
  it('explains roles, grants and plans in the hero, and shows an invite the five tabs of the person panel (DLV-209)', async () => {
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect([...root.querySelectorAll('.how-card h3')].map(h => h.textContent?.trim())).toEqual(['Staff roles', 'Course access grants', 'Plans and purchases']);
    expect(root.querySelector('.how-link')?.getAttribute('href')).toBe('/admin/plans');
    expect(root.textContent).toContain('Local purchases use mock payments');
    expect(root.querySelector('#configured-plans, .plan-table')).toBeNull();
    expect(root.querySelectorAll('.access-hero .how-card')).toHaveLength(3);
    expect(root.querySelector('.hero-facts')).toBeNull();
    expect(root.querySelector('.access-hero .lede')?.textContent).toContain('Only the owner changes roles and course access');
    // People opens with the list; the person panel replaces it once someone is opened.
    expect(root.querySelector('#access-panel > app-test-accounts')).not.toBeNull();
    expect(root.querySelector('#person-panel')).toBeNull();

    fixture.componentInstance.invite('person@example.invalid');
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(root.querySelector('#access-panel > app-test-accounts')).toBeNull();
    const panel = root.querySelector('#person-panel')!;
    expect(text(panel.querySelector('#person-heading'))).toBe('person@example.invalid');
    expect(text(panel.querySelector('.person-id .state-pill'))).toBe('Prepared');
    // No section headings: the person, then four tabs with one card at a time, then the save bar (owner, 2026-11-08).
    expect(panel.querySelector('.section-heading')).toBeNull();
    const personTabs = () => [...panel.querySelectorAll<HTMLButtonElement>('.person-tabs [role="tab"]')];
    expect(personTabs().map(tab => [text(tab), tab.getAttribute('aria-selected')])).toEqual([['DEV admission', 'true'], ['Roles', 'false'], ['Course access', 'false'], ['Plans and purchases', 'false'], ['Review & confirm', 'false']]);
    expect(panel.querySelectorAll('#person-tabpanel > .panel')).toHaveLength(1);
    expect(panel.querySelector('#person-tabpanel > .save-bar')).not.toBeNull();
    expect(text(panel.querySelector('#dev-admission .context-note'))).toContain('No account yet: this is an invite. The first time this email signs in on DEV');
    expect([...panel.querySelectorAll('#dev-admission .card-actions button')].map(text)).toEqual(['Withdraw invite']);
    personTabs()[3].click(); fixture.detectChanges();
    expect(panel.querySelector('#dev-admission')).toBeNull();
    expect(text(panel.querySelector('.membership-panel .empty'))).toBe('Nothing yet. Plans appear once the account exists.');
    expect(panel.querySelector('app-admin-memberships')).toBeNull();
    personTabs()[1].click(); fixture.detectChanges();
    expect(panel.querySelectorAll('.role-option')).toHaveLength(4);
    const page = fixture.componentInstance;
    page.onPersonKey(new KeyboardEvent('keydown', { key: 'ArrowRight' })); expect(page.personTab()).toBe('courses');
    page.onPersonKey(new KeyboardEvent('keydown', { key: 'End' })); expect(page.personTab()).toBe('review');
    page.onPersonKey(new KeyboardEvent('keydown', { key: 'ArrowRight' })); expect(page.personTab()).toBe('admission');
    page.onPersonKey(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); expect(page.personTab()).toBe('review');
    page.onPersonKey(new KeyboardEvent('keydown', { key: 'Home' })); expect(page.personTab()).toBe('admission');
    page.onPersonKey(new KeyboardEvent('keydown', { key: 'x' })); expect(page.personTab()).toBe('admission');
    expect(text(panel.querySelector('.save-message'))).toBe('No changes yet. Roles and Course access save together as one assignment.');
    fixture.detectChanges();
    expect([...panel.querySelectorAll('.save-actions button')].map(text)).toEqual(['Discard', 'Continue to Roles']);
    expect(text(panel.querySelector('.back-link'))).toBe('← Back to People');
  });
});

describe('People and access tabs', () => {
  it('opens on People, shows each tab only when chosen, and moves with the arrow keys', async () => {
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
      ['People', 'true'], ['Review requests', 'false'], ['Test accounts', 'false'],
    ]);
    expect(root.querySelector('#access-panel #people h2')?.textContent).toBe('People');
    expect(root.querySelector('#waiting-for-access')).toBeNull();

    tabs()[1].click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(root.querySelector('#access-panel #waiting-for-access h2')?.textContent).toBe('Review requests');
    expect(root.querySelector('#waiting-for-access .empty')?.textContent).toBe('Nobody is waiting for access.');
    expect(root.querySelector('#waiting-for-access .section-note')?.textContent).toContain('removed after 48 hours');
    // Outside DEV with nothing waiting, there is no Purchase requests sub-tab; Invites sent comes last.
    expect([...root.querySelectorAll('.waiting-tabs [role="tab"]')].map(text)).toEqual(['DEV admissions 0', 'Invites sent 0']);
    root.querySelectorAll<HTMLButtonElement>('.waiting-tabs [role="tab"]')[1].click(); fixture.detectChanges();
    expect(root.querySelector('#invites-sent .empty')?.textContent).toBe('No invites yet. Add by email on People prepares access for someone who has not signed in.');
    expect(root.querySelector('#waiting-for-access .section-note')?.textContent).toContain('No email goes out');
    expect(root.querySelector('app-test-accounts')).toBeNull();

    tabs()[2].click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(root.querySelector('#access-panel #test-accounts h2')?.textContent).toBe('Test accounts');
    expect(root.querySelector('#waiting-for-access')).toBeNull();
    expect(root.querySelector('#access-panel')?.getAttribute('aria-labelledby')).toBe('access-tab-test');

    const page = fixture.componentInstance;
    page.onTabKey(new KeyboardEvent('keydown', { key: 'ArrowRight' })); expect(page.tab()).toBe('people');
    page.onTabKey(new KeyboardEvent('keydown', { key: 'ArrowRight' })); expect(page.tab()).toBe('waiting');
    page.onTabKey(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); expect(page.tab()).toBe('people');
    page.onTabKey(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); expect(page.tab()).toBe('test');
    page.onTabKey(new KeyboardEvent('keydown', { key: 'End' })); expect(page.tab()).toBe('test');
    page.onTabKey(new KeyboardEvent('keydown', { key: 'Home' })); expect(page.tab()).toBe('people');
    page.onTabKey(new KeyboardEvent('keydown', { key: 'a' })); expect(page.tab()).toBe('people');
  });

  it('opens the person from the row itself, never by lookup, and Back returns to the tab it came from', async () => {
    const saved = { id: 's1', accountId: 'saved-id', pendingEmail: null, roles: ['reviewer'], topicGrants: [], fullCurriculum: false, revision: 2 };
    const paths: string[] = [];
    TestBed.configureTestingModule({ providers: [
      { provide: StudyPlanAccount, useValue: { account: signal({ permissions: permissions({ manageAccess: true }) }), apiPath: (path: string) => path } },
      { provide: Location, useValue: { replaceState: vi.fn() } },
      { provide: ACCOUNT_FETCH, useValue: async (path: string, init?: RequestInit) => {
        paths.push(path + (init?.body ? ' ' + init.body : ''));
        if (path.endsWith('/auth/csrf')) return Response.json({ data: { headerName: 'X-CSRF-TOKEN', token: 't' } });
        if (path.startsWith('/admin/accounts')) return Response.json({ data: { accounts: [{ accountId: 'new-id', username: 'olivia', displayName: 'Olivia Bennett', email: 'olivia@example.test',
          roles: ['user'], testAccount: false, fullCurriculum: false, access: { label: 'Free', labels: ['Free'], grantedCourseIds: [] }, signIn: 'active', canDisable: true, canRemove: true }], page: 0, hasNext: false } });
        return Response.json({ data: path === '/admin/access' ? [saved] : [] });
      } },
    ] });
    const page = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await page.reload(); await page.loadNames();

    page.selectTab('test');
    await page.giveAccessTo(row('saved-id', 'reviewer01', { isTest: true }));
    expect(page.tab()).toBe('test');
    expect(page.fromTab()).toBe('test');
    expect(page.draft).toMatchObject({ id: 's1', roles: ['reviewer'] });
    expect(page.person()).toMatchObject({ accountId: 'saved-id', name: 'reviewer01', isTest: true, email: null });
    expect(page.admission()).toMatchObject({ state: 'test', label: 'Test account', canDisable: false, deletePath: null });
    // A test account never passes the gate, so its panel has no DEV admission tab and opens on Roles.
    expect(page.personTabs().map(tab => tab.id)).toEqual(['roles', 'courses', 'plans', 'review']);
    expect(page.personTab()).toBe('roles');
    page.selectPersonTab('plans');
    expect(page.personTab()).toBe('plans');
    expect(paths.some(path => path.includes('/lookup'))).toBe(false);

    // A row shows the display name, which a lookup would not match: the account id on the row is enough. The owner's
    // directory supplies the email, username and the gate state.
    page.selectTab('people');
    expect(page.person()).toBeNull();
    await page.giveAccessTo(row('new-id', 'Olivia Bennett'));
    expect(paths.some(path => path.includes('/lookup'))).toBe(false);
    expect(page.draft).toMatchObject({ accountId: 'new-id', roles: [], revision: 0 });
    expect(page.person()).toMatchObject({ accountId: 'new-id', name: 'Olivia Bennett', email: 'olivia@example.test', username: 'olivia' });
    expect(page.admission()).toMatchObject({ state: 'admitted', label: 'Admitted', canDisable: true, canEnable: false, deletePath: 'remove' });
    // Opening another person starts on the first tab again, DEV admission for a real account.
    expect(page.personTabs().map(tab => tab.id)).toEqual(['admission', 'roles', 'courses', 'plans', 'review']);
    expect(page.personTab()).toBe('admission');
    expect(page.notice()).toBe('');
    expect(page.outline().map(item => item.label)).toEqual(['Manage access']);

    page.closePerson();
    expect(page.draft).toBeNull();
    expect(page.nameOf(saved)).toBe('Account saved-id');
    await page.giveAccessTo({ ...row('x', 'x'), accountId: null });
    expect(page.person()).toBeNull();
    // An account the directory does not know shows no gate state and offers nothing to revoke.
    await page.giveAccessTo(row('ghost', 'Ghost'));
    expect(page.admission()).toMatchObject({ state: 'unknown', label: 'Account', canDisable: false, deletePath: null });
    expect(page.canManageAdmission()).toBe(false);
    page.openAdmission();
    expect(page.admissionDialog()).toBeNull();
  });
});

describe('Assignment names and prepared access', () => {
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

  it('names assignments by username instead of account ID, sorted by role then name, prepared emails last', async () => {
    const page = setup(true);
    await page.reload(); await page.loadNames();
    expect(page.sortedAssignments().map(row => page.nameOf(row))).toEqual([
      'coauthor01', 'admin01', 'sam.k', 'Account unknown-', 'learner03', 'new@example.test',
    ]);
    expect(page.names().get('owner-id')).toBe('author');
    expect([saved[0], { ...saved[0], topicGrants: ['learn:a'] }, { ...saved[0], topicGrants: ['learn:a', 'grow:b'] }, saved[5], { ...saved[0], fullCurriculum: true }]
      .map(row => page.courseText(row))).toEqual(['No course access', '1 selected course', '2 selected courses', 'Entire curriculum', 'Entire curriculum']);
    // Only the owner's prepared emails are listed under Review requests.
    expect(page.prepared().map(row => row.pendingEmail)).toEqual(['new@example.test']);
    expect(page.emailOf(saved[3])).toBeNull();
  });

  it('falls back to short IDs when the owner directory cannot load, and co-authors never ask for it or see prepared access', async () => {
    const owner = setup(true, 'down');
    await owner.reload(); await owner.loadNames();
    expect(owner.nameOf(saved[3])).toBe('Account real-id');
    expect(owner.nameOf(saved[1])).toBe('admin01');
    TestBed.resetTestingModule();
    const coauthor = setup(false);
    await coauthor.reload(); await coauthor.loadNames();
    expect(coauthor.nameOf(saved[3])).toBe('Account real-id');
    expect(coauthor.nameOf(saved[0])).toBe('learner03');
    expect(coauthor.prepared()).toEqual([]);
    expect(coauthor.tabs().map(tab => tab.id)).toEqual(['test', 'people']);
    coauthor.reviewPrepared(saved[2]);
    expect(coauthor.person()).toBeNull();
  });
});

describe('Prepared access for the owner (DLV-969, 2026-11-08)', () => {
  const saved = [
    { id: 'a1', accountId: 'priya-id', pendingEmail: null, roles: ['co-author'], topicGrants: [], fullCurriculum: false, revision: 1 },
    { id: 'p1', accountId: null, pendingEmail: 'sam@example.test', roles: ['reviewer'], topicGrants: ['learn:a'], fullCurriculum: false, revision: 1 },
  ];
  const directory = [{ accountId: 'priya-id', username: 'google_113773373524221303247', displayName: 'Priya Raman', email: 'priya@gmail.example',
    roles: ['co-author'], testAccount: false, fullCurriculum: false, access: { label: 'Free', labels: ['Free'], grantedCourseIds: [] },
    signIn: 'active', canDisable: true, canRemove: true }];
  it('lists invites under Review requests → Invites sent with Manage access, and names the person with their Gmail in the panel', async () => {
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: StudyPlanAccount, useValue: { account: signal({ accountId: 'owner-id', username: 'author', topicGrants: [], permissions: permissions({ manageAccess: true, feedbackRole: 'owner' }) }), apiPath: (path: string) => path } },
      { provide: ACCOUNT_FETCH, useValue: async (path: string) => Response.json({ data:
        path === '/admin/access' ? saved : path.startsWith('/admin/accounts') ? { accounts: directory, page: 0, hasNext: false }
        : path === '/admin/test-accounts' ? undefined : [] }, { status: path === '/admin/test-accounts' ? 403 : 200 }) },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ tab: 'waiting' }) } } },
    ] }).overrideComponent(AdminAccessPage, { remove: { imports: [PlatformHeader] }, add: { imports: [HeaderStub] } });
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable();
    await fixture.componentInstance.reload(); await fixture.componentInstance.loadNames(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect([...root.querySelectorAll('.waiting-tabs [role="tab"]')].map(text)).toEqual(['DEV admissions 0', 'Invites sent 1']);
    fixture.componentInstance.selectWaitingView('invites'); fixture.detectChanges();
    const prepared = root.querySelector('#invites-sent')!;
    expect(text(prepared.querySelector('.assignment-who'))).toBe('sam@example.test');
    expect(text(prepared.querySelector('.assignment-state'))).toBe('Admitted at first sign-in');
    expect(text(prepared.querySelector('.assignment-grants'))).toBe('Reviewer · 1 selected course');
    expect(prepared.querySelectorAll('.assignment')).toHaveLength(1);
    expect(root.textContent).not.toContain('google_1137');
    prepared.querySelector<HTMLButtonElement>('.assignment-actions button')!.click(); fixture.detectChanges();
    expect(fixture.componentInstance.person()?.pendingEmail).toBe('sam@example.test');
    expect(fixture.componentInstance.fromTab()).toBe('waiting');
    expect(text(root.querySelector('.back-link'))).toBe('← Back to Review requests');
    expect(text(root.querySelector('.person-id .state-pill'))).toBe('Prepared');
    // A person from the directory: the panel shows their name, Gmail and the gate state.
    await fixture.componentInstance.giveAccessTo(row('priya-id', 'Priya Raman')); fixture.detectChanges();
    expect(text(root.querySelector('#person-heading'))).toBe('Priya Raman');
    expect(text(root.querySelector('.person-sub'))).toContain('priya@gmail.example');
    expect(root.textContent).not.toContain('google_1137');
    expect([...root.querySelectorAll('#dev-admission .admission-facts dt')].map(text)).toEqual(['Gate', 'Email']);
    expect(text(root.querySelector('#dev-admission .state-pill'))).toBe('Admitted');
    expect([...root.querySelectorAll('#dev-admission .card-actions button')].map(text)).toEqual(['Manage DEV admission']);
    expect(fixture.componentInstance.internalName('google_1')).toBe(true);
    expect(fixture.componentInstance.internalName('sam@example.test')).toBe(false);
    expect(fixture.componentInstance.emailOf(saved[0])).toBe('priya@gmail.example');
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
    page.selectTab('waiting');
    expect(replaceState).toHaveBeenLastCalledWith('/admin/access', 'tab=waiting');
    page.selectTab('people');
    expect(replaceState).toHaveBeenLastCalledWith('/admin/access', '');
  });
  it('lands the addresses from before 2026-11-08 (Manage access, Roles and grants) on People', () => {
    expect(setup('assign').page.tab()).toBe('people');
    TestBed.resetTestingModule();
    expect(setup('saved').page.tab()).toBe('people');
  });
  it('opens Review requests on the request a Review request names, once, and takes it out of the address (DLV-969)', () => {
    for (const role of ['owner', 'admin']) {
      TestBed.resetTestingModule();
      const { page, replaceState } = setup('waiting', role, { view: 'purchases', request: 'pur-9', return: '/grow/java/streams?unit=2', account: 'acc-06' }, true);
      expect(page.tab()).toBe('waiting');
      expect(page.waitingView()).toBe('purchases');
      expect(page.requestReview()).toEqual({ purchaseId: 'pur-9', returnTo: '/grow/java/streams?unit=2', accountId: 'acc-06' });
      // The address keeps only the tab and section, so a reload does not open the review again.
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
    // `view=` alone opens that sub-tab; a sub-tab this person has not got falls back to the first.
    TestBed.resetTestingModule();
    expect(setup('waiting', 'owner', { view: 'invites' }).page.waitingView()).toBe('invites');
    TestBed.resetTestingModule();
    expect(setup('waiting', 'owner', { view: 'purchases' }).page.waitingView()).toBe('access');
    TestBed.resetTestingModule();
    expect(setup('waiting').page.waitingView()).toBe('access');
  });
  it('leaves the address alone without review values, and clears stray ones without opening anything', () => {
    const { page, replaceState } = setup('waiting');
    expect(page.requestReview()).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    const stray = setup('waiting', 'owner', { return: '/learn' });
    expect(stray.page.requestReview()).toBeNull();
    expect(stray.page.tab()).toBe('waiting');
    expect(stray.replaceState).toHaveBeenCalledExactlyOnceWith('/admin/access', 'tab=waiting');
    TestBed.resetTestingModule();
    expect(setup(null, 'owner', { account: 'acc-06' }).replaceState).toHaveBeenCalledExactlyOnceWith('/admin/access', '');
  });
  it('ignores unknown tabs and tabs the person cannot see', () => {
    expect(setup('nonsense').page.tab()).toBe('people');
    TestBed.resetTestingModule();
    expect(setup('people', 'admin').page.tab()).toBe('test');
  });
});

describe('test account admin outline', () => {
  it('admins without the assignments start on Test accounts', () => {
    TestBed.configureTestingModule({ providers: [
      { provide: StudyPlanAccount, useValue: { account: signal({ permissions: permissions({ feedbackRole: 'admin', triageFeedback: true }) }) } },
      { provide: ACCOUNT_FETCH, useValue: async () => Response.json({ data: [] }) },
    ] });
    const page = TestBed.runInInjectionContext(() => new AdminAccessPage());
    // DLV-969 (owner, 2026-11-04): admins see no People list, so the tab is not shown at all.
    expect(page.tabs().map(tab => tab.label)).toEqual(['Test accounts']);
    expect(page.tab()).toBe('test');
    page.selectTab('people');
    expect(page.tab()).toBe('test');
    expect(page.outline().map(item => item.href)).toEqual(['#test-accounts']);
  });
});

/** DLV-969 (2026-11-02): people who signed in to DEV but wait for the owner's admission. */
describe('Review requests', () => {
  const alex = { accountId: 'alex-id', username: 'alex.example', displayName: 'Alex Example', email: 'alex@example.test', requestedAt: '2026-11-02T14:05:00Z', expiresAt: '2026-11-04T14:05:00Z' };
  const sam = { accountId: 'sam-id', username: 'sam.k', displayName: 'sam.k', email: null, requestedAt: '2026-11-02T09:00:00Z', expiresAt: '2026-11-04T09:00:00Z' };
  let requests: { path: string; init?: RequestInit }[];
  let waiting: unknown;
  let waitingStatus: number;
  let admitStatus: number;
  let rejectStatus: number;
  /** The review client that carries Clean up admissions (owner, 2026-11-07); the route provides it. */
  const reviewClient = { runSweeps: vi.fn<(job: string) => Promise<SweepRunResult>>() };
  const setup = (feedbackRole: 'owner' | 'co-author', tab: string | null = 'waiting', withReviewClient = true) => {
    requests = [];
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      ...(withReviewClient ? [{ provide: PLATFORM_REVIEW_CLIENT, useValue: reviewClient }] : []),
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
  beforeEach(() => { waiting = { waiting: [alex, sam], expiryHours: 48 }; waitingStatus = 200; admitStatus = 200; rejectStatus = 200; reviewClient.runSweeps.mockReset(); });

  describe('Clean up admissions (owner, 2026-11-07)', () => {
    const ranAt = '2026-11-07T10:05:00Z';
    const ranTime = new Date(ranAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const ran = (admissionsRemoved: number | null): SweepRunResult => ({ job: 'admissions', ranAt, supportRequestsClosed: null, inboxMerged: null, inboxResult: null, admissionsRemoved });
    /** The DEV gate list is DEV's; the gate is on unless a test turns it off. */
    async function render(dev = true) {
      if (dev) TestBed.inject(DevSession).gated.set(true);
      const fixture = TestBed.createComponent(AdminAccessPage);
      fixture.detectChanges(); await fixture.whenStable();
      await fixture.componentInstance.reload(); fixture.detectChanges();
      return { fixture, root: fixture.nativeElement as HTMLElement };
    }
    /** Lets a reload that the job started finish before reading the list. */
    async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
      await fixture.whenStable(); await new Promise(resolve => setTimeout(resolve)); fixture.detectChanges();
    }
    afterEach(() => { TestBed.inject(DevSession).gated.set(false); TestBed.inject(DevSession).status.set(null); });
    const cleanUp = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('#waiting-for-access .heading-actions .clean-up-admissions');
    const line = (root: HTMLElement) => root.querySelector<HTMLElement>('#waiting-for-access .cleanup-line');
    const waitingLoads = () => requests.filter(row => row.path === '/admin/access/waiting').length;

    it('sits beside Refresh for the owner with its title, and is not there for a co-author or without the review client', async () => {
      setup('owner');
      const { root, fixture } = await render();
      const actions = [...root.querySelectorAll<HTMLButtonElement>('#waiting-for-access .heading-actions button')].map(button => button.textContent?.trim());
      expect(actions).toEqual(['Refresh', 'Clean up admissions']);
      expect(cleanUp(root)!.title).toBe('Removes waiting rows older than 48 hours now, the same as the 4-hour job');
      expect(cleanUp(root)!.classList.contains('secondary-action')).toBe(true);
      expect(cleanUp(root)!.disabled).toBe(false);
      expect(line(root)).toBeNull();
      // A DEV session (the status) carries DEV as well as the gate.
      TestBed.inject(DevSession).gated.set(false);
      TestBed.inject(DevSession).status.set({ ok: true } as never);
      fixture.detectChanges();
      expect(cleanUp(root)).not.toBeNull();

      TestBed.resetTestingModule();
      setup('owner', 'waiting', false);
      const bare = await render();
      expect(bare.root.querySelector('#waiting-for-access .heading-actions button')?.textContent?.trim()).toBe('Refresh');
      expect(cleanUp(bare.root)).toBeNull();
      expect(bare.fixture.componentInstance.canCleanUp()).toBe(false);
      await bare.fixture.componentInstance.cleanUpAdmissions();
      expect(reviewClient.runSweeps).not.toHaveBeenCalled();

      TestBed.resetTestingModule();
      setup('co-author');
      const coauthor = await render();
      // A co-author has no Review requests at all; the method refuses as well.
      expect(coauthor.root.querySelector('#waiting-for-access')).toBeNull();
      expect(coauthor.fixture.componentInstance.canCleanUp()).toBe(false);
      await coauthor.fixture.componentInstance.cleanUpAdmissions();
      expect(reviewClient.runSweeps).not.toHaveBeenCalled();
    });

    it('never shows on PROD: without a DEV session the owner has Refresh alone (owner, 2026-11-07)', async () => {
      setup('owner');
      const { fixture, root } = await render(false);
      expect(fixture.componentInstance.dev()).toBe(false);
      expect([...root.querySelectorAll<HTMLButtonElement>('#waiting-for-access .heading-actions button')].map(button => button.textContent?.trim())).toEqual(['Refresh']);
      expect(cleanUp(root)).toBeNull();
      expect(fixture.componentInstance.canCleanUp()).toBe(false);
      await fixture.componentInstance.cleanUpAdmissions();
      expect(reviewClient.runSweeps).not.toHaveBeenCalled();
      TestBed.inject(DevSession).gated.set(true);
      fixture.detectChanges();
      expect(cleanUp(root)).not.toBeNull();
    });

    it('runs the admissions job, waits while it runs, says how many were removed and reloads the waiting list', async () => {
      let finish!: (result: SweepRunResult) => void;
      reviewClient.runSweeps.mockImplementationOnce(() => new Promise<SweepRunResult>(resolve => (finish = resolve)));
      setup('owner');
      const { fixture, root } = await render();
      const loadsBefore = waitingLoads();
      cleanUp(root)!.click(); fixture.detectChanges();
      expect(reviewClient.runSweeps).toHaveBeenCalledExactlyOnceWith('admissions');
      expect(cleanUp(root)!.disabled).toBe(true);
      expect(cleanUp(root)!.getAttribute('aria-busy')).toBe('true');
      // A second click while it runs sends nothing.
      await fixture.componentInstance.cleanUpAdmissions();
      expect(reviewClient.runSweeps).toHaveBeenCalledTimes(1);
      waiting = { waiting: [sam], expiryHours: 48 };
      finish(ran(1));
      await settle(fixture);
      expect(line(root)!.textContent).toBe(`Clean up admissions ran at ${ranTime}: 1 removed`);
      expect(line(root)!.getAttribute('role')).toBe('status');
      expect(line(root)!.classList.contains('failed')).toBe(false);
      expect(waitingLoads()).toBe(loadsBefore + 1);
      expect(fixture.componentInstance.waiting().map(row => row.accountId)).toEqual(['sam-id']);
      expect(cleanUp(root)!.disabled).toBe(false);
      expect(cleanUp(root)!.hasAttribute('aria-busy')).toBe(false);
      reviewClient.runSweeps.mockResolvedValueOnce(ran(0));
      cleanUp(root)!.click(); await settle(fixture);
      expect(line(root)!.textContent).toBe(`Clean up admissions ran at ${ranTime}: 0 removed`);
    });

    it('says the cleanup runs only on DEV when the Domain answers conflict, and names any other failure', async () => {
      reviewClient.runSweeps.mockRejectedValueOnce(new PlatformReviewError('conflict', 'The admission cleanup runs only in cloud mode; this Domain has none.'));
      setup('owner');
      const { fixture, root } = await render();
      const loadsBefore = waitingLoads();
      cleanUp(root)!.click(); await fixture.whenStable(); fixture.detectChanges();
      expect(line(root)!.textContent).toBe('The admission cleanup runs only on DEV.');
      expect(line(root)!.getAttribute('role')).toBe('status');
      expect(line(root)!.classList.contains('failed')).toBe(false);
      expect(waitingLoads()).toBe(loadsBefore);
      expect(cleanUp(root)!.disabled).toBe(false);
      reviewClient.runSweeps.mockRejectedValueOnce(new PlatformReviewError('unavailable', 'The review service is unavailable.'));
      cleanUp(root)!.click(); await fixture.whenStable(); fixture.detectChanges();
      expect(line(root)!.textContent).toBe('Clean up admissions failed: The review service is unavailable.');
      expect(line(root)!.getAttribute('role')).toBe('alert');
      expect(line(root)!.classList.contains('failed')).toBe(true);
      reviewClient.runSweeps.mockRejectedValueOnce('boom');
      cleanUp(root)!.click(); await fixture.whenStable(); fixture.detectChanges();
      expect(line(root)!.textContent).toBe('Clean up admissions failed: unknown error');
      expect(waitingLoads()).toBe(loadsBefore);
    });
  });

  it('keeps its place after People, carries the count of people at the gate, and never shows for co-authors', async () => {
    waiting = { waiting: [] };
    setup('owner', null);
    const page = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await page.reload();
    expect(page.tabs().map(tab => tab.id)).toEqual(['people', 'waiting', 'test']);
    expect(page.tab()).toBe('people');
    waiting = { waiting: [alex, sam], expiryHours: 72 };
    await page.loadWaiting();
    expect(page.tabs().map(tab => tab.label)).toEqual(['People', 'Review requests · 2', 'Test accounts']);
    expect(page.tab()).toBe('people');
    expect(page.reviewCount()).toBe(2);
    expect(page.expiryHours()).toBe(72);
    page.selectTab('waiting');
    expect(page.outline().map(item => item.href)).toEqual(['#waiting-for-access']);
    expect(page.waitingViews()).toEqual([{ id: 'access', label: 'DEV admissions', count: 2 }, { id: 'invites', label: 'Invites sent', count: 0 }]);

    TestBed.resetTestingModule();
    setup('co-author', null);
    const coauthor = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await coauthor.reload();
    expect(coauthor.tabs().map(tab => tab.id)).toEqual(['test', 'people']);
    expect(coauthor.tab()).toBe('test'); // co-authors open on Test accounts (owner, 2026-11-06)
    expect(requests.some(row => row.path === '/admin/access/waiting')).toBe(false);
    expect(coauthor.assignments()).toHaveLength(1);
    expect(coauthor.reviewCount()).toBe(0);
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

  it('admits with the chosen role through a CSRF-protected write, removes the row and reloads the assignments', async () => {
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
    waiting = { waiting: [] };
    await page.loadWaiting();
    expect(page.tabs()[1].label).toBe('Review requests');
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
    // A refused admit keeps the confirmation dialog open with the notice; a cancelled one sends nothing.
    admitStatus = 409;
    page.startAdmit(alex);
    expect(page.admitting()).toEqual(alex);
    await page.confirmAdmit();
    expect(page.admitting()).toEqual(alex);
    expect(page.notice()).toBe('Alex Example is already admitted.');
    page.cancelAdmit();
    expect(page.admitting()).toBeNull();
    await page.confirmAdmit();
    expect(admitCalls()).toHaveLength(expected.length + 1);
    // Opening Reject closes an Admit dialog and the other way round.
    page.startAdmit(alex); page.startReject(sam);
    expect(page.admitting()).toBeNull();
    page.startAdmit(alex);
    expect(page.rejecting()).toBeNull();
    page.busy.set(true);
    await page.admit(alex);
    page.startAdmit(sam);
    expect(page.admitting()).toEqual(alex);
    expect(admitCalls()).toHaveLength(expected.length + 1);
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

  it('rejects a waiting request with Disable or Delete through the same confirmed writes as Revoke (DLV-971)', async () => {
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
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.closest('.dialog-scrim')).not.toBeNull();
    expect(panel.getAttribute('aria-label')).toBe('Reject Alex Example');
    expect(panel.querySelector('h2')?.textContent).toBe('Reject Alex Example');
    expect(panel.querySelector('.danger-button')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('⚠ Disable');
    expect(panel.querySelector('.caution-button')?.textContent?.trim()).toBe('Delete');
    expect(panel.querySelector('#reject-disable')?.textContent).toBe('Strongest. Bans this email account from DEV: every sign-in, with email or Google, is blocked. They cannot ask for access again until you enable them on People.');
    expect(panel.querySelector('#reject-remove')?.textContent).toBe('Removes the request and their sign-in, but does not ban them: they can sign in and ask again at any time, and then appear here as a new person.');
    expect(panel.querySelector('.reset-panel')).toBeNull();
    panel.querySelector<HTMLButtonElement>('.caution-button')!.click(); fixture.detectChanges();
    const confirmPanel = panel.querySelector('.reset-panel')!;
    expect(confirmPanel.classList.contains('danger-panel')).toBe(false);
    expect(confirmPanel.querySelector('h3')?.textContent).toBe("Delete Alex Example's request");
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
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('.access-tabs [role="tab"]')];
    expect(tabs.map(tab => tab.textContent?.trim())).toEqual(['People', 'Review requests · 2', 'Test accounts']);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(root.querySelector('#access-panel')?.getAttribute('aria-labelledby')).toBe('access-tab-waiting');
    const section = root.querySelector('#waiting-for-access')!;
    expect(section.querySelector('.section-heading.with-action button')?.textContent?.trim()).toBe('Refresh');
    expect(section.querySelector('.section-note')?.textContent?.trim())
      .toBe('People who signed in but are not admitted yet. A request that nobody admits is removed after 48 hours. Someone whose email has an invite is admitted as they sign in and never waits here.');
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
    // Owner, 2026-11-08: Admit confirms in a dialog that names the person and the role before anything is written.
    rows[0].querySelector<HTMLButtonElement>('button')!.click(); fixture.detectChanges();
    expect(admitCalls()).toHaveLength(0);
    const dialog = root.querySelector('#admit-dialog')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(text(dialog.querySelector('h2'))).toBe('Admit Alex Example as Admin');
    expect(text(dialog.querySelector('.section-note'))).toContain('with alex@example.test');
    dialog.querySelector<HTMLButtonElement>('.actions .action-link')!.click(); fixture.detectChanges();
    expect(root.querySelector('#admit-dialog')).toBeNull();
    expect(admitCalls()).toHaveLength(0);
    rows[0].querySelector<HTMLButtonElement>('button')!.click(); fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('#admit-dialog .primary-action')!.click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(root.querySelector('#admit-dialog')).toBeNull();
    expect(JSON.parse(admitCalls()[0].init?.body as string)).toEqual({ accountId: 'alex-id', roles: ['admin'] });
    expect(root.querySelector('.notice')?.textContent).toBe('Alex Example admitted as Admin. It applies to their next sign-in.');
    expect([...root.querySelectorAll('#waiting-for-access tbody tr')].map(row => row.getAttribute('data-account'))).toEqual(['sam.k']);
    expect(root.querySelectorAll('.access-tabs [role="tab"]')[1]?.textContent?.trim()).toBe('Review requests · 1');
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
 * Owner, 2026-11-08: Review requests has its own tab bar. DEV admissions and Invites sent (last) are the owner's; Purchase
 * requests is the owner's and the admins' (DLV-969, DEV test 2026-11-04). Admins never ask for the owner-only lists.
 */
describe('Review requests sub-tabs', () => {
  const alex = { accountId: 'alex-id', username: 'alex.example', displayName: 'Alex Example', email: 'alex@example.test', requestedAt: '2026-11-02T14:05:00Z', expiresAt: '2026-11-04T14:05:00Z' };
  const purchase = (id: string, at: string) => ({ purchaseId: id, kind: 'new', fromPlan: null, toPlan: { code: 'learn', name: 'Learn' }, priceCents: 6999, requestedAt: at, requestedBy: { self: false, label: 'Admin 2' } });
  const testRow = (id: string, pendingPurchase: unknown) => ({ accountId: id, username: id + '@lookahead.dev', roles: [], revision: 1, access: { label: 'Free' }, lastChangedBy: 'seed', lastChangedAt: '2026-10-16', legacyPresetAvailable: false, pendingPurchase });
  const invite = { id: 'p1', accountId: null, pendingEmail: 'sam@example.test', roles: ['reviewer'], topicGrants: [], fullCurriculum: false, revision: 1 };
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
        if (path === '/admin/access') return Response.json({ data: feedbackRole === 'owner' ? [invite] : [] });
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

  it('gives the owner DEV admissions, Purchase requests and Invites sent, with each count and the decisions summed on the tab label', async () => {
    setup('owner');
    const page = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await page.ngOnInit();
    expect(requests).toContain('/admin/access/waiting');
    expect(page.tabs()[1]).toEqual({ id: 'waiting', label: 'Review requests · 3' });
    expect(page.waitingViews()).toEqual([
      { id: 'access', label: 'DEV admissions', count: 1 }, { id: 'purchases', label: 'Purchase requests', count: 2 }, { id: 'invites', label: 'Invites sent', count: 1 },
    ]);
    expect(page.waitingView()).toBe('access');
    page.selectWaitingView('purchases');
    expect(page.waitingView()).toBe('purchases');
    expect(page.tab()).toBe('waiting');
    expect(replaceState).toHaveBeenLastCalledWith('/admin/access', 'tab=waiting&view=purchases');
    page.onWaitingKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(page.waitingView()).toBe('invites');
    page.onWaitingKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(page.waitingView()).toBe('access');
    page.onWaitingKey(new KeyboardEvent('keydown', { key: 'End' }));
    expect(page.waitingView()).toBe('invites');
    page.onWaitingKey(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(page.waitingView()).toBe('access');
    page.onWaitingKey(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(page.waitingView()).toBe('access');
    // Nobody waits at the gate but purchases do: the sub-tab opens on Purchase requests.
    TestBed.resetTestingModule();
    waiting = { waiting: [] };
    setup('owner');
    const quiet = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await quiet.ngOnInit();
    expect(quiet.tabs()[1].label).toBe('Review requests · 2');
    expect(quiet.waitingView()).toBe('purchases');
  });

  it('shows an admin Review requests with Purchase requests alone, and never asks for the waiting people', async () => {
    setup('admin');
    const page = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await page.ngOnInit();
    expect(requests).not.toContain('/admin/access/waiting');
    expect(requests).toContain('/admin/test-accounts');
    expect(page.tabs().map(tab => tab.label)).toEqual(['Test accounts', 'Review requests · 2']);
    expect(page.waitingViews()).toEqual([{ id: 'purchases', label: 'Purchase requests', count: 2 }]);
    expect(page.waitingView()).toBe('purchases');
    // ?view=access or ?view=invites is not theirs: it stays on Purchase requests.
    TestBed.resetTestingModule();
    testAccounts = [testRow('learner03', null)];
    setup('admin', { tab: 'waiting', view: 'invites' });
    const none = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await none.ngOnInit();
    expect(none.tabs().map(tab => tab.label)).toEqual(['Test accounts', 'Review requests']);
    expect(none.tab()).toBe('waiting');
    expect(none.waitingView()).toBe('purchases');
    // Even asked directly, the page does not call the owner-only list for an admin.
    await none.loadWaiting();
    expect(requests).not.toContain('/admin/access/waiting');
    expect(none.waiting()).toEqual([]);
    expect(none.prepared()).toEqual([]);
  });

  it('renders the admin’s sub-tab and the requests, and loads them again after a decision', async () => {
    setup('admin', { tab: 'waiting' });
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    await fixture.componentInstance.loadPurchases(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const section = root.querySelector('#waiting-for-access')!;
    expect(text(section.querySelector('h2'))).toBe('Review requests');
    expect(text(section.querySelector('.section-note'))).toContain('In DEV only test accounts can buy.');
    expect([...section.querySelectorAll('.waiting-tabs [role="tab"]')].map(text)).toEqual(['Purchase requests 2']);
    expect(section.querySelector('#waiting-panel')?.getAttribute('aria-labelledby')).toBe('waiting-tab-purchases');
    expect(section.querySelector('.waiting-table')).toBeNull();
    expect(section.querySelector('#invites-sent')).toBeNull();
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

  it('switches the owner between DEV admissions, Purchase requests and Invites sent', async () => {
    setup('owner', { tab: 'waiting' });
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable();
    await fixture.componentInstance.reload(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const subTabs = () => [...root.querySelectorAll<HTMLButtonElement>('.waiting-tabs [role="tab"]')];
    expect(subTabs().map(text)).toEqual(['DEV admissions 1', 'Purchase requests 2', 'Invites sent 1']);
    expect(subTabs().map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(root.querySelector('.waiting-table')).not.toBeNull();
    expect(root.querySelector('app-purchase-requests')).toBeNull();
    subTabs()[1].click(); fixture.detectChanges();
    expect(root.querySelector('.waiting-table')).toBeNull();
    expect(root.querySelector('app-purchase-requests')).not.toBeNull();
    expect(replaceState).toHaveBeenLastCalledWith('/admin/access', 'tab=waiting&view=purchases');
    subTabs()[2].click(); fixture.detectChanges();
    expect(root.querySelector('app-purchase-requests')).toBeNull();
    expect([...root.querySelectorAll('#invites-sent .assignment-who')].map(text)).toEqual(['sam@example.test']);
    expect(text(root.querySelector('#waiting-for-access .section-note'))).toContain('No email goes out');
    expect(text(root.querySelector('#waiting-for-access .section-heading button'))).toBe('Refresh');
    subTabs()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); fixture.detectChanges();
    expect(root.querySelector('.waiting-table')).not.toBeNull();
    expect(document.activeElement?.id).toBe('waiting-tab-access');
    expect(fixture.componentInstance.outline().map(item => item.label)).toEqual(['Review requests']);
  });

  it('shows co-authors no purchase requests and no Review requests', async () => {
    setup('co-author');
    const page = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await page.ngOnInit();
    expect(page.canDecide()).toBe(false);
    expect(page.purchaseCount()).toBe(0);
    expect(page.waitingViews()).toEqual([]);
    expect(page.tabs().map(tab => tab.id)).toEqual(['test', 'people']);
    expect(requests).not.toContain('/admin/access/waiting');
    await page.loadPurchases();
    expect(page.purchaseRows()).toEqual([]);
  });

  it('outside DEV keeps Review requests as it was: no Purchase requests for the owner, no tab for an admin', async () => {
    testAccounts = [testRow('learner03', null)];
    setup('owner', { dev: false, tab: 'waiting' });
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable();
    await fixture.componentInstance.reload(); fixture.detectChanges();
    expect(fixture.componentInstance.waitingViews().map(view => view.id)).toEqual(['access', 'invites']);
    expect([...(fixture.nativeElement as HTMLElement).querySelectorAll('.waiting-tabs [role="tab"]')].map(text)).toEqual(['DEV admissions 1', 'Invites sent 1']);
    TestBed.resetTestingModule();
    setup('admin', { dev: false });
    const admin = TestBed.runInInjectionContext(() => new AdminAccessPage());
    await admin.ngOnInit();
    expect(admin.tabs().map(tab => tab.id)).toEqual(['test']);
  });
});

/** Owner, 2026-11-08: the person panel's DEV admission card, with Manage DEV admission (Enable, Disable, Delete), Withdraw and Downgrade. */
describe('Person panel: Manage DEV admission', () => {
  const account = (overrides: object) => ({ accountId: 'alex-id', username: 'alex@example.com', displayName: 'Alex', email: 'alex@example.com', roles: ['user'], testAccount: false,
    fullCurriculum: false, access: { label: 'Free', labels: ['Free'], grantedCourseIds: [] }, ...overrides });
  let requests: { path: string; body?: unknown }[];
  let directory: object[];
  let assignments: object[];
  let status: number;
  const setup = () => {
    requests = []; status = 200;
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: StudyPlanAccount, useValue: { account: signal({ accountId: 'owner-id', username: 'author', displayName: 'Author', topicGrants: [], permissions: permissions({ manageAccess: true, feedbackRole: 'owner' }) }), apiPath: (path: string) => path } },
      { provide: Location, useValue: { replaceState: vi.fn() } },
      { provide: ACCOUNT_FETCH, useValue: async (path: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : undefined;
        requests.push({ path, body });
        if (path === '/auth/csrf') return Response.json({ data: { headerName: 'X-CSRF-TOKEN', token: 'synthetic-csrf' } });
        if (path.startsWith('/admin/accounts?')) return Response.json({ data: { accounts: directory, page: 0, hasNext: false } });
        if (/^\/admin\/accounts\/[^/]+\/(access-records|access-summary)$/.test(path)) return Response.json({ data: path.endsWith('summary') ? { label: 'Free' } : [] });
        if (path.startsWith('/admin/accounts/')) return status === 200 ? Response.json({ data: {} }) : new Response('', { status });
        if (path === '/admin/access' && init?.method === 'POST') return Response.json({ data: { ...body, revision: 2 } });
        if (path === '/admin/access') return Response.json({ data: assignments });
        if (path === '/admin/test-accounts') return new Response('', { status: 403 });
        return Response.json({ data: [] });
      } },
    ] }).overrideComponent(AdminAccessPage, { remove: { imports: [PlatformHeader] }, add: { imports: [HeaderStub] } });
  };
  async function open(name = 'Alex', accountId = 'alex-id') {
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable();
    await fixture.componentInstance.reload(); await fixture.componentInstance.loadNames(); fixture.detectChanges();
    await fixture.componentInstance.giveAccessTo(row(accountId, name)); fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
  }
  const actions = (root: HTMLElement) => [...root.querySelectorAll('#dev-admission .card-actions button')].map(text);
  const writes = () => requests.filter(request => request.body !== undefined && request.path.startsWith('/admin/accounts/'));
  beforeEach(() => { directory = [account({ signIn: 'active', canDisable: true, canRemove: true })]; assignments = []; });

  it('offers Manage DEV admission for an account: Disable asks DISABLE, Delete asks DELETE, Enable is one click, and the person leaves the panel', async () => {
    setup();
    const { fixture, page, root } = await open();
    expect(text(root.querySelector('.person-id .state-pill'))).toBe('Admitted');
    expect(text(root.querySelector('#dev-admission .context-note'))).toContain('Manage DEV admission offers Disable or Delete');
    expect(actions(root)).toEqual(['Manage DEV admission']);
    expect(root.querySelector('#admission-dialog')).toBeNull();
    root.querySelector<HTMLButtonElement>('#dev-admission .card-actions button')!.click(); fixture.detectChanges();
    const dialog = root.querySelector('#admission-dialog')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(text(dialog.querySelector('h2'))).toBe('Manage DEV admission for Alex');
    expect([...dialog.querySelectorAll('.removal-option button')].map(text)).toEqual(['⚠ Disable', 'Delete']);
    expect(dialog.querySelector('#admission-disable')?.textContent).toBe(page.admissionText.disable);
    expect(dialog.querySelector('#admission-remove')?.textContent).toBe(page.admissionText.remove);
    expect(dialog.querySelector('.reset-panel')).toBeNull();
    // Nothing is sent before a choice and its word.
    await page.confirmAdmission();
    dialog.querySelector<HTMLButtonElement>('.removal-option .danger-button')!.click(); fixture.detectChanges();
    const panel = dialog.querySelector('.reset-panel')!;
    expect(panel.classList.contains('danger-panel')).toBe(true);
    expect(text(panel.querySelector('h3'))).toBe('⚠ Disable Alex');
    expect(text(panel.querySelector('label'))).toBe('Type DISABLE to confirm');
    const confirm = () => panel.querySelector<HTMLButtonElement>('.actions button')!;
    expect(confirm().disabled).toBe(true);
    page.admissionConfirmation = 'DELETE'; await page.confirmAdmission();
    expect(writes()).toEqual([]);
    const input = panel.querySelector<HTMLInputElement>('input')!;
    input.value = 'DISABLE'; input.dispatchEvent(new Event('input')); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(confirm().disabled).toBe(false);
    directory = [account({ signIn: 'disabled', canEnable: true, canRemove: true })];
    confirm().click(); await fixture.whenStable(); fixture.detectChanges();
    expect(writes()).toEqual([{ path: '/admin/accounts/alex-id/disable', body: { confirmation: 'DISABLE' } }]);
    expect(root.querySelector('#admission-dialog')).toBeNull();
    expect(page.person()).toBeNull();
    expect(page.tab()).toBe('people');
    expect(text(root.querySelector('.notice'))).toBe('Alex is disabled. Every sign-in is blocked and their open session closes within 5 minutes.');

    // Disabled: the dialog offers Enable (one click) and Delete.
    await page.giveAccessTo(row('alex-id', 'Alex')); fixture.detectChanges();
    expect(text(root.querySelector('.person-id .state-pill'))).toBe('Disabled');
    expect(actions(root)).toEqual(['Manage DEV admission']);
    expect(text(root.querySelector('#dev-admission .context-note'))).toContain('Disabled: every sign-in is blocked.');
    root.querySelector<HTMLButtonElement>('#dev-admission .card-actions button')!.click(); fixture.detectChanges();
    expect(page.admissionDialog()).toEqual({ action: null });
    expect([...root.querySelectorAll('#admission-dialog .removal-option button')].map(text)).toEqual(['Enable', 'Delete']);
    expect(root.querySelector('#admission-dialog #admission-enable')?.textContent).toBe(page.admissionText.enable);
    page.chooseAdmission('delete'); fixture.detectChanges();
    expect(text(root.querySelector('#admission-dialog .reset-panel h3'))).toBe('Delete Alex');
    expect(root.querySelector('#admission-dialog .reset-panel')?.textContent).toContain('Purchase history stays for the audit.');
    directory = [account({ signIn: 'active', canDisable: true, canRemove: true })];
    root.querySelector<HTMLButtonElement>('#admission-dialog .removal-option .primary-action')!.click(); await fixture.whenStable(); fixture.detectChanges();
    expect(writes().at(-1)).toEqual({ path: '/admin/accounts/alex-id/enable', body: {} });
    expect(root.querySelector('#admission-dialog')).toBeNull();
    expect(text(root.querySelector('.notice'))).toBe('Alex can sign in again.');
    expect(page.person()?.accountId).toBe('alex-id');
    expect(text(root.querySelector('.person-id .state-pill'))).toBe('Admitted');

    // Delete through the dialog: the remove route with DELETE.
    page.openAdmission(); page.chooseAdmission('delete'); page.admissionConfirmation = 'DELETE';
    directory = [];
    await page.confirmAdmission(); fixture.detectChanges();
    expect(writes().at(-1)).toEqual({ path: '/admin/accounts/alex-id/remove', body: { confirmation: 'DELETE' } });
    expect(page.person()).toBeNull();
    expect(text(root.querySelector('.notice'))).toBe('Alex is deleted. If they sign in again, they appear in Review requests as a new person.');
    expect(page.busy()).toBe(false);
  });

  it('names what a refused admission change means and keeps the dialog open; nothing is sent without permission', async () => {
    setup();
    const { page } = await open();
    for (const [code, message] of [[404, 'Alex is no longer on this build. Refresh the list.'], [409, 'Alex was already deleted.'], [422, 'Type DISABLE exactly to confirm.'], [403, 'Only the owner can manage admission.'], [500, 'Access service is unavailable. Retry shortly.']] as const) {
      status = code;
      page.openAdmission(); page.chooseAdmission('disable'); page.admissionConfirmation = 'DISABLE';
      await page.confirmAdmission();
      expect(page.notice()).toBe(message);
      expect(page.admissionDialog()).toEqual({ action: 'disable' });
      expect(page.person()?.accountId).toBe('alex-id');
    }
    expect(writes()).toHaveLength(5);
    // A choice the directory does not allow is refused before any call.
    directory = [account({ signIn: 'active', canDisable: true })];
    await page.loadNames();
    expect(page.admission()).toMatchObject({ canDisable: true, deletePath: null });
    page.openAdmission();
    expect(page.admissionDialog()).toEqual({ action: null });
    page.chooseAdmission('delete'); page.admissionConfirmation = 'DELETE'; await page.confirmAdmission();
    expect(writes()).toHaveLength(5);
    status = 403;
    await page.enable();
    expect(writes()).toHaveLength(5);
    page.closePerson();
    page.openAdmission();
    expect(page.admissionDialog()).toBeNull();
    await page.confirmAdmission(); await page.enable(); await page.withdraw();
    expect(writes()).toHaveLength(5);
  });

  it('deletes a Local learner through the delete route, and Downgrade to free asks DOWNGRADE from the Plans and purchases card', async () => {
    directory = [account({ accountId: 'real-id', username: 'real-user', displayName: 'Real User', email: null, roles: ['admin'], fullCurriculum: true, canDowngrade: true, canDelete: true })];
    assignments = [{ id: 'a1', accountId: 'real-id', pendingEmail: null, roles: ['admin'], topicGrants: [], fullCurriculum: true, revision: 1 }];
    setup();
    const { fixture, page, root } = await open('Real User', 'real-id');
    expect(page.admission()).toMatchObject({ state: 'admitted', canDisable: false, deletePath: 'delete', canDowngrade: true });
    expect(actions(root)).toEqual(['Manage DEV admission']);
    page.selectPersonTab('plans'); fixture.detectChanges();
    expect(root.querySelector('#dev-admission')).toBeNull();
    expect(root.querySelector('.membership-panel app-admin-memberships')).not.toBeNull();
    expect([...root.querySelectorAll('.membership-panel .card-actions button')].map(text)).toEqual(['Downgrade to free']);
    root.querySelector<HTMLButtonElement>('.membership-panel .card-actions button')!.click(); fixture.detectChanges();
    const dialog = root.querySelector('#downgrade-dialog')!;
    expect(text(dialog.querySelector('h2'))).toBe('Downgrade Real User to a free learner');
    const confirm = dialog.querySelector<HTMLButtonElement>('.actions button')!;
    expect(confirm.disabled).toBe(true);
    page.downgradeConfirmation = 'DOWNGRADE';
    directory = [account({ accountId: 'real-id', username: 'real-user', displayName: 'Real User', email: null, canDowngrade: false, canDelete: true })];
    assignments = [];
    await page.confirmDowngrade(); fixture.detectChanges();
    expect(writes().at(-1)).toEqual({ path: '/admin/accounts/real-id/downgrade', body: { confirmation: 'DOWNGRADE' } });
    expect(root.querySelector('#downgrade-dialog')).toBeNull();
    expect(page.person()?.accountId).toBe('real-id');
    expect(page.draft).toMatchObject({ accountId: 'real-id', roles: [], revision: 0 });
    expect(page.admission().canDowngrade).toBe(false);
    expect(text(root.querySelector('.notice'))).toBe('Real User now has free learner access. Purchase history remains.');
    // Manage DEV admission: one choice, Delete, through the Local delete route.
    page.selectPersonTab('admission'); fixture.detectChanges();
    expect(actions(root)).toEqual(['Manage DEV admission']);
    page.openAdmission(); fixture.detectChanges();
    expect([...root.querySelectorAll('#admission-dialog .removal-option button')].map(text)).toEqual(['Delete']);
    page.chooseAdmission('delete'); page.admissionConfirmation = 'DELETE'; await page.confirmAdmission();
    expect(writes().at(-1)).toEqual({ path: '/admin/accounts/real-id/delete', body: { confirmation: 'DELETE' } });
    expect(page.person()).toBeNull();
    // Downgrade refuses without its word or its permission.
    page.cancelDowngrade();
    await page.confirmDowngrade();
    expect(writes().filter(write => write.path.endsWith('/downgrade'))).toHaveLength(1);
  });

  it('withdraws an invite by saving an empty entry, and goes back to Review requests', async () => {
    assignments = [{ id: 'p1', accountId: null, pendingEmail: 'sam@example.test', roles: ['reviewer'], topicGrants: ['learn:a'], fullCurriculum: false, revision: 1 }];
    setup();
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable();
    await fixture.componentInstance.reload(); fixture.detectChanges();
    const page = fixture.componentInstance, root = fixture.nativeElement as HTMLElement;
    page.selectTab('waiting'); fixture.detectChanges();
    page.reviewPrepared(page.prepared()[0]); fixture.detectChanges();
    expect(actions(root)).toEqual(['Withdraw invite']);
    assignments = [];
    root.querySelector<HTMLButtonElement>('#dev-admission .card-actions button')!.click(); await fixture.whenStable(); fixture.detectChanges();
    const save = requests.find(request => request.path === '/admin/access' && request.body)!;
    expect(save.body).toMatchObject({ id: 'p1', pendingEmail: 'sam@example.test', roles: [], topicGrants: [], fullCurriculum: false, revision: 1 });
    expect(page.person()).toBeNull();
    expect(page.tab()).toBe('waiting');
    expect(page.prepared()).toEqual([]);
    expect(text(root.querySelector('.notice'))).toBe('The invite for sam@example.test is withdrawn. Nothing was sent to them.');
  });

  it('Continue walks the tabs in order to Review & confirm, which lists the changes, and only its Save access writes', async () => {
    assignments = [{ id: 'a1', accountId: 'alex-id', pendingEmail: null, roles: ['reviewer'], topicGrants: ['learn:a'], fullCurriculum: false, revision: 1 }];
    setup();
    const { fixture, page, root } = await open();
    const primary = () => root.querySelector<HTMLButtonElement>('.save-actions .primary-action')!;
    const buttons = () => [...root.querySelectorAll('.save-actions button')].map(text);
    const personTabs = () => [...root.querySelectorAll<HTMLButtonElement>('.person-tabs [role="tab"]')];
    // The same flow as the study plan builder: Continue walks the tabs in order, Back returns one, Save access last.
    expect(buttons()).toEqual(['Discard', 'Continue to Roles']);
    expect(text(root.querySelector('.save-message'))).toBe('No changes yet. Roles and Course access save together as one assignment.');
    primary().click(); fixture.detectChanges();
    expect(page.personTab()).toBe('roles');
    expect(buttons()).toEqual(['Discard', 'Back', 'Continue to Course access']);
    primary().click(); fixture.detectChanges();
    expect(page.personTab()).toBe('courses');
    expect(buttons()).toEqual(['Discard', 'Back', 'Continue to Plans and purchases']);
    primary().click(); fixture.detectChanges();
    expect(page.personTab()).toBe('plans');
    expect(buttons()).toEqual(['Discard', 'Back', 'Continue to Review & confirm']);
    // With nothing changed the last tab says so and Save access stays off.
    primary().click(); fixture.detectChanges();
    expect(page.personTab()).toBe('review');
    expect(buttons()).toEqual(['Discard', 'Back', 'Save access']);
    page.continuePerson();
    expect(page.personTab()).toBe('review');
    [...root.querySelectorAll<HTMLButtonElement>('.save-actions button')][1].click(); fixture.detectChanges();
    expect(page.personTab()).toBe('plans');
    page.selectPersonTab('review'); fixture.detectChanges();
    expect(text(root.querySelector('#review-access h3'))).toBe('Review & confirm');
    expect(text(root.querySelector('#review-access .empty'))).toContain('No changes yet.');
    expect(text(primary())).toBe('Save access');
    expect(primary().disabled).toBe(true);
    page.selectPersonTab('roles'); fixture.detectChanges();
    page.toggle('roles', 'admin', true); page.toggle('topicGrants', 'learn:a', false); fixture.detectChanges();
    expect(text(root.querySelector('.save-message'))).toBe('3 changes to review. Roles and Course access save together as one assignment.');
    expect(text(personTabs().at(-1))).toBe('Review & confirm · 3');
    page.selectPersonTab('plans'); fixture.detectChanges();
    primary().click(); fixture.detectChanges();
    expect(page.personTab()).toBe('review');
    const panel = root.querySelector('#review-access')!;
    expect(text(panel.querySelector('.context-note'))).toBe('This is what changes for Alex. Nothing is saved until you press Save access below.');
    expect([...panel.querySelectorAll('.change-list li')].map(item => [item.className, text(item.querySelector('.change-kind')), text(item.querySelector('.change-text'))])).toEqual([
      ['added', 'Role', '+ Admin'], ['added', 'Curriculum', '+ Entire curriculum'], ['removed', 'Course', '− Learn · A'],
    ]);
    expect(requests.some(request => request.path === '/admin/access' && request.body)).toBe(false);
    expect(text(primary())).toBe('Save access');
    expect(primary().disabled).toBe(false);
    primary().click(); await fixture.whenStable(); fixture.detectChanges();
    const save = requests.find(request => request.path === '/admin/access' && request.body)!;
    expect(save.body).toMatchObject({ id: 'a1', roles: ['reviewer', 'admin'], topicGrants: [], fullCurriculum: true, revision: 1 });
    expect(page.person()).toBeNull();
    expect(text(root.querySelector('.notice'))).toBe('Access saved for Alex. It applies to their next request.');
    // Discard returns to the list without a write, from any tab.
    await page.giveAccessTo(row('alex-id', 'Alex')); fixture.detectChanges();
    expect(page.personTab()).toBe('admission');
    expect(page.previousPersonTab()).toBeNull();
    page.backPerson();
    expect(page.personTab()).toBe('admission');
    page.toggle('roles', 'tester', true); fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.save-actions .secondary-action')!.click(); fixture.detectChanges();
    expect(page.person()).toBeNull();
    expect(requests.filter(request => request.path === '/admin/access' && request.body)).toHaveLength(1);
  });
});
