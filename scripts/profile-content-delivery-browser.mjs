import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loopbackOrigin, requirePrivateOutput } from './profile-dsa-loading.mjs';

const defaultChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

export const representativeRoutes = [
  { id: 'learn-java', route: '/learn/core-java', readyText: 'Java Foundations' },
  { id: 'grow-spring-boot', route: '/grow/spring-boot', readyText: 'Spring Boot' },
  { id: 'grow-angular', route: '/grow/angular', readyText: 'Angular Production Engineering' },
  { id: 'grow-vue', route: '/grow/vue', readyText: 'Vue.js Production Engineering' },
  { id: 'grow-nodejs', route: '/grow/nodejs', readyText: 'Node.js Backend Engineering' },
  {
    id: 'look-ahead-system-design',
    route: '/look-ahead/system-design',
    readyText: 'System Design',
  },
  {
    id: 'practice-grow',
    route: '/interview-questions?path=grow',
    readyText: 'Interview Question Library',
  },
  { id: 'dsa-catalog', route: '/learn/hands-on-dsa', readyText: 'Problem library' },
  {
    id: 'dsa-largest-detail',
    route: '/learn/algorithmic-patterns/dsa-catalog-partition-to-k-equal-sum-subsets',
    readyText: 'Partition to K Equal Sum Subsets',
  },
];

export const cacheSaturationProblems = [
  [
    'Graph Traversal, Ordering, and Shortest Paths',
    '/learn/algorithmic-patterns/dsa-catalog-open-the-lock',
    'Open the Lock',
  ],
  ['Backtracking', '/learn/algorithmic-patterns/dsa-catalog-sudoku-solver', 'Sudoku Solver'],
  [
    'Backtracking',
    '/learn/algorithmic-patterns/dsa-catalog-partition-to-k-equal-sum-subsets',
    'Partition to K Equal Sum Subsets',
  ],
  [
    'Trie and Prefix Search Patterns',
    '/learn/algorithmic-patterns/dsa-catalog-stream-of-characters',
    'Stream of Characters',
  ],
  [
    'Graph Traversal, Ordering, and Shortest Paths',
    '/learn/algorithmic-patterns/dsa-catalog-word-ladder',
    'Word Ladder',
  ],
  [
    'Graph Traversal, Ordering, and Shortest Paths',
    '/learn/algorithmic-patterns/dsa-catalog-escape-the-spreading-fire',
    'Escape the Spreading Fire',
  ],
  [
    'Hashing and Frequency Maps',
    '/learn/algorithmic-patterns/dsa-catalog-valid-sudoku',
    'Valid Sudoku',
  ],
  [
    'Trie and Prefix Search Patterns',
    '/learn/algorithmic-patterns/dsa-catalog-search-suggestions-system',
    'Search Suggestions System',
  ],
  [
    'Greedy Algorithms',
    '/learn/algorithmic-patterns/dsa-catalog-maximum-units-on-a-truck',
    'Maximum Units on a Truck',
  ],
  [
    'Difference Arrays and Range Updates',
    '/learn/algorithmic-patterns/algorithmic-car-pooling',
    'Car Pooling',
  ],
].map(([groupText, href, readyText]) => ({ groupText, href, readyText }));

const wait = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

export function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return Number(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)].toFixed(1));
}

export function linearSlope(values) {
  if (values.length < 2) return 0;
  const count = values.length;
  const meanX = (count - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / count;
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - meanX) * (value - meanY);
    denominator += (index - meanX) ** 2;
  });
  return Number((numerator / denominator).toFixed(1));
}

export function resourceCategory(url, origin) {
  if (url.startsWith(`${origin}/content/`)) return 'contentJson';
  if (url === origin || url.startsWith(`${origin}/`)) return 'appAssets';
  return 'external';
}

