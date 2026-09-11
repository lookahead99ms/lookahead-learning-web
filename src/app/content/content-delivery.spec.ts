import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PROTECTED_CONTENT } from './content-delivery';
import { ContentService } from './content.service';
import { StudyPlanAccount } from '../pages/study-plan/study-plan-account';

const learner = {
  accountId: 'learner-a',
  username: 'a',
  displayName: 'A',
  topicGrants: ['learn:course'],
};
describe('Protected content delivery', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PROTECTED_CONTENT, useValue: true },
      ],
    }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('reauthorizes the same version after a grant is revoked', () => {
    const service = TestBed.inject(ContentService),
      http = TestBed.inject(HttpTestingController);
    TestBed.inject(StudyPlanAccount).account.set(learner);
    service.getDsaProblem('sample', 'v1').subscribe();
    http.expectOne('/content/learn/dsa-problems/sample.json').flush({ id: 'sample' });
    let status = 0;
    service.getDsaProblem('sample', 'v1').subscribe({ error: (error) => (status = error.status) });
    http
      .expectOne('/content/learn/dsa-problems/sample.json')
      .flush({}, { status: 403, statusText: 'Forbidden' });
    expect(status).toBe(403);
  });
  it('discards an in-flight body when its account changes', () => {
    const service = TestBed.inject(ContentService),
      http = TestBed.inject(HttpTestingController),
      accounts = TestBed.inject(StudyPlanAccount);
    accounts.account.set(learner);
    let body: unknown, error: unknown;
    service
      .getDsaProblem('sample', 'v1')
      .subscribe({ next: (value) => (body = value), error: (value) => (error = value) });
    accounts.account.set({ ...learner, accountId: 'learner-b' });
    http.expectOne('/content/learn/dsa-problems/sample.json').flush({ id: 'sample' });
    expect(body).toBeUndefined();
    expect(error).toBeInstanceOf(Error);
  });
});
