import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { HeaderNavigation } from './header-navigation';

function expand(link: HTMLElement) {
  link.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
  );
}

describe('Header curriculum navigation', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [HeaderNavigation],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.useRealTimers();
  });
  function setup() {
    const fixture = TestBed.createComponent(HeaderNavigation);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const button = (label: string): HTMLAnchorElement => {
      if (label.startsWith('Browse '))
        return fixture.nativeElement.querySelector(
          '#browse-' + label.slice(7).toLowerCase().replace(' ', '-'),
        );
      return [...fixture.nativeElement.querySelectorAll('.course-row a')].find(
        (link: any) => link.textContent.trim() === label.replace('Show highlights for ', ''),
      ) as HTMLAnchorElement;
    };
    return { fixture, http, button };
  }
  it('loads only selected navigation summaries, reuses cache and keeps one course expanded', () => {
    const { fixture, http, button } = setup();
    http.expectNone(() => true);
    expand(button('Browse Learn'));
    http.expectOne('/content/learn/navigation.json').flush({
      courses: [
        { id: 'core-java', title: 'Java Foundations', hasHighlights: true },
        { id: 'python-fundamentals', title: 'Python', hasHighlights: true },
      ],
    });
    fixture.detectChanges();
    expand(button('Show highlights for Java Foundations'));
    http
      .expectOne('/content/learn/core-java/navigation-highlights.json')
      .flush({ highlights: ['JVM execution', 'Values and references', 'Exceptions'] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.course-highlights li').length).toBe(3);
    expect(fixture.nativeElement.querySelector('.course-highlights a')).toBeNull();
    expand(button('Show highlights for Python'));
    http
      .expectOne('/content/learn/python-fundamentals/navigation-highlights.json')
      .flush({ highlights: ['Python syntax', 'Collections', 'Functions'] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.course-highlights').length).toBe(1);
    expect(fixture.nativeElement.textContent).not.toContain('JVM execution');
    fixture.componentInstance.close();
    fixture.detectChanges();
    expand(button('Browse Learn'));
    fixture.detectChanges();
    http.expectNone(() => true);
    expect(button('Show highlights for Java Foundations')).not.toBeNull();
  });
  it('cancels stale requests and falls back to the published catalog during version skew', () => {
    const { fixture, http, button } = setup();
    expand(button('Browse Learn'));
    const stale = http.expectOne('/content/learn/navigation.json');
    expand(button('Browse Grow'));
    expect(stale.cancelled).toBe(true);
    http
      .expectOne('/content/grow/navigation.json')
      .flush({}, { status: 500, statusText: 'Unavailable' });
    http.expectOne('/content/grow/catalog.json').flush([
      { id: 'spring-framework', title: 'Spring Framework' },
      { id: 'api-design', title: 'API Design and Security' },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.panel-heading a').getAttribute('href')).toBe(
      '/grow',
    );
    expect(fixture.nativeElement.textContent).toContain('Spring Framework');
    expect(fixture.nativeElement.textContent).not.toContain('temporarily unavailable');
    expect(
      fixture.nativeElement.querySelector('.course-row a').getAttribute('aria-expanded'),
    ).toBeNull();
    fixture.componentInstance.close();
    fixture.detectChanges();
    expand(button('Browse Grow'));
    fixture.detectChanges();
    http.expectNone(() => true);
    expect(button('Show highlights for Spring Framework')).not.toBeNull();
  });
  it('keeps a compact catalog action when both navigation sources are unavailable', () => {
    const { fixture, http, button } = setup();
    expand(button('Browse Grow'));
    http
      .expectOne('/content/grow/navigation.json')
      .flush({}, { status: 404, statusText: 'Not found' });
    http
      .expectOne('/content/grow/catalog.json')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.navigation-panel-error')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Course list is temporarily unavailable.');
    expect(fixture.nativeElement.querySelector('.panel-heading a').getAttribute('href')).toBe(
      '/grow',
    );
    fixture.componentInstance.close();
    fixture.detectChanges();
    expand(button('Browse Grow'));
    http.expectOne('/content/grow/navigation.json').flush({ courses: [] });
  });
  it('restores the disclosure focus on Escape without replacing native catalog links', () => {
    const { fixture, http, button } = setup();
    const trigger = button('Browse Learn');
    expand(trigger);
    http.expectOne('/content/learn/navigation.json').flush({ courses: [] });
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.panel-heading a') as HTMLAnchorElement).focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('.path-entry a').getAttribute('href')).toBe(
      '/learn',
    );
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });
});

describe('Header hover and touch behavior', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [HeaderNavigation],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.useRealTimers();
  });
  function setup() {
    const fixture = TestBed.createComponent(HeaderNavigation);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const link = fixture.nativeElement.querySelector('#browse-learn') as HTMLAnchorElement;
    const enter = () =>
      link.parentElement!.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    return { fixture, http, link, enter };
  }
  it('waits for hover intent and keeps the panel open while crossing into it', () => {
    vi.useFakeTimers();
    const { fixture, http, link, enter } = setup();
    enter();
    vi.advanceTimersByTime(100);
    http.expectNone(() => true);
    vi.advanceTimersByTime(80);
    http
      .expectOne('/content/learn/navigation.json')
      .flush({ courses: [{ id: 'core-java', title: 'Java', hasHighlights: true }] });
    fixture.detectChanges();
    link.parentElement!.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    fixture.nativeElement
      .querySelector('.navigation-panel')
      .dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    expect(link.getAttribute('aria-expanded')).toBe('true');
    const course = fixture.nativeElement.querySelector('.course-row a');
    course.closest('li').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    vi.advanceTimersByTime(180);
    http
      .expectOne('/content/learn/core-java/navigation-highlights.json')
      .flush({ highlights: ['JVM execution', 'Values and references', 'Exceptions'] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.course-highlights li').length).toBe(3);
    expect(fixture.nativeElement.querySelector('.course-highlights a')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Show highlights');
    expect(fixture.nativeElement.querySelector('.path-entry button')).toBeNull();
    fixture.nativeElement
      .querySelector('.navigation-panel')
      .dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    vi.advanceTimersByTime(280);
    fixture.detectChanges();
    expect(link.getAttribute('aria-expanded')).toBe('false');
  });
  it('cancels a pending hover when Escape is pressed', () => {
    vi.useFakeTimers();
    const { fixture, http, enter } = setup();
    enter();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    http.expectNone(() => true);
    expect(fixture.nativeElement.querySelector('.navigation-panel')).toBeNull();
  });
  it('expands on first touch and navigates on second touch, with native modified-click behavior', () => {
    const { fixture, http, link } = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const tap = () => {
      link.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
      link.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true, cancelable: true }));
    };
    tap();
    http.expectOne('/content/learn/navigation.json').flush({ courses: [] });
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    expect(link.getAttribute('aria-expanded')).toBe('true');
    tap();
    expect(navigate).toHaveBeenCalledWith(['/', 'learn']);
    navigate.mockClear();
    const modified = new MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true });
    link.dispatchEvent(modified);
    expect(navigate).not.toHaveBeenCalled();
    expect(modified.defaultPrevented).toBe(false);
    expect(link.getAttribute('href')).toBe('/learn');
  });
});
