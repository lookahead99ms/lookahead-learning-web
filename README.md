# Look Ahead Learning Web

Angular frontend for a technical interview learning platform organized into three progressive stages: **Learn**, **Grow**, and **Look Ahead**.

This repository is designed as a portfolio-safe source release. It includes the application shell, content contracts, shared learning experiences, tests, and deliberately synthetic demo content. The proprietary curriculum, authoring sources, study plans, and production content are maintained outside the public Git history.

## What this demonstrates

- Standalone Angular architecture with route-level code splitting and reusable learning components.
- A versioned content model for Q&A, theory, guided algorithm traces, practice, and access metadata.
- Runtime separation between product code and independently delivered learning material.
- Responsive layouts, keyboard interaction, semantic navigation, and accessible content fallbacks.
- Fail-closed CI checks for content contracts, source boundaries, tests, and production builds.

## Quick start

Requirements: Node.js 24 and npm 11+.

```shell
npm ci
npm start
```

Open http://localhost:4300. The default command always loads tracked synthetic material from `demo-content/runtime`, even when a private sibling checkout exists. No API, database, credentials, Docker, or private content repository is required. To use another free port: `npm start -- --host 127.0.0.1 --port 4317`.

Try `/learn` → **Public Platform Demo**, `/grow` → **Public Release Demo**, `/search`, and `/study-plan`. The demo includes seven synthetic search records to demonstrate the reader, search, and planning flow. Plans and notes stay in this browser; the demo does not provide account synchronization or production authentication.

### Development modes and feedback

Use the browser-local demo above for frontend work. It uses synthetic content,
keeps plans in this browser and makes no account API calls. A private curriculum
checkout can use the following command on an available port for the same
browser-local account behavior:

```shell
npm run start:private -- --configuration demo --host 127.0.0.1 --port 4318
```

That mode serves private content locally and is not a public distribution build.

The optional connected preview uses real local API/database persistence and local
account/content authorization. Its checks establish local behavior, not deployed
cross-device service availability or production security readiness. Mocked API
fixtures must be identified as simulated. Keep an existing connected service
available when the screen being changed requires it; AWS is not required for
frontend development.

For a frontend-only change, run the affected unit/component tests, build and a
targeted browser check. When the UI uses a changed API contract, authentication
state, saved progress, sync or recovery, add focused contract and cross-service
checks. Backend changes need affected backend/API/database tests; infrastructure
changes need affected smoke checks. Use the full integration/browser suite at an
explicit release or stage gate, or when broader impact justifies it. Documentation
and delivery bookkeeping need only relevant reference/schema/diff checks.

Run the complete public verification path with:

```shell
npm run validate:source-boundary
npm run validate:public-readiness
npm run validate:content
npm run validate:content:ci
npm test -- --watch=false
npm run build
```

See [Architecture](docs/architecture.md), [Content Boundary](docs/content-boundary.md), and the [Public Repository Runbook](docs/public-repository-runbook.md) for the design and release model.

## Repository status

This code is a product showcase, not a curriculum distribution channel. No open-source license has been selected; public visibility does not grant reuse or redistribution rights.

## UI map and naming guide

Use the names below when requesting UI changes. The names are stable semantic regions; the implementation selectors and source files are included for precision.

### Global vocabulary

- **Header** — the top navigation area shared by the content pages.
- **Brand block** — the `LA` mark, `Look Ahead` name, and platform tagline in the header.
- **Breadcrumbs** — the route trail below the header, such as `Home / Grow / Spring Boot`.
- **Reader sticky context** — the content header area that remains visible while reading.
- **Page message** — loading, unavailable, or not-found feedback shown when content cannot be displayed.
- **CTA** — a call-to-action link or button that moves the user to another page or content level.

### Landing page — `/`

Source: `src/app/pages/landing/landing.html` and `src/app/pages/landing/landing.ts`

