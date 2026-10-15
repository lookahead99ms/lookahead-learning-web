/**
 * DLV-941 phase 2 (lighter option, 2026-10-15): after `ng build`, write one HTML file per public
 * page (`<route>/index.html`) so crawlers and link-preview bots that do not run JavaScript get the
 * page's real title, description and Open Graph tags, plus a short plain-text summary.
 *
 * - Pages: the sitemap set except home (catalogs, indexable pages such as /start-free, available
 *   courses, and lessons of the units the content policy marks public). Noindex pages (pricing,
 *   search, account, admin) keep the plain application shell.
 * - Text comes only from public metadata: public-page-text.json, catalog.json, course.json unit
 *   titles and descriptions, and the titles of lessons in public units. No lesson body, answer,
 *   summary or code is read into a page file.
 * - The summary sits inside <app-root>; Angular replaces it when the app starts, so visitors see
 *   the normal page. nginx already serves `<route>/index.html` (try_files $uri $uri/ /index.html).
 * - Canonical, og:url and og:image need absolute URLs, so they are written only when
 *   LOOKAHEAD_SITE_ORIGIN is set (the production domain is undecided, DLV-913).
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_PATHS,
  collectSitemapPaths,
  normalizeOrigin,
  readContentSamplesPolicy,
  readHiddenCourseIds,
  readIndexablePages,
  readRetiredCourses,
  resolveContentRoot,
} from './generate-seo-files.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const DESCRIPTION_MAX_LENGTH = 300;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function readPublicPageText(
  path = resolve(repositoryRoot, 'src/app/core/page-meta/public-page-text.json'),
) {
  return readJson(path);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Plain text: authored HTML removed, whitespace collapsed, cut at a word (same rule as the app). */
