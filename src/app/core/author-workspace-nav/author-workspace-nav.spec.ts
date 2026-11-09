import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthorWorkspaceNav } from './author-workspace-nav';

describe('AuthorWorkspaceNav', () => {
  it('renders the eyebrow and title', () => {
    const fixture = TestBed.createComponent(AuthorWorkspaceNav);
    fixture.componentRef.setInput('pageTitle', 'Operations');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.eyebrow').textContent).toBe('Admin');
    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Operations');
    expect(fixture.nativeElement.querySelector('app-platform-signature')).toBeNull();
  });

  it('keeps section navigation visible without an On this page disclosure', () => {
    const fixture = TestBed.createComponent(AuthorWorkspaceNav);
    fixture.componentRef.setInput('pageTitle', 'Reviewer guide');
    fixture.componentRef.setInput('outline', [{ label: 'What to review', href: '#what-to-review' }]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('button')).toBeNull();
    expect(root.textContent).not.toContain('On this page');
    expect(root.querySelector('[hidden], [inert]')).toBeNull();
    expect(root.querySelector('h1')?.textContent).toBe('Reviewer guide');
    expect(root.querySelector('nav')?.getAttribute('aria-label')).toBe('Reviewer guide outline');
    expect(root.querySelector('a')?.textContent?.trim()).toBe('What to review');
    fixture.componentRef.setInput('outline', []);
    fixture.detectChanges();
    expect(root.querySelector('nav')).toBeNull();
    expect(root.querySelector('h1')).not.toBeNull();
  });

  it('projects page-specific content below the heading', () => {
    @Component({
      selector: 'app-host',
      imports: [AuthorWorkspaceNav],
      template: `
        <app-author-workspace-nav pageTitle="Operations">
          <p description>Custom description</p>
          <p class="extra">Extra sidebar content</p>
        </app-author-workspace-nav>
      `,
    })
    class HostComponent {}
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[description]').textContent).toBe(
      'Custom description',
    );
    expect(fixture.nativeElement.querySelector('.extra').textContent).toBe('Extra sidebar content');
  });

  it('keeps admin navigation out of the left sidebar', () => {
    const fixture = TestBed.createComponent(AuthorWorkspaceNav);
    fixture.componentRef.setInput('pageTitle', 'Operations');
    fixture.componentRef.setInput('pageId', 'operations');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('nav[aria-label="Admin navigation"]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Documentation pages');
  });

  it('keeps same-page outline links on the author route and scrolls to their section', () => {
    const originalUrl = location.pathname + location.search + location.hash;
    history.replaceState(null, '', '/admin/operations');
    try {
      @Component({
        selector: 'app-outline-host',
        imports: [AuthorWorkspaceNav],
        template: `
          <app-author-workspace-nav pageTitle="Operations" [outline]="outline" />
          <section id="repository-runbook-links">Repositories</section>
          <section id="supporting-references">Supporting references</section>
        `,
      })
      class OutlineHost {
        outline = [
          { label: 'Repository and runbook links', href: '#repository-runbook-links' },
          { label: 'Supporting references', href: '/admin/operations#supporting-references' },
        ];
      }
      const fixture = TestBed.createComponent(OutlineHost);
      fixture.detectChanges();
      const section: HTMLElement = fixture.nativeElement.querySelector('#repository-runbook-links');
      section.scrollIntoView = vi.fn();
      const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.heading-outline a');
      expect(link.getAttribute('href')).toBe('/admin/operations#repository-runbook-links');
      expect(link.getAttribute('aria-current')).toBe('location');
      link.click();
      expect(location.pathname).toBe('/admin/operations');
      expect(location.hash).toBe('#repository-runbook-links');
      expect(section.scrollIntoView).toHaveBeenCalled();
      const supporting: HTMLElement = fixture.nativeElement.querySelector('#supporting-references');
      supporting.scrollIntoView = vi.fn();
      fixture.nativeElement.querySelectorAll('.heading-outline a')[1].click();
      expect(location.pathname).toBe('/admin/operations');
      expect(location.hash).toBe('#supporting-references');
      expect(supporting.scrollIntoView).toHaveBeenCalled();
    } finally {
      history.replaceState(null, '', originalUrl);
    }
  });

  it('requests embedded sections without targeting a raw document window', () => {
    const originalUrl = location.pathname + location.search + location.hash;
    history.replaceState(null, '', '/admin/local-development');
    try {
      const fixture = TestBed.createComponent(AuthorWorkspaceNav);
      fixture.componentRef.setInput('outline', [
        { label: 'Change workflow', href: '/admin/local-development#change-workflow' },
      ]);
      fixture.detectChanges();
      const requested: string[] = [];
      fixture.componentInstance.embeddedSectionSelected.subscribe((hash) => requested.push(hash));
      const link = fixture.nativeElement.querySelector('.heading-outline a') as HTMLAnchorElement;
      expect(link.getAttribute('target')).toBeNull();
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      link.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      expect(location.pathname).toBe('/admin/local-development');
      expect(location.hash).toBe('#change-workflow');
      expect(requested).toEqual(['#change-workflow']);
      link.click();
      expect(requested).toEqual(['#change-workflow', '#change-workflow']);
    } finally {
      history.replaceState(null, '', originalUrl);
    }
  });
});

