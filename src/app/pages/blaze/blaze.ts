import { Component } from '@angular/core';
import { BLAZE_COURSE_GROUPS } from '../../content/blaze-course-groups';
import {
  AdaptiveCatalog,
  AdaptiveCatalogConfig,
} from '../../core/adaptive-catalog/adaptive-catalog';
import { PlatformHeader } from '../../core/platform-header/platform-header';

@Component({
  selector: 'app-blaze',
  imports: [PlatformHeader, AdaptiveCatalog],
  templateUrl: './blaze.html',
})
export class Blaze {
  protected readonly practiceGroups = BLAZE_COURSE_GROUPS;
  protected readonly catalogConfig: AdaptiveCatalogConfig = {
    path: 'blaze',
    eyebrow: 'Senior engineering and architecture',
    title: 'Blaze',
    highlight: 'Prepare for the decisions beyond implementation.',
    description:
      'Frame ambiguous systems, defend trade-offs, lead through evidence, and communicate the judgment expected in senior and staff-level interviews.',
    actionsLabel: 'Blaze starting points',
    primaryAction: {
      label: 'Start the System Design Ladder',
      routerLink: '/blaze/design-fundamentals',
    },
    alternativeAction: {
      label: 'Practice senior questions',
      routerLink: '/interview-questions',
      queryParams: { path: 'blaze' },
    },
    moreActions: [{ label: 'build a study plan', routerLink: '/study-plan' }],
    metricsLabel: 'Blaze curriculum depth',
    courseMetricLabel: 'senior-ready courses',
    lessonMetricLabel: 'decision lessons',
    questionMetricLabel: 'interview and practice questions',
    jumpLabel: 'Blaze curriculum paths',
    sectionEyebrow: 'Senior-readiness track',
    previewLabel: 'Inside this course',
    previewAriaLabel: 'Topics covered',
    emptyTitle: 'Nothing published yet',
    emptyDescription: 'New Blaze practices will appear here soon.',
    errorDescription: 'The Blaze catalog could not be loaded. Please try again.',
    loadingDescription: 'Loading Blaze practices…',
  };
}
