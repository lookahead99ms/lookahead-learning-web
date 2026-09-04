# Critical route smoke checks

This checklist establishes route availability, not curriculum completeness or release approval. The route definitions in `src/app/app.routes.ts` are authoritative. Run the same checks against one identified application and content source; do not mix the archived frontend, public demo, and private curriculum.

## Record the baseline

- Record frontend and content commit IDs, branches, working-tree state, date, browser, and origin.
- Confirm the listening process's working directory. The active frontend defaults to `http://localhost:4300`; an archived app on another port is not evidence for this checkout.
- Record whether the source is the public demo, synthetic fixtures, or authorized private content. Use `npm run start:private` for the private development companion and curriculum.
- Verify the staged content matches the selected source before browsing. Search indexes are generated assets; the editable delivery plan is read from its local service, not necessarily its staged snapshot.
- Keep concrete private lesson IDs, backlog details, screenshots, and content-source fingerprints in private evidence, not this public checklist.

## Route families

Replace parameters with IDs discovered through the selected catalog, manifests, or visible links. An HTTP 200 response can be the SPA shell; it is not proof that a lesson loaded.

| Route | Expected rendered surface |
| --- | --- |
| `/` | Landing page with navigation into learning, questions, planning, and delivery |
| `/learn` | Learn catalog and expandable curriculum groups |
| `/grow` | Grow catalog with production-engineering course links |
| `/look-ahead` | Look Ahead catalog with architecture and leadership course links |
| `/search` | Cross-platform content discovery and matching results |
| `/interview-questions` | Question-only discovery, expandable answers, and detailed question links |
| `/study-plan` | Time/topic/access inputs and a generated plan with curriculum links |
| `/learn/hands-on-dsa` | Pattern navigation and problem discovery after the catalog loads |
| `/delivery-plan` | Board, roadmap, and decisions from the configured JSON source |
| `/delivery` | Redirect to `/delivery-plan` |
| `/learn/:courseId` | Learn course learning map |
| `/grow/:courseId` | Grow course learning map |
| `/look-ahead/:courseId` | Look Ahead course learning map |
| `/learn/:courseId/module/:moduleId` | Learn module question list |
| `/grow/:courseId/module/:moduleId` | Grow module question list |
| `/look-ahead/:courseId/module/:moduleId` | Look Ahead module question list |
| `/learn/:courseId/:questionId` | Learn lesson, question, or DSA problem using its content contract |
| `/grow/:courseId/:questionId` | Grow lesson or standalone answer |
| `/look-ahead/:courseId/:questionId` | Look Ahead lesson or standalone answer |
| `/learn/:courseId/section/theory` | Compatibility redirect to the course learning map |
| `/learn/:courseId/section/:sectionId` | Legacy section/module navigation for a real section |
| Unmatched route | Current router fallback redirects to Home; do not mistake that for the requested page loading |

Static paths, module paths, and section paths must take precedence over generic course/question paths. Parameterized routes share components but still require representative checks in Learn, Grow, and Look Ahead.

## Minimum journey checks

1. Follow Home to Learn, expand a group, open a course, and open a lesson. Confirm that the heading, content, and breadcrumbs refer to the selected item.
2. Open a representative Grow and Look Ahead course, lesson, module, and standalone answer. A question grid is not a failed lesson if the URL explicitly selects a module.
3. Open the complete question library, then a course/module-filtered link. Wait for the index to finish loading, check the visible filter selections, expand an answer, and follow its detailed question link.
4. Open global Search and verify that it includes content types beyond interview answers. Record the distinction from the question library; do not certify every search behavior through this smoke test.
5. Follow a pattern's Practice action into Hands-On DSA. Verify the pattern query parameter and the selected problem set.
6. Open one guided trace, one self-contained practice problem, and one catalog-only entry if the source contains all three. Advance the trace once. Record missing practice contracts honestly instead of counting every working page as practice-ready.
7. Follow a problem's Hands-On DSA breadcrumb and verify the pattern context. Also inventory any remaining legacy section links.
8. Generate a representative study plan. Record inputs, generated URL, visible schedule, retrieval entries, and sample curriculum destinations. Loading successfully does not certify prerequisite ordering, entitlement enforcement, or learning effectiveness.
9. Open Board, Roadmap, and Decisions and verify the view parameter. Confirm private editing is available only with the local companion; never persist disposable smoke-test stories into the real backlog.
10. Exercise missing course, module, and question IDs by direct navigation. Record explicit error content, blank/loading states, and available recovery controls separately.

## Evidence rules

- Wait for loading indicators to resolve before reporting a pass. Capture the resolved URL, heading, meaningful body content, and the action exercised.
- Label results as `loaded`, `loaded with limitation`, `expected unavailable`, `redirect`, or `failed`. A catalog stub is a limitation even when its route is healthy.
- Keep transient loading observations separate from terminal errors. Repeat a read after asynchronous content arrives rather than treating the first empty shell as a failure.
- Use a fresh test tab, preserve the user's tabs and drafts, and avoid remote services or external source links during a local-only inventory.
- Attach new observations to existing delivery items when they already own the work. Do not quietly turn an inventory into a redesign.

## Follow-on validation

Route availability is only the baseline. Automated regression coverage uses the production route configuration with synthetic content, so it runs without the private curriculum:

| Test file | Protected behavior |
| --- | --- |
| `src/app/pages/content-route-regression.spec.ts` | Learn, Grow, and Look Ahead course/module/question route reuse; missing item IDs; failed-request recovery; stale content removal and superseded responses; legacy Learn sections |
| `src/app/pages/search/search.spec.ts` | Search clearing, URL-driven visible state, Back/Forward, recreated-page state, repeated topic deselection, delayed filter options, first-submit scrolling, and on-demand answers |
| `src/app/pages/hands-on-dsa/hands-on-dsa.spec.ts` | Practice-to-filter-to-problem-to-breadcrumb journey, repeated pattern deselection, collapsed defaults, deep links, catalog failures, and Surprise me eligibility/context |
| `src/app/core/course-learning-map/course-learning-map.spec.ts` | Canonical Practice URLs and counted question-bank links |

Run a real-browser check after the automated suite: clear a search using the keyboard, reload, select/deselect a topic, and use Back/Forward. The router tests simulate history and recreate components; they do not replace an actual browser reload. Verify a representative Practice journey and missing-content page on the identified running checkout.

These checks do not certify curriculum completeness, all malformed query combinations, random-selection fairness, DSA scrolling geometry, performance, or the future unified practice modes. Content certification must cover technical correctness, source completeness, language coverage, traces, and editorial quality. Accessibility, small-screen behavior, production authorization, and code execution require their own evidence.

Useful local checks:

```shell
npm test -- --watch=false
npm run validate:content:private
npm run validate:content
npm run validate:source-boundary
npm run validate:public-readiness
git diff --check
```

Private validation requires the authorized content checkout. None of these commands substitutes for rendered browser checks, commits changes, or publishes content.
