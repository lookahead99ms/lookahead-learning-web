import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';

@Component({
  selector: 'app-not-found',
  imports: [PlatformHeader, RouterLink],
  template: `
    <app-platform-header />
    <main id="main-content" class="content-page">
      <section class="page-message" role="status">
        <p class="eyebrow">Page not found</p>
        <h1>This address does not match a learning page.</h1>
        <p>The link may be outdated, incomplete, or typed incorrectly.</p>
        <nav aria-label="Page recovery">
          <a routerLink="/">Return home</a>
          <a routerLink="/search">Search the platform</a>
          <a routerLink="/learn">Browse Learn</a>
        </nav>
      </section>
    </main>
  `,
  styles: [
    `
      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 12px 20px;
        margin-top: 24px;
      }
    `,
  ],
})
export class NotFoundPage {}
