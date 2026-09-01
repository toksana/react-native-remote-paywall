// react-native-remote-paywall reaches the network only through the global
// `fetch`. No test should hit a real socket — every test that exercises loading
// installs its own `globalThis.fetch = jest.fn()`. Guard against a forgotten
// mock by making the default throw loudly instead of leaking a real request.
const isMock = (fn: unknown): boolean =>
  typeof fn === 'function' && 'mock' in (fn as object);

if (!isMock(globalThis.fetch)) {
  globalThis.fetch = (() => {
    throw new Error(
      'Unmocked fetch() call — set `globalThis.fetch = jest.fn()` in this test.'
    );
  }) as unknown as typeof fetch;
}

// `Image.prefetch` is exercised by the prefetch pipeline. The react-native Jest
// preset renders `Image` as a mock with no static `prefetch`, so tests that need
// it assign their own spy; the pipeline feature-detects and no-ops otherwise.
