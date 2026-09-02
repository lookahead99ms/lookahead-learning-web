# Content Boundary

## Purpose

The application source is suitable for public portfolio review. The authored learning product is not. This document defines that boundary so publication does not depend on memory or manual file selection.

## Public material

The public repository may contain:

- application code, styles, route composition, and reusable UI components;
- TypeScript content schemas and generic transformation logic;
- unit tests built from synthetic records;
- deliberately synthetic demo content under `demo-content/runtime/`;
- minimal contract fixtures under `test-fixtures/content/`;
- architecture, setup, security, and contribution-facing documentation; and
- CI and release-safety scripts that do not encode real curriculum.

## Private material

The public repository must not contain:

- curriculum catalogs, lessons, interview questions, solutions, traces, or study plans;
- authoring sources, editorial notes, review audits, product blueprints, or delivery handoffs;
- executable harnesses that enumerate or reveal authored problem sets;
- personal behavioral stories or private research notes;
- screenshots or previews derived from unpublished content;
- credentials, environment files, signing material, or local machine paths; or
- generated `public/content/` assets from an authorized private run.

Moving private material to a different file extension does not make it public-safe. TypeScript, Markdown, images, tests, and scripts receive the same review as JSON.

## Source layout

| Location | Classification | Git policy |
| --- | --- | --- |
| `src/` | Public product source | Track |
| `demo-content/runtime/` | Synthetic public demonstration | Track |
| `test-fixtures/content/` | Synthetic contract fixtures | Track |
| `../lookahead-learning-content/runtime/` | Proprietary runtime assets in a separate repository | Private repository only |
| `private-content/` | Retired in-repository private-content location | Ignore and reject from publication |
| `public/content/` | Generated runtime staging | Ignore |
| `.local-previews/` | Local design review | Ignore |

## Enforcement

`npm run validate:source-boundary` rejects tracked private and generated content paths. `npm run validate:public-readiness` inspects tracked files plus unignored additions and rejects:

- known private, generated, build, IDE, and preview paths;
- credential-shaped filenames and key/token markers;
- absolute local user paths;
- source imports from an in-repository `private-content/` tree; and
- symbolic links that could point outside the reviewed snapshot.

The checks reduce publication risk but do not replace review. Before creating a public remote, inspect the complete fresh-history commit and test a clean clone.

## Production delivery

Production content should be versioned independently and delivered through an authenticated origin. A deployment process may copy authorized assets to protected object storage, but those assets must never pass through the public Git repository or its Actions artifacts.

If private material is ever published, stop distribution, make the repository private, rotate any exposed credentials, remove the material from public history, and treat existing clones and caches as compromised copies.
