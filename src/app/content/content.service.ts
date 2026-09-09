import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  Observable,
  catchError,
  forkJoin,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import {
  CatalogItem,
  CatalogOverviewItem,
  ContentDetailReference,
  ContentIndexManifest,
  ContentIndexRecord,
  ContentIndexShard,
  ContentItemSummary,
  ContentPath,
  ContentType,
  CourseContentLocator,
  CourseOutline,
  DsaProblemV2,
  InterviewQuestion,
  SearchDocument,
} from './content.models';
import { DeliveryPlan } from './delivery-plan.models';
import type { HandsOnDsaIndex } from './hands-on-dsa';

export const CONTENT_DETAIL_CACHE_MAX_ENTRIES = 8;
export const CONTENT_DETAIL_CACHE_MAX_BYTES = 4 * 1024 * 1024;
export const DSA_DETAIL_CACHE_MAX_ENTRIES = CONTENT_DETAIL_CACHE_MAX_ENTRIES;
export const DSA_DETAIL_CACHE_MAX_BYTES = CONTENT_DETAIL_CACHE_MAX_BYTES;

interface ContentDetailCacheEntry {
  request: Observable<unknown>;
  bytes: number;
}

@Injectable({ providedIn: 'root' })
export class ContentService {
  private readonly http = inject(HttpClient);
  private readonly contentIndexManifest$ = this.http
    .get<ContentIndexManifest>('/content/content-index-manifest.json')
    .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  private readonly contentIndexShards = new Map<ContentPath, Observable<SearchDocument[]>>();
  private readonly handsOnDsaIndex$ = this.http
    .get<HandsOnDsaIndex>('/content/hands-on-dsa-index.json')
    .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  private readonly detailCache = new Map<string, ContentDetailCacheEntry>();
  private detailCacheBytes = 0;

  getCourseOutline(pathId: string, courseId: string): Observable<CourseOutline> {
    if (!this.validSlug(pathId) || !this.validSlug(courseId)) {
      return throwError(() => new Error('Invalid course locator path'));
    }
    return this.http
      .get<CourseContentLocator>(`/content/${pathId}/${courseId}/content-locator.json`)
      .pipe(
        map((locator) => {
          const courseModules = locator.course?.modules;
          const moduleIds = Array.isArray(courseModules)
            ? courseModules.map((module) => module.id)
            : [];
          const locatorModuleIds = Array.isArray(locator.modules)
            ? locator.modules.map((reference) => reference.moduleId)
            : [];
          const itemIds = Array.isArray(locator.items) ? locator.items.map((item) => item.id) : [];
          if (
            locator.schemaVersion !== 'course-content-locator/v1' ||
            locator.course?.id !== courseId ||
            locator.course?.path !== pathId ||
            !Array.isArray(courseModules) ||
            !Array.isArray(locator.modules) ||
            !Array.isArray(locator.items) ||
            this.hasDuplicates(moduleIds) ||
            this.hasDuplicates(locatorModuleIds) ||
            this.hasDuplicates(itemIds) ||
            locator.modules.some(
              (reference) =>
                !this.validSlug(reference.moduleId) ||
                !moduleIds.includes(reference.moduleId) ||
                !this.validDetailReference({
                  kind: 'content-item',
                  href: reference.href,
                  version: reference.version,
                }),
            ) ||
            locator.items.some(
              (item) =>
                !moduleIds.includes(item.moduleId) ||
                !this.validDetailReference(item.detailRef) ||
                !this.validPracticeFormat(item.practiceFormat),
            )
          ) {
            throw new Error(`Invalid course content locator: ${pathId}/${courseId}`);
          }
          return {
            ...locator.course,
            questions: locator.items,
            moduleDetailRefs: locator.modules,
          };
        }),
      );
  }

  getModuleQuestions(course: CourseOutline, moduleId: string): Observable<InterviewQuestion[]> {
    const reference = course.moduleDetailRefs.find((candidate) => candidate.moduleId === moduleId);
    if (!reference) return throwError(() => new Error(`Module detail not found: ${moduleId}`));
    return this.getCachedDetail<InterviewQuestion[]>({
      kind: 'content-item',
      href: reference.href,
      version: reference.version,
    });
  }

