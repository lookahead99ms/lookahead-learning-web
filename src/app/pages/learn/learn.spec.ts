import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { Learn } from './learn';

describe('Learn catalog routing', () => {
  it('opens a course overview even when the catalog provides a direct entry lesson', async () => {
    await TestBed.configureTestingModule({
      imports: [Learn],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(convertToParamMap({ group: 'data-structures-algorithms' })),
          },
        },
        {
          provide: ContentService,
          useValue: {
            getCatalog: () =>
              of([
                {
                  id: 'sorting-searching',
                  title: 'Sorting and Searching',
                  description: 'Order data and reduce the search space.',
                  entryContentId: 'sorting-searching-foundation-article',
                  available: true,
                },
              ]),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(Learn);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector(
      '#sorting-searching',
    ) as HTMLAnchorElement | null;
    expect(card?.getAttribute('href')).toBe('/learn/sorting-searching');
  });
});