export function summarizeNetworkRecords(records, origin) {
  const categories = Object.fromEntries(
    ['appAssets', 'contentJson', 'external'].map((category) => [
      category,
      {
        requests: 0,
        transferBytes: 0,
        encodedBodyBytes: 0,
        decodedBodyBytes: 0,
        cacheHits: 0,
        failures: 0,
      },
    ]),
  );
  for (const record of records) {
    const category = resourceCategory(record.url, origin);
    const summary = categories[category];
    summary.requests += 1;
    summary.transferBytes += record.transferBytes ?? 0;
    summary.encodedBodyBytes += record.encodedBodyBytes ?? 0;
    summary.decodedBodyBytes += record.decodedBodyBytes ?? 0;
    summary.cacheHits += record.fromDiskCache || record.fromServiceWorker ? 1 : 0;
    summary.failures += record.failed ? 1 : 0;
  }
  const firstTimestamp = Math.min(
    ...records
      .map(
        ({ requestTimestamp, responseTimestamp, endTimestamp }) =>
          requestTimestamp ?? responseTimestamp ?? endTimestamp,
      )
      .filter(Number.isFinite),
  );
  const waterfallRequests = records.map((record) => {
    const category = resourceCategory(record.url, origin);
    const requestTimestamp = record.requestTimestamp ?? record.responseTimestamp;
    const endTimestamp =
      Number.isFinite(record.endTimestamp) && Number.isFinite(record.responseTimestamp)
        ? Math.max(record.endTimestamp, record.responseTimestamp)
        : (record.endTimestamp ?? record.responseTimestamp);
    const localUrl = category !== 'external';
    const location = localUrl
      ? `${new URL(record.url).pathname}${new URL(record.url).search}`
      : record.url;
    const offset = (timestamp) =>
      Number.isFinite(timestamp) && Number.isFinite(firstTimestamp)
        ? Number(((timestamp - firstTimestamp) * 1000).toFixed(1))
        : null;

    return {
      category,
      location,
      resourceType: record.type,
      status: record.status,
      mimeType: record.mimeType,
      startOffsetMs: offset(requestTimestamp),
      responseOffsetMs: offset(record.responseTimestamp),
      endOffsetMs: offset(endTimestamp),
      durationMs:
        Number.isFinite(requestTimestamp) && Number.isFinite(endTimestamp)
          ? Number(((endTimestamp - requestTimestamp) * 1000).toFixed(1))
          : null,
      transferBytes: record.transferBytes ?? 0,
      encodedBodyBytes: record.encodedBodyBytes ?? 0,
      decodedBodyBytes: record.decodedBodyBytes ?? 0,
      fromDiskCache: record.fromDiskCache === true,
      fromServiceWorker: record.fromServiceWorker === true,
      failed: record.failed === true,
      ...(record.errorText ? { errorText: record.errorText } : {}),
    };
  });
  return {
    categories,
    requests: waterfallRequests,
    contentRequests: records
      .filter((record) => resourceCategory(record.url, origin) === 'contentJson')
      .map(
        ({
          url,
          status,
          transferBytes,
          encodedBodyBytes,
          decodedBodyBytes,
          fromDiskCache,
          failed,
        }) => ({
          path: new URL(url).pathname,
          status,
          transferBytes,
          encodedBodyBytes,
          decodedBodyBytes,
          fromDiskCache,
          failed,
        }),
      ),
  };
}

export function mergeNetworkSummaries(summaries) {
  const categories = Object.fromEntries(
    ['appAssets', 'contentJson', 'external'].map((category) => [
      category,
      {
        requests: 0,
        transferBytes: 0,
        encodedBodyBytes: 0,
        decodedBodyBytes: 0,
        cacheHits: 0,
        failures: 0,
      },
    ]),
  );
  for (const summary of summaries) {
    for (const category of Object.keys(categories)) {
      for (const key of Object.keys(categories[category])) {
        categories[category][key] += summary.categories[category][key];
      }
    }
  }
  return {
    categories,
    requests: summaries.flatMap(({ requests }) => requests ?? []),
    contentRequests: summaries.flatMap(({ contentRequests }) => contentRequests),
  };
}

export function parseBrowserProfileOptions(args) {
  const options = {
    origin: null,
    output: null,
    chrome: defaultChrome,
    cycles: 30,
    budgets: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!['--origin', '--output', '--chrome', '--cycles', '--budgets'].includes(flag)) {
      throw new Error(`Unknown option: ${flag}`);
    }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--cycles') options.cycles = Number(value);
    else options[flag.slice(2)] = value;
  }
  if (!options.origin) throw new Error('--origin is required');
  if (!options.output) throw new Error('--output is required');
  options.origin = loopbackOrigin(options.origin);
  if (!Number.isInteger(options.cycles) || options.cycles < 30 || options.cycles > 100) {
    throw new Error('--cycles must be between 30 and 100');
  }
  return options;
}

