import { Component, computed, inject } from '@angular/core';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import { TestSessions, roleLabel, scenarioDetail, scenarioPlan } from './test-sessions';

/**
 * DLV-969 (owner, 2026-11-04): while a test account is in use, a slim bar under the header says which one, with Switch
 * and Back to my account, so nobody forgets they are looking through a test account.
 */
@Component({
  selector: 'app-test-session-bar',
  template: `@if (sessions.active()) {
    <aside class="test-bar" aria-label="Test account in use">
      <span class="test-bar-mark">Test account</span>
      <p class="test-bar-who">
        <strong>{{ name() }}</strong>
        @if (described(); as text) {<span class="test-bar-scenario">{{ text }}</span>}
      </p>
      <div class="test-bar-actions">
        <button type="button" class="test-bar-link" [disabled]="sessions.returning()" (click)="sessions.open()">Switch</button>
        <button type="button" class="test-bar-back" [disabled]="sessions.returning()" [attr.aria-busy]="sessions.returning()" (click)="sessions.back()">
          {{ sessions.returning() ? 'Going back…' : 'Back to my account' }}
        </button>
      </div>
      @if (sessions.error() && !sessions.pickerOpen()) {
        <p class="test-bar-error" role="alert">{{ sessions.error() }}</p>
      }
    </aside>
  }`,
  styles: `
    .test-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 14px;
      padding: 7px max(16px, var(--page-gutter, 16px));
      border-bottom: 1px solid color-mix(in srgb, var(--warning) 55%, var(--line));
      background: color-mix(in srgb, var(--warning) 16%, var(--surface));
      color: var(--text-body);
      font-size: 0.875rem;
    }
    .test-bar-mark {
      padding: 2px 8px;
      border-radius: 6px;
      background: var(--warning);
      color: #1d1606;
      font-size: 0.7rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .test-bar-who {
      display: flex;
      flex: 1;
      flex-wrap: wrap;
      gap: 2px 10px;
      min-width: 0;
      margin: 0;
    }
    .test-bar-who strong { color: var(--text-strong); }
    .test-bar-scenario { color: var(--text-subtle); }
    .test-bar-actions { display: flex; gap: 8px; }
    .test-bar-link,
    .test-bar-back {
      min-height: 32px;
      padding: 4px 14px;
      border-radius: 999px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .test-bar-link {
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--text-body);
    }
    .test-bar-back {
      border: 1px solid var(--text-strong);
      background: var(--text-strong);
      color: var(--surface);
    }
    .test-bar-link:focus-visible,
    .test-bar-back:focus-visible {
      outline: 3px solid var(--accent-focus);
      outline-offset: 2px;
    }
    .test-bar-error { flex-basis: 100%; margin: 0; color: var(--danger); font-weight: 650; }
    @media (max-width: 600px) {
      .test-bar-actions { flex-basis: 100%; }
      .test-bar-actions button { flex: 1; }
    }
  `,
})
export class TestSessionBar {
  protected readonly sessions = inject(TestSessions);
  private readonly accounts = inject(StudyPlanAccount);
  private readonly current = computed(() => this.sessions.current(this.accounts.account()?.accountId));
  protected readonly name = computed(() => this.current()?.displayName ?? this.accounts.account()?.displayName ?? 'Test account');
  protected readonly described = computed(() => {
    const account = this.current();
    if (!account) return null;
    const plan = scenarioPlan(account);
    // A learner reads "Learn · active · …"; staff read their scenario, which already names the role.
    return plan ? [plan, scenarioDetail(account)].filter(Boolean).join(' · ') : account.scenario ?? roleLabel(account);
  });
}
