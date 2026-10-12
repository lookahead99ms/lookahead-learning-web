import { Injectable, inject } from '@angular/core';
import { ACCOUNT_FETCH, StudyPlanAccount } from '../study-plan/study-plan-account';
import {
  PlatformReviewClient,
  PlatformReviewDraft,
  PlatformReviewError,
  PlatformReviewItem,
  PlatformReviewPage,
  PlatformReviewViewer,
  ReviewAttachment,
  ReviewStatus,
} from './platform-review.model';

const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * DLV-928: the shared review service behind the Gateway session. Writes send the session's CSRF
 * token and an Idempotency-Key; images are fetched with the session cookie and shown as blob URLs,
 * so they never have a public address.
 */
@Injectable()
export class ConnectedPlatformReviewClient implements PlatformReviewClient {
  private readonly transport = inject(ACCOUNT_FETCH);
  private readonly accounts = inject(StudyPlanAccount);

  viewer(): Promise<PlatformReviewViewer> {
    return this.json('/me');
  }

  async list(before?: string): Promise<PlatformReviewPage> {
    if (before !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(before))
      throw new PlatformReviewError('invalid');
    return this.json(before ? `?before=${before}` : '');
  }

  async item(itemId: string): Promise<PlatformReviewItem> {
    return this.json(`/${this.checked(itemId)}`);
  }

  async save(draft: PlatformReviewDraft, itemId?: string): Promise<PlatformReviewItem> {
    const fields = {
      category: draft.category,
      page: draft.page,
      pageUrl: draft.pageUrl,
      title: draft.title,
      details: draft.details,
      priority: draft.priority,
      ...(itemId ? { keepAttachmentIds: draft.keepAttachmentIds } : {}),
    };
    const form = new FormData();
    form.append('item', new Blob([JSON.stringify(fields)], { type: 'application/json' }), 'item.json');
    for (const file of draft.newFiles) form.append('image', file, file.name || 'screenshot.png');
    return this.json(itemId ? `/${this.checked(itemId)}` : '', {
      method: itemId ? 'PUT' : 'POST',
      headers: { ...(await this.csrf()), 'Idempotency-Key': draft.requestKey },
      body: form,
    });
  }

  async remove(itemId: string): Promise<void> {
    const path = `/${this.checked(itemId)}`;
    await this.send(path, { method: 'DELETE', headers: await this.csrf() });
  }

  async triage(itemId: string, status: ReviewStatus, ownerNote: string): Promise<PlatformReviewItem> {
    return this.json(`/${this.checked(itemId)}/triage`, {
      method: 'PUT',
      headers: {
        ...(await this.csrf()),
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ status, ownerNote }),
    });
  }

  async attachmentUrl(item: PlatformReviewItem, attachment: ReviewAttachment): Promise<string> {
    const response = await this.send(
      `/${this.checked(item.id)}/attachments/${this.checked(attachment.id)}`,
    );
    return URL.createObjectURL(await response.blob());
  }

  releaseAttachmentUrl(url: string): void {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }

  private checked(value: string): string {
    if (!id.test(value)) throw new PlatformReviewError('not-found');
    return value;
  }

  private async csrf(): Promise<Record<string, string>> {
    const response = await this.request(this.accounts.apiPath('/auth/csrf'));
    const data = (await response.json())?.data;
    if (typeof data?.token !== 'string' || typeof data?.headerName !== 'string')
      throw new PlatformReviewError('unavailable');
    return { [data.headerName]: data.token };
  }

  private async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.send(path, init);
    try {
      return (await response.json()).data as T;
    } catch {
      throw new PlatformReviewError('unavailable');
    }
  }

  private send(path: string, init: RequestInit = {}): Promise<Response> {
    return this.request(this.accounts.apiPath('/platform-reviews') + path, init);
  }

  /** Throws a PlatformReviewError; 409, 413 and 422 carry the server's reader-facing message. */
  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    if (!this.accounts.account() || this.accounts.sessionExpired())
      throw new PlatformReviewError('unauthorized');
    let response: Response;
    try {
      response = await this.transport(url, {
        ...init,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(init.body instanceof FormData ? 120_000 : 15_000),
      });
    } catch {
      throw new PlatformReviewError('unavailable');
    }
    if (response.ok) return response;
    let message: string | undefined;
    try {
      const body = await response.json();
      if (typeof body?.message === 'string') message = body.message;
    } catch {
      // Status-only failures keep the generic message.
    }
    const status = response.status;
    if (status === 401) throw new PlatformReviewError('unauthorized');
    if (status === 403) throw new PlatformReviewError('forbidden');
    if (status === 404) throw new PlatformReviewError('not-found');
    if (status === 409) throw new PlatformReviewError('conflict', message);
    if (status === 413) throw new PlatformReviewError('invalid', message ?? 'The images are too large to send.');
    if (status === 400 || status === 422) throw new PlatformReviewError('invalid', message);
    throw new PlatformReviewError('unavailable');
  }
}