function budgetMeasurement(report, key) {
  const values = {
    maximumColdContentRequests: Math.max(
      ...report.routeProfiles.map(({ cold }) => cold.network.categories.contentJson.requests),
    ),
    maximumColdContentDecodedBytes: Math.max(
      ...report.routeProfiles.map(
        ({ cold }) => cold.network.categories.contentJson.decodedBodyBytes,
      ),
    ),
    maximumSelectedDetailDecodedBytes: Math.max(
      ...report.routeProfiles.flatMap(({ cold }) =>
        cold.network.contentRequests
          .filter(
            ({ path }) =>
              path.startsWith('/content/details/') ||
              path.startsWith('/content/learn/dsa-problems/'),
          )
          .map(({ decodedBodyBytes }) => decodedBodyBytes),
      ),
      0,
    ),
    warmCachedDetailContentRequests:
      report.selectedDetailJourney.warm.network.categories.contentJson.requests,
    warmedInteractionP95Ms: report.interactions.standard.p95Ms,
    reducedMotionInteractionP95Ms: report.interactions.reducedMotion.p95Ms,
    throttledInteractionP95Ms: report.interactions.throttled.p95Ms,
    retainedHeapGrowthBytes: report.routeCycles.heap.retainedGrowthBytes,
    retainedHeapSlopeBytesPerCycle: report.routeCycles.heap.slopeBytesPerCycle,
  };
  return values[key];
}

export function evaluatePerformanceBudgets(report, budgets) {
  if (!budgets) {
    return {
      status: 'not-configured',
      enforced: false,
      blockers: ['Numerical budgets have not been supplied or approved.'],
      checks: [],
    };
  }
  if (!['proposed-not-approved', 'approved'].includes(budgets.status)) {
    throw new Error('Performance budgets must be proposed-not-approved or approved');
  }
  const checks = Object.entries(budgets.limits ?? {}).map(([key, maximum]) => {
    const measured = budgetMeasurement(report, key);
    return {
      key,
      measured,
      maximum,
      status: Number.isFinite(measured) && measured <= maximum ? 'passed' : 'failed',
    };
  });
  const failures = checks.filter(({ status }) => status === 'failed');
  return {
    status: budgets.status,
    enforced: budgets.status === 'approved',
    blockers:
      budgets.status === 'approved'
        ? failures.map(({ key, measured, maximum }) => `${key}: ${measured} exceeds ${maximum}`)
        : ['Numerical budgets are proposals and are not enforced until explicitly approved.'],
    checks,
  };
}

