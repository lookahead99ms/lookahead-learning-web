import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { PageReadiness, pageReadinessInterceptor, samePage } from './page-readiness';

@Component({ template: '' })
class Blank {}

/** DLV-969 S37 (owner, 2026-11-03): a page appears all at once, once everything it asked for has arrived. */
describe('PageReadiness', () => {
  let readiness: PageReadiness;
  let router: Router;
  let http: HttpClient;
  let server: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '', component: Blank }, { path: 'learn', component: Blank }, { path: 'grow', component: Blank }]),
        provideHttpClient(withInterceptors([pageReadinessInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    readiness = TestBed.inject(PageReadiness);
    router = TestBed.inject(Router);
    http = TestBed.inject(HttpClient);
    server = TestBed.inject(HttpTestingController);
  });
  afterEach(() => vi.useRealTimers());

  const settle = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); };

  it('keeps the first page hidden behind the veil until its requests have answered and the network is quiet', async () => {
    expect([readiness.loading(), readiness.veil()]).toEqual([true, true]);
    http.get('/content/learn/catalog.json').subscribe();
    let account!: () => void;
    readiness.track(new Promise<void>((resolve) => (account = resolve)));
    await router.navigateByUrl('/learn');
    await settle(1000);
    expect(readiness.loading()).toBe(true);
    server.expectOne('/content/learn/catalog.json').flush({});
    await settle(1000);
    expect(readiness.loading()).toBe(true); // the account check is still out
    account();
    await settle(PageReadiness.QUIET_MS - 1);
    expect(readiness.loading()).toBe(true);
    await settle(1);
    expect([readiness.loading(), readiness.veil()]).toEqual([false, false]);
  });

  it('a request started in the quiet moment still holds the page', async () => {
    await router.navigateByUrl('/learn');
    await settle(PageReadiness.QUIET_MS - 10);
    http.get('/content/learn/lesson.json').subscribe();
    await settle(500);
    expect(readiness.loading()).toBe(true);
    server.expectOne('/content/learn/lesson.json').flush({});
    await settle(PageReadiness.QUIET_MS);
    expect(readiness.loading()).toBe(false);
  });

  it('shows a fast navigation without the veil, and a slow one behind it', async () => {
    await router.navigateByUrl('/learn');
    await settle(PageReadiness.QUIET_MS);
    expect(readiness.loading()).toBe(false);
    // Fast: done before the veil would appear.
    await router.navigateByUrl('/grow');
    expect(readiness.loading()).toBe(true);
    await settle(PageReadiness.QUIET_MS);
    expect(readiness.loading()).toBe(false);
    expect(readiness.veil()).toBe(false);
    // Slow: the new page asks for something that takes a while.
    const slow = router.navigateByUrl('/learn');
    http.get('/content/learn/slow.json').subscribe();
    await slow;
    await settle(PageReadiness.VEIL_AFTER_MS);
    expect([readiness.loading(), readiness.veil()]).toEqual([true, true]);
    server.expectOne('/content/learn/slow.json').flush({});
    await settle(PageReadiness.QUIET_MS);
    expect([readiness.loading(), readiness.veil()]).toEqual([false, false]);
  });

  it('never hides the page for tabs or section links, or for requests made after it is shown', async () => {
    await router.navigateByUrl('/learn');
    await settle(PageReadiness.QUIET_MS);
    await router.navigateByUrl('/learn?tab=test');
    await router.navigateByUrl('/learn#section');
    expect(readiness.loading()).toBe(false);
    const saved = vi.fn();
    http.post('/bff/api/v1/plans', {}).subscribe(saved);
    expect(readiness.loading()).toBe(false);
    server.expectOne('/bff/api/v1/plans').flush({});
    expect(saved).toHaveBeenCalled();
  });

  it('shows the page anyway after the ceiling, whatever is still loading', async () => {
    http.get('/content/never.json').subscribe();
    await router.navigateByUrl('/learn');
    await settle(PageReadiness.CEILING_MS - 1);
    expect(readiness.loading()).toBe(true);
    await settle(1);
    expect([readiness.loading(), readiness.veil()]).toEqual([false, false]);
    // A late answer changes nothing.
    server.expectOne('/content/never.json').flush({});
    await settle(PageReadiness.QUIET_MS);
    expect(readiness.loading()).toBe(false);
  });

  it('counts tracked work once, whether it succeeds or fails', async () => {
    const failed = readiness.track(Promise.reject(new Error('down')));
    await failed.catch(() => undefined);
    const end = readiness.begin();
    end();
    end();
    await router.navigateByUrl('/learn');
    await settle(PageReadiness.QUIET_MS);
    expect(readiness.loading()).toBe(false);
  });

  it('tells pages apart by path only', () => {
    expect(samePage('/learn?tab=a', '/learn#x')).toBe(true);
    expect(samePage('/learn', '/grow')).toBe(false);
  });
});
