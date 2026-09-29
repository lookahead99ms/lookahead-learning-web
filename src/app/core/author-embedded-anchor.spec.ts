import { apiEndpointAnchor, embeddedAnchor, embeddedAnchorPosition, embeddedChildNavigation, requestEmbeddedAnchor } from './author-embedded-anchor';

describe('embedded Author section navigation', () => {
  it('accepts only published section anchors', () => {
    expect(embeddedAnchor('#change-workflow', ['change-workflow'])).toBe('change-workflow');
    expect(embeddedAnchor('#unknown', ['change-workflow'])).toBeNull();
    expect(embeddedAnchor('#..%2Fsecret', ['../secret'])).toBeNull();
  });

  it('requests a section from the active frame and validates the response', () => {
    const postMessage = vi.fn();
    const frame = { contentWindow: { postMessage } } as unknown as HTMLIFrameElement;
    requestEmbeddedAnchor(frame, 'local-development', 'change-workflow');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'lookahead:author-document:anchor-request', version: 1,
      documentId: 'local-development', anchor: 'change-workflow',
    }, '*');
    const response = {
      type: 'lookahead:author-document:anchor-position', version: 1,
      documentId: 'local-development', anchor: 'change-workflow', offset: 720,
    };
    expect(embeddedAnchorPosition(response, 'local-development', 'change-workflow', 4000)).toBe(720);
    expect(embeddedAnchorPosition({ ...response, anchor: 'other' }, 'local-development', 'change-workflow', 4000)).toBeNull();
    expect(embeddedAnchorPosition({ ...response, offset: 5000 }, 'local-development', 'change-workflow', 4000)).toBeNull();
  });

  it('accepts only known links initiated inside the document', () => {
    const message = { type: 'lookahead:author-document:navigate', version: 1, documentId: 'api-reference', anchor: 'start-testing' };
    expect(embeddedChildNavigation(message, 'api-reference', ['start-testing'])).toBe('start-testing');
    expect(embeddedChildNavigation({ ...message, anchor: 'unknown' }, 'api-reference', ['start-testing'])).toBeNull();
    expect(embeddedChildNavigation({ ...message, documentId: 'operations-reference' }, 'api-reference', ['start-testing'])).toBeNull();
  });
});

describe('API endpoint anchors', () => {
  it('accepts generated operation anchors and rejects destinations or unknown services', () => {
    expect(apiEndpointAnchor('endpoint-identity-get-oauth2-jwks')).toBe('endpoint-identity-get-oauth2-jwks');
    for (const value of ['https://example.com', 'endpoint-other-get-login', '../login', null, 'endpoint-identity-get-' + 'a'.repeat(200)]) expect(apiEndpointAnchor(value)).toBeNull();
  });
});
