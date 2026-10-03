import { LearningCode } from '../learning-code';
import { codeLanguageLabel } from '../focus-studio/code-presentation';
import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  ContentItemSummary,
  FoundationLessonV1,
  InterviewQuestion,
  LESSON_PATTERNS,
  lessonPatternDefinition,
  navTitle,
  ResolvedPatternCheck,
  systemLessonStages,
  TheoryCodeTab,
  TheoryOutput,
  TheoryPair,
  TheorySection,
} from '../../content/content.models';
import { CodeCopyButton } from '../code-copy-button/code-copy-button';
import { CodingSolutionTabs } from '../coding-solution-tabs/coding-solution-tabs';
import { InteractiveTheoryVisual } from '../interactive-theory-visual/interactive-theory-visual';
import { InterviewQuestionBankLink } from '../interview-question-bank-link/interview-question-bank-link';
import { PatternUnderstandingChecks } from '../pattern-understanding-checks/pattern-understanding-checks';
import { isReferenceLanguage, ReferenceLanguageService } from '../reference-language';
import { LessonStoryboard } from '../lesson-storyboard/lesson-storyboard';
import { changeCount, DiffRow, fileRows, pairFiles } from './split-diff';

/** One language's version of a code block (a section, Debug pair side or cheat-sheet tab). */
type LanguageTab = Omit<TheoryCodeTab, 'body'>;

/** One file of a Debug pair's split diff. */
interface PairDiffFile {
  label: string;
  language: string;
  broken: LanguageTab | null;
  fixed: LanguageTab | null;
  rows: DiffRow[];
  /** The fix renamed the file (its lines may still be the same). */
  renamed: boolean;
  /** The fix leaves this file alone (only on the broken side, or the same name and lines on both): shown folded. */
  unchanged: boolean;
  removed: number;
  added: number;
}

/** A Debug pair shown as a split diff: the broken program on the left, the fix on the right. */
interface PairDiff {
  /** Java | Python | Go pairs: the tabs that switch the diff (one choice for the page); null for file pairs. */
  languages: LanguageTab[] | null;
  files: PairDiffFile[];
  brokenOutput: TheoryOutput | null;
  fixedOutput: TheoryOutput | null;
}

const DIFF_MARKS = { same: '', del: '−', add: '+' } as const;

const LANGUAGE_NAMES: Record<string, string> = { java: 'Java', python: 'Python', go: 'Go' };

/** First line of a crash report: Java exception, Python traceback or Go panic. */
const CRASH_START = /^(Exception in thread |Traceback \(most recent call last\):|panic: )/;

/** A line that holds nothing but one code element, e.g. a whole Java statement. */
const CODE_ONLY_LINE = /^<code>(?:(?!<\/?code\b)[^])*<\/code>$/;

