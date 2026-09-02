import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, switchMap } from 'rxjs';
import {
  CatalogItem,
  CourseContent,
  CourseModule,
  CourseSection,
  InterviewQuestion,
  PatternLessonV1,
  ResolvedPatternCheck,
  TheorySection,
  TheoryVisual,
  isPatternLessonV1,
  reviewStatusLabel,
} from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { flattenLearningUnits } from '../../content/learning-units';
import { authenticCodingVisual, relatedPracticeItems } from '../../content/pattern-experience';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { InteractiveTheoryVisual } from '../../core/interactive-theory-visual/interactive-theory-visual';
import { CodingSolutionTabs } from '../../core/coding-solution-tabs/coding-solution-tabs';
import { CodingProblemDetail } from '../../core/coding-problem-detail/coding-problem-detail';
import { InlineUnderstandingPager } from '../../core/inline-understanding-pager/inline-understanding-pager';
import { PatternEssentialProblems } from '../../core/pattern-essential-problems/pattern-essential-problems';
import { PatternLessonShell } from '../../core/pattern-lesson-shell/pattern-lesson-shell';

@Component({
  selector: 'app-question',
  imports: [
    PlatformHeader,
    RouterLink,
    NgTemplateOutlet,
    InteractiveTheoryVisual,
    CodingSolutionTabs,
    CodingProblemDetail,
    InlineUnderstandingPager,
    PatternEssentialProblems,
    PatternLessonShell,
  ],
  templateUrl: './question.html',
  styles: [
    `
      .question-inner-navigation {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 24px;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid var(--line);
      }
      .inner-navigation-link {
        display: flex;
        min-width: 0;
        flex-direction: column;
        color: var(--text);
        text-decoration: none;
      }
      .inner-navigation-link.next {
        align-items: flex-end;
        text-align: right;
      }
      .inner-navigation-actions {
        grid-column: 2;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        min-width: 0;
      }
      .inner-navigation-link span {
        color: var(--search-primary);
        font-size: 0.7rem;
        font-weight: 850;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .inner-navigation-link strong {
        margin-top: 2px;
        overflow-wrap: anywhere;
        font-size: 0.86rem;
      }
      .inner-navigation-link:hover strong,
      .inner-navigation-link:focus-visible strong {
        color: var(--search-hover);
      }
      .inner-navigation-link.next-module,
      .module-catalog-link {
        height: 32px;
        box-sizing: border-box;
        font-size: 0.75rem;
        line-height: 18px;
      }
      .inner-navigation-link.next-module {
        width: max-content;
        max-width: 100%;
        flex-direction: row;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        border: 1px solid var(--search-primary);
        border-radius: 999px;
        background: var(--surface-accent);
        overflow: hidden;
      }
      .inner-navigation-link.next-module span {
        flex: 0 0 auto;
        color: var(--search-primary);
        font-size: 0.65rem;
      }
      .inner-navigation-link.next-module strong {
        min-width: 0;
        margin-top: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .module-catalog-link {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        padding: 6px 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        color: var(--text-strong);
        background: var(--surface);
        font-weight: 500;
        text-decoration: none;
      }
      .module-catalog-link:hover,
      .module-catalog-link:focus-visible {
        border-color: var(--search-primary);
        color: var(--search-hover);
        outline: none;
      }
      .theory-article {
        max-width: none;
        margin: 0;
        font-family:
          'Avenir Next',
          Avenir,
          Inter,
          ui-sans-serif,
          system-ui,
          -apple-system,
          'Segoe UI',
          sans-serif;
        font-optical-sizing: auto;
      }
      .theory-summary {
        margin: 24px 0 8px;
        color: #2c3b50;
        font-size: clamp(1.06rem, 1vw + 0.72rem, 1.18rem);
        font-weight: 500;
        line-height: 1.72;
        letter-spacing: 0.002em;
      }
      .theory-read-time {
        margin: 0;
        color: var(--muted);
        font-size: 0.8rem;
        font-weight: 700;
      }
      .pattern-navigation {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 12px 0 0;
      }
      .pattern-navigation button {
        padding: 6px 10px;
        border: 1px solid #c7d9ec;
        border-radius: 999px;
        color: var(--search-primary);
        background: var(--surface);
        cursor: pointer;
        font: inherit;
        font-size: 0.76rem;
        font-weight: 800;
      }
      .pattern-navigation button:hover,
      .pattern-navigation button:focus-visible {
        border-color: var(--search-primary);
        background: var(--surface-accent);
        outline: none;
      }
      .reader-question-title .pattern-title-subtitle {
        color: #52657e;
        font-family: 'Avenir Next', Avenir, 'Segoe UI', sans-serif;
        font-weight: 500;
        letter-spacing: -0.035em;
      }
      .article-title-row {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 24px;
      }
      .article-title-row .reader-question-title {
        min-width: 0;
      }
      .article-read-time {
        flex: 0 0 auto;
        margin: 10px 0 0;
        color: var(--muted);
        font-size: 0.8rem;
        font-weight: 800;
        white-space: nowrap;
      }
      .theory-section {
        margin: 0 0 18px;
        padding: 22px 24px;
        border: 1px solid var(--line);
        border-left: 4px solid var(--search-primary);
        border-radius: 12px;
        background: var(--surface);
        box-shadow: 0 8px 20px rgba(54, 83, 119, 0.04);
        scroll-margin-top: 148px;
      }
      app-inline-understanding-pager {
        display: block;
        scroll-margin-top: 148px;
      }
      .theory-section h2 {
        margin: 0 0 12px;
        color: var(--text-strong);
        font-size: clamp(1.35rem, 3vw, 1.76rem);
        font-weight: 650;
        letter-spacing: -0.012em;
        line-height: 1.24;
      }
      .theory-section > p {
        margin: 0 0 12px;
        color: #2d3d53;
        font-size: clamp(1rem, 0.2vw + 0.94rem, 1.06rem);
        font-weight: 450;
        line-height: 1.65;
        letter-spacing: 0.001em;
        text-wrap: pretty;
      }
      .theory-section > p > code {
        padding: 0.08em 0.32em;
        border-radius: 4px;
        color: #164b72;
        background: #edf4fa;
        font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
        font-size: 0.84em;
        font-weight: 650;
      }
      :host ::ng-deep .theory-section .pattern-signal {
        display: inline-flex;
        align-items: center;
        margin: 5px 5px 0 0;
        padding: 3px 9px;
        border: 1px solid #9fd4dd;
        border-radius: 999px;
        color: #087f8c;
        background: #edfafa;
        font-size: 0.8em;
        font-weight: 800;
        line-height: 1.35;
      }
      .theory-callout {
        margin: 22px 0;
        padding: 16px 18px;
        border-left: 4px solid var(--search-primary);
        border-radius: 0 10px 10px 0;
        background: #eef7fb;
      }
      .theory-callout[data-callout-type='production'] {
        border-left-color: var(--orange);
        background: #fff7ed;
      }
      .theory-callout strong {
        color: var(--text-strong);
      }
      .theory-callout p {
        margin: 6px 0 0;
        color: var(--text-body);
        line-height: 1.65;
      }
      .theory-code {
        margin: 22px 0;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--text-strong);
        color: #eef2ff;
      }
      .theory-code > div {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 10px 14px;
        color: var(--line);
        font-size: 0.8rem;
        border-bottom: 1px solid var(--text-body);
      }
      .theory-code pre {
        margin: 0;
        padding: 18px 20px;
        overflow: auto;
        font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
        font-size: 0.95rem;
        font-weight: 500;
        line-height: 1.8;
        letter-spacing: 0.01em;
      }
      .theory-code code {
        display: block;
        min-width: max-content;
      }
      :host ::ng-deep .theory-code .syntax-name {
        color: #77c7d5;
      }
      :host ::ng-deep .theory-code .syntax-function {
        color: #77c69c;
      }
      :host ::ng-deep .theory-code .syntax-number {
        color: #b69ad0;
      }
      :host ::ng-deep .theory-code .syntax-operator,
      :host ::ng-deep .theory-code .syntax-keyword {
        color: #dc85b7;
      }
      .theory-visual {
        margin: 22px 0 0;
        padding: 14px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--surface-subtle);
      }
      .theory-visual img {
        display: block;
        width: 100%;
        height: auto;
      }
      .theory-visual:has(.interactive-theory-frame) {
        padding: 0;
        overflow: hidden;
      }
      .theory-visual figcaption {
        margin-top: 10px;
        color: var(--muted);
        font-size: 0.82rem;
        line-height: 1.45;
      }
      .hands-on-panel {
        margin: 24px 0 0;
        padding: 18px;
        border: 1px solid #b9dce6;
        border-left: 4px solid var(--search-primary);
        border-radius: 12px;
        background: linear-gradient(135deg, #f1fbfc, var(--surface));
      }
      .hands-on-panel > span {
        color: var(--search-primary);
        font-size: 0.7rem;
        font-weight: 850;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .hands-on-panel h3 {
        margin: 5px 0;
        color: var(--text-strong);
        font-size: 1.05rem;
      }
      .hands-on-panel p {
        margin: 0;
        color: #52657e;
        font-size: 0.88rem;
        line-height: 1.55;
      }
      .hands-on-panel > div {
        display: grid;
        gap: 9px;
        margin-top: 14px;
      }
      .hands-on-panel a {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 9px;
        padding: 11px 12px;
        border: 1px solid #c7d9ec;
        border-radius: 8px;
        color: var(--text-strong);
        background: var(--surface);
        font-size: 0.86rem;
        font-weight: 800;
        text-decoration: none;
      }
      .hands-on-panel a:hover,
      .hands-on-panel a:focus-visible {
        border-color: var(--search-primary);
        color: var(--search-primary);
        outline: none;
      }
      .hands-on-panel small {
        color: var(--text-subtle);
        font-size: 0.68rem;
        font-weight: 800;
        text-transform: uppercase;
      }
      .hands-on-panel b {
        color: var(--search-primary);
      }
      .theory-takeaways {
        margin: 36px 0 8px;
        padding: 20px 22px;
        border-radius: 12px;
        background: #f0fdf4;
      }
      .theory-takeaways ul {
        margin: 10px 0 0;
        padding-left: 20px;
        color: var(--text-body);
        line-height: 1.7;
      }
      .theory-language-notes {
        margin: 20px 0 8px;
        padding: 20px 22px;
        border-radius: 12px;
        background: #f5f3ff;
      }
      .theory-language-notes ul {
        margin: 10px 0 0;
        padding-left: 20px;
        color: var(--text-body);
        line-height: 1.7;
        list-style: none;
      }
      .theory-language-notes li {
        margin: 0 0 6px;
      }
      .theory-language-notes li strong {
        color: #5b21b6;
      }
      .theory-language-notes li:last-child {
        margin-bottom: 0;
      }
      .related-theory-link {
        display: inline-flex;
        margin: 0 0 18px;
        color: var(--search-primary);
        font-size: 0.86rem;
        font-weight: 800;
        text-decoration: none;
      }
      .related-theory-link:hover,
      .related-theory-link:focus-visible {
        color: var(--search-hover);
        text-decoration: underline;
        outline: none;
      }
      @media (max-width: 980px) {
        .question-inner-navigation {
          grid-template-columns: 1fr;
        }
        .inner-navigation-actions {
          grid-column: auto;
          justify-content: flex-start;
        }
        .inner-navigation-link.next {
          align-items: flex-start;
          text-align: left;
        }
        .inner-navigation-link.next-module {
          align-self: flex-start;
        }
        .theory-section {
          padding: 18px;
        }
        .article-title-row {
          display: block;
        }
        .article-read-time {
          margin: 8px 0 0;
        }
      }
      .sticky-pill-strip {
        display: flex;
        flex: 1 1 auto;
        align-items: center;
        min-width: 0;
        overflow: hidden;
        gap: 8px;
      }
      .sticky-pill-strip .sticky-pattern-name {
        flex: 0 0 auto;
        color: var(--text);
        font-size: 0.84rem;
        font-weight: 800;
        white-space: nowrap;
      }
      .sticky-pill-strip .sticky-pill-sep {
        flex: 0 0 auto;
        color: var(--muted);
      }
      .sticky-pill-strip .sticky-pill {
        flex: 0 1 auto;
        overflow: hidden;
        padding: 3px 10px;
        border: 0;
        border-radius: 999px;
        color: var(--muted);
        background: transparent;
        font: 700 0.78rem inherit;
        cursor: pointer;
        white-space: nowrap;
        text-overflow: ellipsis;
        opacity: 0.45;
        transition:
          opacity 0.2s ease,
          color 0.2s ease,
          background 0.2s ease;
      }
      .sticky-pill-strip .sticky-pill:hover {
        opacity: 0.8;
      }
      .sticky-pill-strip .sticky-pill.active {
        color: var(--search-primary);
        background: var(--surface-accent);
        opacity: 1;
      }
      @media (max-width: 760px) {
        .sticky-pill-strip .sticky-pill:not(.active) {
          display: none;
        }
      }
    `,
  ],
})
export class Question implements OnInit {
  private readonly contentService = inject(ContentService);
  private readonly route = inject(ActivatedRoute);
  /** Drives the "pattern : pills" strip shown in the sticky bar once the reader scrolls past the title. */
  protected readonly scrolled = signal(false);
  protected readonly activeSectionIndex = signal(0);