```text
[Landing page]
├── Header
│   ├── Brand block
│   └── Profile menu
├── Hero panel
│   ├── Hero eyebrow: "CRACK YOUR TECHNICAL INTERVIEWS."
│   ├── Hero title: "Think Bigger. Build Better. Engineer for Tomorrow."
│   ├── Hero support text
│   └── Hero stage buttons
├── Roadmap panel
│   ├── Roadmap introduction
│   │   ├── Roadmap title
│   │   └── Roadmap description
│   ├── Roadmap stage tabs
│   │   ├── Learn tab
│   │   ├── Grow tab
│   │   └── Look Ahead tab
│   └── Active stage panel
│       ├── Stage subtitle
│       ├── Stage category link
│       └── Topic pill grid
└── FAQ panel
```

#### Landing page regions and controls

| Name to use | Current selector or control | Purpose |
| --- | --- | --- |
| **Hero panel** | `.landing-hero` | Main landing-page introduction and promise. |
| **Hero eyebrow** | `.hero-eyebrow` | Small uppercase interview-preparation label. |
| **Hero title** | `.landing-hero h1` | Main landing-page headline. |
| **Hero support text** | `.hero-support` | Supporting platform description. |
| **Hero stage buttons** | `.hero-tagline-actions` | Three buttons that select a roadmap stage and scroll to it. |
| **What’s Possible button** | `.hero-tagline-btn.learn` | Selects Learn. |
| **New Opportunities button** | `.hero-tagline-btn.grow` | Selects Grow. |
| **Full Potential button** | `.hero-tagline-btn.look-ahead` | Selects Look Ahead. |
| **Roadmap panel** | `.roadmap-container` | White card containing the roadmap introduction, tabs, and active content. |
| **Roadmap introduction** | `.bridge-container` | Title and description above the tabs. |
| **Roadmap title** | `.bridge-title` | `Start where you are. Build towards where you want to be.` |
| **Roadmap description** | `.bridge-subtext` | Explains Q&As, code examples, algorithms, and system design. |
| **Roadmap stage tabs** | `.tab-navigation` | Three-stage tablist. |
| **Stage tab** | `.tab-btn` | Selects one stage; supports mouse and keyboard navigation. |
| **Active stage panel** | `.tab-content-panel` | Displays only the selected stage. |
| **Stage subtitle** | `.stage-subtitle` | Short description of the selected stage. |
| **Stage category link** | `.stage-link` | Links to the selected catalog: Core Competencies, Applied Capabilities, or Specialized Practices. |
| **Topic pill grid** | `.skills-pill-grid` | Wrapping grid of links to individual courses or practices. |
| **Topic pill** | `.skill-pill` | Navigates to a course page for Learn or Grow. |
| **FAQ panel** | `.landing-faq` / `.faq-bar` | Expandable frequently asked questions section. |

#### Landing stage labels

| Stage | Tab category | Catalog route | Accent |
| --- | --- | --- | --- |
| Learn | Core Competencies | `/learn` | Cyan blue `#168ca5` |
| Grow | Applied Capabilities | `/grow` | Copper bronze `#b45309` |
| Look Ahead | Specialized Practices | `/look-ahead` | Slate navy `#334155` |

The active stage is controlled by `selectedStage` in `landing.ts`. `activeStage()` supplies the selected subtitle and topic list. Only one `.tab-content-panel` is rendered at a time.

### Learn catalog page — `/learn`

Source: `src/app/pages/learn/learn.html` and `src/app/pages/learn/learn.ts`

```text
[Learn catalog page]
├── Header
├── Catalog context panel
│   ├── Breadcrumbs
│   ├── Page title: Learn
│   └── Learn introduction
└── Learn course grid
    └── Learn course cards
```

| Name to use | Current selector or control | Purpose |
| --- | --- | --- |
| **Learn catalog context** | `.catalog-context-panel` | Sticky introduction for Learn. |
| **Learn introduction** | `.catalog-context-panel p` | Explains the foundation stage. |
| **Learn course grid** | `.catalog-course-grid` | Displays available Learn competencies. |
| **Learn course card** | `.learn-course-card` | Links to `/learn/:courseId`; unavailable cards show `Coming next`. |
| **Review status badge** | `.review-status` | Shows content review status when applicable. |

