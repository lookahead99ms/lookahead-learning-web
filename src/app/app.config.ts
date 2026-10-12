import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, UrlSerializer, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { CatalogUrlSerializer } from './core/catalog-url';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    { provide: UrlSerializer, useClass: CatalogUrlSerializer },
  ],
};
