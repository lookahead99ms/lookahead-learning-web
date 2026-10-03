import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SceneAssets, isSceneAssetPath, publicUnitScenePath } from './scene-assets';

describe('SceneAssets', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('accepts only SVG files under /assets/scenes/', () => {
    expect(isSceneAssetPath('/assets/scenes/landing/learn.svg')).toBe(true);
    expect(isSceneAssetPath('/assets/scenes/landing/look-ahead.svg')).toBe(true);
    for (const path of [
      '/content/look-ahead/x/a.svg',
      '/assets/code-presentation.js',
      '/assets/scenes/landing/learn.png',
      '/assets/scenes/../secret.svg',
      '/assets/scenes//learn.svg',
      'https://example.com/assets/scenes/learn.svg',
      '//example.com/assets/scenes/learn.svg',
      '/assets/scenes/landing/learn.svg?x=1',
    ]) {
      expect(isSceneAssetPath(path), path).toBe(false);
    }
  });

  it('maps Look Ahead unit card scenes to their public asset copies', () => {
    expect(
      publicUnitScenePath('/content/look-ahead/design-systems/visuals/cards/reservation.svg'),
    ).toBe('/assets/scenes/units/look-ahead/design-systems/reservation.svg');
    for (const path of [
      '/content/grow/api-design/visuals/cards/a.svg',
      '/content/look-ahead/design-systems/visuals/other/a.svg',
      '/content/look-ahead/../visuals/cards/a.svg',
      '/content/look-ahead/design-systems/visuals/cards/a.png',
    ]) {
      expect(publicUnitScenePath(path), path).toBeNull();
    }
  });

  it('caches a loaded scene and retries after a failure', () => {
    const scenes = TestBed.inject(SceneAssets);
    const http = TestBed.inject(HttpTestingController);
    const received: string[] = [];
    let failed = false;

    scenes.get('/assets/scenes/landing/grow.svg').subscribe({ error: () => (failed = true) });
    http.expectOne('/assets/scenes/landing/grow.svg').flush('no', { status: 500, statusText: 'x' });
    expect(failed).toBe(true);

    scenes.get('/assets/scenes/landing/grow.svg').subscribe((text) => received.push(text));
    http.expectOne('/assets/scenes/landing/grow.svg').flush('<svg/>');
    scenes.get('/assets/scenes/landing/grow.svg').subscribe((text) => received.push(text));
    http.expectNone('/assets/scenes/landing/grow.svg');

    expect(received).toEqual(['<svg/>', '<svg/>']);
    http.verify();
  });

  it('rejects other paths without a request', () => {
    let failed = false;
    TestBed.inject(SceneAssets)
      .get('/content/look-ahead/x/a.svg')
      .subscribe({ error: () => (failed = true) });
    TestBed.inject(HttpTestingController).verify();
    expect(failed).toBe(true);
  });
});
