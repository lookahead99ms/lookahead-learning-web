import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { ActivatedRoute, convertToParamMap, provideRouter, Router, RouterLink } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { AccountMergeClient, MergeCandidate, MergeLoadResult, MergeRequestResult, MergeResult } from './account-merge-client';
import { AccountMergePage, deletedNote, mergeDate, methodLabel } from './account-merge';
import { MergeInboxPanel } from './merge-inbox-panel';
import { PasswordAccountForm } from './password-account-form';
import { PasswordSignInApi } from './password-sign-in-api';

const TOKEN = 'Tk'.repeat(21) + 'x';
const candidate = (id: string, plans: number, extra: Partial<MergeCandidate> = {}): MergeCandidate => ({
  accountId: id,
  displayName: 'Priya ' + id.toUpperCase(),
  signInMethods: id === 'g' ? [{ provider: 'google', email: 'priya@gmail.com' }] : [{ provider: 'cognito', email: 'priya@gmail.com' }],
  admitted: id === 'g',
  createdAt: id === 'g' ? '2026-08-01T10:00:00Z' : '2026-10-15T08:00:00Z',
  lastSignInAt: id === 'g' ? '2026-11-02T09:00:00Z' : null,
  studyPlans: Array.from({ length: plans }, (_, index) => ({ id: id + index, title: 'Plan ' + index, progressPercent: 25 * index })),
  paidMembership: false,
  ...extra,
});
const ready = (candidates: MergeCandidate[]): MergeLoadResult => ({
  kind: 'ready',
  merge: { email: 'priya@gmail.com', expiresAt: '2026-11-04T10:30:00Z', candidates },
});

interface Setup {
  signedIn?: boolean;
  token?: string | null;
  load?: MergeLoadResult[];
  merge?: MergeResult;
  request?: MergeRequestResult;
  options?: Record<string, boolean> | null;
  /** The whole query string; replaces `token` when given. */
  query?: Record<string, string>;
}

