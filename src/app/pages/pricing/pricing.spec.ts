import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { PricingPage } from './pricing';
import { START_FREE_ROUTE } from './pricing-plans';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { MembershipApi } from '../../content/membership-api';
import { SalePreview } from '../../content/sale-preview';

const LEARNER = { accountId: 'learner', username: 'learner@example.test', displayName: 'Learner', topicGrants: [] };

@Component({ selector: 'app-platform-header', template: '' })
class HeaderStub {}

describe('Sample pricing page (DLV-209)', () => {
  let root: HTMLElement;
  let fixture: ReturnType<typeof TestBed.createComponent<PricingPage>>;

  beforeEach(async () => {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    TestBed.configureTestingModule({
      imports: [PricingPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.overrideComponent(PricingPage, {
      remove: { imports: [PlatformHeader] },
      add: { imports: [HeaderStub] },
    });
    // Most checks are for a signed-in learner; the signed-out and staff cases set their own account.
    TestBed.inject(StudyPlanAccount).account.set(LEARNER);
    fixture = TestBed.createComponent(PricingPage);
    fixture.detectChanges();
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });

  function text(element: Element | null): string {
    return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }
  function chooseButtons(): HTMLButtonElement[] {
    return [...root.querySelectorAll<HTMLButtonElement>('.plan-card button')];
  }

  it('says the prices are a sample, under one page heading', () => {
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(text(root.querySelector('.sample-note'))).toContain(
      'Local payment simulation.',
    );
    expect(root.querySelector('.sample-note')?.getAttribute('role')).toBe('note');
    expect([...root.querySelectorAll('h2')].map(text)).toEqual([
      'Free',
      'Yearly plans',
      'Passes',
      'Changing and renewing',
      'Mock interviews',
      'Questions',
      'Local payment simulation',
    ]);
  });

  it('lists what a free account gets and links to Start free', () => {
    const free = root.querySelector('.free-plan')!;
    expect([...free.querySelectorAll('.free-features strong')].map(text)).toEqual([
      'Open lessons',
      'Free with account lessons',
      'Search',
      'Study Plan builder',
    ]);
    expect(text(free.querySelector('.amount'))).toBe('$0');
    const start = free.querySelector('a.action-link')!;
    expect(text(start)).toBe('Start free');
    expect(start.getAttribute('href')).toBe(START_FREE_ROUTE);
  });

  it('renders the agreed plans with prices that read correctly', () => {
    const cards = [...root.querySelectorAll('.plan-grid > li')];
    expect(
      cards.map((card) => [
        text(card.querySelector('h3')),
        text(card.querySelector('.plan-price .visually-hidden')),
        text(card.querySelector('.plan-includes')),
      ]),
    ).toEqual([
      ['Learn', '$69.99 per year', 'Includes Learn'],
      ['Grow', '$99.99 per year', 'Includes Grow'],
      ['Advance', '$144.99 per year', 'Includes Learn + Grow'],
      ['Complete', '$279.99 per year', 'Includes Learn + Grow + Blaze'],
      ['Interview Sprint', '$99.99, one-time payment', 'Includes Learn + Grow + Blaze'],
      ['Course Pass', '$27.99 per course', 'Includes 1–3 courses you choose'],
    ]);
    // No sale is running, so no promo plan appears anywhere.
    expect(text(root)).not.toMatch(/Promo/);
    // The visual "$69.99 /year" is hidden from assistive technology in favour of the spoken price.
    for (const card of cards)
      for (const part of card.querySelectorAll('.amount, .period'))
        expect(part.getAttribute('aria-hidden')).toBe('true');
    expect(text(cards[4])).toContain('100 days of access');
    for (const card of cards) expect(text(card)).toContain('Manual renewal');
  });

  it('never says Pro, lifetime or automatic renewal', () => {
    const page = text(root);
    expect(page).not.toMatch(/\bPro\b|lifetime|for life|Founding/i);
    expect(page).not.toMatch(/renews (each|every) (month|year)|auto-renew|subscription|recurring/i);
    expect(page).toContain('Nothing renews or charges you automatically.');
    expect(page).toContain('We plan to remind you 7 to 10 days before your access ends.');
  });

  it('offers Choose only for plans whose terms are decided', () => {
    expect(chooseButtons().map(text)).toEqual([
      'Choose Learn',
      'Choose Grow',
      'Choose Advance',
      'Choose Complete',
      'Choose Interview Sprint',
    ]);
    const offSale = [...root.querySelectorAll('.plan-card.off-sale')];
    expect(offSale.map((card) => [card.getAttribute('data-plan'), text(card.querySelector('.off-sale-note'))])).toEqual([
      ['course-pass', 'Not on sale yet. Not decided yet: duration.'],
    ]);
    for (const card of offSale) expect(card.querySelector('button')).toBeNull();
    expect(root.querySelector('.plan-flag')).toBeNull();
    const learnPrice = root.querySelector(`#${chooseButtons()[0].getAttribute('aria-describedby')}`);
    expect(text(learnPrice?.querySelector('.visually-hidden') ?? null)).toBe('$69.99 per year');
  });

  it('explains upgrades, changes at renewal, manual renewal and discounts', () => {
    const rules = root.querySelector('.plan-rules')!;
    expect([...rules.querySelectorAll('dt')].map(text)).toEqual([
      'Upgrade any time',
      'Smaller or different plan at renewal',
      'Manual renewal',
      'Discounts',
    ]);
    expect(text(rules)).toContain('You pay the difference for the time left, and your end date stays the same.');
    expect(text(rules)).toContain('opens 7 days before your current plan ends');
    expect(text(rules)).toContain('Nothing renews or charges you automatically.');
    expect(text(rules)).toContain('never change the name of your plan');
  });

  it('shows mock interviews as coming later and sold one at a time, with nothing to buy', () => {
    const mock = root.querySelector('.mock-interviews')!;
    expect(text(mock.querySelector('.coming-later'))).toBe('Coming later');
    expect(text(mock)).toContain('Sold one at a time.');
    expect(text(mock)).toContain('Each mock interview is its own purchase.');
    expect(mock.querySelector('button, a')).toBeNull();
  });

  it('answers the launch questions', () => {
    const questions = [...root.querySelectorAll('.faq dt')].map(text);
    expect(questions).toContain('Which plan opens which lessons?');
    expect(questions).toContain('Does any plan renew automatically?');
    expect(questions).toContain('What happens to my study plans if my access ends?');
    expect(questions).toContain('Is there student or regional pricing?');
    const answers = text(root.querySelector('.faq dl'));
    expect(answers).toContain('Your study plans and progress stay in your account.');
    expect(answers).toContain('Paid lessons lock');
    expect(answers).toContain('It is planned.');
  });

  it('opens an honest notice from every Choose button and returns focus on Close', () => {
    const dialog = root.querySelector('dialog')!;
    expect(dialog.open).toBe(false);
    expect(dialog.getAttribute('aria-labelledby')).toBe('checkout-notice-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('checkout-notice-description');
    for (const button of chooseButtons()) {
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
      button.focus();
      button.click();
      fixture.detectChanges();
      expect(dialog.open).toBe(true);
      expect(text(dialog.querySelector('h2'))).toBe('Local payment simulation');
      expect(text(dialog.querySelector('#checkout-notice-description'))).toBe(
        'This creates a real local access record using a mock payment. No money is charged.',
      );
      expect(text(dialog.querySelector('.eyebrow'))).toContain(
        text(button).replace('Choose ', ''),
      );
      const close = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(b => text(b)==='Close')!;
      expect(text(close)).toBe('Close');
      expect(document.activeElement).toBe(close);
      close.click();
      fixture.detectChanges();
      expect(dialog.open).toBe(false);
      expect(document.activeElement).toBe(button);
    }
  });

  it('returns focus when Escape closes the notice, and links back to Start free and catalogs', () => {
    const annual = chooseButtons()[3];
    annual.click();
    fixture.detectChanges();
    const dialog = root.querySelector('dialog')!;
    expect(
      [...dialog.querySelectorAll('a')].map((link) => [text(link), link.getAttribute('href')]),
    ).toEqual([
      ['Start free', START_FREE_ROUTE],
      ['Learn', '/learn'],
      ['Grow', '/grow'],
      ['Blaze', '/blaze'],
    ]);
    // A native dialog closes itself on Escape and then fires "close".
    dialog.open = false;
    dialog.dispatchEvent(new Event('close'));
    fixture.detectChanges();
    expect(document.activeElement).toBe(annual);
  });

  it('makes no requests, posts nothing and stores nothing', () => {
    const http = TestBed.inject(HttpTestingController);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    for (const button of chooseButtons()) {
      button.click();
      fixture.detectChanges();
      [...root.querySelectorAll<HTMLButtonElement>('dialog button')].find(b=>text(b)==='Close')!.click();
      fixture.detectChanges();
    }
    http.verify();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(root.querySelector('form, input, select, textarea, iframe, script')).toBeNull();
    expect(root.innerHTML).not.toMatch(/stripe|paddle|lemon|polar|checkout\.js/i);
    fetchSpy.mockRestore();
    setItem.mockRestore();
  });

  it('asks a signed-out visitor to sign in before buying, and shows no payment wording', async () => {
    TestBed.inject(StudyPlanAccount).account.set(null);
    fixture.detectChanges();
    await fixture.whenStable();
    const learn = chooseButtons()[0];
    learn.click();
    fixture.detectChanges();
    const dialog = root.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(text(dialog.querySelector('h2'))).toBe('Sign in to buy a plan');
    expect(
      [...dialog.querySelectorAll('.action-row > *')].map((action) => [text(action), action.getAttribute('href')]),
    ).toEqual([
      ['Sign in', '/sign-in?returnTo=%2Fpricing'],
      ['Close', null],
    ]);
    // New learners sign up from a line below and come back to choose a plan.
    const signup = dialog.querySelector('.notice-signup')!;
    expect(text(signup)).toBe('Don’t have an account? Create a free account');
    expect(signup.querySelector('a')?.getAttribute('href')).toBe('/sign-up?returnTo=%2Fpricing');
    expect(text(dialog)).not.toContain('Payment connection');
  });

  describe('sales', () => {
    function startPreviewAs(account: Record<string, unknown> | null) {
      TestBed.inject(StudyPlanAccount).account.set(account as never);
      if(account?.['authorPreview']) TestBed.inject(SalePreview).activeSale.set({template:{id:'holiday',name:'Holiday sale',greeting:'Happy holidays',emoji:'🎄'},greeting:'Happy holidays',planIds:['annual-promo','interview-pass-promo'],preview:false});
      fixture.detectChanges();
    }

    it('never shows a sale to learners, even with a stored preview', () => {
      startPreviewAs(LEARNER);
      expect(root.querySelector('#sale')).toBeNull();
      expect(root.querySelector('.staff-bar')).toBeNull();
      expect(text(root)).not.toMatch(/Promo|Holiday/);
    });

    it('shows staff the sale on top, promo plans with the regular price, and regular plans read-only', () => {
      startPreviewAs({ ...LEARNER, authorPreview: true });
      const sale = root.querySelector('#sale')!;
      expect(sale.querySelector('.preview-flag')).toBeNull();
      expect(text(sale.querySelector('h2'))).toBe('Happy holidays');
      expect(text(sale.querySelector('.sale-name'))).toContain('Holiday sale');
      expect([...sale.querySelectorAll('.plan-card')].map((card) => [
        text(card.querySelector('h3')),
        text(card.querySelector('.compared-with')),
      ])).toEqual([
        ['Annual Promo', 'Complete is $279.99/year'],
        ['Interview Pass Promo', 'Interview Sprint is $99.99 one-time'],
      ]);
      expect(chooseButtons().map(text)).toEqual(['Choose Annual Promo', 'Choose Interview Pass Promo']);
      const yearly = root.querySelector('[aria-label="Yearly plans"]')!;
      expect(yearly.querySelector('button')).toBeNull();
      expect(text(yearly)).toContain('Available again after the sale.');

      // The staff switch shows the regular view, where the regular plans can be chosen again.
      const [regular] = [...root.querySelectorAll<HTMLButtonElement>('.view-switch button')];
      regular.click();
      fixture.detectChanges();
      expect(root.querySelector('#sale')).toBeNull();
      expect(chooseButtons().map(text)).toContain('Choose Complete');
      expect(root.querySelector('.staff-link')?.getAttribute('href')).toBe('/admin/sales');
    });
  });

  describe('who sees what (DLV-209, 2026-10-16)', () => {
    it('shows staff every sale plan, marked staff-only, when no sale runs', () => {
      TestBed.inject(StudyPlanAccount).account.set({ ...LEARNER, authorPreview: true } as never);
      fixture.detectChanges();
      const section = root.querySelector('.staff-promos')!;
      expect(text(section.querySelector('.preview-flag'))).toContain('Staff only.');
      expect([...section.querySelectorAll('.plan-card h3')].map(text)).toEqual([
        'Monthly Promo',
        'Annual Promo',
        'Interview Pass Promo',
      ]);
      expect(section.querySelector('button')).toBeNull();
      expect(section.querySelector('a')?.getAttribute('href')).toBe('/admin/sales');
    });

    it('shows a signed-in learner their plan, upgrades, and smaller plans only near renewal', () => {
      const endsAt = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString();
      TestBed.inject(MembershipApi).records.set([
        { id: 'r1', planId: 'learn', courses: [], startsAt: endsAt, endsAt, status: 'active', pricePaidCents: 6999, discount: null },
      ] as never);
      fixture.detectChanges();
      const card = (id: string) => root.querySelector(`.plan-card[data-plan="${id}"]`)!;
      expect(text(card('learn').querySelector('.plan-state'))).toContain('Your plan.');
      expect(card('learn').querySelector('button')).toBeNull();
      expect(text(card('advance').querySelector('button'))).toBe('Upgrade to Advance');
      expect(text(card('grow').querySelector('.off-sale-note'))).toContain('in the last 7 days of your plan');
      expect(card('grow').querySelector('button')).toBeNull();
      expect(text(card('interview-sprint').querySelector('button'))).toBe('Choose Interview Sprint');
      expect(root.querySelector('.staff-promos')).toBeNull();
    });
  });
});
