import {
  DEFAULT_COLD_START_TIMEOUT_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  EVENT,
} from './constants';
import { assertValidId, pickUrl } from './resolveUrl';
import { loadDocument } from './loadDocument';
import { validateDocument } from './validateDocument';
import { createMemoryStorage } from './memoryStorage';
import { collectPrefetchSources, prefetchImages } from './prefetchImages';
import { readCachedDocument, writeCachedDocument } from './documentCache';
import { TIMED_OUT, raceWithDelay } from './raceWithDelay';
import type {
  PaywallDocument,
  PaywallHost,
  ResolvedProduct,
  StorageAdapter,
} from './schema';

export interface PaywallClientConfig {
  endpoint?: string;
  buildUrl?: (id: string) => string;
  host: PaywallHost;
  storage?: StorageAdapter;
  bundled?: Record<string, PaywallDocument>;
  requestTimeoutMs?: number;
  coldStartTimeoutMs?: number;
}

export type PaywallStatus = 'idle' | 'loading' | 'ready' | 'error';
export type PaywallSource = 'cache' | 'network' | 'bundled';

export interface PaywallSnapshot {
  status: PaywallStatus;
  doc?: PaywallDocument;
  source?: PaywallSource;
  products: Record<string, ResolvedProduct>;
  error?: unknown;
}

export interface PaywallClient {
  prefetch(id: string): Promise<void>;
  load(id: string): void;
  subscribe(id: string): (onStoreChange: () => void) => () => void;
  getSnapshot(id: string): () => PaywallSnapshot;
  /** Not part of the public API surface — `RemotePaywall`'s own route to the
   * host callbacks it needs to wire into `RenderDocument`. */
  host: PaywallHost;
}

interface PaywallEntry {
  status: PaywallStatus;
  doc?: PaywallDocument;
  source?: PaywallSource;
  products: Record<string, ResolvedProduct>;
  error?: unknown;

  /** One shared fetch→validate→cache→prefetch run, deduping concurrent callers. */
  inflightNetwork?: Promise<PaywallDocument | null>;
  /** The whole `resolveForDisplay` run — set while `load()` should no-op. */
  resolving?: Promise<void>;
  /** One shared storage read, deduping concurrent `hydrateCache` callers. */
  hydrating?: Promise<PaywallDocument | null>;
  /** `undefined` = not yet hydrated; `null` = confirmed no cached document. */
  cachedDoc?: PaywallDocument | null;
  /** Runs `ensureProducts`/prefetch once per revision, not once per fetch. */
  postProcessedRevision?: string | null;
  /** Set once a mount falls back to `bundled` — pins it for the client's lifetime. */
  pinnedSource?: 'bundled';
  onErrorFired: boolean;

  listeners: Set<() => void>;
  snapshot: PaywallSnapshot;
}

