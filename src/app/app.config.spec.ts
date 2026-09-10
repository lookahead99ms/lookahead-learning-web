import { Location, ViewportScroller } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { APP_BOOTSTRAP_LISTENER, ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet } from '@angular/router';
import { appConfig } from './app.config';

@Component({ template: '<p>Scroll restoration fixture</p>' })
class ScrollFixture {}

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class ScrollRoot {}

describe('Application navigation scroll policy', () => {
  it('starts forward navigation at the top and restores previous position on browser Back', async () => {
    let position: [number, number] = [0, 0];
    const viewport = {
      setHistoryScrollRestoration: vi.fn(),
      getScrollPosition: vi.fn(() => position),
      scrollToPosition: vi.fn(),
      scrollToAnchor: vi.fn(),
    };
    await TestBed.configureTestingModule({
      providers: [
        ...appConfig.providers,
        provideLocationMocks(),
        { provide: ViewportScroller, useValue: viewport },
      ],
    }).compileComponents();
    const router = TestBed.inject(Router);
    router.resetConfig([
      { path: 'one', component: ScrollFixture },
      { path: 'two', component: ScrollFixture },
    ]);
    const fixture = TestBed.createComponent(ScrollRoot);
    const app = TestBed.inject(ApplicationRef);
    app.components.push(fixture.componentRef);
    app.componentTypes.push(ScrollRoot);
    for (const listener of TestBed.inject(APP_BOOTSTRAP_LISTENER)) listener(fixture.componentRef);
    await router.navigateByUrl('/one');
    fixture.detectChanges();
    await vi.waitFor(() => expect(viewport.scrollToPosition).toHaveBeenCalledWith([0, 0]));
    position = [0, 740];
    viewport.scrollToPosition.mockClear();
    await router.navigateByUrl('/two');
    fixture.detectChanges();
    await vi.waitFor(() => expect(viewport.scrollToPosition).toHaveBeenCalledWith([0, 0]));
    viewport.scrollToPosition.mockClear();
    TestBed.inject(Location).back();
    await vi.waitFor(() => expect(router.url).toBe('/one'));
    await vi.waitFor(() =>
      expect(viewport.scrollToPosition).toHaveBeenCalledWith([0, 740], { behavior: 'instant' }),
    );
  });
});
