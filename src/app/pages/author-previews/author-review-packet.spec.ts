import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthorReviewPacket } from './author-review-packet';
import { AuthorDocumentsApi } from '../../core/author-documents-api';
import { PlatformThemeService } from '../../core/platform-theme';
import { StudyPlanAccount } from '../study-plan/study-plan-account';

const packet = {
  id: 'study-plan-review',
  title: 'Versioned Study Plan packet',
  version: 'review/test.1',
  htmlSha256: 'a'.repeat(64),
  href: `/bff/author/previews/preview-directory/author-documents/study-plan-review/${'a'.repeat(64)}/index.html`,
  owningTicket: 'DLV-704',
  scope: 'The published review scope',
  decisionDependencies: ['DLV-921'],
  remainingDecisions: ['Review the published recovery evidence'],
  evidence: [{ label: 'Review evidence', href: 'https://example.test/evidence' }],
  sections: [],
  references: [],
};
describe('Study Plan review packet', () => {
  const account = signal<any>({ accountId: 'author', authorPreview: true });
  const sessionExpired = signal(false),
    theme = signal('light');
  let load: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    account.set({ accountId: 'author', authorPreview: true });
    sessionExpired.set(false);
    theme.set('light');
    load = vi.fn().mockResolvedValue(packet);
    TestBed.configureTestingModule({
      imports: [AuthorReviewPacket],
      providers: [
        provideRouter([]),
        { provide: AuthorDocumentsApi, useValue: { load } },
        { provide: StudyPlanAccount, useValue: { account, sessionExpired } },
        { provide: PlatformThemeService, useValue: { selected: theme } },
      ],
    });
  });
  async function create(expanded = false) {
    const fixture = TestBed.createComponent(AuthorReviewPacket);
    fixture.componentRef.setInput('expanded', expanded);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  it('shows exact private metadata and a review link without embedding or recording from the card', async () => {
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain(packet.version);
    expect(fixture.nativeElement.textContent).toContain(packet.scope);
    expect(fixture.nativeElement.textContent).toContain(packet.remainingDecisions[0]);
    expect(
      fixture.nativeElement.querySelector('a[href="/author/previews/study-plan"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
  it('keeps trusted controls outside the scripts-only document and follows the selected theme', async () => {
    const fixture = await create(true);
    const frame = fixture.nativeElement.querySelector('iframe');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.src).toContain('?theme=light');
    expect(fixture.nativeElement.querySelector('app-author-review-controls')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('not connected yet');
    theme.set('dark');
    fixture.detectChanges();
    expect(frame.src).toContain('?theme=dark');
  });
  it('does not load documents without author capability and removes a loaded frame on expiry', async () => {
    account.set({ accountId: 'learner', authorPreview: false });
    const first = await create();
    expect(load).not.toHaveBeenCalled();
    first.destroy();
    account.set({ accountId: 'author', authorPreview: true });
    const fixture = await create(true);
    sessionExpired.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-author-review-controls')).toBeNull();
  });
});
