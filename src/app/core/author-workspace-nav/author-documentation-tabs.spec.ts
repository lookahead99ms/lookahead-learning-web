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
    expect([...root.querySelectorAll('a')].map(link => link.textContent?.trim())).toEqual([
      'Overview','Architecture & Design','API Reference','Local Development','Build & Release','Operations & Support',
    ]);
    expect(root.querySelector('[role="tablist"]')).toBeNull();
    expect(root.querySelector('a[href="/admin/api"]')?.textContent).toBe('API Reference');
    expect(root.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/admin/docs?group=operations');
  });
  it.each([['contracts','release'],['runtime-stores','operations'],['local-api','local'],['authentication','architecture'],['sign-in-flows','architecture'],['dynamodb-migration','architecture'],['aws-dev-certificates','release']])('selects the %s group', (pageId, group) => {
    expect(authorDocumentationGroup(pageId)?.id).toBe(group);
    expect(render(pageId).querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/admin/docs?group=' + group);
  });
  it('selects the requested documentation landing group and safely defaults unknown values', () => {
    history.replaceState(null, '', '/admin/docs?group=release');
    expect(render('docs').querySelector('[aria-current="page"]')?.textContent).toBe('Build & Release');
    expect(documentationLandingGroup('?group=missing')).toBeNull();
    expect(documentationLandingGroup('')).toBeNull();
    expect(documentationLandingGroup('', '#docs-system')).toBe('architecture');
    expect(documentationLandingGroup('', '#docs-admin')).toBe('release');
    expect(documentationLandingGroup('', '#docs-review')).toBe('overview');
    expect(authorDocumentationGroup('delivery')).toBeUndefined();
  });
});
