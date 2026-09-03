# Architecture

## System context

Look Ahead Learning Web is an Angular application shell for structured technical-interview preparation. It presents three learner stages:

- **Learn** builds language, algorithm, data-structure, and tooling foundations.
- **Grow** applies those foundations to production engineering capabilities.
- **Look Ahead** prepares engineers for architecture, leadership, and changing industry practices.

The public repository demonstrates the shell and its contracts. Authored curriculum is a separate protected asset.

## Runtime boundaries

```text
Browser
  -> Angular routes and page components
    -> ContentService
      -> /content/{path}/catalog.json
      -> /content/{path}/{courseId}/course.json
      -> /content/{path}/{courseId}/modules/{moduleId}.json
```

`ContentService` depends on HTTP resources, not an AWS SDK or local filesystem API. Local scripts stage a selected source under ignored `public/content/`; production can satisfy the same URL contract through an authenticated API or content origin.

## Local process topology

| Process                 | Default address          | Responsibility                                                 |
| ----------------------- | ------------------------ | -------------------------------------------------------------- |
| Active Angular frontend | `http://localhost:4300`  | The single learner and delivery-plan UI                        |
| Local delivery editor   | Loopback, temporary port | Private development companion behind `/__local/delivery/`      |
| Content API             | `http://localhost:8080`  | Future authenticated content and entitlement boundary          |
| Archived frontend       | No default process       | Historical comparison only; do not use as a runtime dependency |

The active frontend must not redirect into the archived frontend. During local development, relative `/content` requests resolve to synchronized, ignored runtime assets. The future deployment shape keeps one browser origin and routes `/api` and `/content` to their owning services through a reverse proxy or gateway.

The Angular frontend can be packaged as static files in an Nginx or Caddy container. Private curriculum must not be baked into a public image; production content belongs behind the authenticated content boundary, while local container development may use a read-only content mount.

## Content modes

| Mode               | Source                                   | Purpose                             | Command                       |
| ------------------ | ---------------------------------------- | ----------------------------------- | ----------------------------- |
| Public demo        | `demo-content/runtime/`                  | Human review of a clean clone       | `npm start`                   |
| Contract fixture   | `test-fixtures/content/`                 | Minimal deterministic schema checks | `npm run validate:content:ci` |
| Authorized private | `../lookahead-learning-content/runtime/` | Full local product development      | `npm run start:private`       |
| Generated staging  | `public/content/`                        | Angular runtime assets              | Never commit                  |

Every mode uses the same catalog, course, module, and question contracts. The public demo discusses repository architecture only; it is not a reduced copy of the interview curriculum.

The sibling path is the local convention, not a production dependency. Set `LOOKAHEAD_CONTENT_ROOT` to an authorized runtime directory when the private repository is checked out elsewhere.

`npm run start:private` watches the private runtime directory and regenerates ignored runtime assets after curriculum changes. Delivery-plan changes are excluded from whole-app reloads: the board refreshes its private JSON snapshot every five seconds without discarding an open draft.

## Delivery plan boundary

`/delivery-plan` first probes `/__local/delivery/plan`. The private launcher starts a dependency-free Node HTTP companion bound to loopback and proxies this namespace through Angular. Workflow columns, priorities, stages, work items, decisions, and interruption rules remain data-defined. When no local companion exists, the route falls back to read-only `/content/delivery/delivery-plan.json` through `ContentService`.

Humans can create and edit stories, tasks, epics, defects, research items, and decisions; change their delivery stage; and move cards across workflow columns by dragging or using the accessible Move selector. A work item of type Decision is not an architecture-decision record: the separate decisions and roadmap definitions are still edited in JSON.

Save requests use a SHA-256 source revision. The companion serializes its writes, validates editable fields and relationships, rejects dependency cycles and stale revisions, writes a temporary sibling file, and atomically renames it over the fixed private plan file. IDs and timestamps are server-owned. Existing item metadata and the rest of the plan are preserved. There is no delete endpoint, arbitrary file endpoint, commit, push, or browser-storage database.

