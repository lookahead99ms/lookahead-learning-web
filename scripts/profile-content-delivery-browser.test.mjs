import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluatePerformanceBudgets,
  linearSlope,
  mergeNetworkSummaries,
  parseBrowserProfileOptions,
  percentile,
  resourceCategory,
  summarizeNetworkRecords,
} from './profile-content-delivery-browser.mjs';

const origin = 'http://127.0.0.1:4300';

test('validates a loopback-only browser profiling command', () => {
  assert.deepEqual(
    parseBrowserProfileOptions([
      '--origin',
      origin,
      '--output',
      '../private/report.json',
      '--cycles',
      '30',
    ]),
    {
      origin,
      output: '../private/report.json',
      chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      cycles: 30,
      budgets: null,
    },
  );
  assert.throws(
    () => parseBrowserProfileOptions(['--origin', 'https://example.com', '--output', 'x']),
    /loopback/,
  );
  assert.throws(
    () => parseBrowserProfileOptions(['--origin', origin, '--output', 'x', '--cycles', '29']),
    /between 30 and 100/,
  );
});

test('computes nearest-rank percentiles and heap slopes deterministically', () => {
  assert.equal(percentile([5, 1, 4, 2, 3], 0.5), 3);
  assert.equal(percentile([5, 1, 4, 2, 3], 0.95), 5);
  assert.equal(percentile([], 0.95), null);
  assert.equal(linearSlope([100, 110, 120, 130]), 10);
  assert.equal(linearSlope([100]), 0);
});

test('separates application assets, content JSON and external requests', () => {
  assert.equal(resourceCategory(`${origin}/content/indexes/learn.json`, origin), 'contentJson');
  assert.equal(resourceCategory(`${origin}/main.js`, origin), 'appAssets');
  assert.equal(resourceCategory('https://fonts.example/font.woff2', origin), 'external');
  const summary = summarizeNetworkRecords(
    [
      {
        url: `${origin}/`,
        type: 'Document',
        status: 200,
        transferBytes: 10,
        encodedBodyBytes: 8,
        decodedBodyBytes: 8,
        requestTimestamp: 10,
        responseTimestamp: 10.01,
        endTimestamp: 10.02,
      },
      {
        url: `${origin}/content/indexes/learn.json`,
        type: 'Fetch',
        status: 200,
        transferBytes: 20,
        encodedBodyBytes: 18,
        decodedBodyBytes: 40,
        fromDiskCache: false,
        requestTimestamp: 10.03,
        responseTimestamp: 10.04,
        endTimestamp: 10.05,
      },
      {
        url: 'https://fonts.example/font.woff2',
        type: 'Font',
        status: 200,
        fromServiceWorker: true,
        requestTimestamp: 10.06,
        responseTimestamp: 10.07,
        endTimestamp: 10.065,
      },
    ],
    origin,
  );
  assert.equal(summary.categories.appAssets.transferBytes, 10);
  assert.equal(summary.categories.contentJson.decodedBodyBytes, 40);
  assert.equal(summary.contentRequests[0].path, '/content/indexes/learn.json');
  assert.deepEqual(
    summary.requests.map(({ category, location }) => ({ category, location })),
    [
      { category: 'appAssets', location: '/' },
      { category: 'contentJson', location: '/content/indexes/learn.json' },
      { category: 'external', location: 'https://fonts.example/font.woff2' },
    ],
  );
  assert.equal(summary.requests[0].startOffsetMs, 0);
  assert.equal(summary.requests[0].durationMs, 20);
  assert.equal(summary.requests[2].durationMs, 10);
  assert.equal(summary.requests[2].endOffsetMs, summary.requests[2].responseOffsetMs);
  assert.equal(summary.requests[2].fromServiceWorker, true);
});

test('merges per-action network windows without losing cache evidence', () => {
  const first = summarizeNetworkRecords(
    [{ url: `${origin}/content/a.json`, transferBytes: 20, decodedBodyBytes: 18 }],
    origin,
  );
  const second = summarizeNetworkRecords(
    [
      {
        url: `${origin}/content/b.json`,
        transferBytes: 0,
        decodedBodyBytes: 0,
        fromDiskCache: true,
      },
    ],
    origin,
  );
  const merged = mergeNetworkSummaries([first, second]);
  assert.equal(merged.categories.contentJson.requests, 2);
  assert.equal(merged.categories.contentJson.transferBytes, 20);
  assert.equal(merged.categories.contentJson.cacheHits, 1);
  assert.equal(merged.contentRequests.length, 2);
  assert.equal(merged.requests.length, 2);
});

function reportFixture() {
  const network = (requests, decodedBodyBytes) => ({
    categories: {
      appAssets: {
        requests: 1,
        transferBytes: 1,
        encodedBodyBytes: 1,
        decodedBodyBytes: 1,
        cacheHits: 0,
        failures: 0,
      },
      contentJson: {
        requests,
        transferBytes: decodedBodyBytes,
        encodedBodyBytes: decodedBodyBytes,
        decodedBodyBytes,
        cacheHits: 0,
        failures: 0,
      },
      external: {
        requests: 0,
        transferBytes: 0,
        encodedBodyBytes: 0,
        decodedBodyBytes: 0,
        cacheHits: 0,
        failures: 0,
      },
    },
    contentRequests: [{ path: '/content/details/learn/x.json', decodedBodyBytes }],
  });
  return {
    routeProfiles: [{ cold: { network: network(2, 100) } }],
    selectedDetailJourney: { warm: { network: network(0, 0) } },
    interactions: {
      standard: { p95Ms: 50 },
      reducedMotion: { p95Ms: 45 },
      throttled: { p95Ms: 120 },
    },
    routeCycles: { heap: { retainedGrowthBytes: 1000, slopeBytesPerCycle: 5 } },
  };
}

test('does not enforce absent or proposed budgets', () => {
  assert.equal(evaluatePerformanceBudgets(reportFixture(), null).enforced, false);
  const result = evaluatePerformanceBudgets(reportFixture(), {
    status: 'proposed-not-approved',
    limits: { maximumColdContentRequests: 2 },
  });
  assert.equal(result.checks[0].status, 'passed');
  assert.equal(result.enforced, false);
  assert.match(result.blockers[0], /proposals/);
});

test('enforces every approved budget independently', () => {
  const result = evaluatePerformanceBudgets(reportFixture(), {
    status: 'approved',
    limits: {
      maximumColdContentRequests: 1,
      maximumColdContentDecodedBytes: 100,
      maximumSelectedDetailDecodedBytes: 100,
      warmCachedDetailContentRequests: 0,
      warmedInteractionP95Ms: 75,
      reducedMotionInteractionP95Ms: 75,
      throttledInteractionP95Ms: 100,
      retainedHeapGrowthBytes: 2000,
      retainedHeapSlopeBytesPerCycle: 10,
    },
  });
  assert.equal(result.enforced, true);
  assert.deepEqual(
    result.checks.filter(({ status }) => status === 'failed').map(({ key }) => key),
    ['maximumColdContentRequests', 'throttledInteractionP95Ms'],
  );
  assert.equal(result.blockers.length, 2);
});