@Component({
  selector: 'app-foundation-lesson-shell',
  imports: [LearningCode,
    NgTemplateOutlet,
    RouterLink,
    CodeCopyButton,
    CodingSolutionTabs,
    InteractiveTheoryVisual,
    InterviewQuestionBankLink,
    LessonStoryboard,
    PatternUnderstandingChecks,
  ],
  template: `
    @if (isSystem()) {
      <ng-container [ngTemplateOutlet]="systemLesson" />
    } @else {
    @if (lesson().learningFlow; as flow) {
      <article class="foundation-lesson beginner-guide" aria-label="Lesson introduction">
        <section class="lesson-section" id="foundation-start" aria-labelledby="foundation-start-heading">
          <h2 id="foundation-start-heading">Before you start</h2>
          <p>{{ lesson().summary }}</p>
          @if (guide(); as guide) { <p>{{ guide.prerequisite }}</p> }
        </section>
        <section class="lesson-section" id="foundation-why" aria-labelledby="foundation-why-heading">
          <h2 id="foundation-why-heading">Why this matters</h2>
          <p>{{ flow.whyItMatters }}</p>
          <h3 id="foundation-outcomes-heading">What you’ll learn</h3>
          <ul>@for (outcome of lesson().learningOutcomes; track outcome) { <li>{{ outcome }}</li> }</ul>
        </section>
      </article>
    }
    @if (guide(); as guide) {
      <article class="foundation-lesson beginner-guide" [attr.aria-label]="guideLabel()">
        @if (!lesson().learningFlow) {
        <p class="guide-summary">{{ lesson().summary }}</p>
        <section
          class="lesson-section"
          id="foundation-start"
          aria-labelledby="foundation-start-heading"
        >
          <h2 id="foundation-start-heading">Before you start</h2>
          <p>{{ guide.prerequisite }}</p>
        </section>
        }
        <section
          class="lesson-section guided-example"
          id="foundation-example"
          aria-labelledby="foundation-example-heading"
        >
          <h2 id="foundation-example-heading">{{ guide.exampleTitle }}</h2>
          @if (lesson().teachingGuide) {
            <div class="guide-scenario">
              <p>{{ guide.code }}</p>
            </div>
          } @else {
            <section class="foundation-code">
              <header>
                <span>{{ guide.language }}</span>
                <app-code-copy-button [code]="guide.code" />
              </header>
              <pre><code [appLearningCode]="guide.code" [codeLanguage]="guide.language"></code></pre>
            </section>
          }
          <div class="guide-walkthrough">
            <h3>Let's walk through it</h3>
            <ol class="walkthrough-points">
              @for (paragraph of guide.walkthrough; track paragraph) {
                <li [innerHTML]="paragraph"></li>
              }
            </ol>
          </div>
        </section>
        @if (!lesson().learningFlow) {
        <section
          class="lesson-section"
          id="foundation-try"
          aria-labelledby="foundation-try-heading"
        >
          <h2 id="foundation-try-heading">{{ exerciseLabel() }}</h2>
          <p>{{ guide.try }}</p>
          <details class="guide-answer">
            <summary>Check your answer</summary>
            <p>{{ guide.answer }}</p>
          </details>
        </section>
        <section
          class="lesson-section"
          id="foundation-remember"
          aria-labelledby="foundation-remember-heading"
        >
          <h2 id="foundation-remember-heading">What to remember</h2>
          <ul>
            @for (takeaway of guide.takeaways; track takeaway) {
              <li>{{ takeaway }}</li>
            }
          </ul>
          <p>{{ guide.later }}</p>
        </section>
        }
      </article>
      <div id="foundation-reference" class="foundation-reference">
        <ng-container [ngTemplateOutlet]="referenceLesson" />
      </div>
    } @else {
      <ng-container [ngTemplateOutlet]="referenceLesson" />
    }
    }
    <ng-template #systemLesson>
      <article class="foundation-lesson system-lesson" [class.algo-lesson]="isAlgo()" aria-label="Lesson">
        @for (stage of stages(); track stage.id) {
          <section
            class="lesson-stage"
            [class.self-titled-stage]="stage.id === 'overview'"
            [id]="'stage-' + stage.id"
            [attr.data-sidebar-label]="stage.label"
            data-sidebar-level="stage"
            [attr.data-sidebar-stage]="stage.id"
            [attr.aria-label]="stage.label"
          >
            @if (stage.id === slots().scenario) {
              <section class="lesson-section scenario-card" id="lesson-scenario">
                <p class="section-label stage-label"><span>{{ stageLabel(slots().scenario) }}</span>Scenario</p>
                <div class="lesson-one-line">
                  <span class="one-line-label">In one line</span>
                  <p>{{ lesson().summary }}</p>
                </div>
                @if (lesson().learningScenario; as scenario) {
                  <h2 data-sidebar-label="Scenario">Learning scenario: {{ scenario.system }}</h2>
                  <p class="scenario-brands">Think of {{ brandList(scenario.brands) }}.</p>
                  <h3>After this lesson you can</h3>
                  <ul>
                    @for (outcome of lesson().learningOutcomes; track outcome) {
                      <li>{{ outcome }}</li>
                    }
                  </ul>
                  <div class="scenario-why">
                    <div>
                      <h3>Why this scenario?</h3>
                      <p>{{ scenario.why }}</p>
                    </div>
                    @if (lesson().learningFlow; as flow) {
                      <div>
                        <h3>Why it matters</h3>
                        <p>{{ flow.whyItMatters }}</p>
                      </div>
                    }
                  </div>
                } @else {
                  <h2 data-sidebar-label="Scenario">What you will learn</h2>
                  <ul>
                    @for (outcome of lesson().learningOutcomes; track outcome) {
                      <li>{{ outcome }}</li>
                    }
                  </ul>
                  @if (lesson().learningFlow; as flow) {
                    <p><strong>Why it matters:</strong> {{ flow.whyItMatters }}</p>
                  }
                }
              </section>
              <section class="lesson-section" id="foundation-start" aria-labelledby="foundation-start-heading">
                <p class="section-label stage-label"><span>{{ stageLabel(slots().scenario) }}</span>Before you start</p>
                <h2 id="foundation-start-heading" data-sidebar-label="Before you start">Before you start</h2>
                <p>{{ lesson().beforeYouStart ?? guide()?.prerequisite }}</p>
              </section>
            }
            @if (stage.id === slots().keep) {
              <section class="lesson-section takeaways" id="lesson-takeaways" aria-labelledby="lesson-takeaways-heading">
                <p class="section-label stage-label"><span>{{ stageLabel(slots().keep) }}</span>Key takeaways</p>
                <h2 id="lesson-takeaways-heading" data-sidebar-label="Key takeaways">Key takeaways</h2>
                <ul>
                  @for (takeaway of lesson().keyTakeaways; track takeaway) {
                    <li>{{ takeaway }}</li>
                  }
                </ul>
                <aside class="memory-anchor" aria-label="Memory anchor">
                  <span>Memory anchor</span>
                  <strong>{{ lesson().memoryAnchor.phrase }}</strong>
                  <p>{{ lesson().memoryAnchor.mentalModel }}</p>
                  <p><b>Recall cue:</b> {{ lesson().memoryAnchor.retrievalCue }}</p>
                </aside>
                @if (lesson().languageNotes?.length) {
                  <div class="language-notes" aria-label="Language notes">
                    @for (note of lesson().languageNotes; track note.language) {
                      <p><strong>{{ note.language }}</strong>{{ note.note }}</p>
                    }
                  </div>
                }
              </section>
            }
            @for (section of stage.sections; track section.id) {
              @if (!section.sidebar) {
                <ng-container [ngTemplateOutlet]="sectionCard" [ngTemplateOutletContext]="{ $implicit: section, stage: stage.id }" />
              }
            }
            @if (stage.id === slots().mistakes) {
              <section class="lesson-section wide-section" id="foundation-pitfalls" aria-labelledby="foundation-pitfalls-heading">
                <p class="section-label stage-label"><span>{{ stageLabel(slots().mistakes) }}</span>Common mistakes</p>
                <h2 id="foundation-pitfalls-heading" data-sidebar-label="Common mistakes">Common mistakes, in one line each</h2>
                <div class="pitfall-list">
                  @for (pitfall of lesson().pitfalls; track pitfall.failedAssumption) {
                    <article>
                      <h3>{{ pitfall.failedAssumption }}</h3>
                      <p><strong>Symptom:</strong> {{ pitfall.symptom }}</p>
                      <p><strong>Correction:</strong> {{ pitfall.correction }}</p>
                    </article>
                  }
                </div>
              </section>
            }
            @if (stage.id === slots().interview) {
              <section class="lesson-section interview-answer-card" id="lesson-interview-answer" data-sidebar-support aria-labelledby="lesson-interview-answer-heading">
                <p class="section-label stage-label"><span>{{ stageLabel(slots().interview) }}</span>Interview answer</p>
                <h2 id="lesson-interview-answer-heading" data-sidebar-label="Interview answer">Interview answer: say it in one minute</h2>
                <p class="spoken-answer" [innerHTML]="lesson().interviewAnswer"></p>
                @if (lesson().followUps.length) {
                  <h3>Likely follow-up questions</h3>
                  <dl class="follow-ups">
                    @for (followUp of lesson().followUps; track followUp.question) {
                      <dt>{{ followUp.question }}</dt>
                      <dd [innerHTML]="followUp.answer"></dd>
                    }
                  </dl>
                }
              </section>
            }
            @for (section of stage.sections; track section.id) {
              @if (section.sidebar) {
                <ng-container [ngTemplateOutlet]="sectionCard" [ngTemplateOutletContext]="{ $implicit: section, stage: stage.id }" />
              }
            }
            @if (stage.id === slots().prove) {
              <section class="lesson-section wide-section" id="foundation-understand" aria-labelledby="foundation-understand-heading">
                <p class="section-label stage-label"><span>{{ stageLabel(slots().prove) }}</span>Check understanding</p>
                <h2 id="foundation-understand-heading" data-sidebar-label="Check understanding">Check your understanding</h2>
                <app-pattern-understanding-checks [checks]="checks()" />
                @if (questionModuleId(); as moduleId) {
                  @if (questionCount() > 0) {
                    <app-interview-question-bank-link
                      [pathId]="pathId()"
                      [courseId]="courseId()"
                      [moduleId]="moduleId"
                      [returnUnit]="returnUnit()"
                      [questionCount]="questionCount()"
                      [practiceItems]="questionItems()"
                    />
                  }
                }
              </section>
              @if (lesson().learningFlow; as flow) {
                <section id="foundation-try" class="lesson-section" data-sidebar-support aria-labelledby="foundation-try-heading">
                  <p class="section-label stage-label"><span>{{ stageLabel(slots().prove) }}</span>Try it yourself</p>
                  <h2 id="foundation-try-heading" data-sidebar-label="Try it yourself">Try it yourself</h2>
                  @for (exercise of exercises(); track exercise.prompt; let index = $index) {
                    <div class="try-exercise">
                      <h3>Exercise {{ index + 1 }}</h3>
                      <p>{{ exercise.prompt }}</p>
                      @if (exercise.hint) {
                        <details class="guide-answer"><summary>Show a hint</summary><p>{{ exercise.hint }}</p></details>
                      }
                      <details class="guide-answer"><summary>Check your answer</summary><p class="practice-answer">{{ exercise.answer }}</p></details>
                    </div>
                  }
                  <details class="guide-answer">
                    <summary>Practice explaining your choice</summary>
                    <p>{{ lesson().interviewRecall.prompt }}</p>
                    <details><summary>Compare your explanation</summary>
                      <ol>@for (step of lesson().interviewRecall.answerFramework; track step) { <li>{{ step }}</li> }</ol>
                    </details>
                  </details>
                </section>
              }
              @if (practiceItems().length && !hasLadder()) {
                <section id="foundation-practice" class="lesson-section practice-section" aria-labelledby="foundation-practice-heading">
                  <p class="section-label stage-label"><span>{{ stageLabel(slots().prove) }}</span>More practice</p>
                  <h2 id="foundation-practice-heading" data-sidebar-label="More practice">Practice with intent</h2>
                  <div class="practice-grid">
                    @for (item of practiceItems(); track item.id) {
                      <a [routerLink]="['/', pathId(), courseId(), item.id]">
                        <span>{{ item.difficulty }} · {{ practiceVariation(item.id) }}</span>
                        <strong>{{ navTitle(item) }}</strong>
                        <p [innerHTML]="practiceReason(item.id)"></p>
                        <b aria-hidden="true">Start problem</b>
                      </a>
                    }
                  </div>
                </section>
              }
            }
          </section>
        }
      </article>
    </ng-template>
    <ng-template #sectionCard let-section let-stage="stage">
      <section
        class="lesson-section wide-section"
        [class.text-section]="
          !section.code &&
          !section.visual &&
          !section.solutions?.length &&
          section.body.length > 1
        "
        [class.three-explanations]="section.body.length === 3"
        [class.code-section]="section.code && !section.solutions?.length && !section.visual && !stage"
        [class.system-code-section]="stage && (section.code || section.codeTabs?.length) && !section.solutions?.length"
        [class.quick-revision]="stage && section.sidebar"
        [class.invariants-section]="stage && section.navLabel === 'Invariants'"
        [id]="section.id"
        [attr.data-sidebar-stage]="stage ?? null"
        [attr.data-sidebar-support]="section.sidebar ? '' : null"
      >
        @if (section.problem; as problem) {
          <!-- algo-pattern-v1 Problem first: the problem's name, level and source, then the problem card on its own. -->
          <p class="section-label stage-label problem-label">
            <span>{{ stageLabel(stage) }}</span>{{ problem.title }}
            <em class="difficulty-pill" [attr.data-level]="problem.difficulty.toLowerCase()">{{ problem.difficulty }}</em>
            @if (problem.source) {
              <em class="problem-source">{{ problem.source }}</em>
            }
          </p>
          <h2 class="visually-hidden" [attr.data-sidebar-label]="stage ? section.navLabel : null">{{ section.heading }}</h2>
          <div class="problem-card">
            <p><strong>The problem.</strong> {{ problem.statement }}</p>
            @if (problem.example) {
              <p class="problem-example" [innerHTML]="problem.example"></p>
            }
          </div>
        } @else {
        @if ((stage === 'overview' || isAlgo()) && section.navLabel === stageLabel(stage)) {
          <!-- The stage title already says it (e.g. Overview, Brief); no repeated label line. -->
        } @else if (stage) {
          <p class="section-label stage-label"><span>{{ stageLabel(stage) }}</span>{{ section.navLabel }}</p>
        } @else {
          <p class="section-label">{{ section.navLabel }}</p>
        }
        <h2 [attr.data-sidebar-label]="stage ? section.navLabel : null">{{ section.heading }}</h2>
        }
        @if (section.visualBeside && section.visual?.type === 'storyboard') {
          <!-- A storyboard with the explanation beside it: in Problem first (and a concept-v1 Concept story) a short
               explanation and the cost line (sticky Pause/Play bar), elsewhere one bullet per body paragraph. -->
          <app-lesson-storyboard [visual]="section.visual" [variant]="isStory(section, stage) ? 'story' : 'scene'" [beside]="true">
            @if (isStory(section, stage)) {
              @for (paragraph of section.body; track paragraph) {
                <div class="explanation-content" [innerHTML]="cardPoints(paragraph, true)"></div>
              }
              @if (section.cost) {
                <p class="storyboard-cost" [innerHTML]="section.cost"></p>
              }
            } @else {
              <ul class="beside-points">
                @for (point of section.body; track point) {
                  <li [innerHTML]="point"></li>
                }
              </ul>
            }
          </app-lesson-storyboard>
          <ng-container [ngTemplateOutlet]="transcript" [ngTemplateOutletContext]="{ $implicit: section }" />
        } @else if (stage && (section.code || section.codeTabs?.length) && !section.solutions?.length) {
          <ng-container [ngTemplateOutlet]="systemCode" [ngTemplateOutletContext]="{ $implicit: section, stage: stage }" />
          <ng-container [ngTemplateOutlet]="sectionCards" [ngTemplateOutletContext]="{ $implicit: section }" />
        } @else {
        @if (section.code; as code) {
          @if (!section.solutions?.length) {
            <div class="section-code-column">
            <section class="foundation-code">
              <header>
                <span>{{ code.title }}</span>
                <div>
                  <small>{{ languageLabel(code.language) }}</small
                  ><app-code-copy-button [code]="code.source" />
                </div>
              </header>
              <pre><code [appLearningCode]="code.source" [codeLanguage]="code.language"></code></pre>
            </section>
            </div>
          }
        }
        <div class="section-explanation">
          @if (section.navLabel === 'References') {
            @for (paragraph of referenceParagraphs(section.body); track paragraph) {
              <div class="explanation-content" [innerHTML]="cardPoints(paragraph)"></div>
            }
            @if (referenceLinks(section.body).length) {
              <div class="reference-links-card">
                <ul>
                  @for (link of referenceLinks(section.body); track link) {
                    <li [innerHTML]="link"></li>
                  }
                </ul>
              </div>
            }
          } @else {
            @for (paragraph of section.body; track paragraph; let index = $index) {
              @if (stage && promptText(paragraph); as prompt) {
                <figure class="ai-prompt">
                  <figcaption>Prompt to give your AI tool<app-code-copy-button [code]="prompt" /></figcaption>
                  <p>{{ prompt }}</p>
                </figure>
              } @else {
                <div class="explanation-content" [innerHTML]="cardPoints(paragraph, !!stage)"></div>
              }
              @if (section.table && !besideVisual(section) && tableAfter(section) === index) {
                <ng-container [ngTemplateOutlet]="lessonTable" [ngTemplateOutletContext]="{ $implicit: section.table }" />
              }
            }
          }
          @if (section.callout?.title !== 'Example boundary' && section.visual?.type !== 'storyboard' && section.callout; as callout) {
            <aside class="lesson-callout" [attr.data-callout-type]="callout.type">
              <strong>{{ callout.title }}</strong>
              <p [innerHTML]="callout.text"></p>
            </aside>
          }
        </div>
        <ng-container [ngTemplateOutlet]="sectionCards" [ngTemplateOutletContext]="{ $implicit: section }" />
        @if (stage && section.cheatSheet; as sheet) {
          <div class="cheat-sheet">
            @if (isLanguageTabs(sheet.codeTabs)) {
              <div class="cheat-template">
                <h3>The template</h3>
                <ng-container [ngTemplateOutlet]="languageCode" [ngTemplateOutletContext]="{ $implicit: sheet.codeTabs, key: section.id + '-template', label: 'Cheat sheet template' }" />
              </div>
            }
            <ol class="cheat-tiles">
              @for (tile of sheet.tiles; track tile.title; let index = $index, last = $last) {
                <li class="cheat-tile" [class.cheat-traps]="last">
                  <h3><span class="cheat-number" aria-hidden="true">{{ index + 1 }}</span>{{ tile.title }}</h3>
                  <ul>
                    @for (point of tile.points; track point) {
                      <li [innerHTML]="point"></li>
                    }
                  </ul>
                </li>
              }
            </ol>
            <div class="cheat-facts">
              <h3>Exact facts</h3>
              <ul>
                @for (fact of sheet.facts; track fact) {
                  <li [innerHTML]="fact"></li>
                }
              </ul>
            </div>
          </div>
        }
        @if (stage && section.pairs?.length) {
          <ol class="pair-list">
            @for (pair of section.pairs; track pair.n) {
              <li class="pair-card" [id]="section.id + '-' + pair.n">
                <div class="pair-head">
                  <h3><span class="pair-number" aria-hidden="true">{{ pair.n }}</span>{{ pair.title }}</h3>
                  @for (paragraph of pair.problem; track paragraph) {
                    <div class="explanation-content" [innerHTML]="cardPoints(paragraph, true)"></div>
                  }
                </div>
                @if (pairDiff(section, pair); as diff) {
                  <ng-container [ngTemplateOutlet]="splitDiffPair" [ngTemplateOutletContext]="{ $implicit: diff, section: section, pair: pair }" />
                } @else {
                <div class="pair-grid">
                    <section class="pair-side pair-broken" [attr.aria-label]="pairLabel(section, 'broken') + ': ' + pair.title">
                      <div class="pair-side-head">
                        <p class="pair-label">{{ pairLabel(section, 'broken') }}</p>
                        @if (pair.broken.title) {
                          <p class="pair-fix-title">{{ pair.broken.title }}</p>
                        }
                        @for (paragraph of pair.broken.body; track paragraph) {
                          <div class="explanation-content" [innerHTML]="cardPoints(paragraph, true)"></div>
                        }
                      </div>
                      @if (isLanguageTabs(pair.broken.codeTabs)) {
                      <div class="pair-side-code">
                        <ng-container [ngTemplateOutlet]="languageCode" [ngTemplateOutletContext]="{ $implicit: pair.broken.codeTabs, key: sideKey(section, pair, 'broken'), label: pairLabel(section, 'broken') + ': ' + pair.title }" />
                      </div>
                      } @else if (pair.broken.codeTabs?.length) {
                      <div class="pair-side-code">
                        @if (pair.broken.codeTabs.length > 1) {
                          <div class="code-tabs" role="tablist" [attr.aria-label]="pairLabel(section, 'broken') + ': files'">
                            @for (tab of pair.broken.codeTabs; track tab.id; let index = $index) {
                              <button
                                type="button"
                                role="tab"
                                [id]="sideKey(section, pair, 'broken') + '-tab-' + tab.id"
                                [attr.aria-selected]="tabIndex(sideKey(section, pair, 'broken'), pair.broken.codeTabs.length) === index"
                                [attr.aria-controls]="sideKey(section, pair, 'broken') + '-panel'"
                                [attr.tabindex]="tabIndex(sideKey(section, pair, 'broken'), pair.broken.codeTabs.length) === index ? 0 : -1"
                                (click)="setTab(sideKey(section, pair, 'broken'), index)"
                                (keydown)="moveTab($event, sideKey(section, pair, 'broken'), pair.broken.codeTabs.length)"
                              >{{ tab.title }}</button>
                            }
                          </div>
                        }
                        <div [attr.role]="pair.broken.codeTabs.length > 1 ? 'tabpanel' : null" [id]="sideKey(section, pair, 'broken') + '-panel'">
                          <ng-container [ngTemplateOutlet]="codeBlock" [ngTemplateOutletContext]="{ $implicit: sideTab(section, pair, 'broken') }" />
                        </div>
                      </div>
                      }
                      @if (pair.broken.output || pair.broken.table) {
                        <div class="pair-side-output">
                          @if (pair.broken.table; as table) {
                            <ng-container [ngTemplateOutlet]="lessonTable" [ngTemplateOutletContext]="{ $implicit: table }" />
                          }
                          @if (pair.broken.output; as output) {
                            <ng-container [ngTemplateOutlet]="runConsole" [ngTemplateOutletContext]="{ $implicit: output }" />
                          }
                        </div>
                      }
                    </section>
                    <section class="pair-side pair-fixed" [attr.aria-label]="pairLabel(section, 'fixed') + ': ' + pair.title">
                      <div class="pair-side-head">
                        <p class="pair-label">{{ pairLabel(section, 'fixed') }}</p>
                        @if (pair.fixed.title) {
                          <p class="pair-fix-title">{{ pair.fixed.title }}</p>
                        }
                        @for (paragraph of pair.fixed.body; track paragraph) {
                          <div class="explanation-content" [innerHTML]="cardPoints(paragraph, true)"></div>
                        }
                      </div>
                      @if (isLanguageTabs(pair.fixed.codeTabs)) {
                      <div class="pair-side-code">
                        <ng-container [ngTemplateOutlet]="languageCode" [ngTemplateOutletContext]="{ $implicit: pair.fixed.codeTabs, key: sideKey(section, pair, 'fixed'), label: pairLabel(section, 'fixed') + ': ' + pair.title }" />
                      </div>
                      } @else if (pair.fixed.codeTabs?.length) {
                      <div class="pair-side-code">
                        @if (pair.fixed.codeTabs.length > 1) {
                          <div class="code-tabs" role="tablist" [attr.aria-label]="pairLabel(section, 'fixed') + ': files'">
                            @for (tab of pair.fixed.codeTabs; track tab.id; let index = $index) {
                              <button
                                type="button"
                                role="tab"
                                [id]="sideKey(section, pair, 'fixed') + '-tab-' + tab.id"
                                [attr.aria-selected]="tabIndex(sideKey(section, pair, 'fixed'), pair.fixed.codeTabs.length) === index"
                                [attr.aria-controls]="sideKey(section, pair, 'fixed') + '-panel'"
                                [attr.tabindex]="tabIndex(sideKey(section, pair, 'fixed'), pair.fixed.codeTabs.length) === index ? 0 : -1"
                                (click)="setTab(sideKey(section, pair, 'fixed'), index)"
                                (keydown)="moveTab($event, sideKey(section, pair, 'fixed'), pair.fixed.codeTabs.length)"
                              >{{ tab.title }}</button>
                            }
                          </div>
                        }
                        <div [attr.role]="pair.fixed.codeTabs.length > 1 ? 'tabpanel' : null" [id]="sideKey(section, pair, 'fixed') + '-panel'">
                          <ng-container [ngTemplateOutlet]="codeBlock" [ngTemplateOutletContext]="{ $implicit: sideTab(section, pair, 'fixed') }" />
                        </div>
                      </div>
                      }
                      @if (pair.fixed.output || pair.fixed.table) {
                        <div class="pair-side-output">
                          @if (pair.fixed.table; as table) {
                            <ng-container [ngTemplateOutlet]="lessonTable" [ngTemplateOutletContext]="{ $implicit: table }" />
                          }
                          @if (pair.fixed.output; as output) {
                            <ng-container [ngTemplateOutlet]="runConsole" [ngTemplateOutletContext]="{ $implicit: output }" />
                          }
                        </div>
                      }
                    </section>
                </div>
                }
              </li>
            }
          </ol>
        }
        @if (stage && section.practiceTimer; as timer) {
          <div class="practice-timer" role="group" [attr.aria-label]="'Speaking timer, ' + formatTime(timer.seconds)">
            @if (timer.prompt) {
              <p class="practice-timer-prompt">{{ timer.prompt }}</p>
            }
            <p class="practice-timer-clock" aria-hidden="true">{{ formatTime(timerRemaining(section.id, timer.seconds)) }}</p>
            <div class="practice-timer-actions">
              <button type="button" (click)="toggleTimer(section.id, timer.seconds)">{{ timerRunning(section.id) ? 'Pause' : 'Start' }}</button>
              <button type="button" (click)="resetTimer(section.id)">Reset</button>
            </div>
            <p class="visually-hidden" aria-live="polite">{{ timerAnnouncement(section.id) }}</p>
          </div>
        }
        @if (stage && section.ladder?.length) {
          <ng-container [ngTemplateOutlet]="problemLadder" [ngTemplateOutletContext]="{ $implicit: section }" />
        }
        @if (stage && section.spot; as drill) {
          <ng-container [ngTemplateOutlet]="spotDrill" [ngTemplateOutletContext]="{ $implicit: drill, section: section }" />
        }
        @if (section.solutions?.length) {
          <app-coding-solution-tabs
            [solutions]="section.solutions!"
            [pseudocode]="section.code ?? null"
            [showPractice]="section.showPractice !== false"
            [useLanguageThemes]="section.useLanguageThemes === true"
          />
        }
        @if (besideVisual(section)) {
          <ng-container [ngTemplateOutlet]="traceBeside" [ngTemplateOutletContext]="{ $implicit: section }" />
        } @else if (section.visual?.type === 'storyboard') {
          <ng-container [ngTemplateOutlet]="storyboardVisual" [ngTemplateOutletContext]="{ $implicit: section }" />
        } @else if (section.visual; as visual) {
          <figure class="concept-visual">
            @if (visual.type === 'interactive') {
              <app-interactive-theory-visual [visual]="visual" />
            } @else {
              <img [src]="visual.assetPath" [alt]="visual.alt" />
            }
            @if (visual.caption; as caption) {
              <figcaption>{{ caption }}</figcaption>
            }
          </figure>
          @if (section.visualTranscript?.length) {
            <details class="visual-transcript">
              <summary>Read the complete visual transcript</summary>
              <ol>
                @for (step of section.visualTranscript; track step) {
                  <li>{{ step }}</li>
                }
              </ol>
            </details>
          }
        }
        }
      </section>
    </ng-template>
    <!-- DLV-408: code with its run console on the left, the explanation beside it, tables and visuals below. -->
    <ng-template #systemCode let-section let-stage="stage">
      @if (isLanguageTabs(section.codeTabs)) {
        <!-- DSA core courses: the same program in Java, Python and Go; one language choice for the page. -->
        <div class="code-pair" [class.code-pair-centered]="lineCount(languageTab(section.codeTabs).source) <= 30">
          <div class="code-pair-code">
            <ng-container [ngTemplateOutlet]="languageCode" [ngTemplateOutletContext]="{ $implicit: section.codeTabs, key: section.id, label: section.heading }" />
          </div>
          <div class="section-explanation code-pair-text">
            @for (paragraph of section.body; track paragraph) {
              <div class="explanation-content" [innerHTML]="cardPoints(paragraph, true)"></div>
            }
            @if (section.callout?.title !== 'Example boundary' && section.callout; as callout) {
              <aside class="lesson-callout" [attr.data-callout-type]="callout.type">
                <strong>{{ callout.title }}</strong>
                <p [innerHTML]="callout.text"></p>
              </aside>
            }
          </div>
        </div>
      } @else if (section.codeTabs?.length) {
        @for (paragraph of section.body; track paragraph) {
          <div class="explanation-content section-intro" [innerHTML]="cardPoints(paragraph, true)"></div>
        }
        <div class="code-tabs" role="tablist" [attr.aria-label]="section.heading + ': files'">
          @for (tab of section.codeTabs; track tab.id; let index = $index) {
            <button
              type="button"
              role="tab"
              [id]="section.id + '-tab-' + tab.id"
              [attr.aria-selected]="activeTab(section) === index"
              [attr.aria-controls]="section.id + '-panel'"
              [attr.tabindex]="activeTab(section) === index ? 0 : -1"
              (click)="selectTab(section, index)"
              (keydown)="tabKeydown($event, section)"
            >{{ tab.title }}</button>
          }
        </div>
        @if (currentTab(section); as tab) {
          <div
            class="code-pair"
            [class.code-pair-centered]="lineCount(tab.source) <= 30"
            role="tabpanel"
            [id]="section.id + '-panel'"
            [attr.aria-labelledby]="section.id + '-tab-' + tab.id"
          >
            <div class="code-pair-code">
              <ng-container [ngTemplateOutlet]="codeBlock" [ngTemplateOutletContext]="{ $implicit: tab }" />
            </div>
            <div class="section-explanation code-pair-text">
              @for (paragraph of tab.body; track paragraph) {
                <div class="explanation-content" [innerHTML]="cardPoints(paragraph, true)"></div>
              }
            </div>
          </div>
        }
      } @else {
        <div class="code-pair" [class.code-pair-centered]="lineCount(section.code.source) <= 30">
          <div class="code-pair-code">
            <ng-container [ngTemplateOutlet]="codeBlock" [ngTemplateOutletContext]="{ $implicit: section.code }" />
            @if (section.output; as output) {
              <ng-container [ngTemplateOutlet]="runConsole" [ngTemplateOutletContext]="{ $implicit: output }" />
            }
          </div>
          <div class="section-explanation code-pair-text">
            @for (paragraph of section.body; track paragraph) {
              @if (promptText(paragraph); as prompt) {
                <figure class="ai-prompt">
                  <figcaption>Prompt to give your AI tool<app-code-copy-button [code]="prompt" /></figcaption>
                  <p>{{ prompt }}</p>
                </figure>
              } @else {
                <div class="explanation-content" [innerHTML]="cardPoints(paragraph, true)"></div>
              }
            }
            @if (section.callout?.title !== 'Example boundary' && section.callout; as callout) {
              <aside class="lesson-callout" [attr.data-callout-type]="callout.type">
                <strong>{{ callout.title }}</strong>
                <p [innerHTML]="callout.text"></p>
              </aside>
            }
          </div>
        </div>
      }
      @if (besideVisual(section)) {
        <ng-container [ngTemplateOutlet]="traceBeside" [ngTemplateOutletContext]="{ $implicit: section }" />
      } @else {
      @if (section.table; as table) {
        <ng-container [ngTemplateOutlet]="lessonTable" [ngTemplateOutletContext]="{ $implicit: table }" />
      }
      @if (section.visual?.type === 'storyboard') {
        <ng-container [ngTemplateOutlet]="storyboardVisual" [ngTemplateOutletContext]="{ $implicit: section }" />
      } @else if (section.visual; as visual) {
        <figure class="concept-visual">
          @if (visual.type === 'interactive') {
            <app-interactive-theory-visual [visual]="visual" />
          } @else {
            <img [src]="visual.assetPath" [alt]="visual.alt" />
          }
          @if (visual.caption; as caption) {
            <figcaption>{{ caption }}</figcaption>
          }
        </figure>
        @if (section.visualTranscript?.length) {
          <details class="visual-transcript">
            <summary>Read the complete visual transcript</summary>
            <ol>
              @for (step of section.visualTranscript; track step) {
                <li>{{ step }}</li>
              }
            </ol>
          </details>
        }
      }
      }
    </ng-template>
    <!-- Debug pairs as a split diff, as a code review shows them: rows aligned from the same first line, removed
         lines red (−) on the broken side, added lines green (+) on the fixed side, each side's console below it.
         Java | Python | Go pairs follow the page's language choice. Stacks into broken-then-fixed in a narrow column. -->
    <ng-template #splitDiffPair let-diff let-section="section" let-pair="pair">
      @if (diff.languages; as tabs) {
        <div class="code-tabs language-tabs diff-language-tabs" role="tablist" [attr.aria-label]="pair.title + ': language'">
          @for (tab of tabs; track tab.id) {
            <button
              type="button"
              role="tab"
              [id]="pairKey(section, pair) + '-lang-' + tab.language"
              [attr.aria-selected]="languageTab(tabs) === tab"
              [attr.aria-controls]="pairKey(section, pair) + '-lang-panel'"
              [attr.tabindex]="languageTab(tabs) === tab ? 0 : -1"
              (click)="chooseLanguage(tab.language, $event)"
              (keydown)="languageKeydown($event, tabs)"
            >{{ languageName(tab.language) }}</button>
          }
        </div>
      }
      <div
        class="split-diff"
        [id]="pairKey(section, pair) + (diff.languages ? '-lang-panel' : '-diff')"
        [attr.role]="diff.languages ? 'tabpanel' : 'group'"
        [attr.aria-labelledby]="diff.languages ? pairKey(section, pair) + '-lang-' + languageTab(diff.languages).language : null"
        [attr.aria-label]="diff.languages ? null : pair.title + ': ' + pairLabel(section, 'broken') + ' and ' + pairLabel(section, 'fixed')"
      >
        <div class="d-head d-l">
          <p class="pair-label">{{ pairLabel(section, 'broken') }}</p>
          @for (paragraph of pair.broken.body; track paragraph) {
            <div class="explanation-content" [innerHTML]="cardPoints(paragraph, true)"></div>
          }
        </div>
        <div class="d-head d-r">
          <p class="pair-label">{{ pairLabel(section, 'fixed') }}</p>
          @if (pair.fixed.title) {
            <p class="pair-fix-title">{{ pair.fixed.title }}</p>
          }
          @for (paragraph of pair.fixed.body; track paragraph) {
            <div class="explanation-content" [innerHTML]="cardPoints(paragraph, true)"></div>
          }
        </div>
        @for (file of diff.files; track file.label) {
          @if (file.unchanged && diff.files.length > 1) {
            <details class="d-shared d-l">
              <summary><span>{{ file.label }}</span> <small>Not changed by the fix</small></summary>
              <ng-container [ngTemplateOutlet]="codeBlock" [ngTemplateOutletContext]="{ $implicit: file.broken ?? file.fixed }" />
            </details>
          } @else {
            <div class="d-file d-l">
              @if (file.broken; as code) {
                <span>{{ code.title }}</span>
                <div><small>{{ languageLabel(code.language) }}</small><app-code-copy-button [code]="code.source" /></div>
              } @else {
                <span class="d-file-none">No file before the fix</span>
              }
            </div>
            <div class="d-file d-r">
              @if (file.fixed; as code) {
                <span>{{ code.title }}@if (file.removed || file.added) {<small class="d-count" [attr.aria-label]="file.added + ' lines added, ' + file.removed + ' removed'"><b class="d-count-add">+{{ file.added }}</b><b class="d-count-del">−{{ file.removed }}</b></small>} @else if (file.renamed) {<small class="d-count">renamed</small>}</span>
                <div><small>{{ languageLabel(code.language) }}</small><app-code-copy-button [code]="code.source" /></div>
              } @else {
                <span class="d-file-none">Unchanged</span>
              }
            </div>
            @for (row of file.rows; track $index) {
              <ng-container [ngTemplateOutlet]="diffCell" [ngTemplateOutletContext]="{ $implicit: row.left, side: 'l', language: file.language }" />
              <ng-container [ngTemplateOutlet]="diffCell" [ngTemplateOutletContext]="{ $implicit: row.right, side: 'r', language: file.language }" />
            }
            <div class="d-end d-l" aria-hidden="true"></div>
            <div class="d-end d-r" aria-hidden="true"></div>
          }
        }
        <div class="d-out d-l">
          @if (pair.broken.table; as table) {
            <ng-container [ngTemplateOutlet]="lessonTable" [ngTemplateOutletContext]="{ $implicit: table }" />
          }
          @if (diff.brokenOutput; as output) {
            <ng-container [ngTemplateOutlet]="runConsole" [ngTemplateOutletContext]="{ $implicit: output }" />
          }
        </div>
        <div class="d-out d-r">
          @if (pair.fixed.table; as table) {
            <ng-container [ngTemplateOutlet]="lessonTable" [ngTemplateOutletContext]="{ $implicit: table }" />
          }
          @if (diff.fixedOutput; as output) {
            <ng-container [ngTemplateOutlet]="runConsole" [ngTemplateOutletContext]="{ $implicit: output }" />
          }
        </div>
      </div>
    </ng-template>
    <ng-template #diffCell let-cell let-side="side" let-language="language">
      @if (cell) {
        <div class="d-row" [class]="'d-row d-' + side + ' d-' + cell.kind">
          <span class="d-num" aria-hidden="true">{{ cell.line }}</span>
          <span class="d-mark" aria-hidden="true">{{ diffMark(cell.kind) }}</span>
          @if (cell.kind !== 'same') {
            <span class="visually-hidden">{{ cell.kind === 'del' ? 'Removed line ' + cell.line + ': ' : 'Added line ' + cell.line + ': ' }}</span>
          }
          <code class="d-code" [appLearningCode]="cell.text || ' '" [codeLanguage]="language"></code>
        </div>
      } @else {
        <div class="d-row" [class]="'d-row d-' + side + ' d-fill'" aria-hidden="true"></div>
      }
    </ng-template>
    <!-- A storyboard animation on its own (played in view), the key idea under it, then its transcript. -->
    <ng-template #storyboardVisual let-section>
      <app-lesson-storyboard [visual]="section.visual" />
      @if (section.callout?.title !== 'Example boundary' && section.callout; as callout) {
        <aside class="lesson-callout storyboard-callout" [attr.data-callout-type]="callout.type">
          <strong>{{ callout.title }}</strong>
          <p [innerHTML]="callout.text"></p>
        </aside>
      }
      <ng-container [ngTemplateOutlet]="transcript" [ngTemplateOutletContext]="{ $implicit: section }" />
    </ng-template>
    <ng-template #transcript let-section>
      @if (section.visualTranscript?.length) {
        <details class="visual-transcript">
          <summary>Read the complete visual transcript</summary>
          <ol>
            @for (step of section.visualTranscript; track step) {
              <li>{{ step }}</li>
            }
          </ol>
        </details>
      }
    </ng-template>
    <!-- algo-pattern-v1: a trace table beside its animation (stacked in a narrow column), transcript below. -->
    <ng-template #traceBeside let-section>
      <div class="trace-beside">
        <div class="trace-beside-table">
          <ng-container [ngTemplateOutlet]="lessonTable" [ngTemplateOutletContext]="{ $implicit: section.table }" />
        </div>
        <figure class="concept-visual trace-beside-visual">
          <img [src]="section.visual.assetPath" [alt]="section.visual.alt" />
          @if (section.visual.caption; as caption) {
            <figcaption>{{ caption }}</figcaption>
          }
        </figure>
      </div>
      @if (section.visualTranscript?.length) {
        <details class="visual-transcript">
          <summary>Read the complete visual transcript</summary>
          <ol>
            @for (step of section.visualTranscript; track step) {
              <li>{{ step }}</li>
            }
          </ol>
        </details>
      }
    </ng-template>
    <!-- algo-pattern-v1 Problems: rungs from easy to hard, each a link to its hands-on problem page. -->
    <ng-template #problemLadder let-section>
      <ol class="problem-ladder" aria-label="Practice problems, easy to hard">
        @for (step of section.ladder; track step.questionId; let index = $index) {
          <li>
            <span class="ladder-rung" aria-hidden="true">{{ index + 1 }}</span>
            <div class="ladder-body">
              <a [routerLink]="['/', pathId(), courseId(), step.questionId]">{{ step.title }}</a>
              <span class="ladder-level">{{ step.difficulty }}</span>
              <p [innerHTML]="step.newIdea"></p>
            </div>
          </li>
        }
      </ol>
    </ng-template>
    <!-- algo-pattern-v1 Spot the pattern: pick a pattern per problem, then see whether it fits and why. -->
    <ng-template #spotDrill let-drill let-section="section">
      <ol class="spot-list">
        @for (item of drill.items; track item.statement; let index = $index) {
          <li class="spot-item">
            <p class="spot-statement" [id]="section.id + '-spot-' + index">{{ item.statement }}</p>
            <div class="spot-options" role="group" [attr.aria-labelledby]="section.id + '-spot-' + index">
              @for (option of drill.options; track option) {
                <button
                  type="button"
                  [attr.aria-pressed]="spotPick(section.id, index) === option"
                  (click)="pickSpot(section.id, index, option)"
                >{{ option }}</button>
              }
            </div>
            <p class="spot-result" aria-live="polite">
              @if (spotPick(section.id, index); as picked) {
                @if (picked === item.answer) {
                  <strong class="spot-right">Right: {{ item.answer }}.</strong>
                } @else {
                  <strong class="spot-wrong">Not this one. It is {{ item.answer }}.</strong>
                }
                {{ item.why }}
              }
            </p>
          </li>
        }
      </ol>
    </ng-template>
    <!-- Small titled cards after the body: side by side when the lesson column is wide, stacked otherwise. -->
    <ng-template #sectionCards let-section>
      @if (section.cards?.length) {
        <div class="section-cards">
          <ul class="section-card-grid" [attr.data-card-count]="section.cards.length">
            @for (card of section.cards; track card.title) {
              <li class="section-card">
                <h3>{{ card.title }}</h3>
                <ul>
                  @for (point of card.points; track point) {
                    <li [innerHTML]="point"></li>
                  }
                </ul>
              </li>
            }
          </ul>
        </div>
      }
    </ng-template>
    <!-- DSA core courses: Java | Python | Go tabs. One choice drives every block on the page (and the
         Hands-On DSA problem page); the console belongs to the tab, so it switches with the code. -->
    <ng-template #languageCode let-tabs let-key="key" let-label="label">
      <div class="code-tabs language-tabs" role="tablist" [attr.aria-label]="label + ': language'">
        @for (tab of tabs; track tab.id) {
          <button
            type="button"
            role="tab"
            [id]="key + '-lang-' + tab.language"
            [attr.aria-selected]="languageTab(tabs) === tab"
            [attr.aria-controls]="key + '-lang-panel'"
            [attr.tabindex]="languageTab(tabs) === tab ? 0 : -1"
            (click)="chooseLanguage(tab.language, $event)"
            (keydown)="languageKeydown($event, tabs)"
          >{{ languageName(tab.language) }}</button>
        }
      </div>
      @if (languageTab(tabs); as tab) {
        <div class="language-panel" role="tabpanel" [id]="key + '-lang-panel'" [attr.aria-labelledby]="key + '-lang-' + tab.language">
          <ng-container [ngTemplateOutlet]="codeBlock" [ngTemplateOutletContext]="{ $implicit: tab }" />
          @if (tab.output; as output) {
            <ng-container [ngTemplateOutlet]="runConsole" [ngTemplateOutletContext]="{ $implicit: output }" />
          }
        </div>
      }
    </ng-template>
    <ng-template #runConsole let-output>
      <div class="run-console" role="group" [attr.aria-label]="'Program output, ' + output.title" [class.run-console-failed]="(output.exitCode ?? 0) !== 0">
        <div class="run-console-bar">
          <span class="run-console-tool">{{ output.tool ?? 'Run' }}</span>
          <span class="run-console-tab">{{ programName(output.title) }}<span aria-hidden="true"> ×</span></span>
        </div>
        <div class="run-console-main">
          <div class="run-console-gutter" aria-hidden="true"><span class="run-rerun"></span><span class="run-stop"></span></div>
          <div class="run-console-body">
            @if (output.command) {
              <div class="run-command">{{ output.command }}</div>
            }
            @for (line of outputLines(output.text); track $index) {
              <div class="run-line" [class.run-line-error]="isErrorLine(line, output, $index)" [class.run-line-pass]="isPassLine(line)">{{ line }}</div>
            }
            <div class="run-exit">Process finished with exit code {{ output.exitCode ?? 0 }}</div>
          </div>
        </div>
      </div>
      @if (output.note) {
        <p class="run-console-note">{{ output.note }}</p>
      }
    </ng-template>
    <ng-template #codeBlock let-code>
      <section class="foundation-code">
        <header>
          <span>{{ code.title }}</span>
          <div>
            <small>{{ languageLabel(code.language) }}</small
            ><app-code-copy-button [code]="code.source" />
          </div>
        </header>
        <pre><code [appLearningCode]="code.source" [codeLanguage]="code.language"></code></pre>
      </section>
    </ng-template>
    <ng-template #lessonTable let-table>
      <div class="lesson-table-wrap">
        <table class="lesson-table">
          @if (table.caption) {
            <caption>{{ table.caption }}</caption>
          }
          <thead>
            <tr>
              @for (column of table.columns; track $index) {
                <th scope="col">{{ column }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of table.rows; track $index) {
              <tr>
                @for (cell of row; track $index; let first = $first) {
                  @if (first) {
                    <th scope="row" [innerHTML]="cell"></th>
                  } @else {
                    <td [innerHTML]="cell"></td>
                  }
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    </ng-template>
    <ng-template #referenceLesson>
      <article class="foundation-lesson" aria-label="Foundation lesson">
        @if (!lesson().learningFlow) {
        <header class="lesson-intro" [class.guided-outcomes]="guide()">
          @if (!guide()) {
            <p>{{ lesson().summary }}</p>
          }
          <section aria-labelledby="foundation-outcomes-heading">
            <span>After this lesson</span>
            <h2 id="foundation-outcomes-heading">You will be able to</h2>
            <ul>
              @for (outcome of lesson().learningOutcomes; track outcome) {
                <li>{{ outcome }}</li>
              }
            </ul>
          </section>
          <aside class="memory-anchor" aria-label="Memory anchor and interview retrieval cue">
            <span>Memory anchor</span>
            <strong>{{ lesson().memoryAnchor.phrase }}</strong>
            <p>{{ lesson().memoryAnchor.mentalModel }}</p>
            <p><b>Interview cue:</b> {{ lesson().memoryAnchor.retrievalCue }}</p>
          </aside>
        </header>
        }

        @for (section of lesson().sections; track section.id) {
          <ng-container [ngTemplateOutlet]="sectionCard" [ngTemplateOutletContext]="{ $implicit: section }" />
        }

        <section
          id="foundation-model"
          class="lesson-section model-section"
          aria-labelledby="foundation-model-heading"
        >
          <p class="section-label"><span>Model</span>Reason before choosing</p>
          <h2 id="foundation-model-heading">{{ lesson().foundationModel.heading }}</h2>
          <div class="model-grid">
            <article>
              <span>What we are working with</span>
              <p>{{ lesson().foundationModel.representation }}</p>
            </article>
            <article class="model-invariant">
              <span>What must stay true</span>
              <p>{{ lesson().foundationModel.invariant }}</p>
            </article>
            <article>
              <span>How the work happens</span>
              <p>{{ lesson().foundationModel.operationLens }}</p>
            </article>
            <article>
              <span>When to choose this</span>
              <p>{{ lesson().foundationModel.selectionRule }}</p>
            </article>
          </div>
        </section>

        @if (lesson().learningFlow) {
          <section id="foundation-remember" class="lesson-section takeaways" aria-labelledby="foundation-remember-heading">
            <h2 id="foundation-remember-heading">What to remember</h2>
            <ul>@for (takeaway of guide()?.takeaways ?? lesson().keyTakeaways; track takeaway) { <li>{{ takeaway }}</li> }</ul>
            @if (guide(); as guide) { <p>{{ guide.later }}</p> }
            <div class="language-notes" aria-label="Language notes">
              @for (note of lesson().languageNotes; track note.language) {
                <p><strong>{{ note.language }}</strong>{{ note.note }}</p>
              }
            </div>
          </section>
        }
        <section
          id="foundation-pitfalls"
          class="lesson-section wide-section"
          aria-labelledby="foundation-pitfalls-heading"
        >
          <p class="section-label"><span>Debug</span>Failure contrasts</p>
          <h2 id="foundation-pitfalls-heading">{{ lesson().learningFlow ? "Common mistakes" : "Common failure modes" }}</h2>
          <div class="pitfall-list">
            @for (pitfall of lesson().pitfalls; track pitfall.failedAssumption) {
              <article>
                <h3>{{ pitfall.failedAssumption }}</h3>
                <p><strong>Symptom:</strong> {{ pitfall.symptom }}</p>
                <p><strong>Correction:</strong> {{ pitfall.correction }}</p>
              </article>
            }
          </div>
        </section>

        <section
          id="foundation-understand"
          class="lesson-section wide-section"
          aria-labelledby="foundation-understand-heading"
        >
          <p class="section-label"><span>Retrieve</span>Answer before revealing</p>
          <h2 id="foundation-understand-heading">Check your understanding</h2>
          <app-pattern-understanding-checks [checks]="checks()" />
          @if (questionModuleId(); as moduleId) {
            @if (questionCount() > 0) {
              <app-interview-question-bank-link
                [pathId]="pathId()"
                [courseId]="courseId()"
                [moduleId]="moduleId"
                [returnUnit]="returnUnit()"
                [questionCount]="questionCount()"
                [practiceItems]="questionItems()"
              />
            }
          }
        </section>

        @if (!lesson().learningFlow) {
        <section
          id="foundation-recall"
          class="lesson-section takeaways"
          aria-labelledby="foundation-recall-heading"
        >
          <p class="section-label"><span>Keep</span>Recall under pressure</p>
          <h2 id="foundation-recall-heading">Key takeaways</h2>
          <ul>
            @for (takeaway of lesson().keyTakeaways; track takeaway) {
              <li>{{ takeaway }}</li>
            }
          </ul>
          <div class="language-notes" aria-label="Language notes">
            @for (note of lesson().languageNotes; track note.language) {
              <p>
                <strong>{{ note.language }}</strong
                >{{ note.note }}
              </p>
            }
          </div>
          <aside class="interview-recall" aria-labelledby="interview-recall-prompt">
            <span>Interview recall prompt</span>
            <h3 id="interview-recall-prompt">{{ lesson().interviewRecall.prompt }}</h3>
            <ol>
              @for (step of lesson().interviewRecall.answerFramework; track step) {
                <li>{{ step }}</li>
              }
            </ol>
          </aside>
        </section>

        }
        @if (lesson().learningFlow; as flow) {
          <section id="foundation-try" class="lesson-section" aria-labelledby="foundation-try-heading">
            <h2 id="foundation-try-heading">Try it yourself</h2>
            <p>{{ flow.practice.prompt }}</p>
            <details class="guide-answer"><summary>Show a hint</summary><p>{{ flow.practice.hint }}</p></details>
            <details class="guide-answer"><summary>Check your answer</summary><p class="practice-answer">{{ flow.practice.answer }}</p></details>
            @if (guide(); as guide) {
              <h3>One more small change</h3>
              <p>{{ guide.try }}</p>
              <details class="guide-answer"><summary>Check the small change</summary><p>{{ guide.answer }}</p></details>
            }
            <details class="guide-answer">
              <summary>Practice explaining your choice</summary>
              <p>{{ lesson().interviewRecall.prompt }}</p>
              <details><summary>Compare your explanation</summary>
                <ol>@for (step of lesson().interviewRecall.answerFramework; track step) { <li>{{ step }}</li> }</ol>
              </details>
            </details>
          </section>
        }
        @if (practiceItems().length) {
          <section
            id="foundation-practice"
            class="lesson-section practice-section"
            aria-labelledby="foundation-practice-heading"
          >
            <p class="section-label"><span>Continue</span>Transfer the model</p>
            <h2 id="foundation-practice-heading">Practice with intent</h2>
            <div class="practice-grid">
              @for (item of practiceItems(); track item.id) {
                <a [routerLink]="['/', pathId(), courseId(), item.id]">
                  <span>{{ item.difficulty }} · {{ practiceVariation(item.id) }}</span>
                  <strong>{{ navTitle(item) }}</strong>
                  <p [innerHTML]="practiceReason(item.id)"></p>
                  <b aria-hidden="true">Start problem</b>
                </a>
              }
            </div>
          </section>
        }
      </article>
    </ng-template>
  `,
  styles: [
    `
      .practice-answer { white-space: pre-line; }
      :host {
        display: block;
      }
      .guide-scenario {
        border-inline-start: 3px solid var(--link-color, #8ebcff);
        padding: 0.5rem 1rem;
        background: var(--surface-raised, transparent);
      }

      .guide-scenario p {
        white-space: pre-line;
        overflow-wrap: anywhere;
      }

      .beginner-guide {
        grid-template-columns: minmax(0, 1fr);
        width: 100%;
        margin-inline: 0;
        color: var(--text-body);
        line-height: 1.75;
        overflow-wrap: anywhere;
      }
      .beginner-guide > section {
        margin: 0;
        scroll-margin-top: 10rem;
      }
      .beginner-guide h3 {
        color: var(--text-strong);
        line-height: 1.3;
      }
      .beginner-guide p,
      .beginner-guide li {
        margin-block: 0.8rem;
      }
      .beginner-guide .guide-summary {
        margin: 0;
        padding-inline: 25px;
        font-size: 1.15rem;
      }
      .guide-answer {
        border-block: 1px solid var(--line);
        padding-block: 1rem;
      }
      .foundation-reference {
        margin-block: 18px;
        scroll-margin-top: 10rem;
      }
      .guide-answer > summary {
        color: var(--accent-link);
        font-weight: 700;
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 0.2em;
      }
      .guide-answer > summary:focus-visible {
        outline: 2px solid var(--accent-link);
        outline-offset: 4px;
      }
      .foundation-lesson {
        --lesson-ink: var(--text-strong);
        --lesson-body: var(--text-body);
        --lesson-teal: var(--accent-link);
        --lesson-line: var(--line);
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
        margin-top: 22px;
        color: var(--lesson-body);
        font-family: 'Avenir Next', Avenir, 'Segoe UI', sans-serif;
      }
      .foundation-lesson.beginner-guide {
        grid-template-columns: minmax(0, 1fr);
      }
      .lesson-intro,
      .lesson-section {
        scroll-margin-top: 148px;
      }
      .lesson-intro {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
        gap: 22px;
        padding: 25px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background:
          radial-gradient(
            circle at 94% 8%,
            color-mix(in srgb, var(--accent-secondary) 18%, transparent),
            transparent 29%
          ),
          linear-gradient(135deg, var(--surface-accent), var(--surface));
        box-shadow: 0 12px 30px var(--shadow);
      }
      .guided-outcomes > section {
        grid-column: 1 / -1;
        min-width: 0;
      }
      .guided-outcomes > section > ul {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px 32px;
      }
      .lesson-intro > p {
        align-self: center;
        margin: 0;
        color: var(--lesson-ink);
        font-size: clamp(1.08rem, 1vw + 0.72rem, 1.25rem);
        font-weight: 550;
        line-height: 1.7;
      }
      .lesson-intro section,
      .memory-anchor {
        padding: 17px 19px;
        border: 1px solid var(--line);
        border-radius: 13px;
        background: var(--surface);
      }
      .memory-anchor {
        grid-column: 1 / -1;
        border-color: var(--line);
        border-left: 5px solid var(--lesson-teal);
        background: var(--surface-accent);
      }
      .memory-anchor strong {
        display: block;
        margin-top: 5px;
        color: var(--lesson-ink);
        font-size: 1.06rem;
      }
      .memory-anchor p {
        margin: 6px 0 0;
        line-height: 1.55;
      }
      .lesson-intro h2 {
        margin: 4px 0 9px;
        color: var(--lesson-ink);
        font-size: 1.02rem;
      }
      .lesson-intro ul,
      .lesson-section ul,
      .lesson-section ol {
        margin: 8px 0 0;
        padding-left: 20px;
        line-height: 1.65;
      }
      .lesson-intro span,
      .memory-anchor span,
      .section-label,
      .model-grid span,
      .language-notes strong,
      .interview-recall span,
      .practice-grid span {
        color: var(--lesson-teal);
        font-size: 0.68rem;
        font-weight: 850;
        letter-spacing: 0.075em;
        text-transform: uppercase;
      }
      .lesson-section {
        min-width: 0;
        padding: 23px 24px;
        border: 1px solid var(--lesson-line);
        border-top: 4px solid var(--lesson-teal);
        border-radius: 14px;
        background: var(--surface);
        box-shadow: 0 8px 22px var(--shadow);
      }
      .guided-example {
        display: flow-root;
      }
      .guided-example > h2 {
        grid-column: 1 / -1;
      }
      .guided-example > .foundation-code,
      .guide-walkthrough,
      .guided-example > .guide-scenario {
        min-width: 0;
        margin-top: 0;
      }
      .guide-walkthrough h3 {
        margin-top: 0;
      }
      .code-section {
        display: flow-root;
      }
      .guided-example > .foundation-code,
      .guided-example > .guide-scenario,
      .code-section > .section-code-column {
        float: inline-start;
        width: calc(50% - 12px);
        margin: 0 24px 16px 0;
      }
      .code-section .lesson-callout {
        clear: both;
      }
      .code-section > .section-label,
      .code-section > h2 {
        grid-column: 1 / -1;
      }
      .section-explanation {
        min-width: 0;
      }
      .text-section > .section-explanation {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px 24px;
        align-items: start;
      }
      .text-section.three-explanations > .section-explanation {
        grid-template-columns: minmax(0, 1fr);
      }
      .reference-links-card,
      .text-section > .section-explanation > .explanation-content {
        margin: 0;
        padding: 18px 20px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--surface-muted);
        overflow-wrap: anywhere;
      }
      .explanation-content {
        margin: 1em 0;
      }
      .explanation-content > ul {
        margin-block: 10px 0;
      }
      .explanation-content li + li,
      .walkthrough-points li + li {
        margin-top: 10px;
      }
      .walkthrough-points {
        list-style-position: inside;
        padding-left: 0 !important;
      }
      .reference-links-card ul {
        margin: 0;
      }
      .reference-links-card li + li {
        margin-top: 12px;
      }
      .text-section > .section-explanation > .lesson-callout {
        grid-column: 1 / -1;
      }
      .section-code-column {
        min-width: 0;
      }
      .code-section > .section-code-column > .foundation-code {
        min-width: 0;
        margin-top: 0;
        align-self: start;
      }
      .lesson-section.wide-section,
      .takeaways,
      .practice-section {
        grid-column: 1 / -1;
      }
      .lesson-section h2 {
        margin: 8px 0 14px;
        color: var(--lesson-ink);
        font-size: clamp(1.28rem, 1.6vw, 1.68rem);
        line-height: 1.2;
      }
      .lesson-section > p:not(.section-label),
      .section-explanation > .explanation-content {
        line-height: 1.7;
      }
      .section-label {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        width: fit-content;
        margin: 0;
        padding-left: 11px;
        border-left: 3px solid var(--lesson-teal);
        line-height: 1.2;
      }
      .section-label span {
        padding-right: 9px;
        border-right: 1px solid var(--line);
        color: var(--text-subtle);
      }
      /* DLV-408 system lessons: one reading column, one card after another. Stages group
         sections under a numbered divider; nothing sits side by side. */
      .system-lesson {
        /* Cards use their full width; tables, code and prompts break up long text. */
        --reading-width: none;
        display: flex;
        flex-direction: column;
        gap: 3rem;
        font-size: 1.0625rem;
      }
      .lesson-stage {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        scroll-margin-top: 10rem;
      }
      /* The Overview card's own heading names the stage, so the stage title is not repeated above it. */
      .lesson-stage.self-titled-stage::before {
        content: none;
      }
      .lesson-stage::before {
        content: attr(data-sidebar-label);
        display: block;
        padding-bottom: 0.6rem;
        border-bottom: 1px solid var(--line);
        color: var(--text-subtle);
        font-size: 0.95rem;
        font-weight: 600;
        letter-spacing: 0.02em;
      }
      .system-lesson .lesson-section {
        --card-pad-x: clamp(1rem, 2vw, 1.75rem);
        padding: 1.75rem var(--card-pad-x);
        border-top-width: 3px;
        border-radius: 12px;
        box-shadow: 0 2px 10px var(--shadow);
      }
      /* Small labels ("Prove | More practice", "Advanced · Diagnose", table headers):
         a readable demi-bold at a real size, little tracking, no heavy capitals. */
      .system-lesson :is(.section-label, .practice-grid span, .one-line-label) {
        font-size: 0.85rem;
        font-weight: 600;
        letter-spacing: 0.01em;
        text-transform: none;
      }
      .system-lesson .lesson-table thead th {
        font-size: 0.85rem;
        font-weight: 650;
        letter-spacing: 0;
        text-transform: none;
      }
      .system-lesson .lesson-section h2 {
        margin: 0.6rem 0 1.25rem;
        font-size: clamp(1.35rem, 1.4vw + 0.9rem, 1.7rem);
        line-height: 1.25;
      }
      .system-lesson .lesson-section h3 {
        margin: 1.75rem 0 0.5rem;
        color: var(--text-strong);
        font-size: 1.08rem;
      }
      .system-lesson .lesson-section p,
      .system-lesson .explanation-content,
      .system-lesson .lesson-section > ul,
      .system-lesson .follow-ups,
      .system-lesson .try-exercise {
        max-width: var(--reading-width);
      }
      .system-lesson .lesson-section p,
      .system-lesson .explanation-content {
        line-height: 1.8;
      }
      .system-lesson .section-explanation,
      .system-lesson .text-section > .section-explanation,
      .system-lesson .text-section.three-explanations > .section-explanation {
        display: flex;
        flex-direction: column;
        gap: 1.1rem;
      }
      .system-lesson .explanation-content,
      .system-lesson .text-section > .section-explanation > .explanation-content {
        margin: 0;
        padding: 0;
        border: 0;
        background: none;
      }
      /* Lesson prose arrives through innerHTML, so its inline elements (lists, code,
         samples) are styled globally in styles.css under .system-lesson. */
      .system-lesson .lesson-section > ul {
        margin: 0.4rem 0 0;
        padding-left: 1.4rem;
        line-height: 1.75;
      }
      .system-lesson .lesson-section > ul > li + li {
        margin-top: 0.6rem;
      }
      .system-lesson .code-section > .section-code-column,
      .system-lesson .section-code-column {
        float: none;
        width: auto;
        margin: 0 0 1.5rem;
      }
      .system-lesson .foundation-code {
        margin-top: 0;
      }
      .system-lesson .foundation-code pre {
        font-size: 0.8rem;
        line-height: 1.65;
      }
      /* The lesson column is the size container for every side-by-side decision. */
      .system-lesson {
        container: lesson / inline-size;
      }
      /* Code with its run console on the left, the explanation beside it; tables,
         visuals and transcripts run full width below. */
      .system-lesson .system-code-section {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }
      .code-pair {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 1.5rem;
      }
      .code-pair-code {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 0.75rem;
      }
      .code-pair-text {
        min-width: 0;
      }
      .system-lesson .code-pair .foundation-code pre {
        max-height: min(80vh, 48rem);
      }
      @container lesson (min-width: 760px) {
        .code-pair {
          grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
          gap: 2rem;
          align-items: start;
        }
        /* Short code: the explanation sits level with the middle of the code. */
        .code-pair.code-pair-centered {
          align-items: center;
        }
        .system-lesson .scenario-card .scenario-why {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .system-lesson .lesson-section .pitfall-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      /* File tabs, as in an IDE: one file and its explanation at a time. */
      .code-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        border-bottom: 1px solid var(--line);
      }
      .code-tabs button {
        min-height: 44px;
        padding: 0.55rem 0.9rem;
        border: 1px solid transparent;
        border-bottom: 0;
        border-radius: 8px 8px 0 0;
        background: transparent;
        color: var(--text-subtle);
        font: 600 0.85rem/1.2 var(--lesson-mono, monospace);
        cursor: pointer;
      }
      .code-tabs button:hover {
        color: var(--text-strong);
        background: var(--surface-muted);
      }
      .code-tabs button[aria-selected='true'] {
        margin-bottom: -1px;
        border-color: var(--line);
        background: var(--surface);
        color: var(--accent-strong);
        box-shadow: inset 0 3px 0 var(--accent-strong);
      }
      .code-tabs button:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      /* Program output modelled on an IDE run tool window (dark, as the code block):
         a "Run" tab strip, a rerun/stop gutter, the command in grey, one row per printed
         line, then the exit line after a blank row. */
      .run-console {
        overflow: hidden;
        border: 1px solid #393b40;
        border-radius: 10px;
        background: #1e1f22;
        color: #bcbec4;
        font-family: var(--lesson-mono, monospace);
      }
      .run-console-bar {
        display: flex;
        align-items: stretch;
        gap: 0.9rem;
        padding: 0 0.8rem;
        border-bottom: 1px solid #393b40;
        background: #2b2d30;
        font-size: 0.75rem;
      }
      .run-console-tool {
        align-self: center;
        color: #dfe1e5;
        font-weight: 700;
      }
      .run-console-tab {
        padding: 0.45rem 0.2rem 0.4rem;
        border-bottom: 2px solid #3574f0;
        color: #dfe1e5;
      }
      .run-console-tab span {
        color: #6f737a;
      }
      .run-console-main {
        display: flex;
      }
      .run-console-gutter {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.7rem;
        padding: 0.8rem 0.55rem;
        border-right: 1px solid #393b40;
      }
      .run-rerun {
        width: 0;
        height: 0;
        border-block: 5px solid transparent;
        border-inline-start: 8px solid #57965c;
      }
      .run-stop {
        width: 8px;
        height: 8px;
        border-radius: 1px;
        background: #6f737a;
      }
      .run-console-body {
        min-width: 0;
        flex: 1;
        overflow-x: auto;
        padding: 0.7rem 1rem 0.8rem;
        font-size: 0.8rem;
        line-height: 1.6;
      }
      .run-console-body > div {
        min-height: 1.6em;
        white-space: pre;
      }
      .run-command {
        color: #6f737a;
      }
      .run-exit {
        margin-top: 1.6em;
        color: #bcbec4;
      }
      /* IDE colours for stderr-style lines and passing checks; a failed run shows a red exit line. */
      .run-line-error {
        color: #f75464;
      }
      .run-line-pass {
        color: #5fb865;
      }
      .run-console-failed .run-exit {
        color: #f75464;
      }
      .run-console-failed .run-rerun {
        border-inline-start-color: #f75464;
      }
      .run-console-note {
        margin: 0.35rem 0 0;
        color: var(--text-subtle);
        font-size: 0.85rem;
        line-height: 1.5;
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      /* Story practice: a speaking timer. */
      .practice-timer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem 1.25rem;
        margin-top: 1.25rem;
        padding: 1rem 1.2rem;
        border: 1px solid var(--line);
        border-left: 4px solid var(--accent-strong);
        border-radius: 10px;
        background: var(--surface-muted);
      }
      .system-lesson .practice-timer-prompt {
        flex: 1 1 100%;
        margin: 0;
        color: var(--text-strong);
      }
      .system-lesson .practice-timer-clock {
        margin: 0;
        color: var(--text-strong);
        font: 700 1.6rem/1 var(--lesson-mono, monospace);
      }
      .practice-timer-actions {
        display: flex;
        gap: 0.5rem;
      }
      .practice-timer-actions button {
        min-height: 44px;
        padding: 0.5rem 1rem;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
        color: var(--text-strong);
        font-weight: 600;
        cursor: pointer;
      }
      .practice-timer-actions button:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      /* Debug pairs: the problem across the top; "What broke" and "The fix" side by side.
         Subgrid keeps each side's note, code and output on shared rows so they line up;
         on narrow screens the sides stack in reading order (broken first, then the fix). */
      .pair-list {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        margin: 1.25rem 0 0;
        padding: 0;
        list-style: none;
      }
      .pair-card {
        padding: 1.1rem 1.2rem 1.25rem;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--surface);
      }
      .system-lesson .pair-head h3 {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        margin: 0 0 0.5rem;
        color: var(--text-strong);
        font-size: 1.1rem;
        line-height: 1.35;
      }
      .pair-number {
        display: inline-grid;
        flex: none;
        width: 1.7rem;
        height: 1.7rem;
        place-items: center;
        border-radius: 50%;
        background: var(--text-strong);
        color: var(--surface);
        font-size: 0.85rem;
        font-weight: 700;
      }
      .pair-head {
        margin-bottom: 1rem;
      }
      .pair-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 1rem;
      }
      .pair-side {
        display: grid;
        min-width: 0;
        align-content: start;
        gap: 0.75rem;
        padding: 0.9rem;
        border: 1px solid var(--line);
        border-top: 3px solid var(--side-accent);
        border-radius: 10px;
        background: color-mix(in srgb, var(--side-accent) 5%, var(--surface));
      }
      .pair-broken {
        --side-accent: var(--danger);
      }
      .pair-fixed {
        --side-accent: var(--success);
      }
      .pair-side > * {
        min-width: 0;
      }
      .system-lesson .pair-label {
        margin: 0 0 0.3rem;
        color: var(--side-accent);
        font-size: 0.9rem;
        font-weight: 700;
      }
      .pair-broken .pair-label::before {
        content: '✗ ';
      }
      .pair-fixed .pair-label::before {
        content: '✓ ';
      }
      .system-lesson .pair-fix-title {
        margin: 0 0 0.3rem;
        color: var(--text-strong);
        font-weight: 650;
      }
      .pair-side-head .explanation-content {
        font-size: 0.95rem;
        line-height: 1.65;
      }
      .pair-side-head .explanation-content + .explanation-content {
        margin-top: 0.4rem;
      }
      .system-lesson .pair-side .foundation-code pre {
        max-height: 30rem;
        font-size: 0.76rem;
      }
      @container lesson (min-width: 760px) {
        .pair-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-rows: auto auto auto;
          column-gap: 1rem;
          row-gap: 0.75rem;
        }
        .pair-side {
          grid-row: span 3;
          grid-template-rows: subgrid;
          gap: 0.75rem;
        }
        /* Fixed rows, so a side without code (body + table only) still lines its
           table or console up with the other side's third row. */
        .pair-side-head {
          grid-row: 1;
        }
        .pair-side-code {
          grid-row: 2;
        }
        .pair-side-output {
          grid-row: 3;
        }
      }
      .pair-side-output {
        display: grid;
        gap: 0.75rem;
        align-content: start;
      }
      .pair-side-output .lesson-table-wrap {
        margin: 0;
      }
      /* Long code: the explanation starts level with the first line of code, not the title bar. */
      .system-lesson .code-pair .foundation-code header {
        box-sizing: border-box;
        min-height: 2.9rem;
      }
      .code-pair:not(.code-pair-centered) > .code-pair-text {
        padding-top: calc(2.9rem + 1px + 16px);
      }
      .section-intro {
        margin-bottom: 0.25rem;
      }
      /* Wide tables scroll inside their own frame; they never widen the lesson or the page. */
      .lesson-table-wrap {
        box-sizing: border-box;
        max-width: 100%;
        min-width: 0;
        overflow-x: auto;
        border: 1px solid var(--line);
        border-radius: 10px;
      }
      .lesson-table {
        width: 100%;
        border-collapse: collapse;
        line-height: 1.55;
      }
      .lesson-table caption {
        padding: 0.7rem 1rem;
        color: var(--text-strong);
        font-weight: 700;
        text-align: start;
      }
      .lesson-table :is(th, td) {
        padding: 0.7rem 1rem;
        border-top: 1px solid var(--line);
        text-align: start;
        vertical-align: top;
      }
      .lesson-table thead th {
        border-top: 0;
        background: var(--surface-muted);
        color: var(--text-strong);
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .lesson-table tbody th {
        font-weight: 600;
        white-space: nowrap;
      }
      .lesson-table tbody tr:nth-child(even) {
        background: color-mix(in srgb, var(--surface-muted) 45%, transparent);
      }
      .system-lesson .concept-visual {
        margin-top: 1.5rem;
      }
      /* algo-pattern-v1: the code is the lesson, so it runs full width with its explanation below. */
      @container lesson (min-width: 760px) {
        .algo-lesson .code-pair {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      /* Console lines wrap so a long exception message is read in place instead of scrolled sideways. */
      .algo-lesson .run-console-body > div {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        tab-size: 2;
      }
      /* Language tabs sit on the code block's title bar. */
      .language-tabs {
        border-bottom: 0;
      }
      .language-tabs button {
        font-family: inherit;
      }
      .language-tabs button[aria-selected='true'] {
        margin-bottom: 0;
      }
      .language-panel {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 0.75rem;
      }
      .language-panel .foundation-code {
        margin-top: 0;
        border-top-left-radius: 0;
      }
      .cheat-template {
        margin-bottom: 1.25rem;
      }
      .system-lesson .cheat-template h3 {
        margin: 0 0 0.6rem;
        color: var(--text-strong);
        font-size: 1rem;
      }
      /* algo-pattern-v1: animated SVG diagrams stay at a readable size instead of filling a wide column. */
      .algo-lesson .concept-visual img {
        max-width: 560px;
        margin-inline: auto;
      }
      .trace-beside {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 1.25rem;
        margin-top: 1.5rem;
        align-items: center;
      }
      .trace-beside .lesson-table-wrap,
      .trace-beside .concept-visual {
        margin: 0;
      }
      @container lesson (min-width: 760px) {
        .trace-beside {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 1.75rem;
        }
      }
      /* algo-pattern-v1 Problem first: the problem's name with its level and source, the problem card on its own,
         then the storyboard with a short explanation and one cost line beside it. Fits a 1280 x 720 screen. */
      .system-lesson .problem-label {
        flex-wrap: wrap;
        row-gap: 0.4rem;
        color: var(--accent-link);
        font-weight: 650;
      }
      .difficulty-pill,
      .problem-source {
        font-style: normal;
      }
      .difficulty-pill {
        padding: 0.1rem 0.6rem;
        border: 1.5px solid var(--success);
        border-radius: 999px;
        color: var(--success);
        font-size: 0.78rem;
        font-weight: 750;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .difficulty-pill[data-level='medium'] {
        border-color: var(--warning);
        color: var(--warning);
      }
      .difficulty-pill[data-level='hard'] {
        border-color: var(--danger);
        color: var(--danger);
      }
      .problem-source {
        color: var(--text-subtle);
        font-weight: 600;
      }
      .problem-card {
        margin-top: 0.9rem;
        padding: 0.8rem 1.1rem;
        border-left: 4px solid var(--accent-link);
        border-radius: 8px;
        background: var(--surface-accent);
      }
      .system-lesson .problem-card p {
        margin: 0.3rem 0;
        line-height: 1.6;
      }
      .system-lesson .problem-card strong {
        color: var(--text-strong);
      }
      .system-lesson .problem-card .problem-example {
        font-family: var(--lesson-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
        font-size: 0.85rem;
      }
      .system-lesson .lesson-storyboard .storyboard-beside .explanation-content {
        margin: 0 0 0.6rem;
        line-height: 1.6;
      }
      /* Problem first fits one 1280 x 720 screen: a slightly smaller explanation beside the drawing. */
      .system-lesson .storyboard-story .storyboard-beside {
        font-size: 1rem;
      }
      .system-lesson .storyboard-story .storyboard-beside .explanation-content {
        line-height: 1.55;
      }
      .system-lesson .storyboard-cost {
        margin: 0;
        padding: 0.45rem 0.75rem;
        border-left: 3px solid var(--accent-link);
        border-radius: 6px;
        background: var(--surface-muted);
        font-size: 0.97rem;
        line-height: 1.55;
      }
      .system-lesson .beside-points {
        display: grid;
        gap: 0.65rem;
        margin: 0;
        padding-left: 1.2rem;
        line-height: 1.6;
      }
      .storyboard-callout {
        margin-top: 1rem;
      }
      /* When to use: a "Use this" / "Look-alike" pill in the first column (authored cell HTML, so ::ng-deep). */
      .lesson-table ::ng-deep .kind {
        display: inline-block;
        padding: 0.1rem 0.55rem;
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 700;
        white-space: nowrap;
      }
      .lesson-table ::ng-deep .kind-use {
        background: color-mix(in srgb, var(--success) 16%, var(--surface));
        color: var(--success);
      }
      .lesson-table ::ng-deep .kind-alt {
        background: color-mix(in srgb, var(--warning) 16%, var(--surface));
        color: var(--warning);
      }
      /* Debug pairs as a split diff (every Learn and Grow pair of programs). The code panel is dark in both
         themes, so the row colors are fixed. One grid: heads, then per file a title row and aligned rows, then
         consoles; in a narrow column CSS order puts the whole broken side first, then the fix. */
      .split-diff {
        --diff-del-bg: #4a1d27;
        --diff-add-bg: #17402d;
        --diff-del-mark: #ff8f9a;
        --diff-add-mark: #7fe0a8;
        --diff-fill: #0c1526;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        column-gap: 14px;
        min-width: 0;
      }
      .split-diff > * {
        min-width: 0;
      }
      .diff-language-tabs {
        margin-bottom: 0.5rem;
      }
      .split-diff .d-l {
        --side-accent: var(--danger);
      }
      .split-diff .d-r {
        --side-accent: var(--success);
      }
      .split-diff .d-head {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin-bottom: 0.6rem;
        padding: 0.75rem 0.85rem;
        border: 1px solid var(--line);
        border-top: 3px solid var(--side-accent);
        border-radius: 10px;
        background: color-mix(in srgb, var(--side-accent) 6%, var(--surface));
      }
      .split-diff .d-l .pair-label::before {
        content: '✗ ';
      }
      .split-diff .d-r .pair-label::before {
        content: '✓ ';
      }
      .system-lesson .split-diff .pair-label {
        margin: 0;
        color: var(--side-accent);
      }
      .system-lesson .split-diff .pair-fix-title {
        margin: 0;
      }
      .split-diff .d-head .explanation-content {
        margin: 0;
        font-size: 0.95rem;
        line-height: 1.6;
      }
      .split-diff .d-file {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 0.6rem;
        padding: 0.45rem 0.75rem;
        border-radius: 10px 10px 0 0;
        background: var(--code-panel);
        color: var(--code-ink);
        font-size: 0.85rem;
      }
      .split-diff .d-file > span {
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .split-diff .d-file > div {
        display: flex;
        flex: none;
        align-items: center;
        gap: 0.5rem;
      }
      .split-diff .d-file small,
      .split-diff .d-file-none {
        color: var(--code-muted);
      }
      .split-diff .d-count {
        margin-left: 0.6rem;
      }
      .split-diff .d-count b {
        font-weight: 700;
      }
      .split-diff .d-count b + b {
        margin-left: 0.4rem;
      }
      .split-diff .d-count-add {
        color: var(--diff-add-mark);
      }
      .split-diff .d-count-del {
        color: var(--diff-del-mark);
      }
      .split-diff .d-row {
        display: grid;
        grid-template-columns: 2.4em 1.3em minmax(0, 1fr);
        align-items: start;
        padding: 0 10px 0 2px;
        background: var(--code-bg);
        color: var(--code-ink);
        font-family: var(--lesson-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
        font-size: 0.8rem;
        line-height: 1.6;
      }
      .split-diff .d-num {
        padding-right: 6px;
        color: var(--code-muted);
        text-align: right;
        user-select: none;
      }
      .split-diff .d-mark {
        font-weight: 800;
        text-align: center;
        user-select: none;
      }
      .split-diff .d-code {
        min-width: 0;
        padding: 0;
        border: 0;
        background: none;
        color: inherit;
        font: inherit;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        tab-size: 4;
      }
      .split-diff .d-del {
        background: var(--diff-del-bg);
      }
      .split-diff .d-del .d-mark {
        color: var(--diff-del-mark);
      }
      .split-diff .d-add {
        background: var(--diff-add-bg);
      }
      .split-diff .d-add .d-mark {
        color: var(--diff-add-mark);
      }
      .split-diff .d-fill {
        background: repeating-linear-gradient(135deg, var(--code-bg) 0 6px, var(--diff-fill) 6px 12px);
      }
      .split-diff .d-end {
        height: 10px;
        border-radius: 0 0 10px 10px;
        background: var(--code-bg);
      }
      .split-diff .d-shared {
        grid-column: 1 / -1;
        margin-top: 0.6rem;
      }
      .split-diff .d-shared summary {
        cursor: pointer;
        color: var(--text-strong);
        font-weight: 600;
      }
      .split-diff .d-shared summary small {
        margin-left: 0.4rem;
        color: var(--text-subtle);
        font-weight: 500;
      }
      .split-diff .d-shared .foundation-code {
        margin-top: 0.5rem;
      }
      .split-diff .d-out {
        display: grid;
        gap: 0.75rem;
        align-content: start;
        padding-top: 0.75rem;
      }
      .split-diff .d-out:empty {
        display: none;
      }
      .split-diff .d-out .lesson-table-wrap {
        margin: 0;
      }
      .split-diff .run-console-body > div {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      @container lesson (max-width: 759px) {
        .split-diff {
          grid-template-columns: minmax(0, 1fr);
        }
        .split-diff .d-l {
          order: 1;
        }
        .split-diff .d-r {
          order: 2;
        }
        .split-diff .d-head.d-r {
          margin-top: 1.25rem;
        }
        .split-diff .d-fill {
          display: none;
        }
      }
      .system-lesson .problem-ladder,
      .system-lesson .spot-list {
        display: grid;
        gap: 0.75rem;
        margin: 1.25rem 0 0;
        padding: 0;
        list-style: none;
      }
      .problem-ladder li {
        display: grid;
        grid-template-columns: 2.25rem minmax(0, 1fr);
        gap: 0.9rem;
        align-items: start;
        padding: 0.9rem 1rem;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface);
      }
      .ladder-rung {
        display: grid;
        place-items: center;
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 50%;
        background: var(--surface-accent);
        color: var(--text-strong);
        font-weight: 700;
      }
      .ladder-body a {
        color: var(--accent-link);
        font-size: 1.05rem;
        font-weight: 650;
      }
      .ladder-level {
        margin-left: 0.6rem;
        color: var(--text-subtle);
        font-size: 0.85rem;
        font-weight: 600;
      }
      .system-lesson .ladder-body p {
        margin: 0.3rem 0 0;
        line-height: 1.6;
      }
      .spot-item {
        padding: 1rem 1.1rem;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface);
      }
      .system-lesson .spot-item .spot-statement {
        margin: 0 0 0.75rem;
        color: var(--text-strong);
        line-height: 1.6;
      }
      .spot-options {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .spot-options button {
        min-height: 40px;
        padding: 0.35rem 0.85rem;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--surface);
        color: var(--text-strong);
        font: inherit;
        font-size: 0.92rem;
        cursor: pointer;
      }
      .spot-options button:hover {
        border-color: var(--accent-link);
      }
      .spot-options button[aria-pressed='true'] {
        border-color: var(--accent-link);
        background: var(--surface-accent);
        font-weight: 650;
      }
      .spot-options button:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      .system-lesson .spot-item .spot-result {
        margin: 0.6rem 0 0;
        line-height: 1.6;
      }
      .spot-result:empty {
        display: none;
      }
      .spot-right {
        color: var(--success);
      }
      .spot-wrong {
        color: var(--danger);
      }
      .system-lesson .scenario-card .lesson-one-line {
        margin: 0.75rem 0 1.25rem;
        padding: 1rem 1.25rem;
        border-left: 3px solid var(--lesson-teal);
        border-radius: 6px;
        background: var(--surface-accent);
      }
      .one-line-label {
        display: block;
        margin-bottom: 0.3rem;
        color: var(--lesson-teal);
        font-size: 0.75rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .system-lesson .lesson-one-line p {
        margin: 0;
        color: var(--text-strong);
        font-size: 1.12rem;
        line-height: 1.6;
      }
      .scenario-why {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 1rem;
        margin-top: 1.5rem;
      }
      .scenario-why > div {
        padding: 1rem 1.2rem;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface-muted);
      }
      .system-lesson .scenario-why h3 {
        margin: 0 0 0.35rem;
      }
      .system-lesson .scenario-why p {
        margin: 0;
      }
      /* Interview answer: a spoken answer, so a reading face in its own blue. */
      .system-lesson .interview-answer-card {
        border-color: var(--interview-line);
        border-top-color: var(--interview-accent);
        background: var(--interview-bg);
      }
      .system-lesson .interview-answer-card .section-label {
        border-left-color: var(--interview-accent);
        color: var(--interview-accent);
      }
      .system-lesson .interview-answer-card .spoken-answer {
        margin: 0;
        padding: 1.1rem 1.3rem;
        border-left: 4px solid var(--interview-accent);
        border-radius: 8px;
        background: var(--surface);
        color: var(--text-strong);
        font-family: Charter, 'Iowan Old Style', 'Palatino Linotype', Georgia, serif;
        font-size: 1.12rem;
        line-height: 1.8;
      }
      /* Quick revision: a light cheat sheet. Pale grey-blue sheet, a slim navy title band,
         white numbered tiles with one soft indigo accent. Same tile order in every lesson. */
      .system-lesson .quick-revision {
        padding-top: 0;
        overflow: hidden;
        border-color: var(--sheet-line);
        border-top: 0;
        background: var(--sheet-bg);
        color: var(--sheet-ink);
      }
      .system-lesson .quick-revision > :is(.section-label, h2) {
        margin-inline: calc(-1 * var(--card-pad-x));
        padding-inline: var(--card-pad-x);
        background: var(--sheet-band);
      }
      .system-lesson .quick-revision > .section-label {
        display: flex;
        width: auto;
        margin-top: 0;
        padding-top: 1rem;
        border-left: 0;
        color: var(--sheet-band-muted);
      }
      .system-lesson .quick-revision > .section-label span {
        color: var(--sheet-band-muted);
        border-right-color: var(--sheet-band-rule);
      }
      .system-lesson .quick-revision > h2 {
        margin-top: 0;
        margin-bottom: 1.25rem;
        padding-top: 0.35rem;
        padding-bottom: 1rem;
        border-bottom: 3px solid var(--sheet-accent);
        color: var(--sheet-band-ink);
      }
      /* Section cards: one column by default, two side by side once the lesson column has room. */
      .section-cards {
        margin-top: 1.1rem;
      }
      .lesson-section ul.section-card-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 0.9rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      @container lesson (min-width: 560px) {
        .lesson-section ul.section-card-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      .section-card {
        min-width: 0;
        padding: 0.95rem 1.05rem 1rem;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface);
        overflow-wrap: anywhere;
      }
      .lesson-section .section-card h3 {
        margin: 0 0 0.5rem;
        color: var(--text-strong);
        font-size: 0.98rem;
        line-height: 1.4;
      }
      .lesson-section .section-card ul {
        margin: 0;
        padding-left: 1.1rem;
        font-size: 0.95rem;
        line-height: 1.6;
      }
      .section-card li + li {
        margin-top: 0.35rem;
      }
      .cheat-sheet {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-top: 1.1rem;
      }
      .cheat-tiles {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
        gap: 0.9rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .cheat-tile,
      .cheat-facts {
        padding: 0.95rem 1.05rem 1rem;
        border: 1px solid var(--sheet-line);
        border-radius: 10px;
        background: var(--sheet-tile);
        box-shadow: 0 1px 2px var(--sheet-shadow);
      }
      .cheat-tile.cheat-traps {
        border-left: 3px solid var(--sheet-accent);
      }
      .system-lesson .cheat-sheet h3 {
        display: flex;
        align-items: flex-start;
        gap: 0.55rem;
        margin: 0 0 0.55rem;
        color: var(--sheet-heading);
        font-size: 0.98rem;
        line-height: 1.4;
      }
      .cheat-number {
        display: inline-grid;
        flex: none;
        width: 1.5rem;
        height: 1.5rem;
        place-items: center;
        border-radius: 50%;
        background: var(--sheet-accent);
        color: var(--sheet-on-accent);
        font-size: 0.8rem;
        font-weight: 700;
      }
      .cheat-sheet ul {
        margin: 0;
        padding-left: 1.1rem;
        font-size: 0.95rem;
        line-height: 1.6;
      }
      .cheat-sheet li + li {
        margin-top: 0.35rem;
      }
      .cheat-sheet li::marker {
        color: var(--sheet-accent);
      }
      .cheat-facts ul {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding: 0;
        list-style: none;
      }
      .cheat-facts li {
        margin: 0 !important;
        padding: 0.3rem 0.7rem;
        border: 1px solid var(--sheet-chip-line);
        border-radius: 999px;
        background: var(--sheet-chip);
        color: var(--sheet-heading);
        font-size: 0.88rem;
      }
      .system-lesson .quick-revision .explanation-content {
        font-size: 0.98rem;
        line-height: 1.65;
      }
      /* Check understanding and More practice: a light blueprint, so study blocks read as one family. */
      .system-lesson #foundation-understand,
      .system-lesson #foundation-practice {
        border-top-color: var(--study-accent);
        background-color: var(--study-bg);
        background-image:
          linear-gradient(var(--study-grid) 1px, transparent 1px),
          linear-gradient(90deg, var(--study-grid) 1px, transparent 1px);
        background-size: 22px 22px;
      }
      .system-lesson :is(#foundation-understand, #foundation-practice) .section-label {
        border-left-color: var(--study-accent);
        color: var(--study-accent);
      }
      .system-lesson .quick-revision .section-explanation {
        gap: 0.9rem;
      }
      .system-lesson .pitfall-list,
      .system-lesson .practice-grid,
      .system-lesson .language-notes {
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
      }
      .system-lesson .pitfall-list article {
        max-width: var(--reading-width);
        padding: 1.1rem 1.25rem;
      }
      .system-lesson .pitfall-list h3 {
        margin: 0 0 0.5rem;
      }
      .system-lesson .takeaways {
        display: block;
      }
      .system-lesson .takeaways > ul {
        display: block;
      }
      .system-lesson .memory-anchor {
        max-width: var(--reading-width);
        margin-top: 1.75rem;
      }
      .system-lesson .language-notes p {
        max-width: var(--reading-width);
        padding: 0.9rem 1.1rem;
        line-height: 1.65;
      }
      .system-lesson .follow-ups dt {
        margin-top: 1.25rem;
      }
      .system-lesson .follow-ups dd {
        line-height: 1.75;
      }
      .system-lesson .practice-grid a {
        max-width: var(--reading-width);
      }
      .lesson-stage > section {
        scroll-margin-top: 10rem;
      }
      .scenario-card {
        border-inline-start: 3px solid var(--lesson-teal);
      }
      .lesson-one-line {
        margin: 0.75rem 0 1rem;
        font-size: 1.1rem;
        line-height: 1.6;
        color: var(--text-strong);
      }
      .scenario-brands {
        color: var(--text-subtle);
      }
      .spoken-answer {
        line-height: 1.8;
      }
      .follow-ups dt {
        margin-top: 1rem;
        font-weight: 750;
        color: var(--text-strong);
      }
      .follow-ups dd {
        margin: 0.25rem 0 0;
      }
      .try-exercise + .try-exercise {
        margin-top: 1.5rem;
      }
      .model-section {
        --lesson-ink: var(--code-ink);
        --lesson-body: var(--code-ink);
        --lesson-teal: var(--code-keyword);
        grid-column: 1 / -1;
        color: var(--lesson-body);
        border-top-color: var(--code-line);
        background: var(--code-highlight);
      }
      .model-section .section-label span {
        color: var(--code-muted);
        border-right-color: var(--code-keyword);
      }
      .model-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .model-grid article {
        padding: 15px;
        border: 1px solid var(--code-keyword);
        border-radius: 10px;
        background: var(--code-highlight);
      }
      .model-grid article.model-invariant {
        border-color: var(--code-keyword);
        background: var(--code-highlight);
      }
      .model-grid p {
        margin: 6px 0 0;
        line-height: 1.55;
      }
      .lesson-callout {
        margin-top: 15px;
        padding: 14px 16px;
        border-left: 4px solid var(--lesson-teal);
        border-radius: 8px;
        background: var(--surface-accent);
      }
      .lesson-callout[data-callout-type='production'] {
        border-left-color: var(--warning);
        background: var(--warning-surface);
      }
      .lesson-callout p {
        margin: 6px 0 0;
        line-height: 1.55;
      }
      .foundation-code {
        overflow: hidden;
        margin-top: 17px;
        border: 1px solid var(--code-line);
        border-radius: 12px;
        background: var(--code-bg);
        color: var(--code-ink);
      }
      .foundation-code header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 13px;
        border-bottom: 1px solid var(--code-line);
        background: var(--code-bg);
      }
      .foundation-code header div {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .foundation-code small {
        color: var(--code-muted);
        text-transform: uppercase;
      }
      .foundation-code pre {
        overflow-x: auto;
        margin: 0;
        padding: 16px;
        font:
          0.82rem/1.65 'JetBrains Mono',
          monospace;
      }
      .concept-visual {
        overflow: hidden;
        margin: 18px 0 0;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--surface);
      }
      .concept-visual img {
        display: block;
        width: 100%;
        height: auto;
      }
      .concept-visual figcaption {
        padding: 10px 14px;
        color: var(--text-subtle);
        font-size: 0.82rem;
        line-height: 1.5;
      }
      .visual-transcript {
        margin-top: 12px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface);
      }
      .visual-transcript summary {
        min-height: 44px;
        box-sizing: border-box;
        padding: 13px 15px;
        color: var(--lesson-teal);
        cursor: pointer;
        font-weight: 600;
      }
      .visual-transcript ol {
        padding: 0 36px 17px;
      }
      .pitfall-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .pitfall-list article {
        padding: 15px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--warning-surface);
      }
      .pitfall-list h3 {
        margin: 0 0 8px;
        color: var(--lesson-ink);
        font-size: 1rem;
      }
      .pitfall-list p {
        margin: 5px 0 0;
        line-height: 1.5;
      }
      .takeaways {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 0;
        border-top-color: var(--accent-strong);
        background: linear-gradient(145deg, var(--success-surface), var(--surface));
      }
      .takeaways > ul {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px 32px;
      }
      .takeaways > ul > li {
        min-width: 0;
        padding-right: 12px;
      }
      .takeaways > .section-label,
      .takeaways > h2,
      .interview-recall {
        grid-column: 1 / -1;
      }
      .language-notes {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-top: 18px;
      }
      .language-notes p {
        min-width: 0;
        overflow-wrap: anywhere;
        margin: 0;
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
        line-height: 1.45;
      }
      .language-notes strong {
        display: block;
        color: var(--success);
      }
      .interview-recall {
        margin-top: 20px;
        padding: 17px 19px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--surface);
      }
      .interview-recall h3 {
        margin: 5px 0 8px;
        color: var(--lesson-ink);
        font-size: 1.02rem;
      }
      .practice-section {
        border-top-color: var(--warning);
      }
      .practice-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .practice-grid a {
        display: flex;
        min-width: 0;
        flex-direction: column;
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: 12px;
        color: var(--lesson-body);
        background: var(--surface);
        text-decoration: none;
      }
      .practice-grid a:hover,
      .practice-grid a:focus-visible {
        border-color: var(--warning);
        box-shadow: 0 8px 20px var(--shadow);
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      .practice-grid strong {
        margin: 5px 0;
        color: var(--lesson-ink);
        font-size: 1.02rem;
      }
      .practice-grid p {
        flex: 1;
        margin: 0;
        line-height: 1.5;
      }
      .practice-grid b {
        margin-top: 13px;
        color: var(--warning);
        font-size: 0.8rem;
      }
      @media (max-width: 850px) {
        .guided-example > .foundation-code,
        .guided-example > .guide-scenario,
        .code-section > .section-code-column {
          float: none;
          width: auto;
          margin: 0 0 16px;
        }
        .guided-example,
        .code-section,
        .text-section > .section-explanation {
          grid-template-columns: minmax(0, 1fr);
          row-gap: 16px;
        }
        .foundation-lesson {
          grid-template-columns: 1fr;
        }
        .lesson-intro,
        .lesson-section.wide-section,
        .model-section,
        .takeaways,
        .practice-section {
          grid-column: auto;
        }
        .lesson-intro {
          grid-template-columns: 1fr;
        }
        .memory-anchor {
          grid-column: auto;
        }
        .takeaways {
          display: block;
        }
        .guided-outcomes > section > ul,
        .takeaways > ul,
        .language-notes {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      @media (max-width: 600px) {
        .beginner-guide .guide-summary {
          padding-inline: 19px;
        }
        .lesson-intro,
        .lesson-section {
          padding: 18px;
        }
        .model-grid,
        .pitfall-list,
        .practice-grid {
          grid-template-columns: 1fr;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        * {
          scroll-behavior: auto !important;
          transition: none !important;
        }
      }
      @media (forced-colors: active) {
        .lesson-intro,
        .lesson-section,
        .model-grid article,
        .memory-anchor,
        .lesson-callout,
        .pitfall-list article,
        .interview-recall,
        .practice-grid a {
          border-color: CanvasText;
          color: CanvasText;
          background: Canvas;
          box-shadow: none;
        }
        .section-label,
        .section-label span {
          border-color: CanvasText;
          color: CanvasText;
        }
        .practice-grid a:focus-visible,
        .visual-transcript summary:focus-visible {
          outline: 3px solid Highlight;
          outline-offset: 2px;
        }
      }
    `,
  ],
})
export class FoundationLessonShell {
  protected readonly navTitle = navTitle;
  readonly lesson = input.required<FoundationLessonV1>();
  readonly checks = input.required<ResolvedPatternCheck[]>();
  readonly practiceItems = input.required<InterviewQuestion[]>();
  readonly pathId = input.required<string>();
  readonly courseId = input.required<string>();
  readonly questionModuleId = input<string | null>(null);
  readonly returnUnit = input('');
  readonly questionCount = input(0);
  readonly questionItems = input<ContentItemSummary[]>([]);

