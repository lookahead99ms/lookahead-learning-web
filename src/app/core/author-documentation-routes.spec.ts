import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from '../app.routes';
import { staffGuard } from './author-access';
import { authorDocumentPages, authorDocumentationGroup } from './author-workspace-nav/author-workspace-links';

@Component({template: ''})
class RouteDestination {}

describe('Published documentation routes', () => {
  it.each([
    ['sign-in-flows', 'architecture'],
    ['dynamodb-migration', 'architecture'],
    ['aws-dev-certificates', 'release'],
  ] as const)('opens the distinct %s document with staff authorization', (id, group) => {
    const route = routes.find(route => route.path === 'admin/' + id)!;
    expect(route.data?.['authorDocument']).toBe(id);
    expect(route.canActivate).toContain(staffGuard);
    expect(authorDocumentPages[id].documentId).toBe(id);
    expect(authorDocumentationGroup(id)?.id).toBe(group);
  });
  it('keeps the reviewer-guide legacy bookmark query and section', async () => {
    TestBed.configureTestingModule({providers: [provideRouter([
      routes.find(route => route.path === 'admin/reviewer-guide')!,
      {path: 'admin/review-guide', component: RouteDestination},
    ])]});
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/admin/reviewer-guide?from=records#what-to-review');
    expect(router.url).toBe('/admin/review-guide?from=records#what-to-review');
  });
});
