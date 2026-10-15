import { Component, computed, input } from '@angular/core';
import { authorDocumentationGroups } from './author-workspace-links';

/** Hero at the top of every documentation page, in its reader group's colour. */
@Component({
  selector: 'app-author-doc-hero',
  host: { '[style.--group-accent]': 'entry()?.group?.accent' },
  template: `
    @if (entry(); as current) {
      <header class="doc-hero">
        <span class="hero-icon" aria-hidden="true">{{ current.page.icon }}</span>
        <div class="hero-copy">
          <p class="hero-group">
            <span aria-hidden="true">{{ current.group.icon }}</span> {{ current.group.label }}
            @if (current.parent) {
              <span class="hero-parent">· {{ current.parent.label }}</span>
            }
          </p>
          <h2>{{ current.page.label }}</h2>
          <p class="hero-description">{{ current.page.description }}</p>
          <ul class="hero-facts" aria-label="About this page">
            <li><span aria-hidden="true">👥</span> {{ current.group.reader }}</li>
            <li><span aria-hidden="true">👁️</span> Read-only</li>
          </ul>
        </div>
      </header>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .doc-hero {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: clamp(14px, 2.5vw, 24px);
      overflow: hidden;
      padding: clamp(20px, 3vw, 32px);
      border: 1px solid var(--line);
      border-radius: 20px;
      background:
        radial-gradient(
          circle at 100% 0%,
          color-mix(in srgb, var(--group-accent, var(--path-learn)) 18%, transparent),
          transparent 20rem
        ),
        radial-gradient(
          circle at 0% 100%,
          color-mix(in srgb, var(--path-blaze) 10%, transparent),
          transparent 18rem
        ),
        var(--surface);
    }
    .doc-hero::after {
      position: absolute;
      right: -56px;
      bottom: -84px;
      width: 200px;
      height: 200px;
      border: 1px solid color-mix(in srgb, var(--group-accent, var(--path-learn)) 24%, transparent);
      border-radius: 50%;
      box-shadow: 0 0 0 28px color-mix(in srgb, var(--group-accent, var(--path-learn)) 5%, transparent);
      content: '';
      pointer-events: none;
    }
    .hero-icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 60px;
      height: 60px;
      border-radius: 17px;
      background: color-mix(in srgb, var(--group-accent, var(--path-learn)) 16%, var(--surface));
      box-shadow: inset 0 0 0 1px
        color-mix(in srgb, var(--group-accent, var(--path-learn)) 32%, transparent);
      font-size: 1.85rem;
    }
    .hero-copy {
      position: relative;
      z-index: 1;
      min-width: 0;
      max-width: 760px;
    }
    .hero-group {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      color: var(--group-accent, var(--accent-strong));
      font-size: 12px;
      font-weight: 750;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    h2 {
      margin: 6px 0 8px;
      color: var(--text-strong);
      font-size: clamp(26px, 3vw, 36px);
      line-height: 1.15;
      letter-spacing: -0.03em;
    }
    .hero-description {
      margin: 0;
      color: var(--text-body);
      font-size: 17px;
      line-height: 1.55;
    }
    .hero-facts {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 16px 0 0;
      padding: 0;
      list-style: none;
    }
    .hero-facts li {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--surface-page);
      color: var(--text-strong);
      font-size: 13px;
      font-weight: 650;
    }
    @media (max-width: 560px) {
      .doc-hero {
        flex-direction: column;
      }
    }
  `,
})
export class AuthorDocHero {
  readonly pageId = input.required<string>();
  protected readonly entry = computed(() => {
    for (const group of authorDocumentationGroups) {
      for (const page of group.pages) {
        if (page.id === this.pageId()) return { group, page, parent: null };
        const child = page.children?.find((item) => item.id === this.pageId());
        if (child) return { group, page: child, parent: page };
      }
    }
    return null;
  });
}
