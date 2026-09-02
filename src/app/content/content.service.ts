import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, shareReplay, switchMap } from 'rxjs';
import {
  CatalogItem,
  ContentAccess,
  CourseContent,
  InterviewQuestion,
  SearchDocument,
  isPatternLessonV1,
} from './content.models';

@Injectable({ providedIn: 'root' })
export class ContentService {
  private readonly http = inject(HttpClient);
  private readonly searchIndex$ = forkJoin({
    learn: this.getCatalog('learn'),
    grow: this.getCatalog('grow'),
  }).pipe(
    switchMap(({ learn, grow }) =>
      forkJoin([
        ...this.searchCourses('learn', learn),
        ...this.searchCourses('grow', grow),
      ]),
    ),
    map((results) => results.flat()),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  getCourse(pathId: string, courseId: string): Observable<CourseContent> {
    const base = `/content/${pathId}/${courseId}`;
    return this.http.get<CourseContent>(`${base}/course.json`).pipe(
      switchMap((manifest) => {
        // Planned modules are curriculum roadmap entries, not navigable lessons.
        // Keeping them out of the hydrated course prevents empty cards and dead next links.
        const publishedModules = manifest.modules.filter((module) => module.reviewStatus !== 'planned');
        const publishedSections = manifest.sections?.map((section) => ({
          ...section,
          moduleIds: section.moduleIds.filter((moduleId) => publishedModules.some((module) => module.id === moduleId)),
        }));
        return forkJoin(
          publishedModules.map((module) =>
            this.http.get<InterviewQuestion[]>(`${base}/modules/${module.id}.json`)
          )
        ).pipe(
          map((questionArrays) => ({
            ...manifest,
            modules: publishedModules,
            sections: publishedSections,
            questions: questionArrays.flat(),
          }))
        );
      })
    );
  }

  getSearchIndex(): Observable<SearchDocument[]> {
    return this.searchIndex$;
  }

  private searchCourses(pathId: 'learn' | 'grow', catalog: CatalogItem[]): Observable<SearchDocument[]>[] {
    return catalog
      .filter((item): item is CatalogItem & { id: string } => Boolean(item.id) && item.available !== false)
      .map((item) =>
        this.getCourse(pathId, item.id).pipe(
          map((course) => this.toSearchDocuments(pathId, course, item.access)),
        ),
      );
  }

  private toSearchDocuments(path: 'learn' | 'grow', course: CourseContent, catalogAccess?: ContentAccess): SearchDocument[] {
    return course.questions.map((question) => {
      const module = course.modules.find(({ id }) => id === question.moduleId);
      const moduleTitle = module?.title ?? question.moduleId;
      const access = question.access ?? module?.access ?? course.access ?? catalogAccess ?? { tier: 'free' as const };
      const articleText = [
        question.summary ?? '',
        ...(question.sections ?? []).flatMap((section) => [
          section.heading,
          ...section.body,
          section.callout?.title ?? '',
          section.callout?.text ?? '',
        ]),
        ...(question.keyTakeaways ?? []),
        ...(isPatternLessonV1(question)
          ? [
              ...question.learningOutcomes,
              question.memoryAnchor.phrase,
              question.memoryAnchor.mentalModel,
              question.memoryAnchor.retrievalCue,
              question.interviewRecall.prompt,
              ...question.interviewRecall.answerFramework,
              ...(question.namedAlgorithms ?? []).flatMap(
                ({ name, family, useWhen, invariant, complexity, memoryAnchor }) => [
                  name,
                  family,
                  useWhen,
                  invariant,
                  complexity,
                  memoryAnchor,
                ],
              ),
              question.definition.heading,
              ...question.definition.body,
              question.definition.maintainedState,
              question.motivation.heading,
              ...question.motivation.body,
              question.motivation.avoidedWork,
              question.recognition.heading,
              ...question.recognition.body,
              ...question.recognition.signals,
              ...question.recognition.falseFriends,
              question.model.heading,
              question.model.state,
              question.model.invariant,
              question.model.decisionRule,
              question.model.proof,
              ...question.variations.flatMap(({ title, trigger, invariant }) => [title, trigger, invariant]),
              ...question.template.introduction,
              question.conceptVisual.heading,
              ...question.conceptVisual.body,
              question.complexity.note,
              ...question.complexity.why,
              ...question.complexity.tradeoffs,
              ...question.pitfalls.flatMap(({ failedAssumption, symptom, correction }) => [failedAssumption, symptom, correction]),
              ...question.guidance.useWhen,
              ...question.guidance.avoidWhen,
              ...question.workedExamples.flatMap(({ title, explanation, steps }) => [title, explanation, ...steps]),
              ...question.keyTakeaways,
            ]
          : []),
      ];
      const searchableParts = [question.title, question.tags.join(' '), course.title, moduleTitle, ...articleText];
      if (access.tier === 'free') {
        searchableParts.push(
          question.interviewAnswer,
          question.explanation.join(' '),
          question.followUps.map(({ question: title, answer }) => `${title} ${answer}`).join(' '),
        );
      }
      // Legacy Q&A entries may carry a `theory` label. Treat an item as an
      // article only when it has article sections; otherwise it remains Q&A.
      const contentType = question.contentType === 'theory' && (isPatternLessonV1(question) || question.sections?.length)
        ? 'theory'
        : question.contentType === 'theory'
          ? 'q-and-a'
          : question.contentType ?? 'q-and-a';
      const contentTypeLabel = contentType === 'q-and-a' ? 'Q&A' : contentType === 'dsa-pattern' ? 'DSA pattern' : contentType === 'system-design' ? 'System design' : contentType === 'language-comparison' ? 'Language comparison' : contentType === 'guide' ? 'Guide' : 'Theory';
      const pathLabel = path[0].toUpperCase() + path.slice(1);
      const filterTags = this.uniqueLabels([pathLabel, contentTypeLabel, question.difficulty, ...question.tags]);
      return {
        id: `${path}:${course.id}:${question.id}`,
        path,
        courseId: course.id,
        courseTitle: course.title,
        moduleId: question.moduleId,
        moduleTitle,
        title: question.title,
        contentType,
        tags: question.tags,
        filterTags,
        difficulty: question.difficulty,
        preview: access.tier === 'free' ? question.interviewAnswer : '',
        access,
        searchableText: searchableParts.join(' ').toLowerCase(),
        route: ['/', path, course.id, question.id],
        question,
      };
    });
  }

  getCatalog(pathId: string): Observable<CatalogItem[]> {
    return this.http.get<CatalogItem[]>(`/content/${pathId}/catalog.json`);
  }

  private uniqueLabels(labels: string[]): string[] {
    const seen = new Set<string>();
    return labels.filter((label) => {
      const key = label.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