### Grow catalog page — `/grow`

Source: `src/app/pages/grow/grow.html` and `src/app/pages/grow/grow.ts`

```text
[Grow catalog page]
├── Header
├── Grow catalog context panel
│   ├── Breadcrumbs
│   ├── Page title: Grow
│   └── Grow introduction
└── Grow capability grid
    └── Grow capability cards
```

| Name to use | Current selector or control | Purpose |
| --- | --- | --- |
| **Grow catalog context** | `.grow-catalog` | Sticky introduction for Grow. |
| **Grow introduction** | `.grow-catalog p` | Explains applied capabilities and production-ready applications. |
| **Grow capability grid** | `.catalog-course-grid` | Displays Grow capabilities. |
| **Grow capability card** | `.grow-course-card` | Links to `/grow/:courseId`. |
| **Grow review status badge** | `.review-status` | Shows content review status when applicable. |

### Look Ahead catalog page — `/look-ahead`

Source: `src/app/pages/look-ahead/look-ahead.html` and `src/app/pages/look-ahead/look-ahead.ts`

```text
[Look Ahead catalog page]
├── Header
├── Look Ahead catalog context panel
│   ├── Breadcrumbs
│   ├── Page title: Look Ahead
│   └── Look Ahead introduction
└── Look Ahead practices grid
    └── Specialized practice cards
```

| Name to use | Current selector or control | Purpose |
| --- | --- | --- |
| **Look Ahead catalog context** | `.look-ahead-catalog` | Sticky introduction for Look Ahead. |
| **Look Ahead introduction** | `.look-ahead-catalog p` | Explains senior engineering, architecture, and leadership preparation. |
| **Look Ahead practices grid** | `.catalog-course-grid` | Displays specialized practices. |
| **Specialized practice card** | `.look-ahead-course-card` | Currently unavailable/planned cards; shows `Coming next`. |
| **Practice status badge** | `.review-status` | Shows planned or review status. |

The shared course, module, and question routes also support Look Ahead. Availability reflects the selected content source; the public demo does not contain the private Look Ahead curriculum.

### Course page — `/learn/:courseId` or `/grow/:courseId`

Source: `src/app/pages/course/course.html` and `src/app/pages/course/course.ts`

```text
[Course page]
├── Header
├── Course sticky context panel
│   ├── Breadcrumbs
│   ├── Review status badge
│   ├── Course title
│   ├── Course description
│   ├── Course chips
│   └── Course navigation
│       ├── Previous competency/capability
│       └── Next competency/capability
└── Module list
    └── Module tiles
```

| Name to use | Current selector or control | Purpose |
| --- | --- | --- |
| **Course context panel** | `.course-context-panel` | Sticky course title and navigation region. |
| **Course title** | `.reader-question-title` | Displays the current course or capability name. |
| **Course description** | `.course-context-panel .eyebrow` | Introductory course description. |
| **Course chips** | `.course-chips` | Optional technology/topic labels. |
| **Course navigation** | `.course-sticky-navigation` | Previous and next course navigation. |
| **Module list** | `.module-question-list` | Main list of modules in the course. |
| **Module grid** | `.module-grid` | Layout container for module tiles. |
| **Module tile** | `.module-tile` | Links to `/.../:courseId/module/:moduleId`. |
| **Content status message** | `.page-message` | Loading or unavailable course state. |

### Module page — `/learn/:courseId/module/:moduleId` or `/grow/:courseId/module/:moduleId`

Source: `src/app/pages/module/module.html` and `src/app/pages/module/module.ts`

```text
[Module page]
├── Header
├── Module sticky context
│   ├── Breadcrumbs
│   ├── Module title link
│   └── Module navigation
│       ├── Previous module
│       ├── Next module
│       └── Next course / catalog CTA
└── Module question list
    └── Question cards
```

