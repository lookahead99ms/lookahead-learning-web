import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageSidebarContext } from './page-sidebar-context';
import { PageSidebars, canDockSidebar, collectPageSections } from './page-sidebars';

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
    const result = root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(result).not.toBeNull();
    return result!;
  }

  it('keeps homepage support in the content and its signature in the hero', () => {
    main.classList.add('landing-page');
    refresh();
    button('Open left sidebar').click();
    flush();
    expect(root.querySelector('#page-sidebar-right')).toBeNull();
    expect(root.querySelector('#page-sidebar-left app-platform-signature')).toBeNull();
    expect(root.querySelector('#page-sidebar-left nav')?.textContent).not.toContain('Overview');
    expect(root.querySelector('#page-sidebar-left')?.textContent).not.toContain('On this page');
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
    button('Close left sidebar').click();
    button('Close right sidebar').click();
    flush();
  });

  afterEach(() => {
    fixture.destroy();
    root.remove();
    vi.restoreAllMocks();
  });

  it.each(['course-page', 'search-page', 'account-page', 'account-page manage-account', 'challenge-page'])(
    'excludes page shell %s and restores sidebars when returning to learning',
    (className) => {
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
    },
  );

  it('expands catalog groups independently and exposes course destinations', () => {
    TestBed.inject(PageSidebarContext).set(contextOwner, {
      excluded: false,
      groups: [
        { id: 'languages', title: 'Languages', courses: [{ id: 'python', title: 'Python', url: '/learn/python' }] },
        { id: 'systems', title: 'Systems', courses: [{ id: 'design', title: 'Design', url: '/look-ahead/design' }] },
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

  it('expands first, then collapses and navigates to the section on the second activation', () => {
    TestBed.inject(PageSidebarContext).set(contextOwner, {
      excluded: false,
      groupLabel: 'Foundation Tracks',
      groups: [{ id: 'mechanism', sectionId: 'existing', title: 'Mechanism', courses: [{ id: 'example', title: 'Example', url: '/learn/example' }] }],
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
      groups: [{ id: 'mechanism', sectionId: 'existing', title: 'Mechanism', courses: [{ id: 'example', title: 'Example', url: '/learn/example' }] }],
    });
    vi.spyOn(main.querySelector('#existing')!, 'getBoundingClientRect').mockReturnValue({ top: 90 } as DOMRect);
    vi.spyOn(main.querySelector('#practice')!, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect);
    flush();
    refresh();
    const group = root.querySelector('.catalog-group-toggle')!;
    expect(group.getAttribute('aria-current')).toBe('location');
    expect(group.getAttribute('aria-expanded')).toBe('false');
  });

  it('highlights the overview at the top and transfers selection to sections and back', () => {
    TestBed.inject(PageSidebarContext).set(contextOwner, {
      excluded: false, groupLabel: 'Foundation Tracks',
      groups: [{ id: 'mechanism', sectionId: 'existing', title: 'Mechanism', courses: [{ id: 'example', title: 'Example', url: '/learn/example' }] }],
    });
    const section = vi.spyOn(main.querySelector('#existing')!, 'getBoundingClientRect').mockReturnValue({ top: 600 } as DOMRect);
    vi.spyOn(main.querySelector('#practice')!, 'getBoundingClientRect').mockReturnValue({ top: 1000 } as DOMRect);
    flush(); refresh();
    expect(root.querySelector('.catalog-overview')?.getAttribute('aria-current')).toBe('location');
    expect(root.querySelector('.catalog-group-toggle')?.hasAttribute('aria-current')).toBe(false);
    section.mockReturnValue({ top: 90 } as DOMRect);
    refresh();
    expect(root.querySelector('.catalog-overview')?.hasAttribute('aria-current')).toBe(false);
    expect(root.querySelector('.catalog-group-toggle')?.getAttribute('aria-current')).toBe('location');
    section.mockReturnValue({ top: 600 } as DOMRect);
    refresh();
    expect(root.querySelector('.catalog-overview')?.getAttribute('aria-current')).toBe('location');
  });

  it('selects the final section when scrolling reaches the document bottom', () => {
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(400);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(1200);
    vi.spyOn(main.querySelector('#practice')!, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect);
    refresh();
    expect(root.querySelector('[aria-current="location"]')?.textContent).toContain('Practice');
  });

  it('updates selection when scrolling upward after reaching the bottom', () => {
    const scroll = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(400);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(1200);
    vi.spyOn(main.querySelector('#existing')!, 'getBoundingClientRect').mockReturnValue({ top: 90 } as DOMRect);
    vi.spyOn(main.querySelector('#practice')!, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect);
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
    vi.spyOn(main.querySelector('.page-message')!, 'getBoundingClientRect').mockReturnValue({ left: 320, right: 1480 } as DOMRect);
    refresh();
    expect(parseFloat((root.querySelector('.standalone-signature-left') as HTMLElement).style.width)).toBeGreaterThan(192);
    expect(root.querySelector('.standalone-signature-left.inline-signature')).toBeNull();
  });

  it('keeps Search statements within the actual search-shell gutters', () => {
    main.classList.add('search-page');
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(2400);
    vi.mocked(main.getBoundingClientRect).mockReturnValue({ left: 0, right: 2400 } as DOMRect);
    main.innerHTML = '<section class="search-shell"><h1>Search topics and questions</h1></section>';
    const shell = vi.spyOn(main.querySelector('.search-shell')!, 'getBoundingClientRect').mockReturnValue({ left: 470, right: 1930 } as DOMRect);
    refresh();
    const right = root.querySelector<HTMLElement>('.standalone-signature-right')!;
    expect(parseFloat(right.style.width)).toBe(416);
    expect(right.classList.contains('inline-signature')).toBe(false);
    shell.mockReturnValue({ left: 60, right: 2340 } as DOMRect);
    refresh();
    expect(right.classList.contains('inline-signature')).toBe(true);
  });

  it('puts standalone text in normal flow when the page has no side gutter', () => {
    main.classList.add('course-page');
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1800);
    vi.mocked(main.getBoundingClientRect).mockReturnValue({ left: 0, right: 1800 } as DOMRect);
    refresh();
    expect(root.querySelectorAll('.standalone-signature.inline-signature').length).toBe(2);
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

  it('opens both available sidebars by default even without docking space', () => {
    fixture.destroy();
    fixture = TestBed.createComponent(PageSidebars);
    root.append(fixture.nativeElement);
    flush();
    expect(button('Close left sidebar').getAttribute('aria-expanded')).toBe('true');
    expect(button('Close right sidebar').getAttribute('aria-expanded')).toBe('true');
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
    expect(right.style.width).toContain('510px');
    expect(main.hasAttribute('data-sidebar-layout')).toBe(false);
    button('Close left sidebar').click();
    flush();
    expect(left.style.insetInlineStart).toBe('6px');
    expect(right.style.insetInlineEnd).toBe('6px');
    expect(right.style.width).toContain('510px');
    expect(main.style.getPropertyValue('--sidebar-start-space')).toBe('');
    expect(main.style.getPropertyValue('--sidebar-end-space')).toBe('');
  });

  it('keeps both statements visible when navigation and practice are collapsed', () => {
    expect(
      root.querySelector('#page-sidebar-left app-platform-signature')?.closest('[hidden], [inert]'),
    ).toBeNull();
    expect(
      root.querySelector('#page-sidebar-right app-learning-prompt')?.closest('[hidden], [inert]'),
    ).toBeNull();
    expect(root.querySelector('#page-sidebar-left app-platform-signature')).not.toBeNull();
    expect(root.querySelector('#page-sidebar-right app-learning-prompt')).not.toBeNull();
    expect(root.querySelector('#page-sidebar-left-content')?.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('#page-sidebar-right-content')?.hasAttribute('hidden')).toBe(true);
  });

  it('keeps desktop sidebars outside the outer content surface when gutters are narrower', () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1400);
    vi.mocked(main.getBoundingClientRect).mockReturnValue({ left: 180, right: 1220, width: 1040, top: 76, bottom: 900, height: 824, x: 180, y: 76, toJSON: () => ({}) });
    refresh();
    button('Open left sidebar').click();
    button('Open right sidebar').click();
    flush();
    expect(root.querySelector<HTMLElement>('#page-sidebar-left')!.style.width).toBe('174px');
    expect(root.querySelector<HTMLElement>('#page-sidebar-right')!.style.width).toBe('150px');
    expect(main.style.width).toBe('');
  });

  it.each(['question-reader catalog-reader', 'question-reader'])('keeps %s navigation outside the main container, including its padding', (readerClass) => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1800);
    vi.mocked(main.getBoundingClientRect).mockReturnValue({ left: 260, right: 1540, width: 1280, top: 76, bottom: 900, height: 824, x: 260, y: 76, toJSON: () => ({}) });
    const reader = document.createElement('article');
    reader.className = readerClass;
    main.append(reader);
    vi.spyOn(reader, 'getBoundingClientRect').mockReturnValue({ left: 390, right: 1410, width: 1020, top: 76, bottom: 900, height: 824, x: 390, y: 76, toJSON: () => ({}) });
    refresh();
    expect(root.querySelector<HTMLElement>('#page-sidebar-left')!.style.width).toBe('254px');
    expect(root.querySelector<HTMLElement>('#page-sidebar-right')!.style.width).toBe('230px');
    expect(main.style.width).toBe('');
    expect(reader.style.width).toBe('');
  });

  it('uses the centered reader gutter when the outer page spans the viewport', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1800);
    vi.mocked(main.getBoundingClientRect).mockReturnValue({ left: 0, right: 1800, width: 1800, top: 76, bottom: 900, height: 824, x: 0, y: 76, toJSON: () => ({}) });
    const reader = document.createElement('article');
    reader.className = 'question-reader';
    main.append(reader);
    vi.spyOn(reader, 'getBoundingClientRect').mockReturnValue({ left: 310, right: 1490, width: 1180, top: 76, bottom: 900, height: 824, x: 310, y: 76, toJSON: () => ({}) });
    refresh();
    expect(root.querySelector<HTMLElement>('#page-sidebar-left')!.style.width).toBe('280px');
    expect(root.querySelector<HTMLElement>('#page-sidebar-right')!.style.width).toBe('256px');
    expect(reader.style.width).toBe('');
  });

  it('docks only when each individual gutter can fit the panel and clearances', () => {
    expect(canDockSidebar(247)).toBe(false);
    expect(canDockSidebar(248)).toBe(true);
    expect(canDockSidebar(-10)).toBe(false);
  });

  it('opens a nonmodal panel, keeps the page interactive, and supports Escape', () => {
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
    expect(document.activeElement).toBe(button('Open left sidebar'));
    expect(main.innerHTML).toBe(contentBefore);
    expect(root.querySelector('#page-sidebar-left-content')?.hasAttribute('hidden')).toBe(true);
  });

  it('keeps section navigation stable while the page stays interactive', () => {
    button('Open left sidebar').click();
    flush();
    refresh();
    expect(root.querySelectorAll('#page-sidebar-left-content a')).toHaveLength(3);
    expect(button('Close left sidebar').getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps both panels open independently and retains choices across resize', () => {
    button('Open left sidebar').click();
    flush();
    button('Open right sidebar').click();
    flush();
    expect(button('Close left sidebar').getAttribute('aria-expanded')).toBe('true');
    expect(button('Close right sidebar').getAttribute('aria-expanded')).toBe('true');
    button('Close right sidebar').click();
    flush();
    expect(page.hasAttribute('inert')).toBe(false);
    expect(button('Open right sidebar')).toBeTruthy();
    refresh();
    expect(button('Close left sidebar').getAttribute('aria-expanded')).toBe('true');
    expect(button('Open right sidebar').getAttribute('aria-expanded')).toBe('false');
    button('Open right sidebar').click();
    flush();
    expect(button('Close left sidebar')).toBeTruthy();
    expect(button('Close right sidebar')).toBeTruthy();
  });

  it('uses already-loaded recall content, resets answers between questions, and sanitizes HTML', () => {
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
    const reveal = root.querySelector<HTMLButtonElement>('.recall-reveal')!;
    expect(reveal.getAttribute('aria-expanded')).toBe('false');
    reveal.click();
    flush();
    expect(root.querySelector('#sidebar-recall-answer strong')?.textContent).toBe('First answer');
    expect(root.querySelector('#sidebar-recall-answer script')).toBeNull();
    root.querySelector<HTMLButtonElement>('.recall-navigation button')!.click();
    flush();
    expect(root.querySelector('#page-sidebar-right-content')?.textContent).toContain(
      'Second check?',
    );
    expect(reveal.getAttribute('aria-expanded')).toBe('false');
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
      expect(root.querySelector('#page-sidebar-right app-learning-prompt')?.textContent).toBe(
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
