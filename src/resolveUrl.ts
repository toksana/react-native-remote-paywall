import { ID_PATTERN } from './constants';

/**
 * Paywall ids land in URLs, cache keys and filenames. Throwing here — the only
 * place besides the missing-`endpoint`/`buildUrl` check that this SDK ever
 * throws — surfaces a bad id on the first run in a developer's hands, never in
 * a user's: everything downstream of a valid id degrades instead of throwing.
 */
export const assertValidId = (id: string): void => {
  if (!ID_PATTERN.test(id)) {
    throw new RangeError(`Invalid paywall id: ${JSON.stringify(id)}`);
  }
};

/**
 * `${endpoint}/${id}.json`, trailing slashes on `endpoint` collapsed. No
 * `new URL` — that would mean shipping a URL polyfill on React Native, and the
 * whole pitch is zero dependencies — and no cache-busting or schemaVersion
 * query string; caching is `Cache-Control`'s job, and schema gating happens
 * after the fetch in `validateDocument`.
 */
export const resolveUrl = (endpoint: string, id: string): string =>
  `${endpoint.replace(/\/+$/, '')}/${id}.json`;

export interface UrlConfig {
  endpoint?: string;
  buildUrl?: (id: string) => string;
}

/** `buildUrl` is a full override; otherwise fall back to `resolveUrl`. */
export const pickUrl = (config: UrlConfig, id: string): string =>
  config.buildUrl ? config.buildUrl(id) : resolveUrl(config.endpoint ?? '', id);
