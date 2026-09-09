import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  answerSlideDeckReference,
  buildAnswerSlideDeck,
  contentVersion,
} from './answer-slide-contract.mjs';
import { readCanonicalDsaProblems } from './canonical-dsa-contract.mjs';

const paths = ['learn', 'grow', 'look-ahead'];
const languages = new Set(['java', 'python', 'go']);
const practiceContentTypes = new Set([
  'q-and-a',
  'dsa-problem',
  'system-design',
  'language-comparison',
]);
const practiceFormats = ['explain', 'solve', 'design', 'debug', 'rehearse'];
const previewCharacterLimit = 280;

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
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

function discoveryPreview(question, canonicalProblem, access) {
  if (access.tier !== 'free') return '';

  const preview = compactPreview(canonicalProblem?.practice.statement.prompt ?? question.summary);
  const answer = compactPreview(question.interviewAnswer);
  return preview && preview !== answer ? preview : '';
}

function isPracticeDocument(document) {
  return (
    document.discoveryKind === 'practice' ||
    (!document.discoveryKind && practiceContentTypes.has(document.contentType))
  );
}

function practiceFormatFor(question, contentType, moduleTitle) {
  if (question.practiceFormat !== undefined) {
    if (!practiceFormats.includes(question.practiceFormat)) {
      throw new Error(`${question.id}: invalid practice format ${question.practiceFormat}`);
    }
    return question.practiceFormat;
  }
  if (contentType === 'dsa-problem') return 'solve';
  if (contentType === 'system-design') return 'design';
  // A topic such as behavioral patterns or failure recovery does not turn a
  // conceptual question into a personal story or an incident simulation.
  if (/^(what|why|when)\b|^how (does\b|do (?!you\b))/i.test(question.title.trim())) {
    return 'explain';
  }
  if (/^design\s*:/i.test(question.title.trim())) return 'design';
  const directEvidence = [question.title, ...(question.tags ?? [])].join(' ').toLowerCase();
  const contextualEvidence = [directEvidence, moduleTitle].join(' ').toLowerCase();
  if (
    contentType === 'system-design' ||
    /\b(system design|low-level design|lld|architecture)\b/.test(contextualEvidence)
  )
    return 'design';
  if (
    /\b(behavioral|behavioural|carl|star|leadership story|experience story)\b/.test(
      contextualEvidence,
    )
  )
    return 'rehearse';
  if (
    /\b(debug|diagnos|incident|failure|recover|production issue|troubleshoot)\w*/.test(
      contextualEvidence,
    )
  )
    return 'debug';
  // A conceptual question can mention implementation without promising a coding workspace.
  if (question.title.trim().endsWith('?')) return 'explain';
  if (/\b(implement|write|build|code|exercise|hands-on)\b/.test(directEvidence)) return 'solve';
  return 'explain';
}

function summaryFor(
  question,
  contentType,
  access,
  detailRef,
  canonicalProblem,
  practiceFormat,
  answerSlidesRef,
) {
  return {
    id: question.id,
    moduleId: question.moduleId,
    order: question.order,
    title: canonicalProblem?.title ?? question.title,
    difficulty: canonicalProblem?.difficulty ?? question.difficulty,
    tags: uniqueLabels([...(canonicalProblem?.tags ?? []), ...(question.tags ?? [])]),
    contentType,
    ...(practiceFormat ? { practiceFormat } : {}),
    ...(answerSlidesRef ? { answerSlidesRef } : {}),
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
  const {
    path,
    course,
    moduleTitle,
    access,
    contentType,
    canonicalProblem,
    detailRef,
    practiceFormat,
    answerSlidesRef,
  } = context;
  const pathLabel =
    path === 'look-ahead' ? 'Look Ahead' : `${path[0].toUpperCase()}${path.slice(1)}`;
  const title = canonicalProblem?.title ?? question.title;
  const difficulty = canonicalProblem?.difficulty ?? question.difficulty;
  const tags = uniqueLabels([...(canonicalProblem?.tags ?? []), ...(question.tags ?? [])]);
  const discoveryKind =
    isTheoryArticle(question) || contentType === 'dsa-pattern' ? 'lesson' : 'practice';
  const subjects = uniqueLabels([
    ...(Array.isArray(course.chips) ? course.chips : []),
    ...(canonicalProblem?.tags ?? []),
    moduleTitle,
  ]);
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
    discoveryKind,
    ...(practiceFormat ? { practiceFormat } : {}),
    ...(answerSlidesRef ? { answerSlidesRef } : {}),
    subjects,
    tags,
    filterTags: uniqueLabels([
      pathLabel,
      contentTypeLabel(contentType),
      difficulty,
      ...resolvedLanguages.map((language) =>
        language === 'go' ? 'Go' : `${language[0].toUpperCase()}${language.slice(1)}`,
      ),
      ...subjects,
    ]),
    languages: resolvedLanguages,
    difficulty,
    preview: discoveryPreview(question, canonicalProblem, access),
    access,
    searchableText: '',
    route: ['/', path, course.id, question.id],
    detailRef,
  };
}

