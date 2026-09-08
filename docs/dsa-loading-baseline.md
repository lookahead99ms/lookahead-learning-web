# Content-delivery performance procedure

Use this procedure before changing catalog, Search, Practice, route-level content
loading, selected-detail caching, or high-density interactions. It separates
source measurements, browser network evidence, renderer heap, and interaction
timing. None of these measurements certifies content quality.

## Current delivery model

- Course routes request one path catalog and one course locator. Module and
  question routes then request only their selected module array or detail.
- Search and Practice request a small manifest. A path-scoped URL requests only
  that path shard; the unscoped library composes all three independently cached
  shards.
- Hands-On DSA requests one compact index. A problem detail is fetched only when
  selected.
- Generated items, module arrays, and canonical DSA details share one
  version-aware LRU bounded by entry count and serialized bytes.

## Source profile

Run from the public web checkout with an explicitly authorized private runtime:

```sh
npm run test:dsa-profile
npm run profile:dsa -- \
  --root ../lookahead-learning-content/runtime \
  --out ../lookahead-learning-content/docs/evidence/DLV-205-canonical-payload-profile.json
```

Source bytes and local gzip estimates are useful distribution evidence. They are
not observed browser transfer, parse cost, renderer heap, or production latency.

## Browser profile

Build and serve a synchronized production configuration on a free loopback port.
Do not stop or replace the user's port 4300 service.

```sh
npm run build:private
npm run start -- --port 4313 --configuration production --host localhost
```

In a separate terminal:

```sh
npm run test:browser-profile
npm run profile:browser:release -- \
  --origin http://localhost:4313 \
  --cycles 30 \
  --budgets ../lookahead-learning-content/docs/evidence/DLV-205-performance-budgets.json \
  --output ../lookahead-learning-content/docs/evidence/DLV-205-browser-profile.json
```

The profiler accepts loopback origins only and writes outside the public
repository. It launches an isolated Chrome profile, clears cache and origin
storage before controlled cold routes, records CDP response and body sizes,
separates app assets from content JSON, and removes the profile afterward.

It covers representative Learn, Grow, Look Ahead, Practice, Hands-On, and
worst-case DSA routes; a cold and warm selected-detail journey; ten-detail cache
saturation; at least 30 detail/catalog cycles; explicit GC before each heap
sample; and standard, reduced-motion, and CPU/network-throttled interactions.

## Interpret evidence honestly

| Measurement                  | Means                                                             | Does not mean                                              |
| ---------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| CDP transfer bytes           | Bytes observed from the local HTTP response                       | Production TLS, CDN, retransmission, or internet cost      |
| Decoded body bytes           | Response body size after content decoding                         | Parsed object or retained-heap size                        |
| Warm zero-request detail     | The application cache served that same version in one SPA session | A CDN or browser-cache guarantee after reload              |
| Explicit-GC renderer heap    | Reachable heap in the inspected renderer after requested GC       | Whole-process RSS or proof that no leak can exist          |
| Frame gaps and action timing | In-page transition behavior for the sampled interaction           | End-to-end user latency or automation-tool round-trip time |
| Synthetic throttling         | Repeatable browser behavior under declared CDP constraints        | Certification on a physical low-end device                 |

## Budget governance

The DLV-205 budget contract is approved. Release profiling uses
`profile:browser:release`, rejects missing or unapproved budgets, and fails every
exceeded measure independently. Decoded-byte utilization at or above 90% emits a
review warning without weakening the hard ceiling. Do not relax a limit or delete
useful teaching content merely to make a run pass; record the decision and
trade-off.

This local Chrome procedure is the repeatable engineering gate. DLV-804 must
remeasure the release candidate with its actual delivery path, startup and cache
churn, natural garbage collection, and representative physical devices before
public release.

## Visual checks

Network and heap evidence do not replace a route walkthrough. Verify loading,
error, empty, filter, clear, browser-history, keyboard, reduced-motion, narrow
viewport, and 200% zoom behavior where applicable. Screenshots support visible
layout claims; the raw browser profile is the evidence for request, byte, heap,
and timing claims.
