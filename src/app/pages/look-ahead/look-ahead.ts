import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogOverviewItem } from '../../content/content.models';
import { reviewStatusLabel } from '../../content/content.models';
import {
  LOOK_AHEAD_COURSE_GROUPS,
  LookAheadCourseGroup,
} from '../../content/look-ahead-course-groups';
import { ContentService } from '../../content/content.service';
import { PlatformHeader } from '../../core/platform-header/platform-header';

@Component({
  selector: 'app-look-ahead',
  imports: [PlatformHeader, RouterLink],
  templateUrl: './look-ahead.html',
  styleUrl: '../catalog-experience.css',
})
export class LookAhead implements OnInit {
  private readonly content = inject(ContentService);
  protected readonly practices = signal<CatalogOverviewItem[] | null>(null);
  protected readonly error = signal('');
  protected readonly reviewStatusLabel = reviewStatusLabel;
  protected readonly practiceGroups = LOOK_AHEAD_COURSE_GROUPS;

  ngOnInit(): void {
    this.content.getCatalogOverview('look-ahead').subscribe({
      next: (practices) => this.practices.set(practices),
      error: () => this.error.set('The Look Ahead catalog could not be loaded. Please try again.'),
    });
  }

  protected practicesFor(
    group: LookAheadCourseGroup,
    practices: CatalogOverviewItem[],
  ): CatalogOverviewItem[] {
    const byId = new Map(practices.map((practice) => [practice.id, practice]));
    return group.courseIds.flatMap((id) => byId.get(id) ?? []);
  }

  protected totalLessons(practices: CatalogOverviewItem[]): number {
    return practices.reduce((total, practice) => total + practice.lessonCount, 0);
  }

  protected totalQuestions(practices: CatalogOverviewItem[]): number {
    return practices.reduce((total, practice) => total + practice.questionCount, 0);
  }
}