| Name to use | Current selector or control | Purpose |
| --- | --- | --- |
| **Module context** | `.reader-sticky-context` | Sticky breadcrumbs, module title, and navigation. |
| **Module title link** | `.reader-module` | Identifies the current module and links to its route. |
| **Module navigation** | `.module-sticky-navigation` | Moves between modules or to the next course. |
| **Module question list** | `.module-question-list` | Main question area. |
| **Module question grid** | `.module-question-grid` | Question card layout. |
| **Question card** | `.question-card` | Links to `/.../:courseId/:questionId`. |
| **Empty module message** | `.module-status` | Shown when a module has no questions. |

### Question reader page — `/learn/:courseId/:questionId` or `/grow/:courseId/:questionId`

Source: `src/app/pages/question/question.html` and `src/app/pages/question/question.ts`

```text
[Question reader page]
├── Header
├── Question context
│   ├── Breadcrumbs
│   └── Module link
├── Question panel
│   ├── Review status badge
│   ├── Question title
│   ├── Difficulty label
│   └── Question navigation
├── Interview answer panel
│   ├── Interview answer
│   └── Detailed explanation button
├── Follow-ups panel
│   └── Expandable follow-up items
└── Detailed answer dialog [conditional]
    ├── Dialog header and close button
    ├── Explanation panel
    ├── Code panel
    │   ├── Code title and language
    │   ├── Source code
    │   └── Compatibility notes [conditional]
    └── Complexity panel [conditional]
```

| Name to use | Current selector or control | Purpose |
| --- | --- | --- |
| **Question context** | `.reader-sticky-context` | Breadcrumbs and module context. |
| **Module link** | `.reader-module` | Returns to the current module. |
| **Question panel** | `.reader-question-panel` | Question title, difficulty, status, and navigation. |
| **Question navigation** | `.question-sticky-navigation` | Previous/next question, module, or course controls. |
| **Interview answer panel** | `.reader-interview-panel` | Short conversational interview answer. |
| **Detailed explanation button** | `.details-trigger` | Opens the detailed answer dialog. |
| **Follow-ups panel** | `.main-followups` | Expandable likely follow-up questions and answers. |
| **Follow-up item** | `.main-followups details` | Individual expandable follow-up. |
| **Detailed answer dialog** | `.details-dialog` | Modal containing the long explanation and code. |
| **Dialog close button** | `.details-dialog header button` | Closes the detailed answer dialog. |
| **Explanation panel** | `.explanation-panel` | Detailed written explanation. |
| **Code panel** | `.code-panel` | Code sample, language, and compatibility information. |
| **Compatibility notes** | `.compatibility-notes` | Version/runtime compatibility requirements. |
| **Complexity panel** | `.resolution-panel` | Time, space, and practical guidance. |

The question reader's dialog is controlled by the `detailsOpen` signal. The `Escape` key closes it.

## Route map

| Route | Page | Primary UI name |
| --- | --- | --- |
| `/` | Landing page | Hero panel and roadmap panel |
| `/learn` | Learn catalog | Learn course grid |
| `/grow` | Grow catalog | Grow capability grid |
| `/look-ahead` | Look Ahead catalog | Look Ahead practices grid |
| `/learn/:courseId` | Learn course | Course context and module list |
| `/grow/:courseId` | Grow course | Course context and module list |
| `/learn/:courseId/module/:moduleId` | Learn module | Module question list |
| `/grow/:courseId/module/:moduleId` | Grow module | Module question list |
| `/learn/:courseId/:questionId` | Learn question | Question reader page |
| `/grow/:courseId/:questionId` | Grow question | Question reader page |
| `**` | Redirect | Redirects to `/` |

## Content and implementation notes

