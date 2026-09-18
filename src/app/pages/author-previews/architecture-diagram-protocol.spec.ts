import { vi } from 'vitest';
import {
  architectureDiagramHref,
  architectureDiagrams,
  connectArchitectureFrame,
  parseDiagramMessage,
} from './architecture-diagram-protocol';

const ready = {
  type: 'lookahead:architecture:ready',
  version: 1,
  diagramId: 'content-model',
  width: 2600,
  height: 1800,
};

describe('architecture diagram channel boundary', () => {
  it('accepts only known IDs and the exact bounded message schema', () => {
    for (const diagramId of Object.keys(architectureDiagrams)) {
      expect(parseDiagramMessage({ ...ready, diagramId })).toEqual({ ...ready, diagramId });
      expect(
        parseDiagramMessage({ type: 'lookahead:architecture:expand', version: 1, diagramId }),
      ).not.toBeNull();
    }
    for (const invalid of [
      null,
      [],
      {},
      { ...ready, version: 2 },
      { ...ready, diagramId: '__proto__' },
      { ...ready, diagramId: 'unknown' },
      { ...ready, diagramId: 'candidate-unknown' },
      { ...ready, href: '/admin' },
      { ...ready, source: '<svg></svg>' },
      { ...ready, type: 'ready' },
      { ...ready, width: NaN },
      { ...ready, width: Infinity },
      { ...ready, height: '42' },
      { ...ready, width: 15 },
      { ...ready, height: 20001 },
      { type: 'lookahead:architecture:expand', version: 1, diagramId: 'repo-flow', url: '/other' },
    ])
      expect(parseDiagramMessage(invalid)).toBeNull();
  });

  it('opens each approved candidate diagram through the existing protected document contract', () => {
    const candidates = [
      ['candidate-apps', 'Three apps, two databases'],
      ['candidate-oauth', 'Candidate sign-in and protected request'],
      ['candidate-trust', 'Database and permission boundaries'],
      ['candidate-failures', 'Failure and recovery behavior'],
      ['candidate-environments', 'Environments and publication boundaries'],
    ] as const;
    for (const [diagramId, title] of candidates) {
      expect(architectureDiagrams[diagramId]).toBe(title);
      expect(
        parseDiagramMessage({ type: 'lookahead:architecture:expand', version: 1, diagramId }),
      ).toEqual({ type: 'lookahead:architecture:expand', version: 1, diagramId });
      expect(
        architectureDiagramHref(
          '/bff/author/previews/architecture/index.html?theme=dark',
          diagramId,
        ),
      ).toBe(
        `/bff/author/previews/architecture/index.html?theme=dark&layout=diagram&diagram=${diagramId}`,
      );
      expect(parseDiagramMessage({ ...ready, diagramId, width: Infinity })).toBeNull();
      expect(parseDiagramMessage({ ...ready, diagramId, href: '/unrelated' })).toBeNull();
    }
  });

  it('builds the diagram URL from the validated document, retaining theme but never accepting a message URL', () => {
    expect(
      architectureDiagramHref(
        '/bff/author/previews/architecture/index.html?theme=dark&layout=shared#model',
        'content-model',
      ),
    ).toBe(
      '/bff/author/previews/architecture/index.html?theme=dark&layout=diagram&diagram=content-model',
    );
    expect(() => architectureDiagramHref('https://external.test/a', 'content-model')).toThrow();
    expect(() => architectureDiagramHref('/safe', '../unsafe' as any)).toThrow();
  });

  it('connects only the exact source window with scripts-only sandbox and filters mismatched diagram messages', () => {
    const received = vi.fn();
    const postMessage = vi.fn();
    const close = vi.fn();
    const port = {
      onmessage: null as ((event: { data: unknown }) => void) | null,
      start: vi.fn(),
      close,
    };
    const secondPort = {};
    vi.stubGlobal(
      'MessageChannel',
      class {
        port1 = port;
        port2 = secondPort;
      },
    );
    const frame = {
      src: new URL('/protected?layout=diagram', window.location.origin).href,
      contentWindow: { postMessage },
      getAttribute: () => 'allow-scripts',
    } as unknown as HTMLIFrameElement;
    try {
      expect(connectArchitectureFrame(frame, '/different', 'content-model', received)).toBeNull();
      expect(
        connectArchitectureFrame(
          { ...frame, getAttribute: () => 'allow-scripts allow-same-origin' } as any,
          '/protected?layout=diagram',
          'content-model',
          received,
        ),
      ).toBeNull();
      expect(postMessage).not.toHaveBeenCalled();
      expect(
        connectArchitectureFrame(frame, '/protected?layout=diagram', 'content-model', received),
      ).toBe(port);
      expect(postMessage).toHaveBeenCalledWith(
        {
          type: 'lookahead:architecture:connect',
          version: 1,
          mode: 'diagram',
          diagramId: 'content-model',
        },
        '*',
        [secondPort],
      );
      port.onmessage!({ data: { ...ready, diagramId: 'repo-flow' } });
      port.onmessage!({ data: { ...ready, url: '/other' } });
      expect(received).not.toHaveBeenCalled();
      port.onmessage!({ data: ready });
      expect(received).toHaveBeenCalledWith(ready);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
