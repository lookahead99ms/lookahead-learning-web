import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

export type PlatformTheme = 'light' | 'dark';
const themeKey = 'look-ahead-theme-v1';

@Injectable({ providedIn: 'root' })
export class PlatformThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  readonly selected = signal<PlatformTheme>('light');

  constructor() {
    const view = this.document.defaultView;
    let initial: PlatformTheme = view?.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    try {
      const stored = view?.localStorage.getItem(themeKey);
      if (stored === 'light' || stored === 'dark') initial = stored;
    } catch {
      /* Storage can be unavailable in restricted browser sessions. */
    }
    this.apply(initial);
    const synchronize = (event: StorageEvent) => {
      if (event.key === themeKey && (event.newValue === 'light' || event.newValue === 'dark')) {
        this.apply(event.newValue);
      }
    };
    view?.addEventListener('storage', synchronize);
    this.destroyRef.onDestroy(() => view?.removeEventListener('storage', synchronize));
  }

  setTheme(theme: PlatformTheme): void {
    this.apply(theme);
    try {
      this.document.defaultView?.localStorage.setItem(themeKey, theme);
    } catch {}
  }

  private apply(theme: PlatformTheme): void {
    this.selected.set(theme);
    this.document.documentElement.dataset['theme'] = theme;
  }
}
