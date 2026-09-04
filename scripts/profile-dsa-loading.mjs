import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const dsaCourses = [
  'learn/algorithmic-patterns',
  'learn/core-data-structures',
  'learn/sorting-searching',
];
const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const segment = /^[a-zA-Z0-9_-]+$/;

export function validateCoursePath(path) {
  if (
    typeof path !== 'string' ||
    path.split('/').length !== 2 ||
    !path.split('/').every((part) => segment.test(part))
  ) {
    throw new Error(`Invalid course path: ${path}`);
  }
  return path;
}

export function loopbackOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('HTTP sampling is restricted to a plain local loopback origin.');
  }
  return url.origin;
}

export function payloadShape(value) {
  const result = { objects: 0, arrays: 0, strings: 0, utf8StringBytes: 0 };
  function visit(node) {
    if (typeof node === 'string') {
      result.strings += 1;
      result.utf8StringBytes += Buffer.byteLength(node);
    } else if (Array.isArray(node)) {
      result.arrays += 1;
      node.forEach(visit);
    } else if (node && typeof node === 'object') {
      result.objects += 1;
      Object.values(node).forEach(visit);
    }
  }
  visit(value);
  return result;
}

// Mirrors getCourse's hydration, not a browser trace or JavaScript heap snapshot.
export async function profileCourses(loadBytes, coursePaths = dsaCourses) {
  if (!coursePaths.length || new Set(coursePaths).size !== coursePaths.length) {
    throw new Error('Provide a non-empty list of distinct courses.');
  }
  const files = [];
  const courses = [];
  async function load(path, kind) {
    const bytes = Buffer.from(await loadBytes(path));
    const value = JSON.parse(bytes.toString('utf8'));
    files.push({
      path,
      kind,
      bytes: bytes.length,
      gzipEstimateBytes: gzipSync(bytes).length,
      sha256: hash(bytes),
    });
    return value;
  }
  for (const coursePath of coursePaths) {
    validateCoursePath(coursePath);
    const manifest = await load(`${coursePath}/course.json`, 'manifest');
    if (!Array.isArray(manifest.modules)) throw new Error(`${coursePath}: missing modules`);
    const modules = manifest.modules.filter((module) => module.reviewStatus !== 'planned');
    if (new Set(modules.map((module) => module.id)).size !== modules.length) {
      throw new Error(`${coursePath}: duplicate module IDs`);
    }
    const questions = [];
    for (const module of modules) {
      if (typeof module.id !== 'string' || !segment.test(module.id)) {
        throw new Error(`${coursePath}: invalid module ID`);
      }
      const items = await load(`${coursePath}/modules/${module.id}.json`, 'module');
      if (!Array.isArray(items)) throw new Error(`${coursePath}/${module.id}: expected an array`);
      questions.push(...items);
    }
    const hydrated = {
      ...manifest,
      modules,
      sections: manifest.sections?.map((section) => ({
        ...section,
        moduleIds: section.moduleIds.filter((id) => modules.some((module) => module.id === id)),
      })),
      questions,
    };
    const ownFiles = files.filter((file) => file.path.startsWith(`${coursePath}/`));
    courses.push({
      coursePath,
      modules: modules.length,
      records: questions.length,
      requests: ownFiles.length,
      sourceBytes: ownFiles.reduce((sum, file) => sum + file.bytes, 0),
      serializedHydratedBytes: Buffer.byteLength(JSON.stringify(hydrated)),
      hydratedShape: payloadShape(hydrated),
    });
  }
  return {
    schemaVersion: 'dsa-loading-profile/v1',
    interpretation:
      'Source-derived hydration model. Serialized bytes and object counts are not measured browser heap. Gzip is an offline estimate, not observed transfer.',
    fingerprint: hash(
      files
        .map((file) => `${file.path}\0${file.sha256}\n`)
        .sort()
        .join(''),
    ),
    totals: {
      courses: courses.length,
      modules: courses.reduce((sum, course) => sum + course.modules, 0),
      records: courses.reduce((sum, course) => sum + course.records, 0),
      requests: files.length,
      sourceBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      gzipEstimateBytes: files.reduce((sum, file) => sum + file.gzipEstimateBytes, 0),
      serializedHydratedBytes: courses.reduce(
        (sum, course) => sum + course.serializedHydratedBytes,
        0,
      ),
    },
    browserHeapBytes: null,
    courses,
    files,
  };
}

