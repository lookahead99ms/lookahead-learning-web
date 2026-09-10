# Runtime content sync publication

Run the existing `npm run content:sync`, `content:sync:private`, or
`content:sync:fixture` commands. All use one destination lock in the ignored
`.codex-scratch/runtime-content-sync/` directory. Keep this lock shared if adding
another writer; do not rebuild `public/content` in place.

The source is copied into a unique ignored stage, then Search/answer-slide and
Hands-On DSA indexes are generated there. Publication starts only after all these
steps succeed. The previous destination moves to a backup, the complete stage
moves into place, and the old backup is removed. A failed install restores the
old tree; an unrecoverable backup is retained at the path printed by the command.
Obsolete files disappear on successful publication, including when switching from
an authorized private source back to demo content.

Portable Node directory replacement requires two renames, so this is not a
zero-gap or multi-request snapshot protocol. Readers can briefly miss the directory
or straddle generations during publication; retry after sync completes. Generation
failures keep the prior live assets. The design avoids exposing scratch or source
folders through public symlinks.

Normal completion, errors, SIGINT and SIGTERM release the owner lock. An abrupt
SIGKILL or host crash can leave it behind. The command times out after two minutes
and prints the lock path and owner PID; verify that no sync owns the destination
before removing that stale lock. It never steals a lock from a potentially active
writer based only on elapsed time.

Validate with `node --test scripts/runtime-content-publication.test.mjs`.

The DSA ranking authoring manifest is consumed while generating the compact index, then removed from the staged served assets. Evidence confidence, source signals, rationale and editorial scores remain in the private source repository; only learner-facing ranks, study order, tiers and version metadata are projected into the index. Validate the authoritative private source with `validate:content:private`, not by expecting the removed manifest in the served directory.


The ranking reader prefers `learn/hands-on-dsa-ranking-current.json` when present,
resolving its version under `learn/dsa-ranking-releases/` and verifying SHA-256 and
release identity before generating the compact index. Invalid pointers or digests
fail closed; candidate fallback applies only before a current pointer exists.
Sync removes the candidate, pointer and entire private release directory from
staged served assets after projection. Active study-plan snapshots retain their
pinned ranking version and assignment order when a new release appears.
