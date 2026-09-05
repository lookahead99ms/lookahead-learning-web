import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ContentService } from './content.service';

describe('ContentService canonical DSA details', () => {
  it('does not retain a stale problem detail for the application lifetime', () => {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(ContentService);
    const http = TestBed.inject(HttpTestingController);
    const titles: string[] = [];

    service.getDsaProblem('sample-problem').subscribe((problem) => titles.push(problem.title));
    http
      .expectOne('/content/learn/dsa-problems/sample-problem.json')
      .flush({ title: 'Earlier detail' });

    service.getDsaProblem('sample-problem').subscribe((problem) => titles.push(problem.title));
    http
      .expectOne('/content/learn/dsa-problems/sample-problem.json')
      .flush({ title: 'Updated detail' });

    expect(titles).toEqual(['Earlier detail', 'Updated detail']);
    http.verify();
  });
});
