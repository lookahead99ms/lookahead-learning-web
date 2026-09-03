import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const paths = ['learn', 'grow', 'look-ahead'];
const languages = new Set(['java', 'python', 'go']);

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function isTheoryArticle(item) {
  return (
    item?.contentType === 'theory' &&
    (['pattern-lesson/v1', 'foundation-lesson/v1'].includes(item.schemaVersion) ||
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

async function documentsForCourse(contentRoot, path, catalogItem) {
  const courseRoot = join(contentRoot, path, catalogItem.id);
  const course = await readJson(join(courseRoot, 'course.json'));
  const modules = course.modules.filter((module) => module.reviewStatus !== 'planned');
  const questionArrays = await Promise.all(
    modules.map((module) => readJson(join(courseRoot, 'modules', `${module.id}.json`))),
  );
  const moduleById = new Map(modules.map((module) => [module.id, module]));

  return questionArrays.flat().map((question) => {
    const module = moduleById.get(question.moduleId);
    const moduleTitle = module?.title ?? question.moduleId;
    const access = question.access ??
      module?.access ??
      course.access ??
      catalogItem.access ?? { tier: 'free' };
    const contentType = normalizedContentType(question);
    const pathLabel =
      path === 'look-ahead' ? 'Look Ahead' : `${path[0].toUpperCase()}${path.slice(1)}`;
    const resolvedLanguages = questionLanguages(question);
    const filterTags = uniqueLabels([
      pathLabel,
      contentTypeLabel(contentType),
      question.difficulty,
      ...resolvedLanguages.map((language) =>
        language === 'go' ? 'Go' : `${language[0].toUpperCase()}${language.slice(1)}`,
      ),
      ...question.tags,
    ]);
    const searchableParts = [question.title, course.title, moduleTitle, ...question.tags];
    if (access.tier === 'free') {
      searchableParts.push(
        question.interviewAnswer,
        question.summary,
        ...(question.keyTakeaways ?? []),
        ...(question.sections ?? []).flatMap((section) => [
          section.heading,
          ...section.body,
          section.callout?.title,
          section.callout?.text,
        ]),
        ...question.followUps.flatMap((followUp) => [followUp.question, followUp.answer]),
      );
    }

    return {
      id: `${path}:${course.id}:${question.id}`,
      contentId: question.id,
      path,
      courseId: course.id,
      courseTitle: course.title,
      moduleId: question.moduleId,
      moduleTitle,
      title: question.title,
      contentType,
      tags: question.tags,
      filterTags,
      languages: resolvedLanguages,
      difficulty: question.difficulty,
      preview: access.tier === 'free' ? question.interviewAnswer : '',
      access,
      searchableText: searchableParts.join(' ').toLowerCase(),
      route: ['/', path, course.id, question.id],
    };
  });
}

export async function generateSearchIndex(contentRoot) {
  const courseJobs = [];
  for (const path of paths) {
    const catalogPath = join(contentRoot, path, 'catalog.json');
    try {
      await access(catalogPath);
    } catch {
      continue;
    }
    const catalog = await readJson(catalogPath);
    for (const item of catalog) {
      if (item.id && item.available !== false) {
        const courseFile = join(contentRoot, path, item.id, 'course.json');
        try {
          await access(courseFile);
          courseJobs.push(documentsForCourse(contentRoot, path, item));
        } catch {
          // Special catalog experiences such as Hands-on DSA do not hydrate as courses.
        }
      }
    }
  }
  const documents = (await Promise.all(courseJobs)).flat();
  const documentIds = new Set();
  for (const document of documents) {
    if (documentIds.has(document.id)) {
      throw new Error(`Search index contains duplicate document id ${document.id}`);
    }
    documentIds.add(document.id);
    if (
      !document.contentId ||
      !document.courseId ||
      !document.moduleId ||
      !document.title ||
      !document.searchableText
    ) {
      throw new Error(`Search index document ${document.id} is incomplete`);
    }
  }
  const interviewQuestionDocuments = documents.filter(({ contentType }) =>
    ['q-and-a', 'system-design', 'language-comparison'].includes(contentType),
  );
  await Promise.all([
    writeFile(join(contentRoot, 'search-index.json'), JSON.stringify(documents)),
    writeFile(
      join(contentRoot, 'interview-question-index.json'),
      JSON.stringify(interviewQuestionDocuments),
    ),
  ]);
  return {
    searchDocumentCount: documents.length,
    interviewQuestionCount: interviewQuestionDocuments.length,
  };
}
