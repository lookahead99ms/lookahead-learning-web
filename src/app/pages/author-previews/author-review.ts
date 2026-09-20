import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { AuthorReviewPacket } from './author-review-packet';

@Component({
  selector: 'app-author-review',
  imports: [PlatformHeader, RouterLink, AuthorReviewPacket],
  template: `<app-platform-header />
    <main id="main-content">
      <a routerLink="/author/previews">All author previews</a>
      <p class="eyebrow">Author review workspace</p>
      <h1>Study Plan experience</h1>
      <p class="lede">
        Review the learner-facing schedule first, then inspect its evidence and record a decision.
      </p>
      <app-author-review-packet [expanded]="true" />
    </main>`,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
      background: var(--surface-page);
      color: var(--text-strong);
    }
    main {
      max-width: 1480px;
      margin: auto;
      padding: 24px clamp(12px, 3vw, 32px);
    }
    a {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      color: var(--accent-link);
    }
    h1 {
      font-size: clamp(28px, 4vw, 40px);
      margin: 8px 0;
    }
    .eyebrow {
      margin: 28px 0 0;
      color: var(--accent-strong);
      font-size: 12px;
      font-weight: 750;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .lede {
      max-width: 72ch;
      color: var(--text-subtle);
      font-size: 17px;
      line-height: 1.55;
    }
  `,
})
export class AuthorReviewPage {}
