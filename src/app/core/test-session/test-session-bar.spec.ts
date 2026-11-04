import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import { TestSessionBar } from './test-session-bar';
import { TestSessionStatus, TestSessions, UsableTestAccount } from './test-sessions';

const learner: UsableTestAccount = {
  accountId: 'id-learner05', username: 'learner05@lookahead.dev', displayName: 'Learner05', roles: [], scenario: 'Learn · active · ready-made plan · in progress',
};
const coauthor: UsableTestAccount = {
  accountId: 'id-coauthor01', username: 'coauthor01@lookahead.dev', displayName: 'Coauthor01', roles: ['co-author'], scenario: 'Co-author with the full curriculum',
};

/** DLV-969 (owner, 2026-11-04): the bar that says which test account is in use. */
describe('TestSessionBar', () => {
  const account = signal<{ accountId: string; displayName: string } | null>(null);
  const status = signal<TestSessionStatus | null>(null);
  const accounts = signal<UsableTestAccount[] | null>(null);
  const sessions = {
    status, accounts,
    pickerOpen: signal(false), returning: signal(false), error: signal(''),
    active: () => status()?.active === true,
    current: (id: string | null | undefined) => (status()?.active ? accounts()?.find((item) => item.accountId === id) ?? null : null),
    open: vi.fn(), back: vi.fn(),
  };

  beforeEach(() => {
    status.set(null); accounts.set(null); account.set(null);
    sessions.pickerOpen.set(false); sessions.returning.set(false); sessions.error.set('');
    sessions.open.mockReset(); sessions.back.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: TestSessions, useValue: sessions }, { provide: StudyPlanAccount, useValue: { account } }],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(TestSessionBar);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('shows nothing outside a test session', () => {
    expect(render().root.querySelector('.test-bar')).toBeNull();
  });

  it('names the learner and its scenario, with Switch and Back to my account', () => {
    status.set({ active: true, canReturn: true, holderName: 'Author' });
    accounts.set([learner, coauthor]);
    account.set({ accountId: 'id-learner05', displayName: 'Learner05' });
    const { fixture, root } = render();
    expect(root.querySelector('.test-bar-mark')?.textContent).toBe('Test account');
    expect(root.querySelector('.test-bar-who strong')?.textContent).toBe('Learner05');
    expect(root.querySelector('.test-bar-scenario')?.textContent).toBe('Learn · active · ready-made plan · in progress');
    const [switchButton, back] = [...root.querySelectorAll<HTMLButtonElement>('.test-bar-actions button')];
    switchButton.click();
    back.click();
    expect(sessions.open).toHaveBeenCalled();
    expect(sessions.back).toHaveBeenCalled();
    sessions.returning.set(true);
    sessions.error.set('Could not go back to your account. Try again.');
    fixture.detectChanges();
    expect(back.textContent?.trim()).toBe('Going back…');
    expect(switchButton.disabled).toBe(true);
    expect(root.querySelector('.test-bar-error')?.textContent).toBe('Could not go back to your account. Try again.');
    // The dialog shows its own errors while it is open.
    sessions.pickerOpen.set(true);
    fixture.detectChanges();
    expect(root.querySelector('.test-bar-error')).toBeNull();
  });

  it('describes staff by their scenario, and falls back to the signed-in name', () => {
    status.set({ active: true, canReturn: true, holderName: null });
    accounts.set([coauthor, { ...coauthor, accountId: 'id-coauthor02', displayName: 'Coauthor02', scenario: null }]);
    account.set({ accountId: 'id-coauthor01', displayName: 'Coauthor01' });
    const { fixture, root } = render();
    expect(root.querySelector('.test-bar-scenario')?.textContent).toBe('Co-author with the full curriculum');
    account.set({ accountId: 'id-coauthor02', displayName: 'Coauthor02' });
    fixture.detectChanges();
    expect(root.querySelector('.test-bar-scenario')?.textContent).toBe('Co-author');
    // Not in the list (yet): the account's own name, no scenario.
    account.set({ accountId: 'id-unknown', displayName: 'Learner30' });
    fixture.detectChanges();
    expect(root.querySelector('.test-bar-who strong')?.textContent).toBe('Learner30');
    expect(root.querySelector('.test-bar-scenario')).toBeNull();
    account.set(null);
    fixture.detectChanges();
    expect(root.querySelector('.test-bar-who strong')?.textContent).toBe('Test account');
  });
});
