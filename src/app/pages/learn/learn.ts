import { Component } from '@angular/core';
import { LEARN_COURSE_GROUPS } from '../../content/learn-course-groups';
import {
  AdaptiveCatalog,
  AdaptiveCatalogConfig,
} from '../../core/adaptive-catalog/adaptive-catalog';
import { PlatformHeader } from '../../core/platform-header/platform-header';

@Component({
  selector: 'app-learn',
  imports: [PlatformHeader, AdaptiveCatalog],
  templateUrl: './learn.html',
})
export class Learn {
  protected readonly courseGroups = LEARN_COURSE_GROUPS;
  protected readonly catalogConfig: AdaptiveCatalogConfig = {
    path: 'learn',
    eyebrow: 'Engineering foundations curriculum',
    title: 'Learn',
    highlight: 'Build durable engineering foundations.',
    description:
      'Master languages, data structures, algorithms, object design, and engineering tools before production and architecture decisions demand them.',
    actionsLabel: 'Learn starting points',
    primaryAction: {
      label: 'Choose a starting foundation',
      routerLink: '/learn',
      queryParams: { group: LEARN_COURSE_GROUPS[0]!.id },
      groupId: LEARN_COURSE_GROUPS[0]!.id,
    },
    secondaryActions: [
      {
        label: 'Practice Learn questions',
        routerLink: '/interview-questions',
        queryParams: { path: 'learn' },
      },
      { label: 'Build a study plan', routerLink: '/study-plan' },
    ],
    metricsLabel: 'Learn curriculum depth',
    courseMetricLabel: 'foundation courses',
    lessonMetricLabel: 'guided lessons',
    questionMetricLabel: 'interview and practice questions',
    jumpLabel: 'Learn curriculum paths',
    sectionEyebrow: 'Foundation track',
    previewLabel: 'Inside this course',
    previewAriaLabel: 'Course preview',
    emptyTitle: 'Nothing published yet',
    emptyDescription: 'New Learn courses will appear here soon.',
    errorDescription: 'The Learn catalog could not be loaded. Please try again.',
    loadingDescription: 'Loading Learn courses…',
  };
}
