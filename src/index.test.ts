import * as api from './index';

describe('public API', () => {
  it('exports exactly createPaywallClient and RemotePaywall as values', () => {
    // Type-only exports (PaywallDocument, PaywallHost, PaywallEvent,
    // StorageAdapter, ResolvedProduct) leave no runtime trace to assert on —
    // this covers the value exports, the ones that could accidentally leak
    // an internal like `loadDocument` or `validateDocument`.
    expect(Object.keys(api).sort()).toEqual(
      ['RemotePaywall', 'createPaywallClient'].sort()
    );
  });

  it('exports createPaywallClient as a function', () => {
    expect(typeof api.createPaywallClient).toBe('function');
  });

  it('exports RemotePaywall as a function component', () => {
    expect(typeof api.RemotePaywall).toBe('function');
  });
});