async function mount(setup: Setup = {}) {
  const loads = [...(setup.load ?? [ready([candidate('g', 2), candidate('p', 1)])])];
  const client = {
    loadMerge: vi.fn(async () => loads.length > 1 ? loads.shift()! : loads[0]),
    merge: vi.fn(async () => setup.merge ?? ({ kind: 'merged', keptAccountId: 'g' } as MergeResult)),
    requestMergeEmail: vi.fn(async () => setup.request ?? ({ kind: 'sent' } as MergeRequestResult)),
  };
  const store = {
    enabled: true,
    account: signal(setup.signedIn === false ? null : { accountId: 'g', username: 'priya@gmail.com', displayName: 'Priya', topicGrants: [] }),
    sessionExpired: signal(false),
    authOptions: signal(setup.options === undefined ? { managedLogin: true, password: true, google: true } : setup.options),
    initialize: vi.fn(async () => undefined),
    logout: vi.fn(async () => true),
    logoutRedirectPending: signal(false),
    loadProfile: vi.fn(async () => ({ displayName: 'Priya', username: 'priya@gmail.com', email: 'priya@gmail.com' })),
  };
  const passwordApi = { email: signal(''), destination: signal(''), codeMethod: signal('email'), signIn: vi.fn() };
  const token = setup.token === undefined ? TOKEN : setup.token;
  const queryParamMap = convertToParamMap(setup.query ?? (token === null ? {} : { token }));
  TestBed.configureTestingModule({
    imports: [AccountMergePage],
    providers: [
      provideRouter([]),
      { provide: StudyPlanAccount, useValue: store },
      { provide: AccountMergeClient, useValue: client },
      { provide: PasswordSignInApi, useValue: passwordApi },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap } } },
    ],
  });
  TestBed.overrideComponent(AccountMergePage, {
    set: { imports: [RouterLink, MergeInboxPanel, PasswordAccountForm], schemas: [CUSTOM_ELEMENTS_SCHEMA] },
  });
  const replaceState = vi.spyOn(TestBed.inject(Location), 'replaceState').mockImplementation(() => undefined);
  const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(AccountMergePage);
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const text = () => element.textContent!.replace(/\s+/g, ' ').trim();
  const radios = () => [...element.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  const mergeButton = () => element.querySelector('.merge-button') as HTMLButtonElement;
  const type = (value: string) => {
    const input = element.querySelector('#merge-confirm') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const pick = (index: number) => {
    radios()[index].click();
    fixture.detectChanges();
  };
  const heading = () => element.querySelector('h1')!.textContent!.trim();
  return { fixture, element, client, store, settle, text, radios, mergeButton, type, pick, heading, replaceState, navigateByUrl };
}

describe('AccountMergePage', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the sign-in step first when nobody is signed in, and returns to this same link', async () => {
    const view = await mount({ signedIn: false });
    expect(view.store.initialize).toHaveBeenCalled();
    expect(view.client.loadMerge).not.toHaveBeenCalled();
    expect(view.heading()).toBe('Sign in to continue');
    const form = view.fixture.debugElement.query((node) => node.componentInstance instanceof PasswordAccountForm);
    expect(form).not.toBeNull();
    const instance = form.componentInstance as PasswordAccountForm;
    expect(instance.returnTo()).toBe('/account/merge?token=' + TOKEN);
    expect(instance.googleUrl()).toBe('/bff/login?provider=google&returnTo=' + encodeURIComponent('/account/merge?token=' + TOKEN));
    expect(globalThis.localStorage?.getItem('lookahead.merge-token') ?? null).toBeNull();
    expect(JSON.stringify({ ...globalThis.localStorage })).not.toContain(TOKEN);
  });

  it('offers the managed sign-in links or the sign-in page when there is no password form', async () => {
    const managed = await mount({ signedIn: false, options: { managedLogin: true, google: true } });
    const links = [...managed.element.querySelectorAll('a')].map((a) => [a.textContent!.trim(), a.getAttribute('href')]);
    expect(links).toEqual([
      ['Continue with Google', '/bff/login?provider=google&returnTo=' + encodeURIComponent('/account/merge?token=' + TOKEN)],
      ['Sign in', '/bff/login?returnTo=' + encodeURIComponent('/account/merge?token=' + TOKEN)],
    ]);
    TestBed.resetTestingModule();
    const local = await mount({ signedIn: false, options: null });
    const signIn = local.element.querySelector('a.return-action') as HTMLAnchorElement;
    expect(signIn.textContent!.trim()).toBe('Sign in');
    expect(signIn.getAttribute('href')).toBe('/sign-in?returnTo=' + encodeURIComponent('/account/merge?token=' + TOKEN));
  });

  it('renders every candidate with its methods, access, dates and study plans', async () => {
    const view = await mount({ load: [ready([candidate('g', 2), candidate('p', 0), candidate('x', 1, { displayName: '' })])] });
    expect(view.client.loadMerge).toHaveBeenCalledWith(TOKEN);
    expect(view.heading()).toBe('Choose one account');
    const cards = [...view.element.querySelectorAll('.merge-candidate')];
    expect(cards).toHaveLength(3);
    expect(view.element.querySelector('fieldset legend')!.textContent!.trim()).toBe('Choose the account to keep');
    expect(view.radios()).toHaveLength(3);
    expect(view.radios().every((radio) => radio.closest('fieldset'))).toBe(true);
    const facts = (card: Element) =>
      Object.fromEntries(
        [...card.querySelectorAll('.merge-facts > div')].map((row) => [
          row.querySelector('dt')!.textContent!.trim(),
          [...row.querySelector('dd')!.childNodes].filter((node) => node.nodeType !== Node.COMMENT_NODE).map((node) => node.textContent!.trim()).filter(Boolean).join(', '),
        ]),
      );
    const plans = (card: Element) =>
      [...card.querySelectorAll('.merge-plans li')].map(
        (li) => li.querySelector('.merge-plan-title')!.textContent + ': ' + li.querySelector('.merge-plan-progress')!.textContent,
      );
    expect(cards[0].querySelector('h2')!.textContent).toBe('Priya G');
    expect(facts(cards[0])).toEqual({
      'Sign-in methods': 'Google',
      Access: 'Admitted',
      Created: '1 Aug 2026',
      'Last sign-in': '2 Nov 2026',
    });
    expect(plans(cards[0])).toEqual(['Plan 0: 0% done', 'Plan 1: 25% done']);
    expect(cards[0].querySelector('label.merge-keep')!.textContent!.trim()).toBe('Keep this account');
    expect(facts(cards[1])).toEqual({
      'Sign-in methods': 'Email and password',
      Access: 'Waiting for access',
      Created: '15 Oct 2026',
      'Last sign-in': 'Not yet',
    });
    expect(cards[1].querySelector('.merge-empty')!.textContent).toBe('No study plans');
    expect(cards[2].querySelector('h2')!.textContent).toBe('No name');
    // Each radio is named by its card's name and its own "Keep this account" text.
    expect(view.radios()[0].getAttribute('aria-labelledby')).toBe('merge-name-0 merge-keep-0');
    expect(view.element.querySelector('#merge-name-0')!.textContent).toBe('Priya G');
    expect(view.element.querySelector('#merge-keep-0')!.textContent!.trim()).toBe('Keep this account');
    expect(view.radios()[2].getAttribute('aria-labelledby')).toBe('merge-name-2 merge-keep-2');
    expect(view.text()).toContain("These accounts all use priya@gmail.com.");
    expect(view.text()).toContain("this can't be undone");
    expect(view.element.querySelector('[role="note"]')).toBeNull();
  });

  it('keeps Merge disabled until an account is chosen and MERGE is typed, and marks what is deleted', async () => {
    const view = await mount();
    const label = view.element.querySelector('label.merge-confirm')!;
    expect(label.textContent!.trim()).toBe('Type MERGE to confirm');
    expect(label.querySelector('input#merge-confirm')).not.toBeNull();
    const actions = [...view.element.querySelectorAll('.merge-actions > *')].map((node) => node.textContent!.trim());
    expect(actions).toEqual(['Cancel', 'Merge']);
    expect(view.element.querySelector('.merge-actions a')!.getAttribute('href')).toBe('/account');
    expect(view.mergeButton().disabled).toBe(true);
    expect(view.mergeButton().getAttribute('aria-describedby')).toBe('merge-hint');
    expect(view.element.querySelector('#merge-hint')!.textContent!.trim()).toBe('Choose an account and type MERGE.');
    view.type('MERGE');
    expect(view.mergeButton().disabled).toBe(true);
    view.pick(0);
    expect(view.mergeButton().disabled).toBe(false);
    expect(view.mergeButton().getAttribute('aria-describedby')).toBeNull();
    expect(view.element.querySelector('#merge-hint')).toBeNull();
    const notes = [...view.element.querySelectorAll('[role="note"]')];
    expect(notes).toHaveLength(1);
    expect(notes[0].closest('.merge-candidate')!.textContent).toContain('Priya P');
    expect(notes[0].textContent!.trim()).toBe('Deleted: 1 study plan, progress since 15 Oct 2026');
    view.type('merge');
    expect(view.mergeButton().disabled).toBe(true);
    view.type('MERGED');
    expect(view.mergeButton().disabled).toBe(true);
    view.type(' MERGE ');
    expect(view.mergeButton().disabled).toBe(false);
    view.pick(1);
    expect(view.element.querySelector('[role="note"]')!.textContent!.trim()).toBe('Deleted: 2 study plans, progress since 1 Aug 2026');
  });

  it('merges the chosen account and shows Done before any sign-out; Sign in again signs out', async () => {
    const view = await mount();
    view.pick(1);
    view.type('MERGE');
    view.element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await view.settle();
    expect(view.client.merge).toHaveBeenCalledWith(TOKEN, 'p');
    expect(view.heading()).toBe('Accounts merged');
    expect(view.element.querySelector('[role="status"]')!.textContent!.trim()).toBe(
      'Accounts merged. Sign in again with any of your methods.',
    );
    expect(view.store.logout).not.toHaveBeenCalled();
    const buttons = [...view.element.querySelectorAll('.merge-actions button')];
    expect(buttons.map((button) => button.textContent!.trim())).toEqual(['Sign in again']);
    (buttons[0] as HTMLButtonElement).click();
    await view.settle();
    expect(view.store.logout).toHaveBeenCalledTimes(1);
    expect(view.navigateByUrl).toHaveBeenCalledWith('/sign-in');
  });

  it('leaves the page to the sign-out when it goes through Cognito', async () => {
    const view = await mount();
    view.store.logout.mockImplementation(async () => {
      view.store.logoutRedirectPending.set(true);
      return true;
    });
    view.pick(0);
    view.type('MERGE');
    view.element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await view.settle();
    (view.element.querySelector('.merge-actions button') as HTMLButtonElement).click();
    await view.settle();
    expect(view.store.logout).toHaveBeenCalledTimes(1);
    expect(view.navigateByUrl).not.toHaveBeenCalled();
  });

  it('shows a paid membership on its card and names it in the deleted note when not kept', async () => {
    const view = await mount({ load: [ready([candidate('g', 2), candidate('p', 1, { paidMembership: true })])] });
    const cards = [...view.element.querySelectorAll('.merge-candidate')];
    expect(cards[0].querySelector('.merge-paid')).toBeNull();
    expect(cards[1].querySelector('.merge-paid')!.textContent!.trim()).toBe('Paid membership');
    view.pick(0);
    expect(view.element.querySelector('[role="note"]')!.textContent!.trim()).toBe(
      'Deleted: 1 study plan, progress since 15 Oct 2026, and its paid membership',
    );
    view.pick(1);
    expect(view.element.querySelector('[role="note"]')!.textContent!.trim()).toBe(
      'Deleted: 2 study plans, progress since 1 Aug 2026',
    );
  });

  it('does not submit before the choice is complete', async () => {
    const view = await mount();
    view.element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await view.settle();
    expect(view.client.merge).not.toHaveBeenCalled();
  });

  it('shows the expired panel for an invalid link and sends a new email into Check your inbox', async () => {
    const view = await mount({ load: [{ kind: 'invalid' }] });
    expect(view.heading()).toBe('Link expired');
    expect(view.text()).toContain('This link has expired or was already used.');
    const send = view.element.querySelector('button.primary-action') as HTMLButtonElement;
    expect(send.textContent!.trim()).toBe('Send a new email');
    send.click();
    await view.settle();
    expect(view.client.requestMergeEmail).toHaveBeenCalledTimes(1);
    expect(view.store.loadProfile).toHaveBeenCalled();
    expect(view.heading()).toBe('Check your inbox');
    const panel = view.fixture.debugElement.query((node) => node.componentInstance instanceof MergeInboxPanel);
    expect(panel).not.toBeNull();
    expect(view.text()).toContain('We sent an email to p•••a@gmail.com.');
    // The page already asked; the panel only waits.
    expect(view.client.requestMergeEmail).toHaveBeenCalledTimes(1);
  });

  it('treats a missing token as an expired link without calling the Domain', async () => {
    for (const token of [null, 'not-a-token']) {
      TestBed.resetTestingModule();
      const view = await mount({ token });
      expect(view.heading()).toBe('Link expired');
      expect(view.client.loadMerge).not.toHaveBeenCalled();
    }
  });

  it('keeps the expired panel with a plain error when the new email cannot be sent', async () => {
    const view = await mount({ load: [{ kind: 'invalid' }], request: { kind: 'unavailable' } });
    (view.element.querySelector('button.primary-action') as HTMLButtonElement).click();
    await view.settle();
    expect(view.heading()).toBe('Link expired');
    expect(view.element.querySelector('[role="alert"]')!.textContent!.trim()).toBe(
      "We couldn't send the email right now. Try again in a minute.",
    );
  });

  it('goes back to sign-in when the session ended while asking for a new email', async () => {
    const view = await mount({ load: [{ kind: 'invalid' }], request: { kind: 'signed-out' } });
    view.store.loadProfile.mockRejectedValueOnce(new Error('expired'));
    (view.element.querySelector('button.primary-action') as HTMLButtonElement).click();
    await view.settle();
    expect(view.heading()).toBe('Sign in to continue');
  });

  it('shows the conflict panel on 409 and reloads the latest candidates', async () => {
    const view = await mount({
      load: [ready([candidate('g', 2), candidate('p', 1)]), ready([candidate('g', 3), candidate('p', 1)])],
      merge: { kind: 'conflict' },
    });
    view.pick(0);
    view.type('MERGE');
    view.element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await view.settle();
    expect(view.store.logout).not.toHaveBeenCalled();
    expect(view.heading()).toBe("Can't merge right now");
    expect(view.text()).toContain(
      'One of these accounts changed or was disabled. Reload to see the latest. If this keeps happening, the owner has to sort it out.',
    );
    const reload = view.element.querySelector('button.primary-action') as HTMLButtonElement;
    expect(reload.textContent!.trim()).toBe('Reload');
    reload.click();
    await view.settle();
    expect(view.client.loadMerge).toHaveBeenCalledTimes(2);
    expect(view.heading()).toBe('Choose one account');
    expect(view.radios().some((radio) => radio.checked)).toBe(false);
    expect((view.element.querySelector('#merge-confirm') as HTMLInputElement).value).toBe('');
    expect(view.element.querySelectorAll('.merge-candidate')[0].querySelectorAll('.merge-plans li')).toHaveLength(3);
  });

  it('shows the same panel when the first load answers 409, and again after each reload', async () => {
    const view = await mount({ load: [{ kind: 'conflict' }] });
    expect(view.client.merge).not.toHaveBeenCalled();
    expect(view.heading()).toBe("Can't merge right now");
    expect(view.text()).toContain('If this keeps happening, the owner has to sort it out.');
    const reload = view.element.querySelector('button.primary-action') as HTMLButtonElement;
    expect(reload.textContent!.trim()).toBe('Reload');
    reload.click();
    await view.settle();
    expect(view.client.loadMerge).toHaveBeenCalledTimes(2);
    expect(view.heading()).toBe("Can't merge right now");
    expect(view.element.querySelector('.merge-candidate')).toBeNull();
  });

  it('shows a choose-again panel on 422, the expired panel on 404 and sign-in on 401', async () => {
    for (const [merge, heading] of [
      [{ kind: 'not-candidate' }, 'Choose again'],
      [{ kind: 'invalid' }, 'Link expired'],
      [{ kind: 'signed-out' }, 'Sign in to continue'],
    ] as [MergeResult, string][]) {
      TestBed.resetTestingModule();
      const view = await mount({ merge });
      view.pick(0);
      view.type('MERGE');
      view.element.querySelector('form')!.dispatchEvent(new Event('submit'));
      await view.settle();
      expect(view.heading()).toBe(heading);
      expect(view.store.logout).not.toHaveBeenCalled();
      if (merge.kind === 'not-candidate') {
        expect(view.text()).toContain("That account can't be kept here. Reload and choose again.");
        expect(view.element.querySelector('button.primary-action')!.textContent!.trim()).toBe('Reload');
      }
    }
  });

  it('keeps the choice and says so plainly when the merge answer did not arrive', async () => {
    const view = await mount({ merge: { kind: 'unavailable' } });
    view.pick(0);
    view.type('MERGE');
    view.element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await view.settle();
    expect(view.heading()).toBe('Choose one account');
    expect(view.element.querySelector('[role="alert"]')!.textContent!.trim()).toBe(
      "We couldn't confirm the merge. Try again in a minute.",
    );
    expect(view.radios()[0].checked).toBe(true);
    expect(view.mergeButton().disabled).toBe(false);
  });

  it('offers a reload when the candidates cannot be loaded, and sign-in when the session ended', async () => {
    const view = await mount({ load: [{ kind: 'unavailable' }, { kind: 'signed-out' }] });
    expect(view.heading()).toBe('Try again soon');
    (view.element.querySelector('button.primary-action') as HTMLButtonElement).click();
    await view.settle();
    expect(view.heading()).toBe('Sign in to continue');
  });
});

