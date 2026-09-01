// React Native 0.83 ships a jest mock for `Text` that its own `Text` cannot
// satisfy: `jest/mockComponent.js` reads `RealComponent.prototype.constructor`,
// and `Libraries/Text/Text` is an arrow function, which has no `prototype`.
// Rendering any `<Text>` under the stock preset throws. The real component
// renders fine under react-test-renderer, so use it and drop the broken mock.
// Revisit when React Native fixes mockComponent — this line can go then.
jest.unmock('react-native/Libraries/Text/Text');

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

export {};
