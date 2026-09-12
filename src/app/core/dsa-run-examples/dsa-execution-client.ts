import { Injectable, InjectionToken, inject } from '@angular/core';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';

export type ExecutionLanguage = 'java' | 'python' | 'go';
export interface ExecutionCapability {
  schemaVersion: 'execution/v1';
  enabled: boolean;
  problems: {
    problemId: string;
    languages: ExecutionLanguage[];
    contractVersion: string;
    fixtureVersion: string;
  }[];
  limits: { sourceBytes: number };
}
export interface ExecutionRequest {
  problemId: string;
  language: ExecutionLanguage;
  source: string;
  contractVersion: string;
  fixtureVersion: string;
}
export const executionStates = [
  'queued',
  'compiling',
  'running',
  'passed',
  'failed',
  'compile_error',
  'runtime_error',
  'timeout',
  'resource_limit',
  'canceled',
  'internal_error',
] as const;
export type ExecutionStatus = (typeof executionStates)[number];
export interface ExecutionJob {
  schemaVersion: 'execution/v1';
  id: string;
  status: ExecutionStatus;
  problemId: string;
  language: ExecutionLanguage;
  sourceSha256: string;
  contractVersion: string;
  fixtureVersion: string;
  results: { fixtureId: string; status: string; actual: unknown; diagnostics?: string }[];
  diagnostics?: string;
}
export const EXECUTION_FETCH = new InjectionToken<typeof fetch>('DSA execution transport', {
  providedIn: 'root',
  factory:
    () =>
    (...args) =>
      fetch(...args),
});
export class ExecutionError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const messages: Record<number, string> = {
  401: 'Sign in again to run examples.',
  403: 'Author execution is not authorized. Refresh your session.',
  404: 'This execution is no longer available.',
  409: 'The execution contract changed. Reload this problem.',
  413: 'Your source is too large. Use at most 64 KiB.',
  429: 'The runner is busy. Try again shortly.',
  503: 'The local runner is unavailable. Your code remains in the editor.',
};

@Injectable({ providedIn: 'root' })
export class DsaExecutionClient {
  private readonly account = inject(StudyPlanAccount);
  private readonly transport = inject(EXECUTION_FETCH);

