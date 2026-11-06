import { Injectable, signal } from '@angular/core';

/**
 * DLV-971 (owner, 2026-11-06): Edit on an own New item on Support tickets and feedback hands the item id to the Give feedback
 * instance, which lives on the other tab of /support. The id is kept until that instance takes it on init.
 */
@Injectable({ providedIn: 'root' })
export class ReviewEditIntent {
  private readonly pending = signal<string | null>(null);
  readonly itemId = this.pending.asReadonly();

  set(itemId: string): void {
    this.pending.set(itemId);
  }

  /** Returns the pending id once and clears it. */
  take(): string | null {
    const itemId = this.pending();
    this.pending.set(null);
    return itemId;
  }
}
