import { Injectable } from '@angular/core';
import { DefaultUrlSerializer, UrlTree } from '@angular/router';

/**
 * Catalogs whose page address changed. The Blaze catalog was published as Look Ahead at
 * `/look-ahead/...` until 12 October 2026 (DLV-931); old links, bookmarks and saved study plans
 * still carry that address.
 */
const LEGACY_CATALOG_SEGMENTS: Readonly<Record<string, string>> = { 'look-ahead': 'blaze' };

/** `/look-ahead/system-design` → `/blaze/system-design`; other URLs unchanged. */
export function currentCatalogUrl(url: string): string {
  const match = /^(\/?)([^/?#;()]+)(?=[/?#;()]|$)/.exec(url);
  const current = match ? LEGACY_CATALOG_SEGMENTS[match[2]] : undefined;
  return current ? match![1] + current + url.slice(match![0].length) : url;
}

/**
 * Opens old `/look-ahead/...` addresses (and route arrays saved with `look-ahead`) on the matching
 * `/blaze/...` page at any depth, keeping the query and fragment. The address bar then shows `/blaze`.
 */
@Injectable()
export class CatalogUrlSerializer extends DefaultUrlSerializer {
  override parse(url: string): UrlTree {
    return super.parse(currentCatalogUrl(url));
  }

  override serialize(tree: UrlTree): string {
    return currentCatalogUrl(super.serialize(tree));
  }
}

/**
 * Upgrades JSON saved in this browser before DLV-931 (study plans, drafts) from the old catalog id
 * `look-ahead` to `blaze`: topic ids (`look-ahead:system-design`), path values, page routes and
 * content paths. Storage keys keep their `look-ahead.` prefix (the platform name), so they still load.
 */
export function upgradeLegacyCatalogJson(raw: string): string {
  return raw
    .replace(/"look-ahead(?=[:"])/g, '"blaze')
    .replace(/"\/look-ahead(?=[/"?#])/g, '"/blaze')
    .replace(/\/content\/look-ahead\//g, '/content/blaze/')
    .replace(/\/content\/indexes\/look-ahead\.json/g, '/content/indexes/blaze.json');
}
