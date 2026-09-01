// React Native 0.83 ships jest mocks for `Text` and `Image` that their own
// components cannot satisfy: `jest/mockComponent.js` reads
// `RealComponent.prototype.constructor`, and both `Libraries/Text/Text` and
// `Libraries/Image/Image` are arrow functions, which have no `prototype`.
// Rendering either under the stock preset throws. The real components render
// fine under react-test-renderer, so use them and drop the broken mocks.
// Revisit when React Native fixes mockComponent — these two lines can go then.
jest.unmock('react-native/Libraries/Text/Text');
jest.unmock('react-native/Libraries/Image/Image');

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

// `Image.prefetch` is exercised by the prefetch pipeline. `Image` is now the
// real component (unmocked above), so its real `prefetch` static exists —
// tests that need particular behavior install their own
// `jest.spyOn(Image, 'prefetch')`; the pipeline feature-detects and no-ops
// when a host build has no `prefetch` at all.

export {};
