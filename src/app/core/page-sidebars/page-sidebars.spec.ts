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
