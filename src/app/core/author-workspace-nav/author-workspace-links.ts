import type { StudyAccount } from '../../pages/study-plan/study-plan-account';
export const authorDocumentationHome = '/admin/docs';

export const authorWorkspaceLinks = [
  { id: 'previews', label: 'Previews', href: '/admin/previews', icon: '👀' },
  { id: 'docs', label: 'Documentation', href: authorDocumentationHome, icon: '📚' },
  { id: 'access', label: 'People and access', href: '/admin/access', icon: '🔐' },
  { id: 'delivery', label: 'Delivery Plan', href: '/delivery-plan', icon: '🗺️' },
] as const;

export interface AuthorDocumentationPage {
  id: string;
  label: string;
  href: string;
  description: string;
  /** Decorative symbol shown beside the title; never the only way to tell pages apart. */
  icon: string;
}

export interface AuthorDocumentationGroup {
  id: string;
  label: string;
  reader: string;
  icon: string;
  /** Theme token that colours this group's cards and menu marker. */
  accent: string;
  pages: readonly AuthorDocumentationPage[];
}

/** Documentation pages grouped by the reader who starts there; every author can open all of them. */
export const authorDocumentationGroups: readonly AuthorDocumentationGroup[] = [
  {
    id: 'review',
    label: 'Start here',
    reader: 'For reviewers of the learner product',
    icon: '🧭',
    accent: 'var(--path-learn)',
    pages: [
      {
        id: 'reviewer-guide',
        label: 'Reviewer guide',
        href: '/admin/review-guide',
        description: 'What to review, what is not finished yet and how to send feedback.',
        icon: '📝',
      },
      {
        id: 'screen-names',
        label: 'Pages & screen names',
        href: '/admin/screen-names',
        description: 'The agreed name of every page, view, dialog and panel.',
        icon: '🏷️',
      },
      {
        id: 'access-checks',
        label: 'Content access checks',
        href: '/admin/access-checks',
        description: 'What a learner sees when a lesson is locked, planned or missing.',
        icon: '🔒',
      },
    ],
  },
  {
    id: 'system',
    label: 'How it works',
    reader: 'For technical reviewers',
    icon: '⚙️',
    accent: 'var(--path-blaze)',
    pages: [
      {
        id: 'architecture',
        label: 'Architecture',
        href: '/admin/architecture',
        description: 'Repositories, applications, request journeys and the data model.',
        icon: '🏗️',
      },
      {
        id: 'authentication',
        label: 'Sign-in & authentication',
        href: '/admin/authentication',
        description: 'The OIDC and PKCE sign-in flow, one request at a time.',
        icon: '🔑',
      },
      {
        id: 'api',
        label: 'API reference',
        href: '/admin/api',
        description: 'Backend endpoints, request examples and OpenAPI files.',
        icon: '🔌',
      },
    ],
  },
  {
    id: 'admin',
    label: 'Run and release',
    reader: 'For administrators',
    icon: '🚀',
    accent: 'var(--path-grow)',
    pages: [
      {
        id: 'local-development',
        label: 'Local setup & development',
        href: '/admin/local-development',
        description: 'Worktrees, builds, Docker, ports and verification.',
        icon: '💻',
      },
      {
        id: 'release-gates',
        label: 'Release gates',
        href: '/admin/release-gates',
        description: 'Security scans and coverage a release must pass.',
        icon: '🚦',
      },
      {
        id: 'aws-deployment',
        label: 'AWS deployment',
        href: '/admin/aws-deployment',
        description: 'The DEV and PROD cloud design, commands and open gates.',
        icon: '☁️',
      },
      {
        id: 'operations',
        label: 'Operations',
        href: '/admin/operations',
        description: 'Local environments, deployment order, rollback and repositories.',
        icon: '🛠️',
      },
      {
        id: 'production-support',
        label: 'Production support',
        href: '/admin/production-support',
        description: 'Triage, severity and runbooks for incidents and learner requests.',
        icon: '🚑',
      },
    ],
  },
];

export const authorDocumentationLinks: readonly AuthorDocumentationPage[] =
  authorDocumentationGroups.flatMap((group) => group.pages);

export type AuthorWorkspacePageId =
  | (typeof authorWorkspaceLinks)[number]['id']
  | 'architecture'
  | 'api'
  | AuthorDocumentPageId;

/** Published private documents rendered by the shared document page, keyed by route page id. */
export const authorDocumentPages = {
  'reviewer-guide': {
    documentId: 'reviewer-guide',
    summary: 'Read-only guide · Review scope, known limits and how to report.',
    frameTitle: 'Review scope, known limits and feedback',
  },
  'screen-names': {
    documentId: 'screen-names',
    summary: 'Read-only reference · Names from application source, not a route count.',
    frameTitle: 'Names of pages, views, dialogs and panels',
  },
  'access-checks': {
    documentId: 'access-checks',
    summary: 'Read-only guide · Locked, planned, missing and failed lesson states.',
    frameTitle: 'Content access and recovery checks',
  },
  authentication: {
    documentId: 'authentication',
    summary: 'Read-only reference · Checked against source, not a live sign-in test.',
    frameTitle: 'OIDC, OAuth 2.0 and PKCE sign-in walkthrough',
  },
  'local-development': {
    documentId: 'local-development',
    summary: 'Read-only guide · Worktrees, builds, Docker, ports, and verification.',
    frameTitle: 'Worktrees, builds, Docker, ports and verification',
  },
  operations: {
    documentId: 'operations-reference',
    summary: 'Read-only reference · Documented topology and procedures, not live service health.',
    frameTitle: 'Repositories, topology, deployment sequence and operator runbooks',
  },
  'aws-deployment': {
    documentId: 'aws-deployment',
    summary: 'Read-only reference · Local candidates only; nothing is deployed to AWS.',
    frameTitle: 'AWS DEV and PROD design, commands and fallbacks',
  },
  'release-gates': {
    documentId: 'release-gates',
    summary: 'Read-only reference · Selected policy, not a scan result.',
    frameTitle: 'Security scans and coverage required before release',
  },
  'production-support': {
    documentId: 'production-support',
    summary: 'Runbooks · Local steps usable now; DEV/PROD steps need an approved deployment.',
    frameTitle: 'Production support triage, severity and runbooks',
  },
} as const;

export type AuthorDocumentPageId = keyof typeof authorDocumentPages;

export function isAuthorDocumentPageId(value: unknown): value is AuthorDocumentPageId {
  return typeof value === 'string' && Object.hasOwn(authorDocumentPages, value);
}

export function isAuthorDocumentationRoute(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  return (
    path === authorDocumentationHome || authorDocumentationLinks.some((page) => page.href === path)
  );
}

/** A single documentation page (not the Documentation home, which lists them in its body). */
export function isAuthorDocumentationPage(pageId: string | null | undefined): boolean {
  return authorDocumentationLinks.some((page) => page.id === pageId);
}

export function visibleAdminLinks(account: StudyAccount | null) {
  return authorWorkspaceLinks.filter(page => {
    const permission = page.id === 'access' ? 'manageAccess' : page.id === 'delivery' ? 'deliveryRead' : 'previewDocuments';
    return account?.permissions?.[permission] ?? account?.authorPreview === true;
  });
}
