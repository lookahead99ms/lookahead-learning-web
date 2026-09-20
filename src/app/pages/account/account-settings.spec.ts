import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { AccountSettings } from './account-settings';
import { ACCOUNT_SETTINGS_CLIENT, AccountSettingsError } from './account-settings-client';

describe('Manage account', () => {
  let fixture: ComponentFixture<AccountSettings>;
  let store: StudyPlanAccount;
  const profile = { displayName: 'Sample Learner', username: 'sample@example.test' };
  let client: {
    loadProfile: ReturnType<typeof vi.fn>;
    updateDisplayName: ReturnType<typeof vi.fn>;
    changePassword: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    client = {
      loadProfile: vi.fn().mockResolvedValue(profile),
      updateDisplayName: vi
        .fn()
        .mockImplementation(async (displayName: string) => ({ ...profile, displayName })),
      changePassword: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      imports: [AccountSettings],
      providers: [provideRouter([]), { provide: ACCOUNT_SETTINGS_CLIENT, useValue: client }],
    });
    store = TestBed.inject(StudyPlanAccount);
    store.account.set({
      accountId: 'private-account-id',
      ...profile,
      topicGrants: [],
      authorPreview: true,
    });
    fixture = TestBed.createComponent(AccountSettings);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function button(text: string): HTMLButtonElement {
    const result = [
      ...(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>),
    ].find((b) => b.textContent?.trim() === text);
    expect(result, text).toBeDefined();
    return result!;
  }
  function fill(name: string, value: string): HTMLInputElement {
    const input = fixture.nativeElement.querySelector(`input[name="${name}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    return input;
  }
  function openPassword(): void {
    button('Change password').click();
    fixture.detectChanges();
  }
  function enterPasswords(
    newPassword = 'a unique sample passphrase',
    confirmation = newPassword,
  ): void {
    fill('currentPassword', 'legacy');
    fill('newPassword', newPassword);
    fill('confirmPassword', confirmation);
  }
  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }
  function expectPasswordsCleared(): void {
    for (const input of fixture.nativeElement.querySelectorAll(
      '.password-input input',
    ) as NodeListOf<HTMLInputElement>) {
      expect(input.value).toBe('');
      expect(input.type).toBe('password');
    }
  }

  it('shows only editable name and read-only sign-in identity, with no inferred method or internals', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain(profile.displayName);
    expect(text).toContain(profile.username);
    expect(text).not.toMatch(
      /private-account-id|authorPreview|Sign-in method|Subscription|Delete account|MFA/,
    );
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
  });

  it('saves a trimmed name and announces it while keeping username and grants intact', async () => {
    button('Edit name').click();
    fixture.detectChanges();
    fill('displayName', '  Updated Learner  ');
    button('Save name').click();
    await settle();
    expect(client.updateDisplayName).toHaveBeenCalledExactlyOnceWith('Updated Learner');
    expect(store.account()).toEqual({
      accountId: 'private-account-id',
      username: profile.username,
      displayName: 'Updated Learner',
      topicGrants: [],
      authorPreview: true,
    });
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
      'Your name has been updated.',
    );
    expect(fixture.nativeElement.querySelector('input[name="displayName"]')).toBeNull();
  });

  it('cancels an edit without calling the server', () => {
    button('Edit name').click();
    fixture.detectChanges();
    fill('displayName', 'Discard this name');
    button('Cancel').click();
    fixture.detectChanges();
    expect(client.updateDisplayName).not.toHaveBeenCalled();
    expect(store.account()?.displayName).toBe(profile.displayName);
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
  });

  it('preserves the name draft on a recoverable failure', async () => {
    client.updateDisplayName.mockRejectedValue(new AccountSettingsError('storage-unavailable'));
    button('Edit name').click();
    fixture.detectChanges();
    fill('displayName', 'Keep this draft');
    button('Save name').click();
    await settle();
    expect(fixture.nativeElement.querySelector('input').value).toBe('Keep this draft');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'draft is still here',
    );
    expect(store.account()?.displayName).toBe(profile.displayName);
  });

  it.each(['', 'a'.repeat(161), 'name\u0000value'])(
    'rejects an invalid display name before calling the server',
    async (name) => {
      button('Edit name').click();
      fixture.detectChanges();
      fill('displayName', name);
      button('Save name').click();
      await settle();
      expect(client.updateDisplayName).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
        '1 to 160 characters',
      );
    },
  );

  it('does not apply a late name response after the account changes', async () => {
    let resolve!: (value: typeof profile) => void;
    client.updateDisplayName.mockReturnValue(new Promise((r) => (resolve = r)));
    button('Edit name').click();
    fixture.detectChanges();
    fill('displayName', 'Old owner update');
    button('Save name').click();
    fixture.detectChanges();
    store.account.set({
      accountId: 'other-owner',
      displayName: 'Other learner',
      username: 'other@example.test',
      topicGrants: [],
    });
    resolve({ ...profile, displayName: 'Old owner update' });
    await settle();
    expect(store.account()?.displayName).toBe('Other learner');
  });

  it('explains global sign-out before submission and gives every password its own reveal control', () => {
    openPassword();
    enterPasswords();
    expect(fixture.nativeElement.textContent).toContain(
      'Changing your password ends all sign-ins, including this one. Sign in again with your new password.',
    );
    for (const [name, label, autocomplete] of [
      ['currentPassword', 'current password', 'current-password'],
      ['newPassword', 'new password', 'new-password'],
      ['confirmPassword', 'confirm new password', 'new-password'],
    ]) {
      const input = fixture.nativeElement.querySelector(
        `input[name="${name}"]`,
      ) as HTMLInputElement;
      const toggle = fixture.nativeElement.querySelector(
        `button[aria-label="Show ${label}"]`,
      ) as HTMLButtonElement;
      expect(input.autocomplete).toBe(autocomplete);
      expect(input.hasAttribute('maxlength')).toBe(false);
      expect(toggle.getAttribute('aria-controls')).toBe(input.id);
      toggle.click();
      fixture.detectChanges();
      expect(input.type).toBe('text');
      expect(toggle.getAttribute('aria-label')).toBe(`Hide ${label}`);
      toggle.click();
      fixture.detectChanges();
      expect(input.type).toBe('password');
    }
    expect(client.changePassword).not.toHaveBeenCalled();
  });

  it.each(['😀'.repeat(14), 'a'.repeat(129)])(
    'counts Unicode code points for password limits',
    async (value) => {
      openPassword();
      enterPasswords(value);
      button('Save new password').click();
      await settle();
      expect(client.changePassword).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
        '15 to 128 characters',
      );
      expectPasswordsCleared();
    },
  );

  it('accepts 128 Unicode code points and does not apply the new policy to the current password', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    openPassword();
    enterPasswords('😀'.repeat(128));
    button('Save new password').click();
    await settle();
    expect(client.changePassword).toHaveBeenCalledExactlyOnceWith({
      currentPassword: 'legacy',
      newPassword: '😀'.repeat(128),
      confirmPassword: '😀'.repeat(128),
    });
    expect(navigate).toHaveBeenCalledWith(['/sign-in'], {
      state: { passwordChanged: true },
    });
    expectPasswordsCleared();
  });

  it('rejects mismatched passwords and clears all fields', async () => {
    openPassword();
    enterPasswords('a unique sample passphrase', 'a different sample passphrase');
    button('Save new password').click();
    await settle();
    expect(client.changePassword).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'do not match',
    );
    expectPasswordsCleared();
  });

  it.each([
    ['password-common', 'less common'],
    ['change-rejected', 'could not confirm this change'],
    ['rate-limited', 'Wait 15 minutes'],
    ['storage-unavailable', 'temporarily unavailable'],
  ] as const)(
    'offers safe actionable recovery for %s and clears secrets',
    async (kind, message) => {
      client.changePassword.mockRejectedValue(new AccountSettingsError(kind));
      openPassword();
      enterPasswords();
      button('Save new password').click();
      await settle();
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(message);
      expectPasswordsCleared();
    },
  );

  it('prevents duplicate submissions and clears secrets while the request is pending', async () => {
    let reject!: (error: Error) => void;
    client.changePassword.mockReturnValue(new Promise((_resolve, r) => (reject = r)));
    openPassword();
    enterPasswords();
    button('Save new password').click();
    fixture.detectChanges();
    expectPasswordsCleared();
    expect(button('Changing password…').disabled).toBe(true);
    button('Changing password…').click();
    expect(client.changePassword).toHaveBeenCalledTimes(1);
    reject(new AccountSettingsError('rate-limited'));
    await settle();
  });

  it('clears the password draft when cancelled and reopened', () => {
    openPassword();
    enterPasswords();
    button('Cancel').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[name="currentPassword"]')).toBeNull();
    openPassword();
    expectPasswordsCleared();
    expect(client.changePassword).not.toHaveBeenCalled();
  });
});
