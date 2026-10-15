import { ContentPath, SearchDocument } from '../../content/content.models';
import { StudyPlanTopic, studyPlanMatchesTopic } from '../../content/study-plan';
import { ReadyMadePath } from '../../content/study-plan-ready-made';
import { StudyAccount } from './study-plan-account';

/** Free accounts preview plans at one fixed size; every other window and hour stays locked. */
export const FREE_PREVIEW_DAYS = 7;
export const FREE_PREVIEW_HOURS = 1;
export const FREE_STARTER_PATH_ID = 'free-starter';
const FREE_STARTER_COURSES_PER_PATH = 2;

/**
 * Signed in with no course access: browse and preview plans, never save them. Content grants are
 * not checked: the server lists every free lesson there for every account.
 */
export function isFreeAccount(account: StudyAccount | null): boolean {
  return (
    !!account &&
    !account.topicGrants.length &&
    !account.authorPreview &&
    !account.permissions?.fullCurriculum
  );
}

/** Lessons and practice a planner may place; topic overview pages are never scheduled. */
export function isPlannable(document: SearchDocument): boolean {
  return (
    document.discoveryKind === undefined ||
    document.discoveryKind === 'lesson' ||
    document.discoveryKind === 'practice'
  );
}

/** Free or public items, which the content service serves to every signed-in account. */
export function isFreeDocument(document: SearchDocument): boolean {
  return document.access.tier === 'free' || document.access.public === true;
}

/** The free starter plan's courses: the first courses in each path that have free lessons. */
export function freeStarterTopics(
  topics: readonly StudyPlanTopic[],
  documents: readonly SearchDocument[],
): StudyPlanTopic[] {
  const free = documents.filter((item) => isPlannable(item) && isFreeDocument(item));
  const paths: ContentPath[] = ['learn', 'grow', 'blaze'];
  return paths.flatMap((path) =>
    topics
      .filter(
        (topic) => topic.path === path && free.some((item) => studyPlanMatchesTopic(item, topic)),
      )
      .slice(0, FREE_STARTER_COURSES_PER_PATH),
  );
}

/** A catalog entry for the free starter plan; previews are built in the browser, not fetched. */
export function freeStarterPath(topics: readonly StudyPlanTopic[]): ReadyMadePath {
  return {
    id: FREE_STARTER_PATH_ID,
    title: 'Free starter plan',
    summary:
      'A one-week taste of Learn, Grow and Blaze built only from free lessons, one hour a day.',
    roleLevel: 'Any level',
    startingKnowledge: ['No prior course access is needed.'],
    outcomes: ['See how a study plan paces lessons, practice and recall across a week.'],
    uncoveredScope: ['Lessons that need course access are not included.'],
    topics: topics.map(({ id, title }) => ({ id, title })),
    recommendedVariantId: `${FREE_STARTER_PATH_ID}-d7-h1`,
    variants: [
      {
        templateId: `${FREE_STARTER_PATH_ID}-d7-h1`,
        templateVersion: 'browser-preview',
        durationDays: FREE_PREVIEW_DAYS,
        dailyHours: FREE_PREVIEW_HOURS,
        intensive: false,
        intendedUse: 'a short, low-pressure first week with free lessons.',
        href: '',
        sha256: '',
        scheduledMinutes: FREE_PREVIEW_DAYS * FREE_PREVIEW_HOURS * 60,
        selectedContentCount: 0,
        availableContentCount: 0,
        topicIds: topics.map(({ id }) => id),
      },
    ],
  };
}
