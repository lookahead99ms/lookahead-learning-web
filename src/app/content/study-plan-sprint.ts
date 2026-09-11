import { variedTopics } from './study-plan-variation';
import type { SearchDocument } from './content.models';
import type {
  StudyPlan,
  StudyPlanAssignment,
  StudyPlanConfig,
  StudyPlanDay,
  StudyPlanTopic,
} from './study-plan';

/** Revision timeboxes reference canonical content; they never certify its completion. */
export function buildInterviewSprint(
  documents: SearchDocument[],
  config: StudyPlanConfig,
  topics: StudyPlanTopic[],
  priorities: ReadonlyMap<string, number>,
): StudyPlan {
  const includedTopics = variedTopics(
    topics.filter((t) => config.topicIds.includes(t.id) && config.accessTopicIds.includes(t.id)),
    config.variationKey,
  );
  const excludedTopics = topics.filter(
    (t) => config.topicIds.includes(t.id) && !config.accessTopicIds.includes(t.id),
  );
  const minutes = Math.min(9, Math.max(1, config.dailyHours)) * 60;
  const completed = new Set(config.completedContentIds ?? []);
  const gaps = new Set(config.needsReviewContentIds ?? []);
  const used = new Set<string>();
  const outcomeCounts = new Map<string, number>();
  const topicMinutes = new Map<string, number>();
  const idFor = (d: SearchDocument) => d.canonicalContentId ?? d.id;
  const isLesson = (d: SearchDocument) =>
    d.contentType === 'theory' || d.contentType === 'dsa-pattern';
  const familiarity = (t: StudyPlanTopic) => config.familiarity?.[t.id] ?? 'refresh';
  const candidates: {
    doc: SearchDocument;
    topic: StudyPlanTopic;
    key: string;
    deps: string[];
    ordinal: number;
  }[] = [];
  const seen = new Set<string>();
  for (const topic of includedTopics) {
    for (const [ordinal, doc] of documents.entries()) {
      if (
        doc.path !== topic.path ||
        !topic.courseIds.includes(doc.courseId) ||
        (topic.contentTypes && !topic.contentTypes.includes(doc.contentType)) ||
        (doc.discoveryKind && doc.discoveryKind !== 'lesson' && doc.discoveryKind !== 'practice')
      )
        continue;
      const id = idFor(doc);
      if (seen.has(id)) continue;
      seen.add(id);
      const deps = [
        ...new Set([
          ...(doc.studyPrerequisiteIds ?? []),
          ...(familiarity(topic) === 'new' && !isLesson(doc)
            ? (doc.studyRelatedLessonIds ?? [])
            : []),
        ]),
      ];
      const key = `${topic.id}:${doc.courseId}:${doc.studySequence ?? doc.moduleId}`;
      candidates.push({ doc, topic, key, deps, ordinal });
    }
  }
  const byId = new Map(candidates.map((c) => [idFor(c.doc), c]));
  const blocked = new Set<string>();
  function check(id: string, trail = new Set<string>()): boolean {
    if (completed.has(id)) return false;
    if (trail.has(id) || !byId.has(id)) return true;
    const next = new Set([...trail, id]);
    return byId.get(id)!.deps.some((d) => check(d, next));
  }
  for (const c of candidates) if (check(idFor(c.doc))) blocked.add(idFor(c.doc));
  const firstSessions = new Map<string, StudyPlanAssignment>();
  // One next opportunity per source, not five future obligations per item.
  const queue: { source: StudyPlanAssignment; dueDay: number; count: number }[] = [];
  const days: StudyPlanDay[] = [];
  function coveragePriority(key: string): number {
    const count = outcomeCounts.get(key) ?? 0;
    // A single subject deepens three initial areas before opening more; broad selections
    // continue to favor unrepresented areas. This is a versioned planning heuristic.
    if (includedTopics.length === 1 && outcomeCounts.size >= 3 && count === 0) return 1000;
    return count;
  }
  function orderedCandidates() {
    return candidates
      .filter(
        (c) =>
          !used.has(idFor(c.doc)) &&
          !blocked.has(idFor(c.doc)) &&
          c.deps.every((id) => completed.has(id) || firstSessions.get(id)?.timebox === false),
      )
      .sort(
        (a, b) =>
          (topicMinutes.get(a.topic.id) ?? 0) - (topicMinutes.get(b.topic.id) ?? 0) ||
          coveragePriority(a.key) - coveragePriority(b.key) ||
          Number(!gaps.has(idFor(a.doc))) - Number(!gaps.has(idFor(b.doc))) ||
          Number(isLesson(a.doc) && familiarity(a.topic) !== 'new') -
            Number(isLesson(b.doc) && familiarity(b.topic) !== 'new') ||
          (priorities.get(idFor(a.doc)) ?? a.doc.studySequence ?? a.ordinal) -
            (priorities.get(idFor(b.doc)) ?? b.doc.studySequence ?? b.ordinal) ||
          (config.variationKey
            ? includedTopics.indexOf(a.topic) - includedTopics.indexOf(b.topic)
            : 0) ||
          a.ordinal - b.ordinal,
      );
  }
  for (let day = 1; day <= 7; day++) {
    const assignments: StudyPlanAssignment[] = [];
    let left = minutes;
    const append = (item: StudyPlanAssignment) => {
      assignments.push(item);
      left -= item.minutes;
      topicMinutes.set(item.topicId, (topicMinutes.get(item.topicId) ?? 0) + item.minutes);
    };
    const reviewed = new Set<string>();
    const review = (final: boolean, reserve: number) => {
      const representedTopics = new Set<string>();
      while (true) {
        const duration = final ? 20 : 15;
        if (left - reserve < duration) break;
        const entry = queue
          .filter(
            (item) => (final || item.dueDay <= day) && !reviewed.has(item.source.sourceContentId!),
          )
          .sort(
            (a, b) =>
              (final
                ? Number(representedTopics.has(a.source.topicId)) -
                  Number(representedTopics.has(b.source.topicId))
                : 0) ||
              Number(!gaps.has(a.source.sourceContentId!)) -
                Number(!gaps.has(b.source.sourceContentId!)) ||
              (final
                ? (topicMinutes.get(a.source.topicId) ?? 0) -
                  (topicMinutes.get(b.source.topicId) ?? 0)
                : 0) ||
              a.dueDay - b.dueDay,
          )[0];
        if (!entry) break;
        representedTopics.add(entry.source.topicId);
        append({
          ...entry.source,
          id: `${entry.source.sourceContentId}:sprint:review:${day}`,
          kind: 'review',
          activity: final ? 'Rehearse' : 'Recall',
          minutes: duration,
          timebox: true,
          requiredSessionId: entry.source.id,
          reviewDueDay: entry.dueDay,
          instructions: final
            ? 'Explain your approach without notes, test one failure case, then recap your error notes. This is rehearsal, not proof of mastery.'
            : 'Recall the approach without notes. Revisit your mistake or uncertainty, then explain the correction. Record what still needs review.',
        });
        reviewed.add(entry.source.sourceContentId!);
        entry.count++;
        entry.dueDay = day + 2;
        if (!final) break;
      }
    };
    if (day === 7) review(true, 5);
    else {
      const next = orderedCandidates()[0];
      const reserve = next
        ? familiarity(next.topic) === 'new'
          ? isLesson(next.doc)
            ? 45
            : 50
          : 20
        : 0;
      review(false, reserve);
      while (left >= 20) {
        const next = orderedCandidates().find(
          (c) => (familiarity(c.topic) === 'new' ? (isLesson(c.doc) ? 45 : 50) : 20) <= left,
        );
        if (!next) break;
        const doc = next.doc,
          id = idFor(doc),
          learning = familiarity(next.topic) === 'new';
        const duration = learning ? (isLesson(doc) ? 45 : 50) : 20;
        // Keep short residual time honest instead of manufacturing extra miniature lessons.
        if (left - duration < 5 && assignments.length && !learning) break;
        const item: StudyPlanAssignment = {
          id: `${id}:sprint:new`,
          sourceContentId: id,
          kind: 'new',
          title: doc.title,
          courseTitle: doc.courseTitle,
          contentType: doc.contentType,
          topicId: next.topic.id,
          topicTitle: next.topic.title,
          route: doc.route ?? ['/', doc.path, doc.courseId, doc.contentId],
          minutes: duration,
          activity: learning
            ? isLesson(doc)
              ? 'Understand'
              : 'Practice'
            : isLesson(doc)
              ? 'Refresh'
              : 'Attempt',
          timebox: !learning,
          prerequisiteIds: next.deps,
          relatedLessonIds: doc.studyRelatedLessonIds ?? [],
          coverageKey: next.key,
          instructions: learning
            ? 'Learn or practise the published material at your pace. This duration is an estimate; unfinished work stays unfinished.'
            : isLesson(doc)
              ? 'First explain the concept from memory. Use the lesson to repair a specific gap, then note what remains unclear. This refresh does not complete the full lesson.'
              : 'Spend about 15 minutes attempting the task, then 5 minutes explaining the approach and checking errors. Stop at the timebox; an attempt does not mean the full problem is completed.',
        };
        append(item);
        used.add(id);
        firstSessions.set(id, item);
        outcomeCounts.set(next.key, (outcomeCounts.get(next.key) ?? 0) + 1);
        queue.push({ source: item, dueDay: day + 2, count: 0 });
      }
      if (left >= 20) review(false, 5);
    }
    days.push({
      day,
      phase:
        day <= 2
          ? 'Refresh, attempt, identify gaps'
          : day < 7
            ? 'Revisit gaps and contrast approaches'
            : 'Mixed rehearsal and error recap',
      focus:
        day === 7
          ? 'Rehearse earlier work and recap core concepts; no new topic'
          : includedTopics.length === 1
            ? 'Deepen your selected subject with contrasting tasks'
            : 'Cover selected subjects, then deepen represented areas',
      assignments,
      newCount: assignments.filter((a) => a.kind === 'new').length,
      reviewCount: assignments.filter((a) => a.kind === 'review').length,
      focusedMinutes: minutes - left,
      bufferMinutes: left,
    });
  }
  const futureReviews = queue.map((entry) => ({
    ...entry.source,
    id: `${entry.source.sourceContentId}:sprint:next-review`,
    kind: 'review' as const,
    activity: 'Recall' as const,
    timebox: true,
    minutes: 15,
    requiredSessionId: entry.source.id,
    reviewDueDay: entry.dueDay,
  }));
  return {
    config,
    mode: 'interview-revision',
    schedulingVersion: 'interview-sprint/v1',
    focusedDailyHours: minutes / 60,
    bufferHours: Math.max(0, config.dailyHours - minutes / 60),
    includedTopics,
    excludedTopics,
    days,
    weeks: [{ number: 1, label: 'Interview revision sprint', days }],
    uniqueNewItems: used.size,
    eligibleNewItems: byId.size,
    remainingNewItems: byId.size - used.size - blocked.size,
    blockedItems: [...blocked].map((id) => ({
      id,
      title: byId.get(id)!.doc.title,
      prerequisiteIds: byId.get(id)!.deps,
    })),
    futureReviews,
    overdueReviewCount: 0,
    reviewAssignments: days.reduce((n, d) => n + d.reviewCount, 0),
    topicCoverage: includedTopics.map((t) => ({
      id: t.id,
      title: t.title,
      availableItems: candidates.filter((c) => c.topic.id === t.id).length,
      scheduledItems: [...firstSessions.values()].filter((s) => s.topicId === t.id).length,
      minutes: topicMinutes.get(t.id) ?? 0,
      representedOutcomes: new Set(
        [...firstSessions.values()].filter((s) => s.topicId === t.id).map((s) => s.coverageKey),
      ).size,
    })),
  };
}
