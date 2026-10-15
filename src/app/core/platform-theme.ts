import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

export type PlatformTheme = 'light' | 'dark';
/** What the learner chose; `system` follows the operating system's light or dark setting. */
export type ThemePreference = PlatformTheme | 'system';
const themeKey = 'look-ahead-theme-v1';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * The color theme. With nothing stored the platform starts dark (not the device setting); a stored
 * `light`, `dark` or `system` choice always wins. src/index.html applies the same rule before the
 * app starts, so the first paint already has the right theme.
 */
@Injectable({ providedIn: 'root' })
export class PlatformThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  /** The theme on screen now (a `system` preference resolved to light or dark). */
  readonly selected = signal<PlatformTheme>('dark');
  readonly preference = signal<ThemePreference>('dark');
  private readonly darkScheme = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');

  constructor() {
    const view = this.document.defaultView;
    let initial: ThemePreference = 'dark';
    try {
      const stored = view?.localStorage.getItem(themeKey);
      if (isThemePreference(stored)) initial = stored;
    } catch {
      /* Storage can be unavailable in restricted browser sessions. */
    }
    this.apply(initial);
    const synchronize = (event: StorageEvent) => {
      if (event.key === themeKey && isThemePreference(event.newValue)) this.apply(event.newValue);
    };
    const followSystem = () => {
      if (this.preference() === 'system') this.apply('system');
    };
    view?.addEventListener('storage', synchronize);
    this.darkScheme?.addEventListener?.('change', followSystem);
    this.destroyRef.onDestroy(() => {
      view?.removeEventListener('storage', synchronize);
      this.darkScheme?.removeEventListener?.('change', followSystem);
    });
  }

  setTheme(theme: ThemePreference): void {
    this.apply(theme);
    try {
      this.document.defaultView?.localStorage.setItem(themeKey, theme);
    } catch {}
  }

  private apply(preference: ThemePreference): void {
    const theme = preference === 'system' ? (this.darkScheme?.matches ? 'dark' : 'light') : preference;
    this.preference.set(preference);
    this.selected.set(theme);
    this.document.documentElement.dataset['theme'] = theme;
  }
}
