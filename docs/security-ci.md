# Frontend security checks

The existing `Learning Web CI` workflow keeps its `verify` job and displayed
check name, **Test and build Angular application**. Security checks, existing
content-boundary validation, all frontend unit tests and the public demo build
and protected container smoke/security checks must succeed in that job. `npm run test:coverage` includes every production TypeScript file and a conservative uncovered count for every runtime shell script recursively under `deployment/container`; the combined line floor is 85%, with branch coverage reported separately. No path filters, tolerated failures or privileged
`pull_request_target` execution are used. A cancelled, failed or unavailable run
is not evidence of a passing check. Repository branch-protection settings and
hosted pull-request behavior require separate verification after authorized
publication; this configuration does not change those settings.

## Controls and limits

| Control | Blocking result | Coverage |
| --- | --- | --- |
| npm audit | High or critical; malformed output, tool failure or incomplete inventory | Exact lockfile locations, including direct/transitive, development, production, optional and peer dependencies |
| CycloneDX SBOM | A lockfile package or dependency edge is missing | npm lockfile SBOM plus a location-level inventory; identical name/version locations may share one SBOM component |
| CodeQL | Security severity >= 7, an error-level nonsecurity result, missing report or execution/coverage warning | JS/TS under `src`, `scripts` and the Vitest configuration, using the linked bundle and `security-extended` queries |
| Trivy | HIGH/CRITICAL/UNKNOWN vulnerabilities or misconfiguration, any secret, scanner errors or missing Dockerfile/OS package coverage | Dockerfile and current source, pinned Node builder and NGINX runtime bases, immutable local built image |
| Gitleaks | Any detected secret; scanner/report failure or shallow history | Public candidate files, full reachable Git history and the base-to-merge commit range on PRs |

Low and moderate dependency findings remain in the local report even when they
do not block the high/critical gate. `npm audit` requests the public registry live;
the receipt records the request time and explicitly states that the registry
does not expose its advisory database timestamp. It cannot establish absence of
unknown vulnerabilities or audit a package missing from registry advisory data.
`npm ci` still validates manifest/lockfile agreement and the actual installation.
Platform-specific optional packages remain covered by the lockfile audit even
when npm does not install them on the runner.

CodeQL is static analysis. It does not certify Angular template/runtime behavior,
generated code, deployment headers/configuration, server authorization, CSRF,
revocation, cross-account isolation or business flows. Existing Angular tests
include synthetic author/auth UI cases; their success does not prove real backend
authorization. API and cross-service security tests belong to their service owners.
Report-parser fixtures prove gate behavior, not that the CodeQL engine finds a
seeded defect. Actual engine execution and hosted fail/pass PR fixtures must be
recorded separately before claiming that acceptance.

Gitleaks uses the pinned publisher defaults. Those rules contain exclusions and
stopwords, including binary assets and dependency lockfiles, and do not detect
every encoded or unknown secret. This repository adds no global suppression;
repository ignore files and inline `gitleaks:allow` comments cannot bypass the
scan. Synthetic tests prove a clean tree, an uncommitted finding, a secret added
then removed from history, the PR commit range, redaction, and rejection of shallow
clones. Findings require review and any exposure needs a separate rotation/removal
response; deleting a current file does not clean its history.

## Local commands

Use Node.js 24, Python 3, Docker, and the exact npm version declared in `packageManager`. Scanner downloads and vulnerability database updates need network access.

```sh
npm run test:security-gates
python3 -m unittest discover -s tools/security -p 'test_*.py'
python3 tools/security/container_scan.py install
python3 tools/security/container_scan.py config
npm run security:dependencies
npm run security:install-secret-scanner
npm run test:secret-scanner
npm run security:secrets
# After an actual CodeQL analysis writes javascript.sarif:
npm run security:sarif -- .codex-scratch/security/codeql
# After an authorized local build writes its immutable image ID:
python3 tools/security/container_scan.py images --image "$(cat /tmp/lookahead-web-image-id)"
```