function courseDocument(path, catalogItem, course) {
  const pathLabel =
    path === 'look-ahead' ? 'Look Ahead' : `${path[0].toUpperCase()}${path.slice(1)}`;
  const subjects = uniqueLabels(Array.isArray(course.chips) ? course.chips : []);
  const access = course.access ?? catalogItem.access ?? { tier: 'free' };
  return {
    id: `course:${path}:${course.id}`,
    contentId: course.id,
    path,
    courseId: course.id,
    courseTitle: course.title,
    moduleId: course.id,
    moduleTitle: course.title,
    title: course.title,
    contentType: 'guide',
    discoveryKind: 'course',
    subjects,
    tags: subjects,
    filterTags: uniqueLabels([pathLabel, 'Course', ...subjects]),
    languages: [],
    preview: compactPreview(course.description ?? catalogItem.description),
    access,
    searchableText: '',
    route: ['/', path, course.id],
  };
}

function topicDocument(path, course, module) {
  const pathLabel =
    path === 'look-ahead' ? 'Look Ahead' : `${path[0].toUpperCase()}${path.slice(1)}`;
  const subjects = uniqueLabels([
    module.title,
    ...(Array.isArray(course.chips) ? course.chips : []),
  ]);
  const access = module.access ?? course.access ?? { tier: 'free' };
  return {
    id: `topic:${path}:${course.id}:${module.id}`,
    contentId: module.id,
    path,
    courseId: course.id,
    courseTitle: course.title,
    moduleId: module.id,
    moduleTitle: module.title,
    title: module.title,
    contentType: 'guide',
    discoveryKind: 'topic',
    subjects,
    tags: subjects,
    filterTags: uniqueLabels([pathLabel, 'Topic', ...subjects]),
    languages: [],
    preview: compactPreview(module.description),
    access,
    searchableText: '',
    route: ['/', path, course.id, 'module', module.id],
  };
}

function toolDocument(path, catalogItem) {
  const pathLabel =
    path === 'look-ahead' ? 'Look Ahead' : `${path[0].toUpperCase()}${path.slice(1)}`;
  const access = catalogItem.access ?? { tier: 'free' };
  return {
    id: `tool:${path}:${catalogItem.id}`,
    contentId: catalogItem.id,
    path,
    courseId: catalogItem.id,
    courseTitle: catalogItem.title,
    moduleId: catalogItem.id,
    moduleTitle: catalogItem.title,
    title: catalogItem.title,
    contentType: 'guide',
    discoveryKind: 'tool',
    subjects: [],
    tags: [],
    filterTags: [pathLabel, 'Tool'],
    languages: [],
    preview: compactPreview(catalogItem.description),
    access,
    searchableText: '',
    route: ['/', path, catalogItem.id],
  };
}

function indexRecord(document) {
  const {
    path: _path,
    filterTags: _filterTags,
    searchableText: _searchableText,
    ...record
  } = document;
  return record;
}

function deduplicateCanonicalDocuments(documents, canonicalProblems) {
  const byId = new Map();
  for (const document of documents) {
    const existing = byId.get(document.id);
    if (!existing) {
      byId.set(document.id, document);
      continue;
    }
    if (!document.canonicalContentId) continue;
    const placement = ({
      path,
      courseId,
      courseTitle,
      moduleId,
      moduleTitle,
      contentId,
      route,
    }) => ({ path, courseId, courseTitle, moduleId, moduleTitle, contentId, route });
    existing.practicePlacements ??= [placement(existing)];
    existing.practicePlacements.push(placement(document));
    existing.subjects = uniqueLabels([...existing.subjects, ...document.subjects]);
    const primary = canonicalProblems
      .get(document.canonicalContentId)
      ?.placements?.find((item) => item.role === 'practice');
    if (primary?.courseId === document.courseId && primary.questionId === document.contentId) {
      byId.set(document.id, {
        ...document,
        practicePlacements: existing.practicePlacements,
        subjects: existing.subjects,
      });
    }
  }
  return [...byId.values()];
}

