import { inject } from '@angular/core';
import { PartialMatchRouteSnapshot, Router, UrlTree } from '@angular/router';

export function legacyInterviewSearchRedirect(route: PartialMatchRouteSnapshot): UrlTree {
  return inject(Router).createUrlTree(['/search'], {
    queryParams: { kind: 'practice', ...route.queryParams },
    fragment: route.fragment ?? undefined,
  });
}
