# Content completeness audit

Use this inventory to distinguish content that exists from content that has been
verified. It does not certify correctness, teaching quality, accessibility, or
publication readiness.

## Run locally

From the web repository:

```sh
npm run test:content-audit
npm run audit:content
```

The default is the small, public demo. Private content is an explicit opt-in:

```sh
npm run audit:content:private -- --output ../lookahead-learning-content/docs/evidence/content-inventory.json
```

`LOOKAHEAD_CONTENT_ROOT` overrides the sibling content repository only with
`--external`. A positional runtime directory is also supported:

```sh
node scripts/audit-content.mjs test-fixtures/content
```

Keep private reports in the private content repository, outside `runtime/`.
Reports include titles, identifiers, source paths, and review notes. Do not put
them in public assets, public commits, or public CI logs. The tool refuses output
inside its input runtime directory; callers still own the privacy of any other
chosen output location. CI tests use synthetic fixtures only.

## Definitions

| Measurement                    | What it proves                                                                                | What it does not prove                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Course/module/item             | Manifest and source records exist                                                             | All planned curriculum is present                                   |
| Lesson                         | Theory record with a versioned lesson schema or nonempty sections, matching article discovery | A schema-valid or sufficient lesson                                 |
| Theory tag only                | Legacy record is marked theory without an article payload                                     | A separate lesson page                                              |
| Code language                  | Nonempty source or line-based code exists                                                     | Compilable, correct code rather than a starter or pseudocode        |
| Lesson's own code              | Code outside embedded essential problems exists                                               | Three-language parity where applicable                              |
| Visual reference               | Referenced local asset exists                                                                 | A useful visualization, correct state transitions, or accessibility |
| Checks/recall/anchor/invariant | Corresponding content fields are populated                                                    | Accurate, specific, effective teaching                              |
| Review label/booleans          | Author recorded a claim                                                                       | Independently verified review evidence                              |
| CARL and STAR                  | Both evidence structures have all required text fields                                        | A true personal achievement or demonstrated interview skill         |

The inventory counts active records from course manifests. Planned modules are
listed separately and their records are excluded, matching the course loader.
The composed Hands-On DSA catalog route does not require its own course manifest.
Delivery data and generated search indexes are outside the inventory.
An omitted path (as in the public demo) is explicitly listed in `absentPaths`
with `present: false`, not treated as an empty but completed curriculum. A
missing input root or a present learner directory without its catalog is an error.

## DSA accounting

Group construction and normalized-title matching follow the current frontend
helper. A synthetic parity test compares both implementations. Title matching is
not a canonical ID system: variant names may merge, and repeated appearances can
be intentional. Review both `problems` and each problem's `appearances`.

- **Guided** means an embedded essential problem exists.
- **Practice-ready** means an independent record claims `implementationStatus:
complete`.
- **Catalog-only** means a normalized title has neither of those modes.
- **Structurally guided** additionally checks description, invariant, complexity,
  fixtures, three-language code, and a versioned trace with a matching fixture.
- **Structurally practice-ready** additionally checks an objective, constraints,
  examples, representative/boundary/failure fixtures, hints, source link,
  complexity, and three-language solutions.

Guided and practice-ready can overlap. Use their intersection to avoid inflating
the number of supported titles. Embedded traces and separate legacy trace files
are reported independently; neither is an automatic count of working experiences.

No learner solution runs during this inventory. A structurally complete problem
may still have incorrect code, an incompatible editor starter, hidden test cases,
or an incomplete walkthrough. The explicit execution count is zero for this
audit, not a statement about all prior verification.

## Review workflow

1. Record local revisions, branches, runtime origin, and content source.
2. Run the inventory and existing content validators. Missing files and broken
   references produce issues and a nonzero exit; content-quality gaps remain
   report data, not a pretend publishability check.
3. Sample strong and weak lessons across all three paths. Inspect rendered
   articles, Q&As, code tabs, practice starters, and visual behavior separately.
4. Check technical claims against primary sources when needed. Record exact
   examples and limits rather than extrapolating every sample to the whole path.
5. Attach a private Markdown findings report to the delivery ticket. Keep the
   full JSON inventory beside it for repeatable comparisons.
6. Link gaps to existing owners or propose new backlog work. Do not silently
   relabel content, rewrite the curriculum, or certify publication in an audit.

`sourceFingerprint` hashes the sorted learner-file manifest, including each
file's bytes and SHA-256. Reports have no generated timestamp, so unchanged input
produces deterministic output. Changes to delivery notes do not affect it.

Exact repeated answers and body-word counts are investigation aids only. A long
lesson can still repeat generic advice; a concise, technology-specific lesson
does not automatically need examples in unrelated languages. Code inside an HTML
visual is not included in JSON code-language counts.
