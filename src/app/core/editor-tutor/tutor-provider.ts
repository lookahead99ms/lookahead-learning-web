import { InjectionToken } from '@angular/core';

export type TutorLanguage = 'java' | 'python' | 'go';
export type TutorHelp = 'question' | 'hint' | 'syntax' | 'approach' | 'optimization' | 'deeper';
export interface TutorProblem {
  readonly id: string;
  readonly title: string;
  readonly prompt: string;
}
export interface TutorSnapshot {
  readonly id: number;
  readonly revision: number;
  readonly problem: TutorProblem;
  readonly language: TutorLanguage;
  readonly code: string;
}
export interface TutorRequest {
  readonly snapshot: TutorSnapshot;
  readonly question: string;
  readonly help: TutorHelp;
  readonly hintLevel: number;
  readonly history: readonly {
    question: string;
    response: string;
    snapshotId: number;
    editorRevision: number;
    problemId: string;
    language: TutorLanguage;
    matchesCurrentEditor: boolean;
  }[];
}
export interface TutorReply {
  readonly snapshotId: number;
  readonly text: string;
}
/** Text-only seam. It deliberately exposes no editor, account, execution or progress tools. */
export interface TutorProvider {
  review(request: TutorRequest, signal: AbortSignal): Promise<TutorReply>;
}
export const tutorLimits = {
  code: 12000,
  question: 1000,
  response: 4000,
  exchanges: 12,
  timeoutMs: 10000,
};

export class ScriptedTutorProvider implements TutorProvider {
  async review(request: TutorRequest, signal: AbortSignal): Promise<TutorReply> {
    if (signal.aborted || request.snapshot.problem.id !== 'algorithmic-two-sum') {
      throw new Error('Unsupported preview request');
    }
    const hints = [
      'Before choosing a technique, describe what a valid pair must satisfy. Can the same input position be used twice?',
      'For the current value, what other value would complete the target? What information from earlier positions would let you find it?',
      'Consider storing earlier values with their indices. Should you check for the complement before or after recording the current index, and why?',
    ];
    const syntax: Record<TutorLanguage, string> = {
      java: 'Check the published int[] return type, balanced braces, and whether each return supplies indices. Java Map.get can return null; reason about that case before unboxing.',
      python:
        'Check indentation, the published parameter names, and that the return contains indices. When a dictionary lookup returns index 0, a truthiness check can mistake it for absence.',
      go: 'Check the published []int return type and block syntax. A map lookup can return a zero value for a missing key; use the comma-ok form when existence matters.',
    };
    const responses: Record<TutorHelp, string> = {
      question:
        'Your question is attached to the snapshot below. This scripted demo cannot interpret your particular attempt. To discuss Two Sum, first state what your code remembers after each input position. How does that prevent reusing the same position?',
      hint: hints[Math.min(request.hintLevel, hints.length - 1)]!,
      syntax:
        'Language checklist, not a diagnosis of your code: ' + syntax[request.snapshot.language],
      approach:
        'Approach checklist, not a verdict: explain how your attempt finds two distinct indices, handles duplicate values, and preserves the original index positions. Trace [3, 3] with target 6 by hand. At what point can you guarantee the indices differ?',
      optimization:
        'Optimization checklist, not measured performance: count how often your approach revisits each pair. A lookup of earlier values can trade extra memory for expected linear time under ordinary hash-table assumptions. If you chose another approach, explain its constraints and trade-offs before changing it.',
      deeper:
        'Requested worked explanation: scan left to right while remembering earlier values and their indices. For each value x, look for target − x among earlier entries. If found, those two indices form the pair; otherwise record x and its index. Checking before recording prevents reusing the current position. For [2, 7, 11, 15] and target 9, remember 2 at index 0; when 7 arrives, its complement 2 is already present. This describes a general approach; it does not validate your snapshot or run a test.',
    };
    return { snapshotId: request.snapshot.id, text: responses[request.help] };
  }
}

// Future supported provider integrations replace this token only after their own
// authentication, context authorization, privacy, budget and deployment review.
export const TUTOR_PROVIDER = new InjectionToken<TutorProvider>('Text tutor provider', {
  providedIn: 'root',
  factory: () => new ScriptedTutorProvider(),
});
