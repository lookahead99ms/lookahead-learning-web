import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import {
  ACCOUNT_SETTINGS_CLIENT,
  AccountSettingsError,
  ManagedAccountProfile,
  PasswordChange,
  ProfileLinks,
} from './account-settings-client';
import { AccountThemePreference } from '../../core/account-theme';
import { accountMembership, joinPaths } from './account-membership';
import { PATH_TAGLINES } from '../../content/path-taglines';
import { PlatformThemeService, ThemePreference } from '../../core/platform-theme';
import {
  displayProfileLink,
  normalizeProfileLink,
  ProfileLinkKey,
  profileLinkFields,
} from './profile-links';

type PasswordField = keyof PasswordChange;

@Component({
  selector: 'app-account-settings',
  imports: [NgTemplateOutlet, RouterLink],
  templateUrl: './account-settings.html',
  styleUrl: './account-settings.css',
})
export class AccountSettings implements OnDestroy {
  readonly returnTo = input('/');
  protected readonly store = inject(StudyPlanAccount);
  private readonly client = inject(ACCOUNT_SETTINGS_CLIENT);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly owner = this.store.account()?.accountId;
  private destroyed = false;

  protected readonly profile = signal<ManagedAccountProfile | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly editingName = signal(false);
  protected readonly nameDraft = signal('');
  protected readonly savingName = signal(false);
  protected readonly profileError = signal('');
  protected readonly nameInvalid = signal(false);
  protected readonly profileStatus = signal('');
  protected readonly changingPassword = signal(false);
  protected readonly savingPassword = signal(false);
  protected readonly passwordError = signal('');
  protected readonly signOutError = signal('');
  protected readonly passwords = {
    currentPassword: signal(''),
    newPassword: signal(''),
    confirmPassword: signal(''),
  };
  protected readonly visible = signal<Record<PasswordField, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  protected readonly passwordFields = [
    { key: 'currentPassword', label: 'Current password', autocomplete: 'current-password' },
    { key: 'newPassword', label: 'New password', autocomplete: 'new-password' },
    { key: 'confirmPassword', label: 'Confirm new password', autocomplete: 'new-password' },
  ] as const;

  protected readonly theme = inject(PlatformThemeService);
  private readonly accountTheme = inject(AccountThemePreference);
  protected readonly themeOptions = [
    { value: 'light', label: 'Light', hint: 'Always light' },
    { value: 'dark', label: 'Dark', hint: 'Always dark' },
    { value: 'system', label: 'System', hint: 'Match this device' },
  ] as const;
  protected readonly savingTheme = signal(false);
  protected readonly themeStatus = signal('');

  protected readonly membership = computed(() => {
    const account = this.store.account();
    return account ? accountMembership(account) : null;
  });
  protected readonly joinPaths = joinPaths;
  // Each path's platform tagline, split as "Learn" + "to solve it on your own." (shared wording).
  private readonly catalogPaths = (['learn', 'grow', 'blaze'] as const).map((id) => {
    const headline = PATH_TAGLINES[id].headline;
    const space = headline.indexOf(' ');
    return {
      id,
      name: headline.slice(0, space),
      hint: headline.slice(space + 1),
      route: '/' + id,
    };
  });
  /** The paths the account's grants cover, or every path when it has none to narrow by. */
  protected browsePaths(granted: readonly string[]) {
    const covered = this.catalogPaths.filter((path) => granted.includes(path.name));
    return covered.length ? covered : this.catalogPaths;
  }

  protected readonly linkFields = profileLinkFields;
  protected readonly editingLinks = signal(false);
  protected readonly savingLinks = signal(false);
  protected readonly linksError = signal('');
  protected readonly linksStatus = signal('');
  protected readonly linkErrorField = signal<ProfileLinkKey | null>(null);
  protected readonly linkDrafts: Record<ProfileLinkKey, ReturnType<typeof signal<string>>> = {
    github: signal(''),
    linkedin: signal(''),
    x: signal(''),
    website: signal(''),
  };
  protected readonly displayUrl = displayProfileLink;
  /** Shown as empty rows until Identity reports saved links. */
  protected readonly noLinks: ProfileLinks = { github: null, linkedin: null, x: null, website: null };
  private lastLinkButton: ProfileLinkKey = 'github';
  private readonly linksErrorElement = viewChild<ElementRef<HTMLElement>>('linksErrorElement');

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly editNameButton = viewChild<ElementRef<HTMLButtonElement>>('editNameButton');
  private readonly passwordForm = viewChild<ElementRef<HTMLFormElement>>('passwordForm');
  private readonly changePasswordButton =
    viewChild<ElementRef<HTMLButtonElement>>('changePasswordButton');
  private readonly profileErrorElement = viewChild<ElementRef<HTMLElement>>('profileErrorElement');
  private readonly passwordErrorElement =
    viewChild<ElementRef<HTMLElement>>('passwordErrorElement');

  constructor() {
    void this.loadProfile();
  }

