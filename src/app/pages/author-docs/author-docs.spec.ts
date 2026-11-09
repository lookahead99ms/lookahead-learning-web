import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { AuthorDocsPage } from './author-docs';

@Component({selector:'app-platform-header',template:''})
class HeaderStub {}

describe('Documentation group landing', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({imports:[AuthorDocsPage], providers:[provideRouter([]),
      {provide:StudyPlanAccount,useValue:{account:signal({authorPreview:true})}}]})
      .overrideComponent(AuthorDocsPage,{remove:{imports:[PlatformHeader]},add:{imports:[HeaderStub]}});
  });
  afterEach(() => history.replaceState(null,'','/'));
  it('opens the compact home with six actionable choices, no top tabs or right rail', () => {
    history.replaceState(null,'','/admin/docs');
    const fixture=TestBed.createComponent(AuthorDocsPage); fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent).toBe('Documentation');
    expect([...root.querySelectorAll('.group-grid a')].map(link=>link.getAttribute('href'))).toEqual([
      '/admin/docs?group=overview','/admin/docs?group=architecture','/admin/api',
      '/admin/docs?group=local','/admin/docs?group=release','/admin/docs?group=operations',
    ]);
    expect(root.querySelector('nav[aria-label="Documentation groups"]')).toBeNull();
    expect(root.querySelector('.documentation-rail')).toBeNull();
    expect(root.textContent).not.toMatch(/Find the page|Choose a group|Read-only|live service health/);
  });
  it.each([
    ['overview',['/admin/screen-names','/admin/access-checks','/admin/plans','/admin/review-guide']],
    ['architecture',['/admin/architecture','/admin/authentication']],
    ['local',['/admin/local-development','/admin/local-api']],
    ['release',['/admin/contracts','/admin/release-gates','/admin/aws-deployment']],
    ['operations',['/admin/operations','/admin/production-support']],
  ])('shows only %s pages in both the landing and right rail', (group, paths) => {
    history.replaceState(null,'','/admin/docs?group=' + group);
    const fixture=TestBed.createComponent(AuthorDocsPage); fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    const hrefs=(selector:string)=>[...root.querySelectorAll(selector)].map(link=>link.getAttribute('href'));
    expect(hrefs('.page-grid a')).toEqual(paths);
    expect(hrefs('.documentation-links a')).toEqual(paths);
    expect(root.querySelectorAll('nav[aria-label="Documentation groups"] a')).toHaveLength(6);
    expect(root.querySelector('[role="tablist"]')).toBeNull();
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('h1')?.textContent).not.toBe('Documentation');
    expect(root.textContent).not.toMatch(/Find the page|Choose a group|Read-only|live service health|\d+ pages|\d+ groups/);

  });
});
