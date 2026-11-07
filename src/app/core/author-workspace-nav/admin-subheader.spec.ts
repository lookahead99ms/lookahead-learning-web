import { TestBed } from '@angular/core/testing';
import { AdminSubheader } from './admin-subheader';
import { AuthorWorkspacePageId } from './author-workspace-links';
import { StaffPermissions, StudyAccount, StudyPlanAccount } from '../../pages/study-plan/study-plan-account';

const permissions = (overrides: Partial<StaffPermissions>): StaffPermissions => ({
  manageAccess: false, previewDocuments: false, deliveryRead: false, deliveryCreate: false,
  deliveryReview: false, deliveryDone: false, triageFeedback: false, fullCurriculum: false,
  feedbackRole: 'user', ...overrides,
});
const base = { accountId: 'a', username: 'a', displayName: 'A', topicGrants: [] };
const owner: StudyAccount = { ...base, permissions: permissions({ manageAccess: true, previewDocuments: true, deliveryRead: true, triageFeedback: true, feedbackRole: 'owner' }) };
const admin: StudyAccount = { ...base, permissions: permissions({ previewDocuments: true, deliveryRead: true, triageFeedback: true, feedbackRole: 'admin' }) };
const coAuthor: StudyAccount = { ...base, permissions: permissions({ previewDocuments: true, deliveryRead: true, feedbackRole: 'co-author' }) };
const tester: StudyAccount = { ...base, permissions: permissions({ fullCurriculum: true, feedbackRole: 'tester' }) };

function render(account: StudyAccount | null, pageId: AuthorWorkspacePageId | null = 'feedback') {
  TestBed.inject(StudyPlanAccount).account.set(account);
  const fixture = TestBed.createComponent(AdminSubheader);
  fixture.componentRef.setInput('pageId', pageId);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}
const labels = (root: HTMLElement) => [...root.querySelectorAll('nav a')].map((link) => link.querySelector('span:last-child')?.textContent);
const hrefs = (root: HTMLElement) => [...root.querySelectorAll('nav a')].map((link) => link.getAttribute('href'));

describe('AdminSubheader (DLV-971)', () => {
  it('is one strip with the Admin eyebrow and the owner’s admin pages as pills, the open page marked', () => {
    const root = render(owner);
    const nav = root.querySelector('nav.admin-subheader')!;
    expect(nav.getAttribute('aria-label')).toBe('Admin navigation');
    expect(nav.querySelector('.eyebrow')?.textContent).toBe('Admin');
    expect(labels(root)).toEqual(['Documentation', 'Delivery Plan', 'Tickets & feedback', 'People & Access', 'Previews']);
    expect(hrefs(root)).toEqual(['/admin/docs', '/delivery-plan', '/admin/feedback', '/admin/access', '/admin/previews']);
    expect([...root.querySelectorAll('[aria-current="page"]')].map((link) => link.getAttribute('href'))).toEqual(['/admin/feedback']);
    expect([...root.querySelectorAll('.item-icon')].map((icon) => icon.textContent)).toEqual(['📚', '🗺️', '🗂️', '🔐', '👀']);
    for (const icon of root.querySelectorAll('.item-icon')) expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows an admin Test Accounts and no Previews', () => {
    const root = render(admin, 'delivery');
    expect(labels(root)).toEqual(['Documentation', 'Delivery Plan', 'Tickets & feedback', 'Test Accounts']);
    expect(root.querySelector('a[href="/admin/access"] .item-icon')?.textContent).toBe('🧪');
    expect(root.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/delivery-plan');
  });

  it('shows a co-author Test Accounts and Previews', () => {
    const root = render(coAuthor, 'previews');
    expect(labels(root)).toEqual(['Documentation', 'Delivery Plan', 'Tickets & feedback', 'Test Accounts', 'Previews']);
    expect(root.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/admin/previews');
  });

  it('marks nothing when the open page is not an admin link, and every pill is a real link', () => {
    const root = render(owner, null);
    expect(root.querySelector('[aria-current]')).toBeNull();
    for (const link of root.querySelectorAll('nav a')) expect(link.getAttribute('href')).toBeTruthy();
  });

  it('renders nothing for a tester, a learner or nobody', () => {
    expect(render(tester).querySelector('nav')).toBeNull();
    expect(render({ ...base }).querySelector('nav')).toBeNull();
    expect(render(null).querySelector('nav')).toBeNull();
    expect(render(null).textContent?.trim()).toBe('');
  });
});
