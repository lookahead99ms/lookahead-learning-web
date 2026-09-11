import { expect, it } from 'vitest';
import { safeAccountReturn } from './account';
it('keeps account navigation inside recognized learner routes', () => {
  expect(safeAccountReturn('/learn/core-java?day=2')).toBe('/learn/core-java?day=2');
  expect(safeAccountReturn('/support')).toBe('/support');
  expect(safeAccountReturn('/author')).toBe('/author');
  for (const bad of [
    '//evil.example',
    'https://evil.example',
    '/account',
    '/learn\\evil',
    '/learn\nwrong',
  ])
    expect(safeAccountReturn(bad)).toBe('/study-plan');
});

import { registrationCountries, registrationCountryCode } from './countries';
it('requires explicit selection of a known country and preserves ISO codes', () => {
  expect(registrationCountryCode('')).toBeNull();
  expect(registrationCountryCode('somewhere')).toBeNull();
  expect(registrationCountryCode('United States')).toBe('US');
  expect(registrationCountryCode('india')).toBe('IN');
  expect(new Set(registrationCountries.map((country) => country.code)).size).toBe(
    registrationCountries.length,
  );
});
