import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  it('renders the application routing shell', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });

  it('keeps the current route and moves focus to main content from the skip link', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();

    const originalPath = `${location.pathname}${location.search}${location.hash}`;
    history.replaceState(null, '', '/learn/algorithmic-patterns/algorithmic-prefix-state');

    const fixture = TestBed.createComponent(App);
    const main = document.createElement('main');
    main.id = 'main-content';
    fixture.nativeElement.append(main);
    fixture.detectChanges();

    const skipLink = fixture.nativeElement.querySelector('.skip-link') as HTMLAnchorElement;
    expect(skipLink.getAttribute('href')).toBe(
      '/learn/algorithmic-patterns/algorithmic-prefix-state#main-content',
    );

    skipLink.click();

    expect(location.pathname).toBe('/learn/algorithmic-patterns/algorithmic-prefix-state');
    expect(location.hash).toBe('#main-content');
    expect(document.activeElement).toBe(main);

    history.replaceState(null, '', originalPath || '/');
  });
});
