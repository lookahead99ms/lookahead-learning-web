import { Component } from '@angular/core';

@Component({
  selector: 'app-platform-brand-illustration',
  templateUrl: './platform-brand-illustration.html',
  styles: `
    :host { display: block; }
    svg { display: block; width: 100%; height: auto; aspect-ratio: 628 / 136; }
    @media (forced-colors: active) { :host { display: none; } }
  `,
})
export class PlatformBrandIllustration {}
