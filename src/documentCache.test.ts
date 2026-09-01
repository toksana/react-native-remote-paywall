import { readCachedDocument, writeCachedDocument } from './documentCache';
import { createMemoryStorage } from './memoryStorage';
import { CACHE_PREFIX } from './constants';
import type { PaywallDocument } from './schema';

const docWith = (
  overrides: Partial<PaywallDocument> = {}
): PaywallDocument => ({
  schemaVersion: 1,
  id: 'default',
  packages: [],
  root: { type: 'text', text: 'Hi' },
  ...overrides,
});

describe('writeCachedDocument then readCachedDocument', () => {
  it('round-trips a document under the id-specific cache key', async () => {
    // Arrange
    const storage = createMemoryStorage();
    const doc = docWith({ revision: 'v1' });

    // Act
    await writeCachedDocument(storage, 'default', doc);
    const result = await readCachedDocument(storage, 'default');

    // Assert
    expect(result).toEqual(doc);
    expect(await storage.get(CACHE_PREFIX + 'default')).not.toBeNull();
  });

  it('keeps different ids in separate cache slots', async () => {
    // Arrange
    const storage = createMemoryStorage();
    await writeCachedDocument(storage, 'a', docWith({ id: 'a' }));
    await writeCachedDocument(storage, 'b', docWith({ id: 'b' }));

    // Act / Assert
    expect((await readCachedDocument(storage, 'a'))?.id).toBe('a');
    expect((await readCachedDocument(storage, 'b'))?.id).toBe('b');
  });
});

describe('readCachedDocument', () => {
  it('returns null when nothing is cached for the id', async () => {
    // Arrange
    const storage = createMemoryStorage();

    // Act
    const result = await readCachedDocument(storage, 'missing');

    // Assert
    expect(result).toBeNull();
  });

  it('returns null for malformed JSON instead of throwing', async () => {
    // Arrange
    const storage = createMemoryStorage();
    await storage.set(CACHE_PREFIX + 'default', 'not json{{{');

    // Act / Assert
    await expect(readCachedDocument(storage, 'default')).resolves.toBeNull();
  });

  it('returns null when the cached document no longer validates', async () => {
    // Arrange
    const storage = createMemoryStorage();
    await storage.set(
      CACHE_PREFIX + 'default',
      JSON.stringify({ doc: { nope: true }, revision: null })
    );

    // Act / Assert
    await expect(readCachedDocument(storage, 'default')).resolves.toBeNull();
  });

  it('returns null when storage.get itself rejects', async () => {
    // Arrange
    const storage = {
      get: jest.fn().mockRejectedValue(new Error('disk error')),
      set: jest.fn(),
    };

    // Act / Assert
    await expect(readCachedDocument(storage, 'default')).resolves.toBeNull();
  });
});