export function metaText(value, maxLength = DESCRIPTION_MAX_LENGTH) {
  const text = String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#\d+|[a-z]+);/gi, (match, name) =>
      name.startsWith('#') ? String.fromCodePoint(Number(name.slice(1))) : (ENTITIES[name.toLowerCase()] ?? match),
    )
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength - 1);
  const wordEnd = cut.lastIndexOf(' ');
  return `${(wordEnd > maxLength / 2 ? cut.slice(0, wordEnd) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
}

function pageTitle(text, ...parts) {
  return [...parts.map((part) => metaText(part, 120)).filter(Boolean), text.siteName].join(' | ');
}

function sentence(text) {
  return /[.?!…]$/.test(text) ? text : `${text}.`;
}

function contentKind(contentType) {
  switch (contentType) {
    case 'theory':
    case 'guide':
      return 'Lesson';
    case 'dsa-pattern':
      return 'Pattern lesson';
    case 'dsa-problem':
      return 'Coding problem';
    case 'system-design':
      return 'Design exercise';
    default:
      return 'Interview question';
  }
}

function flattenUnits(units) {
  return (units ?? []).flatMap((unit) => [
    unit,
    ...flattenUnits([...(unit.subUnits ?? []), ...(unit.children ?? [])]),
  ]);
}

function unitModuleIds(unit) {
  return [unit.theoryModuleId, unit.questionModuleId, unit.practiceModuleId, ...(unit.moduleIds ?? [])].filter(
    (id) => typeof id === 'string' && id,
  );
}

/** A shipped scene under public/assets/scenes, or undefined. */
async function shippedScene(publicDir, scene) {
  if (typeof scene !== 'string' || !/^\/assets\/scenes\/[a-z0-9/_-]+\.svg$/.test(scene)) return undefined;
  return (await exists(join(publicDir, scene))) ? scene : undefined;
}

/**
 * Public metadata for every sitemap path. Lesson titles are read only for lessons the sitemap
 * lists, which are lessons of public units, and only their `title` and `contentType`.
 */
export async function collectSnapshotPages(
  contentRoot,
  { text, paths, publicDir = resolve(repositoryRoot, 'public') },
) {
  const catalogs = {};
  const courses = new Map();
  if (contentRoot) {
    for (const path of CATALOG_PATHS) {
      const file = join(contentRoot, path, 'catalog.json');
      catalogs[path] = (await exists(file)) ? await readJson(file) : [];
    }
  }
  async function course(path, courseId) {
    const key = `${path}/${courseId}`;
    if (!courses.has(key)) {
      const listing = (catalogs[path] ?? []).find((item) => item?.id === courseId) ?? null;
      const file = join(contentRoot ?? '', path, courseId, 'course.json');
      const detail = contentRoot && (await exists(file)) ? await readJson(file) : {};
      courses.set(key, {
        id: courseId,
        title: listing?.title ?? detail.title ?? courseId,
        description: listing?.description ?? detail.description ?? '',
        units: flattenUnits(detail.learningUnits).filter((unit) => !unit.planned),
      });
    }
    return courses.get(key);
  }
  const lessonTitles = new Map();
  async function lesson(path, courseId, itemId) {
    const meta = await course(path, courseId);
    for (const unit of meta.units) {
      for (const moduleId of unitModuleIds(unit)) {
        const key = `${path}/${courseId}/${moduleId}`;
        if (!lessonTitles.has(key)) {
          const file = join(contentRoot, path, courseId, 'modules', `${moduleId}.json`);
          const items = (await exists(file)) ? await readJson(file) : [];
          // Only id, title and content type leave this function.
          lessonTitles.set(
            key,
            (Array.isArray(items) ? items : []).map((item) => ({
              id: item?.id,
              title: typeof item?.title === 'string' ? item.title : '',
              contentType: item?.contentType,
            })),
          );
        }
        const item = lessonTitles.get(key).find((candidate) => candidate.id === itemId);
        if (item) return { course: meta, unit, item };
      }
    }
    return null;
  }

  const pages = [];
  for (const path of paths) {
    const [first = '', second, third, extra] = path.split('/').filter(Boolean);
    if (path === '/') {
      pages.push({
        path,
        title: text.homeTitle,
        description: text.defaultDescription,
        heading: text.siteName,
        links: CATALOG_PATHS.map((catalog) => ({ href: `/${catalog}`, label: text.catalogs[catalog].label })),
      });
    } else if (CATALOG_PATHS.includes(first) && !second) {
      pages.push({
        path,
        title: pageTitle(text, text.catalogs[first].label),
        description: text.catalogs[first].description,
        heading: text.catalogs[first].label,
        image: `/assets/scenes/landing/${first}.svg`,
        links: (catalogs[first] ?? [])
          .filter((item) => paths.includes(`/${first}/${item?.id}`))
          .map((item) => ({ href: `/${first}/${item.id}`, label: metaText(item.title, 120) })),
      });
    } else if (!CATALOG_PATHS.includes(first)) {
      const page = text.pages[path.slice(1)];
      if (!page) continue;
      pages.push({
        path,
        title: pageTitle(text, ...page.titleParts),
        description: page.description,
        heading: page.titleParts[0],
        image: page.image,
      });
    } else if (second && !third && SLUG.test(second)) {
      const fixed = text.pages[path.slice(1)];
      const meta = await course(first, second);
      const label = text.catalogs[first].label;
      pages.push({
        path,
        title: fixed ? pageTitle(text, ...fixed.titleParts) : pageTitle(text, meta.title, label),
        description: fixed?.description ?? (meta.description || `${label} course: ${meta.title}.`),
        heading: metaText(meta.title, 120),
        image: fixed?.image ?? (await shippedScene(publicDir, `/assets/scenes/courses/${first}-${second}.svg`)),
        links: meta.units
          .filter((unit) => typeof unit.title === 'string' && unit.title)
          .slice(0, 40)
          .map((unit) => ({ label: metaText(unit.title, 120) })),
      });
    } else if (second && third && !extra && SLUG.test(second) && SLUG.test(third) && contentRoot) {
      const found = await lesson(first, second, third);
      if (!found) continue;
      const { course: meta, unit, item } = found;
      const context = unit.description || meta.description;
      const lead = `${contentKind(item.contentType)} from ${metaText(meta.title, 120)}: ${sentence(metaText(item.title, 160))}`;
      pages.push({
        path,
        title: pageTitle(text, item.title, meta.title),
        description: context ? `${lead} ${metaText(context)}` : lead,
        heading: metaText(item.title, 160),
        image:
          (await shippedScene(publicDir, unit.card?.scene)) ??
          (await shippedScene(publicDir, `/assets/scenes/courses/${first}-${second}.svg`)),
        type: 'article',
        links: [{ href: `/${first}/${second}`, label: `${metaText(meta.title, 120)} course` }],
      });
    }
  }
  return pages;
}

/** The built shell with this page's head tags and a plain summary inside <app-root>. */
export function renderSnapshot(shell, page, { origin, siteName }) {
  const title = metaText(page.title, 200);
  const description = metaText(page.description);
  const canonical = origin ? `${origin}${page.path === '/' ? '/' : page.path}` : null;
  const image = origin && page.image ? `${origin}${page.image}` : null;
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    ...(canonical ? [`<link rel="canonical" href="${escapeHtml(canonical)}" />`] : []),
    `<meta property="og:site_name" content="${escapeHtml(siteName)}" />`,
    `<meta property="og:type" content="${page.type ?? 'website'}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    ...(canonical ? [`<meta property="og:url" content="${escapeHtml(canonical)}" />`] : []),
    ...(image ? [`<meta property="og:image" content="${escapeHtml(image)}" />`] : []),
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    ...(image ? [`<meta name="twitter:image" content="${escapeHtml(image)}" />`] : []),
  ];
  let head = shell
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta\s+(?:name="(?:description|twitter:[a-z]+)"|property="og:[a-z_]+")[\s\S]*?\/?>\s*/g, '')
    .replace(/<link\s+rel="canonical"[\s\S]*?\/?>\s*/g, '')
    .replace(/<!-- DLV-941: default for every page[\s\S]*?-->\s*/, '');
  head = head.replace(/<meta charset="utf-8"\s*\/?>/i, (charset) => `${charset}\n    ${tags.join('\n    ')}`);
  const links = (page.links ?? [])
    .map((link) => (link.href ? `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>` : `<li>${escapeHtml(link.label)}</li>`))
    .join('');
  const summary =
    `<main class="route-snapshot"><h1>${escapeHtml(page.heading)}</h1><p>${escapeHtml(description)}</p>` +
    (links ? `<ul>${links}</ul>` : '') +
    '</main>';
  if (!/<app-root([^>]*)><\/app-root>/.test(head)) throw new Error('The built shell has no empty <app-root>');
  return head.replace(/<app-root([^>]*)><\/app-root>/, `<app-root$1>${summary}</app-root>`);
}

