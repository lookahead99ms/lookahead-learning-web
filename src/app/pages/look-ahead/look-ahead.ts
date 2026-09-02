import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogItem } from '../../content/content.models';
import { reviewStatusLabel } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { PlatformHeader } from '../../core/platform-header/platform-header';

@Component({ selector: 'app-look-ahead', imports: [PlatformHeader, RouterLink], templateUrl: './look-ahead.html' })
export class LookAhead implements OnInit {
  private readonly content = inject(ContentService);
  protected readonly practices = signal<CatalogItem[] | null>(null);
  protected readonly error = signal('');
  protected readonly reviewStatusLabel = reviewStatusLabel;

  ngOnInit(): void {
    this.content.getCatalog('look-ahead').subscribe({
      next: (practices) => this.practices.set(practices),
      error: () => this.error.set('The Look Ahead catalog could not be loaded. Please try again.'),
    });
  }
}