  readonly guide = computed(() => this.lesson().teachingGuide ?? this.lesson().beginnerGuide);
  /** DLV-408: lessons with lessonPattern "system-v1" use the nine-stage team flow. */
  readonly pattern = computed(() => lessonPatternDefinition(this.lesson()));
  readonly isSystem = computed(() => this.pattern() !== null);
  readonly slots = computed(() => (this.pattern() ?? LESSON_PATTERNS['system-v1']).slots);
  readonly stages = computed(() => systemLessonStages(this.lesson()));
  readonly exercises = computed(() => {
    const flow = this.lesson().learningFlow;
    const guide = this.guide();
    return [
      ...(flow ? [flow.practice, ...(flow.morePractice ?? [])] : []),
      // System lessons author every exercise in learningFlow; the older guide's example may use another scenario.
      ...(guide && !this.isSystem() ? [{ prompt: guide.try, hint: '', answer: guide.answer }] : []),
    ];
  });
  readonly guideLabel = computed(() =>
    this.pathId() === 'grow'
      ? 'Guided implementation'
      : this.pathId() === 'look-ahead'
        ? 'Guided decision'
        : 'Guided first steps',
  );
  readonly exerciseLabel = computed(() =>
    this.pathId() === 'grow'
      ? 'Try it and verify'
      : this.pathId() === 'look-ahead'
        ? 'Make the decision'
        : 'Try one small change',
  );

