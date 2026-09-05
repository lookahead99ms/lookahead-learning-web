import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, shareReplay, switchMap } from 'rxjs';
import {
  CatalogItem,
  CatalogOverviewItem,
  CourseContent,
  DsaProblemV2,
  InterviewQuestion,
  SearchDocument,
} from './content.models';
import { DeliveryPlan } from './delivery-plan.models';

@Injectable({ providedIn: 'root' })
export class ContentService {
  private readonly http = inject(HttpClient);
  private readonly moduleQuestions = new Map<string, Observable<InterviewQuestion[]>>();
  private readonly searchIndex$ = this.http
    .get<SearchDocument[]>('/content/search-index.json')
    .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  private readonly interviewQuestionIndex$ = this.http
    .get<SearchDocument[]>('/content/interview-question-index.json')
    .pipe(shareReplay({ bufferSize: 1, refCount: true }));

  getCourse(pathId: string, courseId: string): Observable<CourseContent> {
    const base = `/content/${pathId}/${courseId}`;
    return this.http.get<CourseContent>(`${base}/course.json`).pipe(
      switchMap((manifest) => {
        // Planned modules are curriculum roadmap entries, not navigable lessons.
        // Keeping them out of the hydrated course prevents empty cards and dead next links.
        const publishedModules = manifest.modules.filter(
          (module) => module.reviewStatus !== 'planned',
        );
        const publishedSections = manifest.sections?.map((section) => ({
          ...section,
          moduleIds: section.moduleIds.filter((moduleId) =>
            publishedModules.some((module) => module.id === moduleId),
          ),
        }));
        return forkJoin(
          publishedModules.map((module) =>
            this.http.get<InterviewQuestion[]>(`${base}/modules/${module.id}.json`),
          ),
        ).pipe(
          switchMap((questionArrays) =>
            this.hydrateEssentialCanonicalProblems({
              ...manifest,
              modules: publishedModules,
              sections: publishedSections,
              questions: questionArrays.flat(),
            }),
          ),
        );
      }),
    );
  }

  getDsaProblem(problemId: string): Observable<DsaProblemV2> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(problemId)) {
      throw new Error(`Invalid canonical DSA problem id: ${problemId}`);
    }
    // Do not retain canonical details for the app lifetime while local content can be
    // replaced underneath ng serve. DLV-204 will introduce a bounded, version-aware cache.
    return this.http.get<DsaProblemV2>(`/content/learn/dsa-problems/${problemId}.json`);
  }

  private hydrateEssentialCanonicalProblems(course: CourseContent): Observable<CourseContent> {
    const problemIds = new Set<string>();
    for (const item of course.questions) {
      if (item.schemaVersion === 'pattern-lesson/v2') {
        for (const reference of item.essentialProblemRefs ?? []) {
          problemIds.add(reference.problemId);
        }
      }
    }
    if (!problemIds.size) return of(course);

    return forkJoin([...problemIds].map((id) => this.getDsaProblem(id))).pipe(
      map((problems) => {
        const byId = new Map(
          problems.map((problem) => {
            const practiceQuestionId = problem.placements.find(
              (placement) => placement.role === 'practice' && placement.questionId,
            )?.questionId;
            return [problem.id, { ...problem, practiceQuestionId }] as const;
          }),
        );
        return {
          ...course,
          questions: course.questions.map((item) => {
            const canonicalProblem = item.canonicalProblemRef
              ? byId.get(item.canonicalProblemRef.problemId)
              : undefined;
            if (item.schemaVersion === 'pattern-lesson/v2') {
              return {
                ...item,
                essentialProblems: item.essentialProblemRefs?.map(({ problemId }) => {
                  const problem = byId.get(problemId);
                  if (!problem)
                    throw new Error(`Canonical DSA problem ${problemId} was not loaded`);
                  return problem;
                }),
              };
            }
            return canonicalProblem ? { ...item, canonicalProblem } : item;
          }),
        };
      }),
    );
  }

  getSearchIndex(): Observable<SearchDocument[]> {
    return this.searchIndex$;
  }

  getInterviewQuestionIndex(): Observable<SearchDocument[]> {
    return this.interviewQuestionIndex$;
  }

  getDeliveryPlan(): Observable<DeliveryPlan> {
    return this.http.get<DeliveryPlan>('/content/delivery/delivery-plan.json');
  }

  getInterviewQuestion(
    pathId: string,
    courseId: string,
    moduleId: string,
    questionId: string,
  ): Observable<InterviewQuestion | undefined> {
    const modulePath = `/content/${pathId}/${courseId}/modules/${moduleId}.json`;
    let questions = this.moduleQuestions.get(modulePath);
    if (!questions) {
      questions = this.http
        .get<InterviewQuestion[]>(modulePath)
        .pipe(shareReplay({ bufferSize: 1, refCount: true }));
      this.moduleQuestions.set(modulePath, questions);
    }
    return questions.pipe(map((question) => question.find(({ id }) => id === questionId)));
  }

  getCatalog(pathId: string): Observable<CatalogItem[]> {
    return this.http.get<CatalogItem[]>(`/content/${pathId}/catalog.json`);
  }

  getCatalogOverview(pathId: string): Observable<CatalogOverviewItem[]> {
    return this.http.get<CatalogOverviewItem[]>(`/content/${pathId}/catalog-overview.json`);
  }
}
