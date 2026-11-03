import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * DLV-969 (owner, 2026-11-03): the pages a DEV visitor can open before the owner admits them. They match the Gateway's
 * DevAdmission.OPEN_PAGES: our sign-in and sign-up pages and /welcome, where a waiting account lands.
 */
export function onGatePage(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  return path === '/welcome' || path === '/sign-in' || path.startsWith('/sign-in/') || path === '/sign-up' || path.startsWith('/sign-up/');
}

export interface DevSessionStatus { dev: true; deadline: string; warning: boolean; maintenance: boolean }
export function parseDevStatus(value: unknown): DevSessionStatus | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v['dev'] !== true || typeof v['deadline'] !== 'string' || typeof v['warning'] !== 'boolean' || typeof v['maintenance'] !== 'boolean') return null;
  if (v['deadline'] && !Number.isFinite(Date.parse(v['deadline']))) return null;
  return v as unknown as DevSessionStatus;
}

/**
 * The DEV session as the Gateway reports it (`/dev/session`): shared between the header (the DEV mark beside the brand
 * opens "Exit DEV environment", user decision 2026-11-03) and the slim notice that appears only for a shutdown warning
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
  /** True once the first `/dev/session` answer arrived; ordinary delivery has no DEV gate and knows that at once. */
  readonly known = signal(!environment.protectedContent);
  /**
   * True while this browser is outside the DEV gate: until the first answer, and afterwards while the gate answers but
   * this browser is not admitted. Pages before admission then offer nothing that leads into the platform.
   */
  readonly outsideGate = computed(() => !this.known() || (this.gated() && !this.status()));
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
    } catch { this.error.set('Unable to confirm leaving DEV. Retry Exit DEV environment.'); this.leaving.set(false); }
  }
}
