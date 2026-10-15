import { Injectable, Injector, inject } from '@angular/core';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { Subscription, from, switchMap } from 'rxjs';
import { PageMetaService } from './page-meta';
import { pageTarget, staticPageMeta } from './page-meta-routes';

function leaf(route: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
  let current = route;
  while (current.firstChild) current = current.firstChild;
  return current;
}

/**
 * DLV-941: one place sets every page's title and meta tags after navigation, so page components
 * do not each manage document.title. Static pages are described immediately; course-scoped
 * pages show their catalog's meta at once, then their own titles when the public course
 * metadata arrives. The course part loads lazily to keep it out of the initial bundle. A later
 * navigation cancels a pending lookup so meta never lags the URL.
 */
@Injectable({ providedIn: 'root' })
export class PageTitleStrategy extends TitleStrategy {
  private readonly pageMeta = inject(PageMetaService);
  private readonly injector = inject(Injector);
  private pending?: Subscription;

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.pending?.unsubscribe();
    this.pending = undefined;
    const route = leaf(snapshot.root);
    const target = pageTarget(route.routeConfig?.path ?? '', route.params);
    const url = snapshot.url;
    this.pageMeta.apply(staticPageMeta(target, this.buildTitle(snapshot)), url);
    if (target.kind === 'static') return;
    this.pending = from(import('./public-page-metadata'))
      .pipe(switchMap(({ PublicPageMetadata }) => this.injector.get(PublicPageMetadata).describe(target)))
      .subscribe({
        next: (page) => {
          if (page) this.pageMeta.apply(page, url);
        },
        // A failed chunk load leaves the catalog meta in place.
        error: () => undefined,
      });
  }
}
