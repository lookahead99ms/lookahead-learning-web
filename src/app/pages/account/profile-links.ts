import type { ProfileLinks } from './account-settings-client';

export type ProfileLinkKey = keyof ProfileLinks;

export interface ProfileLinkField {
  key: ProfileLinkKey;
  label: string;
  placeholder: string;
  /** Allowed hosts; null accepts any public https site (portfolio). */
  hosts: readonly string[] | null;
  error: string;
}

/** Same rules as Identity's POST /api/v1/account/links (DLV-932), checked here first for a quick answer. */
export const profileLinkFields: readonly ProfileLinkField[] = [
  {
    key: 'github',
    label: 'GitHub',
    placeholder: 'https://github.com/your-name',
    hosts: ['github.com', 'www.github.com'],
    error: 'Use an https://github.com/… address for GitHub.',
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    placeholder: 'https://www.linkedin.com/in/your-name',
    hosts: ['linkedin.com', 'www.linkedin.com'],
    error: 'Use an https://www.linkedin.com/… address for LinkedIn.',
  },
  {
    key: 'x',
    label: 'X (Twitter)',
    placeholder: 'https://x.com/your-name',
    hosts: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
    error: 'Use an https://x.com/… address for X.',
  },
  {
    key: 'website',
    label: 'Portfolio',
    placeholder: 'https://your-portfolio.dev',
    hosts: null,
    error: 'Use an https:// address for your website.',
  },
];

/**
 * Normalizes one typed link: blank → null; a missing scheme gets https://. Returns undefined when
 * the address breaks the rules.
 */
export function normalizeProfileLink(field: ProfileLinkField, typed: string): string | null | undefined {
  const value = typed.trim();
  if (!value) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : 'https://' + value;
  if (Array.from(candidate).length > 300 || /[\s\u0000-\u001f\u007f-\u009f]/.test(candidate)) return undefined;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return undefined;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
    return undefined;
  if (field.hosts) {
    if (!field.hosts.includes(host) || !url.pathname.replace(/\//g, '')) return undefined;
  } else if (
    !host.includes('.') ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    /^\d+(\.\d+){3}$/.test(host) ||
    host.startsWith('[')
  ) {
    return undefined;
  }
  return candidate;
}

/** The address without its scheme or a trailing slash, for display. */
export function displayProfileLink(url: string): string {
  return url.replace(/^https:\/\//i, '').replace(/\/$/, '');
}
