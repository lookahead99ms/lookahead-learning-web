import { TestBed } from '@angular/core/testing';
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
      .toEqual(['previews', 'docs', 'delivery']);
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
  it('keeps pending email separate and preserves a draft on concurrent-save conflict', async () => {
    page.pendingEmail = 'Invited@Example.invalid'; page.invite(); page.toggle('roles', 'reviewer', true);
    expect(page.draft?.accountId).toBeNull(); expect(page.draft?.pendingEmail).toBe('invited@example.invalid');
    saveStatus = 409; await page.save();
    expect(page.notice()).toContain('Access changed');
    expect(page.draft?.revision).toBe(0); expect(page.assignments()).toEqual([]);
  });
});