  protected cardPoints(content: string, system = false): string {
    const points = content.split(/<br\s*\/?\s*>/i).map((point) => point.trim()).filter(Boolean);
    if (points.length < 2 || /<(?:ul|ol|pre|table)\b/i.test(content)) return content;
    // System lessons: a line that is only code (a whole statement) gets its own line,
    // and the sentences around it stay prose instead of turning into bullets.
    if (system && points.some((point) => CODE_ONLY_LINE.test(point))) {
      return points
        .map((point) =>
          CODE_ONLY_LINE.test(point)
            ? point.replace(/^<code>/, '<code class="code-line">')
            : `<span class="prose-line">${point}</span>`,
        )
        .join('');
    }
    const lead = /^<strong>[^]*<\/strong>$/.test(points[0]) ? points.shift()! : '';
    const heading = lead && `<span class="points-heading">${lead}</span>`;
    if (points.length < 2) return content;
    // "1. …<br>2. …" becomes a real ordered list instead of bullets that repeat the number.
    if (points.every((point, index) => point.startsWith(`${index + 1}. `))) {
      return `${heading}<ol>${points.map((point) => `<li>${point.replace(/^\d+\.\s+/, '')}</li>`).join('')}</ol>`;
    }
    return `${heading}<ul>${points.map((point) => `<li>${point}</li>`).join('')}</ul>`;
  }

