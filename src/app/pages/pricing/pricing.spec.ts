import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { PricingPage } from './pricing';
import { START_FREE_ROUTE } from './pricing-plans';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { MembershipApi } from '../../content/membership-api';
import { SalePreview } from '../../content/sale-preview';
import { PLANS } from '../../content/membership-plans';
import { ACCOUNT_FETCH } from '../study-plan/study-plan-account';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { TestSessions } from '../../core/test-session/test-sessions';

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
  /** An element's children read as words, for rows whose parts sit side by side ("Total" "$69.99/year"). */
  function words(element: Element | null): string {
    return [...(element?.children ?? [])].map(text).filter(Boolean).join(' ');
  }
  function chooseButtons(): HTMLButtonElement[] {
    return [...root.querySelectorAll<HTMLButtonElement>('.plan-card button')];
  }

  it('marks every price as a price figure; in DEV styles.css blurs it until hovered (user, 2026-11-03)', () => {
    const amounts = [...root.querySelectorAll('.amount')];
    expect(amounts.length).toBeGreaterThan(1);
    for (const amount of amounts) expect(amount.classList).toContain('price-figure');
    for (const compared of root.querySelectorAll('.compared-with')) expect(compared.classList).toContain('price-figure');
    const fs = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process
      .getBuiltinModule('node:fs') as { readFileSync(path: string, encoding: 'utf8'): string };
    const css = fs.readFileSync('src/styles.css', 'utf8').replace(/\s+/g, ' ');
    expect(css).toContain(':root[data-dev] .price-figure { filter: blur(0.45em);');
    expect(css).toContain(':root[data-dev] .price-figure:hover, :root[data-dev] [data-plan]:hover .price-figure, :root[data-dev] [data-plan]:focus-within .price-figure { filter: none; }');
  });

  it('fills the space between the sidebars on large monitors and shows the four yearly plans in one row', () => {
    // Component styles are emitted as <style> elements; read them as written (2026-10-16).
    const css = [...document.querySelectorAll('style')].map(style => style.textContent ?? '').join('\n').replace(/\s+/g, ' ');
    expect(root.querySelector('main')?.classList).toContain('pricing-page');
    expect(css).toMatch(/@media \(min-width: 1100px\) \{ \.pricing-page\[data-sidebar-columns\]\[[^\]]+\] \{ max-width: min\(1840px, calc\(100% - 2 \* var\(--reader-sidebar-space\)\)\) !important; \}/);
    expect(css).toMatch(/@media \(min-width: 1900px\) \{ \.plan-grid\.two-up\[[^\]]+\] \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); \}/);
    expect(root.querySelectorAll('.plan-grid.two-up > li')).toHaveLength(4);
  });

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
      'Your plan',
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

  it('opens the checkout on its Plan step from every Choose button and returns focus on Close', () => {
    const dialog = root.querySelector('dialog')!;
    expect(dialog.open).toBe(false);
    expect(dialog.getAttribute('aria-labelledby')).toBe('checkout-notice-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('checkout-notice-description');
    // The page outline skips [role="dialog"], so the checkout's step headings never appear in the sidebar.
    expect(dialog.getAttribute('role')).toBe('dialog');
    for (const button of chooseButtons()) {
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
      button.focus();
      button.click();
      fixture.detectChanges();
      expect(dialog.open).toBe(true);
      const name = text(button).replace('Choose ', '');
      expect(text(dialog.querySelector('#checkout-notice-title'))).toBe('Your plan');
      expect(text(dialog.querySelector('#checkout-notice-description'))).toMatch(new RegExp(`^${name} opens .+\\.$`));
      expect(text(dialog.querySelector('.plan-pick-name'))).toBe(name);
      // A slim Plan → Review → Payment indicator, with the current step marked for assistive technology.
      const steps = [...dialog.querySelectorAll('.checkout-steps li')];
      expect(steps.map((step) => text(step.querySelector('.step-label')))).toEqual(['Plan', 'Review', 'Payment']);
      expect(steps.map((step) => step.getAttribute('aria-current'))).toEqual(['step', null, null]);
      const close = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(b=>text(b)==='Close')!;
      expect(document.activeElement).toBe(close);
      expect(words(dialog.querySelector('.foot-split'))).toBe('Close Continue');
      close.click();
      fixture.detectChanges();
      expect(dialog.open).toBe(false);
      expect(document.activeElement).toBe(button);
    }
  });

  it('returns focus when Escape closes the checkout, and links back to Start free and catalogs', () => {
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
    // Escape is not held back when nothing is being sent.
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(false);
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

  it('reviews the order without the server, but needs its quote to go on to payment', () => {
    chooseButtons()[0].click();
    fixture.detectChanges();
    const dialog = root.querySelector('dialog')!;
    [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === 'Continue')!.click();
    fixture.detectChanges();
    expect(text(dialog.querySelector('#checkout-notice-title'))).toBe('Review your order');
    expect(document.activeElement).toBe(dialog.querySelector('#checkout-notice-title'));
    // The list price and the plan's length stand in, marked as pending, until a quote arrives.
    expect(words(dialog.querySelector('.order-total'))).toBe('Total $69.99/year');
    expect(dialog.querySelector('.order-total-price')?.classList).toContain('is-pending');
    expect(words(dialog.querySelector('.order-row'))).toBe('Access 1 year of access');
    expect([...dialog.querySelectorAll('.order-opens li')].map(text)).toEqual(['Learn']);
    const pay = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === 'Continue to payment')!;
    expect(pay.disabled).toBe(true);
    expect(text(dialog.querySelector('.checkout-status'))).not.toBe('');
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
    expect(dialog.querySelector('.checkout-steps')).toBeNull();
    expect(text(dialog.querySelector('.plan-pick-name'))).toBe('Learn');
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
    expect(text(dialog)).not.toMatch(/Payment connection|Continue to payment|Pay \$/);
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

  // DLV-969 (owner, 2026-11-04): the checkout looks like production everywhere; only the payment step differs. Local pays
  // with the mock provider, production says payments are not enabled yet, and a DEV test account's purchase becomes a
  // request that the owner or an admin completes.
  describe('checkout steps and the payment step by environment', () => {
    let purchase: () => Response;
    let quote: (body: Record<string, unknown>) => Record<string, unknown>;
    let records: unknown[];
    let calls: { path: string; body: unknown }[];
    const OWNER_TEXT =
      'This is DEV, so no payment is taken. Learner 07 is a test account. The owner or an admin completes this purchase: go back to your own account, open People & Access (admins: Test Accounts) → Review requests → Purchase requests, and approve or decline it.';
    async function open(options: { dev: boolean; testAccount: boolean }) {
      TestBed.resetTestingModule();
      calls = [];
      TestBed.configureTestingModule({
        imports: [PricingPage],
        providers: [
          provideRouter([]),
          provideHttpClient(),
          provideHttpClientTesting(),
          {
            provide: ACCOUNT_FETCH,
            useValue: async (path: string, init?: RequestInit) => {
              const body = init?.body ? JSON.parse(init.body as string) : undefined;
              calls.push({ path, body });
              const json = (data: unknown) => new Response(JSON.stringify({ data }));
              if (path.endsWith('/auth/csrf')) return json({ headerName: 'X-CSRF-TOKEN', token: 't' });
              if (path.endsWith('/membership/plans')) return json(PLANS);
              if (path.endsWith('/account/purchases/quote')) return json(quote(body));
              if (path.endsWith('/account/purchases')) return purchase();
              if (path.endsWith('/account/access-records')) return json(records);
              if (path.endsWith('/auth/test-session/end')) return json({ next: '/admin/access?tab=test' });
              if (path.endsWith('/access-summary')) return json({ label: 'Free' });
              return json([]);
            },
          },
        ],
      });
      TestBed.overrideComponent(PricingPage, { remove: { imports: [PlatformHeader] }, add: { imports: [HeaderStub] } });
      TestBed.inject(StudyPlanAccount).account.set({ ...LEARNER, accountId: 'tester', displayName: 'Learner 07' });
      if (options.dev) TestBed.inject(DevSession).gated.set(true);
      if (options.testAccount) TestBed.inject(TestSessions).status.set({ active: true, canReturn: true, holderName: 'Owner' });
      const api = TestBed.inject(MembershipApi);
      await api.refresh();
      fixture = TestBed.createComponent(PricingPage);
      fixture.detectChanges();
      await fixture.whenStable();
      root = fixture.nativeElement as HTMLElement;
      await settle();
      return api;
    }
    beforeEach(() => {
      records = [];
      // Local and DEV quotes say `mock: true`, as the Domain sends them.
      quote = () => ({ priceCents: 14499, startsAt: '2026-11-04T00:00:00Z', endsAt: '2027-11-04T00:00:00Z', renewal: 'manual', mock: true });
      purchase = () => new Response(JSON.stringify({ data: { id: 'pur-9', status: 'pending', providerStatus: 'awaiting_owner_approval' } }));
    });
    /** The fake transport answers on later tasks (CSRF, then the call), so let a few pass. */
    async function settle() {
      for (let turn = 0; turn < 6; turn++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        fixture.detectChanges();
      }
    }
    async function choose(name: string) {
      chooseButtons().find((button) => text(button) === name)!.click();
      await settle();
    }
    function dialog(): HTMLDialogElement {
      return root.querySelector('dialog')!;
    }
    function dialogButton(name: string): HTMLButtonElement | undefined {
      return [...root.querySelectorAll<HTMLButtonElement>('dialog button')].find((button) => text(button) === name);
    }
    async function press(name: string) {
      const button = dialogButton(name)!;
      expect(button.disabled).toBe(false);
      button.click();
      await settle();
    }
    function title(): string {
      return text(dialog().querySelector('#checkout-notice-title'));
    }
    function purchases() {
      return calls.filter((call) => call.path.endsWith('/account/purchases'));
    }
    function current(): string {
      return text(dialog().querySelector('.checkout-steps [aria-current="step"] .step-label'));
    }

    it('says so on the page and in the FAQ', async () => {
      await open({ dev: true, testAccount: true });
      expect(text(root.querySelector('.sample-note'))).toBe(
        'DEV purchase requests. Only test accounts can buy here. Each purchase is a request that the owner or an admin approves; nothing is charged.',
      );
      expect(text(root.querySelector('.faq dl'))).toContain('In DEV, only test accounts can buy, and the owner or an admin approves each request.');
    });

    it('walks Plan → Review → Payment and back, moving focus to each step’s heading', async () => {
      await open({ dev: false, testAccount: false });
      await choose('Choose Advance');
      expect([title(), current()]).toEqual(['Your plan', 'Plan']);
      await press('Continue');
      expect([title(), current()]).toEqual(['Review your order', 'Review']);
      expect(document.activeElement).toBe(dialog().querySelector('#checkout-notice-title'));
      expect(dialog().querySelector('.checkout-steps li.is-done .visually-hidden')?.textContent).toBe('(done)');
      // The order summary: what it opens, the term from the quote, the price, and manual renewal.
      expect([...dialog().querySelectorAll('.order-opens li')].map(text)).toEqual(['Learn', 'Grow']);
      expect([...dialog().querySelectorAll('.order-row')].map(words)).toEqual([
        'Access 4 Nov 2026 – 4 Nov 2027',
        'Renewal Renews manually. Nothing is charged again automatically.',
      ]);
      expect(words(dialog().querySelector('.order-total'))).toBe('Total $144.99/year');
      expect(dialog().querySelector('.order-total-price')?.classList).not.toContain('is-pending');
      await press('Back');
      expect(title()).toBe('Your plan');
      await press('Continue');
      await press('Continue to payment');
      expect([title(), current()]).toEqual(['Payment', 'Payment']);
      expect(document.activeElement).toBe(dialog().querySelector('#checkout-notice-title'));
      await press('Back');
      expect(title()).toBe('Review your order');
      // Moving through the steps sends nothing.
      expect(purchases()).toHaveLength(0);
    });

    it('pays with the Local mock provider, as a payment step that says no money is charged', async () => {
      purchase = () => new Response(JSON.stringify({ data: { status: 'succeeded', providerStatus: 'mock_succeeded' } }));
      quote = () => ({ priceCents: 6999, endsAt: '2027-11-04T00:00:00Z', mock: true });
      await open({ dev: false, testAccount: false });
      expect(text(root.querySelector('.sample-note'))).toContain('Local payment simulation.');
      await choose('Choose Learn');
      await press('Continue');
      await press('Continue to payment');
      expect(text(dialog().querySelector('.env-badge'))).toBe('Local · Mock payment');
      expect(text(dialog().querySelector('#checkout-notice-description'))).toBe(
        'This is Local, so a mock provider takes the payment. No money is charged.',
      );
      expect(words(dialog().querySelector('.foot-split'))).toBe('Back Pay $69.99');
      await press('Pay $69.99');
      expect(purchases()[0].body).toMatchObject({ planId: 'learn', expectedPriceCents: 6999, replacesId: null });
      expect(text(dialog().querySelector('.payment-result'))).toBe(
        'Payment complete Simulated purchase completed. No money was charged. Open Manage account to see your access.',
      );
      expect(dialog().querySelector('.payment-result')?.getAttribute('role')).toBe('status');
      expect([...dialog().querySelectorAll('.checkout-foot .action-row > *')].map((a) => [text(a), a.getAttribute('href')])).toEqual([
        ['Open Manage account', '/account'],
        ['Close', null],
      ]);
      expect(dialogButton('Back')).toBeUndefined();
    });

    it('says a mock payment that did not complete in the provider’s words', async () => {
      purchase = () => new Response(JSON.stringify({ data: { status: 'failed', providerStatus: 'requires_payment_method' } }));
      await open({ dev: false, testAccount: false });
      await choose('Choose Grow');
      await press('Continue');
      await press('Continue to payment');
      await press('Pay $144.99');
      expect(text(dialog().querySelector('.payment-result'))).toBe(
        'Payment not completed Payment simulation: failed (requires_payment_method). No money was charged.',
      );
      expect(dialogButton('Back')?.disabled).toBe(true);
      expect(dialogButton('Close')?.className).toBe('action-button');
    });

    it('says a refused Local payment in the server’s words and keeps the payment step', async () => {
      purchase = () => new Response(JSON.stringify({ message: 'The price changed. Review the order again.' }), { status: 409 });
      await open({ dev: false, testAccount: false });
      await choose('Choose Learn');
      await press('Continue');
      await press('Continue to payment');
      await press('Pay $144.99');
      expect(title()).toBe('Payment');
      expect(text(dialog().querySelector('.checkout-status'))).toBe('The price changed. Review the order again.');
    });

    it('in production, where the quote is not the mock, says payments are not enabled yet and offers nothing to pay', async () => {
      quote = () => ({ priceCents: 6999, endsAt: '2027-11-04T00:00:00Z' });
      await open({ dev: false, testAccount: false });
      await choose('Choose Learn');
      await press('Continue');
      expect(words(dialog().querySelector('.order-total'))).toBe('Total $69.99/year');
      await press('Continue to payment');
      expect(title()).toBe('Payment');
      expect(text(dialog().querySelector('#checkout-notice-description'))).toBe('Payments are not enabled yet.');
      expect(text(dialog().querySelector('.payment-panel'))).toContain('You cannot buy a plan here yet, and nothing is charged.');
      expect(dialog().querySelector('.env-badge')).toBeNull();
      expect(words(dialog().querySelector('.foot-split'))).toBe('Back Close');
      expect(dialogButton('Pay $69.99')).toBeUndefined();
      expect(purchases()).toHaveLength(0);
    });

    it('shows an upgrade’s credit for the time left, the amount due and the end date it keeps', async () => {
      records = [{ id: 'r1', planId: 'learn', courses: [], startsAt: '2026-05-04T00:00:00Z', endsAt: '2027-05-04T00:00:00Z', status: 'active', pricePaidCents: 6999, discount: null }];
      quote = (body) =>
        body['replacesId']
          ? { priceCents: 3999, startsAt: new Date().toISOString(), endsAt: '2027-05-04T00:00:00Z', mock: true }
          : { priceCents: 14499, startsAt: new Date().toISOString(), endsAt: '2028-05-04T00:00:00Z', mock: true };
      await open({ dev: false, testAccount: false });
      await choose('Upgrade to Advance');
      const quotes = calls.filter((call) => call.path.endsWith('/purchases/quote'));
      expect(quotes.at(-1)?.body).toMatchObject({ planId: 'advance', replacesId: 'r1' });
      const select = dialog().querySelector('select')!;
      expect([...select.options].map((option) => text(option))).toEqual(['New purchase', 'Change my Learn plan (ends 4 May 2027)']);
      await press('Continue');
      const rows = [...dialog().querySelectorAll('.order-row')].map(words);
      expect(rows[0]).toMatch(/^Access \d+ \w+ 2026 – 4 May 2027$/);
      expect(rows.slice(1)).toEqual([
        'Advance $144.99',
        'Credit for the time left on Learn −$105.00',
        'Renewal Renews manually. Nothing is charged again automatically.',
      ]);
      expect(words(dialog().querySelector('.order-total'))).toBe('Due today $39.99');
      expect(text(dialog().querySelector('.order-note'))).toBe('You pay the difference for the time left. Your end date stays 4 May 2027.');
      await press('Continue to payment');
      expect(dialogButton('Pay $39.99')).toBeDefined();

      // A new purchase instead: a fresh quote, and no upgrade lines.
      await press('Back');
      await press('Back');
      const choice = dialog().querySelector('select')!;
      choice.value = '';
      choice.dispatchEvent(new Event('change'));
      await settle();
      expect(calls.filter((call) => call.path.endsWith('/purchases/quote')).at(-1)?.body).toMatchObject({ replacesId: null });
      await press('Continue');
      expect(words(dialog().querySelector('.order-total'))).toBe('Total $144.99/year');
      expect(dialog().querySelector('.order-note')).toBeNull();
    });

    it('shows a test account the DEV checkout screen once its purchase is waiting for approval', async () => {
      const api = await open({ dev: true, testAccount: true });
      await choose('Choose Advance');
      // Plan and Review look as they do in production: no request wording.
      expect(title()).toBe('Your plan');
      await press('Continue');
      expect(title()).toBe('Review your order');
      expect(text(dialog())).not.toMatch(/Review request(?!s)|Send purchase request|purchase request/i);
      expect(purchases()).toHaveLength(0);
      await press('Continue to payment');
      // Behind the scenes the purchase is sent, and becomes a request; the DEV screen comes once it exists.
      expect(purchases()).toHaveLength(1);
      expect(purchases()[0].body).toMatchObject({ planId: 'advance', expectedPriceCents: 14499 });
      expect(api.requestWaiting()).toBe(true);
      expect([title(), current()]).toEqual(['Payment', 'Payment']);
      const screen = dialog().querySelector('[data-dev-checkout]')!;
      expect(text(screen.querySelector('.env-badge'))).toBe('DEV · Test account · No payment');
      expect(text(screen.querySelector('.order-name'))).toBe('Advance');
      expect(words(screen.querySelector('.order-total'))).toBe('Total $144.99/year');
      const status = screen.querySelector('#checkout-notice-description')!;
      expect(status.getAttribute('role')).toBe('status');
      expect(text(status)).toBe(OWNER_TEXT);
      expect(text(dialog())).not.toMatch(/Review request(?!s)|Send purchase request|Simulated purchase completed|Pay \$/);
      expect(screen.querySelector('a')).toBeNull();
      expect([...dialog().querySelectorAll('.checkout-foot button')].map(text)).toEqual(['Go to Review requests', 'Close']);
      expect(dialog().querySelector('.checkout-foot .foot-centred')).not.toBeNull();

      // Escape waits while the test session is ending.
      const sessions = TestBed.inject(TestSessions);
      sessions.returning.set(true);
      const cancel = new Event('cancel', { cancelable: true });
      dialog().dispatchEvent(cancel);
      expect(cancel.defaultPrevented).toBe(true);
      sessions.returning.set(false);
      fixture.detectChanges();

      // Go to Review requests ends the test session with the menu's own back(), landing on the request. Nothing is stored.
      const back = vi.spyOn(sessions, 'back').mockResolvedValue();
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const address = window.location.href;
      await press('Go to Review requests');
      expect(back).toHaveBeenCalledExactlyOnceWith('/admin/access?tab=waiting&view=purchases&request=pur-9&return=%2Fpricing&account=tester');
      expect(setItem).not.toHaveBeenCalled();
      expect(window.location.href).toBe(address);
      setItem.mockRestore();

      // Close closes the checkout.
      await press('Close');
      expect(dialog().open).toBe(false);
    });

    it('shows a failed switch back inside the DEV screen', async () => {
      await open({ dev: true, testAccount: true });
      await choose('Choose Learn');
      await press('Continue');
      await press('Continue to payment');
      TestBed.inject(TestSessions).error.set('Could not go back to your account. Try again.');
      fixture.detectChanges();
      expect(text(dialog().querySelector('[data-dev-checkout] [role="alert"]'))).toBe('Could not go back to your account. Try again.');
    });

    it('Go to Review requests leaves out a purchase id the answer did not send', async () => {
      purchase = () => new Response(JSON.stringify({ data: { status: 'pending', providerStatus: 'awaiting_owner_approval' } }));
      await open({ dev: true, testAccount: true });
      await choose('Choose Learn');
      await press('Continue');
      await press('Continue to payment');
      const back = vi.spyOn(TestBed.inject(TestSessions), 'back').mockResolvedValue();
      await press('Go to Review requests');
      expect(back).toHaveBeenCalledExactlyOnceWith('/admin/access?tab=waiting&view=purchases&return=%2Fpricing&account=tester');
    });

    describe('where the purchase started', () => {
      @Component({ selector: 'app-locked-lesson', template: '' })
      class LockedLesson {}
      async function harness() {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
          providers: [
            provideRouter([
              { path: 'grow/java/streams', component: LockedLesson },
              { path: 'pricing', component: PricingPage },
            ]),
            provideHttpClient(),
            provideHttpClientTesting(),
            { provide: ACCOUNT_FETCH, useValue: async () => new Response(JSON.stringify({ data: [] })) },
          ],
        });
        TestBed.overrideComponent(PricingPage, { remove: { imports: [PlatformHeader] }, add: { imports: [HeaderStub] } });
        return RouterTestingHarness.create();
      }

      it('is the page that sent the learner to Pricing (a locked lesson)', async () => {
        const router = await harness();
        await router.navigateByUrl('/grow/java/streams?unit=2');
        const page = await router.navigateByUrl('/pricing', PricingPage);
        expect(page.startedFrom).toBe('/grow/java/streams?unit=2');
      });

      it('is a same-site returnTo when the address has one, and Pricing itself otherwise', async () => {
        const router = await harness();
        expect((await router.navigateByUrl('/pricing?returnTo=%2Fgrow%2Fjava%2Fstreams', PricingPage)).startedFrom).toBe('/grow/java/streams');
        TestBed.resetTestingModule();
        const direct = await harness();
        expect((await direct.navigateByUrl('/pricing', PricingPage)).startedFrom).toBe('/pricing');
        for (const returnTo of ['//elsewhere.example', 'https://elsewhere.example/', '/\\elsewhere.example']) {
          TestBed.resetTestingModule();
          const unsafe = await harness();
          const page = await unsafe.navigateByUrl('/pricing?returnTo=' + encodeURIComponent(returnTo), PricingPage);
          expect(page.startedFrom).toBe('/pricing');
        }
      });
    });


    it('after the 409, shows the same DEV screen saying a purchase is already waiting, and sends no second one', async () => {
      purchase = () =>
        new Response(JSON.stringify({ status: 409, code: 'PURCHASE_REQUEST_PENDING', message: 'A request is already waiting for the owner or an admin.' }), { status: 409 });
      const api = await open({ dev: true, testAccount: true });
      await choose('Choose Learn');
      await press('Continue');
      await press('Continue to payment');
      expect(api.requestWaiting()).toBe(true);
      const screen = dialog().querySelector('[data-dev-checkout]')!;
      expect(text(screen.querySelector('.env-badge'))).toBe('DEV · Test account · No payment');
      expect(words(screen.querySelector('#checkout-notice-description'))).toBe(
        'A purchase for this account is already waiting for approval. ' + OWNER_TEXT,
      );
      // The waiting purchase may be for another plan, so this screen does not show the chosen plan as its order.
      expect(screen.querySelector('.order')).toBeNull();
      expect([...dialog().querySelectorAll('.checkout-foot button')].map(text)).toEqual(['Go to Review requests', 'Close']);
      const back = vi.spyOn(TestBed.inject(TestSessions), 'back').mockResolvedValue();
      await press('Go to Review requests');
      expect(back).toHaveBeenCalledExactlyOnceWith('/admin/access?tab=waiting&view=purchases&return=%2Fpricing&account=tester');

      // Another plan while it waits: the same steps, then the same screen, and nothing is sent.
      await press('Close');
      await choose('Choose Grow');
      expect(title()).toBe('Your plan');
      const before = purchases().length;
      await press('Continue');
      await press('Continue to payment');
      expect(purchases()).toHaveLength(before);
      expect(text(dialog().querySelector('.dev-checkout-lead'))).toBe('A purchase for this account is already waiting for approval.');
      await (fixture.componentInstance as unknown as { purchase(): Promise<void> }).purchase();
      await settle();
      expect(purchases()).toHaveLength(before);
    });

    it('lets a real account in DEV through the same steps, and its payment step says purchases are for test accounts only', async () => {
      await open({ dev: true, testAccount: false });
      await choose('Choose Learn');
      expect(title()).toBe('Your plan');
      await press('Continue');
      await press('Continue to payment');
      expect(title()).toBe('Payment');
      expect(text(dialog().querySelector('.env-badge'))).toBe('DEV · No payment');
      expect(text(dialog().querySelector('#checkout-notice-description'))).toBe('Purchases in DEV are for test accounts only.');
      expect(text(dialog().querySelector('.payment-panel'))).toContain(
        'In DEV, purchases are for test accounts; the owner or an admin approves them. To try a plan, choose Switch to a test account in your account menu.',
      );
      expect(words(dialog().querySelector('.foot-split'))).toBe('Back Close');
      expect(calls.some((call) => call.path.includes('/account/purchases'))).toBe(false);
      await (fixture.componentInstance as unknown as { purchase(): Promise<void> }).purchase();
      expect(calls.some((call) => call.path.includes('/account/purchases'))).toBe(false);
    });

    it('keeps a test account on Review with the 403 PURCHASES_TEST_ACCOUNTS_ONLY refusal in the server’s words', async () => {
      purchase = () =>
        new Response(JSON.stringify({ status: 403, code: 'PURCHASES_TEST_ACCOUNTS_ONLY', message: 'In DEV, purchases are for test accounts; an owner or admin approves them.' }), { status: 403 });
      const api = await open({ dev: true, testAccount: true });
      await choose('Choose Learn');
      await press('Continue');
      await press('Continue to payment');
      expect(title()).toBe('Review your order');
      expect(text(dialog().querySelector('.checkout-status'))).toBe('In DEV, purchases are for test accounts; an owner or admin approves them.');
      expect(api.requestWaiting()).toBe(false);
    });

    it('says a quote the server refused, and keeps Continue to payment disabled', async () => {
      quote = () => {
        throw new Error('unused');
      };
      await open({ dev: false, testAccount: false });
      const component = fixture.componentInstance as unknown as { membershipApi: MembershipApi };
      vi.spyOn(component.membershipApi, 'request').mockRejectedValueOnce(new Error('Sale is not active'));
      await choose('Choose Learn');
      await press('Continue');
      expect(text(dialog().querySelector('.checkout-status'))).toBe('Sale is not active');
      expect(dialogButton('Continue to payment')?.disabled).toBe(true);
    });

    it('a test account whose purchase completes at once sees the payment result', async () => {
      purchase = () => new Response(JSON.stringify({ data: { status: 'succeeded', providerStatus: 'mock_succeeded' } }));
      await open({ dev: true, testAccount: true });
      await choose('Choose Learn');
      await press('Continue');
      await press('Continue to payment');
      expect(title()).toBe('Payment');
      expect(text(dialog().querySelector('.payment-result'))).toContain('Payment complete');
    });
  });
});