  @HostListener('window:scroll')
  protected onWindowScroll(): void {
    this.scrolled.set(window.scrollY > 220);
    const item = this.question();
    if (!item || item.contentType !== 'theory') return;
    const links = this.patternNavigation(item);
    // Lenient: a section only becomes "active" once it has scrolled well past the
    // sticky header, so the label does not flip the moment its heading appears.
    let current = 0;
    for (let index = 0; index < links.length; index++) {
      const target = document.getElementById(links[index].target);
      if (target && target.getBoundingClientRect().top <= 260) {
        current = index;
      }
    }
    this.activeSectionIndex.set(current);
  }

  /** Centers a 3-pill window on the active section, sliding near the article's edges. */
  protected visiblePillWindow(
    item: InterviewQuestion,
  ): { label: string; target: string; position: 'prev' | 'active' | 'next' }[] {
    const links = this.patternNavigation(item);
    if (!links.length) return [];
    const index = Math.min(this.activeSectionIndex(), links.length - 1);
    const start = Math.max(0, Math.min(index - 1, links.length - 3));
    return links.slice(start, start + 3).map((link, offset) => ({
      ...link,
      position: start + offset === index ? 'active' : start + offset < index ? 'prev' : 'next',
    }));
  }

  protected readonly courseId = signal('');
  protected readonly pathId = signal('learn');
  protected readonly course = signal<CourseContent | null>(null);
  protected readonly courseTitle = signal('');
  protected readonly question = signal<InterviewQuestion | null>(null);
  protected readonly moduleTitle = signal('');
  protected readonly previousQuestion = signal<ReaderLink | null>(null);
  protected readonly nextQuestion = signal<ReaderLink | null>(null);
  protected readonly nextModule = signal<CourseModule | null>(null);
  protected readonly nextModuleFirstQuestion = signal<ReaderLink | null>(null);
  protected readonly isFirstQuestionInModule = signal(false);
  protected readonly isLastQuestionInModule = signal(false);
  protected readonly isLastModuleInCompetency = signal(false);
  protected readonly nextCourse = signal<CatalogItem | null>(null);
  protected readonly error = signal('');
  protected readonly reviewStatusLabel = reviewStatusLabel;

