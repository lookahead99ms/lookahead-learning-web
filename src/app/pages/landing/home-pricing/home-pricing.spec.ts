import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomePricing } from './home-pricing';

describe('Home pricing', () => {
  it('marks every price as a price figure, so DEV can blur it until hovered (user, 2026-11-03)', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(HomePricing);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const amounts = [...root.querySelectorAll('.amount')];
    expect(amounts.length).toBeGreaterThan(0);
    for (const amount of amounts) expect(amount.classList).toContain('price-figure');
    for (const compared of root.querySelectorAll('.compared')) expect(compared.classList).toContain('price-figure');
    expect(root.querySelector('.passes .price-figure')?.textContent).toMatch(/^\$\d/);
    // The words around a price stay readable.
    expect(root.querySelector('.passes')?.textContent).toContain('paid once');
  });
});
