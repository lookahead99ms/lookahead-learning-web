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