describe('Author outline follows reading position', () => {
  const originalUrl = location.pathname + location.search + location.hash;
  beforeEach(() => {
    vi.useFakeTimers();
    history.replaceState(null, '', '/admin/operations');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    history.replaceState(null, '', originalUrl);
  });

  it('tracks native sections down and up without rewriting the URL or workspace selection', () => {
    const fixture = TestBed.createComponent(AuthorWorkspaceNav);
    fixture.componentRef.setInput('pageId', 'operations');
    fixture.componentRef.setInput('outline', [
      { label: 'First', href: '#first-section' },
      { label: 'Second', href: '#second-section' },
    ]);
    let secondTop = 500;
    const sections = ['first-section', 'second-section'].map((id, index) => {
      const section = document.createElement('section');
      section.id = id;
      section.getClientRects = () => [{ top: 0 }] as unknown as DOMRectList;
      section.getBoundingClientRect = () => ({ top: index ? secondTop : -500 }) as DOMRect;
      document.body.append(section);
      return section;
    });
    try {
      fixture.detectChanges();
      vi.advanceTimersByTime(20);
      fixture.detectChanges();
      const active = () =>
        fixture.nativeElement.querySelector('.heading-outline [aria-current]')?.textContent.trim();
      expect(active()).toBe('First');
      secondTop = 20;
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
      fixture.detectChanges();
      expect(active()).toBe('Second');
      expect(location.hash).toBe('');
      secondTop = 500;
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
      fixture.detectChanges();
      expect(active()).toBe('First');
    } finally {
      sections.forEach((section) => section.remove());
    }
  });

  it('scrolls only the sidebar container to reveal the active outline item', () => {
    const fixture = TestBed.createComponent(AuthorWorkspaceNav);
    fixture.componentRef.setInput('outline', [
      { label: 'First', href: '#first-section' },
      { label: 'Second', href: '#second-section' },
    ]);
    const host = fixture.nativeElement as HTMLElement;
    host.style.overflowY = 'auto';
    Object.defineProperty(host, 'scrollHeight', { value: 900 });
    Object.defineProperty(host, 'clientHeight', { value: 300 });
    host.getBoundingClientRect = () => ({ top: 80, bottom: 380 }) as DOMRect;
    fixture.detectChanges();
    const links = host.querySelectorAll<HTMLElement>('.heading-outline a');
    links[1].getBoundingClientRect = () => ({ top: 500, bottom: 544 }) as DOMRect;
    const pageScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    history.replaceState(null, '', '/admin/operations#second-section');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    fixture.detectChanges();
    expect(host.scrollTop).toBe(172);
    expect(pageScroll).not.toHaveBeenCalled();
    expect(location.hash).toBe('#second-section');
    expect(links[1].getAttribute('aria-current')).toBe('location');
    links[0].getBoundingClientRect = () => ({ top: 20, bottom: 64 }) as DOMRect;
    history.replaceState(null, '', '/admin/operations#first-section');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    fixture.detectChanges();
    expect(host.scrollTop).toBe(104);
    expect(pageScroll).not.toHaveBeenCalled();
  });

  it('accepts only current, bounded positions from the active opaque-origin frame', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    let frameTop = 200;
    frame.getBoundingClientRect = () => ({ top: frameTop }) as DOMRect;
    const fixture = TestBed.createComponent(AuthorWorkspaceNav);
    fixture.componentRef.setInput('outline', [
      { label: 'First', href: '#first-section' },
      { label: 'Second', href: '#second-section' },
    ]);
    fixture.componentRef.setInput('embeddedFrame', frame);
    fixture.componentRef.setInput('embeddedDocumentId', 'operations-reference');
    fixture.componentRef.setInput('embeddedHeight', 2000);
    try {
      fixture.detectChanges();
      const request = post.mock.calls.at(-1)![0];
      expect(request.type).toBe('lookahead:author-document:outline-request');
      expect(
        post.mock.calls.some(
          ([message]) => message.type === 'lookahead:author-document:anchor-request',
        ),
      ).toBe(false);
      const data = {
        type: 'lookahead:author-document:outline',
        version: 1,
        documentId: 'operations-reference',
        requestId: request.requestId,
        sections: [
          { anchor: 'first-section', offset: 0 },
          { anchor: 'second-section', offset: 800 },
        ],
      };
      const send = (payload = data, source = frame.contentWindow, origin = 'null') => {
        window.dispatchEvent(new MessageEvent('message', { data: payload, source, origin }));
        vi.advanceTimersByTime(20);
        fixture.detectChanges();
      };
      frameTop = -850;
      send(data, window);
      send(data, frame.contentWindow, location.origin);
      send({ ...data, requestId: request.requestId - 1 });
      send({ ...data, sections: [{ anchor: 'second-section', offset: -1 }] });
      expect(
        fixture.nativeElement.querySelector('.heading-outline [aria-current]').textContent.trim(),
      ).toBe('First');
      send();
      expect(
        fixture.nativeElement.querySelector('.heading-outline [aria-current]').textContent.trim(),
      ).toBe('Second');
      expect(location.hash).toBe('');
      frameTop = 200;
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector('.heading-outline [aria-current]').textContent.trim(),
      ).toBe('First');
      fixture.destroy();
    } finally {
      frame.remove();
    }
  });
});

