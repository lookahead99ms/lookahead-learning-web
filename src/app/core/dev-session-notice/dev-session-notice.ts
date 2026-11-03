import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, effect, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { DevSession, parseDevStatus } from './dev-session';

export { parseDevStatus } from './dev-session';
export type { DevSessionStatus } from './dev-session';

/**
 * Polls the Gateway's `/dev/session` and shows a slim notice only when DEV is about to shut down or is in maintenance.
 * The everyday "test environment" line moved into the header (user decision 2026-11-02): the brand reads
 * "LookAhead DEV", and the DEV mark beside it opens "Exit DEV environment" (user, 2026-11-03).
 */
@Component({
  selector: 'app-dev-session-notice',
  template: `@if (status(); as session) {
    @if (session.maintenance || session.warning) {
      <aside aria-label="DEV session" class="dev-session-notice">
        <span class="dev-session-label">DEV</span>
        <span role="status">@if (session.maintenance) { Maintenance is in progress. You may need to sign in again. }
          @else { DEV shuts down at {{ deadlineLabel() }}. Save your work. }</span>
      </aside>
    }
  }`,
  styles: `.dev-session-notice { display:flex; flex-wrap:wrap; align-items:center; gap:.75rem; padding:.5rem 1rem; border-bottom:1px solid var(--line); background: var(--surface-muted); color: var(--text-body); font-size:.875rem; }
    .dev-session-label { font-weight: 700; letter-spacing: .08em; font-size: .72rem; color: var(--text-subtle); }`,
})
export class DevSessionNotice {
  private readonly session = inject(DevSession);
  readonly status = this.session.status;
  readonly leaving = this.session.leaving;
  readonly error = this.session.error;
  private readonly destroyRef = inject(DestroyRef);
  private destroyed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor() {
    this.destroyRef.onDestroy(() => { this.destroyed = true; clearTimeout(this.timer); });
    if (environment.protectedContent) void this.poll();
    // DLV-969: in DEV, prices stay blurred until hovered (user, 2026-11-03); the rule is in styles.css.
    const root = inject(DOCUMENT).documentElement;
    effect(() => root.toggleAttribute('data-dev', this.session.gated()));
  }
  deadlineLabel(): string {
    const deadline = this.status()?.deadline;
    return deadline ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(deadline)) : 'the scheduled cutoff';
  }
  private async poll(): Promise<void> {
    try {
      const response = await fetch('/dev/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (response.status === 404) { this.session.known.set(true); return; } // Ordinary local/prod delivery has no DEV control.
      this.session.gated.set(true); // 200, 401 or 503: the DEV gate answered, admitted or not.
      if (response.ok) this.status.set(parseDevStatus(await response.json()));
      this.session.known.set(true);
    } catch { /* A failed poll must not claim a changed shutdown deadline. */ }
    if (!this.destroyed) {
      this.timer = setTimeout(() => { if (!this.destroyed) void this.poll(); }, 30000);
    }
  }
  leave(): Promise<void> { return this.session.leave(); }
}
