import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
  evidence: [],
  sections: [{ title: 'Repositories', anchor: 'repositories' }],
  references: [{ label: 'Repository', href: 'https://example.test/repository' }],
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
    expect(frame.getAttribute('src')).toBe(reference.href + '?theme=light');
    theme.set('dark');
    fixture.detectChanges();
    expect(frame.getAttribute('src')).toBe(reference.href + '?theme=dark');
    expect(fixture.nativeElement.textContent).toContain('not live service health');
    expect(fixture.nativeElement.querySelectorAll('button')).toHaveLength(0);
  });
  it('keeps external references in the trusted parent with explicit new-tab labels', async () => {
    const fixture = await create();
    const link = fixture.nativeElement.querySelector('a[href="https://example.test/repository"]');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(link.textContent).toContain('(new tab)');
    expect(fixture.nativeElement.querySelector('details').open).toBe(false);
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
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(load).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('iframe')).not.toBeNull();
  });
});