describe('Copy on behalf of the embedded document', () => {
  it('copies only for its own frame and answers with the result', async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const reply = vi.spyOn(frame.contentWindow!, 'postMessage');
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const fixture = TestBed.createComponent(AuthorWorkspaceNav);
    fixture.componentRef.setInput('embeddedFrame', frame);
    fixture.componentRef.setInput('embeddedDocumentId', 'local-development');
    fixture.detectChanges();
    const send = (data: unknown, source: Window | null = frame.contentWindow, origin = 'null') =>
      window.dispatchEvent(new MessageEvent('message', { data, source, origin }));
    const request = { type: 'lookahead:author-document:copy', version: 1, requestId: 7, text: 'git status' };
    try {
      send(request, window);
      send(request, frame.contentWindow, location.origin);
      send({ ...request, text: 'x'.repeat(100_001) });
      send({ ...request, requestId: 'seven' });
      await Promise.resolve();
      expect(writeText).not.toHaveBeenCalled();
      send(request);
      await vi.waitFor(() =>
        expect(reply).toHaveBeenCalledWith(
          { type: 'lookahead:author-document:copy-result', version: 1, requestId: 7, copied: true },
          '*',
        ),
      );
      expect(writeText).toHaveBeenCalledWith('git status');
      writeText.mockRejectedValueOnce(new Error('denied'));
      send({ ...request, requestId: 8 });
      await vi.waitFor(() =>
        expect(reply).toHaveBeenCalledWith(
          { type: 'lookahead:author-document:copy-result', version: 1, requestId: 8, copied: false },
          '*',
        ),
      );
    } finally {
      fixture.destroy();
      frame.remove();
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });
});

