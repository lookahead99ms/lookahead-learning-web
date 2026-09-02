import { Component, computed, effect, input, signal } from '@angular/core';
import { CodeSolution, InterviewQuestion, TheoryVisual } from '../../content/content.models';
import { InteractiveTheoryVisual } from '../interactive-theory-visual/interactive-theory-visual';
import { CodeCopyButton } from '../code-copy-button/code-copy-button';

type Tab = 'practice' | 'pseudocode' | number;
type Language = 'java' | 'python' | 'go';

@Component({
  selector: 'app-coding-solution-tabs',
  imports: [InteractiveTheoryVisual, CodeCopyButton],
  template: `
    <section
      class="coding-workspace"
      aria-label="Practice and reference solutions"
      [class.material-theme]="editorTheme() === 'material-theme'"
      [class.one-dark]="editorTheme() === 'one-dark'"
      [class.gerry-theme]="editorTheme() === 'gerry-theme'"
    >
      <div class="coding-tabs" role="tablist" aria-label="Coding workspace tabs">
        @if (showPractice()) {
          <button
            class="practice-tab"
            type="button"
            role="tab"
            [attr.aria-selected]="selected() === 'practice'"
            (click)="selected.set('practice')"
          >
            Practice it yourself
          </button>
        }
        @if (pseudocode()) {
          <button
            class="pseudocode-tab"
            type="button"
            role="tab"
            [attr.aria-selected]="selected() === 'pseudocode'"
            (click)="selected.set('pseudocode')"
          >
            Pseudocode
          </button>
        }
        @for (solution of solutions(); track solution.language; let index = $index) {
          <button
            class="language-tab"
            type="button"
            role="tab"
            [attr.aria-selected]="selected() === index"
            (click)="selected.set(index)"
          >
            {{ solution.language }}
          </button>
        }
      </div>
      @if (showPractice() && selected() === 'practice') {
        <section class="practice-view" role="tabpanel">
          <div class="workspace-toolbar">
            <div>
              <strong>Start with your own solution</strong>
              <p>
                {{
                  practicePrompt() || 'Write the invariant first, then dry-run a small edge case.'
                }}
              </p>
            </div>
            <label
              >Language<select
                [value]="practiceLanguage()"
                (change)="setPracticeLanguage($any($event.target).value)"
              >
                <option value="java">Java</option>
                <option value="python">Python</option>
                <option value="go">Go</option>
              </select></label
            >
          </div>
          <div class="editor-shell">
            <div class="editor-chrome">
              <span>{{ editorFilename() }}</span>
              <div class="editor-actions">
                <app-code-copy-button [code]="practiceCode()" /><button
                  type="button"
                  (click)="resetPractice()"
                >
                  Reset starter
                </button>
              </div>
            </div>
            <textarea
              [value]="practiceCode()"
              (input)="practiceCode.set($any($event.target).value)"
              [attr.aria-label]="'Practice editor for ' + practiceLanguage()"
              spellcheck="false"
            ></textarea>
          </div>
          <p class="workspace-note">
            This local editor keeps your work on the page. Compare it with a reference solution when
            you are ready.
          </p>
        </section>
      } @else if (selected() === 'pseudocode' && pseudocode(); as pseudo) {
        <section class="solution-view pseudocode-view" role="tabpanel">
          <div class="solution-heading">
            <strong>{{ pseudo.title }}</strong>
            <div class="editor-actions">
              <span>Pseudocode</span><app-code-copy-button [code]="pseudo.source" />
            </div>
          </div>
          <pre><code [innerHTML]="highlightedPseudocode()"></code></pre>
        </section>
      } @else if (activeSolution(); as solution) {
        <section class="solution-view" role="tabpanel">
          @if (visualWithLanguage(); as activeVisual) {
            <div class="debug-toolbar">
              <p class="debug-input-example">
                <span>{{
                  visualInput() === 'default' ? 'LeetCode sample input' : 'Platform test input'
                }}</span
                >{{ visualInputExample() }}
              </p>
              <label
                >Example<select
                  [value]="visualInput()"
                  (change)="visualInput.set($any($event.target).value)"
                >
                  <option value="default">Standard example</option>
                  <option value="zero">Platform: contains zero</option>
                  <option value="negative">Platform: negative values</option>
                </select></label
              >
            </div>
            <app-interactive-theory-visual [visual]="activeVisual" />
          } @else {
            <div class="solution-heading">
              <strong>{{ solution.title }}</strong>
              <div class="editor-actions">
                <span>{{ editorThemeLabel() || solution.language }}</span
                ><app-code-copy-button [code]="solution.source" />
              </div>
            </div>
            <pre><code [innerHTML]="highlightedSource()"></code></pre>
          }
          @if (complexity(); as costs) {
            <div class="solution-complexity">
              <div>
                <span>Time</span><strong>{{ costs.time }}</strong>
              </div>
              <div>
                <span>Space</span><strong>{{ costs.space }}</strong>
              </div>
              <p>{{ costs.note }}</p>
            </div>
          }
        </section>
      }
    </section>
  `,
  styles: [
    `
      .coding-workspace {
        margin: 24px 0;
        overflow: hidden;
        border: 1px solid #c8d9e9;
        border-radius: 14px;
        background: #fff;
        box-shadow: 0 10px 28px rgba(26, 50, 80, 0.08);
      }
      .coding-tabs {
        display: flex;
        overflow-x: auto;
        padding: 0 10px;
        border-bottom: 1px solid #d8e3ee;
        background: #f8fafc;
      }
      .coding-tabs button {
        flex: 0 0 auto;
        min-height: 52px;
        padding: 0 17px;
        border: 0;
        border-bottom: 3px solid transparent;
        color: #64748b;
        background: transparent;
        cursor: pointer;
        font:
          800 0.8rem Inter,
          ui-sans-serif,
          system-ui,
          sans-serif;
      }
      .coding-tabs .practice-tab {
        color: #168ca5;
      }
      .coding-tabs .pseudocode-tab {
        color: #0f766e;
      }
      .coding-tabs .language-tab {
        color: #b45309;
      }
      .coding-tabs button[aria-selected='true'] {
        background: #fff;
        border-bottom-color: currentColor;
      }
      .coding-tabs button:focus-visible {
        outline: 3px solid rgba(52, 126, 205, 0.28);
        outline-offset: -3px;
      }
      .workspace-toolbar,
      .debug-toolbar {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding: 15px 18px;
        background: linear-gradient(110deg, #f7fcfe, #fffaf6);
        color: #334155;
      }
      .workspace-toolbar strong {
        color: #172033;
      }
      .workspace-toolbar p {
        display: block;
        margin: 4px 0 0;
        color: #64748b;
        font-size: 0.82rem;
        line-height: 1.45;
      }
      .workspace-toolbar label,
      .debug-toolbar label {
        display: grid;
        gap: 4px;
        color: #64748b;
        font-size: 0.68rem;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .debug-input-example {
        display: grid !important;
        gap: 3px;
        margin: 0 !important;
        color: #172033 !important;
        font:
          700 0.9rem/1.35 'JetBrains Mono',
          'SFMono-Regular',
          Consolas,
          monospace !important;
      }
      .debug-input-example span {
        color: #64748b;
        font:
          800 0.68rem Inter,
          ui-sans-serif,
          system-ui,
          sans-serif;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      select {
        min-width: 145px;
        padding: 6px 24px 6px 8px;
        border: 1px solid #b9c9db;
        border-radius: 7px;
        color: #172033;
        background: #fff;
        font:
          700 0.8rem Inter,
          ui-sans-serif,
          system-ui,
          sans-serif;
      }
      .editor-shell,
      .solution-view {
        overflow: hidden;
        background: #0d1117;
      }
      .editor-chrome,
      .solution-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 14px;
        border-bottom: 1px solid #30363d;
        color: #8b949e;
        background: #161b22;
        font:
          700 0.75rem 'JetBrains Mono',
          'SFMono-Regular',
          Consolas,
          monospace;
      }
      .editor-actions {
        display: flex;
        align-items: center;
        gap: 9px;
      }
      .editor-chrome > button,
      .editor-actions > button {
        padding: 4px 8px;
        border: 1px solid #30363d;
        border-radius: 6px;
        color: #c9d1d9;
        background: #21262d;
        cursor: pointer;
        font: inherit;
      }
      textarea,
      pre {
        display: block;
        width: 100%;
        min-height: 290px;
        margin: 0;
        padding: 18px;
        border: 0;
        color: #d8e1ef;
        background: #0d1117;
        font:
          14px/1.65 'JetBrains Mono',
          'SFMono-Regular',
          Consolas,
          monospace;
        tab-size: 2;
      }
      textarea {
        resize: vertical;
        outline: none;
      }
      pre {
        overflow: visible;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .solution-heading strong {
        color: #c9d1d9;
      }
      .solution-heading span {
        color: #58a6ff;
      }
      :host ::ng-deep .coding-workspace code .token-keyword {
        color: #ff7b72;
        font-weight: 700;
      }
      :host ::ng-deep .coding-workspace code .token-string {
        color: #a5d6ff;
      }
      :host ::ng-deep .coding-workspace code .token-number {
        color: #d2a8ff;
      }
      :host ::ng-deep .coding-workspace code .token-comment {
        color: #8b949e;
        font-style: italic;
      }
      :host ::ng-deep .coding-workspace code .token-type {
        color: #ffa657;
        font-weight: 650;
      }
      .material-theme .solution-view {
        background: #263238;
      }
      .material-theme .solution-heading {
        border-bottom-color: #1e272c;
        color: #b2ccd6;
        background: #1e272c;
      }
      .material-theme pre {
        color: #b2ccd6;
        background: #263238;
      }
      .material-theme .solution-heading strong {
        color: #eeffff;
      }
      .material-theme .solution-heading span {
        color: #89ddff;
      }
      :host ::ng-deep .material-theme code .token-keyword {
        color: #c792ea;
      }
      :host ::ng-deep .material-theme code .token-string {
        color: #c3e88d;
      }
      :host ::ng-deep .material-theme code .token-number {
        color: #f78c6c;
      }
      :host ::ng-deep .material-theme code .token-comment {
        color: #546e7a;
      }
      :host ::ng-deep .material-theme code .token-type {
        color: #ffcb6b;
      }
      .one-dark .solution-view {
        background: #282c34;
      }
      .one-dark .solution-heading {
        border-bottom-color: #21252b;
        color: #abb2bf;
        background: #21252b;
      }
      .one-dark pre {
        color: #abb2bf;
        background: #282c34;
      }
      .one-dark .solution-heading strong {
        color: #abb2bf;
      }
      .one-dark .solution-heading span {
        color: #61afef;
      }
      :host ::ng-deep .one-dark code .token-keyword {
        color: #c678dd;
      }
      :host ::ng-deep .one-dark code .token-string {
        color: #98c379;
      }
      :host ::ng-deep .one-dark code .token-number {
        color: #d19a66;
      }
      :host ::ng-deep .one-dark code .token-comment {
        color: #5c6370;
      }
      :host ::ng-deep .one-dark code .token-type {
        color: #e5c07b;
      }
      .gerry-theme .solution-view {
        background: #14161a;
      }
      .gerry-theme .solution-heading {
        border-bottom-color: #22252b;
        color: #c7ccd1;
        background: #1a1d23;
      }
      .gerry-theme pre {
        color: #c7ccd1;
        background: #14161a;
      }
      .gerry-theme .solution-heading strong {
        color: #eef0f6;
      }
      .gerry-theme .solution-heading span {
        color: #7aa2f7;
      }
      :host ::ng-deep .gerry-theme code .token-keyword {
        color: #ff6ac1;
      }
      :host ::ng-deep .gerry-theme code .token-string {
        color: #7fd88f;
      }
      :host ::ng-deep .gerry-theme code .token-number {
        color: #ffb86c;
      }
      :host ::ng-deep .gerry-theme code .token-comment {
        color: #676e95;
      }
      :host ::ng-deep .gerry-theme code .token-type {
        color: #7aa2f7;
      }
      .workspace-note {
        margin: 0;
        padding: 11px 18px;
        color: #64748b;
        background: #f8fafc;
        font-size: 0.78rem;
        line-height: 1.5;
      }
      .solution-complexity {
        display: grid;
        grid-template-columns: auto auto minmax(0, 1fr);
        gap: 20px;
        align-items: center;
        padding: 13px 16px;
        color: #334155;
        background: #f8fafc;
      }
      .solution-complexity div {
        display: grid;
        gap: 2px;
      }
      .solution-complexity span {
        color: #64748b;
        font-size: 0.68rem;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .solution-complexity strong {
        color: #172033;
        font-size: 0.88rem;
      }
      .solution-complexity p {
        margin: 0;
        color: #64748b;
        font-size: 0.78rem;
        line-height: 1.45;
      }
      .solution-view app-interactive-theory-visual {
        display: block;
        border-top: 1px solid #d8e3ee;
      }
      @media (max-width: 760px) {
        .workspace-toolbar,
        .debug-toolbar {
          align-items: stretch;
          flex-direction: column;
        }
        .workspace-toolbar label,
        .debug-toolbar label {
          width: max-content;
        }
        .solution-complexity {
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .solution-complexity p {
          grid-column: 1/-1;
        }
        .editor-chrome,
        .solution-heading {
          align-items: flex-start;
          flex-direction: column;
        }
        .editor-actions {
          width: 100%;
          justify-content: space-between;
        }
      }
    `,
  ],
})
export class CodingSolutionTabs {
  readonly solutions = input.required<CodeSolution[]>();
  readonly complexity = input<InterviewQuestion['complexity']>();
  readonly practicePrompt = input<string>();
  readonly showPractice = input(true);
  readonly useLanguageThemes = input(false);
  readonly visual = input<TheoryVisual | null>(null);
  readonly pseudocode = input<{ title: string; source: string } | null>(null);

