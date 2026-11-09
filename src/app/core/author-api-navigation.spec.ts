import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot } from '@angular/router';
import { apiGroupBookmarkRedirect, apiGuidePath, localApiBookmarkRedirect } from './author-api-navigation';

describe('API documentation bookmark compatibility', () => {
  it.each(['start-testing', 'credentials', 'flows'])('moves the %s setup bookmark without changing its fragment or query', anchor => {
    TestBed.configureTestingModule({providers: [provideRouter([])]});
    expect(apiGuidePath('#' + anchor)).toBe('/admin/local-api');
    const target = TestBed.runInInjectionContext(() => localApiBookmarkRedirect({} as ActivatedRouteSnapshot,
      {url: '/admin/api?source=bookmark#' + anchor} as RouterStateSnapshot));
    expect(TestBed.inject(Router).serializeUrl(target as any)).toBe('/admin/local-api?source=bookmark#' + anchor);
  });
  it.each(['', '#inventory', '#schemas', '#capabilities', '#api-downloads', '#identity-get-session'])('preserves API reference bookmark %s', fragment => {
    expect(apiGuidePath(fragment)).toBe('/admin/api');
    expect(localApiBookmarkRedirect({} as ActivatedRouteSnapshot, {url:'/admin/api' + fragment} as RouterStateSnapshot)).toBe(true);
  });
});

describe('API group landing bookmark compatibility', () => {
  it.each([
    ['/admin/docs?group=api', '/admin/api'],
    ['/admin/docs?group=api&source=bookmark#schemas', '/admin/api?source=bookmark#schemas'],
    ['/admin/docs?group=api#credentials', '/admin/local-api#credentials'],
  ])('opens %s directly', (url, expected) => {
    TestBed.configureTestingModule({providers:[provideRouter([])]});
    const target=TestBed.runInInjectionContext(()=>apiGroupBookmarkRedirect({} as ActivatedRouteSnapshot, {url} as RouterStateSnapshot));
    expect(TestBed.inject(Router).serializeUrl(target as any)).toBe(expected);
  });
  it.each(['/admin/docs','/admin/docs?group=overview'])('retains %s', url => {
    expect(apiGroupBookmarkRedirect({} as ActivatedRouteSnapshot, {url} as RouterStateSnapshot)).toBe(true);
  });
});
