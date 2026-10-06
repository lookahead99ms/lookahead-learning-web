import { Component, computed, input } from '@angular/core';

/**
 * Corner statements beside PlatformSignature and LearningPrompt (user review, 2026-10-04). The
 * corners pair in rows: top left "Build with AI" with top right `ai` (stay ahead of your AI and
 * see where its code fails); bottom left `reasoning` (obstacle → way) with bottom right "Know why
 * it works" (LearningPrompt).
 */
interface StatementLine {
  lead: string;
  middle: string;
  key: string;
  /** Colours the key word like the AI in "Build with AI". */
  actor?: boolean;
}

export const REASONING_STATEMENTS: Record<'reasoning' | 'ai', readonly StatementLine[]> = {
  reasoning: [
    { lead: 'Understand', middle: 'the', key: 'obstacle' },
    { lead: 'Find', middle: 'the', key: 'way' },
  ],
  ai: [
    // AI takes the same colour as "Build with AI" (top left), so the AI pair reads as one.
    { lead: 'Look ahead', middle: 'of your', key: 'AI', actor: true },
    { lead: 'Know', middle: 'where its code', key: 'breaks' },
  ],
};

@Component({
  selector: 'app-reasoning-prompt',
  preserveWhitespaces: true,
  host: { '[class.stacked]': 'stacked()' },
  // prettier-ignore
  template: `@for (line of lines(); track line.key) {<span class="line"><span class="lead">{{ line.lead }}</span> {{ line.middle }} <span class="key" [class.actor]="line.actor">{{ line.key }}</span>.</span> }`,
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
    .lead {
      color: var(--accent-link);
      font-weight: 800;
    }
    .key {
      color: var(--accent-strong);
      font-weight: 750;
    }
    .key.actor {
      color: var(--accent-link);
      font-weight: 800;
    }
    @media (forced-colors: active) {
      .lead,
      .key {
        color: CanvasText;
      }
    }
  `,
})
export class ReasoningPrompt {
  readonly variant = input.required<keyof typeof REASONING_STATEMENTS>();
  readonly stacked = input(false);
  protected readonly lines = computed(() => REASONING_STATEMENTS[this.variant()]);
}
