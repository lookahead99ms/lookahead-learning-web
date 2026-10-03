import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ContentService } from '../../content/content.service';
import { CardScene, recordSceneTextSizes, sceneScale, sceneTextLimit } from './card-scene';

const sceneSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><script>alert(1)</script><rect class="x-a"/></svg>';

async function render(getCardScene: (path: string) => Observable<string>, src?: string) {
  await TestBed.configureTestingModule({
    imports: [CardScene],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ContentService, useValue: { getCardScene } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(CardScene);
  fixture.componentRef.setInput('src', src);
  fixture.componentRef.setInput('alt', 'Two fans click the same seat.');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('CardScene', () => {
  it('inlines the sanitized scene inside a labelled image area', async () => {
    const fixture = await render(() => of(sceneSvg), '/content/look-ahead/x/visuals/cards/a.svg');
    const scene = fixture.nativeElement.querySelector('.la-card-scene') as HTMLElement;

    expect(scene.getAttribute('role')).toBe('img');
    expect(scene.getAttribute('aria-label')).toBe('Two fans click the same seat.');
    expect(scene.dataset['state']).toBe('ready');
    expect(scene.querySelector('svg rect.x-a')).not.toBeNull();
    expect(scene.querySelector('script')).toBeNull();
    expect(scene.querySelector('.la-card-scene-fallback')).toBeNull();
  });

  it('gives card drawing words the shared card text styling', async () => {
    const cardSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">' +
      '<style>.cs-m{font-family:Menlo,monospace}</style>' +
      '<text class="cs-m">ByteBuffer</text><text>file</text></svg>';
    const fixture = await render(() => of(cardSvg), '/content/look-ahead/x/visuals/cards/a.svg');
    const host = fixture.nativeElement as HTMLElement;
    expect(host.classList).not.toContain('la-card-scene-card');
    expect(host.querySelector('text[data-scene-code]')).toBeNull();

    fixture.componentRef.setInput('card', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.classList).toContain('la-card-scene-card');
    const texts = host.querySelectorAll('text');
    expect(texts[0].hasAttribute('data-scene-code')).toBe(true);
    expect(texts[1].hasAttribute('data-scene-code')).toBe(false);
    const css = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');
    expect(css).toMatch(/la-card-scene-card[^{]*:is\(text, ?tspan\)/);
    for (const token of [
      '--scene-ink: var(--card-scene-text-color',
      'font-family: var(--card-scene-text-font',
      'font-weight: var(--card-scene-text-weight',
      'font-family: var(--card-scene-code-font',
    ]) {
      expect(css).toContain(token);
    }
  });

  it('caps drawing text below the card title in card mode only', async () => {
    const cardSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 135">' +
      '<text style="font-size:16px">Charged once</text><text>7</text></svg>';
    const fixture = await render(() => of(cardSvg), '/content/look-ahead/x/visuals/cards/a.svg');
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('svg')?.hasAttribute('data-card-text-fit')).toBe(false);

    fixture.componentRef.setInput('card', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const svg = host.querySelector('svg')!;
    expect(svg.hasAttribute('data-card-text-fit')).toBe(true);
    const css = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');
    // The cap is a share of the card's title size, and a text never grows past its own size.
    expect(css).toMatch(/--card-scene-text-max:\s*calc\(\s*var\(--card-title-size/);
    expect(css).toMatch(/--card-scene-mark-max:\s*calc\(\s*var\(--card-title-size/);
    expect(css).toMatch(
      /\[data-scene-size\]\s*\{\s*font-size:\s*min\(\s*var\(--scene-size\),\s*var\(--card-scene-text-limit/,
    );
    expect(css).toMatch(/text\[data-scene-mark\]\[data-scene-size\][\s\S]*?--card-scene-mark-limit/);
  });

  it('turns a rendered size cap into drawing units at the current scale', () => {
    const svg = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 135"/>',
      'image/svg+xml',
    ).documentElement as unknown as SVGSVGElement;
    // 464 x 261 px: 1.933 px per unit; the 16:9 box is wider than tall, so meet uses height.
    expect(sceneScale(svg, 464, 261)).toBeCloseTo(1.933, 3);
    expect(sceneScale(svg, 480, 135)).toBe(1);
    expect(sceneScale(svg, 0, 0)).toBe(0);
    // A 15.6 px cap (75% of a 20.8 px title) is about 8.07 units at that scale.
    expect(sceneTextLimit(15.6, 1.933)).toBe('8.07px');
    expect(sceneTextLimit(Number.NaN, 1.933)).toBeNull();
    expect(sceneTextLimit(15.6, 0)).toBeNull();
  });

  it('records each text size, and a tspan size only when it has its own', () => {
    const svg = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">' +
        '<text font-size="16">a <tspan>b</tspan><tspan font-size="11">c</tspan></text>' +
        '<text font-size="9">7</text></svg>',
      'image/svg+xml',
    ).documentElement as unknown as SVGSVGElement;
    const size = (element: Element): string =>
      element.getAttribute('font-size') ?? (element.parentElement ? size(element.parentElement) : '16');
    const view = {
      getComputedStyle: (element: Element) => ({ fontSize: `${size(element)}px` }),
    } as unknown as Window;

    recordSceneTextSizes(svg, view);

    const [first, second] = Array.from(svg.querySelectorAll('text'));
    const [inherits, own] = Array.from(svg.querySelectorAll('tspan'));
    expect(first.style.getPropertyValue('--scene-size')).toBe('16px');
    expect(second.style.getPropertyValue('--scene-size')).toBe('9px');
    expect(inherits.hasAttribute('data-scene-size')).toBe(false);
    expect(own.style.getPropertyValue('--scene-size')).toBe('11px');
    expect(own.hasAttribute('data-scene-size')).toBe(true);
  });

  it('shows the scene description on the scene background when loading fails', async () => {
    const fixture = await render(
      () => throwError(() => new Error('404')),
      '/content/look-ahead/x/visuals/cards/missing.svg',
    );
    const scene = fixture.nativeElement.querySelector('.la-card-scene') as HTMLElement;

    expect(scene.dataset['state']).toBe('failed');
    expect(scene.querySelector('svg')).toBeNull();
    expect(scene.querySelector('.la-card-scene-fallback')?.textContent).toBe(
      'Two fans click the same seat.',
    );
  });

  it('shows a short mark instead of the description when a fallback mark is given', async () => {
    await TestBed.configureTestingModule({
      imports: [CardScene],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ContentService, useValue: { getCardScene: () => throwError(() => new Error('404')) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CardScene);
    fixture.componentRef.setInput('src', '/content/look-ahead/x/visuals/cards/missing.svg');
    fixture.componentRef.setInput('alt', 'Core Java illustration');
    fixture.componentRef.setInput('fallback', 'CJ');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const scene = fixture.nativeElement.querySelector('.la-card-scene') as HTMLElement;

    expect(scene.dataset['state']).toBe('failed');
    expect(scene.getAttribute('aria-label')).toBe('Core Java illustration');
    const mark = scene.querySelector('.la-card-scene-mark');
    expect(mark?.textContent?.trim()).toBe('CJ');
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
    expect(scene.textContent).not.toContain('Core Java illustration');
  });

  it('falls back when the response is not an SVG document', async () => {
    const fixture = await render(() => of('<html></html>'), '/content/look-ahead/x/a.svg');
    expect(fixture.nativeElement.querySelector('.la-card-scene').dataset['state']).toBe('failed');
  });

  it('keeps the scene area while the scene is loading', async () => {
    const pending = new Subject<string>();
    const fixture = await render(() => pending, '/content/look-ahead/x/a.svg');
    const scene = fixture.nativeElement.querySelector('.la-card-scene') as HTMLElement;

    expect(scene.dataset['state']).toBe('loading');
    pending.next(sceneSvg);
    fixture.detectChanges();
    expect(scene.dataset['state']).toBe('ready');
  });

  it('loads app scenes from static assets without the content service', async () => {
    const getCardScene = vi.fn(() => of(sceneSvg));
    const fixture = await render(getCardScene, '/assets/scenes/landing/learn.svg');
    const http = TestBed.inject(HttpTestingController);
    const scene = fixture.nativeElement.querySelector('.la-card-scene') as HTMLElement;

    expect(scene.dataset['state']).toBe('loading');
    const request = http.expectOne('/assets/scenes/landing/learn.svg');
    expect(request.request.responseType).toBe('text');
    request.flush(sceneSvg);
    fixture.detectChanges();

    expect(getCardScene).not.toHaveBeenCalled();
    expect(scene.dataset['state']).toBe('ready');
    expect(scene.getAttribute('role')).toBe('img');
    expect(scene.querySelector('svg rect.x-a')).not.toBeNull();
    expect(scene.querySelector('script')).toBeNull();
    expect(scene.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    http.verify();
  });

  it('falls back to the description when an app scene fails to load', async () => {
    const fixture = await render(() => of(sceneSvg), '/assets/scenes/landing/missing.svg');
    TestBed.inject(HttpTestingController)
      .expectOne('/assets/scenes/landing/missing.svg')
      .flush('missing', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    const scene = fixture.nativeElement.querySelector('.la-card-scene') as HTMLElement;

    expect(scene.dataset['state']).toBe('failed');
    expect(scene.querySelector('.la-card-scene-fallback')?.textContent).toBe(
      'Two fans click the same seat.',
    );
  });

  it('keeps other paths on the content service, which validates them', async () => {
    const getCardScene = vi.fn(() => throwError(() => new Error('Invalid card scene path')));
    const fixture = await render(getCardScene, '/assets/other/a.svg');
    TestBed.inject(HttpTestingController).verify();

    expect(getCardScene).toHaveBeenCalledWith('/assets/other/a.svg');
    expect(fixture.nativeElement.querySelector('.la-card-scene').dataset['state']).toBe('failed');
  });

  it('renders nothing for an optional scene whose file is missing or whose path is empty', async () => {
    const fixture = await render(
      () => throwError(() => new Error('404')),
      '/content/look-ahead/x/visuals/cards/missing.svg',
    );
    fixture.componentRef.setInput('optional', true);
    fixture.componentRef.setInput('fallback', 'CJ');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.classList).toContain('la-card-scene-missing');
    expect(host.querySelector('.la-card-scene-fallback')).toBeNull();

    fixture.componentRef.setInput('src', undefined);
    fixture.detectChanges();
    expect(host.classList).toContain('la-card-scene-missing');
  });

  it('shows an optional scene once it loads', async () => {
    const fixture = await render(() => of(sceneSvg), '/content/look-ahead/x/visuals/cards/a.svg');
    fixture.componentRef.setInput('optional', true);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.classList).not.toContain('la-card-scene-missing');
    expect(host.querySelector('svg rect.x-a')).not.toBeNull();
  });
});
