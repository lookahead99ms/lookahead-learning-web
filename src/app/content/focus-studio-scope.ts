import { DsaProblemNavigation, DsaProblemPlacement, PatternProblemV1 } from './content.models';
import { matchesPatternContext } from './pattern-context';

export const FOCUS_STUDIO_PATTERN = 'core-data-structures:arrays';

/** Layout selection only. Content authorization remains owned by the existing loader. */
export function usesFocusStudio(
  problem: PatternProblemV1 | null,
  route: { path: string; courseId: string; questionId: string },
  requestedPattern: string,
): boolean {
  const canonical = problem as
    | (PatternProblemV1 & {
        navigation?: DsaProblemNavigation;
        placements?: DsaProblemPlacement[];
      })
    | null;
  if (!canonical?.practice || !canonical.navigation) return false;
  const contexts = [canonical.navigation, ...(canonical.navigation.alternates ?? [])];
  if (!contexts.some(({ handsOnPatternId }) => handsOnPatternId === FOCUS_STUDIO_PATTERN)) {
    return false;
  }
  // `requestedPattern` is the `?pattern=` value: an opaque context id or an old readable id.
  const requested = contexts.find(({ handsOnPatternId }) =>
    matchesPatternContext(requestedPattern, handsOnPatternId),
  );
  if (requested) return requested.handsOnPatternId === FOCUS_STUDIO_PATTERN;
  if (
    canonical.placements?.some(
      (placement) =>
        placement.path === route.path &&
        placement.courseId === route.courseId &&
        placement.questionId === route.questionId &&
        placement.courseId === 'core-data-structures' &&
        ['practice-arrays', 'practice-arrays-common'].includes(placement.moduleId ?? ''),
    )
  ) {
    return true;
  }
  return canonical.navigation.handsOnPatternId === FOCUS_STUDIO_PATTERN;
}
