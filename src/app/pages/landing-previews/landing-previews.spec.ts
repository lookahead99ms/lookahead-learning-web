import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { LandingPreview1 } from './preview-1/preview-1';
import { LandingPreview2 } from './preview-2/preview-2';
import { LandingPreview3 } from './preview-3/preview-3';
import { LandingPreview4 } from './preview-4/preview-4';
import { LandingPreview5 } from './preview-5/preview-5';
import { LandingPreview6 } from './preview-6/preview-6';
import { LandingPreview7 } from './preview-7/preview-7';

const previews: Type<unknown>[] = [LandingPreview1, LandingPreview2, LandingPreview3,
  LandingPreview4, LandingPreview5, LandingPreview6, LandingPreview7];

for (const [index, preview] of previews.entries()) {
  describe(`Landing preview ${index + 1} interaction contract`, () => {
    let fixture: ComponentFixture<unknown>;
    let root: HTMLElement;
    let motion: EventTarget & { matches: boolean };
    let hidden: boolean;
    beforeEach(async () => {
      hidden = false;
      vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
      motion = Object.assign(new EventTarget(), { matches: false });
      vi.stubGlobal('matchMedia', vi.fn(() => motion));
      await TestBed.configureTestingModule({
        imports: [preview],
        providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
          { provide: ContentService, useValue: { getSearchIndex: () => of([]) } }],
      }).compileComponents();
      vi.useFakeTimers();
    });
    afterEach(() => {
      fixture?.destroy();
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });
    function render() {
      fixture = TestBed.createComponent(preview);
      fixture.detectChanges();
      root = fixture.nativeElement;
    }
    function button(label: string) {
      const found = root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      expect(found, label).not.toBeNull();
      return found!;
    }
    function selected() {
      return root.querySelector('.hero-slide.active')?.getAttribute('aria-label');
    }
    function click(label: string) {
      button(label).click();
      fixture.detectChanges();
    }
    it('renders distinct labelled slides and wraps previous/next navigation', () => {
      render();
      const labels = [...root.querySelectorAll('.hero-slide')].map(el => el.getAttribute('aria-label'));
      expect(labels.length).toBeGreaterThanOrEqual(5);
      expect(new Set(labels).size).toBe(labels.length);
      expect(selected()).toBe(labels[0]);
      click('Previous hero slide');
      expect(selected()).toBe(labels.at(-1));
      click('Next hero slide');
      expect(selected()).toBe(labels[0]);
      click('Next hero slide');
      expect(selected()).toBe(labels[1]);
      const tabs = [...root.querySelectorAll<HTMLButtonElement>('button[aria-label^="Show slide"]')];
      expect(tabs).toHaveLength(labels.length);
      tabs.at(-1)!.click(); fixture.detectChanges();
      expect(selected()).toBe(labels.at(-1));
      expect(tabs.at(-1)!.getAttribute('aria-pressed')).toBe('true');
      expect(root.querySelector('a[href="/study-plan"]')).not.toBeNull();
    });
    it('pauses automatic rotation while preserving manual navigation and resumes explicitly', () => {
      render();
      click('Pause slideshow');
      expect(button('Play slideshow').disabled).toBe(false);
      const first = selected();
      vi.advanceTimersByTime(12000); fixture.detectChanges();
      expect(selected()).toBe(first);
      click('Next hero slide');
      expect(selected()).not.toBe(first);
      click('Play slideshow');
      expect(button('Pause slideshow').disabled).toBe(false);
    });
    it('respects reduced motion and removes event listeners on destruction', () => {
      motion.matches = true;
      const remove = vi.spyOn(motion, 'removeEventListener');
      const removeDocument = vi.spyOn(document, 'removeEventListener');
      render();
      expect(root.querySelector<HTMLButtonElement>('button[aria-label$="slideshow"]')?.disabled).toBe(true);
      const first = selected();
      vi.advanceTimersByTime(12000); fixture.detectChanges();
      expect(selected()).toBe(first);
      click('Next hero slide');
      expect(selected()).not.toBe(first);
      motion.matches = false;
      motion.dispatchEvent(Object.assign(new Event('change'), { matches: false }));
      fixture.detectChanges();
      expect(root.querySelector<HTMLButtonElement>('button[aria-label$="slideshow"]')?.disabled).toBe(false);
      hidden = true; document.dispatchEvent(new Event('visibilitychange')); fixture.detectChanges();
      const beforeHidden = selected();
      vi.advanceTimersByTime(12000); fixture.detectChanges();
      expect(selected()).toBe(beforeHidden);
      hidden = false; document.dispatchEvent(new Event('visibilitychange')); fixture.detectChanges();
      fixture.destroy();
      expect(remove).toHaveBeenCalledWith('change', expect.any(Function));
      expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });
  });
}
