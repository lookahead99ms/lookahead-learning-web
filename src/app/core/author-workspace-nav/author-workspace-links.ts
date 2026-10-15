import type { StudyAccount } from '../../pages/study-plan/study-plan-account';
export const authorDocumentationHome = '/admin/docs';

export const authorWorkspaceLinks = [
  { id: 'docs', label: 'Documentation', href: authorDocumentationHome, icon: '📚' },
  { id: 'previews', label: 'Previews', href: '/admin/previews', icon: '👀' },
  { id: 'delivery', label: 'Delivery Plan', href: '/delivery-plan', icon: '🗺️' },
  { id: 'access', label: 'People and access', href: '/admin/access', icon: '🔐' },
] as const;

export interface AuthorDocumentationPage {
  id: string;
  label: string;
  href: string;
  description: string;
  /** Decorative symbol shown beside the title; never the only way to tell pages apart. */
  icon: string;
  /** Sub-pages that split a long reference into readable topics; listed under this page. */
  children?: readonly AuthorDocumentationPage[];
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
      {
        id: 'plans',
        label: 'Plans and purchases',
        href: '/admin/plans',
        description: 'The plan catalog, where learners buy, and what a buyer sees.',
        icon: '🏷️',
        children: [
          {
            id: 'sales',
            label: 'Sales and prices',
            href: '/admin/sales',
            description: 'Start a sale and change prices as a preview on this browser.',
            icon: '🎉',
          },
        ],
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
        description: 'The OIDC and PKCE sign-in flow: the parts, the sequence and what to keep apart.',
        icon: '🔑',
        children: [
          {
            id: 'authentication-walkthrough',
            label: 'Sign-in walkthrough',
            href: '/admin/authentication-walkthrough',
            description: 'Sign in to Identity, then the gateway, then read protected content, one request at a time.',
            icon: '👣',
          },
        ],
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
        description: 'The DEV plan, its decisions, what is built and verified, and the earlier candidate.',
        icon: '☁️',
        children: [
          {
            id: 'aws-dev-plan',
            label: 'DEV plan',
            href: '/admin/aws-dev-plan',
            description: 'What runs where in DEV, the network boundary and how to read each statement.',
            icon: '📐',
          },
          {
            id: 'aws-dev-decisions',
            label: 'DEV decisions',
            href: '/admin/aws-dev-decisions',
            description: 'All 36 accepted decisions and later refinements: options, choice and why.',
            icon: '⚖️',
          },
          {
            id: 'aws-dev-operations',
            label: 'How DEV runs',
            href: '/admin/aws-dev-operations',
            description: 'Sign-in sessions, release slots, certificates, and starting and stopping DEV.',
            icon: '🔄',
          },
          {
            id: 'aws-dev-permissions',
            label: 'DEV permissions',
            href: '/admin/aws-dev-permissions',
            description: 'Bootstrap and final policies, what they deny and the manual check before start.',
            icon: '🛡️',
          },
          {
            id: 'aws-dev-budget',
            label: 'DEV budget',
            href: '/admin/aws-dev-budget',
            description: 'The 80/100 dollar rule, the annual-domain exception and the cost model.',
            icon: '💵',
          },
          {
            id: 'aws-dev-status',
            label: 'DEV status',
            href: '/admin/aws-dev-status',
            description: 'What is verified, how it was verified and every gate still open.',
            icon: '📍',
          },
          {
            id: 'aws-dev-setup',
            label: 'DEV setup log',
            href: '/admin/aws-dev-setup',
            description: 'AWS account and IAM setup commands, with what each returned.',
            icon: '🧾',
          },
          {
            id: 'aws-dev-workflow',
            label: 'DEV workflow log',
            href: '/admin/aws-dev-workflow',
            description: 'The identity-only GitHub workflow runs and setup troubleshooting.',
            icon: '🔁',
          },
          {
            id: 'aws-candidate-design',
            label: 'Candidate design',
            href: '/admin/aws-candidate-design',
            description: 'The earlier candidate: content delivery, auth, creation order and direction.',
            icon: '📦',
          },
          {
            id: 'aws-candidate-files',
            label: 'Candidate files and IAM',
            href: '/admin/aws-candidate-files',
            description: 'Where the candidate files live, task and JVM settings, and IAM roles.',
            icon: '🗂️',
          },
          {
            id: 'aws-candidate-commands',
            label: 'Candidate commands',
            href: '/admin/aws-candidate-commands',
            description: 'Validation, create, shutdown and rollback procedures for the candidate.',
            icon: '⌨️',
          },
          {
            id: 'aws-candidate-updates',
            label: 'Candidate updates',
            href: '/admin/aws-candidate-updates',
            description: 'Dated 2026-10-09 additions: encryption, endpoints, logging, database jobs.',
            icon: '🗓️',
          },
        ],
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
        children: [
          {
            id: 'support-runbooks',
            label: 'Support runbooks',
            href: '/admin/support-runbooks',
            description: 'Eight runbooks: confirm the problem, check, fix safely and verify.',
            icon: '📒',
          },
        ],
      },
    ],
  },
];