export const createPaywallClient = (
  rawConfig: PaywallClientConfig
): PaywallClient => {
  if (!rawConfig.endpoint && !rawConfig.buildUrl) {
    throw new Error(
      'createPaywallClient requires either `endpoint` or `buildUrl`.'
    );
  }

  const config = Object.freeze({
    endpoint: rawConfig.endpoint,
    buildUrl: rawConfig.buildUrl,
    host: rawConfig.host,
    storage: rawConfig.storage ?? createMemoryStorage(),
    bundled: rawConfig.bundled ?? {},
    requestTimeoutMs: rawConfig.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    coldStartTimeoutMs:
      rawConfig.coldStartTimeoutMs ?? DEFAULT_COLD_START_TIMEOUT_MS,
  });

  const productCache = new Map<string, ResolvedProduct>();
  const inflightProducts = new Map<string, Promise<void>>();
  const prefetchedUris = new Set<string>();
  const validatedBundled = new Map<string, PaywallDocument | null>();
  const entries = new Map<string, PaywallEntry>();

  const ensureEntry = (id: string): PaywallEntry => {
    let entry = entries.get(id);
    if (!entry) {
      entry = {
        status: 'idle',
        products: {},
        onErrorFired: false,
        listeners: new Set(),
        snapshot: { status: 'idle', products: {} },
      };
      entries.set(id, entry);
    }
    return entry;
  };

  const notify = (id: string): void => {
    const entry = ensureEntry(id);
    entry.snapshot = {
      status: entry.status,
      doc: entry.doc,
      source: entry.source,
      products: entry.products,
      error: entry.error,
    };
    entry.listeners.forEach((listener) => listener());
  };

  const snapshotProducts = (
    doc: PaywallDocument
  ): Record<string, ResolvedProduct> => {
    const out: Record<string, ResolvedProduct> = {};
    for (const pkg of doc.packages) {
      const product = productCache.get(pkg.productId);
      if (product) out[pkg.productId] = product;
    }
    return out;
  };

  const setReady = (
    id: string,
    doc: PaywallDocument,
    source: PaywallSource
  ): void => {
    const entry = ensureEntry(id);
    entry.status = 'ready';
    entry.doc = doc;
    entry.source = source;
    entry.products = snapshotProducts(doc);
    entry.error = undefined;
    notify(id);
  };

  const setError = (id: string, error: unknown): void => {
    const entry = ensureEntry(id);
    entry.status = 'error';
    entry.error = error;
    if (!entry.onErrorFired) {
      entry.onErrorFired = true;
      config.host.onError?.(error);
    }
    notify(id);
  };

  /** Resolves every uncached productId a document references, then updates
   * that document's live snapshot in place — a products update, never a
   * document swap, so an in-flight render never loses its identity. */
  const ensureProducts = async (
    id: string,
    doc: PaywallDocument
  ): Promise<void> => {
    const allIds = [...new Set(doc.packages.map((pkg) => pkg.productId))];
    const missing = allIds.filter((productId) => !productCache.has(productId));

    if (missing.length > 0) {
      const toFetch = missing.filter(
        (productId) => !inflightProducts.has(productId)
      );
      if (toFetch.length > 0) {
        const request = config.host
          .resolveProducts(toFetch)
          .then((resolved) => {
            for (const product of resolved) {
              productCache.set(product.productId, product);
            }
          })
          .catch(() => {
            config.host.onEvent?.({ name: EVENT.resolveProductsFailed });
          })
          .finally(() => {
            for (const productId of toFetch) inflightProducts.delete(productId);
          });
        for (const productId of toFetch)
          inflightProducts.set(productId, request);
      }
      await Promise.all(
        missing.map(
          (productId) => inflightProducts.get(productId) ?? Promise.resolve()
        )
      );
    }

    const entry = ensureEntry(id);
    if (entry.doc === doc) {
      entry.products = snapshotProducts(doc);
      notify(id);
    }
  };

  const hydrateCache = (id: string): Promise<PaywallDocument | null> => {
    const entry = ensureEntry(id);
    if (entry.cachedDoc !== undefined) return Promise.resolve(entry.cachedDoc);
    if (entry.hydrating) return entry.hydrating;

    entry.hydrating = readCachedDocument(config.storage, id).then((doc) => {
      entry.cachedDoc = doc;
      entry.hydrating = undefined;
      return doc;
    });
    return entry.hydrating;
  };

  const getValidatedBundled = (id: string): PaywallDocument | null => {
    if (validatedBundled.has(id)) return validatedBundled.get(id) ?? null;
    const raw: unknown = config.bundled[id];
    if (raw === undefined) {
      validatedBundled.set(id, null);
      return null;
    }
    const result = validateDocument(raw);
    const doc = result.ok ? result.doc : null;
    validatedBundled.set(id, doc);
    return doc;
  };

  /** The one place a document is fetched. Shared by `prefetch`, the fallback
   * chain, and background refresh — `entry.inflightNetwork` is assigned
   * before any async work starts, so two callers in the same tick share one
   * fetch instead of racing two. Never rejects. */
  const getOrStartNetwork = (id: string): Promise<PaywallDocument | null> => {
    const entry = ensureEntry(id);
    if (entry.inflightNetwork) return entry.inflightNetwork;

    let resolveWork!: (doc: PaywallDocument | null) => void;
    const work = new Promise<PaywallDocument | null>((resolve) => {
      resolveWork = resolve;
    });
    entry.inflightNetwork = work;

    void (async (): Promise<void> => {
      try {
        const url = pickUrl(config, id);
        const raw = await loadDocument(url, {
          timeoutMs: config.requestTimeoutMs,
        });
        const result = validateDocument(raw);
        if (!result.ok) {
          resolveWork(null);
          return;
        }
        const doc = result.doc;

        await writeCachedDocument(config.storage, id, doc);
        entry.cachedDoc = doc;

        const revision = doc.revision ?? null;
        if (entry.postProcessedRevision !== revision) {
          entry.postProcessedRevision = revision;
          void ensureProducts(id, doc);
          const uris = collectPrefetchSources(doc).filter(
            (uri) => !prefetchedUris.has(uri)
          );
          uris.forEach((uri) => prefetchedUris.add(uri));
          void prefetchImages(uris, { timeoutMs: config.requestTimeoutMs });
        }

        resolveWork(doc);
      } catch {
        resolveWork(null);
      } finally {
        entry.inflightNetwork = undefined;
      }
    })();

    return work;
  };

  const backgroundRefresh = async (id: string): Promise<void> => {
    const doc = await getOrStartNetwork(id);
    if (doc == null) config.host.onEvent?.({ name: EVENT.refreshFailed });
  };

  /** The fresh→cache→bundled fallback chain, in the client so it is testable
   * without React and shared across concurrent mounts of the same id. */
  const resolveForDisplay = async (id: string): Promise<void> => {
    const entry = ensureEntry(id);
    const cached = await hydrateCache(id);

    if (cached) {
      setReady(id, cached, 'cache');
      void ensureProducts(id, cached);
      void backgroundRefresh(id);
      return;
    }

    const bundledDoc = getValidatedBundled(id);
    if (bundledDoc) {
      const network = getOrStartNetwork(id);
      const raced = await raceWithDelay(network, config.coldStartTimeoutMs);
      if (raced !== TIMED_OUT && raced) {
        setReady(id, raced, 'network');
        void ensureProducts(id, raced);
        return;
      }
      // Timeout or a resolved-null network both fall back the same way — the
      // network keeps running independently and writes cache for next launch.
      entry.pinnedSource = 'bundled';
      setReady(id, bundledDoc, 'bundled');
      void ensureProducts(id, bundledDoc);
      config.host.onEvent?.({ name: EVENT.bundledShown });
      return;
    }

    const network = getOrStartNetwork(id);
    const raced = await raceWithDelay(network, config.coldStartTimeoutMs);
    if (raced !== TIMED_OUT) {
      if (raced) {
        setReady(id, raced, 'network');
        void ensureProducts(id, raced);
      } else {
        setError(id, new Error(`Paywall "${id}" could not be loaded`));
      }
      return;
    }

    // No cache, no bundled: stay `loading` and keep awaiting the same
    // in-flight fetch — there is nothing else to fall back to.
    const doc = await network;
    if (doc) {
      setReady(id, doc, 'network');
      void ensureProducts(id, doc);
    } else {
      setError(id, new Error(`Paywall "${id}" could not be loaded`));
    }
  };

  const load = (id: string): void => {
    assertValidId(id);
    const entry = ensureEntry(id);

    if (entry.status === 'ready') {
      if (!entry.pinnedSource) void backgroundRefresh(id);
      return;
    }
    if (entry.status === 'error') return;
    if (entry.resolving) return;

    entry.status = 'loading';
    notify(id);
    entry.resolving = resolveForDisplay(id).finally(() => {
      entry.resolving = undefined;
    });
  };

  const prefetch = (id: string): Promise<void> => {
    assertValidId(id);
    ensureEntry(id);
    return getOrStartNetwork(id).then(() => undefined);
  };

  const subscribe =
    (id: string) =>
    (onStoreChange: () => void): (() => void) => {
      const entry = ensureEntry(id);
      entry.listeners.add(onStoreChange);
      return () => entry.listeners.delete(onStoreChange);
    };

  const getSnapshot = (id: string) => (): PaywallSnapshot =>
    ensureEntry(id).snapshot;

  return { prefetch, load, subscribe, getSnapshot, host: config.host };
};
