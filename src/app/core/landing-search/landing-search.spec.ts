import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { SearchDocument } from '../../content/content.models';
import { LandingSearch } from './landing-search';

describe('LandingSearch topic suggestions', () => {
  const urlShortener: SearchDocument = {
    id: 'learn:solid-design-patterns:lld-url-shortener',
    contentId: 'lld-url-shortener',
    path: 'learn',
    courseId: 'solid-design-patterns',
    courseTitle: 'Object-Oriented Design and SOLID',
    moduleId: 'lld-practice',
    moduleTitle: 'Low-Level Design Practice',
    title: 'Design a URL Shortener at the LLD Level',
    contentType: 'q-and-a',
    discoveryKind: 'practice',
    practiceFormat: 'explain',
    subjects: ['Reusable Platform Components LLD'],
    tags: ['Low-Level Design', 'URL Shortener', 'Repository'],
    filterTags: ['Learn', 'Q&A'],
    languages: ['java'],
    difficulty: 'Intermediate',
    preview: '',
    access: { tier: 'free' },
    searchableText: 'design a url shortener at the lld level url shortener repository',
    route: ['/', 'learn', 'solid-design-patterns', 'lld-url-shortener'],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingSearch],
      providers: [
        provideRouter([]),
        { provide: ContentService, useValue: { getSearchIndex: () => of([urlShortener]) } },
      ],
    }).compileComponents();
  });

  it('routes only curated subjects through the Search subject parameter', async () => {
    const fixture = TestBed.createComponent(LandingSearch);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('.landing-search-input') as HTMLInputElement;
    input.dispatchEvent(new FocusEvent('focus'));
    input.value = 'URL Shortener';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();

    const topicButtons = [
      ...(fixture.nativeElement.querySelectorAll(
        '.landing-search-result',
      ) as NodeListOf<HTMLButtonElement>),
    ].filter(
      (button) =>
        button.querySelector('.landing-search-result-type')?.textContent?.trim() === 'Topic',
    );
    expect(topicButtons.map((button) => button.textContent)).toEqual([
      expect.stringContaining('Reusable Platform Components LLD'),
    ]);
    expect(topicButtons.map((button) => button.textContent).join(' ')).not.toContain(
      'URL Shortener',
    );

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    topicButtons[0].click();
    expect(navigate).toHaveBeenCalledWith(['/search'], {
      queryParams: { tags: 'Reusable Platform Components LLD' },
    });
  });
});