/** Every documentation page, sub-pages included, in reading order. */
export const authorDocumentationLinks: readonly AuthorDocumentationPage[] =
  authorDocumentationGroups.flatMap((group) =>
    group.pages.flatMap((page) => [page, ...(page.children ?? [])]),
  );

export interface AuthorDocumentationSection {
  parent: AuthorDocumentationPage;
  /** The parent first, then its sub-pages, in reading order. */
  pages: readonly AuthorDocumentationPage[];
}

/** The section a page belongs to when it is, or has, sub-pages; null for a standalone page. */
export function authorDocumentationSection(
  pageId: string | null | undefined,
): AuthorDocumentationSection | null {
  for (const group of authorDocumentationGroups) {
    for (const parent of group.pages) {
      const children = parent.children ?? [];
      if (children.length && (parent.id === pageId || children.some((page) => page.id === pageId)))
        return { parent, pages: [parent, ...children] };
    }
  }
  return null;
}

export type AuthorWorkspacePageId =
  | (typeof authorWorkspaceLinks)[number]['id']
  | 'architecture'
  | 'api'
  | 'plans'
  | 'sales'
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
  'authentication-walkthrough': {
    documentId: 'authentication-walkthrough',
    summary: 'Read-only reference · Checked against source, not a live sign-in test.',
    frameTitle: 'OIDC and PKCE sign-in, one request at a time',
  },
  operations: {
    documentId: 'operations-reference',
    summary: 'Read-only reference · Documented topology and procedures, not live service health.',
    frameTitle: 'Repositories, topology, deployment sequence and operator runbooks',
  },
  'aws-deployment': {
    documentId: 'aws-deployment',
    summary: 'Read-only section · DEV built and tested locally; nothing deployed to AWS.',
    frameTitle: 'AWS deployment section overview and current state',
  },
  'aws-dev-plan': {
    documentId: 'aws-dev-plan',
    summary: 'Read-only reference · Accepted and built locally; not deployed.',
    frameTitle: 'Accepted DEV plan, network boundary and statement states',
  },
  'aws-dev-decisions': {
    documentId: 'aws-dev-decisions',
    summary: 'Read-only reference · 36 decisions and later refinements; live checks pending.',
    frameTitle: 'DEV decision register with alternatives and rationale',
  },
  'aws-dev-operations': {
    documentId: 'aws-dev-operations',
    summary: 'Read-only reference · Built and tested locally; never run in AWS.',
    frameTitle: 'DEV sessions, release slots, certificates and shutdown',
  },
  'aws-dev-permissions': {
    documentId: 'aws-dev-permissions',
    summary: 'Read-only reference · Review candidates; nothing installed in AWS.',
    frameTitle: 'DEV permission phases, final policies and pre-start check',
  },
  'aws-dev-budget': {
    documentId: 'aws-dev-budget',
    summary: 'Read-only reference · Conditional estimate, not a bill or a cap.',
    frameTitle: 'DEV budget rule, domain exception and cost model',
  },
  'aws-dev-status': {
    documentId: 'aws-dev-status',
    summary: 'Read-only reference · Live and local checks, kept apart, and open gates.',
    frameTitle: 'DEV checkpoints, evidence labels and remaining gates',
  },
  'aws-dev-setup': {
    documentId: 'aws-dev-setup',
    summary: 'Read-only log · AWS setup commands and observed outputs.',
    frameTitle: 'DEV AWS account and IAM setup commands and outputs',
  },
  'aws-dev-workflow': {
    documentId: 'aws-dev-workflow',
    summary: 'Read-only log · GitHub workflow runs and troubleshooting.',
    frameTitle: 'DEV identity workflow runs and setup troubleshooting',
  },
  'aws-candidate-design': {
    documentId: 'aws-candidate-design',
    summary: 'Read-only reference · Earlier candidate; the DEV plan wins where they differ.',
    frameTitle: 'Earlier candidate content delivery, auth and creation order',
  },
  'aws-candidate-files': {
    documentId: 'aws-candidate-files',
    summary: 'Read-only reference · Earlier candidate; nothing deployed.',
    frameTitle: 'Earlier candidate files, task settings and IAM roles',
  },
  'aws-candidate-commands': {
    documentId: 'aws-candidate-commands',
    summary: 'Read-only reference · Earlier candidate procedures; nothing deployed.',
    frameTitle: 'Earlier candidate commands, rollback and common issues',
  },
  'aws-candidate-updates': {
    documentId: 'aws-candidate-updates',
    summary: 'Read-only reference · Dated candidate additions; nothing deployed.',
    frameTitle: 'Earlier candidate encryption, endpoints, logging and database jobs',
  },
  'release-gates': {
    documentId: 'release-gates',
    summary: 'Read-only reference · Selected policy, not a scan result.',
    frameTitle: 'Security scans and coverage required before release',
  },
  'production-support': {
    documentId: 'production-support',
    summary: 'Support guide · Local steps usable now; DEV/PROD steps need an approved deployment.',
    frameTitle: 'Production support rules, severity, triage and health checks',
  },
  'support-runbooks': {
    documentId: 'support-runbooks',
    summary: 'Runbooks · Local steps usable now; DEV/PROD steps need an approved deployment.',
    frameTitle: 'Production support runbooks',
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
