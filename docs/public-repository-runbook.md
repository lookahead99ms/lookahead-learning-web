# Public Repository Runbook

## Decision

Keep the existing repository private and active during the transition. Rename it to `lookahead-learning-web-private-archive`, but do not select GitHub's **Archive repository** setting yet. Archiving makes the repository read-only and removes a useful recovery point while the public source is still being proven.

The new `lookahead-learning-web` repository must start with fresh Git history. Do not make the historical repository public, fork it, mirror it, or push its existing branches and tags to the new remote.

## Release gates

From the reviewed private working repository, run:

```shell
npm ci
npm run validate:source-boundary
npm run validate:public-readiness
npm run validate:content
npm run validate:content:ci
npm test -- --watch=false
npm run build
```

Review `git status`, `git diff --stat`, and the complete candidate diff. Confirm that ignored private files do not appear in the candidate.

## Transition sequence

1. Merge the reviewed public-readiness change into the current private repository.
2. Rename the current GitHub repository to `lookahead-learning-web-private-archive`; leave its visibility private and leave repository archiving off.
3. Update the historical working copy's `origin` to the renamed private URL if GitHub's redirect is not sufficient.
4. Export the reviewed candidate into a new sibling directory with `npm run prepare:public-snapshot -- ../lookahead-learning-web-public`. The command copies tracked and unignored candidate files only; ignored local material and `.git` history are excluded.
5. Initialize a new repository with `main` as its initial branch inside that exported directory.
6. Run the full release gates again in the new directory.
7. Inspect the new root commit before adding any remote.
8. Create `lookahead-learning-web` as a new public GitHub repository and push only the new `main` branch.
9. Clone the public repository into another clean directory, run the release gates, and confirm GitHub Actions passes.
10. Add branch protection for `main`, require the CI check, block force pushes and branch deletion, and keep Actions permissions read-only unless a future deployment job has a narrowly scoped need.

Do not copy branches, tags, releases, pull-request refs, or Git objects from the private repository.

## Git settings reference

Match the existing Content API repository's reliable conventions:

- `main` is the default branch;
- CI runs for pushes and pull requests to `main`;
- workflow permissions default to `contents: read`;
- superseded runs are cancelled by concurrency grouping;
- toolchain versions and lockfiles make builds reproducible; and
- verification has an explicit timeout.

No special backend local Git configuration is required. Standard `origin` and branch tracking are sufficient.

## Archive decision

After the public repository has passed CI and clean-clone verification, keep the private repository active until at least the first stable public release and one successful private-content development cycle. Then choose one of two states:

- **Private and active:** recommended while curriculum and product work continue in the same working repository.
- **Private and archived:** appropriate only when it becomes a historical record and all active private work has moved elsewhere.

Repository archiving is operational housekeeping, not a privacy control. Private visibility and fresh public history are the controls that protect the historical curriculum.

## Legal gate

No open-source license is included. Before granting reuse rights, choose a license deliberately based on the intended portfolio, contribution, and commercial model. Public visibility alone should not be treated as permission to reuse the source.
