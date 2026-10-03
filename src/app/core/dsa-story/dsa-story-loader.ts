import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { DsaStoryV1, isDsaStory } from './dsa-story.model';

/**
 * Loads a problem's Option B story from `/content/learn/dsa-stories/<problemId>.json`. The
 * protected publication carries each story beside its problem with the same tier and scopes, so
 * the request needs no extra access logic. Anything missing, forbidden or malformed resolves to
 * null and the problem page keeps the shared visual walkthrough and guided debugger.
 */
@Injectable({ providedIn: 'root' })
export class DsaStoryLoader {
  private readonly http = inject(HttpClient, { optional: true });
  private readonly cache = new Map<string, Observable<DsaStoryV1 | null>>();

  load(problemId: string): Observable<DsaStoryV1 | null> {
    if (!this.http || !/^[a-z0-9][a-z0-9-]{0,160}$/.test(problemId)) return of(null);
    const cached = this.cache.get(problemId);
    if (cached) return cached;
    const request = this.http.get<unknown>(`/content/learn/dsa-stories/${problemId}.json`).pipe(
      map((value) => (isDsaStory(value, problemId) ? value : null)),
      catchError(() => {
        this.cache.delete(problemId);
        return of(null);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.cache.set(problemId, request);
    return request;
  }
}
