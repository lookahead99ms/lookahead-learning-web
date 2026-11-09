import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const localApiSections = ['start-testing', 'credentials', 'flows'] as const;
export function apiGuidePath(anchor: string): '/admin/api' | '/admin/local-api' {
  return (localApiSections as readonly string[]).includes(anchor.replace(/^#/, '')) ? '/admin/local-api' : '/admin/api';
}
/** Preserve old API setup bookmarks after moving their navigation home. */
export const localApiBookmarkRedirect: CanActivateFn = (_route, state) => {
  const url = new URL(state.url, 'https://author.invalid');
  return apiGuidePath(url.hash) === '/admin/local-api'
    ? inject(Router).parseUrl('/admin/local-api' + url.search + url.hash)
    : true;
};

/** Older API group landing bookmarks now open the reference directly. */
export const apiGroupBookmarkRedirect: CanActivateFn = (_route, state) => {
  const url = new URL(state.url, 'https://author.invalid');
  if (url.searchParams.get('group') !== 'api') return true;
  url.searchParams.delete('group');
  return inject(Router).parseUrl(apiGuidePath(url.hash) + url.search + url.hash);
};
