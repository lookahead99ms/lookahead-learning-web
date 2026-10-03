import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, shareReplay, throwError } from 'rxjs';

/** Static scene SVGs shipped with the app under public/assets/scenes/. */
export function isSceneAssetPath(path: string): boolean {
  return /^\/assets\/scenes\/[a-z0-9][a-z0-9/_-]*\.svg$/i.test(path) && !path.includes('//');
}

/**
 * Public copy of a Look Ahead unit card scene. Content visuals need access, so card scenes
 * authored as /content/look-ahead/<course>/visuals/cards/<file>.svg are also shipped under
 * /assets/scenes/units/look-ahead/<course>/<file>.svg for signed-out visitors.
 */
export function publicUnitScenePath(path: string): string | null {
  const match =
    /^\/content\/look-ahead\/([a-z0-9][a-z0-9-]*)\/visuals\/cards\/([a-z0-9][a-z0-9_-]*)\.svg$/i.exec(
      path,
    );
  return match ? `/assets/scenes/units/look-ahead/${match[1]}/${match[2]}.svg` : null;
}

/** Loads and caches app scene SVG text. Failed requests are not cached. */
@Injectable({ providedIn: 'root' })
export class SceneAssets {
  private readonly http = inject(HttpClient);
  private readonly scenes = new Map<string, Observable<string>>();

  get(path: string): Observable<string> {
    if (!isSceneAssetPath(path)) {
      return throwError(() => new Error('Invalid scene asset path'));
    }
    let request = this.scenes.get(path);
    if (!request) {
      request = this.http.get(path, { responseType: 'text' }).pipe(
        catchError((cause: unknown) => {
          this.scenes.delete(path);
          return throwError(() => cause);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.scenes.set(path, request);
    }
    return request;
  }
}
