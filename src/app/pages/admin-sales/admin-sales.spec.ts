import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { SalePreview } from '../../content/sale-preview';
import { AdminSalesPage } from './admin-sales';

@Component({ selector: 'app-platform-header', template: '' })
class HeaderStub {}

describe('Sales and prices (admin preview, DLV-209)', () => {
  let root: HTMLElement;
  let fixture: ReturnType<typeof TestBed.createComponent<AdminSalesPage>>;
  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: StudyPlanAccount,
          useValue: {
            account: signal({ accountId: 'author', username: 'author', displayName: 'Author', topicGrants: [], authorPreview: true }),
            sessionExpired: signal(false),
          },
        },
      ],
    }).overrideComponent(AdminSalesPage, { remove: { imports: [PlatformHeader] }, add: { imports: [HeaderStub] } });
    fixture = TestBed.createComponent(AdminSalesPage);
    fixture.detectChanges();
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });
  const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('says plainly that everything is a preview on this browser', () => {
    expect(text(root.querySelector('.status-note'))).toContain('everything here stays on this browser');
    expect(text(root.querySelector('#sale'))).toContain('No sale is running.');
    expect([...root.querySelectorAll('.template-option strong')].map(text)).toEqual([
      'Holiday sale', 'Spring sale', 'Graduation sale', 'Engineer’s Day sale',
    ]);
  });

  it('starts and stops a sale preview with the chosen greeting and plans', () => {
    const graduation = [...root.querySelectorAll<HTMLInputElement>('input[name="sale-template"]')][2];
    graduation.click();
    fixture.detectChanges();
    const monthly = root.querySelector<HTMLInputElement>('.check-row input')!;
    monthly.click();
    fixture.detectChanges();
    [...root.querySelectorAll<HTMLButtonElement>('button')].find((button) => text(button) === 'Start sale preview')!.click();
    fixture.detectChanges();
    const sale = TestBed.inject(SalePreview).activeSale()!;
    expect(sale.template.name).toBe('Graduation sale');
    expect(sale.greeting).toBe('Happy graduation');
    expect(sale.planIds).toEqual(['annual-promo', 'interview-pass-promo']);
    expect(text(root.querySelector('.sale-state.running'))).toContain('Graduation sale preview is on');
    [...root.querySelectorAll<HTMLButtonElement>('button')].find((button) => text(button) === 'Stop sale preview')!.click();
    fixture.detectChanges();
    expect(TestBed.inject(SalePreview).activeSale()).toBeNull();
  });

  it('previews a price change and resets it', () => {
    const input = root.querySelector<HTMLInputElement>('tr[data-plan="complete"] input')!;
    input.value = '249.99';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(TestBed.inject(SalePreview).plans().find((plan) => plan.id === 'complete')!.priceCents).toBe(24999);
    input.value = 'abc';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(text(root.querySelector('.notice'))).toBe('Enter a price such as 59.99.');
    [...root.querySelectorAll<HTMLButtonElement>('button')].find((button) => text(button) === 'Reset all prices')!.click();
    expect(TestBed.inject(SalePreview).plans().find((plan) => plan.id === 'complete')!.priceCents).toBe(27999);
  });
});
