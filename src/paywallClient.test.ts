import { Image } from 'react-native';

import { createPaywallClient } from './paywallClient';
import { createMemoryStorage } from './memoryStorage';
import { CACHE_PREFIX } from './constants';
import type { PaywallDocument, PaywallHost, StorageAdapter } from './schema';

const docWith = (
  overrides: Partial<PaywallDocument> = {}
): PaywallDocument => ({
  schemaVersion: 1,
  id: 'default',
  packages: [{ id: 'p1', productId: 'com.example.p1', title: 'P1' }],
  root: { type: 'text', text: 'Hi' },
  ...overrides,
});

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: () => Promise.resolve(body) }) as unknown as Response;

const hostWith = (overrides: Partial<PaywallHost> = {}): PaywallHost => ({
  resolveProducts: jest.fn().mockResolvedValue([]),
  onPurchase: jest.fn().mockResolvedValue(undefined),
  onRestore: jest.fn().mockResolvedValue(undefined),
  onDismiss: jest.fn(),
  ...overrides,
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** Polls with real timers until `predicate` is true — for flows that settle
 * over several promise chains without a single await point to hang off. */
const waitFor = async (
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 2000
): Promise<void> => {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: condition never became true');
    }
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
  }
};

const seedCache = async (
  storage: StorageAdapter,
  id: string,
  doc: PaywallDocument
): Promise<void> => {
  await storage.set(
    CACHE_PREFIX + id,
    JSON.stringify({ doc, revision: doc.revision ?? null })
  );
};

