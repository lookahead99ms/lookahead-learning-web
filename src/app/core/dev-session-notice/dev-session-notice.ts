import { Component, DestroyRef, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface DevSessionStatus { dev: true; deadline: string; warning: boolean; maintenance: boolean }
export function parseDevStatus(value: unknown): DevSessionStatus | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v['dev'] !== true || typeof v['deadline'] !== 'string' || typeof v['warning'] !== 'boolean' || typeof v['maintenance'] !== 'boolean') return null;
  if (v['deadline'] && !Number.isFinite(Date.parse(v['deadline']))) return null;
  return v as unknown as DevSessionStatus;
}
@Component({
  selector: 'app-dev-session-notice',
  template: `@if (status(); as session) {
    <aside aria-label="DEV session" class="dev-session-notice">
      <span>DEV</span>
      <span role="status">@if (session.maintenance) { Maintenance is in progress. You may need to sign in again. }
        @else if (session.warning) { DEV shuts down at {{ deadlineLabel() }}. Save your work. }
        @else { Test environment. Saved progress persists when DEV stops. }</span>
      <button type="button" (click)="leave()" [disabled]="leaving()">Leave DEV</button>
      @if (error()) { <span role="alert">{{ error() }}</span> }
    </aside>
  }`,
  styles: `.dev-session-notice { display:flex; flex-wrap:wrap; align-items:center; gap:.75rem; padding:.6rem 1rem; border-bottom:1px solid currentColor; font-size:.875rem; }
    .dev-session-notice button { margin-inline-start:auto; padding:.4rem .7rem; font:inherit; cursor:pointer; }
    .dev-session-notice button:focus-visible { outline:2px solid currentColor; outline-offset:3px; }`,
})
export class DevSessionNotice {
  readonly status = signal<DevSessionStatus | null>(null);
  readonly leaving = signal(false);
  readonly error = signal('');
  private readonly destroyRef = inject(DestroyRef);
  private destroyed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor() {
    this.destroyRef.onDestroy(() => { this.destroyed = true; clearTimeout(this.timer); });
    if (environment.protectedContent) void this.poll();
  }
  deadlineLabel(): string {
    const deadline = this.status()?.deadline;
    return deadline ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(deadline)) : 'the scheduled cutoff';
  }
  private async poll(): Promise<void> {
    try {
      const response = await fetch('/dev/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (response.status === 404) return; // Ordinary local/prod delivery has no DEV control.
      if (response.ok) this.status.set(parseDevStatus(await response.json()));
    } catch { /* A failed poll must not claim a changed shutdown deadline. */ }
    if (!this.destroyed) {
      this.timer = setTimeout(() => { if (!this.destroyed) void this.poll(); }, 30000);
    }
  }
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
