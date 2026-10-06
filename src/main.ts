import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// The local Identity service accepts sign-in only from the 127.0.0.1 origin; a localhost tab
// would load the app but get 403 on every account request. Open the same page on 127.0.0.1.
if (location.hostname === 'localhost') {
  location.replace(location.href.replace('//localhost', '//127.0.0.1'));
} else {
  bootstrapApplication(App, appConfig).catch((err) => console.error(err));
}