The browser retains a failed or conflicting draft. Reloading the latest item requires an explicit discard action. A new item may refresh its base revision without discarding its text. External-editor changes are checked again immediately before rename; arbitrary tools that ignore this protocol still have a narrow check-to-rename race, so this is not a multi-process transactional database. Stop simultaneous file edits before bulk rewrites.

Unsaved editor changes require confirmation before in-app navigation. Navigation is blocked while a save is pending, including a card move. Refreshing or closing the tab requests the browser's standard unsaved-changes warning; browsers can suppress that warning, and drafts are not persisted across reloads or crashes. Save explicitly to retain changes on disk.

Board filters restore their displayed selections from the URL after the JSON options load. Column header counts describe visible matching cards; WIP counts and limit warnings always include all work in that workflow column across all stages, even when filters hide those cards.

The generated proxy config and its per-process capability live under ignored `.angular/delivery-editor/`, not public assets. The companion requires that capability, a loopback client, an allowed local Origin, JSON content type, and a custom request header for mutations. It is only started by `start:private`, requires a fixed local HTTP port, and is not a production API or suitable for network sharing. Docker/public deployments must not expose it. The public demo contains synthetic data only; the real backlog remains in the private content repository.

Work items may attach Markdown reports through `evidence: [{ id, title, path }]` metadata maintained in the private JSON. Paths must remain under the content repository's `docs/evidence/` directory; files are not copied into public runtime assets. The local companion resolves `/__local/delivery/evidence/:itemId/:evidenceId` (also accepting a `.md` suffix) only for explicitly attached regular Markdown files, rejects traversal and symlink escapes, and limits reports to 1 MiB. The default response is a formatted, script-free report with responsive tables and navigation; `?raw=1` returns plain text and `?download=1` downloads the original Markdown. All responses remain non-cacheable. This is a private local viewing capability, not a file-upload or public document-hosting service. Restart `start:private` after changing companion code.

The local-only renderer uses the pinned development dependency `marked`, following its [renderer extension API](https://marked.js.org/using_pro). Markdown parsing alone is not sanitization: raw HTML is escaped, images are omitted, link protocols are restricted, and a restrictive CSP permits only the hash of the viewer's fixed stylesheet, not scripts or arbitrary inline styles. The renderer is never imported into the Angular application bundle.

Run `npm run test:delivery-api` for persistence, validation, concurrency, private report access, and local-boundary checks using disposable synthetic data. Angular tests cover the editor, restored filters, unfiltered WIP limits, accessible moves, conflict retention, discard confirmation, navigation protection, refresh-warning requests, and local-only evidence links.

## Frontend composition

- `src/app/pages/` contains route-level standalone components.
- `src/app/core/` contains shared navigation and learning experiences.
- `src/app/content/content.models.ts` defines versioned runtime contracts.
- `src/app/content/content.service.ts` hydrates manifests and builds the search index.
- `src/app/app.routes.ts` owns route-level lazy loading.
- `src/app/app.css` and `src/styles.css` own shared presentation behavior.

The versioned `pattern-lesson/v1` and `guided-trace/v1` contracts let the UI evolve without treating arbitrary JSON as an implicit component API.

## Delivery controls

Use [Critical route smoke checks](route-smoke-checks.md) to establish a reproducible rendered-route baseline before changing navigation. Concrete private-content results belong in the private content repository, not the public source tree.

The public CI path is intentionally reproducible from tracked files:

1. Install exactly from `package-lock.json`.
2. allow only the reviewed, version-pinned transitive install scripts recorded in `package.json`;
3. reject private or generated paths;
4. inspect the release candidate for local paths and credential-shaped material;
5. validate public demo and synthetic fixture contracts;
6. run unit tests; and
7. build the public demo application.

The workflow uses read-only repository permissions, cancels superseded runs, and applies a bounded timeout. Private content and private implementation fixtures are not CI dependencies.

## Production direction

The intended production boundary is authenticated content delivery with authorization decisions outside page components. Object storage and a CDN can provide immutable assets, while an API issues entitlements or signed access. The browser-facing URL contract should remain stable so storage, caching, and commercial packaging can evolve independently from the learning UI.
