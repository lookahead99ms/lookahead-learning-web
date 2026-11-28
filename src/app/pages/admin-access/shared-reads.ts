import { Injectable } from '@angular/core';

/**
 * One request for readers that ask at the same moment. People & Access has three parts that each
 * read `GET /admin/test-accounts` when the page opens (purchase requests, names, the accounts
 * table), and two that read the owner's directory; each read took seconds on DEV. While a read of a
 * path is on its way, a second reader of the same path waits for that answer instead of sending its
 * own.
 *
 * Nothing is kept once the answer has arrived: a read made after a write always goes to the server,
 * so a list can never show data from before the change. A failed read is shared too, and the next
 * reader tries again.
 */
@Injectable({ providedIn: 'root' })
export class SharedReads {
  private readonly onTheirWay = new Map<string, Promise<unknown>>();

  read<T>(path: string, request: (path: string) => Promise<T>): Promise<T> {
    const waiting = this.onTheirWay.get(path);
    if (waiting) return waiting as Promise<T>;
    const sent = request(path).finally(() => {
      if (this.onTheirWay.get(path) === sent) this.onTheirWay.delete(path);
    });
    this.onTheirWay.set(path, sent);
    return sent;
  }
}
