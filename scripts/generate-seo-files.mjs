/**
 * DLV-941: writes public/robots.txt and public/sitemap.xml before every build (scripts/build.mjs),
 * so Angular copies them to the site root. Both files are generated and Git-ignored.
 *
 * - The sitemap needs absolute URLs, so it is written only when LOOKAHEAD_SITE_ORIGIN is set
 *   (for example https://www.example.com). Without it, robots.txt allows crawling and has no
 *   Sitemap line, and any old sitemap.xml is removed.
 * - Listed pages: home, the Learn/Grow/Blaze catalogs, pages flagged true in
 *   src/app/core/page-meta/indexable-pages.json, every available catalog course, and the
 *   lesson routes of units the content policy marks public (policies/content-samples.json,
 *   publicUnits) when that file is reachable next to the content root.
 * - Only public routes are listed. Nothing is read from lesson bodies except their ids.
 */
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
export const CATALOG_PATHS = ['learn', 'grow', 'blaze'];
/** Personal, internal and legacy-alias pages. Public catalog, course, lesson and /content/ stay crawlable. */
export const DISALLOWED_PATHS = [
  '/admin',
  '/author',
  '/delivery-plan',
  '/delivery',
  '/account',
  '/sign-in',
  '/sign-up',
  '/support',
  '/study-plan',
  '/preview/',
];
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

/** `https://Example.com/` -> `https://example.com`; unset -> null; anything else is an error. */
export function normalizeOrigin(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw new Error(`LOOKAHEAD_SITE_ORIGIN is not a URL: ${value}`);
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      `LOOKAHEAD_SITE_ORIGIN must be an http(s) origin without path, query or credentials: ${value}`,
    );
  }
  return url.origin;
}

/**
 * The catalog the build ships. A protected build serves the private publication, so it prefers
 * LOOKAHEAD_CONTENT_ROOT; other builds use the runtime copy that `content:sync` just prepared.
 */
export async function resolveContentRoot({
  protectedBuild = false,
  env = process.env,
  root = repositoryRoot,
} = {}) {
  const external = env.LOOKAHEAD_CONTENT_ROOT ? resolve(root, env.LOOKAHEAD_CONTENT_ROOT) : null;
  const synced = resolve(root, 'public/content');
  const demo = resolve(root, 'demo-content/runtime');
  const candidates = protectedBuild ? [external, synced] : [synced, external, demo];
  for (const candidate of candidates) {
    if (candidate && (await exists(join(candidate, 'learn/catalog.json')))) return candidate;
  }
  return null;
}

/** Hidden course ids (`path:course`) from the app's own list in src/app/content/hidden-courses.ts. */
export async function readHiddenCourseIds(
  path = resolve(repositoryRoot, 'src/app/content/hidden-courses.ts'),
) {
  const source = await readFile(path, 'utf8');
  const list = /HIDDEN_COURSE_IDS[^=]*=\s*\[([^\]]*)\]/.exec(source);
  if (!list) throw new Error(`HIDDEN_COURSE_IDS was not found in ${path}`);
  return new Set([...list[1].matchAll(/'([a-z0-9-]+:[a-z0-9-]+)'/g)].map((match) => match[1]));
}

/** Public pages outside the catalogs (`route: true|false`), shared with page-meta-routes.ts. */
export async function readIndexablePages(
  path = resolve(repositoryRoot, 'src/app/core/page-meta/indexable-pages.json'),
) {
  const pages = await readJson(path);
  return Object.fromEntries(
    Object.entries(pages).filter(([route, value]) => SLUG.test(route) && typeof value === 'boolean'),
  );
}

export async function readRetiredCourses(
  path = resolve(repositoryRoot, 'src/app/content/retired-content-ids.json'),
) {
  return (await readJson(path)).courses ?? [];
}

