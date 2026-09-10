import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, shareReplay, throwError } from 'rxjs';

export interface NavigationCourse {
  id: string;
  title: string;
  hasHighlights: boolean;
}
@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, Observable<unknown>>();
  courses(path: string): Observable<{ courses: NavigationCourse[] }> {
    return this.load(`/content/${path}/navigation.json`);
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
