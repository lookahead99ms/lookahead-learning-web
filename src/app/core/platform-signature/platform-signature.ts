import { Component, input } from '@angular/core';

/** The same platform promise in the homepage hero and page sidebars. */
@Component({
  selector: 'app-platform-signature',
  preserveWhitespaces: true,
  host: { '[class.stacked]': 'stacked()' },
  // prettier-ignore
  template: `<span class="signature-line"><span class="action">Build</span> with <span class="actor">AI</span>.</span> <span class="signature-line action">Understand</span> <span class="signature-line">what <span class="actor">you</span> <span class="action">ship</span>.</span>`,
  styles: `
    :host {
      color: var(--text-strong);
    }
    :host(.stacked) .signature-line {
      display: block;
    }
    .actor {
      color: var(--accent-link);
      font-weight: 800;
    }
    .action {
      color: var(--accent-strong);
      font-weight: 750;
      text-decoration: underline;
      text-decoration-color: color-mix(in srgb, var(--accent-strong) 35%, transparent);
      text-underline-offset: 0.16em;
      text-decoration-thickness: 0.07em;
    }
    @media (forced-colors: active) {
      .actor,
      .action {
        color: CanvasText;
      }
    }
  `,
})
export class PlatformSignature {
  readonly stacked = input(false);
}
