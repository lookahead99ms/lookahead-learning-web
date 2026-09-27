import { Directive, ElementRef, effect, inject, input } from '@angular/core';
import { highlightLearningCode } from './focus-studio/code-presentation';

@Directive({ selector: 'code[appLearningCode]', host: { class: 'learning-code', '[attr.data-code-language]': 'language().toLowerCase()' } })
export class LearningCode {
  readonly source = input.required<string>({ alias: 'appLearningCode' });
  readonly language = input('text', { alias: 'codeLanguage' });
  private readonly element = inject(ElementRef<HTMLElement>);
  constructor() {
    effect(() => {
      // The shared highlighter escapes all source text before adding fixed span markup.
      this.element.nativeElement.innerHTML = highlightLearningCode(this.source(), this.language());
    });
  }
}
