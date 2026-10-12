import { TestBed } from '@angular/core/testing';
import { StudyPlanAccount } from '../pages/study-plan/study-plan-account';
import { AccountThemePreference } from './account-theme';
import { PlatformThemeService } from './platform-theme';

describe('AccountThemePreference', () => {
  let accounts: StudyPlanAccount;
  let theme: PlatformThemeService;
  beforeEach(() => {
    accounts = TestBed.inject(StudyPlanAccount);
    theme = TestBed.inject(PlatformThemeService);
    theme.setTheme('light');
  });
  afterEach(() => document.documentElement.removeAttribute('data-theme'));

  function signIn(accountId = 'synthetic-account'): void {
    accounts.account.set({ accountId, username: 'sample@example.test', displayName: 'Sample', topicGrants: [] });
  }

  it('applies the account theme once after sign-in', async () => {
    const load = vi.spyOn(accounts, 'loadThemePreference').mockResolvedValue('dark');
    TestBed.inject(AccountThemePreference);
    signIn();
    TestBed.tick();
    await vi.waitFor(() => expect(theme.selected()).toBe('dark'));
    TestBed.tick();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps the browser theme when the account has none or cannot be read', async () => {
    vi.spyOn(accounts, 'loadThemePreference').mockResolvedValue(null);
    TestBed.inject(AccountThemePreference);
    signIn();
    TestBed.tick();
    await Promise.resolve();
    expect(theme.preference()).toBe('light');
  });

  it('saves a chosen theme to the signed-in account and reports a failed save', async () => {
    vi.spyOn(accounts, 'loadThemePreference').mockResolvedValue(null);
    const save = vi.spyOn(accounts, 'updateThemePreference').mockResolvedValue({
      displayName: 'Sample',
      username: 'sample@example.test',
      themePreference: 'system',
    });
    const service = TestBed.inject(AccountThemePreference);
    signIn();
    expect(await service.choose('system')).toBe(true);
    expect(save).toHaveBeenCalledWith('system');
    expect(theme.preference()).toBe('system');
    save.mockRejectedValueOnce(new Error('offline'));
    expect(await service.choose('dark')).toBe(false);
    expect(theme.preference()).toBe('dark');
  });

  it('only changes the browser theme when signed out', async () => {
    const save = vi.spyOn(accounts, 'updateThemePreference');
    const service = TestBed.inject(AccountThemePreference);
    expect(await service.choose('dark')).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(theme.selected()).toBe('dark');
  });
});
