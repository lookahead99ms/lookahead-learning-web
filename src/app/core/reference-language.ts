import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { PatternLanguage } from '../content/content.models';

export const REFERENCE_LANGUAGES: readonly PatternLanguage[] = ['java', 'python', 'go'];
/** Browser-local preference; no account sync. */
export const REFERENCE_LANGUAGE_KEY = 'look-ahead-reference-language-v1';

export function isReferenceLanguage(value: unknown): value is PatternLanguage {
  return REFERENCE_LANGUAGES.includes(value as PatternLanguage);
}

/**
 * One reference language (Java, Python or Go) for DSA code: the Hands-On DSA problem page
 * (Focus Studio, guided debugger, reference solutions) and the DSA core Learn lessons'
 * Java | Python | Go code tabs read and write the same choice, remembered in this browser.
 * Storage can be unavailable (private windows, blocked site data), so every access is guarded
 * and the page still works with the default, Java.
 */
@Injectable({ providedIn: 'root' })
export class ReferenceLanguageService {
  private readonly view = inject(DOCUMENT).defaultView;
  readonly selected = signal<PatternLanguage>('java');

  constructor() {
    try {
      const stored = this.view?.localStorage.getItem(REFERENCE_LANGUAGE_KEY);
      if (isReferenceLanguage(stored)) this.selected.set(stored);
    } catch {
      /* Storage can be unavailable in restricted browser sessions. */
    }
    const synchronize = (event: StorageEvent) => {
      if (event.key === REFERENCE_LANGUAGE_KEY && isReferenceLanguage(event.newValue)) {
        this.selected.set(event.newValue);
      }
    };
    this.view?.addEventListener('storage', synchronize);
    inject(DestroyRef).onDestroy(() => this.view?.removeEventListener('storage', synchronize));
  }

  select(language: string): void {
    if (!isReferenceLanguage(language)) return;
    this.selected.set(language);
    try {
      this.view?.localStorage.setItem(REFERENCE_LANGUAGE_KEY, language);
    } catch {
      /* The choice still applies to this page. */
    }
  }
}
