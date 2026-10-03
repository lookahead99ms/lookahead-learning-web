import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  COURSE_LESSON_NAV_NARROW_QUERY,
  CourseLessonNav,
  CourseLessonNavItem,
} from './course-lesson-nav';

function item(index: number, title = `Lesson ${index}`): CourseLessonNavItem {
  return {
    key: `lesson-${index}`,
    title,
    order: index.toString().padStart(2, '0'),
    route: ['/', 'look-ahead', 'design-fundamentals', `lesson-${index}`],
    queryParams: null,
    planned: false,
    children: [],
  };
}

const longTitle = 'Networking Essentials: DNS, HTTP, TCP and UDP, WebSockets, SSE';

describe('CourseLessonNav', () => {
  let fixture: ComponentFixture<CourseLessonNav>;
  let narrow: boolean;
  let listeners: ((event: MediaQueryListEvent) => void)[];
  const originalMatchMedia = window.matchMedia;

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function toggle(): HTMLButtonElement | null {
    return element().querySelector<HTMLButtonElement>('.course-lesson-nav-toggle');
  }

  function list(): HTMLOListElement {
    return element().querySelector<HTMLOListElement>('.course-lesson-nav-list')!;
  }

  function create(items: CourseLessonNavItem[]): void {
    fixture = TestBed.createComponent(CourseLessonNav);
    fixture.componentRef.setInput('courseTitle', 'Fundamentals');
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    narrow = false;
    listeners = [];
    // jsdom has no matchMedia; the nav reads the narrow-screen query through it.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) =>
        ({
          matches: query === COURSE_LESSON_NAV_NARROW_QUERY && narrow,
          media: query,
          addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
            listeners.push(listener),
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    });
    await TestBed.configureTestingModule({
      imports: [CourseLessonNav],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
  });

  it('lists every lesson in course order as a link to the lesson', () => {
    create(Array.from({ length: 42 }, (_, index) => item(index + 1)));

    const links = Array.from(list().querySelectorAll<HTMLAnchorElement>('a'));
    expect(links).toHaveLength(42);
    expect(links[0].getAttribute('href')).toBe('/look-ahead/design-fundamentals/lesson-1');
    expect(links[41].getAttribute('href')).toBe('/look-ahead/design-fundamentals/lesson-42');
    expect(links.map((link) => link.querySelector('.course-lesson-nav-text')?.textContent)).toEqual(
      Array.from({ length: 42 }, (_, index) => `Lesson ${index + 1}`),
    );
    expect(element().querySelector('.sidebar-group-label')?.textContent?.trim()).toBe('42 lessons');
  });

  it('is a labelled navigation landmark of an ordered list, with decorative numbers hidden', () => {
    create([item(1), item(2)]);

    const nav = element().querySelector('nav')!;
    expect(nav.getAttribute('aria-label')).toBe('Lessons in Fundamentals');
    expect(list().tagName).toBe('OL');
    expect(list().children).toHaveLength(2);
    const order = list().querySelector('.course-lesson-nav-order')!;
    expect(order.textContent?.trim()).toBe('01');
    expect(order.getAttribute('aria-hidden')).toBe('true');
    // Native links: keyboard focus and Enter work without extra handlers.
    expect(list().querySelector('a')?.hasAttribute('tabindex')).toBe(false);
  });

  it('marks only the active lesson as the current location', () => {
    create([item(1), item(2), item(3)]);
    expect(element().querySelectorAll('[aria-current]')).toHaveLength(0);

    fixture.componentRef.setInput('activeKey', 'lesson-2');
    fixture.detectChanges();
    const current = element().querySelectorAll('[aria-current="location"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain('Lesson 2');

    fixture.componentRef.setInput('activeKey', 'lesson-3');
    fixture.detectChanges();
    expect(element().querySelector('[aria-current="location"]')?.textContent).toContain('Lesson 3');
  });

  it('shows a long title whole so it wraps instead of being truncated', () => {
    create([item(1, longTitle)]);
    const text = list().querySelector('.course-lesson-nav-text')!;
    expect(text.textContent).toBe(longTitle);
    expect(text.textContent).not.toContain('…');
  });

  it('nests sub-units under their parent and keeps planned units listed but not linked', () => {
    create([
      { ...item(1), children: [{ ...item(2, 'Variant'), order: null }] },
      { ...item(3, 'Later lesson'), planned: true },
    ]);
    const nested = list().querySelector('.course-lesson-nav-children a')!;
    expect(nested.textContent).toContain('Variant');
    const planned = list().querySelector('.course-lesson-nav-planned')!;
    expect(planned.tagName).toBe('SPAN');
    expect(planned.textContent).toContain('Later lesson (planned)');
    expect(element().querySelector('.sidebar-group-label')?.textContent?.trim()).toBe('3 lessons');
  });

  it('has no disclosure on wide screens: the whole list is shown', () => {
    create([item(1), item(2)]);
    expect(toggle()).toBeNull();
    expect(list().hidden).toBe(false);
  });

  it('folds into a chevron disclosure with aria-expanded on narrow screens', () => {
    narrow = true;
    create([item(1), item(2)]);

    const button = toggle()!;
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe(list().id);
    expect(button.textContent?.trim()).toBe('Show all 2 lessons');
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(button.querySelector('svg')?.classList.contains('open')).toBe(false);
    expect(list().hidden).toBe(true);

    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.textContent?.trim()).toBe('Hide lessons');
    expect(button.querySelector('svg')?.classList.contains('open')).toBe(true);
    expect(list().hidden).toBe(false);

    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(list().hidden).toBe(true);
  });

  it('switches between the disclosure and the full list when the screen width changes', () => {
    create([item(1)]);
    expect(toggle()).toBeNull();

    listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
    fixture.detectChanges();
    expect(toggle()?.getAttribute('aria-expanded')).toBe('false');
    expect(list().hidden).toBe(true);

    listeners.forEach((listener) => listener({ matches: false } as MediaQueryListEvent));
    fixture.detectChanges();
    expect(toggle()).toBeNull();
    expect(list().hidden).toBe(false);
  });
});
