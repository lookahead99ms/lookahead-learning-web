import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, shareReplay, throwError } from 'rxjs';

export interface NavigationCourse {
  id: string;
  title: string;
  hasHighlights: boolean;
}
@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, Observable<unknown>>();
  private readonly courseCache = new Map<string, Observable<{ courses: NavigationCourse[] }>>();
  courses(path: string): Observable<{ courses: NavigationCourse[] }> {
    let request = this.courseCache.get(path);
    if (!request) {
      request = this.load<{ courses: NavigationCourse[] }>(`/content/${path}/navigation.json`).pipe(
        catchError(() =>
          this.load<Array<{ id: string; title: string }>>(`/content/${path}/catalog.json`).pipe(
            map((courses) => ({
              courses: courses.map(({ id, title }) => ({ id, title, hasHighlights: false })),
            })),
          ),
        ),
        catchError((error) => {
          this.courseCache.delete(path);
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
      );
      this.courseCache.set(path, request);
    }
    return request;
  }
  highlights(path: string, course: string): Observable<{ highlights: string[] }> {
    return this.load(`/content/${path}/${course}/navigation-highlights.json`);
  }
  private load<T>(url: string): Observable<T> {
    let request = this.cache.get(url);
    if (!request) {
      request = this.http.get<T>(url).pipe(
        catchError((error) => {
          this.cache.delete(url);
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
      );
      this.cache.set(url, request);
    }
    return request as Observable<T>;
  }
}
