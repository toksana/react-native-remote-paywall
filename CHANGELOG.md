# Changelog

## 0.1.0 - 2026-09-20

Initial release.

- `createPaywallClient` and `RemotePaywall`: fetch a JSON paywall document,
  validate it, cache it, and render it with React Native primitives.
- Fallback chain: fresh document, then last cached document, then the copy
  bundled in the app binary.
- Host callbacks for products, purchase, restore and dismiss; the SDK never
  talks to StoreKit or Play Billing.
- Zero runtime dependencies; `react` and `react-native` are peers.
- ESM and CommonJS builds with bundled TypeScript types.
