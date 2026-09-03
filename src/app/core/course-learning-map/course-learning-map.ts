import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CourseContent, CourseLearningUnit } from '../../content/content.models';
import { questionsForModule } from '../../content/question-discovery';
import { InterviewQuestionBankLink } from '../interview-question-bank-link/interview-question-bank-link';

@Component({
  selector: 'app-course-learning-map',
  imports: [RouterLink, InterviewQuestionBankLink],
  template: `
    <section class="learning-map" [attr.data-path]="pathId()" aria-label="Learning map">
      <p class="learning-map-intro">
        @if (pathId() === 'look-ahead') {
          Choose one decision practice, study its model, retrieve the invariant, and defend it in a
          scenario.
        } @else if (pathId() === 'grow') {
          Choose one capability, connect it to a production boundary, then rehearse the trade-off
          and failure path.
        } @else {
          Choose one concept, then read the model, check your understanding, and practise it in
          code.
        }
      </p>
      @for (unit of visibleUnits(); track unit.id) {
        @if (unit.planned) {
          <article
            class="learning-unit learning-unit-planned"
            aria-label="{{ unit.title }} coming next"
          >
            @if (unitOrder(unit); as order) {
              <span class="learning-unit-number">{{ order }}</span>
            }
            <span class="learning-unit-copy"
              ><strong>{{ unit.title }}</strong
              ><span>{{ unit.description }}</span></span
            >
            <span class="learning-unit-status">Coming next</span>
          </article>
        } @else if (unit.subUnits?.length) {
          <details class="learning-unit learning-unit-family">
            <summary>
              @if (unitOrder(unit); as order) {
                <span class="learning-unit-number">{{ order }}</span>
              }
              <span class="learning-unit-copy"
                ><strong>{{ unit.title }}</strong
                ><span>{{ unit.description }}</span></span
              >
              <span class="learning-unit-toggle" aria-hidden="true"></span>
            </summary>
            <div class="learning-unit-actions family-actions">
              <a class="learning-action read" [routerLink]="articleRoute(unit)"
                >Read foundation <span aria-hidden="true">→</span></a
              >
              @if (unit.questionModuleId; as questionModuleId) {
                @if (questionCount(unit); as count) {
                  <app-interview-question-bank-link
                    variant="compact"
                    [pathId]="pathId()"
                    [courseId]="courseId()"
                    [moduleId]="questionModuleId"
                    [questionCount]="count"
                  />
                }
              }
            </div>
            <div class="learning-subunits" role="list" [attr.aria-label]="subUnitGroupLabel(unit)">
              @for (subUnit of unit.subUnits; track subUnit.id; let index = $index) {
                <article class="learning-subunit" role="listitem">
                  <span class="learning-subunit-label"
                    >{{ unit.subUnitLabel ?? 'Subpattern' }} {{ index + 1 }}</span
                  >
                  <span class="learning-unit-copy"
                    ><strong>{{ subUnit.title }}</strong
                    ><span>{{ subUnit.description }}</span></span
                  >
                  <div class="learning-subunit-actions">
                    <a class="learning-action read" [routerLink]="articleRoute(subUnit)"
                      >Read lesson <span aria-hidden="true">→</span></a
                    >
                    @if (subUnit.questionModuleId; as questionModuleId) {
                      @if (questionCount(subUnit); as count) {
                        <app-interview-question-bank-link
                          variant="compact"
                          [pathId]="pathId()"
                          [courseId]="courseId()"
                          [moduleId]="questionModuleId"
                          [questionCount]="count"
                        />
                      }
                    }
                    @if (subUnit.practiceModuleId) {
                      <a
                        class="learning-action practice"
                        [routerLink]="['/', pathId(), 'hands-on-dsa']"
                        [queryParams]="{ pattern: subUnit.id }"
                        >Practice <span aria-hidden="true">→</span></a
                      >
                    }
                  </div>
                </article>
              }
            </div>
          </details>
        } @else if (isReadOnly(unit)) {
          <a class="learning-unit learning-unit-direct" [routerLink]="articleRoute(unit)">
            @if (unitOrder(unit); as order) {
              <span class="learning-unit-number">{{ order }}</span>
            }
            <span class="learning-unit-copy"
              ><strong>{{ unit.title }}</strong
              ><span>{{ unit.description }}</span></span
            >
          </a>
        } @else {
          <details class="learning-unit">
            <summary>
              @if (unitOrder(unit); as order) {
                <span class="learning-unit-number">{{ order }}</span>
              }
              <span class="learning-unit-copy"
                ><strong>{{ unit.title }}</strong
                ><span>{{ unit.description }}</span></span
              >
              <span class="learning-unit-toggle" aria-hidden="true"></span>
            </summary>
            <div class="learning-unit-actions">
              <a class="learning-action read" [routerLink]="articleRoute(unit)"
                >Read lesson <span aria-hidden="true">→</span></a
              >
              @if (unit.questionModuleId; as questionModuleId) {
                @if (questionCount(unit); as count) {
                  <app-interview-question-bank-link
                    variant="compact"
                    [pathId]="pathId()"
                    [courseId]="courseId()"
                    [moduleId]="questionModuleId"
                    [questionCount]="count"
                  />
                }
              }
              @if (unit.practiceModuleId) {
                <a
                  class="learning-action practice"
                  [routerLink]="moduleRoute(unit.practiceModuleId)"
                  >Practice <span aria-hidden="true">→</span></a
                >
              }
            </div>
          </details>
        }
      }
    </section>
  `,
  styles: [
    `
      .learning-map {
        --learning-accent: #168ca5;
        --learning-surface: #f1fbfc;
        --learning-glow: rgba(22, 140, 165, 0.12);
        display: grid;
        gap: 10px;
        max-width: 1040px;
        margin: 0 auto;
      }
      .learning-map[data-path='grow'] {
        --learning-accent: #b45309;
        --learning-surface: #fff6ed;
        --learning-glow: rgba(180, 83, 9, 0.12);
      }
      .learning-map[data-path='look-ahead'] {
        --learning-accent: #2f6f8e;
        --learning-surface: #eef7f8;
        --learning-glow: rgba(47, 111, 142, 0.12);
      }
      .learning-map-intro {
        margin: 0 0 8px;
        color: #62748d;
        line-height: 1.55;
      }
      .learning-unit {
        overflow: hidden;
        border: 1px solid #d5e1ef;
        border-left: 5px solid transparent;
        border-radius: 14px;
        background: #fff;
        transition:
          border-color 0.16s ease,
          border-left-color 0.16s ease,
          box-shadow 0.16s ease,
          transform 0.16s ease;
      }
      .learning-unit:hover,
      .learning-unit:focus-within,
      .learning-unit[open] {
        border-color: #dbe3ee;
        border-left-color: var(--learning-accent);
        background: linear-gradient(145deg, #fff 20%, var(--learning-surface));
        box-shadow: 0 12px 30px var(--learning-glow);
        transform: translateY(-2px);
      }
      .learning-unit summary {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 20px 22px;
        cursor: pointer;
        list-style: none;
      }
      .learning-unit-direct,
      .learning-unit-planned {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 20px 22px;
        color: inherit;
        text-decoration: none;
      }
      .learning-unit-planned {
        border-left-color: #cbd5e1;
        background: #f8fafc;
      }
      .learning-unit-planned:hover {
        transform: none;
        box-shadow: none;
        border-color: #dbe3ee;
        border-left-color: #cbd5e1;
        background: #f8fafc;
      }
      .learning-unit summary::-webkit-details-marker {
        display: none;
      }
      .learning-unit-number {
        color: var(--learning-accent);
        font-size: 0.73rem;
        font-weight: 850;
        letter-spacing: 0.08em;
      }
      .learning-unit-copy {
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .learning-unit-copy strong {
        color: #172033;
        font-size: 1.08rem;
      }
      .learning-unit-copy span {
        color: #66778f;
        line-height: 1.45;
      }
      .learning-unit-status {
        margin-left: auto;
        color: #64748b;
        font-size: 0.76rem;
        font-weight: 800;
        white-space: nowrap;
      }
      .learning-unit-toggle {
        width: 10px;
        height: 10px;
        margin-left: auto;
        border-right: 2px solid var(--learning-accent);
        border-bottom: 2px solid var(--learning-accent);
        transform: rotate(45deg) translateY(-3px);
        transition: transform 0.16s ease;
      }
      .learning-unit[open] .learning-unit-toggle {
        transform: rotate(225deg) translateY(-2px);
      }
      .learning-unit-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        padding: 0 22px 20px 72px;
        border-top: 1px solid #e5edf5;
      }
      .learning-unit-actions.family-actions {
        padding-bottom: 16px;
      }
      .learning-action {
        display: inline-flex;
        min-height: 44px;
        box-sizing: border-box;
        align-items: center;
        gap: 6px;
        margin-top: 16px;
        padding: 9px 13px;
        border: 1px solid #c7d9ec;
        border-radius: 8px;
        color: var(--learning-accent);
        background: #fff;
        font-size: 0.82rem;
        font-weight: 800;
        text-decoration: none;
      }
      .learning-action:hover,
      .learning-action:focus-visible {
        outline: none;
        border-color: var(--learning-accent);
        background: var(--learning-surface);
      }
      .learning-subunits {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        padding: 0 22px 22px 72px;
      }
      .learning-subunit {
        display: grid;
        align-content: start;
        gap: 10px;
        min-width: 0;
        padding: 17px;
        border: 1px solid #dce8f2;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.82);
      }
      .learning-subunit-label {
        color: var(--learning-accent);
        font-size: 0.68rem;
        font-weight: 850;
        letter-spacing: 0.09em;
        text-transform: uppercase;
      }
      .learning-subunit-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: auto;
      }
      .learning-subunit-actions .learning-action {
        margin-top: 4px;
      }
      @media (prefers-reduced-motion: reduce) {
        .learning-unit,
        .learning-unit-toggle {
          transition: none;
        }
      }
      @media (forced-colors: active) {
        .learning-unit,
        .learning-subunit,
        .learning-action {
          border-color: CanvasText;
          color: CanvasText;
          background: Canvas;
          box-shadow: none;
        }
        .learning-unit-number,
        .learning-subunit-label {
          color: CanvasText;
        }
      }
      @media (max-width: 720px) {
        .learning-subunits {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      @media (max-width: 620px) {
        .learning-unit summary,
        .learning-unit-direct,
        .learning-unit-planned {
          align-items: flex-start;
          padding: 17px;
          gap: 11px;
        }
        .learning-unit-actions,
        .learning-subunits {
          padding: 0 17px 17px;
        }
        .learning-unit-copy strong {
          font-size: 1rem;
        }
        .learning-unit-status {
          display: none;
        }
      }
    `,
  ],
})
export class CourseLearningMap {
  readonly course = input.required<CourseContent>();
  readonly pathId = input.required<string>();
  readonly courseId = input.required<string>();
  readonly units = input.required<CourseLearningUnit[]>();
  protected readonly visibleUnits = computed(() => {
    const publishedModuleIds = new Set(this.course().modules.map((module) => module.id));
    return this.units().filter(
      (unit) => unit.planned || publishedModuleIds.has(unit.theoryModuleId),
    );
  });

  protected articleRoute(unit: CourseLearningUnit): string[] {
    const article = this.course().questions.find(
      (question) => question.moduleId === unit.theoryModuleId && question.contentType === 'theory',
    );
    return article
      ? ['/', this.pathId(), this.courseId(), article.id]
      : ['/', this.pathId(), this.courseId()];
  }

  protected isReadOnly(unit: CourseLearningUnit): boolean {
    return !unit.practiceModuleId && this.questionCount(unit) === 0;
  }

  protected questionCount(unit: CourseLearningUnit): number {
    return questionsForModule(this.course(), unit.questionModuleId).length;
  }

  protected unitOrder(unit: CourseLearningUnit): string | null {
    if (unit.hideOrder) return null;
    const order =
      this.visibleUnits()
        .filter((candidate) => !candidate.hideOrder)
        .indexOf(unit) + 1;
    return order.toString().padStart(2, '0');
  }

  protected moduleRoute(moduleId: string): string[] {
    return ['/', this.pathId(), this.courseId(), 'module', moduleId];
  }

  protected subUnitGroupLabel(unit: CourseLearningUnit): string {
    const label = unit.subUnitLabel?.toLowerCase() ?? 'subpattern';
    return `${unit.title} ${label}s`;
  }
}