- Page components are standalone Angular components under `src/app/pages`.
- The application shell is `src/app/app.html`, which contains the router outlet.
- Route definitions are in `src/app/app.routes.ts`.
- Shared layout styles are in `src/app/app.css` and `src/styles.css`; landing-page-specific styles are in `landing.ts`.
- `ContentService` loads content from `/content/`; default development stages synthetic demo files, while explicit private commands stage authorized private content.
- All three paths share course, module, and reader components. The small public demo intentionally leaves most offerings unavailable.
- Preview pages and preview routes are not part of the production application and should not be added to commits unless explicitly requested.

## Technology

- Angular 22
- TypeScript 6
- Standalone components
- Angular Router
- Angular HTTP Client
- Vitest

## Local development

Requirements:

- Node.js 24
- npm 11+

```shell
npm ci
npm start
```

`npm start`, `npm run build`, and `npm run watch` synchronize tracked synthetic demo material into ignored `public/content/` runtime staging before Angular runs. Never commit generated `public/content/` files.

Authorized private development uses explicit commands:

```shell
npm run start:private
npm run build:private
npm run watch:private
```

Those commands require the private `lookahead-learning-content` repository beside this repository and consume its `runtime/` directory. Set `LOOKAHEAD_CONTENT_ROOT` to an absolute runtime path when using a different checkout layout. Private commands fail when that source is unavailable; they never substitute public demo content.

For authorized local account integration, use `npm run start:connected -- --host 127.0.0.1 --port 4316` (an alias of `start:private`). This uses the protected content build and `proxy.conf.json` to reach the OAuth gateway on `http://127.0.0.1:4330` and authorization server on `http://127.0.0.1:4320`. Use the canonical browser origin `http://127.0.0.1:4316` for exact OAuth callbacks. Start the separately owned API/database stack using its runbook first. The existing integrated service may already own 4316; inspect it before starting another process.

The shared header shows Sign in when signed out and the account menu when authenticated. Dedicated `/sign-in` and `/sign-up` routes provide email/password login and explicit profile registration when the API advertises registration availability. Registration requires first name, last name, email, matching passwords, and an explicitly selected country of residence. Google is visibly unavailable until its provider integration is connected. The standalone public demo leaves account integration disabled. When the account API cannot confirm a save or sign-in, the UI reports the failure and preserves the browser plan; it does not claim that a browser-only save reached an account.

The integrated local stack can enable an author account through its API seed configuration. Sign in with `author@lookahead.test` and the locally generated synthetic seed password, then use **Account menu → Author views** or `/author`. This workspace links the existing catalogs, tools and Study Plan states. Saved and revised examples belong to that account; opening a preview does not save it. The server supplies the author capability and ordinary content grants. A URL parameter, display name or browser flag cannot grant author access, and the author cannot read another learner's private plans. The public demo has no seeded author account.

`content:sync:dev` is an optional maintainer command that discovers a private sibling; it is never run by default demo startup. Each checkout has one `public/content/` staging directory. Use separate checkouts for simultaneous public-demo and private servers so one content sync cannot replace the other server’s assets.

Production will replace local runtime staging with an authenticated content origin. Keep `ContentService` independent of AWS-specific SDKs so the delivery implementation can move to S3 and CloudFront without coupling content storage to page components.

## Verification

Public verification requires only tracked repository files:

```shell
npm run validate:source-boundary
npm run validate:public-readiness
npm run validate:content
npm run validate:content:ci
npm test -- --watch=false
npm run build
```

Authorized maintainers can additionally validate the private curriculum against the public content contract:

```shell
npm run validate:content:private
npm test -- --watch=false
npm run build:private
```

Files under `demo-content/runtime/` are deliberately synthetic and support human review of the public application. Files under `test-fixtures/content/` are smaller contract fixtures used for deterministic CI diagnostics. Neither directory contains production curriculum.

First-party OAuth is available through `npm run start:oauth -- --host 127.0.0.1 --port 4316` after starting the infra OAuth stack. Access and refresh tokens remain in the server gateway; browser calls use same-origin `/bff/api/v1/**` with an HttpOnly cookie and CSRF tokens. Google federation remains separately configured. For this mode, do not use a development/static build containing private curriculum.
