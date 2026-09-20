import { InjectionToken } from '@angular/core';
import { ActiveSignIn } from './active-sign-ins-client';

/** No learner account/content is exposed through this restricted presentation contract. */
export interface SignInChallenge {
  limit: number;
  signIns: ActiveSignIn[];
  expiresAt: string;
}

export interface SignInChallengeClient {
  loadChallenge(): Promise<SignInChallenge>;
  /** Resolves only after the service acknowledges admission. */
  replace(signInId: string): Promise<{ oauth: boolean }>;
  /** Resolves only after the restricted challenge is canceled; admitted sign-ins are preserved. */
  cancelChallenge(): Promise<void>;
}

export const SIGN_IN_CHALLENGE_CLIENT = new InjectionToken<SignInChallengeClient>(
  'Restricted sign-in challenge client',
);