Reports stay in ignored `.codex-scratch/security/`. The dependency receipt records
source revision, timestamps, package locations, versions, direct/transitive
relationship and SHA-256 digests of the lockfile, audit and SBOM. Secret receipts
contain only rule, relative file, line and commit identity; raw matches, secrets,
author/email and scanner output are discarded. A new failed scan replaces any
previous successful receipt with incomplete coverage. The container scanner deletes stale JSON before each run and checks the executable against the retained publisher archive hash. Trivy diagnostics and raw reports stay locally ignored; its summary prints only counts. Image reports must use schema 2, include an image configuration ID, and describe Linux AMD64. Remote bases must match the requested digest in `RepoDigests`; local image reports must match the SHA-256 of the configuration exported by `docker image save` for the exact immutable build ID. The bounded temporary archive handles Docker Desktop index/config identity differences, rejects ambiguous or unsafe metadata, and is removed after validation. Public logs contain counts
and generic failures, not report payloads.

CI checks out only this public repository, without persisted credentials, and
uses a read-only token on disposable GitHub-hosted runners. It does not check out
private curriculum or use account/registry/deployment secrets. npm and CodeQL
dependency caches are disabled. CodeQL has `upload: never` and
`upload-database: false`; no SARIF, database, SBOM or raw secret report is uploaded
as an Actions artifact. The job retains ordinary public build/test logs. Do not
enable action debug artifact uploads without reviewing their data boundary.

## Pinned tools and dependency proposals

Reviewed on 2026-09-19 using publisher release metadata and action entrypoints:

| Tool | Pin |
| --- | --- |
| checkout 6.0.3 | `df4cb1c069e1874edd31b4311f1884172cec0e10` |
| setup-node 6.5.0 | `249970729cb0ef3589644e2896645e5dc5ba9c38` |
| CodeQL Action v4, linked CLI/bundle 2.27.0 | `1c5b675653bb5c22dbe9b12b556ec555138e09fd` |
| npm | `11.17.0`, matching the existing package-manager declaration |
| Trivy | `0.74.0`; platform archive SHA-256 in `tools/security/tools.json`, with executable revalidation before each scan |
| Gitleaks | `8.30.1`; platform archive SHA-256 checked by the installer |

This is a version/provenance review, not an independent audit of bundled tool code.
The existing action major versions are retained; patches within v6 were resolved
to immutable commits. Tool upgrades need reviewed pin and fixture updates.

`.github/dependabot.yml` proposes weekly npm, Docker base and GitHub Actions updates after
publication. It groups Angular packages together and never auto-merges. Version
proposals do not replace the full transitive audit; security-update settings,
actual proposal creation and branch protection have not been activated by a local
configuration edit. Native scanner/archive updates require a reviewed version and
checksum change. No dependency versions are changed by these CI edits.

Publisher references: [npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/),
[npm SBOM](https://docs.npmjs.com/cli/v11/commands/npm-sbom/),
[CodeQL workflow options](https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options),
[pinned analyze inputs](https://github.com/github/codeql-action/blob/1c5b675653bb5c22dbe9b12b556ec555138e09fd/analyze/action.yml),
[pinned linked bundle](https://github.com/github/codeql-action/blob/1c5b675653bb5c22dbe9b12b556ec555138e09fd/src/defaults.json),
[checkout release](https://github.com/actions/checkout/releases/tag/v6.0.3),
[setup-node release](https://github.com/actions/setup-node/releases/tag/v6.5.0),
[Gitleaks release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1),
[Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).

## Required check and deployment boundary

PRs targeting `main` and pushes to `main` run the same unconditional job; no path filter or tolerated failure can omit a required step. Concurrency cancels superseded runs on the same ref. No Content or Infra checkout, inventory, receipt or credentials are prerequisites for this application check. The public sample validation is owned by this repository. A green application check does not satisfy the separate Infra release/deployment gates.

After the user-owned Git cycle and a real hosted run, configure an **active** branch rule for `main`: require a pull request, require **Test and build Angular application** from GitHub Actions, require the branch to be up to date, and prevent ordinary direct pushes/bypasses. Keep Actions enabled for the pinned actions, the default token read-only, and fork workflows without write tokens or secrets. The workflow has no deployment job, registry push, AWS permissions, environment or deployment secrets. Merge queues are not configured; enabling one also requires a `merge_group` trigger before relying on these checks. A local edit does not activate or verify any repository setting.

The October 2026 workflow/helper review ran Node and Python failure fixtures and workflow parsing locally. The new container scan wiring has not run on GitHub or rescanned an image in this batch; older local image results remain bound to their original source snapshot. Hosted execution, seeded analyzer failures, and actual branch-rule rejection still need verification after publication.

References: [required checks and skipped workflows](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks), [protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
