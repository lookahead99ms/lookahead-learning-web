import type { StudyAccount } from '../../pages/study-plan/study-plan-account';
export const authorDocumentationHome = '/admin/docs';

/**
 * The admin menu in the owner's order (2026-11-06): Documentation, Delivery Plan, Tickets & feedback (the page "Support
 * tickets and feedback"), People & Access (admins and co-authors see it as Test Accounts; the page opens on that tab for
 * them), and Previews last, for the owner and co-authors only.
 */
export const authorWorkspaceLinks = [
  { id: 'docs', label: 'Documentation', href: authorDocumentationHome, icon: '📚' },
  { id: 'delivery', label: 'Delivery Plan', href: '/delivery-plan', icon: '🗺️' },
  // DLV-971 (owner, 2026-11-06): the former Team Reviews tab of Support, as its own admin page.
  { id: 'feedback', label: 'Tickets & feedback', href: '/admin/feedback', icon: '🗂️' },
  { id: 'access', label: 'People & Access', href: '/admin/access', icon: '🔐' },
  { id: 'previews', label: 'Previews', href: '/admin/previews', icon: '👀' },
] as const;

/** The access entry as admins and co-authors see it: the test-account roster, not people. */
export const testAccountsLink = { id: 'access', label: 'Test Accounts', href: '/admin/access', icon: '🧪' } as const;

/** What the access page is called for this account: People & Access for whoever manages access, Test Accounts for admins and co-authors. */
export function accessPageLabel(account: StudyAccount | null): string {
  return account?.permissions && !account.permissions.manageAccess ? testAccountsLink.label : 'People & Access';
}

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

