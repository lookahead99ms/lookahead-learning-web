import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import {
  TUTOR_PROVIDER,
  TutorHelp,
  TutorLanguage,
  TutorProblem,
  TutorSnapshot,
  tutorLimits,
} from './tutor-provider';

interface TutorExchange {
  snapshot: TutorSnapshot;
  question: string;
  response: string;
  help: TutorHelp;
}

@Component({
  selector: 'app-editor-tutor',
  templateUrl: './editor-tutor.html',
  styleUrl: './editor-tutor.css',
})
export class EditorTutor {
  readonly problem = input.required<TutorProblem>();
  readonly code = input.required<string>();
  readonly language = input.required<TutorLanguage>();
  private readonly provider = inject(TUTOR_PROVIDER);
  protected readonly limits = tutorLimits;
  protected readonly question = signal('');
  protected readonly help = signal<TutorHelp>('question');
  protected readonly exchanges = signal<TutorExchange[]>([]);
  protected readonly pending = signal(false);
  protected readonly error = signal('');
  protected readonly revision = signal(0);
  protected readonly expanded = signal(false);
  protected readonly helpOptions: { value: TutorHelp; label: string }[] = [
    { value: 'question', label: 'Ask about my attempt' },
    { value: 'hint', label: 'One progressive hint' },
    { value: 'syntax', label: 'Syntax checklist' },
    { value: 'approach', label: 'Review my approach' },
    { value: 'optimization', label: 'Discuss optimization' },
    { value: 'deeper', label: 'Deeper worked explanation' },
  ];
  private problemKey = '';
  private requestSequence = 0;
  private generation = 0;
  private abort?: AbortController;

  constructor() {
    effect(() => {
      const key = this.problem().id;
      this.code();
      this.language();
      untracked(() => {
        if (key !== this.problemKey) {
          this.clearConversation();
          this.problemKey = key;
        }
        this.revision.update((value) => value + 1);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.abort?.abort();
    });
  }

  protected setHelp(value: string): void {
    if (this.helpOptions.some((option) => option.value === value))
      this.help.set(value as TutorHelp);
  }

  protected clearConversation(): void {
    this.generation++;
    this.abort?.abort();
    this.pending.set(false);
    this.exchanges.set([]);
    this.question.set('');
    this.help.set('question');
    this.error.set('');
  }

  protected isStale(snapshot: TutorSnapshot): boolean {
    return (
      snapshot.revision !== this.revision() ||
      snapshot.code !== this.code() ||
      snapshot.language !== this.language() ||
      snapshot.problem.id !== this.problem().id
    );
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.pending()) return;
    const question = this.question().trim();
    if (
      !question ||
      question.length > tutorLimits.question ||
      this.code().length > tutorLimits.code ||
      this.exchanges().length >= tutorLimits.exchanges ||
      this.problem().id !== 'algorithmic-two-sum'
    ) {
      this.error.set(
        'Enter a question within the preview limits. Clear the conversation after 12 exchanges.',
      );
      return;
    }
    const generation = this.generation;
    const snapshot: TutorSnapshot = Object.freeze({
      id: ++this.requestSequence,
      revision: this.revision(),
      problem: Object.freeze({ ...this.problem() }),
      language: this.language(),
      code: this.code(),
    });
    const help = this.help();
    const abort = new AbortController();
    this.abort = abort;
    this.pending.set(true);
    this.error.set('');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    try {
      const reply = await Promise.race([
        this.provider.review(
          {
            snapshot,
            question,
            help,
            hintLevel: this.exchanges().filter((exchange) => exchange.help === 'hint').length,
            history: this.exchanges()
              .slice(-4)
              .map((exchange) => ({
                question: exchange.question,
                response: exchange.response.slice(0, 1500),
                snapshotId: exchange.snapshot.id,
                editorRevision: exchange.snapshot.revision,
                problemId: exchange.snapshot.problem.id,
                language: exchange.snapshot.language,
                matchesCurrentEditor: !this.isStale(exchange.snapshot),
              })),
          },
          abort.signal,
        ),
        new Promise<never>((_, reject) => {
          abortListener = () => reject(new Error('Tutor cancelled'));
          abort.signal.addEventListener('abort', abortListener, { once: true });
          timer = setTimeout(() => {
            abort.abort();
            reject(new Error('Tutor timeout'));
          }, tutorLimits.timeoutMs);
        }),
      ]);
      if (generation !== this.generation) return;
      if (
        reply.snapshotId !== snapshot.id ||
        typeof reply.text !== 'string' ||
        !reply.text.trim() ||
        reply.text.length > tutorLimits.response
      )
        throw new Error('Invalid tutor response');
      this.exchanges.update((exchanges) => [
        ...exchanges,
        { snapshot, question, response: reply.text, help },
      ]);
      // Do not erase a new question typed while the response was pending.
      if (this.question().trim() === question) this.question.set('');
    } catch {
      if (generation === this.generation)
        this.error.set(
          'The tutor could not respond. Your question and editor are unchanged. Submit again to retry, or use the authored hints and guided explanation.',
        );
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (abortListener) abort.signal.removeEventListener('abort', abortListener);
      if (generation === this.generation) this.pending.set(false);
    }
  }
}
