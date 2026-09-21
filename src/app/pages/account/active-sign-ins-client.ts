import { InjectionToken } from '@angular/core';

/** Presentation contract; the adapter must map the authoritative Gateway response. */
export interface ActiveSignIn {
  id: string;
  current: boolean;
  label: string | null;
  clientDescription: string;
  createdAt: string;
  lastActiveAt: string;
}

export interface ActiveSignInInventory {
  /** Null means Local development has no admission cap. */
  limit: number | null;
  signIns: ActiveSignIn[];
  labelsEditable: boolean;
}

export type SignInErrorKind =
  | 'expired'
  | 'reauthentication-required'
  | 'reauthentication-rejected'
  | 'invalid-label'
  | 'changed'
  | 'rate-limited'
  | 'unavailable'
  | 'unconfirmed';

export class SignInManagementError extends Error {
  constructor(readonly kind: SignInErrorKind) {
    super(kind);
  }
}

export interface ActiveSignInsClient {
  load(): Promise<ActiveSignInInventory>;
  rename(id: string, label: string): Promise<ActiveSignInInventory>;
  /** Current-session success must also clear the client account/session state. */
  revoke(id: string): Promise<{ signedOut: boolean; inventory?: ActiveSignInInventory }>;
  revokeOthers(): Promise<ActiveSignInInventory>;
  reauthenticate(password: string): Promise<void>;
}

export const ACTIVE_SIGN_INS_CLIENT = new InjectionToken<ActiveSignInsClient>(
  'Active sign-ins client',
);
