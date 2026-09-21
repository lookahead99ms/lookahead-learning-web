import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ActiveSignIns } from './active-sign-ins';
import {
  ACTIVE_SIGN_INS_CLIENT,
  ActiveSignInInventory,
  SignInManagementError,
} from './active-sign-ins-client';
import { StudyPlanAccount } from '../study-plan/study-plan-account';

const initial: ActiveSignInInventory = {
  limit: 2,
  labelsEditable: true,
  signIns: [
    {
      id: 'opaque-current',
      current: true,
      label: 'My browser',
      clientDescription: 'Chrome on macOS',
      createdAt: '2026-09-19T10:00:00Z',
      lastActiveAt: '2026-09-19T11:00:00Z',
    },
    {
      id: 'opaque-other',
      current: false,
      label: null,
      clientDescription: 'Safari on iOS',
      createdAt: '2026-09-18T10:00:00Z',
      lastActiveAt: '2026-09-19T09:00:00Z',
    },
  ],
};

describe('Active sign-in inventory', () => {
  let fixture: ComponentFixture<ActiveSignIns>;
  let store: StudyPlanAccount;
  let client: {
    load: ReturnType<typeof vi.fn>;
    rename: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
    revokeOthers: ReturnType<typeof vi.fn>;
    reauthenticate: ReturnType<typeof vi.fn>;
  };
  beforeEach(async () => {
    client = {
      load: vi.fn().mockResolvedValue(structuredClone(initial)),
      reauthenticate: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockImplementation(async (_id: string, label: string) => ({
        ...initial,
        signIns: [{ ...initial.signIns[0], label }, initial.signIns[1]],
      })),
      revoke: vi.fn().mockResolvedValue({
        signedOut: false,
        inventory: { ...initial, signIns: [initial.signIns[0]] },
      }),
      revokeOthers: vi.fn().mockResolvedValue({ ...initial, signIns: [initial.signIns[0]] }),
    };
    TestBed.configureTestingModule({
      imports: [ActiveSignIns],
      providers: [provideRouter([]), { provide: ACTIVE_SIGN_INS_CLIENT, useValue: client }],
    });
    store = TestBed.inject(StudyPlanAccount);
    store.account.set({
      accountId: 'owner',
      displayName: 'Learner',
      username: 'learner',
      topicGrants: [],
    });
    fixture = TestBed.createComponent(ActiveSignIns);
    await settle();
  });
  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('section').getAttribute('aria-busy')).toBe(
        'false',
      );
    });
  }
  function button(name: string) {
    const result = [
      ...(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>),
    ].find((button) => (button.getAttribute('aria-label') || button.textContent?.trim()) === name);
    expect(result, name).toBeDefined();
    return result!;
  }
  function fill(value: string) {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }
  it('shows the authoritative count, approximate descriptions, current marker and dates without raw IDs', () => {
    expect(fixture.nativeElement.textContent).toContain('2 of 2 active sign-ins');
    expect(fixture.nativeElement.textContent).toContain('This sign-in');
    expect(fixture.nativeElement.textContent).toContain('descriptions are approximate');
    expect(fixture.nativeElement.querySelectorAll('time')).toHaveLength(4);
    expect(fixture.nativeElement.textContent).not.toMatch(
      /opaque-current|opaque-other|physical device|IP address/,
    );
    expect(client.revoke).not.toHaveBeenCalled();
    expect(client.revokeOthers).not.toHaveBeenCalled();
  });
  it('labels Local inventory as unlimited without a misleading capacity count', async () => {
    client.load.mockResolvedValue({ ...structuredClone(initial), limit: null });
    button('Refresh list').click();
    await settle();
    expect(fixture.nativeElement.textContent).toContain(
      '2 active sign-ins · no Local development limit',
    );
    expect(fixture.nativeElement.textContent).not.toContain('2 of 2 active sign-ins');
  });
  it('limits label editing to the current sign-in and restores focus when canceled', async () => {
    const trigger = button('Edit label for My browser');
    expect(fixture.nativeElement.querySelectorAll('[aria-label^="Edit label"]')).toHaveLength(1);
    trigger.click();
    await settle();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('input'));
    fill('Discard this draft');
    button('Cancel').click();
    await settle();
    expect(document.activeElement).toBe(trigger);
    expect(client.rename).not.toHaveBeenCalled();
  });
  it('saves a label only on explicit submission and restores the trigger focus', async () => {
    button('Edit label for My browser').click();
    await settle();
    fill('  Study laptop  ');
    button('Save label').click();
    await settle();
    expect(client.rename).toHaveBeenCalledExactlyOnceWith('opaque-current', 'Study laptop');
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
      'Sign-in label saved',
    );
    expect(document.activeElement).toBe(button('Edit label for Study laptop'));
  });
  it('retains a failed label draft and focuses the error without inventing success', async () => {
    client.rename.mockRejectedValue(new SignInManagementError('unavailable'));
    button('Edit label for My browser').click();
    await settle();
    fill('Retain this draft');
    button('Save label').click();
    await settle();
    expect(fixture.nativeElement.querySelector('input').value).toBe('Retain this draft');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('[role="alert"]'));
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toBe('');
  });
  it('cancels selective sign-out without changing either session', async () => {
    button('Sign out Safari on iOS').click();
    await settle();
    expect(document.activeElement).toBe(button('Confirm sign out'));
    button('Cancel').click();
    await settle();
    expect(client.revoke).not.toHaveBeenCalled();
    expect(client.revokeOthers).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('2 of 2 active sign-ins');
    expect(document.activeElement).toBe(button('Sign out Safari on iOS'));
  });
  it('ends only the selected other sign-in and updates from the acknowledged inventory', async () => {
    button('Sign out Safari on iOS').click();
    await settle();
    button('Confirm sign out').click();
    await settle();
    expect(client.revoke).toHaveBeenCalledExactlyOnceWith('opaque-other');
    expect(client.revokeOthers).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('1 of 2 active sign-ins');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('h2'));
  });
  it('keeps sign-out-others a distinct explicit action', async () => {
    button('Sign out other sign-ins').click();
    await settle();
    expect(fixture.nativeElement.textContent).toContain('This sign-in stays active');
    button('Confirm sign out of others').click();
    await settle();
    expect(client.revokeOthers).toHaveBeenCalledExactlyOnceWith();
    expect(client.revoke).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Other sign-ins have been signed out');
  });
  it('does not claim sign-out after an uncertain response', async () => {
    client.revoke.mockRejectedValue(new Error('do not display raw server error'));
    button('Sign out Safari on iOS').click();
    await settle();
    button('Confirm sign out').click();
    await settle();
    expect(fixture.nativeElement.textContent).toContain('could not confirm the result');
    expect(fixture.nativeElement.textContent).toContain('2 of 2 active sign-ins');
    expect(fixture.nativeElement.textContent).not.toContain('raw server error');
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toBe('');
  });
  it('navigates to sign-in only after current-session acknowledgement', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    client.revoke.mockResolvedValue({ signedOut: true });
    button('Sign out this sign-in').click();
    await settle();
    expect(navigate).not.toHaveBeenCalled();
    button('Confirm sign out').click();
    await settle();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/sign-in']);
  });
  it('preserves a pending label through recent-auth confirmation and requires explicit retry', async () => {
    client.rename.mockRejectedValueOnce(new SignInManagementError('reauthentication-required'));
    button('Edit label for My browser').click();
    await settle();
    fill('Keep this label');
    button('Save label').click();
    await settle();
    const password = fixture.nativeElement.querySelector(
      'input[name="currentSignInPassword"]',
    ) as HTMLInputElement;
    expect(document.activeElement).toBe(password);
    expect(store.account()?.accountId).toBe('owner');
    password.value = 'synthetic password';
    password.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('Confirm identity').click();
    await settle();
    expect(client.reauthenticate).toHaveBeenCalledExactlyOnceWith('synthetic password');
    expect(client.rename).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('input[name="currentSignInPassword"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[name="signInLabel"]').value).toBe(
      'Keep this label',
    );
    expect(fixture.nativeElement.textContent).toContain('Review your change and submit it again');
    button('Save label').click();
    await settle();
    expect(client.rename).toHaveBeenCalledTimes(2);
  });

  it('ignores late responses after ownership changes', async () => {
    let resolve!: (value: ActiveSignInInventory) => void;
    client.rename.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    button('Edit label for My browser').click();
    await settle();
    fill('Old owner change');
    button('Save label').click();
    fixture.detectChanges();
    store.account.set({
      accountId: 'another',
      username: 'another',
      displayName: 'Another',
      topicGrants: [],
    });
    resolve({ ...initial, signIns: [] });
    await settle();
    expect(fixture.nativeElement.textContent).not.toContain('Sign-in label saved');
    expect(fixture.nativeElement.textContent).toContain('2 of 2 active sign-ins');
  });
});