  /** "<strong>Prompt:</strong> "…"" paragraphs in system lessons are text to paste into an AI tool. */
  protected promptText(paragraph: string): string | null {
    const match = /^\s*<strong>Prompt:<\/strong>\s*([\s\S]+)$/.exec(paragraph);
    if (!match) return null;
    const text = match[1].replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
    return text.replace(/^["“](.*)["”]$/s, '$1');
  }

  /** Selected file tab per section id (DLV-408 code tabs). */
  private readonly selectedTabs = signal<Record<string, number>>({});
  /** Java | Python | Go: one choice for the page, shared with the Hands-On DSA problem page. */
  private readonly referenceLanguage = inject(ReferenceLanguageService);

  /** Tabs that show one program in Java, Python and Go (not several files). */
  protected isLanguageTabs(tabs: readonly { language: string }[] | null | undefined): boolean {
    if (!tabs || tabs.length < 2) return false;
    const languages = tabs.map((tab) => tab.language);
    return languages.every((language) => isReferenceLanguage(language)) && new Set(languages).size === languages.length;
  }

  protected languageTab(tabs: readonly LanguageTab[]): LanguageTab {
    return tabs.find((tab) => tab.language === this.referenceLanguage.selected()) ?? tabs[0];
  }

  /** Switch every language block; keep the clicked tab row where it was, since blocks above may change height. */
  protected chooseLanguage(language: string, event?: Event): void {
    const anchor = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const before = anchor?.getBoundingClientRect().top;
    this.referenceLanguage.select(language);
    if (anchor && before !== undefined && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        const shift = anchor.getBoundingClientRect().top - before;
        if (Math.abs(shift) > 1) anchor.ownerDocument.defaultView?.scrollBy(0, shift);
      });
    }
  }

  /** Arrow keys, Home and End move between language tabs (WAI-ARIA tabs, automatic activation). */
  protected languageKeydown(event: KeyboardEvent, tabs: readonly LanguageTab[]): void {
    const count = tabs.length;
    const current = tabs.indexOf(this.languageTab(tabs));
    const next =
      event.key === 'ArrowRight' ? (current + 1) % count
      : event.key === 'ArrowLeft' ? (current - 1 + count) % count
      : event.key === 'Home' ? 0
      : event.key === 'End' ? count - 1
      : -1;
    if (next < 0) return;
    event.preventDefault();
    const row = (event.currentTarget as HTMLElement).parentElement;
    this.chooseLanguage(tabs[next].language, event);
    row?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }

  protected activeTab(section: TheorySection): number {
    return this.tabIndex(section.id, section.codeTabs?.length ?? 0);
  }

  protected tabIndex(key: string, count: number): number {
    return Math.min(this.selectedTabs()[key] ?? 0, Math.max(count - 1, 0));
  }

  protected setTab(key: string, index: number): void {
    this.selectedTabs.update((tabs) => ({ ...tabs, [key]: index }));
  }

  protected pairKey(section: TheorySection, pair: TheoryPair): string {
    return `${section.id}-${pair.n}`;
  }

  protected diffMark(kind: keyof typeof DIFF_MARKS): string {
    return DIFF_MARKS[kind];
  }

  /** Split diffs per pair and language; the lesson input is immutable, so each is computed once. */
  private readonly diffs = new WeakMap<TheoryPair, Map<string, PairDiff | null>>();

  /**
   * A Debug pair as a split diff, or null when it is not a pair of programs (a weak and a strong answer in text,
   * pseudo-code, a side without code): those keep the side-by-side cards.
   */
  protected pairDiff(section: TheorySection, pair: TheoryPair): PairDiff | null {
    const broken = pair.broken.codeTabs ?? [];
    const fixed = pair.fixed.codeTabs ?? [];
    if (!broken.length || !fixed.length || [...broken, ...fixed].every((tab) => tab.language === 'text' || tab.language === 'pseudo')) {
      return null;
    }
    const languages = this.isLanguageTabs(broken) && this.isLanguageTabs(fixed);
    const key = languages ? this.referenceLanguage.selected() : '';
    let cache = this.diffs.get(pair);
    if (!cache) this.diffs.set(pair, (cache = new Map()));
    if (!cache.has(key)) cache.set(key, this.buildPairDiff(pair, languages));
    return cache.get(key)!;
  }

  private buildPairDiff(pair: TheoryPair, languages: boolean): PairDiff {
    const brokenTabs = pair.broken.codeTabs ?? [];
    const fixedTabs = pair.fixed.codeTabs ?? [];
    let files;
    let brokenOutput = pair.broken.output ?? null;
    let fixedOutput = pair.fixed.output ?? null;
    if (languages) {
      const before = this.languageTab(brokenTabs);
      const after = fixedTabs.find((tab) => tab.language === before.language) ?? this.languageTab(fixedTabs);
      files = [{ label: before.title === after.title ? before.title : `${before.title} → ${after.title}`, broken: before, fixed: after }];
      brokenOutput = before.output ?? brokenOutput;
      fixedOutput = after.output ?? fixedOutput;
    } else {
      files = pairFiles(brokenTabs, fixedTabs);
    }
    return {
      languages: languages ? [...brokenTabs] : null,
      brokenOutput,
      fixedOutput,
      files: files.map((file) => {
        const rows = fileRows(file);
        const { removed, added } = changeCount(rows);
        const renamed = !!file.broken && !!file.fixed && file.broken.title !== file.fixed.title;
        return {
          label: file.label,
          language: (file.fixed ?? file.broken)!.language,
          broken: file.broken,
          fixed: file.fixed,
          rows,
          renamed,
          unchanged: !removed && !added && !renamed,
          removed,
          added,
        };
      }),
    };
  }

  protected sideKey(section: TheorySection, pair: TheoryPair, side: 'broken' | 'fixed'): string {
    return `${section.id}-${pair.n}-${side}`;
  }

  protected sideTab(section: TheorySection, pair: TheoryPair, side: 'broken' | 'fixed') {
    const tabs = pair[side].codeTabs ?? [];
    return tabs[this.tabIndex(this.sideKey(section, pair, side), tabs.length)];
  }

  protected currentTab(section: TheorySection) {
    return section.codeTabs?.[this.activeTab(section)] ?? null;
  }

  protected selectTab(section: TheorySection, index: number): void {
    this.setTab(section.id, index);
  }

  protected tabKeydown(event: KeyboardEvent, section: TheorySection): void {
    this.moveTab(event, section.id, section.codeTabs?.length ?? 0);
  }

  /** Arrow keys, Home and End move between tabs, following the WAI-ARIA tabs pattern. */
  protected moveTab(event: KeyboardEvent, key: string, count: number): void {
    const current = this.tabIndex(key, count);
    const next =
      event.key === 'ArrowRight' ? (current + 1) % count
      : event.key === 'ArrowLeft' ? (current - 1 + count) % count
      : event.key === 'Home' ? 0
      : event.key === 'End' ? count - 1
      : -1;
    if (next < 0 || !count) return;
    event.preventDefault();
    this.setTab(key, next);
    const tabs = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="tab"]');
    tabs?.[next]?.focus();
  }

  protected languageName(language: string): string {
    return LANGUAGE_NAMES[language] ?? language;
  }

  protected languageLabel(language: string): string {
    return codeLanguageLabel(language);
  }

  protected pairLabel(section: TheorySection, side: 'broken' | 'fixed'): string {
    return section.pairLabels?.[side] ?? (side === 'broken' ? 'What broke' : 'The fix');
  }

  /** Story practice timer: one timer runs at a time; announcements every minute and at the end. */
  private readonly timer = signal<{ id: string; remaining: number; running: boolean; said: string } | null>(null);
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private readonly stopTimerOnDestroy = inject(DestroyRef).onDestroy(() => this.stopInterval());

  protected timerRemaining(id: string, seconds: number): number {
    const state = this.timer();
    return state?.id === id ? state.remaining : seconds;
  }

  protected timerRunning(id: string): boolean {
    return this.timer()?.id === id && this.timer()!.running;
  }

  protected timerAnnouncement(id: string): string {
    return this.timer()?.id === id ? this.timer()!.said : '';
  }

  protected toggleTimer(id: string, seconds: number): void {
    const state = this.timer();
    if (state?.id === id && state.running) {
      this.stopInterval();
      this.timer.set({ ...state, running: false, said: 'Paused' });
      return;
    }
    const remaining = state?.id === id && state.remaining > 0 ? state.remaining : seconds;
    this.stopInterval();
    this.timer.set({ id, remaining, running: true, said: 'Started' });
    this.timerHandle = setInterval(() => {
      const current = this.timer();
      if (!current) return;
      const next = current.remaining - 1;
      if (next <= 0) {
        this.stopInterval();
        this.timer.set({ ...current, remaining: 0, running: false, said: 'Time is up' });
      } else {
        this.timer.set({ ...current, remaining: next, said: next % 60 === 0 ? `${next / 60} minute left` : current.said });
      }
    }, 1000);
  }

  protected resetTimer(id: string): void {
    this.stopInterval();
    if (this.timer()?.id === id) this.timer.set(null);
  }

  private stopInterval(): void {
    if (this.timerHandle) clearInterval(this.timerHandle);
    this.timerHandle = null;
  }

  protected formatTime(total: number): string {
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  protected programName(title: string): string {
    return title.replace(/^Run:\s*/, '');
  }

  /** Printed lines without the final newline; blank lines stay as empty rows. */
  protected outputLines(text: string): string[] {
    return text.replace(/\n$/, '').split('\n');
  }

  /**
   * Console lines a real IDE would show in red: exceptions, stack frames, compiler errors, failed checks,
   * and, in a run that crashed, everything from the start of the crash report (a Java exception, a Python
   * traceback or a Go panic) to the end.
   */
  protected isErrorLine(line: string, output: { exitCode?: number; tool?: string; text?: string }, index = -1): boolean {
    if (/^(Exception in thread|\s+at |\[ERROR\]|FAILED)|: error: |\berrors?$/.test(line)) return true;
    if ((output.exitCode ?? 0) !== 0 && index >= 0 && output.text) {
      const start = this.outputLines(output.text).findIndex((text) => CRASH_START.test(text));
      if (start >= 0 && index >= start) return true;
    }
    return output.tool === 'Build' && (output.exitCode ?? 0) !== 0;
  }

  protected isPassLine(line: string): boolean {
    return /^PASSED\b|Failures: 0, Errors: 0|BUILD SUCCESS/.test(line);
  }

  protected lineCount(source: string | undefined): number {
    return source ? source.split('\n').length : 0;
  }

  protected tableAfter(section: TheorySection): number {
    const last = section.body.length - 1;
    return Math.min(Math.max(section.table?.afterParagraph ?? last, 0), last);
  }

  /**
   * The DSA core formats share one look: algo-pattern-v1 (Algorithmic Patterns, problem first) and concept-v1
   * (Core Data Structures, Big O, Sorting and Searching: a concept, not a problem).
   */
  readonly isAlgo = computed(() => ['algo-pattern-v1', 'concept-v1'].includes(this.lesson().lessonPattern ?? ''));

  /** A storyboard told as a story (paragraphs, sticky Pause/Play bar): Problem first, or a concept-v1 Concept. */
  protected isStory(section: TheorySection, stage: string | null | undefined): boolean {
    return !!section.problem || (stage === 'concept' && this.lesson().lessonPattern === 'concept-v1');
  }
  /** algo-pattern-v1 and concept-v1: the authored ladder replaces the generic More practice grid. */
  readonly hasLadder = computed(() => this.lesson().sections.some((section) => !!section.ladder?.length));

  protected besideVisual(section: TheorySection): boolean {
    return !!(section.tableBesideVisual && section.table && section.visual);
  }

  /** Spot the pattern: the option each learner picked, per section and item. */
  private readonly spotPicks = signal<Record<string, string>>({});

  protected spotPick(sectionId: string, index: number): string | null {
    return this.spotPicks()[`${sectionId}-${index}`] ?? null;
  }

  protected pickSpot(sectionId: string, index: number, option: string): void {
    this.spotPicks.update((picks) => ({ ...picks, [`${sectionId}-${index}`]: option }));
  }

  protected stageLabel(stageId: string | null): string {
    const stages = (this.pattern() ?? LESSON_PATTERNS['system-v1']).stages;
    return stages.find((stage) => stage.id === stageId)?.label ?? stageId ?? '';
  }

  protected brandList(brands: string[]): string {
    return brands.length < 2 ? brands.join('') : `${brands.slice(0, -1).join(', ')} or ${brands.at(-1)}`;
  }

  protected referenceLinks(body: string[]): string[] {
    return body.filter((paragraph) => /^\s*<a\s[^>]*>[\s\S]*<\/a>\s*$/.test(paragraph));
  }

  protected referenceParagraphs(body: string[]): string[] {
    const links = this.referenceLinks(body);
    return body.filter((paragraph) => !links.includes(paragraph));
  }

  protected practiceReason(questionId: string): string {
    return this.lesson().practice?.find((item) => item.questionId === questionId)?.reason ?? '';
  }

  protected practiceVariation(questionId: string): string {
    return (
      this.lesson().practice?.find((item) => item.questionId === questionId)?.variation ??
      'Foundation transfer'
    );
  }
}
