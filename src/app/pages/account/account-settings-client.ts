import { InjectionToken } from '@angular/core';
import type { ThemePreference } from '../../core/platform-theme';

/** Public profile links Identity stores; null means not set. */
export interface ProfileLinks {
  github: string | null;
  linkedin: string | null;
  x: string | null;
  website: string | null;
}

/** How a person signs in: 'google' through Google, 'cognito' with email and password (DLV-969). */
export type SignInProvider = 'google' | 'cognito';

export interface AccountSignInMethod {
  provider: SignInProvider;
  /** The verified email of that method; absent when the service has none. */
  email?: string;
}

/** UI contract. The transport maps only authoritative account-management responses. */
export interface ManagedAccountProfile {
  displayName: string;
  username: string;
  /** 'google' when this session signed in through Google (DLV-969). */
  signInMethod?: string;
  /** Every sign-in method of the account, once the Domain reports them (DLV-969 account linking). */
  signInMethods?: AccountSignInMethod[];
  /** The provider-verified email, for a Google account its Gmail; absent when the service has none. */
  email?: string;
  /** Absent when Identity does not report it (older service). */
  themePreference?: ThemePreference;
  links?: ProfileLinks;
}

export interface PasswordChange {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export type AccountSettingsErrorKind =
  | 'invalid-name'
  | 'invalid-link'
  | 'invalid-preference'
  | 'password-policy'
  | 'password-common'
  | 'password-mismatch'
  | 'password-unchanged'
  | 'change-rejected'
  | 'session-expired'
  | 'rate-limited'
  | 'storage-unavailable'
  | 'unconfirmed';

export class AccountSettingsError extends Error {
  constructor(readonly kind: AccountSettingsErrorKind) {
    super(kind);
  }
}

export interface AccountSettingsClient {
  loadProfile(): Promise<ManagedAccountProfile>;
  updateDisplayName(displayName: string): Promise<ManagedAccountProfile>;
  updateThemePreference(theme: ThemePreference): Promise<ManagedAccountProfile>;
  updateProfileLinks(links: ProfileLinks): Promise<ManagedAccountProfile>;
  /** Resolves only after acknowledgement and clearing all client account state. */
  changePassword(change: PasswordChange): Promise<void>;
}

/**
 * Keeps only well-formed methods, Google first, without repeats. Returns an empty list for anything
 * that is not an array, so callers can fall back.
 */
export function readSignInMethods(value: unknown): AccountSignInMethod[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const methods: AccountSignInMethod[] = [];
  for (const entry of value as unknown[]) {
    if (!entry || typeof entry !== 'object') continue;
    const { provider, email } = entry as { provider?: unknown; email?: unknown };
    if (provider !== 'google' && provider !== 'cognito') continue;
    const method: AccountSignInMethod = { provider };
    if (typeof email === 'string' && email) method.email = email;
    const key = provider + '\n' + (method.email ?? '');
    if (seen.has(key)) continue;
    seen.add(key);
    methods.push(method);
  }
  return methods.sort((a, b) => (a.provider === b.provider ? 0 : a.provider === 'google' ? -1 : 1));
}

/**
 * The account's sign-in methods. An older Domain sends no list, so the one method of this
 * session stands in. With no method reported at all the list is empty: nothing is guessed.
 */
export function accountSignInMethods(profile: ManagedAccountProfile): AccountSignInMethod[] {
  const reported = readSignInMethods(profile.signInMethods);
  if (reported.length) return reported;
  return readSignInMethods([{ provider: profile.signInMethod, email: profile.email }]);
}

export const ACCOUNT_SETTINGS_CLIENT = new InjectionToken<AccountSettingsClient>(
  'Account settings client',
);
