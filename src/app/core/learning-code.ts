import { Directive, ElementRef, effect, inject, input } from '@angular/core';
import { highlightLearningCode } from './focus-studio/code-presentation';

/**
 * Wraps each source line of highlighted code in <span class="code-line">, so a long line can wrap with a hanging
 * indent and still read as one statement. Highlight spans never nest; one that runs past a newline is closed at
 * the end of the line and reopened on the next, so no line span ever crosses another span.
 */
export function wrapCodeLines(html: string): string {
  let open: string | null = null;
  return html
    .split('\n')
    .map((line) => {
      let text = (open ? open : '') + line;
      // Find the last tag on the line to know whether a highlight span is still open at its end.
      for (const tag of line.match(/<\/?span[^>]*>/g) ?? []) open = tag.startsWith('</') ? null : tag;
      if (open) text += '</span>';
      return `<span class="code-line">${text}</span>`;
    })
    .join('\n');
}

@Directive({ selector: 'code[appLearningCode]', host: { class: 'learning-code', '[attr.data-code-language]': 'language().toLowerCase()' } })
export class LearningCode {
  readonly source = input.required<string>({ alias: 'appLearningCode' });
  readonly language = input('text', { alias: 'codeLanguage' });
  private readonly element = inject(ElementRef<HTMLElement>);
  constructor() {
    effect(() => {
      // The shared highlighter escapes all source text before adding fixed span markup.
      this.element.nativeElement.innerHTML = wrapCodeLines(highlightLearningCode(this.source(), this.language()));
    });
  }
}
