import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { isSceneAssetPath } from '../card-scene/scene-assets';
import { PageMeta } from './page-meta';
import { PublicCourseMetadata, dynamicPageMeta } from './course-page-meta';
import { CatalogPath, DynamicPageTarget } from './page-meta-routes';

/**
 * DLV-941 privacy boundary. Page meta tags are built only from the course content locator,
 * the public-tier metadata file the course page loads for every visitor
 * (/content/<path>/<course>/content-locator.json). This loader never requests a lesson detail,
 * answer slide, module body or anything else that needs a grant, and it copies only the
 * allowlisted title/description fields below, so a protected body cannot reach a meta tag even
 * if a locator ever carried one. Loaded lazily by PageTitleStrategy on the first course page.
 */
export const PUBLIC_METADATA_URL = /^\/content\/(learn|grow|blaze)\/[a-z0-9][a-z0-9-]*\/content-locator\.json$/;

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

type Raw = Record<string, unknown>;

const record = (value: unknown): Raw =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};
const list = (value: unknown): Raw[] => (Array.isArray(value) ? value.map(record) : []);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function flattenUnits(units: Raw[]): Raw[] {
  return units.flatMap((unit) => [
    unit,
    ...flattenUnits([...list(unit['subUnits']), ...list(unit['children'])]),
  ]);
}

/** Copies only public title/description fields out of a course-content-locator/v1 document. */
export function publicCourseMetadata(
  locator: unknown,
  path: CatalogPath,
  courseId: string,
): PublicCourseMetadata | null {
  const source = record(locator);
  const course = record(source['course']);
  if (
    source['schemaVersion'] !== 'course-content-locator/v1' ||
    course['id'] !== courseId ||
    course['path'] !== path ||
    !text(course['title'])
  ) {
    return null;
  }
  return {
    id: courseId,
    title: text(course['title']),
    description: text(course['description']),
    modules: list(course['modules']).map((module) => ({
      id: text(module['id']),
      title: text(module['title']),
      description: text(module['description']),
    })),
    sections: list(course['sections']).map((section) => ({
      id: text(section['id']),
      title: text(section['title']),
      description: text(section['description']),
    })),
    units: flattenUnits(list(course['learningUnits']))
      .filter((unit) => unit['planned'] !== true)
      .map((unit) => {
        const scene = text(record(unit['card'])['scene']);
        return {
          id: text(unit['id']),
          title: text(unit['title']),
          description: text(unit['description']),
          moduleIds: [
            unit['theoryModuleId'],
            unit['questionModuleId'],
            unit['practiceModuleId'],
            ...(Array.isArray(unit['moduleIds']) ? unit['moduleIds'] : []),
          ].filter((id): id is string => typeof id === 'string' && id.length > 0),
          ...(isSceneAssetPath(scene) ? { scene } : {}),
        };
      }),
    items: list(source['items']).map((item) => ({
      id: text(item['id']),
      moduleId: text(item['moduleId']),
      title: text(item['title']) || text(item['navTitle']),
      contentType: text(item['contentType']),
    })),
  };
}

@Injectable({ providedIn: 'root' })
export class PublicPageMetadata {
  private readonly http = inject(HttpClient);
  private readonly courses = new Map<string, Observable<PublicCourseMetadata | null>>();

  /** Meta for a course-scoped page, or null when its public metadata is unavailable. */
  describe(target: DynamicPageTarget): Observable<PageMeta | null> {
    return this.course(target.path, target.courseId).pipe(
      map((course) => (course ? dynamicPageMeta(target, course) : null)),
    );
  }

  private course(path: CatalogPath, courseId: string): Observable<PublicCourseMetadata | null> {
    if (!SLUG.test(courseId)) return of(null);
    const href = `/content/${path}/${courseId}/content-locator.json`;
    if (!PUBLIC_METADATA_URL.test(href)) return of(null);
    let request = this.courses.get(href);
    if (!request) {
      request = this.http.get<unknown>(href).pipe(
        map((locator) => publicCourseMetadata(locator, path, courseId)),
        catchError(() => {
          // Not cached: a later visit retries (offline, signed-out gateway hiccup, missing course).
          this.courses.delete(href);
          return of(null);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.courses.set(href, request);
    }
    return request;
  }
}