  async capabilities(owner: string, signal?: AbortSignal): Promise<ExecutionCapability> {
    const value = await this.request('/executions/capabilities', owner, 'GET', undefined, signal);
    if (
      value?.schemaVersion !== 'execution/v1' ||
      typeof value.enabled !== 'boolean' ||
      !Array.isArray(value.problems) ||
      !Number.isInteger(value.limits?.sourceBytes) ||
      value.limits.sourceBytes <= 0 ||
      value.problems.some(
        (p: any) =>
          !p ||
          typeof p.problemId !== 'string' ||
          !Array.isArray(p.languages) ||
          p.languages.some(
            (language: unknown) => !['java', 'python', 'go'].includes(String(language)),
          ) ||
          typeof p.contractVersion !== 'string' ||
          typeof p.fixtureVersion !== 'string',
      )
    )
      throw this.invalid();
    return value;
  }
  async start(owner: string, body: ExecutionRequest, requestId: string): Promise<ExecutionJob> {
    if (new TextEncoder().encode(body.source).length > 65536)
      throw new ExecutionError(413, messages[413]);
    return this.job(
      await this.request('/executions/jobs', owner, 'POST', body, undefined, requestId),
    );
  }
  async status(owner: string, id: string, signal?: AbortSignal): Promise<ExecutionJob> {
    return this.job(await this.request(this.jobPath(id), owner, 'GET', undefined, signal));
  }
  async cancel(owner: string, id: string): Promise<ExecutionJob> {
    return this.job(await this.request(this.jobPath(id), owner, 'DELETE'));
  }
  private jobPath(id: string): string {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw this.invalid();
    return '/executions/jobs/' + id;
  }
  private job(value: any): ExecutionJob {
    if (
      value?.schemaVersion !== 'execution/v1' ||
      !executionStates.includes(value.status) ||
      typeof value.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(value.id) ||
      typeof value.sourceSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.sourceSha256) ||
      typeof value.problemId !== 'string' ||
      !['java', 'python', 'go'].includes(value.language) ||
      typeof value.contractVersion !== 'string' ||
      typeof value.fixtureVersion !== 'string' ||
      !Array.isArray(value.results) ||
      value.results.length > 3 ||
      value.results.some(
        (r: any) =>
          !r ||
          typeof r.fixtureId !== 'string' ||
          typeof r.status !== 'string' ||
          (r.diagnostics !== undefined && typeof r.diagnostics !== 'string'),
      ) ||
      (value.diagnostics !== undefined && typeof value.diagnostics !== 'string')
    )
      throw this.invalid();
    if (
      value.status === 'passed' &&
      (value.results.length !== 3 || value.results.some((r: any) => r.status !== 'passed'))
    )
      throw this.invalid();
    const output = [
      value.diagnostics ?? '',
      ...value.results.flatMap((r: any) => [r.diagnostics ?? '', JSON.stringify(r.actual) ?? '']),
    ].join('');
    if (
      new TextEncoder().encode(output).length > 65536 ||
      new Set(value.results.map((r: any) => r.fixtureId)).size !== value.results.length ||
      value.results.some((r: any) => !['standard', 'duplicate', 'negative'].includes(r.fixtureId))
    )
      throw this.invalid();
    return value;
  }
  private invalid(): ExecutionError {
    return new ExecutionError(
      502,
      'The runner returned an invalid response. No result can be confirmed.',
    );
  }
  private checkOwner(owner: string): void {
    if (
      this.account.account()?.accountId !== owner ||
      !this.account.account()?.authorPreview ||
      this.account.sessionExpired()
    )
      throw new ExecutionError(401, 'The account changed. Sign in again before running examples.');
  }
  private async request(
    path: string,
    owner: string,
    method: string,
    body?: unknown,
    signal?: AbortSignal,
    requestId?: string,
  ): Promise<any> {
    this.checkOwner(owner);
    const headers: Record<string, string> = { 'X-LookAhead-Account': owner };
    if (method !== 'GET') {
      const csrf = await this.request('/auth/csrf', owner, 'GET', undefined, signal);
      if (
        typeof csrf?.headerName !== 'string' ||
        !/^X-[A-Za-z0-9-]+$/i.test(csrf.headerName) ||
        typeof csrf.token !== 'string'
      )
        throw this.invalid();
      headers[csrf.headerName] = csrf.token;
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (requestId) headers['Idempotency-Key'] = requestId;
    this.checkOwner(owner);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timeout = setTimeout(abort, 10000);
    try {
      const response = await this.transport(this.account.apiPath(path), {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      this.checkOwner(owner);
      if (!response.ok)
        throw new ExecutionError(
          response.status,
          messages[response.status] ?? 'The execution service could not complete this request.',
        );
      // Bound bytes before decoding/parsing; compiler output must never become unbounded page content.
      const reader = response.body?.getReader();
      if (!reader) throw this.invalid();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 524288) {
          await reader.cancel();
          throw this.invalid();
        }
        chunks.push(value);
      }
      const combined = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      this.checkOwner(owner);
      const envelope = JSON.parse(new TextDecoder().decode(combined));
      if (!envelope || !('data' in envelope)) throw this.invalid();
      return envelope.data;
    } catch (error) {
      if (error instanceof ExecutionError) throw error;
      if (signal?.aborted) throw error;
      throw new ExecutionError(
        0,
        method === 'POST'
          ? 'Submission could not be confirmed. It may still run until its server deadline; do not immediately resubmit.'
          : 'The runner could not be reached. Your code remains in the editor.',
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
}