/** policies/content-samples.json inside or next to the content root, when it is there. */
export async function readContentSamplesPolicy(contentRoot) {
  for (const candidate of [
    join(contentRoot, 'policies/content-samples.json'),
    join(contentRoot, '../policies/content-samples.json'),
  ]) {
    if (!(await exists(candidate))) continue;
    const policy = await readJson(candidate);
    if (policy.schemaVersion !== 'content-samples/v1' || !Array.isArray(policy.publicUnits)) {
      throw new Error(`Unsupported content samples policy: ${candidate}`);
    }
    return { path: candidate, publicUnits: policy.publicUnits };
  }
  return null;
}

function flattenUnits(units) {
  return (units ?? []).flatMap((unit) => [
    unit,
    ...flattenUnits([...(unit.subUnits ?? []), ...(unit.children ?? [])]),
  ]);
}

function isRetiredLesson(retiredCourses, path, courseId, lessonId) {
  return retiredCourses.some(
    (course) =>
      course.path === path &&
      course.courseId === courseId &&
      Object.hasOwn(course.lessons ?? {}, lessonId),
  );
}

/** Lesson routes of one public unit, in curriculum order. */
async function publicUnitPaths(contentRoot, unitKey, { hiddenCourseIds, retiredCourses, warn }) {
  const [path, courseId, unitId, extra] = String(unitKey).split('/');
  if (extra !== undefined || !CATALOG_PATHS.includes(path) || !SLUG.test(courseId ?? '') || !SLUG.test(unitId ?? '')) {
    warn(`Skipped malformed public unit ${unitKey}`);
    return [];
  }
  if (hiddenCourseIds.has(`${path}:${courseId}`)) return [];
  const coursePath = join(contentRoot, path, courseId, 'course.json');
  if (!(await exists(coursePath))) {
    warn(`Skipped public unit ${unitKey}: course not in this content root`);
    return [];
  }
  const course = await readJson(coursePath);
  const unit = flattenUnits(course.learningUnits).find((candidate) => candidate.id === unitId);
  if (!unit || unit.planned) {
    warn(`Skipped public unit ${unitKey}: unit not published`);
    return [];
  }
  const published = new Set(
    (course.modules ?? [])
      .filter((module) => module.reviewStatus !== 'planned')
      .map((module) => module.id),
  );
  const moduleIds = [
    unit.theoryModuleId,
    unit.questionModuleId,
    unit.practiceModuleId,
    ...(unit.moduleIds ?? []),
  ].filter((id, index, all) => typeof id === 'string' && published.has(id) && all.indexOf(id) === index);
  const routes = [];
  for (const moduleId of moduleIds) {
    const modulePath = join(contentRoot, path, courseId, 'modules', `${moduleId}.json`);
    if (!(await exists(modulePath))) continue;
    const items = await readJson(modulePath);
    for (const item of Array.isArray(items) ? items : []) {
      // Only the id is used. A DSA problem placement without its canonical problem has no page.
      if (!SLUG.test(item?.id ?? '')) continue;
      if (item.contentType === 'dsa-problem' && !item.canonicalProblemRef) continue;
      if (isRetiredLesson(retiredCourses, path, courseId, item.id)) continue;
      routes.push(`/${path}/${courseId}/${item.id}`);
    }
  }
  return routes;
}

