import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { AuthorPage } from './author';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { ContentService } from '../../content/content.service';

describe('AuthorPage', () => {
  it('links each state to the right owned plan and offers every core surface', async () => {
    await TestBed.configureTestingModule({
      imports: [AuthorPage],
      providers: [
        provideRouter([]),
        { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
        {
          provide: StudyPlanAccount,
          useValue: {
            account: signal({ authorPreview: true, displayName: 'Author' }),
            sessionExpired: signal(false),
            initialize: async () => {},
            plans: signal([
              { planId: 'saved', goal: 'Author sample · Saved plan', revision: 1 },
              { planId: 'revised', goal: 'Author sample · Revised plan', revision: 3 },
            ]),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AuthorPage);
    fixture.detectChanges();
    const links = [...fixture.nativeElement.querySelectorAll('main a')] as HTMLAnchorElement[];
    expect(links).toHaveLength(14);
    expect(
      links.find((a) => a.textContent?.includes('Revised plan and recall'))?.getAttribute('href'),
    ).toContain('plan=revised');
    expect(
      links.find((a) => a.textContent?.includes('Saved plan'))?.getAttribute('href'),
    ).toContain('plan=saved');
    expect(
      links.find((a) => a.textContent?.includes('Review a draft'))?.getAttribute('href'),
    ).toContain('authorView=draft');
    expect(fixture.nativeElement.textContent).toContain('Sample plans belong to this account');
  });
});
