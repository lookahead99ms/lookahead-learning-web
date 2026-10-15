import { PageMeta, pageTitle } from './page-meta';
import { CATALOG_LABELS, CatalogPath, DynamicPageTarget } from './page-meta-routes';

/**
 * The only course fields meta tags may use. Everything here is public-tier metadata that the
 * course page already shows to signed-out visitors (course-content-locator/v1 and catalog.json).
 * Lesson bodies, answers, summaries and code are not part of this shape.
 */
export interface PublicCourseMetadata {
  id: string;
  title: string;
  description: string;
  modules: { id: string; title: string; description: string }[];
  sections: { id: string; title: string; description: string }[];
  units: {
    id: string;
    title: string;
    description: string;
    moduleIds: string[];
    /** Authored card scene, kept only when it is a shipped /assets/scenes/ file. */
    scene?: string;
  }[];
  items: { id: string; moduleId: string; title: string; contentType: string }[];
}

function courseScene(path: CatalogPath, courseId: string): string {
  return `/assets/scenes/courses/${path}-${courseId}.svg`;
}

/** The learning unit whose theory, question, practice or listed modules include this module. */
function unitFor(course: PublicCourseMetadata, moduleId: string) {
  return course.units.find((unit) => unit.moduleIds.includes(moduleId));
}

function sentence(text: string): string {
  return /[.?!…]$/.test(text) ? text : `${text}.`;
}

function contentKind(contentType: string): string {
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

/** Meta for a course, module, section or lesson page from public course metadata. */
export function dynamicPageMeta(
  target: DynamicPageTarget,
  course: PublicCourseMetadata,
): PageMeta {
  const pathLabel = CATALOG_LABELS[target.path];
  const coursePage: PageMeta = {
    title: pageTitle(course.title, pathLabel),
    description: course.description || `${pathLabel} course: ${course.title}.`,
    image: courseScene(target.path, course.id),
  };
  switch (target.kind) {
    case 'course':
      return coursePage;
    case 'section': {
      const section = course.sections.find(({ id }) => id === target.sectionId);
      if (!section) return coursePage;
      return {
        ...coursePage,
        title: pageTitle(section.title, course.title),
        description: section.description || coursePage.description,
      };
    }
    case 'module': {
      const module = course.modules.find(({ id }) => id === target.moduleId);
      if (!module) return coursePage;
      const unit = unitFor(course, module.id);
      return {
        title: pageTitle(module.title, course.title),
        description: module.description || unit?.description || coursePage.description,
        image: unit?.scene ?? coursePage.image,
      };
    }
    case 'lesson': {
      const item = course.items.find(({ id }) => id === target.itemId);
      if (!item) return coursePage;
      const unit = unitFor(course, item.moduleId);
      const module = course.modules.find(({ id }) => id === item.moduleId);
      const context = unit?.description || module?.description || course.description;
      const lead = `${contentKind(item.contentType)} from ${course.title}: ${sentence(item.title)}`;
      return {
        title: pageTitle(item.title, course.title),
        description: context ? `${lead} ${context}` : lead,
        image: unit?.scene ?? coursePage.image,
        type: 'article',
      };
    }
  }
}
