export const architectureDiagrams = {
  'repo-flow': 'Platform and repositories',
  'backend-components': 'Backend application',
  'protected-read': 'Protected lesson read',
  'plan-save': 'Study plan save',
  'content-model': 'Complete content model',
  'publication-runtime': 'Publication and runtime',
  'candidate-apps': 'Three apps, two databases',
  'candidate-oauth': 'Candidate sign-in and protected request',
  'candidate-trust': 'Database and permission boundaries',
  'candidate-failures': 'Failure and recovery behavior',
  'candidate-environments': 'Environments and publication boundaries',
} as const;

export type ArchitectureDiagramId = keyof typeof architectureDiagrams;
export interface DiagramReady {
  type: 'lookahead:architecture:ready';
  version: 1;
  diagramId: ArchitectureDiagramId;
  width: number;
  height: number;
}
type DiagramAction = {
  type: 'lookahead:architecture:expand' | 'lookahead:architecture:error';
  version: 1;
  diagramId: ArchitectureDiagramId;
};

export function isArchitectureDiagramId(value: unknown): value is ArchitectureDiagramId {
  return typeof value === 'string' && Object.hasOwn(architectureDiagrams, value);
}

/** The channel carries bounded data only: never markup, source, or a navigation URL. */
export function parseDiagramMessage(value: unknown): DiagramReady | DiagramAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data['version'] !== 1 || !isArchitectureDiagramId(data['diagramId'])) return null;
  const type = data['type'];
  const actionKeys = ['type', 'version', 'diagramId'];
  if (type === 'lookahead:architecture:expand' || type === 'lookahead:architecture:error') {
    return Object.keys(data).length === 3 &&
      Object.keys(data).every((key) => actionKeys.includes(key))
      ? (data as DiagramAction)
      : null;
  }
  if (type !== 'lookahead:architecture:ready') return null;
  const readyKeys = [...actionKeys, 'width', 'height'];
  const dimension = (item: unknown) =>
    typeof item === 'number' && Number.isFinite(item) && item >= 16 && item <= 20000;
  if (
    Object.keys(data).length !== readyKeys.length ||
    !Object.keys(data).every((key) => readyKeys.includes(key)) ||
    !dimension(data['width']) ||
    !dimension(data['height'])
  )
    return null;
  return data as unknown as DiagramReady;
}

/** Only the already validated inventory href is allowed to select a document. */
export function architectureDiagramHref(documentHref: string, diagramId: ArchitectureDiagramId) {
  const url = new URL(documentHref, window.location.origin);
  if (url.origin !== window.location.origin || !isArchitectureDiagramId(diagramId))
    throw new Error('Invalid architecture document');
  url.searchParams.set('layout', 'diagram');
  url.searchParams.set('diagram', diagramId);
  url.hash = '';
  return `${url.pathname}${url.search}`;
}

/** A transferred port binds messages to this specific opaque-origin sandbox. */
export function connectArchitectureFrame(
  frame: HTMLIFrameElement,
  expectedHref: string,
  diagramId: ArchitectureDiagramId | null,
  receive: (message: DiagramReady | DiagramAction) => void,
): MessagePort | null {
  const expected = new URL(expectedHref, window.location.origin);
  if (
    expected.origin !== window.location.origin ||
    frame.src !== expected.href ||
    frame.getAttribute('sandbox') !== 'allow-scripts' ||
    !frame.contentWindow
  )
    return null;
  const channel = new MessageChannel();
  channel.port1.onmessage = (event: MessageEvent<unknown>) => {
    const message = parseDiagramMessage(event.data);
    if (message && (!diagramId || message.diagramId === diagramId)) receive(message);
  };
  channel.port1.start();
  try {
    frame.contentWindow.postMessage(
      {
        type: 'lookahead:architecture:connect',
        version: 1,
        mode: diagramId ? 'diagram' : 'document',
        ...(diagramId ? { diagramId } : {}),
      },
      '*',
      [channel.port2],
    );
    // '*' is necessary for the receiver's opaque sandbox origin; never broadcast.
    return channel.port1;
  } catch {
    channel.port1.close();
    channel.port2.close();
    return null;
  }
}
