import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformHeader } from '../../../core/platform-header/platform-header';
import { HERO_PREVIEW_VARIANTS } from './hero-candidate';

export { HERO_PREVIEW_SLIDES, HERO_PREVIEW_VARIANTS } from './hero-candidate';

/**
 * The index of the five hero candidates (user, 2026-10-29). Each candidate page is the real home
 * page with its hero replaced: see `Landing` and `/preview/hero/:variant`.
 */
@Component({
  selector: 'app-landing-hero-preview',
  imports: [RouterLink, PlatformHeader],
  templateUrl: './hero-preview.html',
  styleUrl: './hero-preview.css',
})
export class LandingHeroPreview {
  protected readonly variants = HERO_PREVIEW_VARIANTS;
}
