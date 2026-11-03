import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { PageSidebarContext } from '../../core/page-sidebars/page-sidebar-context';
import { WelcomePage } from './welcome';

function render(query: Record<string, string>) {
  TestBed.configureTestingModule({
    imports: [WelcomePage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
      { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(query)), snapshot: { queryParamMap: convertToParamMap(query) } } },
    ],
  });
  const fixture = TestBed.createComponent(WelcomePage);
  fixture.detectChanges();
  return fixture;
}

describe('WelcomePage', () => {
  it('shows the header, the waiting notice, the Essence and the footer for ?access=pending', () => {
    const fixture = render({ access: 'pending' });
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('app-platform-header')).not.toBeNull();
    const notice = root.querySelector('aside.access-pending');
    expect(notice?.getAttribute('role')).toBe('status');
    expect(notice?.querySelector('h2')?.textContent?.trim()).toBe('Your sign-in worked');
    expect(notice?.querySelector('p')?.textContent?.trim()).toBe(
      'The owner has to approve your access before you can use Look Ahead. Sign in again once you hear back.',
    );
    const main = root.querySelector('main#main-content.welcome-page');
    expect([...(main?.children ?? [])].map((child) => child.tagName.toLowerCase())).toEqual(['aside', 'section', 'footer']);
    expect(main?.querySelector('section.brand-story.home-essence app-wordmark-key')).not.toBeNull();
    // The Essence starts on load here, not after a scroll as on the homepage (user, 2026-11-03).
    const story = fixture.debugElement.query((node) => node.name === 'section' && node.nativeElement.classList.contains('home-essence'));
    expect(story.componentInstance.autoplay()).toBe(true);
    expect(root.querySelector('.welcome-footer p')?.textContent?.trim()).toBe('Learn. Grow. Blaze.');
    expect(root.querySelectorAll('.welcome-footer .footer-statements > *')).toHaveLength(2);
  });

  it('shows only the Essence without the query, with no side navigation and no content requests', () => {
    const fixture = render({});
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.access-pending')).toBeNull();
    expect(root.querySelector('section.home-essence')).not.toBeNull();
    expect(TestBed.inject(PageSidebarContext).value()?.excluded).toBe(true);
    const http = TestBed.inject(HttpTestingController);
    expect(http.match((request) => request.url.includes('/content/'))).toHaveLength(0);
  });

  it('says it is Look Ahead DEV for invited members while the DEV gate answers, admitted or not', () => {
    for (const mode of ['gated', 'admitted'] as const) {
      TestBed.resetTestingModule();
      const fixture = render({ access: 'pending' });
      const session = TestBed.inject(DevSession);
      if (mode === 'gated') session.gated.set(true);
      else session.status.set({ dev: true, deadline: '', warning: false, maintenance: false });
      fixture.detectChanges();
      const notice: HTMLElement = fixture.nativeElement.querySelector('aside.access-pending');
      expect(notice.querySelector('h2')?.textContent?.trim()).toBe('Your sign-in worked');
      expect(notice.querySelector('p')?.textContent?.trim()).toBe(
        'This is Look Ahead DEV, our internal preview for invited members. The owner approves each person before DEV opens. Sign in again once you hear back.',
      );
    }
  });

  it('ignores any other access value', () => {
    const root: HTMLElement = render({ access: 'granted' }).nativeElement;
    expect(root.querySelector('.access-pending')).toBeNull();
  });
});
