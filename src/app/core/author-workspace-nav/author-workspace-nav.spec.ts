import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthorWorkspaceNav } from './author-workspace-nav';

describe('AuthorWorkspaceNav', () => {
  it('renders the eyebrow and title', () => {
    const fixture = TestBed.createComponent(AuthorWorkspaceNav);
    fixture.componentRef.setInput('pageTitle', 'Operations');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.eyebrow').textContent).toBe(
      'Local author workspace',
    );
    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Operations');
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

  it('groups four direct documentation links under a route-aware disclosure', () => {
    const fixture = TestBed.createComponent(AuthorWorkspaceNav);
    fixture.componentRef.setInput('pageTitle', 'Operations');
    fixture.componentRef.setInput('pageId', 'operations');
    fixture.detectChanges();
    const links = [
      ...fixture.nativeElement.querySelectorAll('.workspace-navigation a'),
    ] as HTMLAnchorElement[];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/author/previews',
      '/delivery-plan',
      '/author/architecture',
      '/author/local-development',
      '/author/api',
      '/author/operations',
    ]);
    const button = fixture.nativeElement.querySelector(
      '.documentation-toggle',
    ) as HTMLButtonElement;
    expect(button.textContent).toContain('Documentation');
    expect(button.textContent).toContain('Current section');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(
      fixture.nativeElement.querySelector(`#${button.getAttribute('aria-controls')}`),
    ).not.toBeNull();
    expect(links.at(-1)?.getAttribute('aria-current')).toBe('page');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('.documentation-links').hidden).toBe(true);
    expect(button.textContent).toContain('Current section');
    const originalUrl = location.pathname + location.search + location.hash;
    try {
      history.replaceState(null, '', '/author/operations#maintenance');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      fixture.detectChanges();
      expect(button.getAttribute('aria-expanded')).toBe('false');
    } finally {
      history.replaceState(null, '', originalUrl);
    }
  });

  it('defaults Documentation closed outside document pages and keeps instance IDs unique', () => {
    const first = TestBed.createComponent(AuthorWorkspaceNav);
    first.componentRef.setInput('pageId', 'previews');
    first.detectChanges();
    const second = TestBed.createComponent(AuthorWorkspaceNav);
    second.componentRef.setInput('pageId', 'architecture');
    second.detectChanges();
    const firstButton = first.nativeElement.querySelector(
      '.documentation-toggle',
    ) as HTMLButtonElement;
    const secondButton = second.nativeElement.querySelector(
      '.documentation-toggle',
    ) as HTMLButtonElement;
    expect(firstButton.getAttribute('aria-expanded')).toBe('false');
    expect(first.nativeElement.querySelector('.documentation-links').hidden).toBe(true);
    expect(secondButton.getAttribute('aria-expanded')).toBe('true');
    expect(firstButton.getAttribute('aria-controls')).not.toBe(
      secondButton.getAttribute('aria-controls'),
    );
  });

  it('keeps same-page outline links on the author route and scrolls to their section', () => {
    const originalUrl = location.pathname + location.search + location.hash;
    history.replaceState(null, '', '/author/operations');
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
          { label: 'Supporting references', href: '/author/operations#supporting-references' },
        ];
      }
      const fixture = TestBed.createComponent(OutlineHost);
      fixture.detectChanges();
      const section: HTMLElement = fixture.nativeElement.querySelector('#repository-runbook-links');
      section.scrollIntoView = vi.fn();
      const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.heading-outline a');
      expect(link.getAttribute('href')).toBe('/author/operations#repository-runbook-links');
      expect(link.getAttribute('aria-current')).toBe('location');
      link.click();
      expect(location.pathname).toBe('/author/operations');
      expect(location.hash).toBe('#repository-runbook-links');
      expect(section.scrollIntoView).toHaveBeenCalled();
      const supporting: HTMLElement = fixture.nativeElement.querySelector('#supporting-references');
      supporting.scrollIntoView = vi.fn();
      fixture.nativeElement.querySelectorAll('.heading-outline a')[1].click();
      expect(location.pathname).toBe('/author/operations');
      expect(location.hash).toBe('#supporting-references');
      expect(supporting.scrollIntoView).toHaveBeenCalled();
    } finally {
      history.replaceState(null, '', originalUrl);
    }
  });

  it('requests embedded sections without targeting a raw document window', () => {
    const originalUrl = location.pathname + location.search + location.hash;
    history.replaceState(null, '', '/author/local-development');
    try {
      const fixture = TestBed.createComponent(AuthorWorkspaceNav);
      fixture.componentRef.setInput('outline', [
        { label: 'Change workflow', href: '/author/local-development#change-workflow' },
      ]);
      fixture.detectChanges();
      const requested: string[] = [];
      fixture.componentInstance.embeddedSectionSelected.subscribe((hash) => requested.push(hash));
      const link = fixture.nativeElement.querySelector('.heading-outline a') as HTMLAnchorElement;
      expect(link.getAttribute('target')).toBeNull();
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      link.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      expect(location.pathname).toBe('/author/local-development');
      expect(location.hash).toBe('#change-workflow');
      expect(requested).toEqual(['#change-workflow']);
      link.click();
      expect(requested).toEqual(['#change-workflow', '#change-workflow']);
    } finally {
      history.replaceState(null, '', originalUrl);
    }
  });
});