class CdpConnection {
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Timed out connecting to Chrome DevTools')),
        10000,
      );
      socket.addEventListener(
        'open',
        () => {
          clearTimeout(timeout);
          resolvePromise();
        },
        { once: true },
      );
      socket.addEventListener(
        'error',
        () => {
          clearTimeout(timeout);
          reject(new Error('Could not connect to Chrome DevTools'));
        },
        { once: true },
      );
    });
    return new CdpConnection(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener('message', ({ data }) => this.receive(JSON.parse(data)));
  }

  receive(message) {
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result ?? {});
      return;
    }
    const key = `${message.sessionId ?? ''}:${message.method}`;
    for (const listener of this.listeners.get(key) ?? []) listener(message.params ?? {});
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: timed out`));
      }, 30000);
      this.pending.set(id, { method, resolve: resolvePromise, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(method, sessionId, listener) {
    const key = `${sessionId ?? ''}:${method}`;
    const listeners = this.listeners.get(key) ?? new Set();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => listeners.delete(listener);
  }

  waitFor(method, sessionId, timeoutMs = 30000) {
    return new Promise((resolvePromise, reject) => {
      const unsubscribe = this.on(method, sessionId, (params) => {
        clearTimeout(timeout);
        unsubscribe();
        resolvePromise(params);
      });
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error(`${method}: event timed out`));
      }, timeoutMs);
    });
  }

  close() {
    this.socket.close();
  }
}

class CdpSession {
  constructor(connection, sessionId) {
    this.connection = connection;
    this.sessionId = sessionId;
  }

  send(method, params = {}) {
    return this.connection.send(method, params, this.sessionId);
  }

  on(method, listener) {
    return this.connection.on(method, this.sessionId, listener);
  }

  waitFor(method, timeoutMs) {
    return this.connection.waitFor(method, this.sessionId, timeoutMs);
  }
}

class NetworkWindow {
  constructor(session, origin) {
    this.session = session;
    this.origin = origin;
    this.active = false;
    this.records = new Map();
    this.requestTimestamps = new Map();
    session.on('Network.requestWillBeSent', ({ requestId, request, timestamp }) => {
      if (!this.active || !request.url.startsWith('http')) return;
      this.requestTimestamps.set(requestId, timestamp);
    });
    session.on('Network.responseReceived', ({ requestId, response, type, timestamp }) => {
      if (!this.active || !response.url.startsWith('http')) return;
      this.records.set(requestId, {
        requestId,
        url: response.url,
        type,
        status: response.status,
        mimeType: response.mimeType,
        requestTimestamp: this.requestTimestamps.get(requestId),
        responseTimestamp: timestamp,
        fromDiskCache: response.fromDiskCache === true,
        fromServiceWorker: response.fromServiceWorker === true,
        transferBytes: 0,
        encodedBodyBytes: 0,
        decodedBodyBytes: 0,
        failed: false,
      });
    });
    session.on('Network.dataReceived', ({ requestId, dataLength, encodedDataLength }) => {
      const record = this.records.get(requestId);
      if (!record) return;
      record.decodedBodyBytes += dataLength ?? 0;
      record.encodedBodyBytes += encodedDataLength ?? 0;
    });
    session.on('Network.loadingFinished', ({ requestId, encodedDataLength, timestamp }) => {
      const record = this.records.get(requestId);
      if (record) {
        record.transferBytes = encodedDataLength ?? 0;
        record.endTimestamp = timestamp;
      }
    });
    session.on('Network.loadingFailed', ({ requestId, errorText, timestamp }) => {
      const record = this.records.get(requestId);
      if (record) {
        record.failed = true;
        record.errorText = errorText;
        record.endTimestamp = timestamp;
      }
    });
  }

  start() {
    this.records.clear();
    this.requestTimestamps.clear();
    this.active = true;
  }

  async stop() {
    await wait(200);
    this.active = false;
    for (const record of this.records.values()) {
      if (resourceCategory(record.url, this.origin) !== 'contentJson' || record.failed) continue;
      try {
        const body = await this.session.send('Network.getResponseBody', {
          requestId: record.requestId,
        });
        record.decodedBodyBytes = body.base64Encoded
          ? Buffer.from(body.body, 'base64').length
          : Buffer.byteLength(body.body);
      } catch {
        // Keep Network.dataReceived as the explicit fallback when Chrome has evicted a body.
      }
    }
    return summarizeNetworkRecords([...this.records.values()], this.origin);
  }
}

class BrowserHarness {
  constructor(session, origin) {
    this.session = session;
    this.origin = origin;
    this.networkWindow = new NetworkWindow(session, origin);
  }

  async enable() {
    await Promise.all([
      this.session.send('Page.enable'),
      this.session.send('Runtime.enable'),
      this.session.send('Network.enable'),
      this.session.send('HeapProfiler.enable'),
      this.session.send('Performance.enable'),
      this.session.send('Log.enable'),
    ]);
    await this.session.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  async evaluate(expression, awaitPromise = false) {
    const response = await this.session.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ?? 'Browser evaluation failed',
      );
    }
    return response.result?.value;
  }

  async waitForText(text, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    const encoded = JSON.stringify(text);
    while (Date.now() < deadline) {
      if (await this.evaluate(`document.body?.innerText.includes(${encoded}) === true`)) return;
      await wait(50);
    }
    throw new Error(`Timed out waiting for page text: ${text}`);
  }

  async setEnvironment({
    cpuRate = 1,
    latencyMs = 0,
    downloadBytesPerSecond = -1,
    uploadBytesPerSecond = -1,
    reducedMotion = false,
  } = {}) {
    await this.session.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
    await this.session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: latencyMs,
      downloadThroughput: downloadBytesPerSecond,
      uploadThroughput: uploadBytesPerSecond,
      connectionType: latencyMs ? 'cellular4g' : 'none',
    });
    await this.session.send('Emulation.setEmulatedMedia', {
      media: '',
      features: [
        { name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' },
      ],
    });
  }

  async clearCache() {
    await this.session.send('Network.clearBrowserCache');
    await this.session.send('Storage.clearDataForOrigin', {
      origin: this.origin,
      storageTypes: 'all',
    });
  }

  async navigate(route, readyText, { clearCache = false } = {}) {
    if (clearCache) await this.clearCache();
    this.networkWindow.start();
    const loaded = this.session.waitFor('Page.loadEventFired');
    const navigationResult = await this.session.send('Page.navigate', {
      url: `${this.origin}${route}`,
    });
    if (navigationResult.errorText) {
      throw new Error(`Could not navigate to ${route}: ${navigationResult.errorText}`);
    }
    await loaded;
    await this.waitForText(readyText);
    const navigation = await this.evaluate(`(() => {
      const entry = performance.getEntriesByType('navigation')[0];
      return entry ? {
        durationMs: Number(entry.duration.toFixed(1)),
        domContentLoadedMs: Number(entry.domContentLoadedEventEnd.toFixed(1)),
        loadMs: Number(entry.loadEventEnd.toFixed(1))
      } : null;
    })()`);
    return { navigation, network: await this.networkWindow.stop() };
  }

  async clickLink({ href, readyText, groupText }) {
    const expression = `(() => {
      const href = ${JSON.stringify(href)};
      const readyText = ${JSON.stringify(readyText)};
      const groupText = ${JSON.stringify(groupText ?? null)};
      const twoFrames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return (async () => {
        const findLink = () => [...document.querySelectorAll('a')]
          .find((element) => new URL(element.href).pathname === href);
        if (groupText) {
          const group = [...document.querySelectorAll('details.pattern-group')]
            .find((element) => element.querySelector('summary')?.innerText.includes(groupText));
          if (!group) throw new Error('Pattern group not found: ' + groupText);
          if (!findLink() && group.open) {
            group.querySelector('summary').click();
            await twoFrames();
          }
          if (!findLink()) {
            group.querySelector('summary').click();
            for (let attempt = 0; attempt < 100 && !findLink(); attempt += 1) {
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
          }
        }
        const link = findLink();
        if (!link) throw new Error('Link not found: ' + href);
        const started = performance.now();
        let lastFrame = started;
        let maxFrameGapMs = 0;
        let framesOver50Ms = 0;
        let settledFrames = 0;
        link.click();
        return await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Navigation did not settle: ' + href)), 20000);
          const frame = (timestamp) => {
            const gap = timestamp - lastFrame;
            maxFrameGapMs = Math.max(maxFrameGapMs, gap);
            if (gap > 50) framesOver50Ms += 1;
            lastFrame = timestamp;
            const ready = location.pathname === href && document.body.innerText.includes(readyText);
            settledFrames = ready ? settledFrames + 1 : 0;
            if (settledFrames >= 2) {
              clearTimeout(timeout);
              resolve({
                durationMs: Number((timestamp - started).toFixed(1)),
                maxFrameGapMs: Number(maxFrameGapMs.toFixed(1)),
                framesOver50Ms
              });
            } else requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        });
      })();
    })()`;
    this.networkWindow.start();
    const timing = await this.evaluate(expression, true);
    return { timing, network: await this.networkWindow.stop() };
  }

  async measureOrderActions(count) {
    return this.evaluate(
      `(() => {
      const count = ${count};
      const select = document.querySelectorAll('select')[0];
      if (!select) throw new Error('Order select was not found');
      const values = ['study-order', 'pattern-order'];
      const run = async () => {
        const results = [];
        for (let index = 0; index < count; index += 1) {
          const started = performance.now();
          let lastFrame = started;
          let maxFrameGapMs = 0;
          let framesOver50Ms = 0;
          select.value = values[index % values.length];
          select.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise((resolve) => {
            let frames = 0;
            const frame = (timestamp) => {
              const gap = timestamp - lastFrame;
              maxFrameGapMs = Math.max(maxFrameGapMs, gap);
              if (gap > 50) framesOver50Ms += 1;
              lastFrame = timestamp;
              frames += 1;
              if (frames >= 3) resolve();
              else requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          });
          results.push({
            durationMs: Number((performance.now() - started).toFixed(1)),
            maxFrameGapMs: Number(maxFrameGapMs.toFixed(1)),
            framesOver50Ms
          });
        }
        return results;
      };
      return run();
    })()`,
      true,
    );
  }

  async collectHeap() {
    await this.session.send('HeapProfiler.collectGarbage');
    const usage = await this.session.send('Runtime.getHeapUsage');
    return {
      usedBytes: Math.round(usage.usedSize),
      totalBytes: Math.round(usage.totalSize),
      embedderHeapUsedBytes: Math.round(usage.embedderHeapUsedSize ?? 0),
      backingStorageBytes: Math.round(usage.backingStorageSize ?? 0),
    };
  }
}

async function launchChrome(chromePath) {
  const userDataDir = await mkdtemp(resolve(tmpdir(), 'lookahead-dlv-205-chrome-'));
  const chromeProcess = spawn(
    chromePath,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const webSocketUrl = await new Promise((resolvePromise, reject) => {
    let stderr = '';
    const timeout = setTimeout(
      () => reject(new Error(`Chrome DevTools did not start: ${stderr}`)),
      15000,
    );
    chromeProcess.stderr.setEncoding('utf8');
    chromeProcess.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr);
      if (match) {
        clearTimeout(timeout);
        resolvePromise(match[1]);
      }
    });
    chromeProcess.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chrome exited before DevTools was ready (${code}): ${stderr}`));
    });
  });
  return {
    chromeProcess,
    userDataDir,
    webSocketUrl,
    async close() {
      if (chromeProcess.exitCode === null) chromeProcess.kill('SIGTERM');
      await Promise.race([
        new Promise((resolvePromise) => chromeProcess.once('exit', resolvePromise)),
        wait(3000),
      ]);
      await rm(userDataDir, { recursive: true, force: true });
    },
  };
}

