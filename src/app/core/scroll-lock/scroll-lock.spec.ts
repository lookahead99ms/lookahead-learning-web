import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollLock, ScrollLockService } from './scroll-lock';

@Component({ template: '' })
class Blank {}

@Component({
  imports: [ScrollLock],
  template: `
    @if (shown()) {
      <dialog appScrollLock #dialog>Synthetic dialog</dialog>
    }
    <div class="palette" [appScrollLock]="paletteOpen()"></div>
    <div class="panel" appScrollLock [attr.aria-modal]="panelModal() ? 'true' : null"></div>
  `,
})
class Host {
  readonly shown = signal(true);
  readonly paletteOpen = signal(false);
  readonly panelModal = signal(false);
}

const html = () => document.documentElement;
const body = () => document.body;
const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('ScrollLockService', () => {
  let service: ScrollLockService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', component: Blank }])] });
    service = TestBed.inject(ScrollLockService);
    html().style.overflow = '';
    body().style.overflow = 'clip';
    body().style.paddingRight = '';
  });

  afterEach(() => {
    (service as unknown as { reset(): void }).reset();
    body().style.overflow = '';
  });

  it('hides overflow on html and body while locked and restores the previous values', () => {
    const release = service.lock();
    expect(service.locked()).toBe(true);
    expect(html().style.overflow).toBe('hidden');
    expect(html().style.overscrollBehavior).toBe('none');
    expect(body().style.overflow).toBe('hidden');
    expect(html().hasAttribute('data-scroll-locked')).toBe(true);
    release();
    expect(service.locked()).toBe(false);
    expect(html().style.overflow).toBe('');
    expect(body().style.overflow).toBe('clip');
    expect(html().hasAttribute('data-scroll-locked')).toBe(false);
  });

  it('counts nested locks and unlocks only when the last one is released', () => {
    const outer = service.lock();
    const inner = service.lock();
    expect(service.holders()).toBe(2);
    inner();
    expect(service.locked()).toBe(true);
    expect(body().style.overflow).toBe('hidden');
    outer();
    expect(service.locked()).toBe(false);
    expect(body().style.overflow).toBe('clip');
  });

  it('ignores a second release from the same holder', () => {
    const outer = service.lock();
    const inner = service.lock();
    inner();
    inner();
    expect(service.holders()).toBe(1);
    outer();
    expect(service.holders()).toBe(0);
  });

  it('keeps a classic scrollbar\'s width so the layout does not jump', () => {
    const width = vi.spyOn(html(), 'clientWidth', 'get').mockReturnValue(window.innerWidth - 15);
    const supports = vi.fn(() => true);
    const priorCss = (window as { CSS?: unknown }).CSS;
    Object.defineProperty(window, 'CSS', { configurable: true, value: { supports } });
    const release = service.lock();
    expect(html().style.getPropertyValue('scrollbar-gutter')).toBe('stable');
    release();
    expect(html().style.getPropertyValue('scrollbar-gutter')).toBe('');
    // Without scrollbar-gutter support the body is padded by the scrollbar's width instead.
    supports.mockReturnValue(false);
    const second = service.lock();
    expect(body().style.paddingRight).toBe('15px');
    second();
    expect(body().style.paddingRight).toBe('');
    width.mockRestore();
    Object.defineProperty(window, 'CSS', { configurable: true, value: priorCss });
  });

  it('restores the scroll position on the last release', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 });
    const release = service.lock();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    release();
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, top: 640, behavior: 'instant' });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    scrollTo.mockRestore();
  });

  it('cancels touch scrolling outside the open modal and allows it inside', () => {
    const release = service.lock();
    const outside = document.createElement('div');
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    const inside = document.createElement('p');
    dialog.append(inside);
    document.body.append(outside, dialog);
    const page = new Event('touchmove', { bubbles: true, cancelable: true });
    outside.dispatchEvent(page);
    expect(page.defaultPrevented).toBe(true);
    const modal = new Event('touchmove', { bubbles: true, cancelable: true });
    inside.dispatchEvent(modal);
    expect(modal.defaultPrevented).toBe(false);
    release();
    const after = new Event('touchmove', { bubbles: true, cancelable: true });
    outside.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
    outside.remove();
    dialog.remove();
  });

  it('clears a lock left behind when a navigation leaves no modal open', async () => {
    service.lock();
    await TestBed.inject(Router).navigateByUrl('/elsewhere');
    expect(service.locked()).toBe(false);
    expect(body().style.overflow).toBe('clip');
  });

  it('keeps the lock across a navigation while a modal is still open', async () => {
    const release = service.lock();
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    await TestBed.inject(Router).navigateByUrl('/next');
    expect(service.locked()).toBe(true);
    dialog.remove();
    release();
  });
});

