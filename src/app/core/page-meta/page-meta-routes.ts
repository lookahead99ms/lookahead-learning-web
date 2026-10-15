import { DEFAULT_DESCRIPTION, HOME_TITLE, PageMeta, pageTitle } from './page-meta';
import indexablePages from './indexable-pages.json';
import publicPageText from './public-page-text.json';

/**
 * DLV-941: which page a route is, and the meta tags of static pages. Keyed by the route's
 * configured path so app.routes.ts stays unchanged. Course, module, section and lesson pages are
 * described in course-page-meta.ts, which loads lazily with their public course metadata.
 */
export type CatalogPath = 'learn' | 'grow' | 'blaze';

export type PageTarget =
  | { kind: 'static'; routePath: string }
  | { kind: 'course'; path: CatalogPath; courseId: string }
  | { kind: 'module'; path: CatalogPath; courseId: string; moduleId: string }
  | { kind: 'section'; path: CatalogPath; courseId: string; sectionId: string }
  | { kind: 'lesson'; path: CatalogPath; courseId: string; itemId: string };

export type DynamicPageTarget = Exclude<PageTarget, { kind: 'static' }>;

export const CATALOG_LABELS: Readonly<Record<CatalogPath, string>> = {
  learn: publicPageText.catalogs.learn.label,
  grow: publicPageText.catalogs.grow.label,
  blaze: publicPageText.catalogs.blaze.label,
};

/** The catalog pages' own hero copy (pages/learn, pages/grow, pages/blaze). */
const CATALOG_DESCRIPTIONS: Readonly<Record<CatalogPath, string>> = {
  learn: publicPageText.catalogs.learn.description,
  grow: publicPageText.catalogs.grow.description,
  blaze: publicPageText.catalogs.blaze.description,
};

const CATALOG_PATHS = new Set<string>(Object.keys(CATALOG_LABELS));
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

const PRIVATE_PAGES: Readonly<Record<string, string>> = {
  account: 'Account',
  'sign-in': 'Sign in',
  'sign-in/choose': 'Sign in',
  'sign-up': 'Create account',
  support: 'Support and feedback',
  'study-plan': 'Study plan',
  'delivery-plan': 'Delivery plan',
};

/** `false` -> noindex; `undefined` (indexed) otherwise, matching the other public pages. */
function indexable(routePath: keyof typeof indexablePages): false | undefined {
  return indexablePages[routePath] === false ? false : undefined;
}

interface PublicPageText {
  titleParts: string[];
  description: string;
  image?: string;
  index?: boolean;
}

/**
 * Public pages outside the catalogs, from public-page-text.json (shared with the build-time page
 * files). indexable-pages.json decides index/noindex and sitemap listing for start-free and
 * pricing; search is always noindex because its result lists change with every query.
 */
const PUBLIC_PAGES: Readonly<Record<string, PageMeta>> = {
  '': { title: HOME_TITLE, description: DEFAULT_DESCRIPTION },
  ...Object.fromEntries(
    Object.entries(publicPageText.pages as Record<string, PublicPageText>).map(([route, page]) => [
      route,
      {
        title: pageTitle(...page.titleParts),
        description: page.description,
        ...(page.image ? { image: page.image } : {}),
        ...(page.index === false
          ? { index: false }
          : route in indexablePages
            ? { index: indexable(route as keyof typeof indexablePages) }
            : {}),
      },
    ]),
  ),
};

export function catalogPath(value: string | undefined): CatalogPath | null {
  return value && CATALOG_PATHS.has(value) ? (value as CatalogPath) : null;
}

/** Classifies the matched leaf route by its configured path and parameters. */
export function pageTarget(routePath: string, params: Record<string, string>): PageTarget {
  const [first, ...rest] = routePath.split('/');
  const path = catalogPath(first);
  const pattern = rest.join('/');
  const { courseId, moduleId, sectionId, questionId } = params;
  if (path && courseId && SLUG.test(courseId)) {
    if (pattern === ':courseId') return { kind: 'course', path, courseId };
    if (pattern === ':courseId/module/:moduleId' && moduleId && SLUG.test(moduleId))
      return { kind: 'module', path, courseId, moduleId };
    if (pattern === ':courseId/section/:sectionId' && sectionId && SLUG.test(sectionId))
      return { kind: 'section', path, courseId, sectionId };
    if (pattern === ':courseId/:questionId' && questionId && SLUG.test(questionId))
      return { kind: 'lesson', path, courseId, itemId: questionId };
  }
  return { kind: 'static', routePath };
}

/** Meta for a static page, or the immediate placeholder for a dynamic page before it loads. */
export function staticPageMeta(target: PageTarget, explicitTitle?: string): PageMeta {
  if (target.kind !== 'static') return catalogMeta(target.path);
  const routePath = target.routePath;
  const known = PUBLIC_PAGES[routePath];
  if (known) return { ...known, title: explicitTitle ?? known.title };
  const path = catalogPath(routePath);
  if (path) return catalogMeta(path);
  const privateTitle = PRIVATE_PAGES[routePath];
  if (privateTitle) return privatePage(explicitTitle ?? pageTitle(privateTitle));
  if (/^(admin|author)(\/|$)/.test(routePath)) return privatePage(pageTitle('Admin'));
  if (/^preview(\/|$)/.test(routePath)) return privatePage(pageTitle('Preview'));
  if (routePath === '**') return privatePage(pageTitle('Page not found'));
  return { title: explicitTitle ?? HOME_TITLE, description: DEFAULT_DESCRIPTION };
}

function catalogMeta(path: CatalogPath): PageMeta {
  return {
    title: pageTitle(CATALOG_LABELS[path]),
    description: CATALOG_DESCRIPTIONS[path],
    image: `/assets/scenes/landing/${path}.svg`,
  };
}

function privatePage(title: string): PageMeta {
  return { title, description: DEFAULT_DESCRIPTION, index: false };
}
