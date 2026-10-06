import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, viewChild } from '@angular/core';
import { PatternLanguage } from '../../content/content.models';
import { CodeCopyButton } from '../code-copy-button/code-copy-button';
import { WalkthroughCodeLine, codeScrollTop } from './walkthrough.model';

let nextCodeId = 0;
const LANGUAGE_LABELS: Record<PatternLanguage, string> = { java: 'Java', python: 'Python', go: 'Go' };

/**
 * Option B, right column: the reference solution, always on screen, with the current line
 * highlighted and kept in view inside the box (the page itself never moves).
 */
@Component({
  selector: 'app-walkthrough-code',
  imports: [CodeCopyButton],
  template: `<section class="code" [attr.aria-labelledby]="uid + '-title'">
    <div class="code-head">
      <h4 [id]="uid + '-title'">Reference solution</h4>
      @if (currentNumber() !== null) {
        <span class="code-key" aria-hidden="true"
          ><span><i class="key-current"></i>This step</span
          ><span><i class="key-ran"></i>{{ ranLabel() }}</span></span
        >
      }
      <app-code-copy-button [code]="source()" [workspace]="true" />
    </div>
    <p class="sr-only" aria-live="off">
      @if (currentNumber(); as number) {
        Current line {{ number }}.
      }
    </p>
    <pre
      #codeBox
      tabindex="0"
      [attr.aria-label]="label() + ' reference solution'"
    ><code class="learning-code" [attr.data-code-language]="language()">@for (line of lines(); track line.id) {<span class="line" [class.current]="line.current" [class.ran]="line.ran" [attr.data-line]="line.number" [attr.aria-current]="line.current ? 'step' : null"><span class="no" aria-hidden="true">{{ line.number }}</span><span [innerHTML]="line.html"></span>
</span>}</code></pre>
  </section>`,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    /* A column: the head, then the box, which shrinks to what the player's column leaves. */
    .code {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
      background: var(--surface);
    }
    .code-head {
      flex: none;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 12px;
      padding: 6px 10px 6px 14px;
      border-bottom: 1px solid var(--line);
    }
    h4 {
      margin: 0 auto 0 0;
      font-size: var(--wt-fs-m, 14px);
      color: var(--text-strong);
    }
    .code-key {
      display: inline-flex;
      gap: 12px;
      font-size: var(--wt-fs-s, 13px);
      color: var(--text-subtle);
    }
    .code-key i {
      display: inline-block;
      width: 10px;
      height: 10px;
      margin-right: 5px;
      border-radius: 2px;
      vertical-align: -1px;
    }
    .key-current {
      background: #ffd666;
    }
    .key-ran {
      background: color-mix(in srgb, var(--text-subtle) 40%, transparent);
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    pre {
      flex: 1 1 auto;
      margin: 0;
      padding: 8px 0;
      min-height: min(200px, 30dvh);
      max-height: var(--wt-code-height, calc(100dvh - var(--stage-top, 72px) - 72px));
      overflow: auto;
      overscroll-behavior: contain;
      font-size: var(--wt-fs-m, 14px);
      line-height: 1.7;
    }
    /* Every line is as wide as the longest, so a highlight spans the whole scroll width. */
    code {
      display: grid;
      width: max-content;
      min-width: 100%;
    }
    .line {
      display: block;
      padding-right: 16px;
      border-left: 4px solid transparent;
    }
    .line .no {
      display: inline-block;
      width: 3.2em;
      padding-right: 1em;
      text-align: right;
      opacity: 0.55;
      user-select: none;
    }
    .line.ran {
      background: rgb(255 255 255 / 0.06);
      border-left-color: rgb(255 255 255 / 0.28);
    }
    .line.current {
      background: rgb(255 214 102 / 0.22);
      border-left-color: #ffd666;
    }
    @media (forced-colors: active) {
      .line.current {
        border-left-color: Highlight;
      }
    }
  `,
})
export class WalkthroughCode {
  readonly lines = input.required<WalkthroughCodeLine[]>();
  readonly language = input.required<PatternLanguage>();
  readonly source = input('');
  /** "Already ran" while stepping line by line, "Also ran" for a story step's lines. */
  readonly ranLabel = input('Also ran');
  protected readonly uid = `walkthrough-code-${++nextCodeId}`;
  private readonly codeBox = viewChild<ElementRef<HTMLElement>>('codeBox');
  protected readonly label = computed(() => LANGUAGE_LABELS[this.language()]);
  protected readonly currentNumber = computed(
    () => this.lines().find((line) => line.current)?.number ?? null,
  );

  constructor() {
    // Keep the current line visible inside the code box without moving the page.
    effect(() => this.reveal(this.currentNumber()));
    // A box that was hidden (the narrow Drawing | Code switch) shows its current line when shown.
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const box = this.codeBox()?.nativeElement;
      if (!box || typeof ResizeObserver === 'undefined') return;
      let height = box.clientHeight;
      const observer = new ResizeObserver(() => {
        if (height === 0 && box.clientHeight > 0) this.reveal(this.currentNumber());
        height = box.clientHeight;
      });
      observer.observe(box);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  private reveal(number: number | null): void {
    const box = this.codeBox()?.nativeElement;
    if (!box || number === null || box.clientHeight === 0) return;
    const line = box.querySelector<HTMLElement>(`[data-line="${number}"]`);
    if (!line) return;
    // On a short screen the page can cut the box: keep the line in the part that is on screen.
    const rect = box.getBoundingClientRect();
    const pin = parseFloat(getComputedStyle(box).getPropertyValue('--stage-top')) || 0;
    const height = box.ownerDocument.defaultView?.innerHeight ?? Infinity;
    const top = Math.max(0, pin - rect.top);
    const bottom = Math.min(box.clientHeight, height - rect.top);
    const visible = bottom - top >= line.offsetHeight * 4 ? { top, bottom } : undefined;
    const target = codeScrollTop(box, line.offsetTop - box.offsetTop, line.offsetHeight, visible);
    if (target !== null) box.scrollTop = target;
  }
}
