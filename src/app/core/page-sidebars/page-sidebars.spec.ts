import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageSidebarContext } from './page-sidebar-context';
import {
  PageSidebars,
  canDockSidebar,
  collectPageSections,
  sidebarPageTitle,
} from './page-sidebars';

describe('Shared page sidebars', () => {
  let root: HTMLElement;
  let page: HTMLElement;
  let main: HTMLElement;
  let fixture: ComponentFixture<PageSidebars>;
  let frames: FrameRequestCallback[];
  const contextOwner = {};

  function flush(): void {
    fixture.detectChanges();
    const pending = frames.splice(0);
    pending.forEach((callback) => callback(0));
    fixture.detectChanges();
  }

  function refresh(): void {
    window.dispatchEvent(new Event('resize'));
    flush();
  }

  function button(label: string): HTMLButtonElement {
    const result = root.querySelector<HTMLButtonElement>(`button[aria-label^="${label}"]`);
    expect(result).not.toBeNull();
    return result!;
  }

  it('keeps homepage sections visible without a sidebar toggle', () => {
    main.classList.add('landing-page');
    refresh();
    expect(root.querySelector('#page-sidebar-left')?.classList.contains('open')).toBe(true);
    expect(root.querySelector('#page-sidebar-left app-sidebar-toggle')).toBeNull();
    expect(root.querySelector('#page-sidebar-left-content')?.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('#page-sidebar-right')).toBeNull();
    expect(root.querySelector('#page-sidebar-left app-platform-signature')).toBeNull();
    expect(root.querySelector('#page-sidebar-left nav')?.textContent).not.toContain('Overview');
    expect(root.querySelector('#page-sidebar-left')?.textContent).not.toContain('On this page');
    root.querySelector<HTMLAnchorElement>('#page-sidebar-left nav a')?.click();
    flush();
    expect(root.querySelector('#page-sidebar-left')?.classList.contains('open')).toBe(true);
  });

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PageSidebars], providers: [provideRouter([])] });
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    root = document.createElement('app-root');
    page = document.createElement('app-example');
    main = document.createElement('main');
    main.id = 'main-content';
    main.innerHTML =
      '<h1>Sample lesson</h1><section id="existing"><h2>Mechanism</h2><p>Original body</p></section><section id="practice"><h2>Practice</h2><p>Try the example</p></section>';
    page.append(main);
    root.append(page);
    document.body.append(root);
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue({
      left: 40,
      right: 984,
      top: 76,
      bottom: 900,
      width: 944,
      height: 824,
      x: 40,
      y: 76,
      toJSON: () => ({}),
    });
    fixture = TestBed.createComponent(PageSidebars);
    root.append(fixture.nativeElement);
    flush();
    // Most interaction tests begin with the learner's explicit collapsed choice.
    button('Close left sidebar').click();
    button('Close right sidebar').click();
    flush();
  });

  afterEach(() => {
    fixture.destroy();
    root.remove();
    vi.restoreAllMocks();
  });

  it.each([
    'course-page',
    'search-page',
    'account-page',
    'account-page manage-account',
    'challenge-page',
  ])('excludes page shell %s and restores sidebars when returning to learning', (className) => {
    main.className = className;
    refresh();
    expect(root.querySelector('.page-sidebar')).toBeNull();
    expect(root.querySelector('.standalone-signature app-platform-signature')).not.toBeNull();
    expect(root.querySelector('.standalone-signature app-learning-prompt')).not.toBeNull();
    expect(root.querySelector('app-sidebar-toggle')).toBeNull();
    expect(main.hasAttribute('data-sidebar-edge-controls')).toBe(false);
    expect(main.querySelector('h1')?.textContent).toBe('Sample lesson');

    main.className = '';
    refresh();
    expect(root.querySelector('#page-sidebar-left')).not.toBeNull();
    expect(root.querySelector('#page-sidebar-right')).not.toBeNull();
  });

  it('expands catalog groups independently and exposes course destinations', () => {
    TestBed.inject(PageSidebarContext).set(contextOwner, {
      excluded: false,
      groups: [
        {
          id: 'languages',
          title: 'Languages',
          courses: [{ id: 'python', title: 'Python', url: '/learn/python' }],
        },
        {
          id: 'systems',
          title: 'Systems',
          courses: [{ id: 'design', title: 'Design', url: '/look-ahead/design' }],
        },
      ],
    });
    flush();
    button('Open left sidebar').click();
    flush();
    const courses = root.querySelector<HTMLElement>('#sidebar-group-languages')!;
    expect(courses.hidden).toBe(true);
    button('Expand Languages').click();
    flush();
    expect(courses.hidden).toBe(false);
    expect(courses.querySelector('a')?.getAttribute('href')).toBe('/learn/python');
    button('Expand Systems').click();
    flush();
    expect(courses.hidden).toBe(false);
    button('Collapse Languages').click();
    flush();
    expect(courses.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('#sidebar-group-systems')?.hidden).toBe(false);
    TestBed.inject(PageSidebarContext).clear(contextOwner);
    flush();
    expect(root.querySelector('.catalog-group-toggle')).toBeNull();
  });

  it('shows where the lesson sits as an outline and searches with the lesson preset', () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    TestBed.inject(PageSidebarContext).set(contextOwner, {
      excluded: false,
      lessonNav: {
        path: { title: 'Learn', route: ['/', 'learn'] },
        group: {
          title: 'Java Platform and Runtime',
          route: ['/', 'learn'],
          queryParams: { group: 'java-platform' },
        },
        nextGroup: {
          title: 'Web Foundations',
          route: ['/', 'learn'],
          queryParams: { group: 'javascript-web-foundations' },
        },
        nextCourseInNextGroup: false,
        course: { title: 'Modern Java', route: ['/', 'learn', 'modern-java'] },
        current: 'Java Streams',
        previous: {
          title: 'Java 8 Functional Foundations',
          route: ['/', 'learn', 'modern-java', 'functional'],
        },
        next: null,
        nextCourse: { title: 'JVM Memory and GC', route: ['/', 'learn', 'garbage-collection'] },
        search: { path: 'learn', course: 'modern-java', module: 'streams' },
      },
    });
    flush();
    button('Open right sidebar').click();
    flush();
    const nav = root.querySelector<HTMLElement>('.sidebar-lesson-nav')!;
    expect(nav).not.toBeNull();
    expect(nav.getAttribute('data-path')).toBe('learn');
    const text = (selector: string) =>
      Array.from(nav.querySelectorAll<HTMLElement>(selector)).map((element) =>
        element.textContent?.replace(/\s+/g, ' ').trim(),
      );
    const href = (selector: string) => nav.querySelector(selector)?.getAttribute('href');
    // Path, group, course and its lessons, then the next course in this group and the next group.
    expect(text('.outline-path > a')).toEqual(['Learn']);
    expect(text('.outline-group > a')).toEqual(['Java Platform and Runtime', 'Web Foundations']);
    expect(text('.outline-course > a')).toEqual(['Modern Java', 'JVM Memory and GC']);
    expect(text('.outline-lesson')).toEqual(['Java 8 Functional Foundations', 'Java Streams']);
    expect(nav.querySelector('.outline-lesson.current')?.getAttribute('aria-current')).toBe('page');
    expect(href('.outline-path > a')).toBe('/learn');
    expect(href('.outline-group > a')).toBe('/learn?group=java-platform');
    expect(href('.outline-course.here > a')).toBe('/learn/modern-java');
    expect(href('.outline-course.ahead > a')).toBe('/learn/garbage-collection');
    expect(href('.outline-group.ahead > a')).toBe('/learn?group=javascript-web-foundations');
    // The outline explains itself: no "Next course" or "Next group" captions.
    expect(nav.textContent).not.toMatch(/next (course|group|lesson)/i);
    const input = nav.querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(input.getAttribute('aria-label')).toBe('Search Modern Java');
    input.value = '  flatMap ';
    nav.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(navigate).toHaveBeenCalledWith(['/search'], {
      queryParams: { q: 'flatMap', path: 'learn', course: 'modern-java', module: 'streams' },
    });
    TestBed.inject(PageSidebarContext).clear(contextOwner);
    flush();
    expect(root.querySelector('.sidebar-lesson-nav')).toBeNull();
  });

  it('puts the next course inside the next group when the course ends its group', () => {
    TestBed.inject(PageSidebarContext).set(contextOwner, {
      excluded: false,
      lessonNav: {
        path: { title: 'Learn', route: ['/', 'learn'] },
        group: {
          title: 'Java Platform and Runtime',
          route: ['/', 'learn'],
          queryParams: { group: 'java-platform' },
        },
        nextGroup: {
          title: 'Web Foundations',
          route: ['/', 'learn'],
          queryParams: { group: 'javascript-web-foundations' },
        },
        nextCourseInNextGroup: true,
        course: { title: 'JVM Memory and GC', route: ['/', 'learn', 'garbage-collection'] },
        current: 'Memory and GC Diagnosis',
        nextCourse: {
          title: 'JavaScript Foundations',
          route: ['/', 'learn', 'javascript-foundations'],
        },
        search: { path: 'learn', course: 'garbage-collection', module: 'diagnosis' },
      },
    });
    flush();
    button('Open right sidebar').click();
    flush();
    const nextGroup = root.querySelector<HTMLElement>('.sidebar-lesson-nav .outline-group.ahead')!;
    expect(nextGroup.querySelector('.outline-course.ahead > a')?.textContent?.trim()).toBe(
      'JavaScript Foundations',
    );
    expect(root.querySelectorAll('.sidebar-lesson-nav .outline-course.ahead').length).toBe(1);
  });

  it('expands first, then collapses and navigates to the section on the second activation', () => {
    TestBed.inject(PageSidebarContext).set(contextOwner, {
      excluded: false,
      groupLabel: 'Foundation Tracks',
      groups: [
        {
          id: 'mechanism',
          sectionId: 'existing',
          title: 'Mechanism',
          courses: [{ id: 'example', title: 'Example', url: '/learn/example' }],
        },
      ],
    });
    const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    const history = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    flush();
    expect(root.querySelector('.sidebar-group-label')?.textContent).toBe('Foundation Tracks');
    button('Open left sidebar').click();
    flush();
    button('Expand Mechanism').click();
    flush();
    expect(scroll).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
    expect(root.querySelector<HTMLElement>('#sidebar-group-mechanism')?.hidden).toBe(false);
    button('Collapse Mechanism and go to section').click();
    flush();
    expect(root.querySelector<HTMLElement>('#sidebar-group-mechanism')?.hidden).toBe(true);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(history.mock.calls[0][2]).toContain('#existing');
    expect(document.activeElement).toBe(main.querySelector('#existing'));
  });

  it('highlights the catalog group corresponding to the visible section independently of expansion', () => {
    TestBed.inject(PageSidebarContext).set(contextOwner, {
      excluded: false,
      groups: [
        {
          id: 'mechanism',
          sectionId: 'existing',
          title: 'Mechanism',
          courses: [{ id: 'example', title: 'Example', url: '/learn/example' }],
        },
      ],
    });
    vi.spyOn(main.querySelector('#existing')!, 'getBoundingClientRect').mockReturnValue({
      top: 90,
    } as DOMRect);
    vi.spyOn(main.querySelector('#practice')!, 'getBoundingClientRect').mockReturnValue({
      top: 500,
    } as DOMRect);
    flush();
    refresh();
    const group = root.querySelector('.catalog-group-toggle')!;
    expect(group.getAttribute('aria-current')).toBe('location');
    expect(group.getAttribute('aria-expanded')).toBe('false');
  });

  it('highlights the overview at the top and transfers selection to sections and back', () => {
    TestBed.inject(PageSidebarContext).set(contextOwner, {
      excluded: false,
      groupLabel: 'Foundation Tracks',
      groups: [
        {
          id: 'mechanism',
          sectionId: 'existing',
          title: 'Mechanism',
          courses: [{ id: 'example', title: 'Example', url: '/learn/example' }],
        },
      ],
    });
    const section = vi
      .spyOn(main.querySelector('#existing')!, 'getBoundingClientRect')
      .mockReturnValue({ top: 600 } as DOMRect);
    vi.spyOn(main.querySelector('#practice')!, 'getBoundingClientRect').mockReturnValue({
      top: 1000,
    } as DOMRect);
    flush();
    refresh();
    expect(root.querySelector('.catalog-overview')?.getAttribute('aria-current')).toBe('location');
    expect(root.querySelector('.catalog-group-toggle')?.hasAttribute('aria-current')).toBe(false);
    section.mockReturnValue({ top: 90 } as DOMRect);
    refresh();
    expect(root.querySelector('.catalog-overview')?.hasAttribute('aria-current')).toBe(false);
    expect(root.querySelector('.catalog-group-toggle')?.getAttribute('aria-current')).toBe(
      'location',
    );
    section.mockReturnValue({ top: 600 } as DOMRect);
    refresh();
    expect(root.querySelector('.catalog-overview')?.getAttribute('aria-current')).toBe('location');
  });

  it('tracks the section visible below the sticky lesson toolbar in both scroll directions', () => {
    const toolbar = document.createElement('div');
    toolbar.className = 'reader-sticky-stack';
    main.prepend(toolbar);
    vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue({ top: 76, bottom: 160 } as DOMRect);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    vi.spyOn(main.querySelector('#existing')!, 'getBoundingClientRect').mockReturnValue({
      top: -300,
    } as DOMRect);
    const practice = vi
      .spyOn(main.querySelector('#practice')!, 'getBoundingClientRect')
      .mockReturnValue({ top: 240 } as DOMRect);
    refresh();
    expect(root.querySelector('[aria-current="location"]')?.textContent).toContain('Practice');
    practice.mockReturnValue({ top: 500 } as DOMRect);
    refresh();
    expect(root.querySelector('[aria-current="location"]')?.textContent).toContain('Mechanism');
  });

  it('selects the final section when scrolling reaches the document bottom', () => {
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(400);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(1200);
    vi.spyOn(main.querySelector('#practice')!, 'getBoundingClientRect').mockReturnValue({
      top: 500,
    } as DOMRect);
    refresh();
    expect(root.querySelector('[aria-current="location"]')?.textContent).toContain('Practice');
  });

  it('updates selection when scrolling upward after reaching the bottom', () => {
    const scroll = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(400);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(1200);
    vi.spyOn(main.querySelector('#existing')!, 'getBoundingClientRect').mockReturnValue({
      top: 90,
    } as DOMRect);
    vi.spyOn(main.querySelector('#practice')!, 'getBoundingClientRect').mockReturnValue({
      top: 500,
    } as DOMRect);
    refresh();
    expect(root.querySelector('[aria-current="location"]')?.textContent).toContain('Practice');
    scroll.mockReturnValue(200);
    refresh();
    expect(root.querySelector('[aria-current="location"]')?.textContent).toContain('Mechanism');
  });

  it('allows a page to hide navigation while retaining both statements', () => {
    TestBed.inject(PageSidebarContext).set(contextOwner, { excluded: false, hideNavigation: true });
    flush();
    expect(root.querySelector('.page-sidebar')).toBeNull();
    expect(root.querySelector('app-sidebar-toggle')).toBeNull();
    expect(root.querySelector('app-platform-signature')).not.toBeNull();
    expect(root.querySelector('app-learning-prompt')).not.toBeNull();
  });

  it('uses the centered error message gutter for readable standalone text', () => {
    main.classList.add('course-page');
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1800);
    vi.mocked(main.getBoundingClientRect).mockReturnValue({ left: 0, right: 1800 } as DOMRect);
    main.innerHTML = '<section class="page-message"><h1>Content unavailable</h1></section>';
    vi.spyOn(main.querySelector('.page-message')!, 'getBoundingClientRect').mockReturnValue({
      left: 320,
      right: 1480,
    } as DOMRect);
    refresh();
    expect(
      parseFloat((root.querySelector('.standalone-signature-left') as HTMLElement).style.width),
    ).toBeGreaterThan(192);
    expect(root.querySelector('.standalone-signature-left.inline-signature')).toBeNull();
  });

  it('keeps Search statements within the actual search-shell gutters', () => {
    main.classList.add('search-page');
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(2400);
    vi.mocked(main.getBoundingClientRect).mockReturnValue({ left: 0, right: 2400 } as DOMRect);
    main.innerHTML = '<section class="search-shell"><h1>Search topics and questions</h1></section>';
    const shell = vi
      .spyOn(main.querySelector('.search-shell')!, 'getBoundingClientRect')
      .mockReturnValue({ left: 470, right: 1930 } as DOMRect);
    refresh();
    const right = root.querySelector<HTMLElement>('.standalone-signature-right')!;
    expect(parseFloat(right.style.width)).toBe(440);
    expect(right.classList.contains('inline-signature')).toBe(false);
    shell.mockReturnValue({ left: 60, right: 2340 } as DOMRect);
    refresh();
    // In flow, the statement moves into the shared strip after the page.
    expect(
      root
        .querySelector('.signature-strip .standalone-signature-right')
        ?.classList.contains('inline-signature'),
    ).toBe(true);
  });

  it('puts standalone text in normal flow when the page has no side gutter', () => {
    main.classList.add('course-page');
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1800);
    vi.mocked(main.getBoundingClientRect).mockReturnValue({ left: 0, right: 1800 } as DOMRect);
    refresh();
    // All four corner statements join the strip: the two promises and the reasoning habit.
    expect(root.querySelectorAll('.standalone-signature.inline-signature').length).toBe(4);
    expect(root.querySelectorAll('.signature-strip app-reasoning-prompt').length).toBe(2);
    expect(root.querySelector('.corner-signature')).toBeNull();
  });

  it('lines the in-flow statements up with the page content column in one strip', () => {
    main.classList.add('course-page');
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1440);
    vi.mocked(main.getBoundingClientRect).mockReturnValue({ left: 0, right: 1440 } as DOMRect);
    main.innerHTML =
      '<article class="question-reader"><nav>Lessons</nav><section class="learning-map" data-signature-column><h1>Fundamentals</h1></section></article>';
    vi.spyOn(main.querySelector('.question-reader')!, 'getBoundingClientRect').mockReturnValue({
      left: 43,
      right: 1397,
      width: 1354,
    } as DOMRect);
    vi.spyOn(main.querySelector('.learning-map')!, 'getBoundingClientRect').mockReturnValue({
      left: 287,
      right: 1397,
      width: 1110,
    } as DOMRect);
    refresh();
    const strip = root.querySelector<HTMLElement>('.signature-strip')!;
    expect(strip).not.toBeNull();
    expect(strip.classList).toContain('aligned');
    expect(strip.style.marginLeft).toBe('287px');
    expect(strip.style.width).toBe('1110px');
    const parts = Array.from(strip.children).map((child) => child.className);
    expect(parts).toEqual([
      'standalone-signature standalone-signature-left inline-signature',
      'standalone-signature standalone-signature-right inline-signature',
      'standalone-signature standalone-signature-left inline-signature reasoning-signature',
      'standalone-signature standalone-signature-right inline-signature reasoning-signature',
    ]);
    expect(strip.querySelector('app-platform-signature')?.classList).not.toContain('stacked');

    // Without a marked column the strip follows the reader.
    main.querySelector('.learning-map')!.removeAttribute('data-signature-column');
    refresh();
    expect(strip.style.marginLeft).toBe('43px');
    expect(strip.style.width).toBe('1354px');
  });

  it('lines the strip up with the page content, not the window edge, when the page is the column', () => {
    // Manage account below 1280px: the page spans the window and pads its content by 24px.
    main.classList.add('account-page');
    main.style.paddingLeft = '24px';
    main.style.paddingRight = '24px';
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1200);
    vi.mocked(main.getBoundingClientRect).mockReturnValue({
      left: 0,
      right: 1200,
      width: 1200,
    } as DOMRect);
    refresh();
    const strip = root.querySelector<HTMLElement>('.signature-strip')!;
    expect(strip.classList).toContain('aligned');
    expect(strip.style.marginLeft).toBe('24px');
    expect(strip.style.width).toBe('1152px');
  });

  it('keeps docked statements out of the in-flow strip', () => {
    main.classList.add('course-page');
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1800);
    vi.mocked(main.getBoundingClientRect).mockReturnValue({ left: 300, right: 1500 } as DOMRect);
    refresh();
    expect(root.querySelector('.signature-strip')).toBeNull();
    expect(root.querySelectorAll('.standalone-signature:not(.inline-signature)').length).toBe(2);
  });

  it('preserves existing section IDs and ignores hidden, modal, carousel and card headings', () => {
    main.insertAdjacentHTML(
      'beforeend',
      '<section hidden><h2>Hidden</h2></section><div role="dialog"><h2>Dialog</h2></div><div class="hero-slide"><h2>Slide</h2></div><a href="/learn"><h2>Card</h2></a><details><summary>More</summary><h2>Closed disclosure</h2></details>',
    );
    const sections = collectPageSections(main);
    expect(sections.map((section) => section.label)).toEqual(['Overview', 'Mechanism', 'Practice']);
    expect(sections[1].id).toBe('existing');
    expect(collectPageSections(main).map((section) => section.id)).toEqual(
      sections.map((section) => section.id),
    );
  });

  it('opens both sections in flow by default without docking space', () => {
    fixture.destroy();
    fixture = TestBed.createComponent(PageSidebars);
    root.append(fixture.nativeElement);
    flush();
    expect(button('Close left sidebar').getAttribute('aria-expanded')).toBe('true');
    expect(button('Close right sidebar').getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.classList.contains('inline-sidebars')).toBe(true);
    expect(main.previousElementSibling).toBe(fixture.nativeElement);
    button('Close left sidebar').click();
    flush();
    expect(button('Open left sidebar').textContent).toContain('Sample lesson');
    expect(button('Close right sidebar').textContent).toContain('Practice & review');
    expect(page.hasAttribute('inert')).toBe(false);
    expect(root.querySelector('.sidebar-backdrop')).toBeNull();
  });

  it('expands sidebars into unused gutters without modifying content dimensions', () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(2400);
    vi.mocked(main.getBoundingClientRect).mockReturnValue({
      left: 540,
      right: 1860,
      width: 1320,
      top: 76,
      bottom: 900,
      height: 824,
      x: 540,
      y: 76,
      toJSON: () => ({}),
    });
    refresh();
    button('Open left sidebar').click();
    button('Open right sidebar').click();
    flush();
    const left = root.querySelector<HTMLElement>('#page-sidebar-left')!;
    const right = root.querySelector<HTMLElement>('#page-sidebar-right')!;
    expect(left.style.insetInlineStart).toBe('6px');
    expect(left.style.width).toContain('534px');
    expect(right.style.insetInlineEnd).toBe('6px');
    expect(right.style.width).toContain('534px');
    expect(main.hasAttribute('data-sidebar-layout')).toBe(false);
    button('Close left sidebar').click();
    flush();
    expect(left.style.insetInlineStart).toBe('6px');
    expect(right.style.insetInlineEnd).toBe('6px');
    expect(right.style.width).toContain('534px');
    expect(main.style.getPropertyValue('--sidebar-start-space')).toBe('');
    expect(main.style.getPropertyValue('--sidebar-end-space')).toBe('');
  });

  it('shows the reasoning statements in the two bottom corners of wide gutters', () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(2400);
    vi.mocked(main.getBoundingClientRect).mockReturnValue({
      left: 540,
      right: 1860,
      width: 1320,
      top: 76,
      bottom: 900,
      height: 824,
      x: 540,
      y: 76,
      toJSON: () => ({}),
    });
    refresh();
    const corners = Array.from(root.querySelectorAll<HTMLElement>('.corner-signature'));
    expect(corners).toHaveLength(2);
    expect(corners[0].classList).toContain('corner-signature-left');
    expect(corners[1].classList).toContain('corner-signature-right');
    expect(corners[0].textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Understand the obstacle. Find the way.',
    );
    expect(corners[1].textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Know why it works. Know when it won’t.',
    );
    expect(root.querySelector('.signature-strip app-reasoning-prompt')).toBeNull();
    expect(
      root.querySelector('#page-sidebar-left .sidebar-heading .sidebar-title')?.textContent,
    ).toBe('Sample lesson');
    expect(
      root.querySelector('#page-sidebar-left .sidebar-heading app-sidebar-toggle'),
    ).not.toBeNull();
    expect(root.querySelector('.persistent-signature app-sidebar-toggle')).toBeNull();
    expect(
      root
        .querySelector('#page-sidebar-right app-reasoning-prompt')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim(),
    ).toBe('Review what AI writes. Know where it can fail.');
    // An open sidebar stops short of its bottom corner.
    button('Open left sidebar').click();
    flush();
    const reserved = Number(
      /- (\d+)px/.exec(root.querySelector<HTMLElement>('#page-sidebar-left')!.style.maxHeight)?.[1],
    );
    expect(reserved).toBeGreaterThanOrEqual(96 + 8);
  });

  it('keeps both statements visible when navigation and practice are collapsed', () => {
    expect(
      root
        .querySelector('.standalone-signature app-platform-signature')
        ?.closest('[hidden], [inert]'),
    ).toBeNull();
    expect(
      root.querySelector('.standalone-signature app-learning-prompt')?.closest('[hidden], [inert]'),
    ).toBeNull();
    expect(root.querySelector('.standalone-signature app-platform-signature')).not.toBeNull();
    expect(root.querySelector('.standalone-signature app-learning-prompt')).not.toBeNull();
    expect(root.querySelector('#page-sidebar-left-content')?.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('#page-sidebar-right-content')?.hasAttribute('hidden')).toBe(true);
  });

  it('keeps desktop sidebars outside the outer content surface when gutters are narrower', () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1400);
    vi.mocked(main.getBoundingClientRect).mockReturnValue({
      left: 180,
      right: 1220,
      width: 1040,
      top: 76,
      bottom: 900,
      height: 824,
      x: 180,
      y: 76,
      toJSON: () => ({}),
    });
    refresh();
    button('Open left sidebar').click();
    button('Open right sidebar').click();
    flush();
    expect(
      root.querySelector<HTMLElement>('#page-sidebar-left')!.classList.contains('docked'),
    ).toBe(false);
    expect(root.querySelector<HTMLElement>('#page-sidebar-right')!.style.width).toBe('280px');
    expect(main.style.width).toBe('');
  });

  it.each(['question-reader catalog-reader', 'question-reader'])(
    'keeps %s navigation outside the main container, including its padding',
    (readerClass) => {
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1800);
      vi.mocked(main.getBoundingClientRect).mockReturnValue({
        left: 260,
        right: 1540,
        width: 1280,
        top: 76,
        bottom: 900,
        height: 824,
        x: 260,
        y: 76,
        toJSON: () => ({}),
      });
      const reader = document.createElement('article');
      reader.className = readerClass;
      main.append(reader);
      vi.spyOn(reader, 'getBoundingClientRect').mockReturnValue({
        left: 390,
        right: 1410,
        width: 1020,
        top: 76,
        bottom: 900,
        height: 824,
        x: 390,
        y: 76,
        toJSON: () => ({}),
      });
      refresh();
      expect(root.querySelector<HTMLElement>('#page-sidebar-left')!.style.width).toBe('254px');
      expect(root.querySelector<HTMLElement>('#page-sidebar-right')!.style.width).toBe('254px');
      expect(main.style.width).toBe('');
      expect(reader.style.width).toBe('');
    },
  );

  it('uses the centered reader gutter when the outer page spans the viewport', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1800);
    vi.mocked(main.getBoundingClientRect).mockReturnValue({
      left: 0,
      right: 1800,
      width: 1800,
      top: 76,
      bottom: 900,
      height: 824,
      x: 0,
      y: 76,
      toJSON: () => ({}),
    });
    const reader = document.createElement('article');
    reader.className = 'question-reader';
    main.append(reader);
    vi.spyOn(reader, 'getBoundingClientRect').mockReturnValue({
      left: 310,
      right: 1490,
      width: 1180,
      top: 76,
      bottom: 900,
      height: 824,
      x: 310,
      y: 76,
      toJSON: () => ({}),
    });
    refresh();
    expect(root.querySelector<HTMLElement>('#page-sidebar-left')!.style.width).toBe('280px');
    expect(root.querySelector<HTMLElement>('#page-sidebar-right')!.style.width).toBe('280px');
    expect(reader.style.width).toBe('');
  });

  it('docks only when each individual gutter can fit the panel and clearances', () => {
    expect(canDockSidebar(247)).toBe(false);
    expect(canDockSidebar(248)).toBe(true);
    expect(canDockSidebar(247.99)).toBe(true);
    expect(canDockSidebar(-10)).toBe(false);
  });

  it('keeps expanded in-flow sections interactive without modal keyboard behavior', () => {
    const contentBefore = main.innerHTML;
    const open = button('Open left sidebar');
    open.click();
    flush();
    expect(page.hasAttribute('inert')).toBe(false);
    expect(root.querySelector('.sidebar-backdrop, [aria-modal]')).toBeNull();
    const panel = root.querySelector('#page-sidebar-left')!;
    expect(panel.getAttribute('role')).toBeNull();
    const close = button('Close left sidebar');
    close.focus();
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    close.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    const contentButton = document.createElement('button');
    contentButton.textContent = 'Use original content';
    main.append(contentButton);
    contentButton.focus();
    expect(document.activeElement).toBe(contentButton);
    const clicked = vi.fn();
    contentButton.addEventListener('click', clicked);
    contentButton.click();
    expect(clicked).toHaveBeenCalledOnce();
    contentButton.remove();
    close.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flush();
    expect(page.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(button('Close left sidebar'));
    expect(main.innerHTML).toBe(contentBefore);
    expect(root.querySelector('#page-sidebar-left-content')?.hasAttribute('hidden')).toBe(false);
  });

  it('positions sidebar jumps below the sticky lesson toolbar', () => {
    const toolbar = document.createElement('div');
    toolbar.className = 'question-sticky-utility';
    main.prepend(toolbar);
    vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue({ height: 60 } as DOMRect);
    const target = main.querySelector<HTMLElement>('#existing')!;
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect);
    const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    button('Open left sidebar').click();
    flush();
    root
      .querySelector<HTMLAnchorElement>('#page-sidebar-left-content a[href$="#existing"]')!
      .click();
    expect(scroll).toHaveBeenCalledWith({ top: 344, behavior: 'instant' });
  });

  it('reveals the whole section card when navigation targets its heading', () => {
    const card = document.createElement('section');
    card.innerHTML = '<p>Retrieve</p><h2 id="card-heading">Card heading</h2>';
    main.append(card);
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect);
    vi.spyOn(card.querySelector('h2')!, 'getBoundingClientRect').mockReturnValue({
      top: 560,
    } as DOMRect);
    const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    fixture.destroy();
    fixture = TestBed.createComponent(PageSidebars);
    root.append(fixture.nativeElement);
    flush();
    root
      .querySelector<HTMLAnchorElement>('#page-sidebar-left-content a[href$="#card-heading"]')!
      .click();
    expect(scroll).toHaveBeenCalledWith({ top: 404, behavior: 'instant' });
    expect(document.activeElement).toBe(card.querySelector('h2'));
  });

  it('keeps section navigation stable while the page stays interactive', () => {
    button('Open left sidebar').click();
    flush();
    refresh();
    expect(root.querySelectorAll('#page-sidebar-left-content a')).toHaveLength(3);
    expect(button('Close left sidebar').getAttribute('aria-expanded')).toBe('true');
  });

  it('toggles both in-flow sections independently and retains choices across refresh', () => {
    button('Open left sidebar').click();
    flush();
    button('Open right sidebar').click();
    flush();
    expect(button('Close left sidebar').getAttribute('aria-expanded')).toBe('true');
    expect(button('Close right sidebar').getAttribute('aria-expanded')).toBe('true');
    refresh();
    expect(button('Close right sidebar').getAttribute('aria-expanded')).toBe('true');
    button('Close right sidebar').click();
    flush();
    expect(button('Close left sidebar').getAttribute('aria-expanded')).toBe('true');
    expect(button('Open right sidebar').getAttribute('aria-expanded')).toBe('false');
    expect(page.hasAttribute('inert')).toBe(false);
  });

  it('opens docked sections by default and preserves expansion when the viewport loses its gutters', () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1800);
    vi.mocked(main.getBoundingClientRect).mockReturnValue({ left: 300, right: 1500 } as DOMRect);
    fixture.destroy();
    fixture = TestBed.createComponent(PageSidebars);
    root.append(fixture.nativeElement);
    flush();
    expect(button('Close left sidebar').getAttribute('aria-expanded')).toBe('true');
    expect(button('Close right sidebar').getAttribute('aria-expanded')).toBe('true');
    expect(main.hasAttribute('data-sidebar-columns')).toBe(true);
    // The page knows the docked navigation is showing, so it can drop shortcuts that repeat it.
    expect(main.hasAttribute('data-sidebar-nav-shown')).toBe(true);
    button('Close left sidebar').click();
    flush();
    expect(main.hasAttribute('data-sidebar-nav-shown')).toBe(false);
    expect(button('Close right sidebar').getAttribute('aria-expanded')).toBe('true');
    button('Open left sidebar').click();
    flush();
    expect(main.hasAttribute('data-sidebar-nav-shown')).toBe(true);
    expect(button('Close right sidebar').getAttribute('aria-expanded')).toBe('true');
    expect(button('Close left sidebar').getAttribute('aria-expanded')).toBe('true');
    root.querySelector<HTMLAnchorElement>('#page-sidebar-left-content a')!.focus();
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(391);
    vi.mocked(main.getBoundingClientRect).mockReturnValue({ left: 0, right: 391 } as DOMRect);
    refresh();
    expect(button('Close left sidebar').getAttribute('aria-expanded')).toBe('true');
    expect(button('Close right sidebar').getAttribute('aria-expanded')).toBe('true');
    expect(main.hasAttribute('data-sidebar-nav-shown')).toBe(false);
    expect(main.previousElementSibling).toBe(fixture.nativeElement);
    expect(document.activeElement?.tagName).toBe('A');
  });

  it('starts expanded despite a page width hint and lets the learner reclaim its column', async () => {
    // The page gives up the left column while main carries data-sidebar-left-collapsed.
    const width = vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1440);
    vi.mocked(main.getBoundingClientRect).mockImplementation(
      () =>
        ({
          left: main.hasAttribute('data-sidebar-left-collapsed') ? 64 : 248,
          right: 1192,
          width: main.hasAttribute('data-sidebar-left-collapsed') ? 1128 : 944,
        }) as DOMRect,
    );
    const context = TestBed.inject(PageSidebarContext);
    fixture.destroy();
    context.set(contextOwner, { excluded: false, collapseLeftBelow: 1700 });
    fixture = TestBed.createComponent(PageSidebars);
    root.append(fixture.nativeElement);
    flush();
    expect(button('Close left sidebar').getAttribute('aria-expanded')).toBe('true');
    button('Close left sidebar').click();
    flush();
    expect(main.hasAttribute('data-sidebar-left-collapsed')).toBe(true);
    expect(button('Open left sidebar').getAttribute('aria-expanded')).toBe('false');
    expect(button('Close right sidebar').getAttribute('aria-expanded')).toBe('true');
    expect(main.hasAttribute('data-sidebar-nav-shown')).toBe(false);

    // Opening hands the column back and docks the panel there: no overlay, the right panel stays.
    button('Open left sidebar').click();
    expect(main.hasAttribute('data-sidebar-left-collapsed')).toBe(false);
    flush();
    const left = root.querySelector<HTMLElement>('#page-sidebar-left')!;
    expect(button('Close left sidebar').getAttribute('aria-expanded')).toBe('true');
    expect(left.classList.contains('docked')).toBe(true);
    expect(left.style.width).toBe('242px');
    expect(root.querySelector('.sidebar-backdrop')).toBeNull();
    expect(button('Close right sidebar').getAttribute('aria-expanded')).toBe('true');
    expect(main.hasAttribute('data-sidebar-nav-shown')).toBe(true);

    // A filter change on the same page keeps the learner's choice.
    await TestBed.inject(Router).navigate([], { queryParams: { q: 'window' } });
    flush();
    expect(button('Close left sidebar').getAttribute('aria-expanded')).toBe('true');
    expect(main.hasAttribute('data-sidebar-left-collapsed')).toBe(false);

    button('Close left sidebar').click();
    expect(main.hasAttribute('data-sidebar-left-collapsed')).toBe(true);
    flush();
    await TestBed.inject(Router).navigate([], { queryParams: { q: 'graph' } });
    flush();
    expect(button('Open left sidebar').getAttribute('aria-expanded')).toBe('false');
    expect(main.hasAttribute('data-sidebar-left-collapsed')).toBe(true);

    // At or above the page's width, and on pages without the option, the column stays reserved.
    width.mockReturnValue(1920);
    refresh();
    expect(main.hasAttribute('data-sidebar-left-collapsed')).toBe(false);
    context.clear(contextOwner);
    width.mockReturnValue(1440);
    fixture.destroy();
    fixture = TestBed.createComponent(PageSidebars);
    root.append(fixture.nativeElement);
    flush();
    expect(main.hasAttribute('data-sidebar-left-collapsed')).toBe(false);
    expect(button('Close left sidebar').getAttribute('aria-expanded')).toBe('true');
  });

  it('groups the practice links with Quick recall, which opens a dialog that keeps its place', () => {
    TestBed.inject(PageSidebarContext).set(contextOwner, {
      excluded: false,
      recall: [
        {
          id: 'first',
          prompt: 'First check?',
          answer: '<strong>First answer</strong><script>alert(1)</script>',
        },
        { id: 'second', prompt: 'Second check?', answer: 'Second answer' },
      ],
    });
    flush();
    button('Open right sidebar').click();
    flush();
    const group = root.querySelector<HTMLElement>('.practice-review')!;
    expect(
      root.querySelector('.practice-heading #practice-review-label')?.textContent?.trim(),
    ).toBe('Practice & review');
    expect(group.getAttribute('aria-labelledby')).toBe('practice-review-label');
    expect(root.querySelector('.practice-heading app-sidebar-toggle')).not.toBeNull();
    const rows = Array.from(group.querySelectorAll<HTMLElement>('.practice-action'));
    expect(rows.map((row) => row.textContent?.trim())).toContain('Quick recall');
    expect(rows.every((row) => row.querySelector('.practice-icon svg'))).toBe(true);
    // No question sits in the sidebar any more.
    expect(root.querySelector('#page-sidebar-right-content')?.textContent).not.toContain(
      'First check?',
    );

    const opener = rows.find(
      (row) => row.textContent?.trim() === 'Quick recall',
    ) as HTMLButtonElement;
    expect(opener.getAttribute('aria-haspopup')).toBe('dialog');
    opener.click();
    flush();
    const dialog = root.querySelector<HTMLDialogElement>('dialog.recall-dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.querySelector('.recall-count')?.textContent?.trim()).toBe('Question 1 of 2');
    expect(dialog.querySelector('.recall-question')?.textContent).toBe('First check?');
    expect(dialog.querySelector<HTMLElement>('#sidebar-recall-answer')!.hidden).toBe(true);
    dialog.querySelector<HTMLButtonElement>('.recall-reveal')!.click();
    flush();
    expect(dialog.querySelector('#sidebar-recall-answer strong')?.textContent).toBe('First answer');
    expect(dialog.querySelector('#sidebar-recall-answer script')).toBeNull();
    expect(dialog.querySelector('.recall-reveal')).toBeNull();

    // Next question hides the previous answer.
    dialog.querySelector<HTMLButtonElement>('.recall-next')!.click();
    flush();
    expect(dialog.querySelector('.recall-question')?.textContent).toBe('Second check?');
    expect(dialog.querySelector<HTMLElement>('#sidebar-recall-answer')!.hidden).toBe(true);
    expect(dialog.querySelector('.recall-next')?.textContent?.trim()).toBe('Start again');

    // Close recall, then reopen at the same question.
    dialog.querySelector<HTMLButtonElement>('.recall-close')!.click();
    flush();
    expect(dialog.hasAttribute('open')).toBe(false);
    root.querySelector<HTMLButtonElement>('.practice-review button.practice-action')!.click();
    flush();
    expect(dialog.querySelector('.recall-question')?.textContent).toBe('Second check?');
  });

  it('excludes every coding workspace via page capability even without a known URL', () => {
    TestBed.inject(PageSidebarContext).set(contextOwner, { excluded: true });
    flush();
    expect(root.querySelector('.page-sidebar')).toBeNull();
    expect(page.hasAttribute('inert')).toBe(false);
  });

  it('also excludes existing coding workspace components as a defensive boundary', () => {
    main.append(document.createElement('app-dsa-problem-pilot'));
    refresh();
    expect(root.querySelector('.page-sidebar')).toBeNull();
  });

  it('does not duplicate an existing Author sidebar', () => {
    main.append(document.createElement('app-author-workspace-nav'));
    // Inventory updates on rendered content changes, not merely scroll position.
    fixture.destroy();
    fixture = TestBed.createComponent(PageSidebars);
    root.append(fixture.nativeElement);
    flush();
    expect(root.querySelector('#page-sidebar-left')).toBeNull();
    expect(root.querySelector('.standalone-signature')).toBeNull();
  });

  it('shows the styled learning prompt on catalogs before opening a lesson', () => {
    const previous = location.href;
    try {
      history.replaceState(null, '', '/grow');
      main.querySelector('#practice')!.remove();
      fixture.destroy();
      fixture = TestBed.createComponent(PageSidebars);
      root.append(fixture.nativeElement);
      flush();
      expect(root.querySelector('#page-sidebar-right app-sidebar-toggle')).toBeNull();
      expect(root.querySelector('.standalone-signature app-learning-prompt')?.textContent).toBe(
        'Know why it works. Know when it won’t.',
      );
      expect(root.querySelector('.recall-reveal')).toBeNull();
    } finally {
      history.replaceState(null, '', previous);
    }
  });

  it('does not show an empty right panel when the page has no relevant practice', () => {
    main.querySelector('#practice')!.remove();
    fixture.destroy();
    fixture = TestBed.createComponent(PageSidebars);
    root.append(fixture.nativeElement);
    flush();
    expect(root.querySelector('#page-sidebar-right')).toBeNull();
  });

  it('preserves query context and modified-click behavior in native section links', () => {
    const original = location.href;
    history.replaceState(null, '', '/search?q=sample');
    try {
      button('Open left sidebar').click();
      flush();
      const link = root.querySelector<HTMLAnchorElement>(
        '#page-sidebar-left a[href$="#existing"]',
      )!;
      expect(link.getAttribute('href')).toBe('/search?q=sample#existing');
      const event = new MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true });
      link.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    } finally {
      history.replaceState(null, '', original);
    }
  });

  it('clears page-owned recall data only when its owning view is destroyed', () => {
    const context = TestBed.inject(PageSidebarContext);
    const nextOwner = {};
    context.set(contextOwner, { excluded: true });
    context.set(nextOwner, { excluded: false });
    context.clear(contextOwner);
    expect(context.value()?.excluded).toBe(false);
    context.clear(nextOwner);
    expect(context.value()).toBeNull();
  });
});