  /** Coding practice is classified by its existing curriculum tags, not by the generic Q&A layout. */
  protected shouldShowHint(item: InterviewQuestion): boolean {
    return (
      item.tags.includes('Common Problem') || item.tags.some((tag) => tag.startsWith('LeetCode'))
    );
  }

  protected isCodingPractice(item: InterviewQuestion): boolean {
    return this.shouldShowHint(item);
  }

  protected patternLesson(item: InterviewQuestion): PatternLessonV1 | null {
    return isPatternLessonV1(item) ? item : null;
  }

  protected hasTheoryExperience(item: InterviewQuestion): boolean {
    return (
      item.contentType === 'theory' && (isPatternLessonV1(item) || Boolean(item.sections?.length))
    );
  }

  protected patternChecks(lesson: PatternLessonV1): ResolvedPatternCheck[] {
    const questionsById = new Map(
      (this.course()?.questions ?? []).map((question) => [question.id, question]),
    );
    return lesson.checks.flatMap((reference) => {
      const question = questionsById.get(reference.questionId);
      return question
        ? [
            {
              id: question.id,
              category: reference.category,
              prompt: question.title,
              answer: question.interviewAnswer,
              explanation: question.explanation,
            },
          ]
        : [];
    });
  }

  protected patternPractice(lesson: PatternLessonV1): InterviewQuestion[] {
    const questionsById = new Map(
      (this.course()?.questions ?? []).map((question) => [question.id, question]),
    );
    return lesson.practice.flatMap((reference) => {
      const question = questionsById.get(reference.questionId);
      return question ? [question] : [];
    });
  }

  protected embeddedUnderstanding(item: InterviewQuestion): InterviewQuestion[] {
    if (item.contentType !== 'theory') return [];
    const unit = flattenLearningUnits(this.course()?.learningUnits ?? []).find(
      (candidate) => candidate.theoryModuleId === item.moduleId,
    );
    if (!unit?.questionModuleId) return [];
    const moduleQuestions = (this.course()?.questions ?? [])
      .filter((question) => question.moduleId === unit.questionModuleId)
      .sort((left, right) => left.order - right.order);
    const linkedQuestions = moduleQuestions.filter(
      (question) => question.relatedArticleId === item.id,
    );
    const questionsForArticle =
      linkedQuestions.length > 0
        ? linkedQuestions
        : moduleQuestions.length === 1
          ? moduleQuestions
          : [];
    return questionsForArticle;
  }

  /** The two dedicated practice questions remain visible from the article,
   * without turning the Hands-on panel into another intermediate module page. */
  protected handsOnPractice(item: InterviewQuestion): InterviewQuestion[] {
    if (item.contentType !== 'theory') return [];
    const unit = flattenLearningUnits(this.course()?.learningUnits ?? []).find(
      (candidate) => candidate.theoryModuleId === item.moduleId,
    );
    if (!unit?.practiceModuleId) return [];
    return relatedPracticeItems(this.course()?.questions ?? [], item.id, unit.practiceModuleId);
  }