function summarizeInteractions(samples) {
  const durations = samples.map(({ durationMs }) => durationMs);
  return {
    actions: samples.length,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    maximumMs: percentile(durations, 1),
    maximumFrameGapMs: percentile(
      samples.map(({ maxFrameGapMs }) => maxFrameGapMs),
      1,
    ),
    framesOver50Ms: samples.reduce((sum, sample) => sum + sample.framesOver50Ms, 0),
    samples,
  };
}

async function measureInteractionProfile(harness, environment, count) {
  await harness.setEnvironment(environment);
  await harness.navigate('/learn/hands-on-dsa', 'Problem library', { clearCache: true });
  return summarizeInteractions(await harness.measureOrderActions(count));
}

async function captureReport(options) {
  const chrome = await launchChrome(options.chrome);
  let connection;
  try {
    connection = await CdpConnection.connect(chrome.webSocketUrl);
    const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await connection.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    const session = new CdpSession(connection, sessionId);
    const harness = new BrowserHarness(session, options.origin);
    await harness.enable();
    await harness.setEnvironment();
    const version = await connection.send('Browser.getVersion');
    const routeProfiles = [];
    for (const route of representativeRoutes) {
      const cold = await harness.navigate(route.route, route.readyText, { clearCache: true });
      const warm = await harness.navigate(route.route, route.readyText);
      routeProfiles.push({ ...route, cold, warm });
    }

    await harness.setEnvironment();
    await harness.navigate('/learn/hands-on-dsa', 'Problem library', { clearCache: true });
    const coldDetail = await harness.clickLink({
      groupText: 'Graph Traversal, Ordering, and Shortest Paths',
      href: '/learn/algorithmic-patterns/dsa-catalog-open-the-lock',
      readyText: 'Open the Lock',
    });
    await harness.clickLink({ href: '/learn/hands-on-dsa', readyText: 'Problem library' });
    const warmDetail = await harness.clickLink({
      groupText: 'Graph Traversal, Ordering, and Shortest Paths',
      href: '/learn/algorithmic-patterns/dsa-catalog-open-the-lock',
      readyText: 'Open the Lock',
    });
    await harness.clickLink({ href: '/learn/hands-on-dsa', readyText: 'Problem library' });

    const initialHeap = await harness.collectHeap();
    const saturation = [];
    for (const problem of cacheSaturationProblems) {
      const opened = await harness.clickLink(problem);
      const closed = await harness.clickLink({
        href: '/learn/hands-on-dsa',
        readyText: 'Problem library',
      });
      saturation.push({ ...problem, opened, closed });
    }
    const saturatedHeap = await harness.collectHeap();
    await harness.clickLink({
      groupText: 'Graph Traversal, Ordering, and Shortest Paths',
      href: '/learn/algorithmic-patterns/dsa-catalog-open-the-lock',
      readyText: 'Open the Lock',
    });
    await harness.clickLink({ href: '/learn/hands-on-dsa', readyText: 'Problem library' });

    const detailSamples = [];
    const catalogSamples = [];
    const heapSamples = [];
    const cycleNetworks = [];
    for (let cycle = 0; cycle < options.cycles; cycle += 1) {
      const opened = await harness.clickLink({
        groupText: 'Graph Traversal, Ordering, and Shortest Paths',
        href: '/learn/algorithmic-patterns/dsa-catalog-open-the-lock',
        readyText: 'Open the Lock',
      });
      const closed = await harness.clickLink({
        href: '/learn/hands-on-dsa',
        readyText: 'Problem library',
      });
      detailSamples.push(opened.timing);
      catalogSamples.push(closed.timing);
      cycleNetworks.push(opened.network, closed.network);
      heapSamples.push((await harness.collectHeap()).usedBytes);
    }
    const cycleNetwork = mergeNetworkSummaries(cycleNetworks);
    const finalHeap = await harness.collectHeap();

    const interactions = {
      standard: await measureInteractionProfile(harness, {}, options.cycles),
      reducedMotion: await measureInteractionProfile(
        harness,
        { reducedMotion: true },
        options.cycles,
      ),
      throttled: await measureInteractionProfile(
        harness,
        {
          cpuRate: 4,
          latencyMs: 150,
          downloadBytesPerSecond: 200000,
          uploadBytesPerSecond: 93750,
        },
        options.cycles,
      ),
    };
    await harness.setEnvironment();

    const report = {
      schemaVersion: 'content-delivery-browser-profile/v2',
      capturedAt: new Date().toISOString(),
      environment: {
        browser: version.product,
        userAgent: version.userAgent,
        protocolVersion: version.protocolVersion,
        platform: process.platform,
        viewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
        coldCache:
          'Isolated Chrome profile; browser cache and origin storage cleared before each cold route.',
        heap: 'HeapProfiler.collectGarbage followed by Runtime.getHeapUsage after every measured cycle.',
        throttledProfile: {
          cpuSlowdown: 4,
          latencyMs: 150,
          downloadBytesPerSecond: 200000,
          uploadBytesPerSecond: 93750,
          note: 'Synthetic Chrome throttling is not a physical low-end device.',
        },
      },
      routeProfiles,
      selectedDetailJourney: { cold: coldDetail, warm: warmDetail },
      cacheSaturation: saturation,
      routeCycles: {
        cycles: options.cycles,
        detail: summarizeInteractions(detailSamples),
        catalog: summarizeInteractions(catalogSamples),
        network: cycleNetwork,
        heap: {
          initial: initialHeap,
          afterSaturation: saturatedHeap,
          final: finalHeap,
          samples: heapSamples,
          retainedGrowthBytes: finalHeap.usedBytes - saturatedHeap.usedBytes,
          slopeBytesPerCycle: linearSlope(heapSamples),
          lastTenRangeBytes:
            Math.max(...heapSamples.slice(-10)) - Math.min(...heapSamples.slice(-10)),
        },
      },
      interactions,
      limitations: [
        'Local loopback transfer and timing do not represent production TLS, CDN, server, or internet latency.',
        'Chrome throttling is deterministic tooling evidence, not a physical low-end-device certification.',
        'Runtime.getHeapUsage measures the inspected renderer after explicit GC; it is not whole-system RSS.',
      ],
    };
    const budgets = options.budgets
      ? JSON.parse(await readFile(resolve(options.budgets), 'utf8'))
      : null;
    report.budgetEvaluation = evaluatePerformanceBudgets(report, budgets);
    return report;
  } finally {
    connection?.close();
    await chrome.close();
  }
}

async function main() {
  const options = parseBrowserProfileOptions(process.argv.slice(2));
  const output = requirePrivateOutput(options.output, repositoryRoot);
  const report = await captureReport(options);
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Browser content-delivery profile written to ${output}\n`);
  if (report.budgetEvaluation.enforced && report.budgetEvaluation.blockers.length)
    process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
