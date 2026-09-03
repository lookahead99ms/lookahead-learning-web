import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { StudyPlanPage } from './study-plan';

describe('StudyPlanPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'study-plan', component: StudyPlanPage }]),
        { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
      ],
    }).compileComponents();
  });

  it('shows the same duration and availability that will be used to build the plan', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/study-plan', StudyPlanPage);
    harness.detectChanges();

    const controls = harness.routeNativeElement?.querySelectorAll('select');
    expect((controls?.[0] as HTMLSelectElement).value).toBe('30');
    expect((controls?.[1] as HTMLSelectElement).value).toBe('5');
  });

  it('restores visible controls from URL-backed plan settings', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/study-plan?days=120&hours=3&topics=dsa&access=dsa',
      StudyPlanPage,
    );
    harness.detectChanges();

    const controls = harness.routeNativeElement?.querySelectorAll('select');
    expect((controls?.[0] as HTMLSelectElement).value).toBe('120');
    expect((controls?.[1] as HTMLSelectElement).value).toBe('3');
  });
});
