export function safeAccountReturn(value: string | null): string {
  if (!value?.startsWith('/') || /[\\\u0000-\u0020\u007f-\u009f]/.test(value)) return '/';
  try {
    const path = decodeURIComponent(value.split(/[?#]/, 1)[0]);
    // Check the original path before navigation can normalize traversal segments.
    if (
      /[\\\u0000-\u001f\u007f-\u009f]/.test(decodeURIComponent(value)) ||
      /(?:^|\/)\.{1,2}(?:\/|$)/.test(path)
    )
      return '/';
    return path === '/' ||
      path === '/account' ||
      path === '/pricing' || path === '/delivery-plan' ||
      /^\/(?:study-plan|learn|grow|blaze|look-ahead|search|support|author|admin)(?:\/.*)?$/.test(path)
      ? value
      : '/';
  } catch {
    return '/';
  }
}

/** The sign-in a person picks on our own page (DLV-969); the Gateway then skips Cognito's page. */
export type SignInProvider = 'google' | 'password';

/** Gateway sign-in link that returns to `returnTo` afterwards, optionally straight to one provider. */
export function gatewayLoginUrl(returnTo: string, provider?: SignInProvider): string {
  const chosen = provider ? 'provider=' + provider + '&' : '';
  return '/bff/login?' + chosen + 'returnTo=' + encodeURIComponent(returnTo);
}
