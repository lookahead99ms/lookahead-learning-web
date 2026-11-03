import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { SignInBrand } from './sign-in-brand';

for (const [status, label] of [[null, 'LookAhead'], [{ dev: true }, 'LookAhead DEV']] as const)
  it('shows the logo, headline, signature and paths' + (status ? ' with the DEV mark' : ''), () => {
    TestBed.configureTestingModule({ providers: [{ provide: DevSession, useValue: { status: signal(status) } }] });
    const fixture = TestBed.createComponent(SignInBrand);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('app-platform-brand')!.getAttribute('aria-label')).toBe(label);
    expect(element.querySelector('.brand-headline')!.textContent).toBe('Become the engineer you can explain.');
    expect(element.querySelector('app-platform-signature')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Build with AI. Understand what you ship.');
    expect(element.querySelectorAll('app-path-marks li').length).toBe(3);
  });

function render(variant: string, devSession: { status: ReturnType<typeof signal>; gated?: ReturnType<typeof signal> }) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: DevSession, useValue: devSession }] });
  const fixture = TestBed.createComponent(SignInBrand);
  fixture.componentRef.setInput('variant', variant);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}
const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim();

it('gives every step its own panel and keeps the logo on all of them (DLV-969)', () => {
  const headlines = new Map<string, string>();
  for (const variant of ['sign-in', 'sign-up', 'confirm', 'forgot', 'reset', 'new-password', 'code']) {
    const element = render(variant, { status: signal(null), gated: signal(false) });
    expect(element.querySelector('app-platform-brand')).not.toBeNull();
    headlines.set(variant, text(element.querySelector('.brand-headline'))!);
    expect(element.querySelector('app-path-marks') !== null).toBe(variant === 'sign-in');
  }
  expect(new Set(headlines.values()).size).toBe(7);
  expect(headlines.get('sign-up')).toBe('Start where you are.');
  expect(headlines.get('new-password')).toBe('Make it yours.');
});

it('lists what an account gives on sign-up and reassures on forgot password', () => {
  expect([...render('sign-up', { status: signal(null) }).querySelectorAll('.brand-points li')].map(text)).toEqual([
    'A study plan that adjusts when your week changes.',
    'Your plans and progress saved to your account.',
    'Practice and quick recall beside your lessons.',
  ]);
  expect(text(render('forgot', { status: signal(null) }).querySelector('.brand-text'))).toBe('Your study plans and progress stay exactly as they are.');
  expect(text(render('new-password', { status: signal(null) }).querySelector('.brand-text'))).toContain('The owner set up this account for you.');
  expect(text(render('code', { status: signal(null) }).querySelector('.brand-text'))).toContain('Enter the code');
});

it('shows confirm-email progress ending in owner approval in DEV and in learning elsewhere', () => {
  expect(render('confirm', { status: signal(null) }).querySelector('.brand-progress li.done .progress-mark')?.getAttribute('aria-hidden')).toBe('true');
  const rows = (element: HTMLElement) => [...element.querySelectorAll('.brand-progress li')].map((row) => [text(row.querySelector('span:last-child')), row.className, row.getAttribute('aria-current')]);
  expect(rows(render('confirm', { status: signal(null), gated: signal(true) }))).toEqual([
    ['Create your account', 'done', null], ['Confirm your email', 'current', 'step'], ['Owner approval', 'next', null],
  ]);
  expect(rows(render('confirm', { status: signal({ dev: true }) }))[2][0]).toBe('Owner approval');
  expect(rows(render('confirm', { status: signal(null), gated: signal(false) }))[2][0]).toBe('Start learning');
  expect(rows(render('reset', { status: signal(null) }))).toEqual([
    ['Code sent', 'done', null], ['Choose a new password', 'current', 'step'], ['Back to learning', 'next', null],
  ]);
});

