import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { htmlText } from '../html-text';
import { isSceneAssetPath } from '../card-scene/scene-assets';
import publicPageText from './public-page-text.json';

/**
 * DLV-941: per-page title, description, canonical link, Open Graph and Twitter tags.
 * Every value comes from public metadata (route table, catalog and course locator titles and
 * descriptions). Protected lesson bodies never reach this service: see public-page-metadata.ts.
 */
export const SITE_NAME = publicPageText.siteName;
/** The home page keeps the title it has always shipped with (src/index.html). */
export const HOME_TITLE = publicPageText.homeTitle;
/** Same text as the static description in src/index.html. */
export const DEFAULT_DESCRIPTION = publicPageText.defaultDescription;

const DESCRIPTION_MAX_LENGTH = 300;

export interface PageMeta {
  title: string;
  description: string;
  /** App path of a shipped scene under /assets/scenes/; other values are ignored. */
  image?: string;
  type?: 'website' | 'article';
  /** false adds `robots: noindex` (account, admin and other personal or internal pages). */
  index?: boolean;
}

/** `Lesson | Course | LookAhead`: the most specific part first, empty parts skipped. */
export function pageTitle(...parts: (string | undefined)[]): string {
  return [...parts.map((part) => metaText(part ?? '', 120)).filter(Boolean), SITE_NAME].join(
    ' | ',
  );
}

/** Plain text for a meta tag: authored HTML removed, whitespace collapsed, cut at a word. */
export function metaText(value: string, maxLength = DESCRIPTION_MAX_LENGTH): string {
  const text = (/[<&]/.test(value) ? htmlText(value) : value).replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength - 1);
  const wordEnd = cut.lastIndexOf(' ');
  return `${(wordEnd > maxLength / 2 ? cut.slice(0, wordEnd) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

/** Absolute canonical address: the page path only, without query, fragment or trailing slash. */
export function canonicalUrl(origin: string, url: string): string {
  const path = url.split(/[?#;]/, 1)[0] || '/';
  const normalized = `/${path.replace(/^\/+/, '')}`.replace(/\/+$/, '') || '/';
  return `${origin.replace(/\/+$/, '')}${normalized}`;
}

@Injectable({ providedIn: 'root' })
export class PageMetaService {
  private readonly document = inject(DOCUMENT);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  apply(page: PageMeta, url: string): void {
    const origin = this.document.location?.origin ?? '';
    const title = metaText(page.title, 200) || HOME_TITLE;
    const description = metaText(page.description) || DEFAULT_DESCRIPTION;
    const canonical = canonicalUrl(origin, url);
    const image =
      page.image && isSceneAssetPath(page.image) ? `${origin}${page.image}` : undefined;

    this.title.setTitle(title);
    this.setName('description', description);
    this.setCanonical(canonical);
    this.setProperty('og:site_name', SITE_NAME);
    this.setProperty('og:title', title);
    this.setProperty('og:description', description);
    this.setProperty('og:type', page.type ?? 'website');
    this.setProperty('og:url', canonical);
    this.setProperty('og:image', image);
    this.setName('twitter:card', image ? 'summary_large_image' : 'summary');
    this.setName('twitter:title', title);
    this.setName('twitter:description', description);
    this.setName('twitter:image', image);
    this.setName('robots', page.index === false ? 'noindex' : undefined);
  }

  private setName(name: string, content: string | undefined): void {
    if (content) this.meta.updateTag({ name, content });
    else this.meta.removeTag(`name="${name}"`);
  }

  private setProperty(property: string, content: string | undefined): void {
    if (content) this.meta.updateTag({ property, content });
    else this.meta.removeTag(`property="${property}"`);
  }

  private setCanonical(href: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }
}