describe('Admin section tab panels', () => {
  it('switches one panel at a time, preserves drafts and restores deep links without scrolling', () => {
    history.replaceState(null, '', '/admin/plans#second');
    @Component({imports:[AuthorWorkspaceNav], template:`<main>
      <app-author-workspace-nav [tabbed]="true" pageTitle="Guide" [outline]="items" />
      <section id="first"><h2>First</h2><input value="draft"></section>
      <section id="second"><h2>Second</h2><button>Second action</button></section>
    </main>`})
    class Host { items = [{label:'First',href:'#first'}, {label:'Second',href:'#second'}]; }
    const fixture = TestBed.createComponent(Host); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const panel = (id:string) => root.querySelector<HTMLElement>(`#workspace-panel-${id}`)!;
    const tabs = () => [...root.querySelectorAll<HTMLAnchorElement>('[role="tab"]')];
    expect(panel('first').hidden).toBe(true); expect(panel('second').hidden).toBe(false);
    const input = root.querySelector('input')!; input.value='unsaved work';
    const scroll = vi.fn();
    root.querySelector<HTMLElement>('#first')!.scrollIntoView = scroll;
    root.querySelector<HTMLElement>('#second')!.scrollIntoView = scroll;
    tabs()[0].click(); fixture.detectChanges();
    expect(panel('first').hidden).toBe(false); expect(panel('second').hasAttribute('inert')).toBe(true);
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs()[0].getAttribute('aria-controls')).toBe(panel('first').id);
    expect(panel('first').getAttribute('aria-labelledby')).toBe(tabs()[0].id);
    expect(location.hash).toBe('#first'); expect(scroll).not.toHaveBeenCalled();
    tabs()[0].dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true})); fixture.detectChanges();
    expect(panel('second').hidden).toBe(false); expect(document.activeElement).toBe(tabs()[1]);
    tabs()[1].dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true})); fixture.detectChanges();
    expect(root.querySelector('input')).toBe(input); expect(input.value).toBe('unsaved work');
    history.replaceState(null, '', '/admin/plans#second'); window.dispatchEvent(new PopStateEvent('popstate')); fixture.detectChanges();
    expect(panel('second').hidden).toBe(false);
    fixture.destroy(); history.replaceState(null,'','/');
  });

  it('sends bounded selection to the opaque document and only accepts its own ready/selection messages', () => {
    history.replaceState(null,'','/admin/review-guide');
    @Component({imports:[AuthorWorkspaceNav],template:`<main><app-author-workspace-nav [tabbed]="true" pageTitle="Guide" [outline]="items" [embeddedFrame]="frame" embeddedDocumentId="reviewer-guide"/><section><iframe #frame sandbox="allow-scripts"></iframe></section></main>`})
    class Host {items=[{label:'First',href:'#first'},{label:'Second',href:'#second'}];}
    const fixture=TestBed.createComponent(Host); fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement, frame=root.querySelector('iframe')!;
    const send=vi.spyOn(frame.contentWindow!, 'postMessage');
    const scroll=vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
    const marker=root.querySelector<HTMLElement>('.tab-position')!;
    vi.spyOn(marker,'getBoundingClientRect').mockReturnValue({top:-20} as DOMRect);
    const raf=vi.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{callback(0);return 1;});

    root.querySelectorAll<HTMLAnchorElement>('[role="tab"]')[1].click();fixture.detectChanges();
    expect(send).toHaveBeenCalledWith({type:'lookahead:author-document:tab-request',version:1,documentId:'reviewer-guide',anchor:'second'},'*');
    scroll.mockClear();
    const height=()=>window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,origin:'null',data:{type:'lookahead:author-document:height',version:1,documentId:'reviewer-guide',height:500}}));
    height(); height(); expect(scroll).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new WheelEvent('wheel')); height(); expect(scroll).toHaveBeenCalledTimes(2);
    raf.mockRestore(); scroll.mockRestore();

    const message=(source:Window|null,origin:string,anchor:string)=>window.dispatchEvent(new MessageEvent('message',{source,origin,data:{type:'lookahead:author-document:tab-selected',version:1,documentId:'reviewer-guide',anchor}}));
    message(window,'null','first');message(frame.contentWindow,'https://wrong.test','first');message(frame.contentWindow,'null','unknown');
    expect(location.hash).toBe('#second');
    message(frame.contentWindow,'null','first');fixture.detectChanges();
    expect(location.hash).toBe('#first');
    history.replaceState(null,'','/admin/review-guide#nested');
    window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,origin:'null',data:{type:'lookahead:author-document:tab-selected',version:1,documentId:'reviewer-guide',anchor:'first',fragment:'nested'}}));
    fixture.detectChanges();
    expect(location.hash).toBe('#nested');
    expect(root.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()).toBe('First');
    const introMessage = (text: string, source: Window | null = frame.contentWindow) => window.dispatchEvent(new MessageEvent('message', {source, origin: 'null', data:{type:'lookahead:author-document:introduction', version:1, documentId:'reviewer-guide', text}}));
    introMessage('Wrong frame', window); introMessage('x'.repeat(5001)); fixture.detectChanges();
    expect(root.querySelector('.embedded-introduction')).toBeNull();
    introMessage('<b>Shared introduction</b>'); fixture.detectChanges();
    const intro = root.querySelector('.embedded-introduction')!;
    expect(intro.textContent).toBe('<b>Shared introduction</b>'); expect(intro.querySelector('b')).toBeNull();
    expect(intro.compareDocumentPosition(root.querySelector('[role="tablist"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(send).toHaveBeenCalledWith({type:'lookahead:author-document:introduction-accepted',version:1,documentId:'reviewer-guide'},'*');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(root.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe('workspace-tab-first');
    fixture.destroy();history.replaceState(null,'','/');
  });
});
