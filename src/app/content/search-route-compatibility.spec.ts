import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { legacyInterviewSearchRedirect } from './search-route-compatibility';

@Component({ template: 'Search destination' })
class SearchDestination {}

describe('legacy interview discovery route', () => {
  it('redirects to unified Search without losing query, repeated subjects or fragment', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'interview-questions',
            pathMatch: 'full',
            redirectTo: legacyInterviewSearchRedirect,
          },
          { path: 'search', component: SearchDestination },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/interview-questions?q=queue&subject=java&subject=go&format=solve#results',
    );
    const tree = TestBed.inject(Router).parseUrl(TestBed.inject(Router).url);
    expect(tree.root.children['primary'].segments[0].path).toBe('search');
    expect(tree.queryParams).toEqual({
      kind: 'practice',
      q: 'queue',
      subject: ['java', 'go'],
      format: 'solve',
    });
    expect(tree.fragment).toBe('results');
    await harness.navigateByUrl('/interview-questions?kind=course&path=grow');
    expect(TestBed.inject(Router).parseUrl(TestBed.inject(Router).url).queryParams).toEqual({
      kind: 'course',
      path: 'grow',
    });
  });
});
