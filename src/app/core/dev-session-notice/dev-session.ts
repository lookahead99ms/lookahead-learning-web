import { Injectable, signal } from '@angular/core';

export interface DevSessionStatus { dev: true; deadline: string; warning: boolean; maintenance: boolean }
export function parseDevStatus(value: unknown): DevSessionStatus | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v['dev'] !== true || typeof v['deadline'] !== 'string' || typeof v['warning'] !== 'boolean' || typeof v['maintenance'] !== 'boolean') return null;
  if (v['deadline'] && !Number.isFinite(Date.parse(v['deadline']))) return null;
  return v as unknown as DevSessionStatus;
}

/**
 * The DEV session as the Gateway reports it (`/dev/session`): shared between the header (DEV mark beside the brand,
 * "Leave DEV" beside Sign in; user decision 2026-11-02) and the slim notice that appears only for a shutdown warning
 * or a maintenance hold. `DevSessionNotice` owns the polling; this service owns the state and the sign-out.
 */
@Injectable({ providedIn: 'root' })
export class DevSession {
  readonly status = signal<DevSessionStatus | null>(null);
  /**
   * DLV-969: true once the Gateway answered `/dev/session` at all (200, 401 or 503), so this is DEV behind the gate even
   * when this browser is not admitted yet (a person waiting for approval). Ordinary delivery answers 404 and stays false.
   */
  readonly gated = signal(false);
  readonly leaving = signal(false);
  readonly error = signal('');
  async leave(): Promise<void> {
    this.leaving.set(true); this.error.set('');
    try {
      const csrfResponse = await fetch('/dev/csrf', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!csrfResponse.ok) throw new Error();
      const csrf = await csrfResponse.json();
      if (csrf.headerName !== 'X-CSRF-TOKEN' || typeof csrf.token !== 'string') throw new Error();
      const response = await fetch('/dev/leave', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-TOKEN': csrf.token }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      const result = await response.json(); const destination = new URL(result.logoutUrl);
      if (destination.protocol !== 'https:' || !destination.hostname.endsWith('.amazoncognito.com') || destination.pathname !== '/logout') throw new Error();
      window.location.assign(destination.href);
    } catch { this.error.set('Unable to confirm sign-out. Retry Leave DEV.'); this.leaving.set(false); }
  }
}