describe('Lesson stage outline (DLV-408)', () => {
  it('marks stage headings and assigns each section to its stage', () => {
    const main = document.createElement('main');
    main.innerHTML = `
      <h1>Spring MVC</h1>
      <section id="stage-brief" data-sidebar-label="Brief" data-sidebar-level="stage" data-sidebar-stage="brief">
        <section id="lesson-scenario"><h2 data-sidebar-label="Scenario">Learning scenario: A URL shortener</h2></section>
      </section>
      <section id="stage-build" data-sidebar-label="Build" data-sidebar-level="stage" data-sidebar-stage="build">
        <section id="url-shortener-code"><h2 data-sidebar-label="The code">Build it: create and redirect</h2></section>
      </section>`;
    document.body.append(main);
    try {
      const links = collectPageSections(main).map(({ id, label, level, group }) => ({
        id,
        label,
        level,
        group,
      }));
      expect(links).toEqual([
        { id: links[0].id, label: 'Overview', level: undefined, group: undefined },
        { id: 'stage-brief', label: 'Brief', level: 'stage', group: 'brief' },
        { id: 'lesson-scenario', label: 'Scenario', level: undefined, group: 'brief' },
        { id: 'stage-build', label: 'Build', level: 'stage', group: 'build' },
        { id: 'url-shortener-code', label: 'The code', level: undefined, group: 'build' },
      ]);
    } finally {
      main.remove();
    }
  });
  it('drops the title Overview link when the lesson has its own Overview stage', () => {
    const main = document.createElement('main');
    main.innerHTML = `
      <h1>Replication and Quorums</h1>
      <section id="stage-overview" data-sidebar-label="Overview" data-sidebar-level="stage" data-sidebar-stage="overview">
        <section id="rq-overview"><h2 data-sidebar-label="What you will learn">Overview</h2></section>
      </section>
      <section id="stage-brief" data-sidebar-label="Brief" data-sidebar-level="stage" data-sidebar-stage="brief">
        <section id="lesson-scenario"><h2 data-sidebar-label="Scenario">Learning scenario</h2></section>
      </section>`;
    document.body.append(main);
    try {
      expect(collectPageSections(main).map(({ id, label }) => ({ id, label }))).toEqual([
        { id: 'stage-overview', label: 'Overview' },
        { id: 'rq-overview', label: 'What you will learn' },
        { id: 'stage-brief', label: 'Brief' },
        { id: 'lesson-scenario', label: 'Scenario' },
      ]);
    } finally {
      main.remove();
    }
  });
});

describe('Sidebar page title (navTitle)', () => {
  it('prefers the authored short title on the h1 and falls back to its text', () => {
    const main = document.createElement('main');
    main.innerHTML =
      '<h1 data-sidebar-title=" Design a reservation system ">Design a reservation system with payment: 60,000 seats</h1>';
    expect(sidebarPageTitle(main)).toBe('Design a reservation system');
    main.querySelector('h1')!.removeAttribute('data-sidebar-title');
    expect(sidebarPageTitle(main)).toBe('Design a reservation system with payment: 60,000 seats');
    main.innerHTML = '<p>No heading</p>';
    expect(sidebarPageTitle(main)).toBe('This page');
  });
});