/** Every public page path for the sitemap: home, catalogs, courses and public-unit lessons. */
export async function collectSitemapPaths(
  contentRoot,
  {
    hiddenCourseIds = new Set(),
    retiredCourses = [],
    policy = null,
    indexablePages = {},
    warn = () => {},
  } = {},
) {
  const paths = [
    '/',
    ...CATALOG_PATHS.map((path) => `/${path}`),
    // A page flagged false (for example sample pricing) is noindex and stays out.
    ...Object.entries(indexablePages)
      .filter(([, indexed]) => indexed === true)
      .map(([route]) => `/${route}`),
  ];
  if (contentRoot) {
    for (const path of CATALOG_PATHS) {
      const catalogPath = join(contentRoot, path, 'catalog.json');
      if (!(await exists(catalogPath))) continue;
      const catalog = await readJson(catalogPath);
      for (const item of Array.isArray(catalog) ? catalog : []) {
        if (!SLUG.test(item?.id ?? '') || item.available === false) continue;
        if (hiddenCourseIds.has(`${path}:${item.id}`)) continue;
        paths.push(`/${path}/${item.id}`);
      }
    }
    for (const unitKey of policy?.publicUnits ?? []) {
      paths.push(
        ...(await publicUnitPaths(contentRoot, unitKey, { hiddenCourseIds, retiredCourses, warn })),
      );
    }
  }
  const unique = [...new Set(paths)];
  const blocked = unique.filter((path) => isDisallowed(path));
  if (blocked.length) throw new Error(`Sitemap lists disallowed pages: ${blocked.join(', ')}`);
  return unique;
}

export function isDisallowed(path) {
  return DISALLOWED_PATHS.some((prefix) => path.startsWith(prefix));
}

function escapeXml(value) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character],
  );
}

export function renderRobots(origin) {
  return [
    '# Generated at build time by scripts/generate-seo-files.mjs (DLV-941).',
    'User-agent: *',
    'Allow: /',
    ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
    ...(origin ? ['', `Sitemap: ${origin}/sitemap.xml`] : []),
    '',
  ].join('\n');
}

export function renderSitemap(origin, paths) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((path) => `  <url><loc>${escapeXml(`${origin}${path}`)}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');
}

/** Writes robots.txt, and sitemap.xml when an origin is known, into outputDir. */
export async function writeSeoFiles({
  outputDir = resolve(repositoryRoot, 'public'),
  origin: rawOrigin = process.env.LOOKAHEAD_SITE_ORIGIN,
  contentRoot,
  protectedBuild = false,
  hiddenCourseIds,
  retiredCourses,
  indexablePages,
  log = console.log,
  warn = console.warn,
} = {}) {
  const origin = normalizeOrigin(rawOrigin);
  const root = contentRoot === undefined ? await resolveContentRoot({ protectedBuild }) : contentRoot;
  await mkdir(outputDir, { recursive: true });
  const robotsPath = join(outputDir, 'robots.txt');
  const sitemapPath = join(outputDir, 'sitemap.xml');
  await writeFile(robotsPath, renderRobots(origin));
  if (!origin) {
    await rm(sitemapPath, { force: true });
    log('SEO files: robots.txt written; no sitemap.xml because LOOKAHEAD_SITE_ORIGIN is not set.');
    return { robotsPath, sitemapPath: null, paths: [] };
  }
  const policy = root ? await readContentSamplesPolicy(root) : null;
  const paths = await collectSitemapPaths(root, {
    hiddenCourseIds: hiddenCourseIds ?? (await readHiddenCourseIds()),
    retiredCourses: retiredCourses ?? (await readRetiredCourses()),
    indexablePages: indexablePages ?? (await readIndexablePages()),
    policy,
    warn,
  });
  await writeFile(sitemapPath, renderSitemap(origin, paths));
  log(
    `SEO files: robots.txt and sitemap.xml (${paths.length} pages for ${origin}; ` +
      `${root ? 'catalog from the build content root' : 'no content root found, home and catalogs only'}; ` +
      `${policy ? 'public-unit lessons from policies/content-samples.json' : 'no content samples policy, lessons omitted'}).`,
  );
  return { robotsPath, sitemapPath, paths };
}

/** `ng build` arguments -> whether this is a protected (connected) build. */
export function isProtectedBuild(args) {
  return args.some((argument, index) => {
    const value = argument.startsWith('--configuration=')
      ? argument.slice('--configuration='.length)
      : argument === '--configuration' || argument === '-c'
        ? args[index + 1] ?? ''
        : '';
    return value.split(',').includes('protected');
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await writeSeoFiles({ protectedBuild: isProtectedBuild(process.argv.slice(2)) });
}