  private currentOwner(): boolean {
    return (
      !this.destroyed &&
      this.store.account()?.accountId === this.owner &&
      !this.store.sessionExpired()
    );
  }

  protected async loadProfile(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const profile = await this.client.loadProfile();
      if (this.currentOwner()) this.profile.set(profile);
    } catch (error) {
      if (this.currentOwner())
        this.loadError.set(
          error instanceof AccountSettingsError && error.kind === 'session-expired'
            ? 'Your session expired. Sign in again to manage your account.'
            : 'We could not load your account details. Please try again.',
        );
    } finally {
      this.loading.set(false);
    }
  }

  protected editName(): void {
    this.nameDraft.set(this.profile()?.displayName ?? '');
    this.profileError.set('');
    this.nameInvalid.set(false);
    this.profileStatus.set('');
    this.editingName.set(true);
    this.focusAfterRender(() => this.nameInput()?.nativeElement);
  }

  protected cancelName(): void {
    if (this.savingName()) return;
    this.nameDraft.set('');
    this.profileError.set('');
    this.editingName.set(false);
    this.focusAfterRender(() => this.editNameButton()?.nativeElement);
  }

  protected async saveName(): Promise<void> {
    if (
      this.savingName() ||
      this.savingPassword() ||
      this.store.busy() ||
      this.store.pending() ||
      !this.currentOwner()
    )
      return;
    this.profileError.set('');
    this.nameInvalid.set(false);
    this.profileStatus.set('');
    const displayName = this.nameDraft().trim();
    if (
      !displayName ||
      Array.from(displayName).length > 160 ||
      /[\u0000-\u001f\u007f-\u009f]/.test(displayName)
    ) {
      this.nameInvalid.set(true);
      this.profileError.set('Use 1 to 160 characters for your name, without control characters.');
      this.focusAfterRender(() => this.profileErrorElement()?.nativeElement);
      return;
    }
    this.savingName.set(true);
    try {
      const profile = await this.client.updateDisplayName(displayName);
      if (!this.currentOwner()) return;
      this.profile.set(profile);
      this.store.account.update((account) =>
        account ? { ...account, displayName: profile.displayName } : null,
      );
      this.nameDraft.set('');
      this.editingName.set(false);
      this.profileStatus.set('Your name has been updated.');
      this.focusAfterRender(() => this.editNameButton()?.nativeElement);
    } catch (error) {
      if (!this.currentOwner()) return;
      this.nameInvalid.set(error instanceof AccountSettingsError && error.kind === 'invalid-name');
      this.profileError.set(this.errorMessage(error, 'profile'));
      this.focusAfterRender(() => this.profileErrorElement()?.nativeElement);
    } finally {
      this.savingName.set(false);
    }
  }

  protected editLinks(focus: ProfileLinkKey = 'github'): void {
    const links = this.profile()?.links;
    for (const field of this.linkFields) this.linkDrafts[field.key].set(links?.[field.key] ?? '');
    this.linksError.set('');
    this.linkErrorField.set(null);
    this.linksStatus.set('');
    this.editingLinks.set(true);
    this.lastLinkButton = focus;
    this.focusAfterRender(() => this.hostInput('profile-link-' + focus));
  }

  protected cancelLinks(): void {
    if (this.savingLinks()) return;
    this.linksError.set('');
    this.linkErrorField.set(null);
    this.editingLinks.set(false);
    this.focusAfterRender(() => this.linkButton());
  }

  protected async saveLinks(): Promise<void> {
    if (this.savingLinks() || !this.currentOwner()) return;
    this.linksError.set('');
    this.linkErrorField.set(null);
    const links = {} as ProfileLinks;
    for (const field of this.linkFields) {
      const value = normalizeProfileLink(field, this.linkDrafts[field.key]());
      if (value === undefined) {
        this.linkErrorField.set(field.key);
        this.linksError.set(field.error);
        this.focusAfterRender(() => this.hostInput('profile-link-' + field.key));
        return;
      }
      links[field.key] = value;
    }
    this.savingLinks.set(true);
    try {
      const profile = await this.client.updateProfileLinks(links);
      if (!this.currentOwner()) return;
      this.profile.update((current) => (current ? { ...current, links: profile.links ?? links } : current));
      this.editingLinks.set(false);
      this.linksStatus.set('Your links have been saved.');
      this.focusAfterRender(() => this.linkButton());
    } catch (error) {
      if (!this.currentOwner()) return;
      this.linksError.set(
        error instanceof AccountSettingsError && error.kind === 'invalid-link'
          ? 'One of these addresses wasn’t accepted. Use the https:// address of each profile page.'
          : error instanceof AccountSettingsError && error.kind === 'session-expired'
            ? 'Your session expired. Sign in again to manage your account.'
            : 'We could not save your links. Your changes are still here; try again.',
      );
      this.focusAfterRender(() => this.linksErrorElement()?.nativeElement);
    } finally {
      this.savingLinks.set(false);
    }
  }

  protected async chooseTheme(preference: ThemePreference): Promise<void> {
    if (this.savingTheme()) return;
    this.themeStatus.set('');
    this.savingTheme.set(true);
    try {
      const saved = await this.accountTheme.choose(preference);
      if (this.destroyed) return;
      this.themeStatus.set(
        saved
          ? 'Theme saved to your account.'
          : 'Theme changed on this browser, but we could not save it to your account. Try again.',
      );
    } finally {
      this.savingTheme.set(false);
    }
  }

  private linkButton(): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>(
      `[data-link-button="${this.lastLinkButton}"]`,
    );
  }

  private hostInput(id: string): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>('#' + id);
  }

  protected openPassword(): void {
    this.clearPasswords();
    this.passwordError.set('');
    this.changingPassword.set(true);
    this.focusAfterRender(() => this.passwordForm()?.nativeElement.querySelector('input'));
  }

  protected cancelPassword(): void {
    if (this.savingPassword()) return;
    this.clearPasswords();
    this.passwordError.set('');
    this.changingPassword.set(false);
    this.focusAfterRender(() => this.changePasswordButton()?.nativeElement);
  }

  protected togglePassword(field: PasswordField): void {
    this.visible.update((state) => ({ ...state, [field]: !state[field] }));
  }

  protected async savePassword(): Promise<void> {
    if (
      this.savingPassword() ||
      this.savingName() ||
      this.store.busy() ||
      this.store.pending() ||
      !this.currentOwner()
    )
      return;
    const change: PasswordChange = {
      currentPassword: this.passwords.currentPassword(),
      newPassword: this.passwords.newPassword(),
      confirmPassword: this.passwords.confirmPassword(),
    };
    this.clearPasswords();
    this.passwordError.set('');
    const length = Array.from(change.newPassword).length;
    if (
      !change.currentPassword ||
      length < 15 ||
      length > 128 ||
      change.newPassword !== change.confirmPassword
    ) {
      this.passwordError.set(
        !change.currentPassword
          ? 'Enter your current password, then re-enter and confirm your new password.'
          : length < 15 || length > 128
            ? 'Use 15 to 128 characters for your new password. Re-enter all three fields.'
            : 'The new passwords do not match. Re-enter all three fields.',
      );
      this.focusAfterRender(() => this.passwordErrorElement()?.nativeElement);
      return;
    }
    this.savingPassword.set(true);
    try {
      await this.client.changePassword(change);
      await this.router.navigate(['/sign-in'], { state: { passwordChanged: true } });
    } catch (error) {
      if (!this.currentOwner()) return;
      this.passwordError.set(this.errorMessage(error, 'password'));
      this.focusAfterRender(() => this.passwordErrorElement()?.nativeElement);
    } finally {
      this.clearPasswords();
      this.savingPassword.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    this.signOutError.set('');
    this.clearPasswords();
    if (await this.store.logout()) {
      if (!this.store.logoutRedirectPending())
        await this.router.navigate(['/sign-in'], { queryParams: { returnTo: this.returnTo() } });
    } else {
      this.signOutError.set('We could not sign you out. Please try again.');
    }
  }

  private errorMessage(error: unknown, action: 'profile' | 'password'): string {
    const kind = error instanceof AccountSettingsError ? error.kind : 'unconfirmed';
    switch (kind) {
      case 'invalid-name':
        return 'Use 1 to 160 characters for your name, without control characters.';
      case 'password-policy':
        return 'Use 15 to 128 characters for your new password. Re-enter all three fields.';
      case 'password-common':
        return 'Choose a less common password or a longer passphrase. Re-enter all three fields.';
      case 'password-mismatch':
        return 'The new passwords do not match. Re-enter all three fields.';
      case 'password-unchanged':
        return 'We could not use that new password. Choose a different password and re-enter all three fields.';
      case 'change-rejected':
        return 'We could not confirm this change. Re-enter your current password and new password, then try again.';
      case 'session-expired':
        return 'Your session expired. Sign in again to manage your account.';
      case 'rate-limited':
        return 'Too many attempts. Wait 15 minutes before trying again.';
      case 'storage-unavailable':
        return action === 'profile'
          ? 'Account storage is temporarily unavailable. Your name draft is still here; try saving again shortly.'
          : 'Account storage is temporarily unavailable. Wait a moment, then re-enter all three fields and try again.';
      default:
        return action === 'profile'
          ? 'We could not confirm the update. Your name draft is still here; try again when your connection is available.'
          : 'We could not confirm the password change. Try signing in with your new password before making another change.';
    }
  }

  private clearPasswords(): void {
    for (const field of this.passwordFields) this.passwords[field.key].set('');
    this.visible.set({ currentPassword: false, newPassword: false, confirmPassword: false });
  }

  private focusAfterRender(target: () => HTMLElement | null | undefined): void {
    afterNextRender(
      () => {
        if (!this.destroyed) target()?.focus();
      },
      { injector: this.injector },
    );
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearPasswords();
  }
}