describe('AccountMergePage offer (?offer=1)', () => {
  const formOf = (view: Awaited<ReturnType<typeof mount>>) =>
    view.fixture.debugElement.query((node) => node.componentInstance instanceof PasswordAccountForm)
      ?.componentInstance as PasswordAccountForm | undefined;

  it('signed in: asks for the email once and shows Check your inbox with a way home', async () => {
    const view = await mount({ query: { offer: '1' } });
    await view.settle();
    expect(view.client.loadMerge).not.toHaveBeenCalled();
    expect(view.heading()).toBe('Check your inbox');
    expect(view.client.requestMergeEmail).toHaveBeenCalledTimes(1);
    expect(view.text()).toContain("Check your inbox to confirm it's you. We sent an email to p•••a@gmail.com.");
    expect((view.element.querySelector('.merge-resend') as HTMLButtonElement).disabled).toBe(true);
    expect(view.element.querySelector('a.merge-continue')!.getAttribute('href')).toBe('/');
    view.fixture.detectChanges();
    await view.settle();
    expect(view.client.requestMergeEmail).toHaveBeenCalledTimes(1);
    // offer=1 leaves the address, so a reload or Back does not send again.
    expect(view.replaceState).toHaveBeenCalledTimes(1);
    expect(view.replaceState).toHaveBeenCalledWith('/account/merge');
  });

  it('keeps offer=1 in the address when the email could not be sent', async () => {
    const view = await mount({ query: { offer: '1' }, request: { kind: 'unavailable' } });
    await view.settle();
    expect(view.client.requestMergeEmail).toHaveBeenCalledTimes(1);
    expect(view.element.querySelector('[role="alert"]')).not.toBeNull();
    expect(view.replaceState).not.toHaveBeenCalled();
  });

  it('signed out: shows the sign-in step first and comes back to the offer', async () => {
    const view = await mount({ signedIn: false, query: { offer: '1' } });
    expect(view.heading()).toBe('Sign in to continue');
    expect(view.client.requestMergeEmail).not.toHaveBeenCalled();
    const form = formOf(view)!;
    expect(form.returnTo()).toBe('/account/merge?offer=1');
    expect(form.googleUrl()).toBe('/bff/login?provider=google&returnTo=' + encodeURIComponent('/account/merge?offer=1'));
  });

  it('lets a valid token win over the offer, signed in or not', async () => {
    const signedIn = await mount({ query: { offer: '1', token: TOKEN } });
    expect(signedIn.client.loadMerge).toHaveBeenCalledWith(TOKEN);
    expect(signedIn.client.requestMergeEmail).not.toHaveBeenCalled();
    expect(signedIn.heading()).toBe('Choose one account');
    TestBed.resetTestingModule();
    const signedOut = await mount({ signedIn: false, query: { offer: '1', token: TOKEN } });
    expect(formOf(signedOut)!.returnTo()).toBe('/account/merge?token=' + TOKEN);
  });

  it('treats an offer with a malformed token as the offer', async () => {
    const view = await mount({ query: { offer: '1', token: 'short' } });
    await view.settle();
    expect(view.client.loadMerge).not.toHaveBeenCalled();
    expect(view.heading()).toBe('Check your inbox');
    expect(view.client.requestMergeEmail).toHaveBeenCalledTimes(1);
  });

  it('keeps the expired-link panel without a way home after Send a new email', async () => {
    const view = await mount({ load: [{ kind: 'invalid' }] });
    (view.element.querySelector('button.primary-action') as HTMLButtonElement).click();
    await view.settle();
    expect(view.heading()).toBe('Check your inbox');
    expect(view.element.querySelector('a.merge-continue')).toBeNull();
    expect(view.replaceState).not.toHaveBeenCalled();
  });
});

describe('merge page helpers', () => {
  it('formats dates, method names and the deleted note', () => {
    expect(mergeDate('2026-11-03T23:30:00Z')).toBe('3 Nov 2026');
    expect(mergeDate(null)).toBe('');
    expect(methodLabel({ provider: 'google' })).toBe('Google');
    expect(methodLabel({ provider: 'cognito' })).toBe('Email and password');
    expect(deletedNote(candidate('p', 0))).toBe('Deleted: 0 study plans, progress since 15 Oct 2026');
    expect(deletedNote(candidate('p', 3, { paidMembership: true }))).toBe(
      'Deleted: 3 study plans, progress since 15 Oct 2026, and its paid membership',
    );
  });
});
