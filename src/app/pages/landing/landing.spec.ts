import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { Landing } from './landing';

describe('Landing', () => {
  it('opens the delivery board from the landing-page shortcut', async () => {
    await TestBed.configureTestingModule({
      imports: [Landing],
      providers: [
        provideRouter([{ path: 'delivery-plan', component: Landing }]),
        { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector(
      '.hero-resource-links a[href="/delivery-plan"]',
    ) as HTMLAnchorElement;

    expect(link.textContent?.trim()).toBe('Delivery plan');
    link.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/delivery-plan');
  });
});