  getContentItem(summary: ContentItemSummary): Observable<InterviewQuestion> {
    if (summary.detailRef.kind !== 'content-item') {
      return throwError(() => new Error(`Content item ${summary.id} uses canonical DSA detail`));
    }
    return this.getCachedDetail<InterviewQuestion>(summary.detailRef).pipe(
      switchMap((question) => this.hydrateSelectedCanonicalProblems(question)),
    );
  }

  getDsaProblem(problemId: string, contentVersion?: string): Observable<DsaProblemV2> {
    if (!this.validSlug(problemId)) {
      throw new Error(`Invalid canonical DSA problem id: ${problemId}`);
    }
    const href = `/content/learn/dsa-problems/${problemId}.json`;
    if (!contentVersion) return this.http.get<DsaProblemV2>(href);
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(contentVersion)) {
      throw new Error(`Invalid canonical DSA content version: ${contentVersion}`);
    }
    return this.getCachedDetail<DsaProblemV2>({
      kind: 'canonical-dsa',
      href,
      version: contentVersion,
    });
  }

  getHandsOnDsaIndex(): Observable<HandsOnDsaIndex> {
    return this.handsOnDsaIndex$;
  }

  getSearchIndex(path?: ContentPath): Observable<SearchDocument[]> {
    return this.getContentIndex(path).pipe(map(({ documents }) => documents));
  }

  getInterviewQuestionIndex(path?: ContentPath): Observable<SearchDocument[]> {
    return this.getContentIndex(path).pipe(
      map(({ documents }) => documents.filter((document) => document.discoveryKind === 'practice')),
    );
  }

  getDeliveryPlan(): Observable<DeliveryPlan> {
    return this.http.get<DeliveryPlan>('/content/delivery/delivery-plan.json');
  }

  getInterviewQuestion(result: SearchDocument): Observable<InterviewQuestion | undefined> {
    if (!result.detailRef || result.detailRef.kind !== 'content-item') return of(undefined);
    return this.getCachedDetail<InterviewQuestion>(result.detailRef).pipe(
      map((question) => (question.id === result.contentId ? question : undefined)),
    );
  }

  getCatalog(pathId: string): Observable<CatalogItem[]> {
    return this.http.get<CatalogItem[]>(`/content/${pathId}/catalog.json`);
  }

  getCatalogOverview(pathId: string): Observable<CatalogOverviewItem[]> {
    return this.http.get<CatalogOverviewItem[]>(`/content/${pathId}/catalog-overview.json`);
  }

  private getCachedDetail<T>(reference: ContentDetailReference): Observable<T> {
    if (!this.validDetailReference(reference)) {
      return throwError(() => new Error(`Invalid content detail reference: ${reference.href}`));
    }
    const key = `${reference.kind}:${reference.href}@${reference.version}`;
    const cached = this.detailCache.get(key);
    if (cached) {
      this.detailCache.delete(key);
      this.detailCache.set(key, cached);
      return cached.request as Observable<T>;
    }

    const entry = {} as ContentDetailCacheEntry;
    entry.bytes = 0;
    entry.request = this.http.get<T>(reference.href).pipe(
      tap((detail) => this.recordDetailBytes(key, entry, detail)),
      catchError((error) => {
        this.removeDetailCacheEntry(key, entry);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.detailCache.set(key, entry);
    this.trimDetailCache();
    return entry.request as Observable<T>;
  }

  private recordDetailBytes(key: string, entry: ContentDetailCacheEntry, detail: unknown): void {
    if (this.detailCache.get(key) !== entry) return;
    const bytes = new TextEncoder().encode(JSON.stringify(detail)).byteLength;
    if (bytes > CONTENT_DETAIL_CACHE_MAX_BYTES) {
      this.removeDetailCacheEntry(key, entry);
      return;
    }
    this.detailCacheBytes -= entry.bytes;
    entry.bytes = bytes;
    this.detailCacheBytes += bytes;
    this.trimDetailCache();
  }

  private trimDetailCache(): void {
    while (
      this.detailCache.size > CONTENT_DETAIL_CACHE_MAX_ENTRIES ||
      this.detailCacheBytes > CONTENT_DETAIL_CACHE_MAX_BYTES
    ) {
      const oldestKey = this.detailCache.keys().next().value as string | undefined;
      if (!oldestKey) return;
      this.removeDetailCacheEntry(oldestKey, this.detailCache.get(oldestKey));
    }
  }

  private removeDetailCacheEntry(key: string, expected?: ContentDetailCacheEntry): void {
    const current = this.detailCache.get(key);
    if (!current || (expected && current !== expected)) return;
    this.detailCache.delete(key);
    this.detailCacheBytes -= current.bytes;
  }

  private expandIndexRecord(path: ContentPath, record: ContentIndexRecord): SearchDocument {
    const pathLabel = path === 'look-ahead' ? 'Look Ahead' : this.titleCase(path);
    const discoveryKind =
      record.discoveryKind ??
      (record.contentType === 'theory' || record.contentType === 'dsa-pattern'
        ? 'lesson'
        : 'practice');
    const practiceFormat =
      record.practiceFormat ??
      (discoveryKind !== 'practice'
        ? undefined
        : record.contentType === 'dsa-problem'
          ? 'solve'
          : record.contentType === 'system-design'
            ? 'design'
            : 'explain');
    const subjects = record.subjects ?? record.tags;
    const filterTags = this.uniqueLabels([
      pathLabel,
      this.contentTypeLabel(record.contentType),
      record.difficulty,
      ...record.languages.map((language) => (language === 'go' ? 'Go' : this.titleCase(language))),
      ...subjects,
    ]);
    const searchableText = [
      record.title,
      record.courseTitle,
      record.moduleTitle,
      record.preview,
      ...subjects,
    ]
      .join(' ')
      .toLowerCase();
    return {
      ...record,
      path,
      discoveryKind,
      ...(practiceFormat ? { practiceFormat } : {}),
      subjects,
      filterTags,
      searchableText,
      route: record.route ?? ['/', path, record.courseId, record.contentId],
    };
  }

  private contentTypeLabel(type: ContentType): string {
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

  private uniqueLabels(labels: (string | undefined)[]): string[] {
    const seen = new Set<string>();
    return labels.filter((label): label is string => {
      if (!label?.trim()) return false;
      const key = label.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private titleCase(value: string): string {
    return `${value[0].toUpperCase()}${value.slice(1)}`;
  }

  private validSlug(value: string): boolean {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
  }

  private validContentHref(value: string): boolean {
    return /^\/content\/[A-Za-z0-9][A-Za-z0-9/_-]*\.json$/.test(value);
  }

  private validDetailReference(reference: ContentDetailReference | undefined): boolean {
    return (
      !!reference &&
      this.validContentHref(reference.href) &&
      /^[a-zA-Z0-9_-]{1,64}$/.test(reference.version)
    );
  }

  private validDiscoveryKind(value: string | undefined): boolean {
    return (
      value === undefined ||
      value === 'course' ||
      value === 'topic' ||
      value === 'lesson' ||
      value === 'practice' ||
      value === 'tool'
    );
  }

  private validPracticeFormat(value: string | undefined): boolean {
    return (
      value === undefined ||
      value === 'explain' ||
      value === 'solve' ||
      value === 'design' ||
      value === 'debug' ||
      value === 'rehearse'
    );
  }

  private getContentIndex(
    path?: ContentPath,
  ): Observable<{ documents: SearchDocument[]; practiceTypes: Set<ContentType> }> {
    return this.contentIndexManifest$.pipe(
      switchMap((manifest) => {
        if (!this.validIndexManifest(manifest)) {
          return throwError(() => new Error('Invalid content index manifest'));
        }
        const references = path
          ? manifest.shards.filter((reference) => reference.path === path)
          : manifest.shards;
        if (path && references.length !== 1) {
          return throwError(() => new Error(`Content index shard is missing for ${path}`));
        }
        return forkJoin(references.map((reference) => this.getContentIndexShard(reference))).pipe(
          map((shards) => {
            const documents = shards.flat();
            const expectedDocuments = path
              ? references[0].documentCount
              : manifest.totals.searchDocuments;
            if (documents.length !== expectedDocuments) {
              throw new Error('Content index total does not match its manifest');
            }
            const practiceTypes = new Set(manifest.practiceContentTypes);
            const practiceDocumentCount = documents.filter(
              (document) => document.discoveryKind === 'practice',
            ).length;
            const expectedPracticeDocuments = path
              ? references[0].practiceDocumentCount
              : manifest.totals.practiceDocuments;
            if (practiceDocumentCount !== expectedPracticeDocuments) {
              throw new Error('Practice index total does not match its manifest');
            }
            return { documents, practiceTypes };
          }),
        );
      }),
    );
  }

  private getContentIndexShard(
    reference: ContentIndexManifest['shards'][number],
  ): Observable<SearchDocument[]> {
    const cached = this.contentIndexShards.get(reference.path);
    if (cached) return cached;
    const request = this.http.get<ContentIndexShard>(reference.href).pipe(
      map((shard) => {
        if (
          shard.schemaVersion !== 'content-index-shard/v1' ||
          shard.path !== reference.path ||
          !Array.isArray(shard.documents) ||
          shard.documents.some((record) => {
            const discoveryKind =
              record.discoveryKind ??
              (record.contentType === 'theory' || record.contentType === 'dsa-pattern'
                ? 'lesson'
                : 'practice');
            return (
              !this.validDiscoveryKind(record.discoveryKind) ||
              !this.validPracticeFormat(record.practiceFormat) ||
              (record.subjects !== undefined && !Array.isArray(record.subjects)) ||
              ((discoveryKind === 'lesson' || discoveryKind === 'practice') &&
                !this.validDetailReference(record.detailRef))
            );
          }) ||
          shard.documents.length !== reference.documentCount
        ) {
          throw new Error(`Invalid content index shard: ${reference.href}`);
        }
        return shard.documents.map((record) => this.expandIndexRecord(shard.path, record));
      }),
      catchError((error) => {
        this.contentIndexShards.delete(reference.path);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.contentIndexShards.set(reference.path, request);
    return request;
  }

  private validIndexManifest(manifest: ContentIndexManifest): boolean {
    if (
      manifest.schemaVersion !== 'content-index-manifest/v1' ||
      !Array.isArray(manifest.shards) ||
      manifest.shards.length === 0 ||
      !Array.isArray(manifest.practiceContentTypes) ||
      (manifest.practiceFormats !== undefined && !Array.isArray(manifest.practiceFormats)) ||
      !Number.isInteger(manifest.totals?.searchDocuments) ||
      !Number.isInteger(manifest.totals?.practiceDocuments)
    ) {
      return false;
    }
    const paths = manifest.shards.map(({ path }) => path);
    return (
      !this.hasDuplicates(paths) &&
      manifest.shards.every(
        (reference) =>
          this.validContentPath(reference.path) &&
          reference.href === `/content/indexes/${reference.path}.json` &&
          Number.isInteger(reference.documentCount) &&
          reference.documentCount >= 0 &&
          Number.isInteger(reference.practiceDocumentCount) &&
          reference.practiceDocumentCount >= 0 &&
          reference.practiceDocumentCount <= reference.documentCount,
      )
    );
  }

  private validContentPath(value: string): value is ContentPath {
    return value === 'learn' || value === 'grow' || value === 'look-ahead';
  }

  private hasDuplicates(values: string[]): boolean {
    return new Set(values).size !== values.length;
  }

  private hydrateSelectedCanonicalProblems(
    question: InterviewQuestion,
  ): Observable<InterviewQuestion> {
    if (question.schemaVersion !== 'pattern-lesson/v2' || !question.essentialProblemRefs?.length) {
      return of(question);
    }
    return this.handsOnDsaIndex$.pipe(
      switchMap((index) => {
        const versions = new Map(
          index.groups.flatMap((group) =>
            group.problems.map((problem) => [problem.id, problem.version] as const),
          ),
        );
        return forkJoin(
          question.essentialProblemRefs!.map(({ problemId }) =>
            this.getDsaProblem(problemId, versions.get(problemId)),
          ),
        );
      }),
      map((essentialProblems) => ({ ...question, essentialProblems })),
    );
  }
}
