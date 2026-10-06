import { ContentRecovery, RecoveryKind, RecoveryPreview, recoveryKind } from '../../core/content-recovery/content-recovery';
import { LearningCode } from '../../core/learning-code';
import { highlightLearningCode } from '../../core/focus-studio/code-presentation';
import { PROTECTED_CONTENT } from '../../content/content-delivery';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { StudyPlanReaderNavigation } from '../../core/study-plan-reader-navigation';
import {
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink, UrlTree } from '@angular/router';
import { EMPTY, Subject, merge, catchError, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import {
  CatalogItem,
  ContentItemSummary,
  CourseModule,
  CourseOutline,
  CourseSection,
  DsaProblemNavigation,
  DsaProblemNavigationLink,
  FoundationLessonV1,
  InterviewQuestion,
  PatternLesson,
  PatternProblemV1,
  QuestionWalkthroughStep,
  ResolvedPatternCheck,
  TheorySection,
  TheoryVisual,
  isFoundationLessonV1,
  isPatternLesson,
  reviewStatusLabel,
  systemLessonStages,
  lessonPatternDefinition,
  navTitle,
} from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import {
  HandsOnDifficulty,
  HandsOnDsaIndex,
  HandsOnDsaIndexProblemResult,
  HandsOnSort,
  HandsOnTierScope,
  filterHandsOnDsaIndexGroups,
  rankedHandsOnDsaIndexProblems,
  resolveHandsOnDsaIndexGroup,
} from '../../content/hands-on-dsa';
import {
  flattenLearningUnits,
  handsOnPatternIdForModule,
  orderedTheoryArticles,
  unitSceneForModule,
} from '../../content/learning-units';
import { authenticCodingVisual, relatedPracticeItems } from '../../content/pattern-experience';
import { questionModuleIdForArticle, questionsForModule } from '../../content/question-discovery';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import {
  PageSidebarContextDirective,
  PageSidebarContextValue,
  SidebarLessonNav,
} from '../../core/page-sidebars/page-sidebar-context';
import { InteractiveTheoryVisual } from '../../core/interactive-theory-visual/interactive-theory-visual';
import { CodingSolutionTabs } from '../../core/coding-solution-tabs/coding-solution-tabs';
import { CodingProblemDetail } from '../../core/coding-problem-detail/coding-problem-detail';
import { InlineUnderstandingPager } from '../../core/inline-understanding-pager/inline-understanding-pager';
import { PatternEssentialProblems } from '../../core/pattern-essential-problems/pattern-essential-problems';
import { PatternLessonShell } from '../../core/pattern-lesson-shell/pattern-lesson-shell';
import { CodeCopyButton } from '../../core/code-copy-button/code-copy-button';
import { FoundationLessonShell } from '../../core/foundation-lesson-shell/foundation-lesson-shell';
import { EvidenceAnswerTabs } from '../../core/evidence-answer-tabs/evidence-answer-tabs';
import { DsaProblemPilot } from '../../core/dsa-problem-pilot/dsa-problem-pilot';
import { CardScene } from '../../core/card-scene/card-scene';
import { PatternHelp } from '../../core/pattern-help/pattern-help';
import { StudioFinishReview } from '../../core/focus-studio/studio-finish-review';
import { PracticeProgressService } from '../../core/practice-progress/practice-progress';
import { FOCUS_STUDIO_PATTERN, usesFocusStudio } from '../../content/focus-studio-scope';
import { catalogGroupForCourse, nextCatalogGroup } from '../../content/catalog-course-groups';

@Component({
  selector: 'app-question',
  imports: [ContentRecovery, LearningCode,
    PageSidebarContextDirective,
    StudyPlanReaderNavigation,
    PlatformHeader,
    RouterLink,
    NgTemplateOutlet,
    InteractiveTheoryVisual,
    CodingSolutionTabs,
    CodingProblemDetail,
    InlineUnderstandingPager,
    PatternEssentialProblems,
    PatternLessonShell,
    FoundationLessonShell,
    CodeCopyButton,
    EvidenceAnswerTabs,
    DsaProblemPilot,
    CardScene,
    PatternHelp,
    StudioFinishReview,
  ],
  templateUrl: './question.html',
  styleUrl: './question-answer.css',
  styles: [
    `
      main.harbor-learn.focus-studio-page.studio-pilot-page {
        max-width: 2100px;
        padding-inline: clamp(12px, 2vw, 32px);
      }
      /* Option B problem stories use the full screen width (class set by Focus Studio). */
      main.harbor-learn.focus-studio-page.studio-pilot-page.option-b-page {
        max-width: none;
        padding-inline: clamp(12px, 1.2vw, 24px);
      }
      .studio-pilot-page .reader-question-panel {
        margin-block: 14px;
      }
      .studio-pilot-page.focus-studio-page .reader-question-panel {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px 20px;
        margin-block: 10px 12px;
        padding-bottom: 8px;
      }
      .studio-pilot-page .reader-question-panel .article-title-row {
        flex: 1 1 420px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: flex-start;
        gap: 6px;
        text-align: start;
      }
      .studio-pilot-page .reader-question-panel .reader-question-title {
        font-size: clamp(1.6rem, 2.6vw, 2.2rem);
        font-weight: 600;
        line-height: 1.2;
        letter-spacing: -0.01em;
      }
      .studio-pilot-page .reader-question-panel .question-inner-navigation {
        flex: 1 1 580px;
      }
      .studio-pilot-page.focus-studio-page .reader-question-panel > .eyebrow {
        margin: 6px 0;
      }
      .studio-pilot-page .question-context-panel {
        margin-block: 6px 10px;
      }
      .studio-pilot-page.focus-studio-page .question-inner-navigation {
        margin-top: 8px;
        padding-block: 8px 0;
        gap: 12px;
        border: 0;
      }
      .studio-pilot-page .question-inner-navigation .inner-navigation-link {
        min-height: 0;
        padding: 6px 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
        gap: 5px;
        flex-direction: row;
        align-items: baseline;
        flex-wrap: wrap;
      }
      .studio-pilot-page .question-inner-navigation .inner-navigation-link span {
        font-size: 11px;
      }
      .studio-pilot-page .question-inner-navigation .inner-navigation-link strong {
        font-size: 12px;
      }
      main.harbor-learn.focus-studio-page {
        max-width: 1600px;
        padding-inline: clamp(16px, 3vw, 44px);
      }
      .focus-studio-page .question-reader {
        width: 100%;
        min-width: 0;
      }
      .focus-studio-page .reader-question-panel {
        margin-block: 24px;
        padding: 0 0 24px;
        border: 0;
        border-bottom: 1px solid var(--line);
        border-radius: 0;
        background: transparent;
        box-shadow: none;
      }
      .focus-studio-page .reader-question-title {
        margin: 0;
        font:
          500 clamp(30px, 3vw, 42px) / 1.15 Georgia,
          serif;
        letter-spacing: -0.03em;
        text-wrap: pretty;
      }
      .focus-studio-page .reader-question-panel > .eyebrow {
        margin-top: 12px;
        font-size: 14px;
        font-weight: 500;
        letter-spacing: 0;
        text-transform: none;
        color: var(--text-subtle);
      }
      .focus-studio-page .question-inner-navigation {
        margin-top: 16px;
      }
      .focus-studio-page .question-sticky-utility {
        position: static;
      }
      @media (max-width: 600px) {
        .focus-studio-page .reader-question-panel {
          margin-block: 18px;
          padding-bottom: 18px;
        }
        .focus-studio-page .question-inner-navigation {
          gap: 12px;
        }
      }
      .practice-return {
        display: flex;
        flex-wrap: wrap;
        gap: 12px 24px;
        margin: 0 0 16px;
      }
      .practice-return a {
        text-decoration: underline;
        text-underline-offset: 4px;
        color: var(--search-primary);
        font-weight: 700;
      }
      .practice-return a:focus-visible,
      .practice-reference > summary:focus-visible {
        outline: 3px solid var(--search-primary);
        outline-offset: 4px;
      }
      .practice-instructions {
        margin: 20px 0;
        padding: 20px;
        border: 1px solid var(--line);
        background: var(--surface);
      }
      .practice-instructions h2 {
        margin: 0 0 12px;
        font-size: 1.15rem;
      }
      .practice-instructions li {
        margin: 8px 0;
        line-height: 1.6;
      }
      /* Reference answer: a full-width card toggle; the revealed answer sits in a framed panel joined to it. */
      .practice-reference {
        margin: 4px 0 0;
      }
      .practice-reference > summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px 20px;
        box-sizing: border-box;
        min-height: 64px;
        padding: 16px 20px;
        border: 1px solid var(--interview-line);
        border-inline-start: 4px solid var(--accent-strong);
        border-radius: 12px;
        background: var(--surface);
        cursor: pointer;
        list-style: none;
        transition: background-color 150ms ease, border-color 150ms ease;
      }
      .practice-reference > summary::-webkit-details-marker {
        display: none;
      }
      .practice-reference > summary:hover {
        background: var(--surface-muted);
      }
      .practice-reference[open] > summary {
        border-end-start-radius: 0;
        border-end-end-radius: 0;
        background: var(--surface-muted);
      }
      .reference-toggle-text {
        display: grid;
        gap: 3px;
        min-width: 0;
      }
      .reference-toggle-label {
        color: var(--text-strong);
        font-size: 1.05rem;
        font-weight: 750;
        line-height: 1.35;
      }
      .reference-toggle-hint {
        color: var(--text-subtle);
        font-size: 0.9rem;
        line-height: 1.45;
      }
      .reference-toggle-action {
        display: inline-flex;
        flex-shrink: 0;
        align-items: center;
        gap: 10px;
        min-height: 36px;
        box-sizing: border-box;
        padding: 6px 14px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--surface);
        color: var(--accent-link);
        font-size: 0.9rem;
        font-weight: 750;
      }
      .reference-toggle-chevron {
        width: 0.5em;
        height: 0.5em;
        border-inline-end: 2px solid currentColor;
        border-block-end: 2px solid currentColor;
        transform: translateY(-2px) rotate(45deg);
        transition: transform 150ms ease;
      }
      .practice-reference[open] .reference-toggle-chevron {
        transform: translateY(2px) rotate(-135deg);
      }
      .practice-reference-body {
        padding: 24px;
        border: 1px solid var(--interview-line);
        border-block-start: 0;
        border-inline-start: 4px solid var(--accent-strong);
        border-end-start-radius: 12px;
        border-end-end-radius: 12px;
        background: var(--surface-page);
      }
      @media (prefers-reduced-motion: reduce) {
        .practice-reference > summary,
        .reference-toggle-chevron {
          transition: none;
        }
      }
      @media (max-width: 700px) {
        .practice-reference > summary {
          padding: 14px 16px;
        }
        .practice-reference-body {
          padding: 16px 14px;
        }
      }
      .studio-pilot-page .article-title-row {
        min-width: 0;
      }
      .problem-back {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 6px -4px;
        padding: 4px 8px 4px 4px;
        border-radius: 8px;
        color: var(--muted);
        font-size: 0.88rem;
        font-weight: 600;
        text-decoration: none;
      }
      .problem-back:hover {
        background: var(--surface-muted);
        color: var(--text-strong);
      }
      .problem-back svg,
      .pattern-help-open svg,
      .pattern-lesson-open svg,
      .problem-nav-card svg {
        flex: 0 0 auto;
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .reader-question-title .problem-number {
        color: var(--muted);
        font-weight: 500;
      }
      .problem-title-metadata {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin: 2px 0 0;
        color: var(--muted);
        font-size: 0.85rem;
      }
      .problem-title-metadata > span {
        white-space: nowrap;
      }
      .problem-title-metadata > span + span::before {
        content: '·';
        margin-inline-end: 8px;
        color: var(--line);
      }
      .problem-title-metadata .problem-solved {
        color: var(--success);
        font-weight: 700;
      }
      .problem-nav-card .solved-tick {
        flex: 0 0 auto;
        color: var(--success);
        font-weight: 800;
      }
      .problem-title-metadata .problem-level {
        color: var(--text-strong);
        font-weight: 700;
        text-transform: capitalize;
      }
      .problem-pattern-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        margin-inline-start: auto;
        max-width: 100%;
      }
      .pattern-help-open,
      .pattern-lesson-open {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 40px;
        padding: 9px 16px;
        border-radius: 10px;
        font: inherit;
        font-size: 0.95rem;
        font-weight: 700;
        white-space: nowrap;
        cursor: pointer;
        text-decoration: none;
      }
      .pattern-help-open {
        border: 0;
        background: var(--accent-strong);
        color: var(--accent-on-primary);
      }
      .pattern-lesson-open {
        border: 1px solid var(--accent-strong);
        background: var(--surface);
        color: var(--accent-strong);
      }
      .pattern-help-open:hover,
      .pattern-lesson-open:hover {
        filter: brightness(1.06);
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      @media (max-width: 700px) {
        .problem-pattern-actions {
          flex-basis: 100%;
          justify-content: flex-start;
        }
      }
      .source-navigation-rows {
        flex: 1 0 100%;
        display: grid;
        gap: 10px;
        min-width: 0;
        margin-top: 14px;
      }
      .problem-nav-cards {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .problem-nav-card {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 12px;
        min-width: 0;
        padding: 10px 14px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--surface);
        color: var(--text-strong);
        text-decoration: none;
        transition:
          border-color 0.15s,
          background 0.15s;
      }
      .problem-nav-card:hover {
        border-color: var(--accent-strong);
        background: var(--surface-muted);
      }
      .problem-nav-card.next {
        grid-column: 2;
        justify-content: flex-end;
        text-align: end;
      }
      .problem-nav-card svg {
        width: 20px;
        height: 20px;
        color: var(--accent-strong);
      }
      .problem-nav-card .card-text {
        min-width: 0;
      }
      .problem-nav-card small {
        display: block;
        color: var(--muted);
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .problem-nav-card b {
        display: block;
        overflow: hidden;
        font-size: 0.95rem;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .problem-nav-boundary {
        align-self: center;
        color: var(--muted);
        font-size: 0.85rem;
      }
      .problem-nav-boundary.end {
        grid-column: 2;
        justify-self: end;
      }
      @media (max-width: 640px) {
        .problem-nav-cards {
          grid-template-columns: minmax(0, 1fr);
        }
        .problem-nav-card.next,
        .problem-nav-boundary.end {
          grid-column: 1;
        }
      }
      .question-inner-navigation {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 24px;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid var(--line);
      }
      .surprise-challenge {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 12px;
        align-items: center;
        margin: 12px 0;
        padding: 13px 16px;
        border: 1px solid var(--warning);
        border-left: 5px solid var(--warning);
        border-radius: 12px;
        color: var(--text-body);
        background: var(--warning-surface);
      }
      .surprise-challenge span {
        padding: 5px 9px;
        border-radius: 999px;
        color: var(--accent-on-secondary);
        background: var(--accent-secondary-strong);
        font-size: 0.67rem;
        font-weight: 850;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .surprise-challenge p {
        margin: 0;
        line-height: 1.5;
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
      .canonical-problem-navigation {
        gap: 12px;
      }
      .canonical-problem-navigation .inner-navigation-actions {
        align-items: stretch;
      }
      .problem-navigation-link {
        box-sizing: border-box;
        width: 100%;
        min-height: 68px;
        justify-content: center;
        padding: 11px 14px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: linear-gradient(135deg, var(--surface), var(--surface-accent));
        box-shadow: 0 7px 16px var(--shadow);
        transition:
          border-color 0.16s ease,
          box-shadow 0.16s ease,
          transform 0.16s ease;
      }
      .problem-navigation-link.previous {
        border-left: 4px solid var(--search-primary);
      }
      .problem-navigation-link.next {
        border-right: 4px solid var(--accent-strong);
      }
      .problem-navigation-link:hover,
      .problem-navigation-link:focus-visible {
        border-color: var(--search-primary);

        box-shadow: 0 10px 22px var(--shadow);
        transform: translateY(-1px);
      }
      .problem-navigation-link.next span {
        color: var(--accent-link);
      }
      .inner-navigation-link.next-module,
      .inner-navigation-link.previous-module,
      .module-catalog-link {
        height: 32px;
        box-sizing: border-box;
        font-size: 0.75rem;
        line-height: 18px;
      }
      .inner-navigation-link.next-module,
      .inner-navigation-link.previous-module {
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
      .inner-navigation-link.previous-module span {
        flex: 0 0 auto;
        color: var(--search-primary);
        font-size: 0.65rem;
      }
      .inner-navigation-link.previous-module strong {
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
        color: var(--text-body);
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
        border: 1px solid var(--line);
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
      }
      .reader-question-title .pattern-title-subtitle {
        color: var(--text-subtle);
        font-family: 'Avenir Next', Avenir, 'Segoe UI', sans-serif;
        font-weight: 500;
        letter-spacing: -0.035em;
      }
      /* The unit's scene sits beside the title on wide screens and above it on phones. Space is
         reserved only when a scene path resolves; a missing file collapses back to the title. */
      .reader-title-block.has-unit-scene {
        display: grid;
        grid-template-columns: minmax(0, 1fr) clamp(280px, 24vw, 320px);
        align-items: center;
        gap: 12px 32px;
      }
      .reader-title-block.has-unit-scene:has(> .la-card-scene-missing) {
        display: block;
      }
      .reader-title-text {
        min-width: 0;
      }
      .reader-unit-scene {
        grid-column: 2;
        grid-row: 1;
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 12px;
        overflow: hidden;
      }
      .reader-title-block.has-unit-scene .reader-title-text {
        grid-column: 1;
        grid-row: 1;
      }
      @media (max-width: 760px) {
        .reader-title-block.has-unit-scene {
          grid-template-columns: minmax(0, 1fr);
        }
        .reader-unit-scene {
          grid-column: 1;
          max-width: 420px;
        }
        .reader-title-block.has-unit-scene .reader-title-text {
          grid-row: 2;
        }
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
      .lesson-subtitle {
        margin: 6px 0 0;
        max-width: 62ch;
        color: var(--text-subtle);
        font-size: 1.05rem;
        line-height: 1.5;
      }
      .theory-section {
        margin: 0 0 18px;
        padding: 22px 24px;
        border: 1px solid var(--line);
        border-left: 4px solid var(--search-primary);
        border-radius: 12px;
        background: var(--surface);
        box-shadow: 0 8px 20px var(--shadow);
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
        color: var(--text-body);
        font-size: clamp(1rem, 0.2vw + 0.94rem, 1.06rem);
        font-weight: 450;
        line-height: 1.65;
        letter-spacing: 0.001em;
        text-wrap: pretty;
      }
      .theory-section > p > code {
        padding: 0.08em 0.32em;
        border-radius: 4px;
        color: var(--accent-link);
        background: var(--surface-accent);
        font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
        font-size: 0.84em;
        font-weight: 650;
      }
      :host ::ng-deep .theory-section .pattern-signal {
        display: inline-flex;
        align-items: center;
        margin: 5px 5px 0 0;
        padding: 3px 9px;
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--accent-strong);
        background: var(--surface-accent);
        font-size: 0.8em;
        font-weight: 800;
        line-height: 1.35;
      }
      .theory-callout {
        margin: 22px 0;
        padding: 16px 18px;
        border-left: 4px solid var(--search-primary);
        border-radius: 0 10px 10px 0;
        background: var(--surface-accent);
      }
      .theory-callout[data-callout-type='production'] {
        border-left-color: var(--path-grow);
        background: var(--surface-muted);
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
        background: var(--code-bg);
        color: var(--code-ink);
      }
      .theory-code > div {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 10px 14px;
        color: var(--code-muted);
        font-size: 0.8rem;
        border-bottom: 1px solid var(--code-line);
      }
      .theory-code-actions,
      .reference-code-actions {
        display: flex;
        align-items: center;
        gap: 10px;
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
        color: var(--code-keyword);
      }
      :host ::ng-deep .theory-code .syntax-function {
        color: var(--code-string);
      }
      :host ::ng-deep .theory-code .syntax-number {
        color: var(--code-number);
      }
      :host ::ng-deep .theory-code .syntax-operator,
      :host ::ng-deep .theory-code .syntax-keyword {
        color: var(--code-keyword);
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
        border: 1px solid var(--line);
        border-left: 4px solid var(--search-primary);
        border-radius: 12px;
        background: linear-gradient(135deg, var(--surface-accent), var(--surface));
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
        color: var(--text-subtle);
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
        border: 1px solid var(--line);
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
        background: var(--success-surface);
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
        background: var(--surface-accent);
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
        color: var(--accent-strong);
      }
      .theory-language-notes li:last-child {
        margin-bottom: 0;
      }
      .question-review-navigation {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px 24px;
        margin: 16px 0 24px;
      }
      .question-review-navigation .practice-return { margin: 0; }
      .question-review-navigation .related-theory-link {
        margin: 0 0 0 auto;
        text-align: end;
        min-width: 0;
        overflow-wrap: anywhere;
        text-decoration: underline;
        text-underline-offset: 4px;
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
      }
      @media (max-width: 980px) {
        .question-inner-navigation {
          grid-template-columns: minmax(0, 1fr);
        }
        .inner-navigation-actions {
          grid-column: auto;
          justify-content: flex-start;
        }
        .inner-navigation-link.next {
          align-items: flex-start;
          text-align: left;
        }
        .problem-navigation-link.next {
          border-right-width: 1px;
          border-left: 4px solid var(--accent-strong);
        }
        .inner-navigation-link.next-module,
        .inner-navigation-link.previous-module {
          width: 100%;
          align-self: flex-start;
        }
        .theory-section {
          padding: 18px;
        }
        .article-title-row {
          display: block;
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
        opacity: 1;
        transition:
          opacity 0.2s ease,
          color 0.2s ease,
          background 0.2s ease;
      }
      .sticky-pill-strip .sticky-pill:hover {
        opacity: 1;
      }
      .sticky-pill-strip .sticky-pill.active {
        color: var(--search-primary);
        background: var(--surface-accent);
        opacity: 1;
      }
      @media (max-width: 760px) {
        .pattern-navigation button,
        .sticky-pill-strip .sticky-pill {
          min-height: 44px;
        }
        .sticky-pill-strip .sticky-pill:not(.active) {
          display: none;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .problem-navigation-link {
          transition: none;
        }
      }
      @media (forced-colors: active) {
        .problem-navigation-link {
          border-color: CanvasText;
          color: LinkText;
          background: Canvas;
          box-shadow: none;
        }
      }
    `,
  ],
})
export class Question implements OnInit {
  private readonly contentService = inject(ContentService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly accounts = inject(StudyPlanAccount);
  private readonly protectedContent = inject(PROTECTED_CONTENT);
  /** Practice progress saved in this browser only, for the solved mark and the nav card ticks. */
  private readonly practiceProgress = inject(PracticeProgressService);
  private readonly accountChanges = toObservable(this.accounts.account);
  private readonly expiryChanges = toObservable(this.accounts.sessionExpired);
  protected readonly returnDestination = signal<UrlTree | null>(null);
  private navigationIndex: HandsOnDsaIndex | null = null;
  protected readonly sourceOrderLabel = signal('Learning order');
  private readonly learningNeighbors = signal<
    Record<string, { previous?: DsaProblemNavigationLink; next?: DsaProblemNavigationLink }>
  >({});

  private readonly releaseProblems = signal<Record<string, HandsOnDsaIndexProblemResult>>({});
  protected readonly releaseTotal = signal(0);
  private readonly patternPositions = signal<Record<string, Record<string, number>>>({});
  private readonly sourcePositions = signal<Record<string, number>>({});
  protected releaseInfo(item: InterviewQuestion) {
    return this.releaseProblems()[this.canonicalProblem(item)?.id ?? ''];
  }
  /** Published problem ids by route (`learn/course/question`), as plan entries link by route. */
  private readonly problemIdByRoute = computed(() =>
    Object.fromEntries(
      Object.values(this.releaseProblems()).map((problem) => [
        problem.route.join('/').replace(/^\/+/, ''),
        problem.id,
      ]),
    ),
  );
  /**
   * A plan entry names a plan activity, not always a problem. Resolve it the way the reader
   * navigation matches the current page, by route: the published problem at that route, then a
   * known problem id, then the route's last segment (which is the problem id for most problems).
   */
  private planEntryProblemId(entry: { id: string; route: string[] }): string {
    const key = entry.route.join('/').replace(/^\/+/, '');
    return (
      this.problemIdByRoute()[key] ??
      (this.releaseProblems()[entry.id] ? entry.id : (entry.route.at(-1) ?? entry.id))
    );
  }
  /** The learner's rating once this problem is marked solved on this device. */
  protected solvedRating(item: InterviewQuestion): string | null {
    const record = this.practiceProgress.records()[this.canonicalProblem(item)?.id ?? ''];
    return record?.status === 'solved' ? record.rating : null;
  }
  protected numberedTitle(item: InterviewQuestion): string | null {
    const info = this.releaseInfo(item);
    return info?.studyOrder
      ? `${item.title}. Learning order ${info.studyOrder} of ${this.releaseTotal()}`
      : null;
  }

  protected problemNavigationRows(item: InterviewQuestion, plan: StudyPlanReaderNavigation) {
    const problem = this.canonicalProblem(item);
    if (!problem) return [];
    const context = this.canonicalNavigation(item);
    const learning = this.learningNeighbors()[problem.id] ?? context;
    const toEntry = (link: DsaProblemNavigationLink | undefined, label: string) => {
      if (!link) return undefined;
      const info = this.releaseProblems()[link.problemId];
      const pattern =
        this.catalogPatternByProblemId()[link.problemId] ?? context?.handsOnPatternId ?? '';
      const number = label.startsWith('Learning order')
        ? info?.studyOrder
        : label.startsWith('Interview priority')
          ? info?.interviewRank
          : label === 'Pattern order'
            ? this.patternPositions()[pattern]?.[link.problemId]
            : this.sourcePositions()[link.problemId];
      const meaning = number
        ? label === 'Pattern order'
          ? `Pattern order ${number} in ${this.patternRevealed() ? (this.handsOnPatternTitles()[pattern] ?? 'this pattern') : 'this practice sequence'}`
          : `${label.split(' · ')[0]} ${number} of ${this.releaseTotal()}`
        : label;
      return {
        title: link.title,
        number,
        solved: this.practiceProgress.solvedIds().has(link.problemId),
        meaning,
        route: this.canonicalProblemRoute(link),
        query: this.canonicalProblemQueryParams(link, context?.handsOnPatternId ?? ''),
      };
    };
    const row = (
      label: string,
      neighbors: { previous?: DsaProblemNavigationLink; next?: DsaProblemNavigationLink },
    ) => ({
      label,
      previous: toEntry(neighbors.previous, label),
      next: toEntry(neighbors.next, label),
    });
    const planNeighbors = plan.problemNeighbors();
    const planEntry = (entry: NonNullable<typeof planNeighbors>['next']) =>
      entry
        ? {
            ...entry,
            number: entry.position,
            solved: this.practiceProgress.solvedIds().has(this.planEntryProblemId(entry)),
            meaning: `Study plan step ${entry.position}, day ${entry.query.day}`,
          }
        : undefined;
    const primary = planNeighbors
      ? {
          label: 'Study plan',
          previous: planEntry(planNeighbors.previous),
          next: planEntry(planNeighbors.next),
        }
      : this.catalogNeighbors()[problem.id]
        ? row(this.sourceOrderLabel(), this.catalogNeighbors()[problem.id])
        : !this.returnDestination() && this.navigationContextId() && context
          ? row('Pattern order', context)
          : null;
    const secondary = learning ? row('Learning order', learning) : null;
    const sameNeighbors =
      primary &&
      secondary &&
      ['previous', 'next'].every((direction) => {
        const key = direction as 'previous' | 'next';
        return primary[key]?.route.join('/') === secondary[key]?.route.join('/');
      });
    return [
      ...(primary ? [primary] : []),
      ...(secondary && primary?.label !== 'Learning order' && !sameNeighbors ? [secondary] : []),
    ];
  }

  protected readonly returnLabel = signal('Return to interview practice');
  protected readonly referenceExpanded = signal(false);
  protected readonly studioPilot = computed(() => {
    const item = this.question();
    const problem = item ? this.canonicalProblem(item) : null;
    return !!(
      problem &&
      'schemaVersion' in problem &&
      problem.schemaVersion === 'dsa-problem/v2' &&
      problem.practice
    );
  });
  protected readonly focusStudio = computed(() => {
    const item = this.question();
    return item
      ? usesFocusStudio(
          this.canonicalProblem(item),
          { path: this.pathId(), courseId: this.courseId(), questionId: item.id },
          this.navigationContextId(),
        )
      : false;
  });

  protected returnQueryParams(pattern?: string): Record<string, string> {
    const destination = this.returnDestination();
    return {
      ...(pattern ? { pattern } : {}),
      ...(destination ? { returnTo: this.router.serializeUrl(destination) } : {}),
    };
  }

  protected practiceInstructions(item: InterviewQuestion): string[] {
    if (item.contentType === 'theory' || this.isCodingPractice(item)) return [];
    switch (item.practiceFormat) {
      case 'design':
        return [
          'Clarify the requirements, constraints, and success criteria.',
          'Sketch the components, data flow, interfaces, and ownership boundaries.',
          'Compare a credible alternative, identify failure modes, and explain how you would test the design.',
        ];
      case 'debug':
        return [
          'State what is failing and which observations would distinguish your hypotheses.',
          'Choose the next investigation step and a safe mitigation with a rollback condition.',
          'Explain how you would verify recovery and prevent recurrence.',
        ];
      case 'rehearse':
        return [
          'Answer aloud using a real example when the prompt asks about your experience.',
          'Separate your actions from the team’s work and use only outcomes you can support.',
          'Explain the decision, its result, and what you learned before comparing the reference.',
        ];
      case 'solve':
        return [
          'Write down the input, expected output, constraints, and edge cases.',
          'Implement or outline the requested exercise and explain the state it maintains.',
          'Check the result against concrete cases before opening the reference code and explanation.',
        ];
      default:
        return [];
    }
  }
  private readonly destroyRef = inject(DestroyRef);
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
  protected readonly course = signal<CourseOutline | null>(null);
  protected readonly courseTitle = signal('');
  /** The catalog group the course sits in, for the breadcrumb's group level. */
  protected readonly courseGroup = computed(() =>
    catalogGroupForCourse(this.pathId(), this.courseId()),
  );
  protected readonly handsOnGroup = catalogGroupForCourse('learn', 'hands-on-dsa');

  /**
   * The lesson's place above its course in the sidebar outline: the path, the course's group and the next
   * group. When the next course is listed in the next group, the outline shows it inside that group.
   */
  private lessonNavPlace(nextCourseId: string | null): Pick<SidebarLessonNav, 'path' | 'group' | 'nextGroup' | 'nextCourseInNextGroup'> {
    const pathId = this.pathId();
    const pathTitle = ({ learn: 'Learn', grow: 'Grow', 'look-ahead': 'Look Ahead' } as Record<string, string>)[pathId];
    const group = this.courseGroup();
    const following = group ? nextCatalogGroup(pathId, group.id) : null;
    const groupLink = (target: { id: string; title: string }) => ({
      title: target.title,
      route: ['/', pathId],
      queryParams: { group: target.id },
    });
    return {
      path: pathTitle ? { title: pathTitle, route: ['/', pathId] } : undefined,
      group: group ? groupLink(group) : null,
      nextGroup: following ? groupLink(following) : null,
      nextCourseInNextGroup: !!(nextCourseId && following?.courseIds.includes(nextCourseId)),
    };
  }
  protected readonly question = signal<InterviewQuestion | null>(null);
  protected readonly relatedQuestions = signal(new Map<string, InterviewQuestion>());
  protected readonly sidebarContext = computed<PageSidebarContextValue>(() => {
    const base = this.baseSidebarContext();
    const lessonNav = this.lessonNav();
    return !base.excluded && lessonNav ? { ...base, lessonNav } : base;
  });
  /**
   * A lesson's place in its course for the right sidebar (user review #5): course link,
   * previous / current / next lesson, the next course, and search preset to this lesson.
   */
  protected readonly lessonNav = computed<SidebarLessonNav | null>(() => {
    const item = this.question();
    const course = this.course();
    if (!item || item.contentType !== 'theory' || !course || course.id !== this.courseId()) return null;
    const lessonRoute = (link: ReaderLink) => ['/', this.pathId(), this.courseId(), link.id];
    const previous = this.previousArticle();
    const next = this.nextArticle();
    const nextCourse = this.nextCourse();
    return {
      course: { title: course.title, route: ['/', this.pathId(), this.courseId()] },
      current: navTitle(item),
      previous: previous ? { title: previous.title, route: lessonRoute(previous), queryParams: this.returnQueryParams() } : null,
      next: next ? { title: next.title, route: lessonRoute(next), queryParams: this.returnQueryParams() } : null,
      nextCourse:
        nextCourse?.id && nextCourse.available !== false
          ? { title: nextCourse.title, route: ['/', this.pathId(), nextCourse.id] }
          : null,
      ...this.lessonNavPlace(nextCourse?.id ?? null),
      search: { path: this.pathId(), course: this.courseId(), module: item.moduleId },
    };
  });
  private readonly baseSidebarContext = computed<PageSidebarContextValue>(() => {
    const item = this.question();
    if (!item || this.isCodingPractice(item) || this.studioPilot() || this.focusStudio()) return { excluded: true };
    if (this.pathId() === 'learn' && this.courseId() === 'solid-design-patterns' && item.id === 'mediator-pattern') {
      return { excluded: false, hideNavigation: true };
    }
    const pattern = this.patternLesson(item);
    const foundation = this.foundationLesson(item);
    const teachingGuide = foundation?.teachingGuide ?? foundation?.beginnerGuide ?? pattern?.beginnerGuide;
    // DLV-408: system lessons recall the real interview questions (concept first, the lesson's
    // example as one supporting line), not the guide's scenario exercise.
    if (teachingGuide && !(foundation && lessonPatternDefinition(foundation))) {
      return { excluded: false, recall: [{
        id: `${item.id}-first-steps`,
        prompt: teachingGuide.try,
        answer: teachingGuide.answer,
      }] };
    }
    const checks = pattern ? this.patternChecks(pattern) : foundation ? this.foundationChecks(foundation) : [];
    const recall = checks.length ? checks : this.embeddedUnderstanding(item).map((question) => ({ id: question.id, prompt: question.title, answer: question.interviewAnswer }));
    return { excluded: false, recall: recall.length ? recall : item.followUps.map((followUp, index) => ({ id: `${item.id}-follow-up-${index}`, prompt: followUp.question, answer: followUp.answer })) };
  });
  /**
   * Scene of the learning unit that owns this lesson or practice/round question, shown in the
   * header. DSA problem pages, surprise challenges (the scene would reveal the pattern) and
   * tile courses have none.
   */
  protected readonly unitScene = computed(() => {
    const item = this.question();
    const course = this.course();
    if (!item || !course || course.id !== this.courseId()) return null;
    if (this.isCodingPractice(item) || this.studioPilot() || this.focusStudio()) return null;
    if (this.surpriseMode()) return null;
    return unitSceneForModule(this.pathId(), course, item.moduleId);
  });
  protected readonly moduleTitle = signal('');
  protected readonly previousQuestion = signal<ReaderLink | null>(null);
  protected readonly nextQuestion = signal<ReaderLink | null>(null);
  protected readonly previousArticle = signal<ReaderLink | null>(null);
  protected readonly nextArticle = signal<ReaderLink | null>(null);
  protected readonly previousModule = signal<CourseModule | null>(null);
  protected readonly nextModule = signal<CourseModule | null>(null);
  protected readonly nextModuleFirstQuestion = signal<ReaderLink | null>(null);
  protected readonly isFirstQuestionInModule = signal(false);
  protected readonly isLastQuestionInModule = signal(false);
  protected readonly isLastModuleInCompetency = signal(false);
  protected readonly nextCourse = signal<CatalogItem | null>(null);
  protected readonly error = signal('');
  protected readonly recovery = signal<RecoveryKind>('temporary');
  protected readonly recoveryPreview = signal<RecoveryPreview>({});
  protected readonly retryLoad = new Subject<void>();
  protected readonly surpriseMode = signal(false);
  protected readonly patternRevealed = signal(false);
  protected readonly patternHelpOpen = signal(false);

  /** Back link above a DSA problem title: where the learner came from, or the Hands-On DSA catalog. */
  protected backLabel(): string {
    const label = this.returnLabel();
    if (!this.returnDestination() || label === 'Return to DSA problems') return 'Hands-On DSA problems';
    return label.replace(/^(Return|Back) to /, '').replace(/^./, (first) => first.toUpperCase());
  }

  /** The problem statement as plain text, for the pattern help dialog. */
  protected problemStatement(item: InterviewQuestion): string {
    const text = this.canonicalProblem(item)?.description ?? '';
    return text.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  }
  protected readonly navigationContextId = signal('');
  protected readonly handsOnPatternTitles = signal<Record<string, string>>({});
  private readonly focusStudioNeighbors = signal<
    Record<string, Pick<DsaProblemNavigation, 'previous' | 'next'>>
  >({});
  private readonly catalogNeighbors = signal<
    Record<string, Pick<DsaProblemNavigation, 'previous' | 'next'>>
  >({});
  private readonly catalogPatternByProblemId = signal<Record<string, string>>({});
  protected readonly reviewStatusLabel = reviewStatusLabel;

  /** Index of the walkthrough body paragraph a step table follows; defaults to the last paragraph. */
  protected walkthroughTableAfter(step: QuestionWalkthroughStep): number {
    const last = step.body.length - 1;
    return Math.min(Math.max(step.table?.afterParagraph ?? last, 0), last);
  }

  /** Coding practice is classified by its existing curriculum tags, not by the generic Q&A layout. */
  protected shouldShowHint(item: InterviewQuestion): boolean {
    return (
      item.tags.includes('Common Problem') || item.tags.some((tag) => tag.startsWith('LeetCode'))
    );
  }

  protected isCodingPractice(item: InterviewQuestion): boolean {
    return item.contentType === 'dsa-problem' || this.shouldShowHint(item);
  }

  protected canonicalProblem(item: InterviewQuestion): PatternProblemV1 | null {
    if (item.canonicalProblem) return item.canonicalProblem;
    const reference = item.canonicalProblemRef;
    if (!reference) return null;
    const lesson = [this.question(), ...this.relatedQuestions().values()].find(
      (candidate) => candidate?.id === reference.lessonId,
    );
    if (!lesson || !isPatternLesson(lesson)) return null;
    return lesson.essentialProblems?.find(({ id }) => id === reference.problemId) ?? null;
  }

  protected canonicalNavigation(item: InterviewQuestion): DsaProblemNavigation | null {
    const navigation = (this.canonicalProblem(item) as { navigation?: DsaProblemNavigation } | null)
      ?.navigation;
    if (!navigation) return null;
    const contexts = [navigation, ...(navigation.alternates ?? [])];
    const context =
      contexts.find(({ handsOnPatternId }) => handsOnPatternId === this.navigationContextId()) ??
      (this.focusStudio()
        ? contexts.find(({ handsOnPatternId }) => handsOnPatternId === FOCUS_STUDIO_PATTERN)
        : null) ??
      navigation;
    const problemId = this.canonicalProblem(item)?.id ?? '';
    if (!this.focusStudio()) return context;
    return { ...context, ...this.focusStudioNeighbors()[problemId] };
  }

  protected isCoursePracticePlacement(item: InterviewQuestion): boolean {
    return Boolean(
      item.canonicalProblem &&
      item.relatedArticleId &&
      this.course()?.questions.some((question) => question.id === item.relatedArticleId),
    );
  }

  protected canonicalProblemRoute(link: DsaProblemNavigationLink): string[] {
    return ['/', link.path, link.courseId, link.questionId];
  }

  protected canonicalProblemQueryParams(
    link: DsaProblemNavigationLink,
    fallbackPattern: string,
  ): Record<string, string> {
    return this.returnQueryParams(
      this.catalogPatternByProblemId()[link.problemId] ?? fallbackPattern,
    );
  }

  protected handsOnPatternId(item: InterviewQuestion): string {
    const canonicalPatternId = this.canonicalNavigation(item)?.handsOnPatternId;
    if (canonicalPatternId) return canonicalPatternId;
    return handsOnPatternIdForModule(
      this.courseId(),
      this.course()?.learningUnits ?? [],
      item.moduleId,
    );
  }

  protected handsOnPatternTitle(item: InterviewQuestion): string {
    const navigation = this.canonicalNavigation(item);
    if (!navigation) return this.moduleTitle();
    return this.handsOnPatternTitles()[navigation.handsOnPatternId] ?? navigation.lesson.title;
  }

  protected patternLesson(item: InterviewQuestion): PatternLesson | null {
    return isPatternLesson(item) ? item : null;
  }

  protected foundationLesson(item: InterviewQuestion): FoundationLessonV1 | null {
    return isFoundationLessonV1(item) ? item : null;
  }

  protected hasTheoryExperience(item: InterviewQuestion): boolean {
    return (
      item.contentType === 'theory' &&
      (isPatternLesson(item) || isFoundationLessonV1(item) || Boolean(item.sections?.length))
    );
  }

  protected patternChecks(lesson: PatternLesson): ResolvedPatternCheck[] {
    const questionsById = this.relatedQuestions();
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

  protected patternPractice(lesson: PatternLesson): InterviewQuestion[] {
    const questionsById = this.relatedQuestions();
    return lesson.practice.flatMap((reference) => {
      const question = questionsById.get(reference.questionId);
      return question ? [question] : [];
    });
  }

  protected foundationChecks(lesson: FoundationLessonV1): ResolvedPatternCheck[] {
    const questionsById = this.relatedQuestions();
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

  protected foundationPractice(lesson: FoundationLessonV1): InterviewQuestion[] {
    const questionsById = this.relatedQuestions();
    return (lesson.practice ?? []).flatMap((reference) => {
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
    const resolved = this.relatedQuestions();
    return questionsForArticle.flatMap((question) => {
      const detail = resolved.get(question.id);
      return detail ? [detail] : [];
    });
  }

  /** The two dedicated practice questions remain visible from the article,
   * without turning the Hands-on panel into another intermediate module page. */
  protected handsOnPractice(item: InterviewQuestion): InterviewQuestion[] {
    if (item.contentType !== 'theory') return [];
    const unit = flattenLearningUnits(this.course()?.learningUnits ?? []).find(
      (candidate) => candidate.theoryModuleId === item.moduleId,
    );
    if (!unit?.practiceModuleId) return [];
    return relatedPracticeItems(
      [...this.relatedQuestions().values()],
      item.id,
      unit.practiceModuleId,
    );
  }

  protected questionBankReturnUnit(item: InterviewQuestion): string {
    // Course pages render anchors on the containing unit, not its nested lessons.
    return (this.course()?.learningUnits ?? []).find(
      (unit) => flattenLearningUnits([unit]).some(
        (candidate) => candidate.theoryModuleId === item.moduleId,
      ),
    )?.id ?? '';
  }

  protected questionBankModuleId(item: InterviewQuestion): string | null {
    if (item.contentType !== 'theory') return null;
    const course = this.course();
    if (!course) return null;

    const configuredModuleId = questionModuleIdForArticle(course, item);
    if (configuredModuleId) return configuredModuleId;

    return questionsForModule(course, item.moduleId).length > 0 ? item.moduleId : null;
  }

  protected questionBankCount(item: InterviewQuestion): number {
    return this.questionBankItems(item).length;
  }

  protected questionBankItems(item: InterviewQuestion): ContentItemSummary[] {
    const course = this.course();
    if (!course) return [];
    return questionsForModule(course, this.questionBankModuleId(item));
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

  protected lessonSubtitle(item: InterviewQuestion): string | null {
    return isFoundationLessonV1(item) ? item.subtitle ?? null : null;
  }

  /** Reference code with lines too long for a half-width column (e.g. aligned state tables) gets the full width. */
  protected wideCode(source: string): boolean {
    return source.split('\n').some((line) => line.length > 64);
  }

  /** Short title for the sidebar and sticky navigation; the h1 keeps the full title. */
  protected navTitle(item: InterviewQuestion): string | null {
    const short = item.navTitle?.trim();
    return short && short !== item.title ? short : null;
  }

  /** Sticky reading strip name: the authored short title, else the title before its colon. */
  protected stickyTitle(item: InterviewQuestion): string {
    return this.navTitle(item) ?? this.patternName(item.title);
  }

  protected patternNavigation(item: InterviewQuestion): { label: string; target: string }[] {
    if (isPatternLesson(item)) {
      return [
        ...(item.learningFlow ? [
          { label: 'Before you start', target: 'pattern-start' },
          { label: 'Why & what', target: 'pattern-purpose' },
          { label: 'Small example', target: 'pattern-first-example' },
        ] : []),
        { label: 'What', target: 'pattern-what' },
        { label: 'Why', target: 'pattern-why' },
        { label: 'Recognize', target: 'pattern-where' },
        { label: 'Invariant', target: 'pattern-model' },
        { label: 'Variations', target: 'pattern-variations' },
        { label: 'Template', target: 'pattern-template' },
        { label: 'Visualize', target: 'pattern-visualize' },
        { label: 'Complexity', target: 'pattern-complexity' },
        { label: 'Remember', target: 'pattern-remember' },
        { label: 'Pitfalls', target: 'pattern-pitfalls' },
        { label: 'Use / Avoid', target: 'pattern-guidance' },
        { label: 'Worked', target: 'pattern-worked' },
        { label: 'Understand', target: 'pattern-understand' },
        ...(item.learningFlow ? [{ label: 'Try it', target: 'pattern-independent-practice' }] : []),
        { label: 'Essential', target: 'pattern-essential' },
        { label: 'Continue', target: 'pattern-practice' },
      ];
    }

    if (isFoundationLessonV1(item)) {
      if (lessonPatternDefinition(item)) {
        // DLV-408: one entry per team stage; each stage wrapper is the scroll target.
        return systemLessonStages(item).map((stage) => ({ label: stage.label, target: `stage-${stage.id}` }));
      }
      if (item.learningFlow) {
        return [
          { label: 'Before you start', target: 'foundation-start' },
          { label: 'Why & what', target: 'foundation-why' },
          ...(item.beginnerGuide || item.teachingGuide ? [{ label: 'Worked example', target: 'foundation-example' }] : []),
          ...item.sections.map(section => ({ label: section.navLabel ?? section.heading, target: section.id })),
          { label: 'How it works', target: 'foundation-model' },
          { label: 'Remember', target: 'foundation-remember' },
          { label: 'Common mistakes', target: 'foundation-pitfalls' },
          { label: 'Check understanding', target: 'foundation-understand' },
          { label: 'Try it yourself', target: 'foundation-try' },
          ...((item.practice?.length ?? 0) > 0 ? [{ label: 'More practice', target: 'foundation-practice' }] : []),
        ];
      }
      const introduction = item.teachingGuide || item.beginnerGuide ? [
          { label: 'Before you start', target: 'foundation-start' },
          { label: item.teachingGuide ? 'Worked scenario' : 'Worked example', target: 'foundation-example' },
          { label: item.teachingGuide && this.pathId() === 'look-ahead' ? 'Make the decision' : 'Try it', target: 'foundation-try' },
          { label: 'Remember', target: 'foundation-remember' },
        ] : [];
      return [
        ...introduction,
        ...item.sections.map((section) => ({
          label: section.navLabel ?? section.heading,
          target: section.id,
        })),
        { label: 'How it works', target: 'foundation-model' },
        { label: 'Pitfalls', target: 'foundation-pitfalls' },
        { label: 'Understand', target: 'foundation-understand' },
        { label: 'Recall', target: 'foundation-recall' },
        ...((item.practice?.length ?? 0) > 0
          ? [{ label: 'Continue', target: 'foundation-practice' }]
          : []),
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
    return highlightLearningCode(source);
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

  protected readonly reviewModuleDestination = signal<UrlTree | null>(null);
  private readonly reviewModuleId = signal('');
  protected readonly reviewModuleLabel = computed(() =>
    this.course()?.modules.find((module) => module.id === this.reviewModuleId())?.title
      ?? this.reviewModuleId().split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
  );

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.surpriseMode.set(params.get('mode') === 'surprise');
      this.navigationContextId.set(params.get('pattern') ?? '');
      const returnTo = params.get('returnTo') ?? '';
      this.returnDestination.set(null);
      this.reviewModuleDestination.set(null);
      this.reviewModuleId.set('');
      if (/^\/(search|interview-questions|learn\/hands-on-dsa)(?:\?|$)/.test(returnTo)) {
        try {
          const destination = this.router.parseUrl(returnTo);
          const segments = destination.root.children['primary']?.segments;
          const isDsaCatalog =
            segments?.length === 2 &&
            segments[0].path === 'learn' &&
            segments[1].path === 'hands-on-dsa';
          if (
            isDsaCatalog ||
            (segments?.length === 1 && ['search', 'interview-questions'].includes(segments[0].path))
          ) {
            this.returnDestination.set(destination);
            const { path, course, module, kind, unit } = destination.queryParams;
            if (kind === 'practice' && ['learn', 'grow', 'look-ahead'].includes(path)
              && [course, module, unit || module].every((value) => typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value))) {
              this.reviewModuleId.set(module);
              this.reviewModuleDestination.set(this.router.createUrlTree(['/', path, course], {
                fragment: 'unit-' + (unit || module),
              }));
            }
            this.returnLabel.set(
              isDsaCatalog
                ? 'Return to DSA problems'
                : segments![0].path === 'search'
                  ? this.reviewModuleDestination() ? 'Back to review questions' : 'Return to search results'
                  : 'Return to interview practice',
            );
          }
        } catch {
          /* Ignore malformed return context; the canonical route still works. */
        }
      }
      if (this.navigationIndex) this.buildCatalogNavigation(this.navigationIndex);
    });
    (this.protectedContent
      ? merge(
          this.route.paramMap,
          this.retryLoad.pipe(map(() => this.route.snapshot.paramMap)),
          this.accountChanges.pipe(map(() => this.route.snapshot.paramMap)),
          this.expiryChanges.pipe(map(() => this.route.snapshot.paramMap)),
        )
      : merge(this.route.paramMap, this.retryLoad.pipe(map(() => this.route.snapshot.paramMap)))
    )
      .pipe(
        switchMap((params) => {
          this.course.set(null);
          this.question.set(null);
          this.referenceExpanded.set(false);
          this.patternRevealed.set(false);
          this.patternHelpOpen.set(false);
          this.relatedQuestions.set(new Map());
          this.error.set('');
          this.recoveryPreview.set({});
          this.activeSectionIndex.set(0);
          this.scrolled.set(false);
          const courseId = params.get('courseId') ?? 'core-java';
          const pathId = this.route.snapshot.data['pathId'] ?? 'learn';
          this.courseId.set(courseId);
          this.pathId.set(pathId);
          const questionId = params.get('questionId');
          return this.loadIndexedCanonicalProblem(pathId, courseId, questionId).pipe(
            switchMap((indexed) => {
              if (indexed) return of(indexed);
              return forkJoin({
                catalog: this.contentService.getCatalog(pathId),
                course: this.contentService.getCourseOutline(pathId, courseId),
              }).pipe(switchMap((result) => this.loadSelectedQuestion(result, questionId)));
            }),
            catchError((error) => {
              this.recovery.set(recoveryKind(error, this.recoveryPreview()));
              this.error.set('Unable to open this content.');
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ catalog, course, question, relatedQuestions }) => {
          this.relatedQuestions.set(
            new Map(
              relatedQuestions.map((relatedQuestion) => [relatedQuestion.id, relatedQuestion]),
            ),
          );
          this.displayQuestion(catalog, course, question);
        },
      });
  }

  private loadIndexedCanonicalProblem(pathId: string, courseId: string, questionId: string | null) {
    if (pathId !== 'learn' || !questionId) return of(null);
    return this.contentService.getHandsOnDsaIndex().pipe(
      catchError(() => of(null)),
      switchMap((index) => {
        if (!index) return of(null);
        this.handsOnPatternTitles.set(
          Object.fromEntries(index.groups.map((group) => [group.id, group.title])),
        );
        this.buildCatalogNavigation(index);
        const studioGroup = index.groups.find(({ id }) => id === FOCUS_STUDIO_PATTERN);
        const studioLink = (
          problem: NonNullable<typeof studioGroup>['problems'][number] | undefined,
        ): DsaProblemNavigationLink | undefined =>
          problem
            ? {
                problemId: problem.id,
                title: problem.title,
                path: 'learn',
                courseId: problem.route[1],
                questionId: problem.route[2],
              }
            : undefined;
        this.focusStudioNeighbors.set(
          Object.fromEntries(
            rankedHandsOnDsaIndexProblems(studioGroup ? [studioGroup] : [], 'study-order').map(
              (problem, position, problems) => [
                problem.id,
                {
                  previous: studioLink(problems[position - 1]),
                  next: studioLink(problems[position + 1]),
                },
              ],
            ),
          ),
        );
        const groups = [...index.groups].sort((left, right) => {
          const requestedContext = this.navigationContextId();
          return Number(right.id === requestedContext) - Number(left.id === requestedContext);
        });
        for (const group of groups) {
          const summary = group.problems.find(
            (problem) =>
              problem.route[0] === `/${pathId}` &&
              problem.route[1] === courseId &&
              problem.route[2] === questionId,
          );
          if (!summary) continue;
          this.recoveryPreview.set({title: summary.title});
          return this.contentService.getDsaProblem(summary.id, summary.version).pipe(
            map((problem) => {
              const module: CourseModule = {
                id: group.practiceModuleId,
                order: 1,
                title: `${group.title} Practice`,
                description: group.description,
              };
              const question: InterviewQuestion = {
                id: questionId,
                moduleId: module.id,
                order: 1,
                title: problem.title,
                difficulty: problem.difficulty,
                tags: group.tags,
                interviewAnswer: problem.practice.statement.prompt,
                explanation: [],
                versionNotes: [],
                followUps: [],
                reviewStatus: 'reviewed',
                contentType: 'dsa-problem',
                relatedArticleId: group.lessonId,
                canonicalProblemRef: { problemId: problem.id, lessonId: group.lessonId },
                canonicalProblem: problem,
              };
              const course: CourseOutline = {
                id: group.courseId,
                path: pathId,
                title: group.courseTitle,
                description: group.description,
                version: summary.version,
                modules: [module],
                questions: [
                  {
                    id: question.id,
                    moduleId: question.moduleId,
                    order: question.order,
                    title: question.title,
                    difficulty: question.difficulty,
                    tags: question.tags,
                    contentType: 'dsa-problem',
                    isTheoryArticle: false,
                    detailRef: {
                      kind: 'canonical-dsa',
                      href: `/content/learn/dsa-problems/${problem.id}.json`,
                      version: summary.version,
                    },
                    canonicalProblemRef: question.canonicalProblemRef,
                  },
                ],
                moduleDetailRefs: [],
              };
              return {
                catalog: [{ id: group.courseId, title: group.courseTitle }],
                course,
                question,
                relatedQuestions: [],
              };
            }),
          );
        }
        return of(null);
      }),
    );
  }

  private loadSelectedQuestion(
    result: { catalog: CatalogItem[]; course: CourseOutline },
    questionId: string | null,
  ) {
    const selected = result.course.questions.find(({ id }) => id === questionId);
    if (!selected) return throwError(() => ({ status: 404 }));
    this.recoveryPreview.set({title: selected.title, premium: selected.access?.tier === 'premium', planned: selected.reviewStatus === 'planned'});
    if (selected.detailRef.kind === 'canonical-dsa') {
      return this.contentService
        .getDsaProblem(selected.canonicalProblemRef?.problemId ?? '', selected.detailRef.version)
        .pipe(
          map((problem) => ({
            ...result,
            question: {
              id: selected.id,
              moduleId: selected.moduleId,
              order: selected.order,
              title: problem.title,
              difficulty: problem.difficulty,
              tags: selected.tags,
              interviewAnswer: problem.practice.statement.prompt,
              explanation: [],
              versionNotes: [],
              followUps: [],
              reviewStatus: selected.reviewStatus,
              contentType: 'dsa-problem' as const,
              relatedArticleId: selected.relatedArticleId,
              canonicalProblemRef: selected.canonicalProblemRef,
              canonicalProblem: problem,
            },
            relatedQuestions: [],
          })),
        );
    }
    return this.contentService.getContentItem(selected).pipe(
      switchMap((question) =>
        this.loadRelatedQuestions(result.course, question).pipe(
          map((relatedQuestions) => ({
            ...result,
            question: { ...question, practiceFormat: selected.practiceFormat },
            relatedQuestions,
          })),
        ),
      ),
    );
  }

  private buildCatalogNavigation(index: HandsOnDsaIndex): void {
    this.navigationIndex = index;
    const all = rankedHandsOnDsaIndexProblems(
      filterHandsOnDsaIndexGroups(index.groups, '', 'All', '782', 'study-order'),
      'study-order',
    );
    const learningLink = (
      problem: HandsOnDsaIndexProblemResult | undefined,
    ): DsaProblemNavigationLink | undefined =>
      problem
        ? {
            problemId: problem.id,
            title: problem.title,
            path: problem.route[0].replace(/^\//, '') as DsaProblemNavigationLink['path'],
            courseId: problem.route[1],
            questionId: problem.route[2],
          }
        : undefined;
    this.learningNeighbors.set(
      Object.fromEntries(
        all.map((problem, position) => [
          problem.id,
          {
            previous: learningLink(all[position - 1]),
            next: learningLink(all[position + 1]),
          },
        ]),
      ),
    );
    this.releaseProblems.set(Object.fromEntries(all.map((problem) => [problem.id, problem])));
    this.releaseTotal.set(index.totals.distinctProblems);
    this.patternPositions.set(
      Object.fromEntries(
        index.groups.map((group) => [
          group.id,
          Object.fromEntries(
            (
              filterHandsOnDsaIndexGroups([group], '', 'All', '782', 'pattern-order')[0]
                ?.problems ?? []
            ).map((problem, position) => [problem.id, position + 1]),
          ),
        ]),
      ),
    );
    const destination = this.returnDestination();
    const segments = destination?.root.children['primary']?.segments;
    if (
      !destination ||
      segments?.length !== 2 ||
      segments[0].path !== 'learn' ||
      segments[1].path !== 'hands-on-dsa'
    ) {
      this.catalogNeighbors.set({});
      this.catalogPatternByProblemId.set({});
      return;
    }

    const queryValue = (name: string): string => {
      const value = destination.queryParams[name];
      return Array.isArray(value) ? String(value.at(-1) ?? '') : String(value ?? '');
    };
    const pattern = queryValue('pattern');
    const query = queryValue('q');
    const requestedDifficulty = queryValue('difficulty');
    const difficulty: HandsOnDifficulty = ['All', 'Beginner', 'Intermediate', 'Advanced'].includes(
      requestedDifficulty,
    )
      ? (requestedDifficulty as HandsOnDifficulty)
      : 'All';
    const requestedScope = queryValue('scope');
    const scope: HandsOnTierScope = ['150', '365', '600', '730', '782'].includes(requestedScope)
      ? (requestedScope as HandsOnTierScope)
      : '782';
    const requestedSort =
      queryValue('sort') === 'difficulty' ? 'difficulty-ascending' : queryValue('sort');
    const validSorts: HandsOnSort[] = [
      'pattern-order',
      'title-ascending',
      'title-descending',
      'study-order-descending',
      'interview-rank-descending',
      'study-order',
      'interview-rank',
      'difficulty-ascending',
      'difficulty-descending',
    ];
    let sort: HandsOnSort = validSorts.includes(requestedSort as HandsOnSort)
      ? (requestedSort as HandsOnSort)
      : 'study-order';
    if (difficulty !== 'All' && sort.startsWith('difficulty-')) sort = 'study-order';

    this.sourceOrderLabel.set(
      {
        'interview-rank': 'Interview priority',
        'interview-rank-descending': 'Interview priority · descending',
        'study-order': 'Learning order',
        'study-order-descending': 'Learning order · descending',
        'pattern-order': 'Pattern order',
        'title-ascending': 'Title · A–Z',
        'title-descending': 'Title · Z–A',
        'difficulty-ascending': 'Difficulty · ascending',
        'difficulty-descending': 'Difficulty · descending',
      }[sort],
    );
    const selected = resolveHandsOnDsaIndexGroup(index.groups, pattern);
    const visibleGroups = filterHandsOnDsaIndexGroups(
      selected ? [selected] : index.groups,
      query,
      difficulty,
      scope,
      sort,
    );
    let ordered: HandsOnDsaIndexProblemResult[];
    if (sort === 'pattern-order') {
      const byId = new Map<string, HandsOnDsaIndexProblemResult>();
      for (const group of visibleGroups) {
        for (const problem of group.problems) {
          if (!byId.has(problem.id)) {
            byId.set(problem.id, {
              ...problem,
              patternId: group.id,
              patternTitle: group.title,
              patternPreparationOrder: group.preparationOrder,
            });
          }
        }
      }
      ordered = [...byId.values()];
    } else {
      ordered = rankedHandsOnDsaIndexProblems(visibleGroups, sort);
    }

    const toLink = (
      problem: HandsOnDsaIndexProblemResult | undefined,
    ): DsaProblemNavigationLink | undefined =>
      problem
        ? {
            problemId: problem.id,
            title: problem.title,
            path: problem.route[0].replace(/^\//, '') as DsaProblemNavigationLink['path'],
            courseId: problem.route[1],
            questionId: problem.route[2],
          }
        : undefined;
    this.sourcePositions.set(
      Object.fromEntries(ordered.map((problem, position) => [problem.id, position + 1])),
    );
    this.catalogPatternByProblemId.set(
      Object.fromEntries(ordered.map((problem) => [problem.id, problem.patternId])),
    );
    this.catalogNeighbors.set(
      Object.fromEntries(
        ordered.map((problem, position) => [
          problem.id,
          {
            previous: toLink(ordered[position - 1]),
            next: toLink(ordered[position + 1]),
          },
        ]),
      ),
    );
  }

  private loadRelatedQuestions(course: CourseOutline, question: InterviewQuestion) {
    const ids = new Set<string>();
    if (isPatternLesson(question) || isFoundationLessonV1(question)) {
      for (const reference of question.checks) ids.add(reference.questionId);
      for (const reference of question.practice ?? []) ids.add(reference.questionId);
    }
    if (question.contentType === 'theory') {
      const unit = flattenLearningUnits(course.learningUnits ?? []).find(
        (candidate) => candidate.theoryModuleId === question.moduleId,
      );
      for (const summary of course.questions) {
        if (
          summary.moduleId === unit?.questionModuleId ||
          summary.moduleId === unit?.practiceModuleId ||
          summary.relatedArticleId === question.id
        ) {
          ids.add(summary.id);
        }
      }
    }
    const summaries = course.questions.filter(
      (summary) => ids.has(summary.id) && summary.id !== question.id,
    );
    if (!summaries.length) return of([] as InterviewQuestion[]);
    return forkJoin(
      summaries.map((summary) =>
        summary.detailRef.kind === 'canonical-dsa'
          ? of({
              ...summary,
              interviewAnswer: '',
              explanation: [],
              versionNotes: [],
              followUps: [],
            } as InterviewQuestion)
          : this.contentService.getContentItem(summary).pipe(catchError(() => of(null))),
      ),
    ).pipe(
      map((questions) =>
        questions.filter((candidate): candidate is InterviewQuestion => candidate !== null),
      ),
    );
  }

  private displayQuestion(
    catalog: CatalogItem[],
    course: CourseOutline,
    question: InterviewQuestion,
  ): void {
    this.course.set(course);
    this.courseTitle.set(course.title);
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
    const previousModule = trackModules[currentModuleIndex - 1] ?? null;
    const nextModule = trackModules[currentModuleIndex + 1] ?? null;
    this.previousModule.set(previousModule);
    this.nextModule.set(nextModule);
    this.isLastModuleInCompetency.set(!nextModule);

    const moduleQuestions = course.questions
      .filter(
        (candidate) =>
          candidate.moduleId === question.moduleId &&
          (question.contentType === 'theory'
            ? candidate.contentType === 'theory'
            : candidate.contentType !== 'theory'),
      )
      .sort((left, right) => left.order - right.order);
    const currentIndex = moduleQuestions.findIndex(({ id }) => id === question.id);
    this.isFirstQuestionInModule.set(currentIndex === 0);
    this.isLastQuestionInModule.set(currentIndex === moduleQuestions.length - 1);
    this.previousQuestion.set(this.toReaderLink(moduleQuestions[currentIndex - 1]));
    this.nextQuestion.set(this.toReaderLink(moduleQuestions[currentIndex + 1]));

    const theoryArticles = orderedTheoryArticles(
      course,
      trackModules.map(({ id }) => id),
    );
    const currentArticleIndex = theoryArticles.findIndex(({ id }) => id === question.id);
    this.previousArticle.set(
      question.contentType === 'theory'
        ? this.toReaderLink(theoryArticles[currentArticleIndex - 1])
        : null,
    );
    this.nextArticle.set(
      question.contentType === 'theory'
        ? this.toReaderLink(theoryArticles[currentArticleIndex + 1])
        : null,
    );

    const nextModuleQuestion = nextModule
      ? course.questions
          .filter(({ moduleId }) => moduleId === nextModule.id)
          .sort((left, right) => left.order - right.order)[0]
      : undefined;
    this.nextModuleFirstQuestion.set(this.toReaderLink(nextModuleQuestion));
  }

  private toReaderLink(question: ContentItemSummary | undefined): ReaderLink | null {
    if (!question) return null;
    const moduleTitle =
      this.course()?.modules.find(({ id }) => id === question.moduleId)?.title ?? question.moduleId;
    return { id: question.id, title: navTitle(question), moduleId: question.moduleId, moduleTitle };
  }

  protected parentContextRoute(item: InterviewQuestion): string[] {
    if (this.isCoursePracticePlacement(item))
      return ['/', this.pathId(), this.courseId(), item.relatedArticleId!];
    const lesson = this.canonicalNavigation(item)?.lesson;
    if (lesson) return ['/', lesson.path, lesson.courseId, lesson.questionId];
    const section = this.courseSection(item);
    if (section) {
      return this.sectionRoute(section.id);
    }
    return ['/', this.pathId(), this.courseId(), 'module', item.moduleId];
  }

  protected pathLabel(): string {
    return this.pathId() === 'grow'
      ? 'Grow'
      : this.pathId() === 'look-ahead'
        ? 'Look Ahead'
        : 'Learn';
  }

  protected conceptReviewTitle(item: InterviewQuestion): string {
    return this.canonicalNavigation(item)?.lesson.title ?? this.moduleTitle();
  }

  protected parentContextTitle(item: InterviewQuestion): string {
    if (this.isCoursePracticePlacement(item)) return `Review ${this.moduleTitle()} concept`;
    const lesson = this.canonicalNavigation(item)?.lesson;
    if (lesson) return `Review ${lesson.title} concept`;
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

  protected previousModuleRoute(item: InterviewQuestion, previousModule: CourseModule): string[] {
    if (item.contentType === 'theory') {
      const previousArticle = this.course()
        ?.questions.filter((question) => question.moduleId === previousModule.id)
        .sort((left, right) => right.order - left.order)[0];
      if (previousArticle) return ['/', this.pathId(), this.courseId(), previousArticle.id];
    }
    return ['/', this.pathId(), this.courseId(), 'module', previousModule.id];
  }

  protected previousModuleLabel(item: InterviewQuestion): string {
    return item.contentType === 'theory' ? 'Previous article:' : 'Previous module:';
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
