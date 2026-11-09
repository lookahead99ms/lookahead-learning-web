import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import { TestBed } from '@angular/core/testing';
import { AuthorAdminMenu } from './author-admin-menu';
import { AuthorWorkspacePageId } from './author-workspace-links';

function render(pageId: AuthorWorkspacePageId | null, documentationOnly = false) {
  TestBed.inject(StudyPlanAccount).account.set({accountId: 'owner', username: 'owner', displayName: 'Owner', topicGrants: [], authorPreview: true});
  const fixture = TestBed.createComponent(AuthorAdminMenu);
  fixture.componentRef.setInput('pageId', pageId);
  fixture.componentRef.setInput('documentationOnly', documentationOnly);
  fixture.detectChanges();
  return fixture;
}

const hrefs = (root: HTMLElement, selector: string) =>
  [...root.querySelectorAll<HTMLAnchorElement>(selector)].map((link) => link.getAttribute('href'));

describe('AuthorAdminMenu', () => {
  it('lists the admin pages and marks the open one', () => {
    const root = render('delivery').nativeElement as HTMLElement;
    expect(hrefs(root, 'nav[aria-label="Admin navigation"] a')).toEqual([
      '/admin/docs',
      '/delivery-plan',
      '/admin/feedback',
      '/admin/access',
      '/admin/previews',
    ]);
    expect(root.querySelector('[aria-current="page"] span:last-child')?.textContent).toBe(
      'Delivery Plan',
    );
  });

  it.each(['previews', 'delivery', 'docs'] as const)(
    'shows no documentation pages on %s',
    (pageId) => {
      const root = render(pageId).nativeElement as HTMLElement;
      expect(root.querySelector('.documentation-links')).toBeNull();
      expect(root.textContent).not.toContain('Documentation pages');
    },
  );

  it('lists only documentation pages in the separate documentation rail', () => {
    const root = render('screen-names', true).nativeElement as HTMLElement;
    expect(hrefs(root, '.documentation-links a')).toEqual([
      '/admin/screen-names',
      '/admin/access-checks',
      '/admin/plans',
      '/admin/review-guide',

    ]);
    expect(
      [...root.querySelectorAll('.documentation-group-label')].map((label) =>
        label.textContent?.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['🧭 Overview']);
    expect(hrefs(root, '[aria-current="page"]')).toEqual(['/admin/screen-names']);
    // Documentation is the current section, not the current page.
    expect(root.querySelector('nav[aria-label="Admin navigation"]')).toBeNull();
    const left = render('screen-names').nativeElement as HTMLElement;
    expect(hrefs(left, '[aria-current="true"]')).toEqual(['/admin/docs']);
    expect(left.querySelector('.documentation-links')).toBeNull();
  });

  it.each([
    ['contracts', ['Contracts', 'Release gates', 'AWS deployment']],
    ['local-api', ['Local setup & development', 'API client setup']],
    ['api', ['API reference']],
  ] as const)('limits the %s right rail to its group', (pageId, labels) => {
    const root = render(pageId, true).nativeElement as HTMLElement;
    const links = [...root.querySelectorAll<HTMLAnchorElement>('.documentation-links a')];
    for (const label of labels) expect(links.some(link => link.textContent?.includes(label))).toBe(true);
    expect(links.some(link => link.href.endsWith('/admin/review-guide'))).toBe(false);
  });

  it("nests the open section's sub-pages under their parent and marks the parent as the section", () => {
    const root = render('aws-dev-budget', true).nativeElement as HTMLElement;
    const parent = root.querySelector<HTMLAnchorElement>('.documentation-links a[href="/admin/aws-deployment"]')!;
    expect(parent.getAttribute('aria-current')).toBe('true');
    const nested = parent.closest('li')!.querySelector('.subpages')!;
    expect(nested.getAttribute('aria-label')).toBe('AWS deployment pages');
    expect(hrefs(nested as HTMLElement, 'a')).toEqual([
      '/admin/aws-environment-journey',
      '/admin/aws-dev-plan',
      '/admin/aws-dev-decisions',
      '/admin/aws-dev-operations',
      '/admin/aws-dev-certificates',
      '/admin/aws-dev-permissions',
      '/admin/aws-dev-budget',
      '/admin/aws-dev-status',
      '/admin/aws-dev-setup',
      '/admin/aws-dev-workflow',
      '/admin/aws-dev-procedures',
      '/admin/aws-dev-records',
      '/admin/aws-candidate-design',
      '/admin/aws-candidate-files',
      '/admin/aws-candidate-commands',
      '/admin/aws-candidate-updates',
    ]);
    expect(hrefs(root, '[aria-current="page"]')).toEqual(['/admin/aws-dev-budget']);
    // Other sections stay collapsed to their parent link.
    expect(root.querySelectorAll('.subpages')).toHaveLength(1);
  });

  it("shows a section's sub-pages on its parent page too", () => {
    const root = render('production-support', true).nativeElement as HTMLElement;
    expect(hrefs(root, '.subpages a')).toEqual(['/admin/support-runbooks']);
    expect(hrefs(root, '[aria-current="page"]')).toEqual(['/admin/production-support']);
  });

  it('keeps icons decorative and collapses behind its Admin toggle', () => {
    const fixture = render('operations');
    const root = fixture.nativeElement as HTMLElement;
    for (const icon of root.querySelectorAll('.item-icon'))
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    const toggle = root.querySelector('app-sidebar-toggle button') as HTMLButtonElement;
    expect(toggle.textContent).toContain('Admin');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const content = root.querySelector(`#${toggle.getAttribute('aria-controls')}`) as HTMLElement;
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(content.hidden).toBe(true);
    expect(render('operations').nativeElement.querySelector('.admin-menu-content').id).not.toBe(
      content.id,
    );
  });
});

describe('AuthorAdminMenu on a narrow screen', () => {
  it('starts collapsed so the page content comes first', () => {
    const matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList);
    vi.stubGlobal('matchMedia', matchMedia);
    try {
      const root = render('screen-names').nativeElement as HTMLElement;
      const toggle = root.querySelector('app-sidebar-toggle button') as HTMLButtonElement;
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect((root.querySelector('.admin-menu-content') as HTMLElement).hidden).toBe(true);
      expect(matchMedia).toHaveBeenCalledWith('(max-width: 900px)');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
