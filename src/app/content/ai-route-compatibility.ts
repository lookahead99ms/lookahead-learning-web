import { PartialMatchRouteSnapshot } from '@angular/router';

const legacyCourseId = 'ai-assisted-development';
const architectureCourseId = 'ai-systems-architecture';
const architectureUnits = new Set(['rag-grounding', 'structured-output', 'full-stack-ai-delivery']);

export function legacyAiModuleRedirect(route: PartialMatchRouteSnapshot): string {
  const moduleId = route.params['moduleId'];
  const path = architectureUnits.has(moduleId) ? 'look-ahead' : 'grow';
  const courseId = path === 'look-ahead' ? architectureCourseId : legacyCourseId;
  return `/${path}/${courseId}/module/${moduleId}`;
}

export function legacyAiItemRedirect(route: PartialMatchRouteSnapshot): string {
  const questionId = route.params['questionId'];
  const architectureItem = [...architectureUnits].some((unit) =>
    questionId.startsWith(`${legacyCourseId}-${unit}-`),
  );
  const path = architectureItem ? 'look-ahead' : 'grow';
  const courseId = architectureItem ? architectureCourseId : legacyCourseId;
  return `/${path}/${courseId}/${questionId}`;
}
