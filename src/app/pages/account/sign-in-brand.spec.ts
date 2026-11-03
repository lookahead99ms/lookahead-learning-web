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
