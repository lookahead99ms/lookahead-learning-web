import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import { TestAccountSwitcher } from './test-account-switcher';
import { TestSessionStatus, TestSessions, UsableTestAccount } from './test-sessions';

const learner = (n: number, scenario: string): UsableTestAccount => ({
  accountId: `id-learner${n}`, username: `learner${String(n).padStart(2, '0')}@lookahead.dev`, displayName: `Learner${String(n).padStart(2, '0')}`, roles: [], scenario,
});
const list: UsableTestAccount[] = [
  learner(1, 'Free · no study plan'),
  learner(5, 'Learn · active · ready-made plan · in progress'),
  learner(6, 'Learn · ending soon · student discount · custom plan · in progress'),
  learner(8, 'Grow · active · ready-made plan · in progress'),
  learner(9, 'Studio · trial'),
  { accountId: 'id-coauthor01', username: 'coauthor01@lookahead.dev', displayName: 'Coauthor01', roles: ['co-author'], scenario: 'Co-author with the full curriculum' },
  { accountId: 'id-admin01', username: 'admin01@lookahead.dev', displayName: 'Admin01', roles: ['admin'], scenario: null },
];

/** DLV-969 (owner, 2026-11-04): the Switch to a test account dialog. */
describe('TestAccountSwitcher', () => {
  const account = signal<{ accountId: string } | null>({ accountId: 'owner' });
  let sessions: {
    status: ReturnType<typeof signal<TestSessionStatus | null>>;
    accounts: ReturnType<typeof signal<UsableTestAccount[] | null>>;
    pickerOpen: ReturnType<typeof signal<boolean>>;
    starting: ReturnType<typeof signal<string | null>>;
    returning: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string>>;
    active: () => boolean;
    use: ReturnType<typeof vi.fn>;
    back: ReturnType<typeof vi.fn>;
    close: () => void;
  };

  beforeAll(() => {
    // jsdom has no modal dialogs; an open attribute is all the component looks at.
    const proto = HTMLDialogElement.prototype as unknown as { showModal?: () => void; close?: () => void };
    proto.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    proto.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
  });

  beforeEach(() => {
    const status = signal<TestSessionStatus | null>(null);
    sessions = {
      status,
      accounts: signal<UsableTestAccount[] | null>(list),
      pickerOpen: signal(false),
      starting: signal<string | null>(null),
      returning: signal(false),
      error: signal(''),
      active: () => status()?.active === true,
      use: vi.fn(),
      back: vi.fn(),
      close: () => sessions.pickerOpen.set(false),
    };
    account.set({ accountId: 'owner' });
    TestBed.configureTestingModule({
      providers: [
        { provide: TestSessions, useValue: sessions },
        { provide: StudyPlanAccount, useValue: { account } },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(TestAccountSwitcher);
    fixture.detectChanges();
    sessions.pickerOpen.set(true);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const names = () => [...root.querySelectorAll('.row-name')].map((name) => name.firstChild?.textContent?.trim());
    const button = (selector: string, text: string) =>
      [...root.querySelectorAll<HTMLButtonElement>(selector)].find((item) => item.textContent?.trim().startsWith(text))!;
    return { fixture, root, names, button };
  }

  it('opens on Learners with counts, plan badges and the scenario in words', () => {
    const { root, names } = render();
    expect(root.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    expect(root.querySelector('h2')?.textContent).toBe('Switch to a test account');
    expect([...root.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent?.replace(/\s+/g, ' ').trim()))
      .toEqual(['Learners 5', 'Co-authors 1', 'Admins 1']);
    expect(root.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Learners');
    expect(names()).toEqual(['Learner01', 'Learner05', 'Learner06', 'Learner08', 'Learner09']);
    const row = root.querySelectorAll('.switcher-row')[1];
    expect(row.querySelector('.row-mark')?.textContent).toBe('L05');
    expect(row.querySelector('.row-plan')?.textContent).toBe('Learn');
    expect(row.querySelector('.row-detail')?.textContent).toContain('active · ready-made plan · in progress');
    expect(row.querySelector('.row-action')?.textContent?.trim()).toBe('Use');
    // Plans in the order they are sold, then any other.
    expect([...root.querySelectorAll('.switcher-plans button')].map((chip) => chip.textContent?.trim()))
      .toEqual(['All plans', 'Free', 'Learn', 'Grow', 'Studio']);
    expect(root.textContent).toContain('Your own sign-in stays;');
    expect(root.querySelector('.switcher-foot')).toBeNull();
  });

  it('filters by plan and by words across every tab', () => {
    const { fixture, root, names, button } = render();
    button('.switcher-plans button', 'Learn').click();
    fixture.detectChanges();
    expect(names()).toEqual(['Learner05', 'Learner06']);
    button('.switcher-plans button', 'Learn').click();
    fixture.detectChanges();
    expect(names()).toHaveLength(5);
    button('.switcher-plans button', 'Grow').click();
    fixture.detectChanges();
    button('.switcher-plans button', 'All plans').click();
    fixture.detectChanges();
    expect(names()).toHaveLength(5);
    const search = root.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = 'full curriculum';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(names()).toEqual([]);
    expect(root.querySelector('.switcher-empty')?.textContent).toBe('No test account matches.');
    expect(root.querySelector('[role="tab"]')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Learners 0');
    search.value = 'Admin';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('[role="tab"]', 'Admins').click();
    fixture.detectChanges();
    expect(names()).toEqual(['Admin01']);
    expect(root.querySelector('.row-plan')?.textContent).toBe('Admin');
    expect(root.querySelector('.row-detail')?.textContent).toContain('Full curriculum');
    expect(root.querySelector('.switcher-plans')).toBeNull();
  });

  it('moves between tabs with the arrow keys', () => {
    const { fixture, root } = render();
    const tabs = () => [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    expect(tabs()[1].getAttribute('tabindex')).toBe('0');
    expect(document.activeElement === tabs()[1] || !fixture.nativeElement.isConnected).toBe(true);
    tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(tabs()[2].getAttribute('aria-selected')).toBe('true');
    tabs()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(tabs()[2].getAttribute('aria-selected')).toBe('true');
  });

  it('uses the chosen account, and marks the one in use without offering it', () => {
    const { fixture, root } = render();
    (root.querySelectorAll('.switcher-row')[1] as HTMLButtonElement).click();
    expect(sessions.use).toHaveBeenCalledWith(list[1]);
    sessions.starting.set(list[1].accountId);
    fixture.detectChanges();
    expect(root.querySelectorAll('.switcher-row')[1].textContent).toContain('Opening…');
    expect((root.querySelector('.switcher-close') as HTMLButtonElement).disabled).toBe(true);
    sessions.starting.set(null);
    sessions.error.set('Your role cannot use this test account.');
    fixture.detectChanges();
    expect(root.querySelector('.switcher-error')?.textContent).toBe('Your role cannot use this test account.');
  });

  it('inside a test account opens on its tab, marks it In use, and offers Back to my account', () => {
    sessions.status.set({ active: true, canReturn: true, holderName: 'Author' });
    account.set({ accountId: 'id-coauthor01' });
    const { fixture, root } = render();
    expect(root.querySelector('h2')?.textContent).toBe('Switch test account');
    expect(root.textContent).toContain('You stay signed in as Author;');
    expect(root.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Co-authors');
    const current = root.querySelector('.switcher-row.current') as HTMLButtonElement;
    expect(current.disabled).toBe(true);
    expect(current.querySelector('.row-action')?.textContent?.trim()).toBe('In use');
    current.click();
    expect(sessions.use).not.toHaveBeenCalled();
    (root.querySelector('.switcher-foot button') as HTMLButtonElement).click();
    expect(sessions.back).toHaveBeenCalled();
    sessions.returning.set(true);
    fixture.detectChanges();
    expect(root.querySelector('.switcher-foot button')?.textContent?.trim()).toBe('Going back…');
  });

  it('shows loading and an empty role, and closes with the dialog', () => {
    sessions.accounts.set(null);
    const { fixture, root } = render();
    expect(root.querySelector('.switcher-empty')?.textContent).toBe('Loading test accounts…');
    sessions.accounts.set([]);
    fixture.detectChanges();
    expect(root.querySelector('.switcher-empty')?.textContent).toBe('No test accounts here for your role.');
    (root.querySelector('.switcher-close') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelector('dialog')?.hasAttribute('open')).toBe(false);
  });
});
