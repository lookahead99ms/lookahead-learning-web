import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';

@Component({
  selector: 'app-author',
  imports: [PlatformHeader, RouterLink],
  templateUrl: './author.html',
  styleUrl: './author.css',
})
export class AuthorPage {
  protected readonly accounts = inject(StudyPlanAccount);
  protected readonly savedPlan = computed(
    () =>
      this.accounts.plans().find((plan) => plan.goal === 'Author sample · Saved plan') ??
      this.accounts.plans()[0],
  );
  protected readonly revisedPlan = computed(
    () =>
      this.accounts.plans().find((plan) => plan.goal === 'Author sample · Revised plan') ??
      this.accounts.plans().find((plan) => plan.revision > 1),
  );
  protected readonly surfaces = [
    {
      title: 'Learn',
      description: 'Language foundations, DSA, object design and engineering tools.',
      route: '/learn',
    },
    {
      title: 'Grow',
      description: 'Backend, frontend, security, AI engineering and delivery.',
      route: '/grow',
    },
    {
      title: 'Look Ahead',
      description: 'Architecture, leadership, behavioral preparation and AI systems.',
      route: '/look-ahead',
    },
    {
      title: 'Search',
      description: 'Find published lessons, questions, practice and supporting readers.',
      route: '/search',
    },
    {
      title: 'DSA workspace',
      description: 'Coding practice, source, trace and the guided debugger.',
      route: '/learn/hands-on-dsa',
    },
    {
      title: 'Support and feedback',
      description: 'Inspect the feedback form and attachment experience.',
      route: '/support',
    },
    {
      title: 'Account',
      description: 'View the local author account and sign out.',
      route: '/account',
    },
    {
      title: 'Delivery plan',
      description: 'Open the private local delivery board and linked evidence.',
      route: '/delivery-plan',
    },
  ];
}