  protected readonly selected = signal<Tab>('practice');
  protected readonly practiceLanguage = signal<Language>('java');
  protected readonly visualInput = signal('default');
  protected readonly practiceCode = signal(this.starter('java'));
  protected readonly selectedSolutionIndex = computed<number>(() => {
    const selected = this.selected();
    return typeof selected === 'number' ? selected : 0;
  });
  protected readonly activeSolution = computed(
    () => this.solutions()[this.selectedSolutionIndex()] ?? null,
  );
  protected readonly editorTheme = computed<'material-theme' | 'one-dark' | 'gerry-theme' | null>(
    () => {
      if (!this.useLanguageThemes()) return null;
      const language = this.activeSolution()?.language.toLowerCase();
      return language === 'java'
        ? 'material-theme'
        : language === 'python'
          ? 'one-dark'
          : language === 'go'
            ? 'gerry-theme'
            : null;
    },
  );
  protected readonly editorThemeLabel = computed(() => {
    switch (this.editorTheme()) {
      case 'material-theme':
        return 'Java · Material Theme UI';
      case 'one-dark':
        return 'Python · One Dark';
      case 'gerry-theme':
        return 'Go · Gerry Theme';
      default:
        return '';
    }
  });
  protected readonly highlightedSource = computed(() =>
    this.highlight(this.activeSolution()?.source ?? ''),
  );
  protected readonly highlightedPseudocode = computed(() =>
    this.highlightPseudocode(this.pseudocode()?.source ?? ''),
  );
  protected readonly editorFilename = computed(
    () =>
      ({ java: 'Solution.java', python: 'solution.py', go: 'solution.go' })[
        this.practiceLanguage()
      ],
  );
  protected readonly visualWithLanguage = computed<TheoryVisual | null>(() => {
    const visual = this.visual();
    const solution = this.activeSolution();
    if (!visual || !solution || visual.type !== 'interactive') return null;
    const [path, hash = ''] = visual.assetPath.split('#');
    const source = encodeURIComponent(btoa(unescape(encodeURIComponent(solution.source))));
    return {
      ...visual,
      assetPath: `${path}?lang=${solution.language.toLowerCase()}&input=${this.visualInput()}${hash ? `&problem=${hash}` : ''}&source=${source}`,
    };
  });
  protected readonly visualInputExample = computed(() => {
    const problem = this.visual()?.assetPath.split('#')[1] ?? '';
    const examples: Record<string, Record<string, string>> = {
      'max-min': { default: '[7, 2, 9, 4]', zero: '[7, 0, 9, 4]', negative: '[-7, -2, -9, -4]' },
      reverse: { default: '[4, 6, 8, 10]', zero: '[4, 0, 8, 10]', negative: '[-4, 6, -8, 10]' },
      'valid-palindrome': {
        default: 's = "A man, a plan, a canal: Panama"',
        zero: 's = ""',
        negative: 'Platform test: no numeric values apply; use the standard example',
      },
      'container-water': {
        default: 'height = [1,8,6,2,5,4,8,3,7]',
        zero: 'height = [0,0,0]',
        negative: 'Platform test: heights are non-negative; use the standard example',
      },
      'longest-distinct': {
        default: 's = "abcabcbb"',
        zero: 's = ""',
        negative: 'Platform test: no numeric values apply; use the standard example',
      },
      'minimum-window': {
        default: 's = "ADOBECODEBANC", t = "ABC"',
        zero: 's = "", t = "A"',
        negative: 'Platform test: no numeric values apply; use the standard example',
      },
      'two-sum': {
        default: 'nums = [2, 7, 11, 15], target = 9',
        zero: 'nums = [0, 4, 3, 0], target = 0',
        negative: 'nums = [-3, 4, 3, 90], target = 0',
      },
      stock: {
        default: 'prices = [7, 1, 5, 3, 6, 4]',
        zero: 'prices = [7, 0, 5, 0, 6]',
        negative: 'prices = [-7, -1, -5, -3, -6]',
      },
      product: {
        default: 'nums = [1, 2, 3, 4]',
        zero: 'nums = [1, 2, 0, 4]',
        negative: 'nums = [-1, 2, -3, 4]',
      },
      'reverse-list': {
        default: 'head = [1, 2, 3, 4]',
        zero: 'head = [1, 0, 3]',
        negative: 'head = [-1, -2, -3]',
      },
      'cycle-entry': {
        default: 'head = [3, 2, 0, -4], pos = 1',
        zero: 'head = [0], pos = 0',
        negative: 'head = [-1, -2], pos = 0',
      },
      'merge-lists': {
        default: 'list1 = [1, 2, 4], list2 = [1, 3, 4]',
        zero: 'list1 = [0, 2], list2 = [0, 3]',
        negative: 'list1 = [-3, 1], list2 = [-2, 2]',
      },
      'copy-random': {
        default: '[[7,null], [13,0], [11,2]]',
        zero: '[[0,null], [1,0]]',
        negative: '[[-1,1], [-2,0]]',
      },
      'valid-parentheses': { default: 's = "()[]{}"', zero: 's = ""', negative: 's = "([)]"' },
      'daily-temperatures': {
        default: 'temperatures = [73, 74, 75, 71, 69, 72, 76, 73]',
        zero: 'temperatures = [0, 0, 1]',
        negative: 'temperatures = [-3, -1, -2]',
      },
      'queue-stacks': {
        default: 'push(1), push(2), peek(), pop()',
        zero: 'push(0), pop()',
        negative: 'push(-1), push(-2), pop()',
      },
      'sliding-window': {
        default: 'nums = [1, 3, -1, -3, 5, 3, 6, 7], k = 3',
        zero: 'nums = [0, 0, 1], k = 2',
        negative: 'nums = [-1, -3, -2], k = 2',
      },
      'contains-duplicate': {
        default: 'nums = [1, 2, 3, 1]',
        zero: 'nums = [0, 1, 0]',
        negative: 'nums = [-1, -2, -1]',
      },
      'longest-consecutive': {
        default: 'nums = [100, 4, 200, 1, 3, 2]',
        zero: 'nums = [0, 1, 2, 0]',
        negative: 'nums = [-3, -2, -1, 4]',
      },
      'subarray-sum': {
        default: 'nums = [1, 1, 1], k = 2',
        zero: 'nums = [0, 0, 0], k = 0',
        negative: 'nums = [1, -1, 0], k = 0',
      },
      'range-sum': {
        default: 'nums = [-2, 0, 3, -5, 2, -1]',
        zero: 'nums = [0, 0, 3], left = 0, right = 2',
        negative: 'nums = [-5, -2, -3], left = 1, right = 2',
      },
      'car-pooling': {
        default: 'trips = [[2,1,5],[3,3,7]], capacity = 4',
        zero: 'trips = [[1,0,2]], capacity = 1',
        negative: 'Platform test: coordinates are non-negative; use standard input',
      },
      factorial: {
        default: 'n = 5',
        zero: 'n = 0',
        negative: 'Platform test: n is non-negative; use the standard example',
      },
      'fibonacci-memo': {
        default: 'n = 10',
        zero: 'n = 0',
        negative: 'Platform test: n is non-negative; use the standard example',
      },
      'reverse-string': {
        default: "s = ['h','e','l','l','o']",
        zero: 's = []',
        negative: 'Platform test: no numeric values apply; use the standard example',
      },
      'generate-parentheses': {
        default: 'n = 3',
        zero: 'n = 0',
        negative: 'Platform test: n is non-negative; use the standard example',
      },
      combinations: {
        default: 'n = 4, k = 2',
        zero: 'n = 0, k = 0',
        negative: 'Platform test: n and k are non-negative; use the standard example',
      },
      'combination-sum': {
        default: 'candidates = [2, 3, 6, 7], target = 7',
        zero: 'candidates = [2, 3], target = 0',
        negative: 'Platform test: candidates are positive; use the standard example',
      },
      'max-subarray-dc': {
        default: 'nums = [-2, 1, -3, 4, -1, 2, 1, -5, 4]',
        zero: 'nums = [0, -1, 2, 0]',
        negative: 'nums = [-1, -2, -3, -4]',
      },
      'pow-fast-exp': {
        default: 'x = 2.0, n = 10',
        zero: 'x = 2.0, n = 0',
        negative: 'x = 2.0, n = -2',
      },
      'merge-sorted-array': {
        default: 'nums1 = [1,2,3,0,0,0], m = 3, nums2 = [2,5,6], n = 3',
        zero: 'nums1 = [0,0], m = 1, nums2 = [0], n = 1',
        negative: 'nums1 = [-1,3,0], m = 2, nums2 = [-2], n = 1',
      },
      'kth-largest': {
        default: 'nums = [3,2,1,5,6,4], k = 2',
        zero: 'nums = [0,0,1], k = 1',
        negative: 'nums = [-1,-2,-3], k = 2',
      },
      'tree-path-sum': {
        default: 'root = [5,4,8,11,null,13,4,7,2], targetSum = 22',
        zero: 'root = [0,null,1], targetSum = 1',
        negative: 'root = [-2,null,-3], targetSum = -5',
      },
      'tree-diameter': {
        default: 'root = [1,2,3,4,5]',
        zero: 'root = [0]',
        negative: 'root = [-1,-2,-3]',
      },
      'assign-cookies': {
        default: 'g = [1,2,3], s = [1,1]',
        zero: 'g = [0], s = [0]',
        negative:
          'Platform test: greed factors and sizes are non-negative; use the standard example',
      },
      'lemonade-change': {
        default: 'bills = [5,5,5,10,20]',
        zero: 'bills = [5,5,10]',
        negative: 'Platform test: bills are non-negative; use the standard example',
      },
      'best-time-buy-sell-stock': {
        default: 'prices = [7,1,5,3,6,4]',
        zero: 'prices = [0,0,0]',
        negative: 'prices = [-1,-2,-3]',
      },
      'longest-increasing-subsequence': {
        default: 'nums = [10,9,2,5,3,7,101,18]',
        zero: 'nums = [0,0,0]',
        negative: 'nums = [-3,-1,-2]',
      },
      'unique-paths': {
        default: 'm = 3, n = 7',
        zero: 'm = 1, n = 1',
        negative: 'Platform test: m and n are positive; use the standard example',
      },
      'coin-change': {
        default: 'coins = [1,2,5], amount = 11',
        zero: 'coins = [1], amount = 0',
        negative: 'Platform test: coins and amount are non-negative; use the standard example',
      },
      'best-time-buy-sell-stock-ii': {
        default: 'prices = [7,1,5,3,6,4]',
        zero: 'prices = [0,0,0]',
        negative: 'prices = [-1,-2,-3]',
      },
      'word-break': {
        default: 's = "leetcode", wordDict = ["leet","code"]',
        zero: 's = "", wordDict = []',
        negative: 'Platform test: no numeric values apply; use the standard example',
      },
      'minimum-path-sum': {
        default: 'grid = [[1,3,1],[1,5,1],[4,2,1]]',
        zero: 'grid = [[0,0],[0,0]]',
        negative: 'grid = [[-1,3],[1,-5]]',
      },
    };
    return examples[problem]?.[this.visualInput()] ?? 'Choose an example';
  });
  constructor() {
    // Reference-only Core Templates begin with their explanatory pseudocode.
    // Practice workspaces continue to open on the existing practice tab.
    effect(() => {
      if (!this.showPractice() && this.pseudocode() && this.selected() === 'practice') {
        this.selected.set('pseudocode');
      }
    });
  }
  protected setPracticeLanguage(value: string): void {
    const language = value as Language;
    this.practiceLanguage.set(language);
    this.practiceCode.set(this.starter(language));
  }
  protected resetPractice(): void {
    this.practiceCode.set(this.starter(this.practiceLanguage()));
  }
  private starter(language: Language): string {
    return {
      java: 'static int solve(int[] values) {\n  // State the invariant here.\n  // TODO: implement\n  return 0;\n}',
      python: '# State the invariant here.\ndef solve(values):\n    # TODO: implement\n    pass',
      go: 'func solve(values []int) int {\n    // State the invariant here.\n    // TODO: implement\n    return 0\n}',
    }[language];
  }
  private highlight(source: string): string {
    const tokens =
      /(\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+\b|\b(?:class|static|int|long|double|float|boolean|void|return|for|if|else|func|def|range|in|package|import|var|const)\b|\b(?:String|Integer|List|Map|HashMap|ArrayList)\b)/g;
    return source
      .split(tokens)
      .map((part) => {
        const safe = part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (/^(\/\/|#)/.test(part)) return `<span class="token-comment">${safe}</span>`;
        if (/^['"]/.test(part)) return `<span class="token-string">${safe}</span>`;
        if (/^\d+$/.test(part)) return `<span class="token-number">${safe}</span>`;
        if (/^(String|Integer|List|Map|HashMap|ArrayList)$/.test(part))
          return `<span class="token-type">${safe}</span>`;
        if (
          /^(class|static|int|long|double|float|boolean|void|return|for|if|else|func|def|range|in|package|import|var|const)$/.test(
            part,
          )
        )
          return `<span class="token-keyword">${safe}</span>`;
        return safe;
      })
      .join('');
  }
  private highlightPseudocode(source: string): string {
    return source
      .split(/(\b(?:while|for|return|start)\b)/)
      .map((part) => {
        const safe = part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return /^(while|for|return|start)$/.test(part)
          ? `<span class="token-keyword">${safe}</span>`
          : `<span class="token-type">${safe}</span>`;
      })
      .join('');
  }
}
