import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';

export const AUTHOR_PREVIEWS_BASE_URL = new InjectionToken<string>('Author previews base URL', {
  providedIn: 'root',
  factory: () => environment.authorPreviewsBaseUrl,
});

export function previewManifestUrl(base: string): string | null {
  if (!/^\/(?!\/)[a-zA-Z0-9/_-]+\/$/.test(base)) return null;
  return `${base}preview-directory/manifest.json`;
}

export function architecturePreviewUrl(base: string): string | null {
  return previewManifestUrl(base) ? `${base}preview-directory/architecture/index.html` : null;
}
