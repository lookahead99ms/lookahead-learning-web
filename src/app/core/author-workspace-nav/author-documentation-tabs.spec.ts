import { TestBed } from '@angular/core/testing';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import { AuthorDocumentationTabs } from './author-documentation-tabs';
import { authorDocumentationGroup, documentationLandingGroup } from './author-workspace-links';

function render(pageId: string) {
  TestBed.inject(StudyPlanAccount).account.set({accountId:'owner', username:'owner', displayName:'Owner', topicGrants:[], authorPreview:true});
  const fixture = TestBed.createComponent(AuthorDocumentationTabs);
  fixture.componentRef.setInput('pageId', pageId);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Documentation group navigation', () => {
  afterEach(() => history.replaceState(null, '', '/'));
  it('offers six route groups independently of document section tabs', () => {
    const root = render('operations');
    expect([...root.querySelectorAll('.documentation-tabs a')].map(link => link.textContent?.trim())).toEqual([
      'Overview','Architecture & Design','API Reference','Local Development','Build & Release','Operations & Support',
    ]);
    // Owner, 2026-11-09: a group tab opens its first page; the open group's pages follow as a plain sub tab bar, no icons.
    expect([...root.querySelectorAll('.documentation-tabs a')].map(link => link.getAttribute('href'))).toEqual([
      '/admin/screen-names', '/admin/architecture', '/admin/api', '/admin/local-development', '/admin/contracts', '/admin/operations',
    ]);
    expect([...root.querySelectorAll('.documentation-pages a')].map(link => link.textContent?.trim())).toEqual(['Operations', 'Production support']);
    expect([...root.querySelectorAll('.documentation-pages a')].map(link => link.getAttribute('href'))).toEqual(['/admin/operations', '/admin/production-support']);
    expect(root.querySelector('.documentation-pages a[aria-current="page"]')?.getAttribute('href')).toBe('/admin/operations');
    expect(root.querySelector('.documentation-pages .page-icon')).toBeNull();
    expect(root.querySelector('[role="tablist"]')).toBeNull();
    expect(root.querySelector('.documentation-tabs a[href="/admin/api"]')?.textContent).toBe('API Reference');
    expect(root.querySelector('.documentation-tabs [aria-current="page"]')?.getAttribute('href')).toBe('/admin/operations');
  });
  const firstPage: Record<string, string> = { release: '/admin/contracts', operations: '/admin/operations', local: '/admin/local-development', architecture: '/admin/architecture' };
  it.each([['contracts','release'],['runtime-stores','operations'],['local-api','local'],['authentication','architecture'],['sign-in-flows','architecture'],['dynamodb-migration','architecture'],['aws-dev-certificates','release']])('selects the %s group', (pageId, group) => {
    expect(authorDocumentationGroup(pageId)?.id).toBe(group);
    expect(render(pageId).querySelector('.documentation-tabs [aria-current="page"]')?.getAttribute('href')).toBe(firstPage[group]);
  });
  it('selects the requested documentation landing group and safely defaults unknown values', () => {
    history.replaceState(null, '', '/admin/docs?group=release');
    const landing = render('docs');
    expect(landing.querySelector('.documentation-tabs [aria-current="page"]')?.textContent).toBe('Build & Release');
    expect(landing.querySelector('.documentation-pages')).toBeNull(); // the landing's cards already list the pages (owner, 2026-11-09)
    expect(documentationLandingGroup('?group=missing')).toBeNull();
    expect(documentationLandingGroup('')).toBeNull();
    expect(documentationLandingGroup('', '#docs-system')).toBe('architecture');
    expect(documentationLandingGroup('', '#docs-admin')).toBe('release');
    expect(documentationLandingGroup('', '#docs-review')).toBe('overview');
    expect(authorDocumentationGroup('delivery')).toBeUndefined();
  });
  it('shows no page row for a group with a single page, which would only repeat the title', () => {
    expect(render('api').querySelector('.documentation-pages')).toBeNull();
    expect(render('api').querySelector('.documentation-tabs [aria-current="page"]')?.getAttribute('href')).toBe('/admin/api');
  });
  it('marks the parent page of an open sub-page and shows an admin only its groups', () => {
    const child = render('aws-dev-budget');
    expect(child.querySelector('.documentation-pages a[aria-current="page"]')?.getAttribute('href')).toBe('/admin/aws-deployment');
    TestBed.inject(StudyPlanAccount).account.set({accountId:'a', username:'a', displayName:'A', topicGrants:[], permissions:{ previewDocuments:true, triageFeedback:true, feedbackRole:'admin' }} as never);
    const fixture = TestBed.createComponent(AuthorDocumentationTabs);
    fixture.componentRef.setInput('pageId', 'local-development');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect([...root.querySelectorAll('.documentation-tabs a')].map(link => link.textContent?.trim())).toEqual(['Overview', 'Local Development']);
    expect([...root.querySelectorAll('.documentation-pages a')].map(link => link.getAttribute('href'))).toEqual(['/admin/local-development', '/admin/local-api']);
  });
});
