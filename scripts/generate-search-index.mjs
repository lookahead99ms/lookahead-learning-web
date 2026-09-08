import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { readCanonicalDsaProblems } from './canonical-dsa-contract.mjs';

const paths = ['learn', 'grow', 'look-ahead'];
const languages = new Set(['java', 'python', 'go']);
const practiceContentTypes = new Set([
  'q-and-a',
  'dsa-problem',
  'system-design',
  'language-comparison',
]);
const previewCharacterLimit = 280;

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

function contentVersion(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

function isTheoryArticle(item) {
  return (
    item?.contentType === 'theory' &&
    (['pattern-lesson/v1', 'pattern-lesson/v2', 'foundation-lesson/v1'].includes(
      item.schemaVersion,
    ) ||
      (Array.isArray(item.sections) && item.sections.length > 0))
  );
}

function normalizedContentType(item) {
  if (isTheoryArticle(item)) return 'theory';
  return item.contentType === 'theory' ? 'q-and-a' : (item.contentType ?? 'q-and-a');
}

function contentTypeLabel(type) {
  switch (type) {
    case 'q-and-a':
      return 'Q&A';
    case 'dsa-pattern':
      return 'DSA pattern';
    case 'dsa-problem':
      return 'DSA problem';
    case 'system-design':
      return 'System design';
    case 'language-comparison':
      return 'Language comparison';
    case 'guide':
      return 'Guide';
    default:
      return 'Theory';
  }
}

function uniqueLabels(labels) {
  const seen = new Set();
  return labels.filter((label) => {
    if (typeof label !== 'string' || !label.trim()) return false;
    const key = label.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function questionLanguages(question) {
  const candidates = [
    question.code?.language,
    ...(question.solutions ?? []).map(({ language }) => language),
    ...(question.sections ?? []).flatMap((section) => [
      section.code?.language,
      ...(section.solutions ?? []).map(({ language }) => language),
    ]),
    ...(question.schemaVersion === 'pattern-lesson/v1'
      ? question.template.implementations.map(({ language }) => language)
      : []),
    ...question.tags,
  ];
  return uniqueLabels(candidates.map((candidate) => candidate?.toLowerCase() ?? '')).filter(
    (candidate) => languages.has(candidate),
  );
}

function compactPreview(value) {
  const plainText = String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plainText.length <= previewCharacterLimit
    ? plainText
    : `${plainText.slice(0, previewCharacterLimit - 1).trimEnd()}…`;
}

function isPracticeDocument(document) {
  return practiceContentTypes.has(document.contentType);
}

function summaryFor(question, contentType, access, detailRef, canonicalProblem) {
  return {
    id: question.id,
    moduleId: question.moduleId,
    order: question.order,
    title: canonicalProblem?.title ?? question.title,
    difficulty: canonicalProblem?.difficulty ?? question.difficulty,
    tags: uniqueLabels([...(canonicalProblem?.tags ?? []), ...(question.tags ?? [])]),
    contentType,
    isTheoryArticle: isTheoryArticle(question),
    detailRef,
    ...(question.reviewStatus ? { reviewStatus: question.reviewStatus } : {}),
    ...(access ? { access } : {}),
    ...(question.relatedArticleId ? { relatedArticleId: question.relatedArticleId } : {}),
    ...(question.schemaVersion ? { schemaVersion: question.schemaVersion } : {}),
    ...(question.canonicalProblemRef ? { canonicalProblemRef: question.canonicalProblemRef } : {}),
  };
}

function documentFor(question, context) {
  const { path, course, moduleTitle, access, contentType, canonicalProblem, detailRef } = context;
  const pathLabel =
    path === 'look-ahead' ? 'Look Ahead' : `${path[0].toUpperCase()}${path.slice(1)}`;
  const title = canonicalProblem?.title ?? question.title;
  const difficulty = canonicalProblem?.difficulty ?? question.difficulty;
  const tags = uniqueLabels([...(canonicalProblem?.tags ?? []), ...(question.tags ?? [])]);
  const resolvedLanguages = canonicalProblem
    ? uniqueLabels(
        (canonicalProblem.implementations ?? []).map(({ language }) => language?.toLowerCase()),
      ).filter((candidate) => languages.has(candidate))
    : questionLanguages(question);

  return {
    id: canonicalProblem ? `dsa:${canonicalProblem.id}` : `${path}:${course.id}:${question.id}`,
    contentId: question.id,
    ...(canonicalProblem ? { canonicalContentId: canonicalProblem.id } : {}),
    path,
    courseId: course.id,
    courseTitle: course.title,
    moduleId: question.moduleId,
    moduleTitle,
    title,
    contentType,
    tags,
    filterTags: uniqueLabels([
      pathLabel,
      contentTypeLabel(contentType),
      difficulty,
      ...resolvedLanguages.map((language) =>
        language === 'go' ? 'Go' : `${language[0].toUpperCase()}${language.slice(1)}`,
      ),
      ...tags,
    ]),
    languages: resolvedLanguages,
    difficulty,
    preview:
      access.tier === 'free'
        ? compactPreview(canonicalProblem?.practice.statement.prompt ?? question.interviewAnswer)
        : '',
    access,
    searchableText: '',
    route: ['/', path, course.id, question.id],
    detailRef,
  };
}

function indexRecord(document) {
  const {
    path: _path,
    filterTags: _filterTags,
    searchableText: _searchableText,
    route: _route,
    ...record
  } = document;
  return record;
}

function deduplicateCanonicalDocuments(documents) {
  const byId = new Map();
  for (const document of documents) {
    if (!byId.has(document.id)) byId.set(document.id, document);
  }
  return [...byId.values()];
}

function catalogOverview(path, catalog, documents, courseTopics) {
  const pathDocuments = documents.filter((document) => document.path === path);

  return catalog.map((item) => {
    const courseDocuments = pathDocuments.filter((document) => document.courseId === item.id);
    const keyTopics = courseTopics.get(`${path}/${item.id}`) ?? [];
    return {
      ...item,
      lessonCount: courseDocuments.filter(
        ({ contentType }) => contentType !== 'q-and-a' && contentType !== 'dsa-problem',
      ).length,
      questionCount: courseDocuments.filter(({ contentType }) => contentType === 'q-and-a').length,
      moduleCount: new Set(courseDocuments.map(({ moduleId }) => moduleId)).size,
      topicPreview:
        path === 'grow' && keyTopics.length
          ? keyTopics
          : uniqueLabels(courseDocuments.map(({ moduleTitle }) => moduleTitle)),
      languages: uniqueLabels(courseDocuments.flatMap(({ languages: values }) => values)),
    };
  });
}

async function contentForCourse(contentRoot, path, catalogItem, canonicalProblems, courseTopics) {
  const courseRoot = join(contentRoot, path, catalogItem.id);
  const course = await readJson(join(courseRoot, 'course.json'));
  courseTopics.set(
    `${path}/${catalogItem.id}`,
    uniqueLabels(Array.isArray(course.chips) ? course.chips : []).map((label) => label.trim()),
  );
  const modules = course.modules.filter((module) => module.reviewStatus !== 'planned');
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const documents = [];
  const items = [];
  const moduleRefs = [];

  for (const module of modules) {
    const modulePath = join(courseRoot, 'modules', `${module.id}.json`);
    const questions = await readJson(modulePath);
    moduleRefs.push({
      moduleId: module.id,
      href: `/content/${path}/${course.id}/modules/${module.id}.json`,
      version: contentVersion(questions),
      itemIds: questions.map(({ id }) => id),
    });

    for (const question of questions) {
      const contentType = normalizedContentType(question);
      const canonicalProblemId = question.canonicalProblemRef?.problemId;
      if (contentType === 'dsa-problem' && !canonicalProblemId) continue;
      const canonicalProblem = canonicalProblemId
        ? canonicalProblems.get(canonicalProblemId)
        : undefined;
      if (canonicalProblemId && !canonicalProblem) {
        throw new Error(`${question.id}: unresolved canonical DSA problem ${canonicalProblemId}`);
      }
      const access = question.access ??
        module.access ??
        course.access ??
        catalogItem.access ?? { tier: 'free' };
      const detailRef = canonicalProblem
        ? {
            kind: 'canonical-dsa',
            href: `/content/learn/dsa-problems/${canonicalProblem.id}.json`,
            version: contentVersion(canonicalProblem),
          }
        : {
            kind: 'content-item',
            href: `/content/details/${path}/${course.id}/${module.id}/${question.id}.json`,
            version: contentVersion(question),
          };

      if (!canonicalProblem) {
        await writeJson(
          join(contentRoot, 'details', path, course.id, module.id, `${question.id}.json`),
          question,
        );
      }
      items.push(summaryFor(question, contentType, access, detailRef, canonicalProblem));
      documents.push(
        documentFor(question, {
          path,
          course,
          moduleTitle: moduleById.get(question.moduleId)?.title ?? question.moduleId,
          access,
          contentType,
          canonicalProblem,
          detailRef,
        }),
      );
    }
  }

  const { questions: _questions, modules: _sourceModules, ...courseFields } = course;
  const locator = {
    schemaVersion: 'course-content-locator/v1',
    course: { ...courseFields, modules },
    items,
    modules: moduleRefs,
  };
  await writeJson(join(courseRoot, 'content-locator.json'), locator);
  return { documents };
}

export async function generateSearchIndex(contentRoot) {
  await Promise.all([
    rm(join(contentRoot, 'indexes'), { recursive: true, force: true }),
    rm(join(contentRoot, 'details'), { recursive: true, force: true }),
    rm(join(contentRoot, 'search-index.json'), { force: true }),
    rm(join(contentRoot, 'interview-question-index.json'), { force: true }),
  ]);

  const courseJobs = [];
  const catalogs = new Map();
  const courseTopics = new Map();
  const canonicalProblems = await readCanonicalDsaProblems(contentRoot);
  for (const path of paths) {
    const catalogPath = join(contentRoot, path, 'catalog.json');
    try {
      await access(catalogPath);
    } catch {
      continue;
    }
    const catalog = await readJson(catalogPath);
    catalogs.set(path, catalog);
    for (const item of catalog) {
      if (!item.id || item.available === false) continue;
      try {
        await access(join(contentRoot, path, item.id, 'course.json'));
        courseJobs.push({
          path,
          courseId: item.id,
          job: contentForCourse(contentRoot, path, item, canonicalProblems, courseTopics),
        });
      } catch {
        // Special catalog experiences such as Hands-On DSA do not hydrate as courses.
      }
    }
  }

  const courseResults = await Promise.all(
    courseJobs.map(async ({ path, courseId, job }) => ({ path, courseId, ...(await job) })),
  );
  const placementDocuments = courseResults.flatMap(
    ({ documents: courseDocuments }) => courseDocuments,
  );
  const documents = deduplicateCanonicalDocuments(placementDocuments);
  const documentIds = new Set();
  for (const document of documents) {
    if (documentIds.has(document.id)) {
      throw new Error(`Search index contains duplicate document id ${document.id}`);
    }
    documentIds.add(document.id);
    if (!document.contentId || !document.courseId || !document.moduleId || !document.title) {
      throw new Error(`Search index document ${document.id} is incomplete`);
    }
  }

  const shardReferences = [];
  for (const path of paths) {
    if (!catalogs.has(path)) continue;
    const pathDocuments = documents.filter((document) => document.path === path);
    const href = `/content/indexes/${path}.json`;
    await writeJson(join(contentRoot, 'indexes', `${path}.json`), {
      schemaVersion: 'content-index-shard/v1',
      path,
      documents: pathDocuments.map(indexRecord),
    });
    shardReferences.push({
      path,
      href,
      documentCount: pathDocuments.length,
      practiceDocumentCount: pathDocuments.filter(isPracticeDocument).length,
      courses: courseResults
        .filter((result) => result.path === path)
        .map(({ courseId }) => {
          const courseDocuments = pathDocuments.filter(
            (document) => document.courseId === courseId,
          );
          return {
            courseId,
            locatorHref: `/content/${path}/${courseId}/content-locator.json`,
            documentCount: courseDocuments.length,
            practiceDocumentCount: courseDocuments.filter(isPracticeDocument).length,
          };
        }),
    });
  }

  const practiceDocuments = documents.filter(isPracticeDocument);
  await writeJson(join(contentRoot, 'content-index-manifest.json'), {
    schemaVersion: 'content-index-manifest/v1',
    totals: {
      searchDocuments: documents.length,
      practiceDocuments: practiceDocuments.length,
    },
    practiceContentTypes: [...practiceContentTypes],
    shards: shardReferences,
  });
  await Promise.all(
    [...catalogs].map(([path, catalog]) =>
      writeJson(
        join(contentRoot, path, 'catalog-overview.json'),
        catalogOverview(path, catalog, placementDocuments, courseTopics),
      ),
    ),
  );
  return {
    searchDocumentCount: documents.length,
    interviewQuestionCount: practiceDocuments.length,
  };
}
