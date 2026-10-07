import '@angular/compiler';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';

try {
  getTestBed().initTestEnvironment(
    BrowserTestingModule,
    platformBrowserTesting(),
    { teardown: { destroyAfterEach: true } }
  );
} catch {
  // Already initialized
}

// Tests must provide API responses explicitly. Never contact the live Directus API
// (or another external service) if a test forgets to mock an SDK/network call.
// Install before application modules import the SDK, which captures global fetch.
globalThis.fetch = (() => {
  throw new Error('Unmocked network request blocked in tests; mock fetch or the SDK operation.');
}) as typeof fetch;