/** Page metadata; visibility remains governed by server-provided staff permissions below. */
const documentationPageCatalog: readonly AuthorDocumentationGroup[] = [
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
            description: 'Manage server-owned sales and prices. Local payments are simulated.',
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
        children: [{id: 'dynamodb-migration', label: 'DynamoDB migration design', href: '/admin/dynamodb-migration', description: 'Proposed migration design and local verification boundaries.', icon: '🗄️'}],
      },
      {
        id: 'contracts',
        label: 'Contracts',
        href: '/admin/contracts',
        description: 'The contract files the repositories keep in step: registry, content paths, release layout, Domain API.',
        icon: '🤝',
      },
      {
        id: 'authentication',
        label: 'Sign-in & authentication',
        href: '/admin/authentication',
        description: 'The OIDC and PKCE sign-in flow: the parts, the sequence and what to keep apart.',
        icon: '🔑',
        children: [
          {id: 'sign-in-flows', label: 'Sign-in flows', href: '/admin/sign-in-flows', description: 'Authentication journeys and their current implementation boundaries.', icon: '🔑'},
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
            id: 'aws-environment-journey',
            label: 'Environment journey',
            href: '/admin/aws-environment-journey',
            description: 'The dated DEV journey, remaining verification and proposed PROD reuse.',
            icon: '🧭',
          },
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
            description: 'DEV runtime ownership, service start and stop, and certificate boundaries.',
            icon: '🔄',
          },
          {
            id: 'aws-dev-certificates', label: 'DEV certificates', href: '/admin/aws-dev-certificates', description: 'Certificate ownership, renewal and verification evidence.', icon: '🔒',
          },
          {
            id: 'aws-dev-permissions',
            label: 'DEV permissions',
            href: '/admin/aws-dev-permissions',
            description: 'Installed permission records, policy boundaries and proposed changes.',
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
            id: 'aws-dev-procedures',
            label: 'DEV procedures',
            href: '/admin/aws-dev-procedures',
            description: 'Who runs AWS changes, and repeatable steps for budget, stacks, upload, audit and cleanup.',
            icon: '📋',
          },
          {
            id: 'aws-dev-records',
            label: 'DEV execution records',
            href: '/admin/aws-dev-records',
            description: 'Dated AWS execution receipts, corrections and prepared work.',
            icon: '🗂️',
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
        children: [
          {
            // DLV-971 (owner, 2026-11-06): the assets bucket as the runtime stores: one live tar, the Delivery Plan,
            // reviews and learner requests, the 4-hour sweeps, the cutover and recovery steps.
            id: 'runtime-stores',
            label: 'Runtime stores',
            href: '/admin/runtime-stores',
            description: 'The assets bucket: one live tar, the Delivery Plan store, reviews and requests, the sweeps.',
            icon: '🗄️',
          },
        ],
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

/** One canonical home for each documentation page; existing page addresses are preserved. */
const documentationPages = documentationPageCatalog.flatMap(group => group.pages);
const pageById = (id: string): AuthorDocumentationPage => documentationPages.find(page => page.id === id)!;
const localApiPage: AuthorDocumentationPage = {
  id: 'local-api', label: 'API client setup', href: '/admin/local-api', icon: '🔌',
  description: 'Prepare a local HTTP client, credentials and an authenticated request workflow.',
};
export const authorDocumentationGroups: readonly AuthorDocumentationGroup[] = [
  {id:'overview', label:'Overview', reader:'Orientation and product review', icon:'🧭', accent:'var(--accent-strong)',
    pages:['screen-names','access-checks','plans','reviewer-guide'].map(pageById)},
  {id:'architecture', label:'Architecture & Design', reader:'System structure and design decisions', icon:'🏗️', accent:'var(--accent-strong)',
    pages:['architecture','authentication'].map(pageById)},
  {id:'api', label:'API Reference', reader:'Endpoint and schema contracts', icon:'🔌', accent:'var(--accent-strong)',
    pages:[{...pageById('api'),description:'Endpoints, request and response schemas, capabilities and contract downloads.'}]},
  {id:'local', label:'Local Development', reader:'Set up, run and verify locally', icon:'💻', accent:'var(--accent-strong)',
    pages:[pageById('local-development'),localApiPage]},
  {id:'release', label:'Build & Release', reader:'Build contracts, validation and deployment', icon:'🚀', accent:'var(--accent-strong)',
    pages:['contracts','release-gates','aws-deployment'].map(pageById)},
  {id:'operations', label:'Operations & Support', reader:'Runtime ownership, diagnosis and recovery', icon:'🛠️', accent:'var(--accent-strong)',
    pages:['operations','production-support'].map(pageById)},
];

export function authorDocumentationGroup(pageId: string | null | undefined): AuthorDocumentationGroup | undefined {
  return authorDocumentationGroups.find(group => group.pages.some(page => page.id === pageId || page.children?.some(child => child.id === pageId)));
}

/** Old Documentation landing hashes remain usable bookmarks. */
export function documentationGroupHref(id: string): string {
  return id === 'api' ? '/admin/api' : '/admin/docs?group=' + id;
}

export function documentationLandingGroup(search: string, hash = ''): string | null {
  const requested = new URLSearchParams(search).get('group');
  if (authorDocumentationGroups.some(group => group.id === requested)) return requested!;
  const legacy: Record<string,string> = {'docs-review':'overview','docs-system':'architecture','docs-admin':'release'};
  return legacy[hash.replace(/^#/, '')] ?? null;
}

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
  | 'local-api'
  | 'plans'
  | 'sales'
  | AuthorDocumentPageId;

/** Published private documents rendered by the shared document page, keyed by route page id. */
export const authorDocumentPages = {
  'dynamodb-migration': {
    documentId: 'dynamodb-migration',
    summary: 'Read-only design · Proposed migration and local verification, not a production cutover.',
    frameTitle: 'DynamoDB migration design and verification boundaries',
  },
  'sign-in-flows': {
    documentId: 'sign-in-flows',
    summary: 'Read-only reference · Sign-in journeys and implementation boundaries.',
    frameTitle: 'Sign-in flows and their implementation boundaries',
  },
  'aws-dev-certificates': {
    documentId: 'aws-dev-certificates',
    summary: 'Read-only reference · DEV certificate procedures and dated verification.',
    frameTitle: 'DEV certificate ownership, renewal and verification',
  },
  'runtime-stores': {
    documentId: 'runtime-stores',
    summary: 'Read-only reference · Runtime store ownership, boundaries and recovery.',
    frameTitle: 'Runtime stores, ownership and recovery',
  },
  contracts: {
    documentId: 'contracts',
    summary: 'Read-only reference · Contracts between applications and their owners.',
    frameTitle: 'Application contracts and ownership',
  },
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
    summary: 'Read-only section · DEV deployment evidence and proposed PROD boundaries.',
    frameTitle: 'AWS deployment section overview and current state',
  },
  'aws-environment-journey': {
    documentId: 'aws-environment-journey',
    summary: 'Read-only reference · Dated DEV milestones and proposed PROD reuse.',
    frameTitle: 'The DEV environment journey, next gates and reuse paths',
  },
  'aws-dev-plan': {
    documentId: 'aws-dev-plan',
    summary: 'Read-only reference · DEV design, implementation evidence and remaining gaps.',
    frameTitle: 'Accepted DEV plan, network boundary and statement states',
  },
  'aws-dev-decisions': {
    documentId: 'aws-dev-decisions',
    summary: 'Read-only reference · Accepted decisions, later refinements and their evidence.',
    frameTitle: 'DEV decision register with alternatives and rationale',
  },
  'aws-dev-operations': {
    documentId: 'aws-dev-operations',
    summary: 'Read-only reference · DEV runtime procedures and dated verification.',
    frameTitle: 'DEV service operation, certificates and shutdown',
  },
  'aws-dev-permissions': {
    documentId: 'aws-dev-permissions',
    summary: 'Read-only reference · Installed permission records and proposed policy changes.',
    frameTitle: 'DEV permission records, policy boundaries and verification',
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
  'aws-dev-procedures': {
    documentId: 'aws-dev-procedures',
    summary: 'Read-only reference · Procedure templates; nothing here runs a command.',
    frameTitle: 'DEV AWS procedures, execution order and cleanup template',
  },
  'aws-dev-records': {
    documentId: 'aws-dev-records',
    summary: 'Read-only log · Dated AWS execution records, corrections and prepared work.',
    frameTitle: 'DEV AWS execution records and prepared, unrun work',
  },
  'aws-candidate-design': {
    documentId: 'aws-candidate-design',
    summary: 'Read-only reference · Earlier candidate; the DEV plan wins where they differ.',
    frameTitle: 'Earlier candidate content delivery, auth and creation order',
  },
  'aws-candidate-files': {
    documentId: 'aws-candidate-files',
    summary: 'Read-only reference · Historical candidate, not current deployment instructions.',
    frameTitle: 'Earlier candidate files, task settings and IAM roles',
  },
  'aws-candidate-commands': {
    documentId: 'aws-candidate-commands',
    summary: 'Read-only reference · Historical procedures, not current deployment instructions.',
    frameTitle: 'Earlier candidate commands, rollback and common issues',
  },
  'aws-candidate-updates': {
    documentId: 'aws-candidate-updates',
    summary: 'Read-only reference · Dated additions to the historical candidate.',
    frameTitle: 'Earlier candidate encryption, endpoints, logging and database jobs',
  },
  'release-gates': {
    documentId: 'release-gates',
    summary: 'Read-only reference · Selected policy, not a scan result.',
    frameTitle: 'Security scans and coverage required before release',
  },
  'production-support': {
    documentId: 'production-support',
    summary: 'Support guide · Local and DEV procedures; PROD remains a proposed environment.',
    frameTitle: 'Production support rules, severity, triage and health checks',
  },
  'support-runbooks': {
    documentId: 'support-runbooks',
    summary: 'Runbooks · Local and DEV procedures; PROD verification remains separate.',
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

/**
 * DLV-969 (owner, 2026-11-04): Previews and Architecture are for the owner and co-authors only. Admins, reviewers and
 * testers never see them in a menu or list, and the route sends them to Documentation.
 */
export function canSeePreviews(account: StudyAccount | null): boolean {
  // The server's staff permissions decide when present (the owner manages access); older answers carry only the flag.
  const permissions = account?.permissions;
  if (permissions) return permissions.manageAccess || permissions.feedbackRole === 'co-author';
  return account?.authorPreview === true;
}

/** Documentation pages only the owner and co-authors open. */
const previewOnlyPages: ReadonlySet<string> = new Set(['architecture']);

/** The documentation groups this account may open; a page it cannot open is not listed at all. */
/**
 * Owner, 2026-11-09: each role sees only the documentation about what it can use. The owner reads everything; a
 * co-author (who reviews the platform and sees Previews and Architecture) reads Overview, Architecture & Design, API
 * Reference and Local Development; an admin (test accounts, tickets) reads Overview and Local Development; reviewers
 * and testers read Overview. Build & Release and Operations & Support describe owner-run work and stay with the owner.
 */
export function documentationGroupIdsFor(account: StudyAccount | null): ReadonlySet<string> {
  const permissions = account?.permissions;
  if (!permissions) return new Set(account?.authorPreview ? authorDocumentationGroups.map((group) => group.id) : []);
  if (permissions.manageAccess) return new Set(authorDocumentationGroups.map((group) => group.id));
  if (permissions.feedbackRole === 'co-author') return new Set(['overview', 'architecture', 'api', 'local']);
  if (permissions.triageFeedback) return new Set(['overview', 'local']);
  return new Set(['overview']);
}

export function visibleDocumentationGroups(account: StudyAccount | null): readonly AuthorDocumentationGroup[] {
  const ids = documentationGroupIdsFor(account);
  const groups = authorDocumentationGroups.filter((group) => ids.has(group.id));
  if (canSeePreviews(account)) return groups;
  return groups
    .map((group) => ({ ...group, pages: group.pages.filter((page) => !previewOnlyPages.has(page.id)) }))
    .filter((group) => group.pages.length > 0);
}

/** Whether this account may open the documentation page at this path; a sub-page counts with its parent's group. */
export function canOpenDocumentationPath(account: StudyAccount | null, path: string): boolean {
  const clean = path.split(/[?#]/, 1)[0].replace(/\/$/, '');
  if (clean === authorDocumentationHome) return true;
  for (const group of authorDocumentationGroups) {
    const page = group.pages.find((candidate) => candidate.href === clean || candidate.children?.some((child) => child.href === clean));
    if (!page) continue;
    if (previewOnlyPages.has(page.id) && !canSeePreviews(account)) return false;
    return documentationGroupIdsFor(account).has(group.id);
  }
  return true; // not a documentation page: the route's other guards decide
}

export function visibleAdminLinks(account: StudyAccount | null): readonly AuthorWorkspaceLink[] {
  return authorWorkspaceLinks
    .filter(page => {
      if (page.id === 'previews') return canSeePreviews(account);
      if (page.id === 'access' && (account?.permissions?.triageFeedback || account?.permissions?.feedbackRole === 'co-author')) return true;
      const permission = page.id === 'access' ? 'manageAccess' : page.id === 'delivery' ? 'deliveryRead' : 'previewDocuments';
      return account?.permissions?.[permission] ?? account?.authorPreview === true;
    })
    .map(page => (page.id === 'access' && accessPageLabel(account) === testAccountsLink.label ? testAccountsLink : page));
}

export type AuthorWorkspaceLink = (typeof authorWorkspaceLinks)[number] | typeof testAccountsLink;
