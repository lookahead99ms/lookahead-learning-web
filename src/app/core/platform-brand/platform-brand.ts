import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-platform-brand',
  templateUrl: './platform-brand.html',
  styleUrl: './platform-brand.css',
  host: { role: 'img', '[attr.aria-label]': "mark ? 'LookAhead ' + mark : 'LookAhead'" },
})
export class PlatformBrand {
  /** A small environment mark after the wordmark, for example "DEV"; null in ordinary delivery (user decision 2026-11-02). */
  @Input() mark: string | null = null;
}
