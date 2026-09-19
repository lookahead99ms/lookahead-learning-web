import { InjectionToken } from '@angular/core';

/** UI contract. The transport maps only authoritative account-management responses. */
export interface ManagedAccountProfile {
  displayName: string;
  username: string;
  signInMethod?: string;
}

export interface PasswordChange {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export type AccountSettingsErrorKind =
  | 'invalid-name'
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
  /** Resolves only after acknowledgement and clearing all client account state. */
  changePassword(change: PasswordChange): Promise<void>;
}

export const ACCOUNT_SETTINGS_CLIENT = new InjectionToken<AccountSettingsClient>(
  'Account settings client',
);
