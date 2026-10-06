import { DestroyRef, Directive, ElementRef, afterNextRender, inject, signal } from '@angular/core';

/** Space kept between the explanation and the console when they share the right column (1.5rem). */
const STACK_GAP = 24;
/** Extra room required before the console moves beside the code, so a scrollbar appearing cannot flip it back. */
const SETTLE = 16;

/**
 * DLV-408: a code pair's run console moves into the explanation column, its bottom level with the end of the
 * code, when the code and the explanation sit side by side and the explanation leaves room for it. Otherwise
 * it stays under the code. The CSS grid does the placement; this only answers "does it fit", from the
 * natural heights of the three parts (none of them stretch), so the answer does not depend on where the
 * console currently is.
 */
@Directive({
  selector: '[appConsoleBeside]',
  host: { '[class.console-beside]': 'beside()' },
})
export class ConsoleBeside {
  protected readonly beside = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      const parts = this.parts();
      if (!parts) return;
      const observer = new ResizeObserver(() => this.measure());
      for (const part of parts) observer.observe(part);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  private parts(): [HTMLElement, HTMLElement, HTMLElement] | null {
    const code = this.host.querySelector<HTMLElement>(':scope > .code-pair-code');
    const text = this.host.querySelector<HTMLElement>(':scope > .code-pair-text');
    const output = this.host.querySelector<HTMLElement>(':scope > .code-pair-console');
    return code && text && output ? [code, text, output] : null;
  }

  private measure(): void {
    const parts = this.parts();
    if (!parts) return;
    const [code, text, output] = parts;
    const codeBox = code.getBoundingClientRect();
    const sideBySide = text.getBoundingClientRect().left >= codeBox.right;
    const room = codeBox.height - text.offsetHeight - output.offsetHeight - STACK_GAP;
    this.beside.set(sideBySide && room >= (this.beside() ? 0 : SETTLE));
  }
}
