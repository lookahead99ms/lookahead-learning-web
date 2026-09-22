import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { NotFoundPage } from './not-found';

describe('NotFoundPage', () => {
  it('preserves an unknown URL and offers explicit recovery destinations', async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter(routes)],
    }).compileComponents();
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/definitely-not-a-learning-route', NotFoundPage);

    const root = harness.routeNativeElement!;
    expect(root.querySelector('h1')?.textContent).toContain(
      'This address does not match a learning page.',
    );
    expect(TestBed.inject(Router).url).toBe('/definitely-not-a-learning-route');
    expect(
      [...root.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Page recovery"] a')].map((link) =>
        link.getAttribute('href'),
      ),
    ).toEqual(['/', '/search', '/learn']);
  });
});
