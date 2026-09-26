import { Component, input } from '@angular/core';

@Component({
  selector: 'app-learning-prompt',
  preserveWhitespaces: true,
  host: { '[class.stacked]': 'stacked()' },
  // prettier-ignore
  template: `<span class="line"><span class="know">Know</span> <span class="reason">why</span> it works.</span> <span class="line"><span class="know">Know</span> <span class="reason">when</span> it won’t.</span>`,
  styles: `
    :host {
      color: var(--text-strong);
      font-weight: 400;
    }
    :host(.stacked) {
      display: block;
      max-width: 100%;
      text-align: start;
      font-size: 1.05rem;
      line-height: 1.55;
    }
    :host(.stacked) .line {
      display: block;
    }
    .know {
      color: var(--accent-link);
      font-weight: 800;
    }
    .reason {
      color: var(--accent-strong);
      font-weight: 750;
    }
    @media (forced-colors: active) {
      .know,
      .reason {
        color: CanvasText;
      }
    }
  `,
})
export class LearningPrompt {
  readonly stacked = input(false);
}
