import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { MembershipApi } from '../../content/membership-api';
import { PLANS } from '../../content/membership-plans';
import { SalePreview } from '../../content/sale-preview';
import { AdminSalesPage } from './admin-sales';

@Component({ selector: 'app-platform-header', template: '' })
class HeaderStub {}

describe('Sales and prices (admin preview, DLV-209)', () => {
  let sale: unknown=null;
  let api: {plans: ReturnType<typeof signal<typeof PLANS>>; request: ReturnType<typeof vi.fn>; refresh: ReturnType<typeof vi.fn>};
  let root: HTMLElement;
  let fixture: ReturnType<typeof TestBed.createComponent<AdminSalesPage>>;
  beforeEach(async () => {
    sale=null;
    api={plans:signal(PLANS),refresh:vi.fn(async()=>{}),request:vi.fn(async(path:string,body?:any)=>{
      if(path==='/sales/active')return sale;
      if(path==='/admin/sales'){sale={id:'sale-1',...body};return sale;}
      if(path.endsWith('/stop')){sale=null;return {};}
      if(path.endsWith('/price')){api.plans.set(PLANS.map(p=>p.id==='complete'?{...p,priceCents:body.priceCents}:p));return {};}
      throw new Error('Unexpected path');
    })};
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {provide:MembershipApi,useValue:api},
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

  it('says sales are server-backed and payments simulated', () => {
    expect(text(root.querySelector('.status-note'))).toContain('stored on the local server');
    expect(text(root.querySelector('#sale'))).toContain('No sale is running.');
    expect([...root.querySelectorAll('.template-option strong')].map(text)).toEqual([
      'Holiday sale', 'Spring sale', 'Graduation sale', 'Engineer’s Day sale',
    ]);
  });

  it('starts and stops a server sale with explicit dates', async () => {
    Object.assign(fixture.componentInstance,{startsAt:'2026-10-15T00:00',endsAt:'2026-10-20T00:00'});
    const graduation = [...root.querySelectorAll<HTMLInputElement>('input[name="sale-template"]')][2];
    graduation.click();
    fixture.detectChanges();
    const monthly = root.querySelector<HTMLInputElement>('.check-row input')!;
    monthly.click();
    fixture.detectChanges();
    Object.assign(fixture.componentInstance,{startsAt:'2026-10-15T00:00',endsAt:'2026-10-20T00:00'});
    await (fixture.componentInstance as any).startSale();
    fixture.detectChanges();
    await fixture.whenStable();fixture.detectChanges();
    const sale = TestBed.inject(SalePreview).activeSale()!;
    expect(sale.template.name).toBe('Graduation sale');
    expect(sale.greeting).toBe('Happy graduation');
    expect(sale.planIds).toEqual(['annual-promo', 'interview-pass-promo']);
    expect(text(root.querySelector('.sale-state.running'))).toContain('Graduation sale is active');
    await (fixture.componentInstance as any).stopSale();
    fixture.detectChanges();
    await fixture.whenStable();fixture.detectChanges();
    expect(TestBed.inject(SalePreview).activeSale()).toBeNull();
  });

  it('stores a price change and rejects invalid input', async () => {
    const input = root.querySelector<HTMLInputElement>('tr[data-plan="complete"] input')!;
    input.value = '249.99';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();fixture.detectChanges();
    expect(TestBed.inject(SalePreview).plans().find((plan) => plan.id === 'complete')!.priceCents).toBe(24999);
    input.value = 'abc';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(text(root.querySelector('.notice'))).toBe('Enter a price such as 59.99.');
    expect(api.request).toHaveBeenCalledWith('/admin/membership/plans/complete/price',{priceCents:24999});
  });
});