  protected isHandsOnSection(section: { id: string; heading: string }): boolean {
    return (
      section.id === 'pointer-common' ||
      /three essential|essential .*problems/i.test(section.heading)
    );
  }

  protected isUnderstandSection(section: { id: string }): boolean {
    return /-understand$/.test(section.id);
  }

  /** Sections rendered in the normal reading order. "Check your understanding"
   * and the hands-on practice are grouped together after Key Takeaways and the
   * language notes card instead, so they render there rather than in place. */
  protected mainSections(item: InterviewQuestion): TheorySection[] {
    return (item.sections ?? []).filter(
      (section) => !this.isHandsOnSection(section) && !this.isUnderstandSection(section),
    );
  }

  protected understandSection(item: InterviewQuestion): TheorySection | null {
    return (item.sections ?? []).find((section) => this.isUnderstandSection(section)) ?? null;
  }

  protected handsOnSection(item: InterviewQuestion): TheorySection | null {
    // Core Template is deliberately a solution section too. Prefer the actual
    // three-problem practice section (by heading, or by its essential-problems /
    // solutions content) so the merged pill never loops back to the template
    // the learner has just read.
    const sections = item.sections ?? [];
    return (
      sections.find(
        (section) =>
          this.isHandsOnSection(section) &&
          (section.solutions?.length || section.essentialProblems?.length),
      ) ??
      sections.find(
        (section) =>
          (section.solutions?.length || section.essentialProblems?.length) &&
          section.id !== 'pattern-template' &&
          section.id !== 'pointer-core-template',
      ) ??
      null
    );
  }

  protected patternNavigation(item: InterviewQuestion): { label: string; target: string }[] {
    if (isPatternLessonV1(item)) {
      return [
        { label: 'What', target: 'pattern-what' },
        { label: 'Why', target: 'pattern-why' },
        { label: 'Recognize', target: 'pattern-where' },
        { label: 'Invariant', target: 'pattern-model' },
        { label: 'Variations', target: 'pattern-variations' },
        { label: 'Template', target: 'pattern-template' },
        { label: 'Visualize', target: 'pattern-visualize' },
        { label: 'Complexity', target: 'pattern-complexity' },
        { label: 'Pitfalls', target: 'pattern-pitfalls' },
        { label: 'Use / Avoid', target: 'pattern-guidance' },
        { label: 'Worked', target: 'pattern-worked' },
        { label: 'Understand', target: 'pattern-understand' },
        { label: 'Essential', target: 'pattern-essential' },
        { label: 'Continue', target: 'pattern-practice' },
      ];
    }

    const sections = item.sections ?? [];
    const targetFor = (id: string): string | null =>
      sections.some((section) => section.id === id) ? id : null;

    // "Check your understanding" and the hands-on practice sit next to each
    // other in the reading order, so one pill covers both instead of two.
    // Prefer the embedded content section, then the dynamic understanding
    // pager, then the hands-on section itself, so the pill always lands on
    // whichever of those actually renders for this article.
    const understandAndHandsOnTarget =
      this.understandSection(item)?.id ??
      (this.embeddedUnderstanding(item).length ? 'read-understand' : null) ??
      this.handsOnSection(item)?.id ??
      null;
    const understandAndHandsOn = understandAndHandsOnTarget
      ? [{ label: 'Understand & Hands On', target: understandAndHandsOnTarget }]
      : [];

    const firstVisual =
      targetFor('pattern-visualize') ?? sections.find((section) => section.visual)?.id;
    const templateAndVisual: ReadonlyArray<readonly [string, string | null | undefined]> =
      item.id === 'algorithmic-prefix-state'
        ? [
            ['Core Template', 'pattern-template'],
            ['Visualize', firstVisual],
          ]
        : [
            ['Visualize', firstVisual],
            ['Core Template', 'pattern-template'],
          ];
    const standardCandidates: ReadonlyArray<readonly [string, string | null | undefined]> = [
      ['What', 'pattern-what'],
      ['Why', 'pattern-why'],
      ['Where', 'pattern-where'],
      ['How', 'pattern-how'],
      ['Variations', 'pattern-variations'],
      ...templateAndVisual,
      ['Complexity', 'pattern-complexity'],
      ['Pitfalls', 'pattern-pitfalls'],
      ['In Practice', 'pattern-practical-use'],
      ['When to Avoid It', 'pattern-avoid'],
    ];
    const standardLinks: { label: string; target: string }[] = standardCandidates.flatMap(
      ([label, target]) => (target && targetFor(target) ? [{ label, target }] : []),
    );

    return [...standardLinks, ...understandAndHandsOn];
  }