function catalogOverview(path, catalog, documents, courseTopics) {
  const pathDocuments = documents.filter((document) => document.path === path);

  return catalog.map((item) => {
    const courseDocuments = pathDocuments.filter(
      (document) =>
        document.courseId === item.id &&
        (document.discoveryKind === 'lesson' || document.discoveryKind === 'practice'),
    );
    const keyTopics = courseTopics.get(`${path}/${item.id}`) ?? [];
    return {
      ...item,
      lessonCount: courseDocuments.filter(
        ({ contentType }) => contentType !== 'q-and-a' && contentType !== 'dsa-problem',
      ).length,
      questionCount: courseDocuments.filter(({ contentType }) => contentType === 'q-and-a').length,
      moduleCount: new Set(courseDocuments.map(({ moduleId }) => moduleId)).size,
      topicPreview:
        (path === 'learn' || path === 'grow') && keyTopics.length
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
  const documents = [courseDocument(path, catalogItem, course)];
  const items = [];
  const moduleRefs = [];
  let answerSlideDeckCount = 0;

  for (const module of modules) {
    documents.push(topicDocument(path, course, module));
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
      const moduleTitle = moduleById.get(question.moduleId)?.title ?? question.moduleId;
      const discoveryKind =
        isTheoryArticle(question) || contentType === 'dsa-pattern' ? 'lesson' : 'practice';
      const practiceFormat =
        discoveryKind === 'practice'
          ? practiceFormatFor(question, contentType, moduleTitle)
          : undefined;
      let answerSlidesRef;
      if (discoveryKind === 'practice' && detailRef.kind === 'content-item') {
        const answerSlidesHref = `/content/answer-slides/${path}/${course.id}/${module.id}/${question.id}.json`;
        const deck = buildAnswerSlideDeck(question, { detailRef, practiceFormat });
        answerSlidesRef = answerSlideDeckReference(deck, answerSlidesHref);
        await writeJson(
          join(contentRoot, 'answer-slides', path, course.id, module.id, `${question.id}.json`),
          deck,
        );
        answerSlideDeckCount += 1;
      }

      if (!canonicalProblem) {
        await writeJson(
          join(contentRoot, 'details', path, course.id, module.id, `${question.id}.json`),
          question,
        );
      }
      items.push(
        summaryFor(
          question,
          contentType,
          access,
          detailRef,
          canonicalProblem,
          practiceFormat,
          answerSlidesRef,
        ),
      );
      documents.push(
        documentFor(question, {
          path,
          course,
          moduleTitle,
          access,
          contentType,
          canonicalProblem,
          detailRef,
          practiceFormat,
          answerSlidesRef,
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
  return { documents, answerSlideDeckCount };
}

export async function generateSearchIndex(contentRoot) {
  await Promise.all([
    rm(join(contentRoot, 'indexes'), { recursive: true, force: true }),
    rm(join(contentRoot, 'details'), { recursive: true, force: true }),
    rm(join(contentRoot, 'answer-slides'), { recursive: true, force: true }),
    rm(join(contentRoot, 'search-index.json'), { force: true }),
    rm(join(contentRoot, 'interview-question-index.json'), { force: true }),
  ]);

  const courseJobs = [];
  const catalogs = new Map();
  const courseTopics = new Map();
  const specialDocuments = [];
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
        specialDocuments.push(toolDocument(path, item));
      }
    }
  }

  const courseResults = await Promise.all(
    courseJobs.map(async ({ path, courseId, job }) => ({ path, courseId, ...(await job) })),
  );
  const placementDocuments = [
    ...courseResults.flatMap(({ documents: courseDocuments }) => courseDocuments),
    ...specialDocuments,
  ];
  const documents = deduplicateCanonicalDocuments(placementDocuments, canonicalProblems);
  const documentIds = new Set();
  for (const document of documents) {
    if (documentIds.has(document.id)) {
      throw new Error(`Search index contains duplicate document id ${document.id}`);
    }
    documentIds.add(document.id);
    if (!document.contentId || !document.courseId || !document.moduleId || !document.title) {
      throw new Error(`Search index document ${document.id} is incomplete`);
    }
    if (
      (document.discoveryKind === 'lesson' || document.discoveryKind === 'practice') &&
      !document.detailRef
    ) {
      throw new Error(`Search index content document ${document.id} has no detail reference`);
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
    practiceFormats,
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
    answerSlideDeckCount: courseResults.reduce(
      (total, result) => total + result.answerSlideDeckCount,
      0,
    ),
  };
}
