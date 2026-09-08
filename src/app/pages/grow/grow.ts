import { Component } from '@angular/core';
import { GROW_COURSE_GROUPS } from '../../content/grow-course-groups';
import {
  AdaptiveCatalog,
  AdaptiveCatalogConfig,
} from '../../core/adaptive-catalog/adaptive-catalog';
import { PlatformHeader } from '../../core/platform-header/platform-header';

@Component({
  selector: 'app-grow',
  imports: [PlatformHeader, AdaptiveCatalog],
  templateUrl: './grow.html',
})
export class Grow {
  protected readonly capabilityGroups = GROW_COURSE_GROUPS;
  protected readonly catalogConfig: AdaptiveCatalogConfig = {
    path: 'grow',
    eyebrow: 'Production engineering curriculum',
    title: 'Grow',
    highlight: 'Turn knowledge into production judgment.',
    description:
      'Learn to design, deliver, diagnose, secure, and operate the systems a senior engineer is trusted to own.',
    actionsLabel: 'Grow starting points',
    primaryAction: { label: 'Start with Spring Boot', routerLink: '/grow/spring-boot' },
    secondaryActions: [
      {
        label: 'Practice Grow questions',
        routerLink: '/interview-questions',
        queryParams: { path: 'grow' },
      },
      { label: 'Build a study plan', routerLink: '/study-plan' },
    ],
    metricsLabel: 'Grow curriculum depth',
    courseMetricLabel: 'capability courses',
    lessonMetricLabel: 'deep-dive lessons',
    questionMetricLabel: 'interview and practice questions',
    jumpLabel: 'Grow capability paths',
    sectionEyebrow: 'Production capability',
    previewLabel: 'Key topics',
    previewAriaLabel: 'Key topics',
    emptyTitle: 'Nothing published yet',
    emptyDescription: 'New Grow capabilities will appear here soon.',
    errorDescription: 'The Grow catalog could not be loaded. Please try again.',
    loadingDescription: 'Loading Grow capabilities…',
  };
}
