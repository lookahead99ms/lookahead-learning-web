import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
      { provide: StudyPlanAccount, useValue: { apiPath: (path: string) => '/bff/api/v1' + path } },
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
    expect(fixture.componentInstance.outline().map(item => item.href)).toEqual(['#choose-person', '#saved-assignments']);
    fixture.componentInstance.invite();
    expect(fixture.componentInstance.outline().map(item => item.href)).toEqual(['#choose-person', '#saved-assignments']);
    fixture.componentInstance.pendingEmail = 'person@example.invalid'; fixture.componentInstance.invite();
    expect(fixture.componentInstance.outline().map(item => item.href)).toEqual(['#choose-person', '#review-access', '#saved-assignments']);
  });
  it('explains roles, grants and plans, links plans to the documentation and shows no purchases (DLV-209)', async () => {
    const fixture = TestBed.createComponent(AdminAccessPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect([...root.querySelectorAll('.how-card h3')].map(h => h.textContent?.trim())).toEqual(['Staff roles', 'Course access grants', 'Plans and purchases']);
    expect(root.querySelector('.how-link')?.getAttribute('href')).toBe('/admin/plans');
    // The catalog table lives on the Plans and purchases documentation page now.
    expect(root.querySelector('#configured-plans, .plan-table')).toBeNull();
    // Find and the saved list sit side by side.
    expect([...root.querySelectorAll('.work-grid > section')].map(section => section.id)).toEqual(['choose-person', 'saved-assignments']);

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
