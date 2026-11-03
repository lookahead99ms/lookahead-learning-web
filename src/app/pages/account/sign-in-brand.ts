import { Component, computed, inject, input } from '@angular/core';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { PathMarks } from '../../core/path-marks/path-marks';
import { PlatformBrand } from '../../core/platform-brand/platform-brand';
import { PlatformSignature } from '../../core/platform-signature/platform-signature';

/** Which step of the sign-in or sign-up flow the panel sits beside. */
export type SignInBrandVariant = 'sign-in' | 'sign-up' | 'confirm' | 'forgot' | 'reset' | 'new-password' | 'code';

interface ProgressRow { label: string; state: 'done' | 'current' | 'next' }

/**
 * DLV-969: the Look Ahead side of every sign-in and sign-up screen. The logo stays on every step; the rest changes with
 * the step so consecutive screens never repeat the same panel (user, 2026-11-02). On a phone only the logo and the
 * headline remain above the form.
 */
@Component({
  selector: 'app-sign-in-brand',
  imports: [PlatformBrand, PlatformSignature, PathMarks],
  template: `
    <app-platform-brand class="brand-logo" [mark]="dev() ? 'DEV' : null" />
    <p class="brand-headline">{{ headline() }}</p>
    @switch (variant()) {
      @case ('sign-in') {
        <p class="brand-signature brand-extra"><app-platform-signature /></p>
        <app-path-marks class="brand-paths brand-extra" />
      }
      @case ('sign-up') {
        <ul class="brand-points brand-extra">
          <li>A study plan that adjusts when your week changes.</li>
          <li>Your plans and progress saved to your account.</li>
          <li>Practice and quick recall beside your lessons.</li>
        </ul>
      }
      @case ('forgot') {
        <p class="brand-text brand-extra">Your study plans and progress stay exactly as they are.</p>
        <p class="brand-text brand-extra">We email a short code. Enter it with a new password and you are back where you left off.</p>
      }
      @case ('new-password') {
        <p class="brand-text brand-extra">The owner set up this account for you. Choose your own password to finish your first sign-in.</p>
      }
      @case ('code') {
        <p class="brand-text brand-extra">Enter the code we sent to finish signing in. It keeps your account yours.</p>
      }
      @default {
        <ol class="brand-progress brand-extra" aria-label="Progress">
          @for (row of progress(); track row.label) {
            <li [class]="row.state" [attr.aria-current]="row.state === 'current' ? 'step' : null">
              <span class="progress-mark" aria-hidden="true">{{ row.state === 'done' ? '✓' : '' }}</span>
              <span>{{ row.label }}</span>
            </li>
          }
        </ol>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 20px;
      min-width: 0;
    }
    .brand-headline {
      margin: 0;
      color: var(--text-strong);
      font-size: clamp(1.6rem, 2.6vw, 2.15rem);
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: -0.02em;
      text-wrap: balance;
    }
    .brand-signature {
      margin: 0;
      font-size: 1rem;
    }
    .brand-paths {
      margin-block-start: 8px;
    }
    .brand-text {
      margin: 0;
      max-width: 34ch;
      color: var(--text-body);
      font-size: 1.02rem;
      line-height: 1.6;
    }
    .brand-points {
      display: grid;
      gap: 14px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .brand-points li {
      position: relative;
      padding-inline-start: 22px;
      color: var(--text-body);
      line-height: 1.5;
    }
    .brand-points li::before {
      content: '';
      position: absolute;
      inset-inline-start: 0;
      top: 0.55em;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-strong);
    }
    .brand-progress {
      display: grid;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .brand-progress li {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--text-subtle);
    }
    .brand-progress li.current {
      color: var(--text-strong);
      font-weight: 700;
    }
    .brand-progress li.done {
      color: var(--text-body);
    }
    .progress-mark {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: 26px;
      height: 26px;
      border: 2px solid var(--line);
      border-radius: 50%;
      font-size: 0.8rem;
      font-weight: 800;
    }
    .brand-progress li.done .progress-mark {
      border-color: var(--accent-strong);
      background: var(--accent-strong);
      color: var(--accent-on-primary);
    }
    .brand-progress li.current .progress-mark {
      border-color: var(--accent-strong);
    }
    @media (max-width: 899px) {
      :host {
        gap: 12px;
      }
      .brand-headline {
        font-size: 1.45rem;
      }
      .brand-extra {
        display: none;
      }
    }
  `,
})
export class SignInBrand {
  readonly variant = input<SignInBrandVariant>('sign-in');
  protected readonly devSession = inject(DevSession);
  protected readonly dev = computed(() => this.devSession.status() !== null || this.devSession.gated?.() === true);
  protected readonly headline = computed(() => {
    switch (this.variant()) {
      case 'sign-up': return 'Start where you are.';
      case 'confirm': return 'Almost there.';
      case 'forgot': return 'Locked out happens.';
      case 'reset': return 'Back in a minute.';
      case 'new-password': return 'Make it yours.';
      case 'code': return 'One more check.';
      default: return 'Become the engineer you can explain.';
    }
  });
  protected readonly progress = computed<ProgressRow[]>(() =>
    this.variant() === 'reset'
      ? [
          { label: 'Code sent', state: 'done' },
          { label: 'Choose a new password', state: 'current' },
          { label: 'Back to learning', state: 'next' },
        ]
      : [
          { label: 'Create your account', state: 'done' },
          { label: 'Confirm your email', state: 'current' },
          { label: this.dev() ? 'Owner approval' : 'Start learning', state: 'next' },
        ],
  );
}
