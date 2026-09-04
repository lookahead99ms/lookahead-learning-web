# DSA loading baseline

Use this procedure before changing catalog loading or accordion behavior. It
separates source payload size, local HTTP sampling, DOM observations, and actual
browser profiling. None of these measurements certifies content quality.

## Source and HTTP measurements

Run from the web checkout, supplying an authorized runtime root explicitly:

```sh
npm run test:dsa-profile
npm run profile:dsa -- --root ../private-content/runtime --out ../.codex-scratch/dsa-source.json
npm run profile:dsa -- --root ../private-content/runtime --origin http://127.0.0.1:4300 --repeats 3 --out ../private-content/docs/evidence/dsa-loading.json
```

The example sibling directory is illustrative. Use the actual private content
checkout, not the archived web app. Inspect the listening process and its working
directory first; do not restart the user's service or change its port.

The profiler defaults to the three source courses currently requested by
`HandsOnDsa.ngOnInit`. Repeat `--course path/course-id` to profile a different
explicit set. Tests use in-memory synthetic fixtures and mocked HTTP, without
private content or network access. There is no implicit external-content lookup.

The profiler:

- Follows manifests and non-planned modules using the current `getCourse` model.
- Records per-file bytes, checksums, source record counts and hydrated payload
  shape. Course hydration includes full questions, solutions and inline traces.
- Optionally samples those files over loopback HTTP with six concurrent requests,
  identity encoding requested and no client response cache or redirects.
- Verifies served/source checksum equality on every response. A mismatch or
  failed request aborts instead of reporting an old server as the current source.
- Writes generated measurements outside the public web checkout. Keep proprietary
  filenames and inventory results in the private repository, outside `runtime/`.

## Interpret the units correctly

| Field | Meaning | Does not mean |
| --- | --- | --- |
| `requests` | Manifest/module fetch count in the current source-derived load model | Captured browser waterfall, HTML/JS/assets, connections or HTTP cache misses |
| `sourceBytes` | Sum of uncompressed source JSON bytes, including formatting | Actual production compressed transfer |
| `gzipEstimateBytes` | Sum of independent offline gzip estimates | Compression observed on the server |
| `serializedHydratedBytes` | JSON serialization size of the modeled retained course data | Live browser heap, peak memory, retained DOM or garbage-collection behavior |
| `hydratedShape` | Object/array/string occurrences in that data tree | Heap allocations, backing-store sizes or duplicate object retention |
| `httpSamples.wallMs` | Elapsed Node HTTP batch time on that machine | Browser cold-load time, LCP, INP or low-end-device performance |
| `httpSamples.bodyBytes` | Received response-body bytes after client decoding | Header, TLS, retransmission or connection overhead |
| `browserHeapBytes: null` | Not measured by this tool | Zero memory consumption |

The HTTP sampler discovers the complete file list locally before requests and
does not reproduce the browser's manifest-to-module request waterfall. It also
omits framework bundles, styles, fonts, images, authentication and the rest of
the app. `no-cache` can allow HTTP revalidation; it does not prove every browser
navigation transfers each body again. Do not infer cold-cache behavior from a
new tab or a fast localhost result.

## Browser observation procedure

Record the app/content revisions, source fingerprint, browser, viewport, actual
device and any throttling. Use a fresh test tab without modifying user drafts.

1. Open `/learn/hands-on-dsa`; wait for the problem library, not only page load.
2. Count all DOM elements, pattern headers, open groups and mounted problem
   cards. Record document height and horizontal overflow.
3. Open the first group. Scroll with the pointer inside its body and confirm
   the document moves without needing to move outside that panel.
4. Scroll a later summary into view. Record its viewport coordinate and document
   scroll position, click without locator-driven auto-scroll, then measure both
   again after settlement. Record large document-height changes separately from
   final header displacement.
5. Open the largest group, scroll through it and collapse it. Check whether rows
   are windowed or all remain mounted. Count nodes again after collapse.
6. Repeat at 370 px and 320 px. A small viewport is not CPU/network throttling or
   a low-end physical device. Check filtering, clearing, and URL state separately.
7. Reset temporary viewport overrides and leave no saved test data behind.

For read-only browser connections, DOM geometry may be available while Resource
Timing, heap APIs, performance recording and throttling are not. Record these as
unavailable, not zero or inferred passes. Do not substitute action-tool elapsed
time for input latency; it includes automation overhead.

## Remaining performance captures

A complete performance gate needs a browser request trace and recorded cache
state; initial render and interaction timings; frame/long-task evidence during
accordion switches; and retained-heap snapshots across repeated open/close and
route cycles under a consistent garbage-collection procedure. Also repeat on the
agreed network/CPU profile and with reduced motion.

Separate script, content, asset and infrastructure cost. Define any shared
renderer/cache comparison against the same build and content fingerprint. For
memory, distinguish reachable payloads from garbage awaiting collection; one
process RSS or noisy heap sample cannot establish a leak.

Store target budgets with their measurement definitions, owners and approval
state. Source-derived budgets can be tested in CI; browser responsiveness and
heap budgets still need a browser performance harness. A report containing gaps
must not be presented as a completed performance certification.
