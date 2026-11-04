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

  // DLV-969 (owner, 2026-11-04): in DEV only test accounts buy, and each purchase waits for the owner or an admin.
  describe('DEV purchase requests', () => {
    let purchase: () => Response;
    let calls: { path: string; body: unknown }[];
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
              calls.push({ path, body: init?.body ? JSON.parse(init.body as string) : undefined });
              const json = (data: unknown) => new Response(JSON.stringify({ data }));
              if (path.endsWith('/auth/csrf')) return json({ headerName: 'X-CSRF-TOKEN', token: 't' });
              if (path.endsWith('/membership/plans')) return json(PLANS);
              if (path.endsWith('/account/purchases/quote')) return json({ priceCents: 14499, endsAt: '2027-11-04T00:00:00Z' });
              if (path.endsWith('/account/purchases')) return purchase();
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
      return api;
    }
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
    function dialogButton(name: string): HTMLButtonElement | undefined {
      return [...root.querySelectorAll<HTMLButtonElement>('dialog button')].find((button) => text(button) === name);
    }
    async function send() {
      const button = dialogButton('Send purchase request')!;
      expect(button.disabled).toBe(false);
      button.click();
      await settle();
    }

    it('says so on the page and in the FAQ', async () => {
      await open({ dev: true, testAccount: true });
      expect(text(root.querySelector('.sample-note'))).toBe(
        'DEV purchase requests. Only test accounts can buy here. Each purchase is a request that the owner or an admin approves; nothing is charged.',
      );
      expect(text(root.querySelector('.faq dl'))).toContain('In DEV, only test accounts can buy, and the owner or an admin approves each request.');
    });

    it('sends a test account’s purchase as a request and walks staff through approving it', async () => {
      purchase = () => new Response(JSON.stringify({ data: { id: 'pur-9', status: 'pending', providerStatus: 'awaiting_owner_approval' } }));
      const api = await open({ dev: true, testAccount: true });
      await choose('Choose Advance');
      const dialog = root.querySelector('dialog')!;
      expect(text(dialog.querySelector('h2'))).toBe('Send a purchase request');
      expect(text(dialog.querySelector('#checkout-notice-description'))).toBe(
        'In DEV the owner or an admin approves purchases for test accounts. Your plan changes once it is approved. No money is charged.',
      );
      expect(dialogButton('Confirm simulated purchase')).toBeUndefined();
      await send();
      expect(calls.find((call) => call.path.endsWith('/account/purchases'))?.body).toMatchObject({ planId: 'advance', expectedPriceCents: 14499 });
      const sent = dialog.querySelector('.request-sent')!;
      expect(sent.getAttribute('role')).toBe('status');
      // DLV-969 (owner wording, 2026-11-04): where to approve it, and where to check the result later.
      const lines = [...sent.querySelectorAll('p')].map(text);
      expect(lines[0]).toBe(
        'Request sent — mock payment waiting for approval. Review it in People and access in your own account, and approve or decline it there.',
      );
      expect(lines[1]).toBe('To check the result later, open Manage account → Membership in Learner 07’s account menu.');
      expect(text(sent)).not.toMatch(/switch back|continue learning/i);
      expect(text(dialog)).not.toContain('Simulated purchase completed');
      // As the test account People and access is not open to it, so the notice names the page instead of linking it.
      expect(sent.querySelector('a')).toBeNull();
      expect(api.requestWaiting()).toBe(true);
      expect(dialogButton('Request waiting for approval')?.disabled).toBe(true);

      // One primary action: Review request ends the test session with the menu's own back(), landing on the request.
      // The one-time notice goes and stays gone, and nothing is stored.
      const back = vi.spyOn(TestBed.inject(TestSessions), 'back').mockResolvedValue();
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const address = window.location.href;
      const buttons = [...sent.querySelectorAll<HTMLButtonElement>('button')];
      expect(buttons.map(text)).toEqual(['Review request']);
      expect(buttons[0].type).toBe('button');
      buttons[0].click();
      await settle();
      expect(back).toHaveBeenCalledExactlyOnceWith('/admin/access?tab=test&request=pur-9&return=%2Fpricing&account=tester');
      expect(root.querySelector('.request-sent')).toBeNull();
      expect(text(dialog)).not.toContain('Request sent');
      expect(setItem).not.toHaveBeenCalled();
      expect(window.location.href).toBe(address);
      setItem.mockRestore();
    });

    it('Review request leaves out a purchase id the answer did not send', async () => {
      purchase = () => new Response(JSON.stringify({ data: { status: 'pending', providerStatus: 'awaiting_owner_approval' } }));
      await open({ dev: true, testAccount: true });
      await choose('Choose Learn');
      await send();
      const back = vi.spyOn(TestBed.inject(TestSessions), 'back').mockResolvedValue();
      root.querySelector<HTMLButtonElement>('.request-sent button')!.click();
      await settle();
      expect(back).toHaveBeenCalledExactlyOnceWith('/admin/access?tab=test&return=%2Fpricing&account=tester');
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

    it('explains a waiting request instead of sending another, after the 409', async () => {
      purchase = () =>
        new Response(JSON.stringify({ status: 409, code: 'PURCHASE_REQUEST_PENDING', message: 'A request is already waiting for the owner or an admin.' }), { status: 409 });
      await open({ dev: true, testAccount: true });
      await choose('Choose Learn');
      await send();
      const dialog = root.querySelector('dialog')!;
      expect(text(dialog.querySelector('[role="status"]'))).toBe('A request is already waiting for the owner or an admin.');
      expect(dialogButton('Request waiting for approval')?.disabled).toBe(true);
      expect(dialogButton('Send purchase request')).toBeUndefined();

      // Choosing another plan says it is waiting, and the click sends nothing.
      dialogButton('Close')!.click();
      await choose('Choose Grow');
      expect(text(dialog.querySelector('[role="status"]'))).toBe(
        'A request is already waiting for the owner or an admin. Your plan changes once it is approved.',
      );
      const before = calls.filter((call) => call.path.endsWith('/account/purchases')).length;
      await (fixture.componentInstance as unknown as { purchase(): Promise<void> }).purchase();
      await settle();
      expect(calls.filter((call) => call.path.endsWith('/account/purchases'))).toHaveLength(before);
    });

    it('tells a real account in DEV that purchases are for test accounts, and offers nothing to send', async () => {
      await open({ dev: true, testAccount: false });
      await choose('Choose Learn');
      const dialog = root.querySelector('dialog')!;
      expect(text(dialog.querySelector('h2'))).toBe('Purchases in DEV are for test accounts');
      expect(text(dialog.querySelector('#checkout-notice-description'))).toBe(
        'In DEV, purchases are for test accounts; the owner or an admin approves them. To try a plan, choose Switch to a test account in your account menu.',
      );
      expect(dialogButton('Send purchase request')).toBeUndefined();
      expect(dialogButton('Confirm simulated purchase')).toBeUndefined();
      expect(calls.some((call) => call.path.includes('/account/purchases'))).toBe(false);
    });

    it('shows the 403 PURCHASES_TEST_ACCOUNTS_ONLY refusal in the server’s words', async () => {
      purchase = () =>
        new Response(JSON.stringify({ status: 403, code: 'PURCHASES_TEST_ACCOUNTS_ONLY', message: 'In DEV, purchases are for test accounts; an owner or admin approves them.' }), { status: 403 });
      const api = await open({ dev: true, testAccount: true });
      await choose('Choose Learn');
      await send();
      expect(text(root.querySelector('dialog [role="status"]'))).toBe('In DEV, purchases are for test accounts; an owner or admin approves them.');
      expect(api.requestWaiting()).toBe(false);
    });

    it('keeps the Local simulated purchase unchanged', async () => {
      purchase = () => new Response(JSON.stringify({ data: { status: 'succeeded', providerStatus: 'mock_succeeded' } }));
      await open({ dev: false, testAccount: false });
      expect(text(root.querySelector('.sample-note'))).toContain('Local payment simulation.');
      await choose('Choose Learn');
      dialogButton('Confirm simulated purchase')!.click();
      await settle();
      expect(text(root.querySelector('dialog [role="status"]'))).toBe(
        'Simulated purchase completed. No money was charged. Open Manage account to see your access.',
      );
      expect(root.querySelector('.request-sent')).toBeNull();
    });
  });
});
