import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, TitleStrategy, UrlSerializer, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { CatalogUrlSerializer } from './core/catalog-url';
import { PageTitleStrategy } from './core/page-meta/page-title-strategy';
import { pageReadinessInterceptor } from './core/page-readiness/page-readiness';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // DLV-969 S37: requests made while a page loads hold the page until they answer.
    provideHttpClient(withFetch(), withInterceptors([pageReadinessInterceptor])),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    { provide: UrlSerializer, useClass: CatalogUrlSerializer },
    // DLV-941: per-page title, description, canonical, Open Graph and Twitter tags.
    { provide: TitleStrategy, useExisting: PageTitleStrategy },
  ],
};
