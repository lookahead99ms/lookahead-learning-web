import { Component, computed, input } from '@angular/core';
import { TheoryOutput } from '../../content/content.models';

/** First line of a crash report: Java exception, Python traceback or Go panic. */
const CRASH_START = /^(Exception in thread |Traceback \(most recent call last\):|panic: )/;

/** Printed lines without the final newline; blank lines stay as empty rows. */
export function outputLines(text: string): string[] {
  return text.replace(/\n$/, '').split('\n');
}

/**
 * Console lines a real IDE would show in red: exceptions, stack frames, compiler errors, failed checks,
 * and, in a run that crashed, everything from the start of the crash report (a Java exception, a Python
 * traceback or a Go panic) to the end.
 */
export function isErrorLine(line: string, output: { exitCode?: number; tool?: string; text?: string }, index = -1): boolean {
  if (/^(Exception in thread|\s+at |\[ERROR\]|FAILED)|: error: |\berrors?$/.test(line)) return true;
  if ((output.exitCode ?? 0) !== 0 && index >= 0 && output.text) {
    const start = outputLines(output.text).findIndex((text) => CRASH_START.test(text));
    if (start >= 0 && index >= start) return true;
  }
  return output.tool === 'Build' && (output.exitCode ?? 0) !== 0;
}

export function isPassLine(line: string): boolean {
  return /^(?:PASSED\b|Failures: 0, Errors: 0|BUILD SUCCESS)/.test(line);
}

/**
 * Program output modelled on an IDE run tool window (dark, as the code block): a "Run" tab strip, the command
 * in grey, one row per printed line, then the exit line after a blank row. The host is the lesson's
 * `div.run-console` (its role, label and failed state are set where it is placed); the note under it stays there too.
 */
@Component({
  selector: 'div[appLessonRunConsole]',
  template: `
    <div class="run-console-bar">
      <span class="run-console-tool">{{ output().tool ?? 'Run' }}</span>
      <span class="run-console-tab">{{ programName() }}<span aria-hidden="true"> ×</span></span>
    </div>
    <div class="run-console-body">
      @if (output().command) {
        <div class="run-command">{{ output().command }}</div>
      }
      @for (line of lines(); track $index) {
        <div class="run-line" [class.run-line-error]="isErrorLine(line, output(), $index)" [class.run-line-pass]="isPassLine(line)">{{ line }}</div>
      }
      <div class="run-exit">Process finished with exit code {{ output().exitCode ?? 0 }}</div>
    </div>
  `,
  styles: [
    `
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
      .run-console-body {
        min-width: 0;
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
      :host(.run-console-failed) .run-exit {
        color: #f75464;
      }
      /* Console lines wrap so a long exception message is read in place instead of scrolled sideways
         (algo-pattern-v1 and concept-v1 lessons, and every Debug split diff). */
      :host-context(.algo-lesson) .run-console-body > div {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        tab-size: 2;
      }
      :host-context(.split-diff) .run-console-body > div {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
    `,
  ],
})
export class LessonRunConsole {
  readonly output = input.required<TheoryOutput>();

  protected readonly lines = computed(() => outputLines(this.output().text));
  protected readonly programName = computed(() => this.output().title.replace(/^Run:\s*/, ''));
  protected readonly isErrorLine = isErrorLine;
  protected readonly isPassLine = isPassLine;
}
