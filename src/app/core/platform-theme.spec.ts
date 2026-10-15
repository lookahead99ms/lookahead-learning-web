import { TestBed } from '@angular/core/testing';
import { PlatformThemeService } from './platform-theme';

describe('PlatformThemeService', () => {
  let storageDescriptor: PropertyDescriptor | undefined;
  beforeEach(() => {
    storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });
  afterEach(() => {
    if (storageDescriptor) Object.defineProperty(window, 'localStorage', storageDescriptor);
    else Reflect.deleteProperty(window, 'localStorage');
    document.documentElement.removeAttribute('data-theme');
  });

  it('restores a valid preference and persists a changed theme', () => {
    window.localStorage.setItem('look-ahead-theme-v1', 'dark');
    const service = TestBed.inject(PlatformThemeService);
    expect(service.selected()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    service.setTheme('light');
    expect(window.localStorage.getItem('look-ahead-theme-v1')).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('synchronizes only recognized preferences from another tab', () => {
    const service = TestBed.inject(PlatformThemeService);
    service.setTheme('light');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'look-ahead-theme-v1', newValue: 'dark' }),
    );
    expect(service.selected()).toBe('dark');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'look-ahead-theme-v1', newValue: 'invalid' }),
    );
    expect(service.selected()).toBe('dark');
  });

  it('still changes the theme when browser storage is unavailable', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('Storage unavailable', 'SecurityError');
      },
    });
    const service = TestBed.inject(PlatformThemeService);
    service.setTheme('dark');
    expect(service.selected()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});

describe('PlatformThemeService system preference', () => {
  let storageDescriptor: PropertyDescriptor | undefined;
  let matchMediaDescriptor: PropertyDescriptor | undefined;
  let prefersDark: boolean;
  let listener: (() => void) | null;
  beforeEach(() => {
    storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    prefersDark = true;
    listener = null;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        get matches() {
          return prefersDark;
        },
        addEventListener: (_: string, callback: () => void) => (listener = callback),
        removeEventListener: () => (listener = null),
      }),
    });
  });
  afterEach(() => {
    if (storageDescriptor) Object.defineProperty(window, 'localStorage', storageDescriptor);
    else Reflect.deleteProperty(window, 'localStorage');
    if (matchMediaDescriptor) Object.defineProperty(window, 'matchMedia', matchMediaDescriptor);
    else Reflect.deleteProperty(window, 'matchMedia');
    document.documentElement.removeAttribute('data-theme');
  });

  it('starts dark with nothing stored, even on a light device, and ignores device changes', () => {
    prefersDark = false;
    const service = TestBed.inject(PlatformThemeService);
    expect(service.preference()).toBe('dark');
    expect(service.selected()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    prefersDark = true;
    listener?.();
    prefersDark = false;
    listener?.();
    expect(service.selected()).toBe('dark');
    expect(window.localStorage.getItem('look-ahead-theme-v1')).toBeNull();
  });

  it('lets a stored light choice win over the dark default', () => {
    window.localStorage.setItem('look-ahead-theme-v1', 'light');
    const service = TestBed.inject(PlatformThemeService);
    expect(service.preference()).toBe('light');
    expect(service.selected()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('follows the device once the learner picks system, until they pick a theme', () => {
    const service = TestBed.inject(PlatformThemeService);
    service.setTheme('system');
    expect(service.selected()).toBe('dark');
    prefersDark = false;
    listener?.();
    expect(service.selected()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    service.setTheme('dark');
    prefersDark = true;
    listener?.();
    prefersDark = false;
    listener?.();
    expect(service.selected()).toBe('dark');
  });

  it('stores and restores the system choice', () => {
    TestBed.inject(PlatformThemeService).setTheme('system');
    expect(window.localStorage.getItem('look-ahead-theme-v1')).toBe('system');
    TestBed.resetTestingModule();
    const restored = TestBed.inject(PlatformThemeService);
    expect(restored.preference()).toBe('system');
    expect(restored.selected()).toBe('dark');
  });
});