export async function sampleHttp(files, origin, { fetchImpl = fetch, concurrency = 6 } = {}) {
  origin = loopbackOrigin(origin);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error('Sampling concurrency must be between 1 and 16.');
  }
  const started = performance.now();
  const results = new Array(files.length);
  let cursor = 0;
  async function worker() {
    while (cursor < files.length) {
      const index = cursor++;
      const file = files[index];
      if (!/^[a-zA-Z0-9_/-]+\.json$/.test(file.path)) throw new Error('Invalid sample path');
      const start = performance.now();
      const response = await fetchImpl(`${origin}/content/${file.path}`, {
        headers: { 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache' },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`${file.path}: HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (hash(bytes) !== file.sha256) throw new Error(`${file.path}: served/source mismatch`);
      const encoding = response.headers.get('content-encoding');
      results[index] = {
        path: file.path,
        status: response.status,
        bodyBytes: bytes.length,
        contentLength: response.headers.get('content-length'),
        contentEncoding: encoding,
        cacheControl: response.headers.get('cache-control'),
        durationMs: Number((performance.now() - start).toFixed(2)),
      };
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  return {
    label:
      'Node HTTP body sampling, not browser waterfall, cold-cache load time, or TLS/header bytes',
    origin,
    concurrency,
    requests: results.length,
    wallMs: Number((performance.now() - started).toFixed(2)),
    bodyBytes: results.reduce((sum, item) => sum + item.bodyBytes, 0),
    files: results,
  };
}

export function parseOptions(args) {
  const options = { root: null, out: null, origin: null, repeats: 3, courses: [] };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!['--root', '--out', '--origin', '--repeats', '--course'].includes(flag)) {
      throw new Error(`Unknown option: ${flag}`);
    }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--course') options.courses.push(validateCoursePath(value));
    else if (flag === '--repeats') options.repeats = Number(value);
    else options[flag.slice(2)] = value;
  }
  if (!options.root)
    throw new Error('--root is required; no private source is discovered implicitly.');
  if (!Number.isInteger(options.repeats) || options.repeats < 1 || options.repeats > 10) {
    throw new Error('--repeats must be between 1 and 10.');
  }
  if (options.origin) options.origin = loopbackOrigin(options.origin);
  if (!options.courses.length) options.courses = [...dsaCourses];
  return options;
}

export function requirePrivateOutput(path, publicRoot = repositoryRoot) {
  const out = resolve(path);
  const root = resolve(publicRoot);
  if (out === root || out.startsWith(`${root}${sep}`)) {
    throw new Error('Write reports outside the public web repository.');
  }
  return out;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const root = await realpath(resolve(options.root));
  const report = await profileCourses(async (path) => {
    const file = await realpath(resolve(root, path));
    const local = relative(root, file);
    if (local === '..' || local.startsWith(`..${sep}`)) throw new Error('Source escapes root');
    return readFile(file);
  }, options.courses);
  report.generatedAt = new Date().toISOString();
  report.nodeVersion = process.version;
  report.httpSamples = [];
  if (options.origin) {
    for (let run = 0; run < options.repeats; run += 1) {
      report.httpSamples.push(await sampleHttp(report.files, options.origin));
    }
  }
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) {
    const out = requirePrivateOutput(options.out);
    await mkdir(dirname(out), { recursive: true });
    const physicalParent = await realpath(dirname(out));
    requirePrivateOutput(resolve(physicalParent, relative(dirname(out), out)));
    // An existing output can itself be a symlink into the public checkout.
    try {
      requirePrivateOutput(await realpath(out));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await writeFile(out, json);
    console.log(JSON.stringify({ totals: report.totals, output: out }, null, 2));
  } else process.stdout.write(json);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