describe('ScrollLock directive', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('locks while a dialog is open and releases on close', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const service = TestBed.inject(ScrollLockService);
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
    expect(service.locked()).toBe(false);
    dialog.setAttribute('open', '');
    await flush();
    expect(service.holders()).toBe(1);
    expect(body().style.overflow).toBe('hidden');
    dialog.removeAttribute('open');
    await flush();
    expect(service.locked()).toBe(false);
  });

  it('follows a bound boolean and an aria-modal attribute, and nests them', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const service = TestBed.inject(ScrollLockService);
    fixture.componentInstance.paletteOpen.set(true);
    fixture.detectChanges();
    expect(service.holders()).toBe(1);
    fixture.componentInstance.panelModal.set(true);
    fixture.detectChanges();
    await flush();
    expect(service.holders()).toBe(2);
    fixture.componentInstance.paletteOpen.set(false);
    fixture.detectChanges();
    expect(service.holders()).toBe(1);
    expect(service.locked()).toBe(true);
    fixture.componentInstance.panelModal.set(false);
    fixture.detectChanges();
    await flush();
    expect(service.locked()).toBe(false);
  });

  it('releases when an open dialog is destroyed', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const service = TestBed.inject(ScrollLockService);
    (fixture.nativeElement as HTMLElement).querySelector('dialog')!.setAttribute('open', '');
    await flush();
    expect(service.locked()).toBe(true);
    fixture.componentInstance.shown.set(false);
    fixture.detectChanges();
    expect(service.locked()).toBe(false);
    fixture.componentInstance.paletteOpen.set(true);
    fixture.detectChanges();
    fixture.destroy();
    expect(service.locked()).toBe(false);
  });
});

describe('every modal on the platform uses the shared lock (user, 2026-10-16)', () => {
  type Fs = {
    readFileSync(path: string, encoding: 'utf8'): string;
    readdirSync(path: string, options: { recursive: true }): string[];
  };
  const fs = (
    globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }
  ).process.getBuiltinModule('node:fs') as Fs;
  const sources = fs
    .readdirSync('src/app', { recursive: true })
    .filter((file) => /\.(html|ts)$/.test(file) && !file.endsWith('.spec.ts'))
    .map((file) => ({ file, text: fs.readFileSync(`src/app/${file}`, 'utf8') }));

  it('puts appScrollLock on every <dialog>, or takes the lock in code', () => {
    const unlocked = sources.flatMap(({ file, text }) =>
      [...text.matchAll(/<dialog\b[^>]*>/g)]
        .filter(([tag]) => !tag.includes('appScrollLock'))
        .filter(() => !/ScrollLockService/.test(text) && !/ScrollLockService/.test(fs.readFileSync(`src/app/${file.replace(/\.html$/, '.ts')}`, 'utf8')))
        .map(([tag]) => `${file}: ${tag.slice(0, 60)}`),
    );
    expect(unlocked).toEqual([]);
    expect(sources.filter(({ text }) => /<dialog\b/.test(text)).length).toBeGreaterThanOrEqual(8);
  });

  it('locks the header search palette and the expanded debugger', () => {
    const header = sources.find(({ file }) => file.endsWith('platform-header/platform-header.html'))!.text;
    const palette = header.slice(header.indexOf('id="header-search-palette"') - 200, header.indexOf('id="header-search-palette"') + 200);
    expect(palette).toContain('appScrollLock');
    expect(palette).toContain('aria-modal');
    const pilot = sources.find(({ file }) => file.endsWith('dsa-problem-pilot/dsa-problem-pilot.ts'))!.text;
    expect(pilot).toContain('this.scrollLock.lock()');
    // No component sets the body's overflow by hand any more.
    const manual = sources.filter(({ file, text }) => !file.includes('scroll-lock') && /body\.style\.overflow\s*=/.test(text));
    expect(manual.map(({ file }) => file)).toEqual([]);
  });
});
