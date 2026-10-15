import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, TitleStrategy, UrlSerializer, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { CatalogUrlSerializer } from './core/catalog-url';
import { PageTitleStrategy } from './core/page-meta/page-title-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    { provide: UrlSerializer, useClass: CatalogUrlSerializer },
    // DLV-941: per-page title, description, canonical, Open Graph and Twitter tags.
    { provide: TitleStrategy, useExisting: PageTitleStrategy },
  ],
};
