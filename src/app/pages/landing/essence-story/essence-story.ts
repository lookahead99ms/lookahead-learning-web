import { Component, ElementRef, inject, input, signal } from '@angular/core';
import { PlatformBrand } from '../../../core/platform-brand/platform-brand';
import { EssenceSteps } from '../essence-steps/essence-steps';
import { KEY_SENTENCE, KeyCycle, WordmarkKey } from '../wordmark-key/wordmark-key';

/**
 * The Essence of Look Ahead (user, 2026-10-16/17): the wordmark explains itself and joins, the three
 * statements draw in, then the arrow climbs the steps from the obstacle to "Look ahead".
 *
 * The host is the `<section>` itself (`<section appEssenceStory>`), so the homepage keeps exactly the
 * DOM it had before this was a component, and `/welcome` shows the same section on its own (DLV-969).
 */
@Component({
  selector: 'section[appEssenceStory]',
  imports: [PlatformBrand, WordmarkKey, EssenceSteps],
  templateUrl: './essence-story.html',
  styleUrl: './essence-story.css',
  host: {
    class: 'brand-story home-essence',
    'aria-labelledby': 'brand-story-title',
    '[attr.data-motion]': "still() ? 'still' : null",
    '[attr.data-skip]': "skip() ? '' : null",
  },
})
export class EssenceStory {
  /** The section itself: the wordmark's light travels across this card. */
  protected readonly stage: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** The Essence wordmark has finished, so its statements and steps can play. */
  protected readonly wordmarkDone = signal(false);
  /** The whole Essence has played; from now on it loops while on screen. */
  protected readonly settled = signal(false);
  /** The reader paused the Essence's motion. */
  protected readonly still = signal(false);
  /** The reader skipped to the end: for a moment, everything jumps to finished without motion. */
  protected readonly skip = signal(false);
  /** The wordmark is retelling its story with captions, so the statements step aside. */
  protected readonly away = signal(false);
  /** The closing sentence, shown under the steps once the wordmark has finished. */
  protected readonly sentence = signal(false);
  protected readonly sentenceLines = KEY_SENTENCE;
  /** Loop rounds so far; each sends the stairs' arrow up again after the wordmark's light. */
  protected readonly loop = signal(0);
  /** Start on page load instead of waiting for most of the card to scroll into view (/welcome; the homepage keeps waiting). */
  readonly autoplay = input(false);

  /** The Essence starts again from the first letter. */
  protected restart(): void {
    this.wordmarkDone.set(false);
    this.sentence.set(false);
    this.settled.set(false);
    this.skip.set(false);
    this.away.set(false);
    this.loop.set(0);
  }

  /** The wordmark is whole: its sentence settles below the steps, and the statements and steps play. */
  protected finished(): void {
    this.wordmarkDone.set(true);
    this.sentence.set(true);
  }

  /** Skip to the end: jump everything to finished, then let motion work again for later rounds. */
  protected skipToEnd(): void {
    this.away.set(false);
    this.skip.set(true);
    setTimeout(() => this.skip.set(false), 100);
  }

  /** Follow the wordmark's loop: statements aside while it retells its story, back once whole. */
  protected cycle(phase: KeyCycle): void {
    this.away.set(phase === 'apart');
  }
}
