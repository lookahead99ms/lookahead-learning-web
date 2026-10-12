import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlSerializer } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CatalogUrlSerializer, currentCatalogUrl, upgradeLegacyCatalogJson } from './catalog-url';

@Component({ template: 'Page' })
class Page {}

describe('legacy catalog URLs', () => {
  it('moves old Look Ahead addresses to /blaze', () => {
    expect(currentCatalogUrl('/look-ahead')).toBe('/blaze');
    expect(currentCatalogUrl('/look-ahead/design-systems/chat?mode=a#unit')).toBe(
      '/blaze/design-systems/chat?mode=a#unit',
    );
    expect(currentCatalogUrl('look-ahead?group=ai')).toBe('blaze?group=ai');
  });

  it('leaves current paths, longer first segments and query values alone', () => {
    for (const url of ['/', '/blaze/x', '/learn/java', '/look-ahead-x/y', '/search?q=/look-ahead/x', '/content/look-ahead/a.svg'])
      expect(currentCatalogUrl(url)).toBe(url);
  });

  it('opens old links and saved route arrays on the Blaze pages', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'blaze', component: Page },
          { path: 'blaze/:courseId', component: Page },
          { path: 'blaze/:courseId/module/:moduleId', component: Page },
        ]),
        { provide: UrlSerializer, useClass: CatalogUrlSerializer },
      ],
    });
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);

    await harness.navigateByUrl('/look-ahead/design-systems/module/chat?day=2#unit');
    expect(router.url).toBe('/blaze/design-systems/module/chat?day=2#unit');
    expect(router.routerState.snapshot.root.firstChild?.params['moduleId']).toBe('chat');

    await harness.navigateByUrl('/look-ahead');
    expect(router.url).toBe('/blaze');
    expect(router.serializeUrl(router.createUrlTree(['/', 'look-ahead', 'design-patterns']))).toBe(
      '/blaze/design-patterns',
    );
  });

  it('upgrades plans saved in the browser before the rename', () => {
    const saved = JSON.stringify({
      topics: ['look-ahead:system-design', 'learn:java'],
      item: { path: 'look-ahead', route: ['/', 'look-ahead', 'design-systems'], href: '/look-ahead/design-systems/chat' },
      detailRef: { href: '/content/look-ahead/design-systems/x.json' },
      index: '/content/indexes/look-ahead.json',
      note: 'kept: look-ahead-platform and look-ahead.study-plan.v1',
    });
    expect(JSON.parse(upgradeLegacyCatalogJson(saved))).toEqual({
      topics: ['blaze:system-design', 'learn:java'],
      item: { path: 'blaze', route: ['/', 'blaze', 'design-systems'], href: '/blaze/design-systems/chat' },
      detailRef: { href: '/content/blaze/design-systems/x.json' },
      index: '/content/indexes/blaze.json',
      note: 'kept: look-ahead-platform and look-ahead.study-plan.v1',
    });
  });
});
