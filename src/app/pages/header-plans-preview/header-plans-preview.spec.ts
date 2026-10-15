import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { routes } from '../../app.routes';
import { staffGuard } from '../../core/author-access';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { HEADER_OPTIONS, HeaderPlansPreview, STARTING_PRICE } from './header-plans-preview';

@Component({ selector: 'app-platform-header', template: '' })
class HeaderStub {}

describe('Header options for plans (staff preview)', () => {
  let root: HTMLElement;
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] }).overrideComponent(
      HeaderPlansPreview,
      { remove: { imports: [PlatformHeader] }, add: { imports: [HeaderStub] } },
    );
    const fixture = TestBed.createComponent(HeaderPlansPreview);
    fixture.detectChanges();
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });
  const text = (element: Element | null) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('says the pictures are mockups, under the shared header', () => {
    expect(root.firstElementChild?.tagName.toLowerCase()).toBe('app-platform-header');
    expect(text(root.querySelector('h1'))).toBe('Header options for plans');
    expect(text(root.querySelector('.mock-note'))).toContain(
      'These are mockups, not the live header.',
    );
  });

  it('shows three named options, each with trade-offs and every state on desktop and phone', () => {
    const options = [...root.querySelectorAll('section.option')];
    expect(options.map((option) => text(option.querySelector('h2')))).toEqual([
      'Option A Grouped pair',
      'Option B Account-led',
      'Option C Slim strip',
    ]);
    for (const option of options) {
      expect(option.querySelectorAll('.trade-offs li').length).toBeGreaterThanOrEqual(4);
      const desktop = [...option.querySelectorAll('.desktop-states .state')];
      const phone = [...option.querySelectorAll('.phone-states .state')];
      expect(new Set(desktop.map((state) => state.getAttribute('data-state')))).toEqual(
        new Set(['free', 'sale', 'paid']),
      );
      expect(phone.map((state) => state.getAttribute('data-state'))).toEqual(
        desktop.map((state) => state.getAttribute('data-state')),
      );
      expect(phone.every((state) => state.querySelector('.mock.phone'))).toBe(true);
    }
  });

  it('draws each option as specified', () => {
    const option = (id: string) => root.querySelector(`[data-option="${id}"] .desktop-states`)!;
    const groups = [...option('a').querySelectorAll('.mock-group')].map((group) =>
      [...group.querySelectorAll('.mock-segment')].map(text),
    );
    expect(groups).toEqual([
      ['Study Plan', 'Unlock all'],
      ['Study Plan', '🎄 Holiday sale'],
      ['Study Plan', 'My plan'],
    ]);
    expect(option('a').querySelector('.mock-link')).toBeNull();

    const b = option('b');
    expect(b.querySelector('.mock-group')).toBeNull();
    expect(
      [...b.querySelectorAll('[data-state="free"] .mock-account .mock-button')].map(text),
    ).toEqual(['Sign in', 'Sign up free']);
    expect(b.querySelector('.mock-dot')).not.toBeNull();
    const unlock = b.querySelector('.mock-menu-item.accent');
    expect(unlock).toBe(b.querySelector('.mock-menu-item'));
    expect(text(unlock!.querySelector('.mock-menu-label'))).toBe('Unlock all');
    expect(text(unlock!.querySelector('small'))).toBe(`From ${STARTING_PRICE}/year`);
    expect(text(b.querySelector('[data-state="sale"] .mock-greeting'))).toBe('🎄 Holiday sale');
    expect(b.querySelector('[data-state="paid"] .mock-dot')).toBeNull();

    const c = option('c');
    expect([...c.querySelectorAll('.mock-strip-text')].map(text)).toEqual([
      `Unlock Learn, Grow and Blaze from ${STARTING_PRICE}/year · See plans`,
      '🎄 Holiday sale · See sale prices',
    ]);
    expect(c.querySelector('[data-state="paid"] .mock-strip')).toBeNull();
    expect(STARTING_PRICE).toBe('$69.99');
  });

  it('keeps the pictures out of the accessibility tree and unclickable', () => {
    const mocks = [...root.querySelectorAll('.mock')];
    expect(mocks.length).toBe(
      HEADER_OPTIONS.reduce((count, option) => count + option.states.length * 2, 0),
    );
    for (const mock of mocks) {
      expect(mock.getAttribute('aria-hidden')).toBe('true');
      expect(mock.hasAttribute('inert')).toBe(true);
      expect(mock.querySelector('a, button, input, [tabindex]')).toBeNull();
    }
    expect(
      [...root.querySelectorAll('figcaption .state-summary')].every((summary) => text(summary)),
    ).toBe(true);
  });

  it('never says Pro and uses no arrows', () => {
    const all = root.textContent ?? '';
    expect(all).not.toMatch(/\bPro\b/i);
    expect(all).not.toMatch(/[→←⟶➜➔]/);
  });

  it('is a staff-only route', () => {
    const route = routes.find((entry) => entry.path === 'preview/header-plans');
    expect(route?.canActivate).toContain(staffGuard);
  });
});
