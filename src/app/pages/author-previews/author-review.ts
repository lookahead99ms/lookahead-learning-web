import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { AuthorWorkspaceNav } from '../../core/author-workspace-nav/author-workspace-nav';
import { AuthorReviewPacket } from './author-review-packet';

@Component({
  selector: 'app-author-review',
  imports: [PlatformHeader, RouterLink, AuthorWorkspaceNav, AuthorReviewPacket],
  template: `<app-platform-header />
    <main id="main-content" class="review-page">
      <aside class="review-outline">
        <app-author-workspace-nav pageTitle="Study Plan review" [outline]="outline" />
      </aside>
      <div class="review-content">
        <a routerLink="/author/previews">All author previews</a>
        <header id="review-overview">
          <p class="eyebrow">Author review workspace</p>
          <h2>Study Plan experience</h2>
          <p class="lede">
            Review the learner-facing schedule first, then inspect its evidence and record a
            decision.
          </p>
        </header>
        <section id="review-packet" aria-label="Versioned Study Plan review">
          <app-author-review-packet [expanded]="true" />
        </section>
      </div>
    </main>`,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
      background: var(--surface-page);
      color: var(--text-strong);
    }
    .review-page {
      display: grid;
      grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
      align-items: start;
      gap: 32px;
      max-width: 1600px;
      margin: auto;
      padding: 24px clamp(12px, 3vw, 32px);
    }
    .review-outline {
      position: sticky;
      top: calc(var(--platform-header-height, 76px) + 24px);
    }
    .review-content {
      min-width: 0;
    }
    #review-overview,
    #review-packet {
      scroll-margin-top: calc(var(--platform-header-height, 76px) + 16px);
    }
    a {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      color: var(--accent-link);
    }
    h2 {
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
    @media (max-width: 900px) {
      .review-page {
        grid-template-columns: 1fr;
      }
      .review-outline {
        position: static;
      }
    }
  `,
})
export class AuthorReviewPage {
  protected readonly outline = [
    { label: 'Overview', href: '#review-overview' },
    { label: 'Versioned review packet', href: '#review-packet' },
  ];
}
