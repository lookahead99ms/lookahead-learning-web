import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { HeaderNavigation } from './header-navigation';
import { LEARN_COURSE_GROUPS } from '../../content/learn-course-groups';

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
  it('loads and caches the path directory without course disclosures or highlight requests', () => {
    const { fixture, http, button } = setup();
    expand(button('Browse Learn'));
    http.expectOne('/content/learn/navigation.json').flush({
      courses: [{ id: 'core-java', title: 'Java Foundations', hasHighlights: true }],
    });
    fixture.detectChanges();
    const course = button('Java Foundations');
    expect(course.getAttribute('href')).toBe('/learn/core-java');
    expect(course.hasAttribute('aria-expanded')).toBe(false);
    expect(course.hasAttribute('aria-controls')).toBe(false);
    expand(course);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.course-highlights')).toBeNull();
    http.expectNone(() => true);
    fixture.componentInstance.close();
    fixture.detectChanges();
    expand(button('Browse Learn'));
    fixture.detectChanges();
    http.expectNone(() => true);
    expect(button('Java Foundations')).not.toBeNull();
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
  it.each([0, 1, 2, 5, 6])('sizes the directory from %i nonempty authored groups', (count) => {
    const { fixture, http, button } = setup();
    const selectedGroups = LEARN_COURSE_GROUPS.slice(0, count);
    const courses = selectedGroups.map((group, index) => ({
      id: group.courseIds[0],
      title: `Course ${index + 1}`,
      hasHighlights: false,
    }));
    expand(button('Browse Learn'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.navigation-groups')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Loading');
    http.expectOne('/content/learn/navigation.json').flush({ courses });
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.navigation-panel') as HTMLElement;
    expect(panel.getAttribute('data-group-count')).toBe(String(count));
    expect(panel.style.getPropertyValue('--navigation-group-count')).toBe(String(count));
    expect(
      [...panel.querySelectorAll('.navigation-group h2')].map((h) => h.textContent?.trim()),
    ).toEqual(selectedGroups.map((group) => group.title));
    expect([...panel.querySelectorAll('.course-row a')].map((a) => a.getAttribute('href'))).toEqual(
      courses.map((course) => '/learn/' + course.id),
    );
    if (count === 0) {
      expect(panel.querySelector('.navigation-groups')).toBeNull();
      expect(panel.querySelector('[role="status"]')?.textContent).toContain('No courses');
    } else {
      expect(panel.querySelectorAll('.navigation-groups').length).toBe(1);
    }
    fixture.destroy();
  });
  it('keeps long course names, unassigned destinations and current-location semantics', () => {
    const { fixture, http, button } = setup();
    const longTitle =
      'Understanding browser lifecycle, rendering, accessibility and exceptionallyLongUnbrokenCourseIdentifiers';
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/learn/core-java/lesson');
    expand(button('Browse Learn'));
    http.expectOne('/content/learn/navigation.json').flush({
      courses: [
        { id: 'extra-course', title: 'New authored course', hasHighlights: false },
        { id: 'core-java', title: longTitle, hasHighlights: false },
      ],
    });
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.navigation-panel');
    const links = [...panel.querySelectorAll('.course-row a')] as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/learn/core-java',
      '/learn/extra-course',
    ]);
    expect(links[0].textContent?.trim()).toBe(longTitle);
    expect(links[0].getAttribute('aria-current')).toBe('page');
    expect(links[1].hasAttribute('aria-current')).toBe(false);
    expect(panel.textContent).toContain('More to explore');
    expect(panel.getAttribute('data-group-count')).toBe('2');
    const close = panel.querySelector('.panel-close') as HTMLButtonElement;
    expect(close.textContent?.replace(/\s+/g, ' ').trim()).toBe('× Close');
    expect(close.querySelector('span')?.getAttribute('aria-hidden')).toBe('true');
    close.click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(button('Browse Learn'));
    expect(fixture.nativeElement.querySelector('.navigation-panel')).toBeNull();
    fixture.destroy();
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
    http.expectNone(() => true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.course-highlights')).toBeNull();
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
  it.each(['learn', 'grow', 'look-ahead'])('opens a %s course on the first tap and preserves modified clicks', (path) => {
    const { fixture, http } = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    expand(fixture.nativeElement.querySelector('#browse-' + path));
    http.expectOne('/content/' + path + '/navigation.json').flush({
      courses: [{ id: 'example', title: 'Example course', hasHighlights: true }],
    });
    fixture.detectChanges();
    const course = fixture.nativeElement.querySelector('.course-row a') as HTMLAnchorElement;
    course.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    course.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(Router).serializeUrl(navigate.mock.calls[0][0] as any)).toBe('/' + path + '/example');
    expect(course.hasAttribute('aria-expanded')).toBe(false);
    http.expectNone(() => true);
    navigate.mockClear();
    const modified = new MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true });
    course.dispatchEvent(modified);
    expect(modified.defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
