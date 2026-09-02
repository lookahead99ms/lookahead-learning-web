import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InterviewQuestion, TheoryVisual } from '../../content/content.models';
import { CodingSolutionTabs } from '../coding-solution-tabs/coding-solution-tabs';

@Component({
  selector: 'app-coding-problem-detail',
  imports: [RouterLink, CodingSolutionTabs],
  template: `
    <section class="coding-problem-detail" aria-label="Coding problem workspace">
      <div class="coding-problem-links">
        @if (relatedArticleId()) {
          <a [routerLink]="['/', pathId(), courseId(), relatedArticleId()]">← Review related theory</a>
        }
        @if (leetcodeUrl()) {
          <a [href]="leetcodeUrl()" target="_blank" rel="noopener noreferrer">Open the original LeetCode problem ↗</a>
        }
      </div>
      @if (sampleInput(); as sample) {
        <p class="coding-sample-input"><span>Example input</span><code>{{ sample }}</code></p>
      }
      <details class="coding-hint">
        <summary>Show hint <span aria-hidden="true">›</span></summary>
        <p [innerHTML]="item().interviewAnswer"></p>
      </details>
      @if (item().solutions?.length) {
        <app-coding-solution-tabs [solutions]="item().solutions!" [complexity]="item().complexity" [visual]="visual()" />
      }
      <section class="coding-explanation">
        <p class="panel-label">Why this works</p>
        @for (paragraph of item().explanation; track paragraph) {
          <p [innerHTML]="paragraph"></p>
        }
      </section>
      @if (item().followUps.length) {
        <section class="coding-followups">
          <p class="panel-label">Build on the solution</p>
          @for (followUp of item().followUps; track followUp.question) {
            <details><summary>{{ followUp.question }}</summary><p>{{ followUp.answer }}</p></details>
          }
        </section>
      }
    </section>
  `,
  styles: [`
    .coding-problem-detail{margin:0 auto 36px;max-width:1120px}.coding-problem-links{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 12px}.coding-problem-links a{color:#168ca5;font-size:.82rem;font-weight:800;text-decoration:none}.coding-problem-links a:last-child{color:#b45309}.coding-problem-links a:hover,.coding-problem-links a:focus-visible{text-decoration:underline;outline:none}.coding-sample-input{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;margin:0 0 12px;color:#334155}.coding-sample-input span{color:#64748b;font-size:.68rem;font-weight:850;letter-spacing:.06em;text-transform:uppercase}.coding-sample-input code{font-size:.84rem}.coding-hint{margin:0 0 8px;overflow:hidden;border:1px solid #cbdcec;border-left:5px solid #168ca5;border-radius:12px;background:#f0f7ff}.coding-hint summary{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;color:#315f9d;cursor:pointer;font-size:.8rem;font-weight:850;letter-spacing:.08em;text-transform:uppercase}.coding-hint summary::-webkit-details-marker{display:none}.coding-hint summary span{font-size:1.3rem;transition:transform .15s ease}.coding-hint[open] summary span{transform:rotate(90deg)}.coding-hint p{margin:0;padding:0 16px 15px;color:#334155;line-height:1.72}.coding-explanation,.coding-followups{margin:24px 0 0;padding:24px;border:1px solid #dbe3ee;border-radius:14px;background:#fff}.coding-explanation p:not(.panel-label){color:#334155;line-height:1.72}.coding-explanation p:not(.panel-label):last-child{margin-bottom:0}.coding-followups details+details{margin-top:8px}.coding-followups summary{cursor:pointer;color:#172033;font-weight:750}.coding-followups details p{margin:8px 0 0;color:#475569;line-height:1.65}
  `],
})
export class CodingProblemDetail {
  readonly item = input.required<InterviewQuestion>();
  readonly pathId = input.required<string>();
  readonly courseId = input.required<string>();
  readonly relatedArticleId = input<string>();
  readonly leetcodeUrl = input<string | null>(null);
  readonly visual = input<TheoryVisual | null>(null);
  readonly sampleInput = computed(() => ({
    'core-ds-dynamic-append': 'values = [7, 2, 9, 4, 6]',
    'core-ds-dynamic-remove-stable': 'values = [7, 2, 9, 4], index = 1',
    'core-ds-dynamic-remove-unordered': 'values = [7, 2, 9, 4], index = 1',
    'core-ds-remove-duplicates-sorted': 'nums = [1, 1, 2]',
    'core-ds-insert-delete-random': 'insert(1), remove(2), insert(2), getRandom()',
  }[this.item().id] ?? null));
}
