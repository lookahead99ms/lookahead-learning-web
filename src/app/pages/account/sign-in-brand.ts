import { Component, inject } from '@angular/core';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { PathMarks } from '../../core/path-marks/path-marks';
import { PlatformBrand } from '../../core/platform-brand/platform-brand';
import { PlatformSignature } from '../../core/platform-signature/platform-signature';

/** DLV-969: the Look Ahead side of every sign-in and sign-up screen; the form beside it changes, this panel stays. */
@Component({
  selector: 'app-sign-in-brand',
  imports: [PlatformBrand, PlatformSignature, PathMarks],
  template: `
    <app-platform-brand class="brand-logo" [mark]="devSession.status() ? 'DEV' : null" />
    <p class="brand-headline">Become the engineer you can explain.</p>
    <p class="brand-signature"><app-platform-signature /></p>
    <app-path-marks class="brand-paths" />
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
    @media (max-width: 899px) {
      :host {
        gap: 12px;
      }
      .brand-headline {
        font-size: 1.45rem;
      }
      .brand-signature,
      .brand-paths {
        display: none;
      }
    }
  `,
})
export class SignInBrand {
  protected readonly devSession = inject(DevSession);
}
