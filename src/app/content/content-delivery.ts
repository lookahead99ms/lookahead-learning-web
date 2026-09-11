import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';
export const PROTECTED_CONTENT = new InjectionToken<boolean>('Protected content delivery', {
  providedIn: 'root',
  factory: () => environment.protectedContent,
});
