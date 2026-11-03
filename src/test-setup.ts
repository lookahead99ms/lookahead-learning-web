import '@angular/compiler';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

const testBedSetup = Symbol.for('@angular/cli/testbed-setup');
const testGlobal = globalThis as typeof globalThis & { [testBedSetup]?: boolean };

if (!testGlobal[testBedSetup]) {
  testGlobal[testBedSetup] = true;
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
    errorOnUnknownElements: true,
    errorOnUnknownProperties: true,
  });
}

// DLV-969 S37: the header hint lives in browser storage (where the test environment has one, as in CI); each test
// starts and ends without one, whatever ran before it.
function clearHeaderHint(): void {
  try {
    globalThis.localStorage?.removeItem('lookahead.header-hint');
  } catch {
    // No storage in this environment: nothing to clear.
  }
}
beforeEach(clearHeaderHint);
afterEach(clearHeaderHint);