  protected scrollToSection(target: string): void {
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected patternName(title: string): string {
    return title.split(':', 1)[0];
  }

  protected patternSubtitle(title: string): string | null {
    const separator = title.indexOf(':');
    return separator >= 0 ? title.slice(separator + 1).trim() : null;
  }

  /** Lightweight, safe highlighting for small teaching formulas and snippets.
   * Full implementations use CodingSolutionTabs, which supplies language-aware themes. */
  protected formatTheoryCode(source: string): string {
    const escape = (value: string): string =>
      value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    return source
      .split('\n')
      .map(
        (line) =>
          line
            .match(/\s+|[A-Za-z_][A-Za-z0-9_]*|\d+|[+−=:\-*/()[\],|]/g)
            ?.map((token) => {
              const safeToken = escape(token);
              if (/^\s+$/.test(token)) return safeToken;
              // These classes use Dracula's canonical hues. ::ng-deep is required because
              // Angular's HTML sanitizer strips inline styles from [innerHTML] content.
              if (/^\d+$/.test(token)) return `<span class="syntax-number">${safeToken}</span>`;
              if (/^[+−=:\-*/()[\],|]+$/.test(token))
                return `<span class="syntax-operator">${safeToken}</span>`;
              if (/^(for|while|if|return|new)$/.test(token))
                return `<span class="syntax-keyword">${safeToken}</span>`;
              return `<span class="${token === 'Sum' ? 'syntax-function' : 'syntax-name'}">${safeToken}</span>`;
            })
            .join('') ?? escape(line),
      )
      .join('\n');
  }

  protected leetcodeProblem(item: InterviewQuestion): { url: string } | null {
    const urls: Record<string, string> = {
      'core-ds-array-two-sum': 'https://leetcode.com/problems/two-sum/',
      'core-ds-array-best-time-stock':
        'https://leetcode.com/problems/best-time-to-buy-and-sell-stock/',
      'core-ds-array-product-except-self':
        'https://leetcode.com/problems/product-of-array-except-self/',
      'core-ds-remove-duplicates-sorted':
        'https://leetcode.com/problems/remove-duplicates-from-sorted-array/',
      'core-ds-insert-delete-random': 'https://leetcode.com/problems/insert-delete-getrandom-o1/',
      'core-ds-reverse-linked-list': 'https://leetcode.com/problems/reverse-linked-list/',
      'core-ds-linked-list-cycle-ii': 'https://leetcode.com/problems/linked-list-cycle-ii/',
      'core-ds-merge-two-sorted-lists': 'https://leetcode.com/problems/merge-two-sorted-lists/',
      'core-ds-copy-random-list': 'https://leetcode.com/problems/copy-list-with-random-pointer/',
      'core-ds-valid-parentheses': 'https://leetcode.com/problems/valid-parentheses/',
      'core-ds-daily-temperatures': 'https://leetcode.com/problems/daily-temperatures/',
      'core-ds-queue-using-stacks': 'https://leetcode.com/problems/implement-queue-using-stacks/',
      'core-ds-sliding-window-maximum': 'https://leetcode.com/problems/sliding-window-maximum/',
      'core-ds-contains-duplicate': 'https://leetcode.com/problems/contains-duplicate/',
      'core-ds-longest-consecutive': 'https://leetcode.com/problems/longest-consecutive-sequence/',
      'core-ds-max-depth-binary-tree':
        'https://leetcode.com/problems/maximum-depth-of-binary-tree/',
      'core-ds-validate-bst': 'https://leetcode.com/problems/validate-binary-search-tree/',
      'core-ds-kth-largest-stream':
        'https://leetcode.com/problems/kth-largest-element-in-a-stream/',
      'core-ds-top-k-frequent': 'https://leetcode.com/problems/top-k-frequent-elements/',
      'core-ds-flood-fill': 'https://leetcode.com/problems/flood-fill/',
      'core-ds-number-of-islands': 'https://leetcode.com/problems/number-of-islands/',
      'core-ds-implement-trie': 'https://leetcode.com/problems/implement-trie-prefix-tree/',
      'core-ds-redundant-connection': 'https://leetcode.com/problems/redundant-connection/',
      'algorithmic-valid-palindrome': 'https://leetcode.com/problems/valid-palindrome/',
      'sorting-searching-merge-sorted-array': 'https://leetcode.com/problems/merge-sorted-array/',
      'sorting-searching-sort-colors': 'https://leetcode.com/problems/sort-colors/',
      'algorithmic-container-water': 'https://leetcode.com/problems/container-with-most-water/',
      'algorithmic-longest-distinct':
        'https://leetcode.com/problems/longest-substring-without-repeating-characters/',
      'algorithmic-minimum-window': 'https://leetcode.com/problems/minimum-window-substring/',
      'algorithmic-two-sum': 'https://leetcode.com/problems/two-sum/',
      'algorithmic-subarray-sum-k': 'https://leetcode.com/problems/subarray-sum-equals-k/',
      'algorithmic-range-sum-immutable': 'https://leetcode.com/problems/range-sum-query-immutable/',
      'algorithmic-car-pooling': 'https://leetcode.com/problems/car-pooling/',
      'algorithmic-linked-list-cycle': 'https://leetcode.com/problems/linked-list-cycle/',
      'algorithmic-find-duplicate-number':
        'https://leetcode.com/problems/find-the-duplicate-number/',
      'algorithmic-merge-intervals': 'https://leetcode.com/problems/merge-intervals/',
      'algorithmic-non-overlapping-intervals':
        'https://leetcode.com/problems/non-overlapping-intervals/',
      'algorithmic-next-greater-i': 'https://leetcode.com/problems/next-greater-element-i/',
      'algorithmic-daily-temperatures': 'https://leetcode.com/problems/daily-temperatures/',
      'algorithmic-binary-search-practice': 'https://leetcode.com/problems/binary-search/',
      'algorithmic-koko-bananas': 'https://leetcode.com/problems/koko-eating-bananas/',
      'algorithmic-permutations': 'https://leetcode.com/problems/permutations/',
      'algorithmic-generate-parentheses': 'https://leetcode.com/problems/generate-parentheses/',
      'algorithmic-combinations': 'https://leetcode.com/problems/combinations/',
      'algorithmic-subsets': 'https://leetcode.com/problems/subsets/',
      'algorithmic-combination-sum': 'https://leetcode.com/problems/combination-sum/',
      'algorithmic-merge-sorted-array': 'https://leetcode.com/problems/merge-sorted-array/',
      'algorithmic-kth-largest-element':
        'https://leetcode.com/problems/kth-largest-element-in-an-array/',
      'algorithmic-binary-tree-level-order':
        'https://leetcode.com/problems/binary-tree-level-order-traversal/',
      'algorithmic-course-schedule': 'https://leetcode.com/problems/course-schedule/',
      'algorithmic-network-delay-time': 'https://leetcode.com/problems/network-delay-time/',
      'algorithmic-find-path-exists-graph':
        'https://leetcode.com/problems/find-if-path-exists-in-graph/',
      'algorithmic-best-time-buy-sell-stock':
        'https://leetcode.com/problems/best-time-to-buy-and-sell-stock/',
      'algorithmic-jump-game': 'https://leetcode.com/problems/jump-game/',
      'algorithmic-climbing-stairs': 'https://leetcode.com/problems/climbing-stairs/',
      'algorithmic-coin-change': 'https://leetcode.com/problems/coin-change/',
    };
    const url = urls[item.id];
    return url ? { url } : null;
  }

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const courseId = params.get('courseId') ?? 'core-java';
          const pathId = this.route.snapshot.data['pathId'] ?? 'learn';
          this.courseId.set(courseId);
          this.pathId.set(pathId);
          return forkJoin({
            catalog: this.contentService.getCatalog(pathId),
            course: this.contentService.getCourse(pathId, courseId),
          });
        }),
      )
      .subscribe({
        next: ({ catalog, course }) => this.displayQuestion(catalog, course),
        error: () => this.error.set('The question content could not be loaded.'),
      });
  }

  private displayQuestion(catalog: CatalogItem[], course: CourseContent): void {
    this.course.set(course);
    this.courseTitle.set(course.title);
    const questionId = this.route.snapshot.paramMap.get('questionId');
    const question = course.questions.find(({ id }) => id === questionId);
    if (!question) {
      this.error.set('Question not found.');
      return;
    }
    this.question.set(question);
    this.moduleTitle.set(
      course.modules.find(({ id }) => id === question.moduleId)?.title ?? course.title,
    );

    const currentCatalogIndex = catalog.findIndex(({ id }) => id === course.id);
    this.nextCourse.set(catalog[currentCatalogIndex + 1] ?? null);

    const orderedModules = [...course.modules].sort((left, right) => left.order - right.order);
    const section = course.sections?.find((candidate) =>
      candidate.moduleIds.includes(question.moduleId),
    );
    const modulesWithContent = new Set(course.questions.map(({ moduleId }) => moduleId));
    const trackModules = (
      section
        ? orderedModules.filter((module) => section.moduleIds.includes(module.id))
        : orderedModules
    ).filter((module) => modulesWithContent.has(module.id));
    const currentModuleIndex = trackModules.findIndex(({ id }) => id === question.moduleId);
    const nextModule = trackModules[currentModuleIndex + 1] ?? null;
    this.nextModule.set(nextModule);
    this.isLastModuleInCompetency.set(!nextModule);

    const moduleQuestions = course.questions
      .filter(({ moduleId }) => moduleId === question.moduleId)
      .sort((left, right) => left.order - right.order);
    const currentIndex = moduleQuestions.findIndex(({ id }) => id === question.id);
    this.isFirstQuestionInModule.set(currentIndex === 0);
    this.isLastQuestionInModule.set(currentIndex === moduleQuestions.length - 1);
    this.previousQuestion.set(this.toReaderLink(moduleQuestions[currentIndex - 1]));
    this.nextQuestion.set(this.toReaderLink(moduleQuestions[currentIndex + 1]));

    const nextModuleQuestion = nextModule
      ? course.questions
          .filter(({ moduleId }) => moduleId === nextModule.id)
          .sort((left, right) => left.order - right.order)[0]
      : undefined;
    this.nextModuleFirstQuestion.set(this.toReaderLink(nextModuleQuestion));
  }

  private toReaderLink(question: InterviewQuestion | undefined): ReaderLink | null {
    if (!question) return null;
    const moduleTitle =
      this.course()?.modules.find(({ id }) => id === question.moduleId)?.title ?? question.moduleId;
    return { id: question.id, title: question.title, moduleId: question.moduleId, moduleTitle };
  }

  protected parentContextRoute(item: InterviewQuestion): string[] {
    const section = this.courseSection(item);
    if (section) {
      return this.sectionRoute(section.id);
    }
    return ['/', this.pathId(), this.courseId(), 'module', item.moduleId];
  }

  protected parentContextTitle(item: InterviewQuestion): string {
    return this.courseSection(item)?.title ?? this.moduleTitle();
  }

  protected courseSection(item: InterviewQuestion): CourseSection | null {
    return (
      this.course()?.sections?.find((section) => section.moduleIds.includes(item.moduleId)) ?? null
    );
  }

  protected sectionRoute(sectionId: string): string[] {
    return ['/', this.pathId(), this.courseId(), 'section', sectionId];
  }

  protected nextModuleRoute(item: InterviewQuestion, nextModule: CourseModule): string[] {
    if (item.contentType === 'theory') {
      const nextArticle = this.course()
        ?.questions.filter((question) => question.moduleId === nextModule.id)
        .sort((left, right) => left.order - right.order)[0];
      if (nextArticle) return ['/', this.pathId(), this.courseId(), nextArticle.id];
    }
    return ['/', this.pathId(), this.courseId(), 'module', nextModule.id];
  }

  protected nextModuleLabel(item: InterviewQuestion): string {
    return item.contentType === 'theory' ? 'Next article:' : 'Next module:';
  }

  protected relatedArticleTitle(item: InterviewQuestion): string {
    return (
      this.course()?.questions.find((question) => question.id === item.relatedArticleId)?.title ??
      'Related theory article'
    );
  }

  protected resolvedCodingVisual(item: InterviewQuestion): TheoryVisual | null {
    return authenticCodingVisual(item.visual ?? null) ?? this.codingVisual(item);
  }

  protected codingVisual(item: InterviewQuestion): TheoryVisual | null {
    const arrayWalkthroughs: Record<string, Pick<TheoryVisual, 'assetPath' | 'alt' | 'caption'>> = {
      'core-ds-array-max-min': {
        assetPath: '/content/learn/core-data-structures/visuals/array-code-debugger.html#max-min',
        alt: 'Interactive walkthrough of the maximum and minimum scan.',
        caption: 'Step through the state that a one-pass maximum/minimum solution retains.',
      },
      'core-ds-array-reverse-in-place': {
        assetPath: '/content/learn/core-data-structures/visuals/array-code-debugger.html#reverse',
        alt: 'Interactive walkthrough of in-place array reversal.',
        caption: 'Step through each pair swap as two pointers move inward.',
      },
      'core-ds-array-two-sum': {
        assetPath: '/content/learn/core-data-structures/visuals/array-code-debugger.html#two-sum',
        alt: 'Interactive walkthrough of the Two Sum hash map solution.',
        caption: 'See the complement lookup happen before the current value is stored.',
      },
      'core-ds-array-best-time-stock': {
        assetPath: '/content/learn/core-data-structures/visuals/array-code-debugger.html#stock',
        alt: 'Interactive walkthrough of the best stock trade scan.',
        caption: 'Track the cheapest eligible buy and best completed profit as prices arrive.',
      },
      'core-ds-array-product-except-self': {
        assetPath: '/content/learn/core-data-structures/visuals/array-code-debugger.html#product',
        alt: 'Interactive walkthrough of prefix and suffix products.',
        caption: 'See how two directional passes avoid division and extra arrays.',
      },
      'core-ds-reverse-linked-list': {
        assetPath:
          '/content/learn/core-data-structures/visuals/linked-reference-code-debugger.html#reverse-list',
        alt: 'Language-specific trace for reversing a linked list.',
        caption: 'Follow each pointer update while the list reverses.',
      },
      'core-ds-linked-list-cycle-ii': {
        assetPath:
          '/content/learn/core-data-structures/visuals/linked-reference-code-debugger.html#cycle-entry',
        alt: 'Language-specific trace for cycle entry detection.',
        caption: 'Follow slow and fast pointers, then the entry search.',
      },
      'core-ds-merge-two-sorted-lists': {
        assetPath:
          '/content/learn/core-data-structures/visuals/linked-reference-code-debugger.html#merge-lists',
        alt: 'Language-specific trace for merging two sorted lists.',
        caption: 'See the tail attach nodes while preserving sorted order.',
      },
      'core-ds-copy-random-list': {
        assetPath:
          '/content/learn/core-data-structures/visuals/linked-reference-code-debugger.html#copy-random',
        alt: 'Language-specific trace for cloning random-pointer links.',
        caption: 'See the original-to-copy map establish every link.',
      },
      'core-ds-valid-parentheses': {
        assetPath:
          '/content/learn/core-data-structures/visuals/stack-queue-code-debugger.html#valid-parentheses',
        alt: 'Language-specific trace for delimiter matching.',
        caption: 'See opening tokens pushed and matching tokens popped.',
      },
      'core-ds-daily-temperatures': {
        assetPath:
          '/content/learn/core-data-structures/visuals/stack-queue-code-debugger.html#daily-temperatures',
        alt: 'Language-specific trace for the decreasing temperature stack.',
        caption: 'Resolve each colder day when a warmer temperature arrives.',
      },
      'core-ds-queue-using-stacks': {
        assetPath:
          '/content/learn/core-data-structures/visuals/stack-queue-code-debugger.html#queue-stacks',
        alt: 'Language-specific trace for a lazy two-stack queue.',
        caption: 'See the one-time transfer reverse insertion order into FIFO output order.',
      },
      'core-ds-sliding-window-maximum': {
        assetPath:
          '/content/learn/core-data-structures/visuals/stack-queue-code-debugger.html#sliding-window',
        alt: 'Language-specific trace for a monotonic window deque.',
        caption: 'See expired and dominated candidates leave opposite ends.',
      },
      'core-ds-contains-duplicate': {
        assetPath:
          '/content/learn/core-data-structures/visuals/hash-table-code-debugger.html#contains-duplicate',
        alt: 'Language-specific trace for duplicate detection using a set.',
        caption: 'See the set gain values until a repeated key is found.',
      },
      'core-ds-longest-consecutive': {
        assetPath:
          '/content/learn/core-data-structures/visuals/hash-table-code-debugger.html#longest-consecutive',
        alt: 'Language-specific trace for longest consecutive sequence.',
        caption: 'See the set and sequence-start state drive the scan.',
      },
      'core-ds-flood-fill': {
        assetPath: '/content/learn/core-data-structures/visuals/graph-bfs-dfs-lab.html',
        alt: 'Language-specific graph traversal state for flood fill.',
        caption: 'Inspect queue or stack frontier state, visited nodes, and adjacency traversal.',
      },
      'core-ds-number-of-islands': {
        assetPath: '/content/learn/core-data-structures/visuals/graph-bfs-dfs-lab.html',
        alt: 'Language-specific graph traversal state for island counting.',
        caption: 'Inspect queue or stack frontier state, visited nodes, and adjacency traversal.',
      },
      'core-ds-implement-trie': {
        assetPath: '/content/learn/core-data-structures/visuals/trie-prefix-lab.html',
        alt: 'Language-specific trie prefix traversal.',
        caption: 'Inspect the prefix path, terminal marker, and matches.',
      },
      'core-ds-redundant-connection': {
        assetPath: '/content/learn/core-data-structures/visuals/union-find-compression-lab.html',
        alt: 'Language-specific Union-Find parent and size state.',
        caption: 'Step through parent links and observe path compression.',
      },
      'algorithmic-linked-list-cycle': {
        assetPath: '/content/learn/algorithmic-patterns/visuals/fast-slow-pointers-lab.html',
        alt: 'Fast and slow pointers tracing a linked-list cycle.',
        caption: 'See pointer positions and the cycle invariant.',
      },
      'algorithmic-find-duplicate-number': {
        assetPath: '/content/learn/algorithmic-patterns/visuals/fast-slow-pointers-lab.html',
        alt: 'Fast and slow pointers following an array-as-graph cycle.',
        caption: 'See cycle-entry reasoning applied to indexed state.',
      },
      'algorithmic-merge-intervals': {
        assetPath: '/content/learn/algorithmic-patterns/visuals/interval-merge-lab.html',
        alt: 'Sorted intervals and merge decisions.',
        caption: 'See overlap extend or commit the active interval.',
      },
      'algorithmic-non-overlapping-intervals': {
        assetPath: '/content/learn/algorithmic-patterns/visuals/interval-merge-lab.html',
        alt: 'Sorted intervals and greedy overlap decisions.',
        caption: 'See the active end control each retention choice.',
      },
      'algorithmic-next-greater-i': {
        assetPath: '/content/learn/algorithmic-patterns/visuals/monotonic-lab.html#stack',
        alt: 'Monotonic stack candidates and discarded values.',
        caption: 'Follow candidate pruning as next-greater answers resolve.',
      },
      'algorithmic-daily-temperatures': {
        assetPath: '/content/learn/algorithmic-patterns/visuals/monotonic-lab.html#stack',
        alt: 'Monotonic stack of unresolved temperature days.',
        caption: 'Follow each warmer day resolving earlier indices.',
      },
      'algorithmic-binary-search-practice': {
        assetPath: '/content/learn/algorithmic-patterns/visuals/binary-search-lab.html',
        alt: 'Binary-search low high and mid updates.',
        caption: 'Follow boundary updates until termination.',
      },
      'algorithmic-koko-bananas': {
        assetPath: '/content/learn/algorithmic-patterns/visuals/binary-search-lab.html',
        alt: 'Binary-search feasibility boundary.',
        caption: 'Follow candidate speed checks and the first feasible answer.',
      },
      'algorithmic-permutations': {
        assetPath: '/content/learn/algorithmic-patterns/visuals/backtracking-choice-lab.html',
        alt: 'Choose, explore, and un-choose over a decision tree.',
        caption: 'See the shared path grow and shrink as branches are explored and undone.',
      },
      'algorithmic-subsets': {
        assetPath: '/content/learn/algorithmic-patterns/visuals/backtracking-choice-lab.html',
        alt: 'Choose, explore, and un-choose over a decision tree.',
        caption: 'See the shared path grow and shrink as branches are explored and undone.',
      },
      'algorithmic-merge-sort-dc': {
        assetPath: '/content/learn/algorithmic-patterns/visuals/divide-conquer-lab.html',
        alt: 'Divide, conquer, and combine phases for merge sort.',
        caption:
          'Step through splitting down to base cases, then merging back up one level at a time.',
      },
      'algorithmic-tree-right-side-view': {
        assetPath: '/content/learn/core-data-structures/visuals/graph-bfs-dfs-lab.html',
        alt: 'Step-through BFS queue state with visited tracking.',
        caption:
          'See the same level-boundary queue mechanics that capture the last node per level.',
      },
      'algorithmic-binary-tree-level-order': {
        assetPath: '/content/learn/core-data-structures/visuals/graph-bfs-dfs-lab.html',
        alt: 'Step-through BFS queue state with visited tracking.',
        caption:
          'See the queue drain one level at a time, the same mechanic level-order traversal relies on.',
      },
      'algorithmic-clone-graph': {
        assetPath: '/content/learn/core-data-structures/visuals/graph-bfs-dfs-lab.html',
        alt: 'Step-through BFS/DFS traversal with visited tracking.',
        caption:
          'See the visited-state mechanics that clone graph reuses as an original-to-clone map.',
      },
      'algorithmic-course-schedule-ii': {
        assetPath: '/content/learn/algorithmic-patterns/visuals/topo-order-lab.html',
        alt: 'Step-through indegree-based topological ordering with a ready queue.',
        caption: "Step through Kahn's algorithm producing an explicit build order.",
      },
      'algorithmic-number-of-provinces': {
        assetPath: '/content/learn/core-data-structures/visuals/graph-bfs-dfs-lab.html',
        alt: 'Step-through BFS/DFS traversal with visited tracking.',
        caption: 'See traversal starts counted as separate connected components.',
      },
      'algorithmic-course-schedule': {
        assetPath: '/content/learn/algorithmic-patterns/visuals/topo-order-lab.html',
        alt: 'Step-through indegree-based topological ordering with a ready queue.',
        caption: "Step through Kahn's algorithm and watch whether every node is processed.",
      },
      'algorithmic-network-delay-time': {
        assetPath: '/content/learn/algorithmic-patterns/visuals/shortest-path-lab.html',
        alt: 'Step-through Dijkstra relaxation showing distance estimates improving.',
        caption:
          'Step through relaxation from the source node to see when the last distance settles.',
      },
      'algorithmic-uf-connected-components': {
        assetPath: '/content/learn/core-data-structures/visuals/union-find-compression-lab.html',
        alt: 'Step-through find operation with parent-pointer path compression.',
        caption: 'See parent pointers compress toward a shared root as components merge.',
      },
      'algorithmic-graph-valid-tree': {
        assetPath: '/content/learn/core-data-structures/visuals/union-find-compression-lab.html',
        alt: 'Step-through find operation with parent-pointer path compression.',
        caption: 'See how a union that finds an existing shared root reveals a cycle.',
      },
      'algorithmic-accounts-merge': {
        assetPath: '/content/learn/core-data-structures/visuals/union-find-compression-lab.html',
        alt: 'Step-through find operation with parent-pointer path compression.',
        caption: 'See the same parent-compression mechanics applied to index-mapped email keys.',
      },
      'algorithmic-find-path-exists-graph': {
        assetPath: '/content/learn/core-data-structures/visuals/union-find-compression-lab.html',
        alt: 'Step-through find operation with parent-pointer path compression.',
        caption: 'See source and destination resolve to the same compressed root once connected.',
      },
      'algorithmic-gas-station': {
        assetPath: '/content/learn/algorithmic-patterns/visuals/greedy-choice-lab.html',
        alt: 'Step-through greedy running-tank reset logic for the Gas Station problem.',
        caption:
          'Step through the running tank: watch it reset to a new candidate start the moment it goes negative.',
      },
      'algorithmic-house-robber': {
        assetPath: '/content/learn/algorithmic-patterns/visuals/dp-table-lab.html',
        alt: 'Step-through 1D DP table filling for Climbing Stairs.',
        caption: "See the same two-rolling-variable mechanics this problem's transition relies on.",
      },
      'algorithmic-climbing-stairs': {
        assetPath: '/content/learn/algorithmic-patterns/visuals/dp-table-lab.html',
        alt: 'Step-through 1D DP table filling for Climbing Stairs.',
        caption:
          'Step through the table: watch each cell depend only on the two cells directly before it.',
      },
      'algorithmic-jump-game': {
        assetPath: '/content/learn/algorithmic-patterns/visuals/algorithm-family-lab.html',
        alt: 'Step-through comparison of brute-force search, dynamic programming, and greedy for Jump Game.',
        caption:
          'Step through the decision order: see why the DP-correct answer can be replaced by a cheaper, still-correct greedy one.',
      },
    };
    const visual = arrayWalkthroughs[item.id];
    // The generic source carousel does not execute branches or loops. Hiding it
    // is safer than presenting a misleading trace while the data-driven trace
    // contract is rolled out to each problem family.
    return authenticCodingVisual(visual ? { type: 'interactive', ...visual } : null);
  }
}

interface ReaderLink {
  id: string;
  title: string;
  moduleId: string;
  moduleTitle: string;
}
