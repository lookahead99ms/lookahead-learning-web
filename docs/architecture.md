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

## Content modes

| Mode | Source | Purpose | Command |
| --- | --- | --- | --- |
| Public demo | `demo-content/runtime/` | Human review of a clean clone | `npm start` |
| Contract fixture | `test-fixtures/content/` | Minimal deterministic schema checks | `npm run validate:content:ci` |
| Authorized private | `../lookahead-learning-content/runtime/` | Full local product development | `npm run start:private` |
| Generated staging | `public/content/` | Angular runtime assets | Never commit |

Every mode uses the same catalog, course, module, and question contracts. The public demo discusses repository architecture only; it is not a reduced copy of the interview curriculum.

The sibling path is the local convention, not a production dependency. Set `LOOKAHEAD_CONTENT_ROOT` to an authorized runtime directory when the private repository is checked out elsewhere.

## Frontend composition

- `src/app/pages/` contains route-level standalone components.
- `src/app/core/` contains shared navigation and learning experiences.
- `src/app/content/content.models.ts` defines versioned runtime contracts.
- `src/app/content/content.service.ts` hydrates manifests and builds the search index.
- `src/app/app.routes.ts` owns route-level lazy loading.
- `src/app/app.css` and `src/styles.css` own shared presentation behavior.

The versioned `pattern-lesson/v1` and `guided-trace/v1` contracts let the UI evolve without treating arbitrary JSON as an implicit component API.

## Delivery controls

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
