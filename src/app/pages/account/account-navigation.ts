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
      path === '/delivery-plan' ||
      /^\/(?:study-plan|learn|grow|look-ahead|search|support|author)(?:\/.*)?$/.test(path)
      ? value
      : '/';
  } catch {
    return '/';
  }
}
