import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { AuthorOperationsPage } from './author-operations';
import {
  AUTHOR_DOCUMENTS_CLIENT,
  AuthorDocument,
  AuthorDocumentError,
} from '../../core/author-documents-client';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { PlatformThemeService } from '../../core/platform-theme';
import { StudyPlanAccount } from '../study-plan/study-plan-account';

@Component({ selector: 'app-platform-header', template: '' })
class HeaderStub {}
const reference: AuthorDocument = {
  id: 'operations-reference',
  title: 'Operations reference',
  version: 'operations/test.1',
  sourceSha256: 'b'.repeat(64),
  htmlSha256: 'a'.repeat(64),
  href: `/bff/author/previews/preview-directory/author-documents/operations-reference/${'a'.repeat(64)}/index.html`,
  owningTicket: 'DLV-922',
  scope: 'Read-only reference',
  decisionDependencies: [],
  remainingDecisions: [],
  evidence: [{ label: 'Evidence', href: 'https://example.test/evidence' }],
  sections: [{ title: 'Repositories & Runbooks', anchor: 'repositories-runbooks' }],
  references: [
    { label: 'Repository', href: 'https://github.com/example/repository' },
    {
      label: 'Startup runbook',
      href: 'https://github.com/example/infra/blob/main/docs/startup.md',
    },
  ],
};
describe('Operations author view', () => {
  const account = signal<any>({ accountId: 'author', authorPreview: true });
  const sessionExpired = signal(false),
    theme = signal<'light' | 'dark'>('light');
  let load: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    account.set({ accountId: 'author', authorPreview: true });
    sessionExpired.set(false);
    theme.set('light');
    load = vi.fn().mockResolvedValue(reference);
    TestBed.configureTestingModule({
      imports: [AuthorOperationsPage],
      providers: [
        provideRouter([]),
        { provide: AUTHOR_DOCUMENTS_CLIENT, useValue: { load } },
        { provide: StudyPlanAccount, useValue: { account, sessionExpired } },
        { provide: PlatformThemeService, useValue: { selected: theme } },
      ],
    }).overrideComponent(AuthorOperationsPage, {
      remove: { imports: [PlatformHeader] },
      add: { imports: [HeaderStub] },
    });
  });
  async function create() {
    const fixture = TestBed.createComponent(AuthorOperationsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  it('embeds the immutable reference in a scripts-only sandbox and follows theme changes', async () => {
    const fixture = await create();
    const frame = fixture.nativeElement.querySelector('iframe');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('src')).toBe(reference.href + '?theme=light&layout=shared');
    theme.set('dark');
    fixture.detectChanges();
    expect(frame.getAttribute('src')).toBe(reference.href + '?theme=dark&layout=shared');
    expect(fixture.nativeElement.textContent).toContain('not live service health');
    expect(fixture.nativeElement.textContent).toContain('Reference version: operations/test.1');
    expect(fixture.nativeElement.querySelector('.reference-toolbar a').textContent).toContain(
      'Open full reference (new tab)',
    );
    expect(fixture.nativeElement.querySelectorAll('.workspace-content button')).toHaveLength(0);
  });
  it('loads the dedicated Local setup document through the same protected reader', async () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { data: { authorDocument: 'local-development' } } },
    });
    const localReference = {
      ...reference,
      id: 'local-development',
      href: reference.href.replaceAll('operations-reference', 'local-development'),
    };
    load.mockResolvedValue(localReference);
    const fixture = await create();
    expect(load).toHaveBeenCalledWith('local-development');
    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Local setup & development');
    expect(fixture.nativeElement.querySelector('iframe').getAttribute('src')).toBe(
      localReference.href + '?theme=light&layout=shared',
    );
    expect(
      fixture.nativeElement.querySelector(
        'a[href="/author/local-development"][aria-current="page"]',
      ),
    ).not.toBeNull();
  });
  it('keeps a section deep link on the protected parent page', async () => {
    const previousUrl = location.pathname + location.search + location.hash;
    history.replaceState(null, '', '/author/operations#repositories-runbooks');
    try {
      const fixture = await create();
      expect(fixture.nativeElement.querySelector('iframe').getAttribute('src')).toBe(
        reference.href + '?theme=light&layout=shared',
      );
      const link = fixture.nativeElement.querySelector('.heading-outline a');
      expect(link.getAttribute('href')).toBe('/author/operations#repositories-runbooks');
      expect(link.getAttribute('target')).toBeNull();
    } finally {
      history.replaceState(null, '', previousUrl);
    }
  });
  it('sends an outline selection to the embedded document without opening another window', async () => {
    const previousUrl = location.pathname + location.search + location.hash;
    history.replaceState(null, '', '/author/operations');
    try {
      const fixture = await create();
      const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
      const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
      const link = fixture.nativeElement.querySelector('.heading-outline a') as HTMLAnchorElement;
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(postMessage).toHaveBeenCalledWith(
        {
          type: 'lookahead:author-document:anchor-request',
          version: 1,
          documentId: 'operations-reference',
          anchor: 'repositories-runbooks',
        },
        '*',
      );
    } finally {
      history.replaceState(null, '', previousUrl);
    }
  });
  it('keeps external references in the trusted parent with explicit new-tab labels', async () => {
    const fixture = await create();
    const link = fixture.nativeElement.querySelector('a[href$="/docs/startup.md"]');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(link.textContent).toContain('(new tab)');
    expect(fixture.nativeElement.querySelector('#runbooks-links')).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('a[href="https://github.com/example/repository"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#runbooks-heading').textContent).toBe(
      'Source repositories and runbooks',
    );
    expect(fixture.nativeElement.querySelector('#supporting-references')).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('a[href="/author/operations#runbooks-links"]'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('a[href="/author/operations#supporting-references"]'),
    ).toBeNull();
  });
  it('sizes the shared document from a validated sandbox message', async () => {
    const fixture = await create();
    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
    const sendHeight = (
      origin: string,
      data: unknown,
      source: MessageEventSource | null = frame.contentWindow,
    ) => {
      window.dispatchEvent(new MessageEvent('message', { origin, source, data }));
      fixture.detectChanges();
    };
    const height = {
      type: 'lookahead:author-document:height',
      version: 1,
      documentId: 'operations-reference',
      height: 1824.2,
    };
    sendHeight('null', height, window);
    sendHeight('https://example.test', height);
    sendHeight('null', { ...height, documentId: 'other-document' });
    sendHeight('null', { ...height, height: 50_000 });
    expect(frame.style.height).toBe('');
    sendHeight('null', height);
    expect(frame.style.height).toBe('1825px');
    account.set({ accountId: 'author', authorPreview: false });
    fixture.detectChanges();
    sendHeight('null', { ...height, height: 2500 });
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
  });
  it.each(['expired', 'revoked'] as const)(
    'removes the iframe and links when access is %s',
    async (reason) => {
      const fixture = await create();
      if (reason === 'expired') sessionExpired.set(true);
      else account.set({ accountId: 'author', authorPreview: false });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
      expect(fixture.nativeElement.querySelector('a[target="_blank"]')).toBeNull();
    },
  );
  it('does not fetch private documents for learners', async () => {
    account.set({ accountId: 'learner', authorPreview: false });
    const fixture = await create();
    expect(load).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Author access required');
  });
  it('shows missing publication honestly and retries only on request', async () => {
    load.mockRejectedValueOnce(new AuthorDocumentError('unpublished'));
    const fixture = await create();
    expect(load).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('not published yet');
    fixture.nativeElement.querySelector('.workspace-content button').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(load).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('iframe')).not.toBeNull();
  });
});
