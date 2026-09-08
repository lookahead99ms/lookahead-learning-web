import { Component } from '@angular/core';
import { LOOK_AHEAD_COURSE_GROUPS } from '../../content/look-ahead-course-groups';
import {
  AdaptiveCatalog,
  AdaptiveCatalogConfig,
} from '../../core/adaptive-catalog/adaptive-catalog';
import { PlatformHeader } from '../../core/platform-header/platform-header';

@Component({
  selector: 'app-look-ahead',
  imports: [PlatformHeader, AdaptiveCatalog],
  templateUrl: './look-ahead.html',
})
export class LookAhead {
  protected readonly practiceGroups = LOOK_AHEAD_COURSE_GROUPS;
  protected readonly catalogConfig: AdaptiveCatalogConfig = {
    path: 'look-ahead',
    eyebrow: 'Senior engineering and architecture',
    title: 'Look Ahead',
    highlight: 'Prepare for the decisions beyond implementation.',
    description:
      'Frame ambiguous systems, defend trade-offs, lead through evidence, and communicate the judgment expected in senior and staff-level interviews.',
    actionsLabel: 'Look Ahead starting points',
    primaryAction: {
      label: 'Start the system design path',
      routerLink: '/look-ahead/system-design',
    },
    secondaryActions: [
      {
        label: 'Practice senior questions',
        routerLink: '/interview-questions',
        queryParams: { path: 'look-ahead' },
      },
      { label: 'Build a study plan', routerLink: '/study-plan' },
    ],
    metricsLabel: 'Look Ahead curriculum depth',
    courseMetricLabel: 'senior-ready courses',
    lessonMetricLabel: 'decision lessons',
    questionMetricLabel: 'interview and practice questions',
    jumpLabel: 'Look Ahead curriculum paths',
    sectionEyebrow: 'Senior-readiness track',
    previewLabel: 'Topics covered',
    previewAriaLabel: 'Topics covered',
    emptyTitle: 'Nothing published yet',
    emptyDescription: 'New Look Ahead practices will appear here soon.',
    errorDescription: 'The Look Ahead catalog could not be loaded. Please try again.',
    loadingDescription: 'Loading Look Ahead practices…',
  };
}