describe('createPaywallClient', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('throws when neither endpoint nor buildUrl is given', () => {
    // Act / Assert
    expect(() => createPaywallClient({ host: hostWith() } as never)).toThrow();
  });

  describe('prefetch', () => {
    it('throws synchronously for an invalid id', () => {
      // Arrange
      const client = createPaywallClient({
        endpoint: 'https://cdn.example.com',
        host: hostWith(),
      });

      // Act / Assert
      expect(() => client.prefetch('../nope')).toThrow(RangeError);
    });

    it('fetches, validates, caches, resolves products and prefetches images', async () => {
      // Arrange
      const doc = docWith({
        root: {
          type: 'image',
          source: { uri: 'https://cdn.example.com/hero.png', prefetch: true },
        },
      });
      globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(doc));
      const storage = createMemoryStorage();
      const setSpy = jest.spyOn(storage, 'set');
      const resolveProducts = jest
        .fn()
        .mockResolvedValue([{ productId: 'com.example.p1', price: '$1.99' }]);
      const prefetchSpy = jest.spyOn(Image, 'prefetch').mockResolvedValue(true);
      const client = createPaywallClient({
        endpoint: 'https://cdn.example.com',
        host: hostWith({ resolveProducts }),
        storage,
      });

      // Act
      await client.prefetch('default');
      await waitFor(() => prefetchSpy.mock.calls.length > 0);

      // Assert
      expect(fetch).toHaveBeenCalledWith(
        'https://cdn.example.com/default.json',
        expect.anything()
      );
      expect(setSpy).toHaveBeenCalledWith(
        CACHE_PREFIX + 'default',
        expect.stringContaining('"schemaVersion":1')
      );
      expect(resolveProducts).toHaveBeenCalledWith(['com.example.p1']);
      expect(prefetchSpy).toHaveBeenCalledWith(
        'https://cdn.example.com/hero.png'
      );
    });

    it('resolves without calling onError when the network fails', async () => {
      // Arrange
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline'));
      const onError = jest.fn();
      const client = createPaywallClient({
        endpoint: 'https://cdn.example.com',
        host: hostWith({ onError }),
      });

      // Act / Assert
      await expect(client.prefetch('default')).resolves.toBeUndefined();
      expect(onError).not.toHaveBeenCalled();
    });

    it('shares one fetch across concurrent callers', async () => {
      // Arrange
      globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(docWith()));
      const client = createPaywallClient({
        endpoint: 'https://cdn.example.com',
        host: hostWith(),
      });

      // Act
      await Promise.all([
        client.prefetch('default'),
        client.prefetch('default'),
      ]);

      // Assert
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('load — branch 1: cache present', () => {
    it('renders from cache immediately and refreshes in the background', async () => {
      // Arrange
      const cached = docWith({ revision: 'v1' });
      const fresh = docWith({ revision: 'v2' });
      globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(fresh));
      const storage = createMemoryStorage();
      await seedCache(storage, 'default', cached);
      const client = createPaywallClient({
        endpoint: 'https://cdn.example.com',
        host: hostWith(),
        storage,
      });

      // Act
      client.load('default');
      await waitFor(() => client.getSnapshot('default')().status === 'ready');
      const snapshot = client.getSnapshot('default')();

      // Assert — served from cache, revision v1, before the refresh lands.
      expect(snapshot.source).toBe('cache');
      expect(snapshot.doc).toEqual(cached);

      // Assert — the background refresh eventually writes the new revision...
      await waitFor(() => (fetch as jest.Mock).mock.calls.length > 0);
      await waitFor(async () => {
        const raw = await storage.get(CACHE_PREFIX + 'default');
        return raw != null && JSON.parse(raw).doc.revision === 'v2';
      });

      // ...but the current snapshot's document identity never changes.
      expect(client.getSnapshot('default')().doc).toBe(snapshot.doc);
    });
  });

  describe('load — branch 2: no cache, bundled present', () => {
    it('falls back to bundled once coldStartTimeoutMs elapses', async () => {
      // Arrange
      jest.useFakeTimers();
      const bundled = docWith({ id: 'default' });
      globalThis.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
      const client = createPaywallClient({
        endpoint: 'https://cdn.example.com',
        host: hostWith(),
        bundled: { default: bundled },
        coldStartTimeoutMs: 50,
        requestTimeoutMs: 60_000,
      });

      // Act
      client.load('default');
      await jest.advanceTimersByTimeAsync(50);

      // Assert
      const snapshot = client.getSnapshot('default')();
      expect(snapshot.status).toBe('ready');
      expect(snapshot.source).toBe('bundled');
    });

    it('stays on bundled even after a late network document resolves, but caches it', async () => {
      // Arrange
      jest.useFakeTimers();
      const bundled = docWith({ id: 'default', revision: 'bundled' });
      const network = docWith({ id: 'default', revision: 'late-network' });
      const fetchDeferred = deferred<Response>();
      globalThis.fetch = jest.fn().mockReturnValue(fetchDeferred.promise);
      const storage = createMemoryStorage();
      const client = createPaywallClient({
        endpoint: 'https://cdn.example.com',
        host: hostWith(),
        storage,
        bundled: { default: bundled },
        coldStartTimeoutMs: 50,
        requestTimeoutMs: 60_000,
      });

      // Act
      client.load('default');
      await jest.advanceTimersByTimeAsync(50);
      fetchDeferred.resolve(jsonResponse(network));
      await jest.advanceTimersByTimeAsync(0);

      // Assert — pinned to bundled for this client's lifetime...
      const snapshot = client.getSnapshot('default')();
      expect(snapshot.source).toBe('bundled');
      expect(snapshot.doc).toEqual(bundled);

      // ...but the late document was still written to cache for next launch.
      const raw = await storage.get(CACHE_PREFIX + 'default');
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string).doc.revision).toBe('late-network');
    });

    it('shows the network document when it wins the race', async () => {
      // Arrange
      const bundled = docWith({ id: 'default', revision: 'bundled' });
      const network = docWith({ id: 'default', revision: 'fast-network' });
      globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(network));
      const client = createPaywallClient({
        endpoint: 'https://cdn.example.com',
        host: hostWith(),
        bundled: { default: bundled },
        coldStartTimeoutMs: 5000,
      });

      // Act
      client.load('default');
      await waitFor(() => client.getSnapshot('default')().status === 'ready');

      // Assert
      const snapshot = client.getSnapshot('default')();
      expect(snapshot.source).toBe('network');
      expect(snapshot.doc?.revision).toBe('fast-network');
    });

    it('falls through to branch 3 when the bundled document fails validation', async () => {
      // Arrange
      jest.useFakeTimers();
      globalThis.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
      const client = createPaywallClient({
        endpoint: 'https://cdn.example.com',
        host: hostWith(),
        bundled: { default: { nope: true } as unknown as PaywallDocument },
        coldStartTimeoutMs: 50,
        requestTimeoutMs: 60_000,
      });

      // Act
      client.load('default');
      await jest.advanceTimersByTimeAsync(50);

      // Assert — branch 3's behavior on timeout: stay loading, not bundled.
      expect(client.getSnapshot('default')().status).toBe('loading');
    });
  });

  describe('load — branch 3: no cache, no bundled', () => {
    it('stays loading past coldStartTimeoutMs, then becomes ready on a late success', async () => {
      // Arrange
      jest.useFakeTimers();
      const fetchDeferred = deferred<Response>();
      globalThis.fetch = jest.fn().mockReturnValue(fetchDeferred.promise);
      const onError = jest.fn();
      const client = createPaywallClient({
        endpoint: 'https://cdn.example.com',
        host: hostWith({ onError }),
        coldStartTimeoutMs: 50,
        requestTimeoutMs: 60_000,
      });

      // Act
      client.load('default');
      await jest.advanceTimersByTimeAsync(50);

      // Assert — still loading, nothing to fall back to.
      expect(client.getSnapshot('default')().status).toBe('loading');

      // Act — the network eventually succeeds.
      fetchDeferred.resolve(jsonResponse(docWith()));
      await jest.advanceTimersByTimeAsync(0);

      // Assert
      expect(client.getSnapshot('default')().status).toBe('ready');
      expect(client.getSnapshot('default')().source).toBe('network');
      expect(onError).not.toHaveBeenCalled();
    });

    it('becomes error and calls onError exactly once on a late failure', async () => {
      // Arrange
      jest.useFakeTimers();
      const fetchDeferred = deferred<Response>();
      globalThis.fetch = jest.fn().mockReturnValue(fetchDeferred.promise);
      const onError = jest.fn();
      const client = createPaywallClient({
        endpoint: 'https://cdn.example.com',
        host: hostWith({ onError }),
        coldStartTimeoutMs: 50,
        requestTimeoutMs: 60_000,
      });

      // Act
      client.load('default');
      await jest.advanceTimersByTimeAsync(50);
      fetchDeferred.reject(new Error('offline'));
      await jest.advanceTimersByTimeAsync(0);

      // Assert
      expect(client.getSnapshot('default')().status).toBe('error');
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  describe('products', () => {
    it('shows ready with empty products, then updates in place once resolveProducts resolves', async () => {
      // Arrange
      const cached = docWith();
      const productsDeferred =
        deferred<{ productId: string; price: string }[]>();
      const storage = createMemoryStorage();
      await seedCache(storage, 'default', cached);
      // The background refresh this triggers is irrelevant to these
      // assertions — fail it immediately instead of leaving a dangling timer.
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline'));
      const client = createPaywallClient({
        endpoint: 'https://cdn.example.com',
        host: hostWith({
          resolveProducts: jest.fn().mockReturnValue(productsDeferred.promise),
        }),
        storage,
      });

      // Act
      client.load('default');
      await waitFor(() => client.getSnapshot('default')().status === 'ready');
      const firstSnapshot = client.getSnapshot('default')();

      // Assert — ready immediately, before products resolve.
      expect(firstSnapshot.products).toEqual({});

      // Act — products resolve later.
      productsDeferred.resolve([
        { productId: 'com.example.p1', price: '$1.99' },
      ]);
      await waitFor(
        () =>
          client.getSnapshot('default')().products['com.example.p1'] !==
          undefined
      );

      // Assert — same document identity, updated products.
      const secondSnapshot = client.getSnapshot('default')();
      expect(secondSnapshot.doc).toBe(firstSnapshot.doc);
      expect(secondSnapshot.products['com.example.p1']).toEqual({
        productId: 'com.example.p1',
        price: '$1.99',
      });
    });

    it('swallows a resolveProducts rejection and emits onEvent', async () => {
      // Arrange
      const cached = docWith();
      const storage = createMemoryStorage();
      await seedCache(storage, 'default', cached);
      // The background refresh this triggers is irrelevant to these
      // assertions — fail it immediately instead of leaving a dangling timer.
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline'));
      const onEvent = jest.fn();
      const onError = jest.fn();
      const client = createPaywallClient({
        endpoint: 'https://cdn.example.com',
        host: hostWith({
          resolveProducts: jest.fn().mockRejectedValue(new Error('store down')),
          onEvent,
          onError,
        }),
        storage,
      });

      // Act
      client.load('default');
      await waitFor(() => client.getSnapshot('default')().status === 'ready');
      await waitFor(() =>
        onEvent.mock.calls.some(([e]) => e.name === 'resolve_products_failed')
      );

      // Assert
      expect(onError).not.toHaveBeenCalled();
      expect(client.getSnapshot('default')().status).toBe('ready');
    });
  });
});
