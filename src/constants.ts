/** Aborts the document fetch. Not user-visible when a bundled fallback exists. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

/**
 * How long `<RemotePaywall>` waits on the network on a cold start (no cache)
 * before falling back to the bundled document or `renderLoading`. Never aborts
 * the fetch — only bounds the wait.
 */
export const DEFAULT_COLD_START_TIMEOUT_MS = 700;

/**
 * Releases the purchase/restore busy latch if a host promise never settles, so
 * a hung callback cannot trap the user on the screen forever.
 */
export const HOST_CALLBACK_TIMEOUT_MS = 30_000;

/**
 * Paywall ids are developer-supplied and land in URLs, cache keys, filenames
 * and analytics. An allow-list keeps them predictable and stops `../` or a
 * full URL from redirecting the request.
 */
export const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Schemes an `openURL` action may use. Everything else is dropped in
 * validation, so a fetched document cannot deep-link into the host app.
 *
 * The trailing colons are load-bearing. Validation hand-parses the scheme —
 * `new URL` would mean shipping a polyfill on React Native, and the whole
 * pitch is zero dependencies — by lowercasing the URL and comparing up to and
 * including its first `:`. Drop the colons and `httpsx://evil` starts matching.
 */
export const ALLOWED_URL_SCHEMES = ['http:', 'https:', 'mailto:'] as const;

/**
 * Storage-key prefix for cached documents.
 *
 * The `v1` is the cache envelope's version, not the schema's. It lives in the
 * key because the cache sits in the host app's storage and outlives an SDK
 * upgrade: when the envelope shape changes, a new prefix simply misses the old
 * entries instead of deserializing them into code that no longer fits.
 */
export const CACHE_PREFIX = 'rnrp:v1:doc:';

/** Names emitted through `host.onEvent`. Documented in SCHEMA.md. */
export const EVENT = {
  actionDismiss: 'action_dismiss',
  actionPurchase: 'action_purchase',
  actionRestore: 'action_restore',
  actionOpenUrl: 'action_open_url',
  actionUnknown: 'action_unknown',
  selectPackage: 'select_package',
  resolveProductsFailed: 'resolve_products_failed',
  refreshFailed: 'refresh_failed',
  bundledShown: 'bundled_shown',
  hostCallbackTimeout: 'host_callback_timeout',
} as const;

export type EventName = (typeof EVENT)[keyof typeof EVENT];
