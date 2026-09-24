/** Navigate a full-height, sandboxed author document through the parent page. */
export function embeddedAnchor(hash: string, allowed: readonly string[]): string | null {
  let anchor: string;
  try {
    anchor = decodeURIComponent(hash.replace(/^#/, ''));
  } catch {
    return null;
  }
  return /^[a-z0-9-]+$/.test(anchor) && allowed.includes(anchor) ? anchor : null;
}

/** Accept only known section links sent by the active embedded document. */
export function embeddedChildNavigation(data: unknown, documentId: string, allowed: readonly string[]): string | null {
  if (!data || typeof data !== 'object') return null;
  const message = data as Record<string, unknown>;
  if (
    message['type'] !== 'lookahead:author-document:navigate' ||
    message['version'] !== 1 ||
    message['documentId'] !== documentId ||
    typeof message['anchor'] !== 'string'
  ) return null;
  return embeddedAnchor(`#${message['anchor']}`, allowed);
}

export function requestEmbeddedAnchor(frame: HTMLIFrameElement | undefined, documentId: string, anchor: string | null): void {
  if (!frame || !anchor) return;
  frame.contentWindow?.postMessage(
    { type: 'lookahead:author-document:anchor-request', version: 1, documentId, anchor },
    '*', // The scripts-only iframe has an opaque origin.
  );
}

export function embeddedAnchorPosition(data: unknown, documentId: string, anchor: string | null, maxHeight: number): number | null {
  if (!data || typeof data !== 'object' || !anchor) return null;
  const position = data as Record<string, unknown>;
  if (
    position['type'] !== 'lookahead:author-document:anchor-position' ||
    position['version'] !== 1 ||
    position['documentId'] !== documentId ||
    position['anchor'] !== anchor ||
    typeof position['offset'] !== 'number' ||
    !Number.isFinite(position['offset']) ||
    position['offset'] < 0 ||
    position['offset'] > maxHeight
  ) return null;
  return position['offset'];
}

export function scrollToEmbeddedAnchor(frame: HTMLIFrameElement, offset: number, hostWindow: Window): void {
  const headerHeight = Number.parseFloat(
    hostWindow.getComputedStyle(hostWindow.document.documentElement).getPropertyValue('--platform-header-height'),
  ) || 76;
  const frameTop = frame.getBoundingClientRect().top + hostWindow.scrollY;
  hostWindow.scrollTo({ top: Math.max(0, frameTop + offset - headerHeight - 16), behavior: 'auto' });
}
