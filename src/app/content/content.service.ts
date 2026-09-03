import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, shareReplay, switchMap } from 'rxjs';
import {
  CatalogItem,
  CatalogOverviewItem,
  CourseContent,
  InterviewQuestion,
  SearchDocument,
} from './content.models';

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
          map((questionArrays) => ({
            ...manifest,
            modules: publishedModules,
            sections: publishedSections,
            questions: questionArrays.flat(),
          })),
        );
      }),
    );
  }

  getSearchIndex(): Observable<SearchDocument[]> {
    return this.searchIndex$;
  }

  getInterviewQuestionIndex(): Observable<SearchDocument[]> {
    return this.interviewQuestionIndex$;
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
