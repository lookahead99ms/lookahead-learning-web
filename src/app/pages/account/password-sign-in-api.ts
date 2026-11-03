import { inject, Injectable, signal } from '@angular/core';
import { ACCOUNT_FETCH } from '../study-plan/study-plan-account';

/**
 * DLV-969: our own email-and-password pages in DEV and PROD. The Gateway calls Cognito's user-pool APIs behind each
 * route (InitiateAuth, RespondToAuthChallenge, SignUp, ConfirmSignUp, ResendConfirmationCode, ForgotPassword,
 * ConfirmForgotPassword) and keeps every token server-side; the browser only sees the next step.
 */
export type PasswordStep =
  /** Signed in: leave the page for this same-origin path (the Gateway decides, for example the DEV pending notice). */
  | { kind: 'signed-in'; next: string }
  /** Cognito asks an account created by the owner to choose its own password. */
  | { kind: 'new-password' }
  /** Cognito asks for a code from an authenticator app or an email. */
  | { kind: 'code'; method: 'app' | 'email' }
  /** A code was sent to this masked address (sign-up confirmation or password reset). */
  | { kind: 'code-sent'; destination: string }
  /** Done, but the person signs in again (for example after confirming an email). */
  | { kind: 'sign-in' };

export type PasswordProblem =
  | 'credentials'
  | 'not-confirmed'
  | 'code'
  | 'code-expired'
  | 'password-rules'
  | 'exists'
  | 'too-many'
  | 'expired'
  | 'unavailable';

export class PasswordSignInError extends Error {
  constructor(readonly problem: PasswordProblem) {
    super(problem);
  }
}

/** The pool's password rules (Infra assets template, application pool PasswordPolicy). */
export const PASSWORD_RULES = {
  minimum: 14,
  hint: 'At least 14 characters, with upper and lower case letters, a number and a symbol.',
};

export function meetsPasswordRules(password: string): boolean {
  return (
    Array.from(password).length >= PASSWORD_RULES.minimum &&
    Array.from(password).length <= 256 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9\s]/.test(password)
  );
}

export function problemMessage(problem: PasswordProblem): string {
  switch (problem) {
    case 'credentials':
      return "That email and password don't match.";
    case 'not-confirmed':
      return 'Confirm your email first. We sent you a code when you signed up.';
    case 'code':
      return "That code isn't right. Check the email and try again.";
    case 'code-expired':
      return 'That code has expired. Send a new one.';
    case 'password-rules':
      return PASSWORD_RULES.hint;
    case 'exists':
      return 'An account with this email already exists. Sign in instead, or reset the password.';
    case 'too-many':
      return 'Too many attempts. Wait a few minutes, then try again.';
    case 'expired':
      return 'This step took too long. Start again.';
    case 'unavailable':
      return "Sign-in isn't available right now. Try again in a minute.";
  }
}

const PROBLEMS: Record<string, PasswordProblem> = {
  INVALID_CREDENTIALS: 'credentials',
  USER_NOT_CONFIRMED: 'not-confirmed',
  CODE_MISMATCH: 'code',
  CODE_EXPIRED: 'code-expired',
  INVALID_PASSWORD: 'password-rules',
  USERNAME_EXISTS: 'exists',
  TOO_MANY_REQUESTS: 'too-many',
  STEP_EXPIRED: 'expired',
};

/** Only a same-origin path leaves the page; anything else lands on the home page. */
export function safeNext(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
    ? value
    : '/';
}

export function maskEmail(email: string): string {
  const [name, domain] = email.trim().split('@');
  if (!name || !domain) return email.trim();
  return name[0] + '•••@' + domain;
}

@Injectable({ providedIn: 'root' })
export class PasswordSignInApi {
  private readonly transport = inject(ACCOUNT_FETCH);
  /** The email of the flow in progress, kept in memory only (never in the address bar). */
  readonly email = signal('');
  /** The masked address the last code went to, as Cognito reported it. */
  readonly destination = signal('');
  /** Which code the current sign-in asks for. */
  readonly codeMethod = signal<'app' | 'email'>('email');

  signIn(email: string, password: string, returnTo: string): Promise<PasswordStep> {
    this.email.set(email.trim());
    return this.post('/sign-in', { email: email.trim(), password, returnTo });
  }

  respond(answer: { newPassword: string } | { code: string }): Promise<PasswordStep> {
    return this.post('/challenge', answer);
  }

  signUp(details: { firstName: string; lastName: string; email: string; password: string; returnTo: string }): Promise<PasswordStep> {
    this.email.set(details.email.trim());
    return this.post('/sign-up', { ...details, email: details.email.trim() });
  }

  confirm(code: string, returnTo: string): Promise<PasswordStep> {
    return this.post('/sign-up/confirm', { email: this.email(), code: code.trim(), returnTo });
  }

  resend(): Promise<PasswordStep> {
    return this.post('/sign-up/resend', { email: this.email() });
  }

  forgot(email: string): Promise<PasswordStep> {
    this.email.set(email.trim());
    return this.post('/password/forgot', { email: email.trim() });
  }

  reset(code: string, newPassword: string, returnTo: string): Promise<PasswordStep> {
    return this.post('/password/reset', { email: this.email(), code: code.trim(), newPassword, returnTo });
  }

  private async csrf(): Promise<{ token: string; headerName: string }> {
    const response = await this.transport('/bff/api/v1/auth/csrf', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new PasswordSignInError('unavailable');
    const data = (await response.json())?.data;
    if (typeof data?.token !== 'string' || typeof data?.headerName !== 'string') throw new PasswordSignInError('unavailable');
    return data;
  }

  private async post(path: string, body: unknown): Promise<PasswordStep> {
    let response: Response;
    try {
      const csrf = await this.csrf();
      response = await this.transport('/bff/api/v1/auth/password' + path, {
        method: 'POST',
        headers: { [csrf.headerName]: csrf.token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      if (error instanceof PasswordSignInError) throw error;
      throw new PasswordSignInError('unavailable');
    }
    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const code = typeof payload?.code === 'string' ? payload.code : '';
      throw new PasswordSignInError(PROBLEMS[code] ?? (response.status === 429 ? 'too-many' : 'unavailable'));
    }
    return step(payload?.data);
  }
}

function step(data: any): PasswordStep {
  switch (data?.step) {
    case 'SIGNED_IN':
      return { kind: 'signed-in', next: safeNext(data.next) };
    case 'NEW_PASSWORD':
      return { kind: 'new-password' };
    case 'APP_CODE':
      return { kind: 'code', method: 'app' };
    case 'EMAIL_CODE':
      return { kind: 'code', method: 'email' };
    case 'CODE_SENT':
      return { kind: 'code-sent', destination: typeof data.destination === 'string' ? data.destination : '' };
    case 'SIGN_IN':
      return { kind: 'sign-in' };
    default:
      throw new PasswordSignInError('unavailable');
  }
}