/** Writes `<route>/index.html` for every public page into the build output. */
export async function writeRouteSnapshots({
  outputDir = resolve(repositoryRoot, 'dist/lookahead-learning-web/browser'),
  origin: rawOrigin = process.env.LOOKAHEAD_SITE_ORIGIN,
  contentRoot,
  protectedBuild = false,
  log = console.log,
  warn = console.warn,
} = {}) {
  const origin = normalizeOrigin(rawOrigin);
  const root = contentRoot === undefined ? await resolveContentRoot({ protectedBuild }) : contentRoot;
  const text = await readPublicPageText();
  const paths = await collectSitemapPaths(root, {
    hiddenCourseIds: await readHiddenCourseIds(),
    retiredCourses: await readRetiredCourses(),
    indexablePages: await readIndexablePages(),
    policy: root ? await readContentSamplesPolicy(root) : null,
    warn,
  });
  const shell = await readFile(join(outputDir, 'index.html'), 'utf8');
  const pages = await collectSnapshotPages(root, { text, paths });
  let written = 0;
  for (const page of pages) {
    // The root index.html is also the fallback for every other route (account, admin, unknown
    // addresses), so it stays the generic shell; it already carries the home title and description.
    if (page.path === '/') continue;
    const html = renderSnapshot(shell, page, { origin, siteName: text.siteName });
    const file = join(outputDir, ...page.path.split('/').filter(Boolean), 'index.html');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html);
    written += 1;
  }
  log(
    `Route snapshots: ${written} public pages written (${origin ? `canonical and images for ${origin}` : 'no LOOKAHEAD_SITE_ORIGIN, so no canonical or og:image'}).`,
  );
  return { pages, written };
}
