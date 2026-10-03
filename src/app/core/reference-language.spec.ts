import { TestBed } from '@angular/core/testing';
import { REFERENCE_LANGUAGE_KEY, ReferenceLanguageService } from './reference-language';

describe('ReferenceLanguageService', () => {
  let storageDescriptor: PropertyDescriptor | undefined;
  let values: Map<string, string>;
  const useStorage = (storage: Pick<Storage, 'getItem' | 'setItem'>) =>
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });

  beforeEach(() => {
    storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    values = new Map<string, string>();
    useStorage({
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    });
  });
  afterEach(() => {
    if (storageDescriptor) Object.defineProperty(window, 'localStorage', storageDescriptor);
    else Reflect.deleteProperty(window, 'localStorage');
  });

  it('defaults to Java and remembers a valid choice in this browser', () => {
    const service = TestBed.inject(ReferenceLanguageService);
    expect(service.selected()).toBe('java');
    service.select('go');
    expect(service.selected()).toBe('go');
    expect(values.get(REFERENCE_LANGUAGE_KEY)).toBe('go');
    service.select('rust');
    expect(service.selected()).toBe('go');
  });

  it('starts from a stored choice and ignores an unknown stored value', () => {
    values.set(REFERENCE_LANGUAGE_KEY, 'python');
    expect(TestBed.inject(ReferenceLanguageService).selected()).toBe('python');
    TestBed.resetTestingModule();
    values.set(REFERENCE_LANGUAGE_KEY, 'cobol');
    expect(TestBed.inject(ReferenceLanguageService).selected()).toBe('java');
  });

  it('keeps working when storage throws', () => {
    useStorage({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const service = TestBed.inject(ReferenceLanguageService);
    expect(service.selected()).toBe('java');
    service.select('python');
    expect(service.selected()).toBe('python');
  });

  it('follows a choice made in another tab', () => {
    const service = TestBed.inject(ReferenceLanguageService);
    window.dispatchEvent(new StorageEvent('storage', { key: REFERENCE_LANGUAGE_KEY, newValue: 'go' }));
    expect(service.selected()).toBe('go');
  });
});
