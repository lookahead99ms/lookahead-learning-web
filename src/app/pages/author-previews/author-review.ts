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
      <h1>Study Plan review</h1>
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
      max-width: 1200px;
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
    }
  `,
})
export class AuthorReviewPage {}
