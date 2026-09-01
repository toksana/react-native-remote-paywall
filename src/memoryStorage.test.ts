import { createMemoryStorage } from './memoryStorage';

describe('createMemoryStorage', () => {
  it('returns null for a key that was never set', async () => {
    // Arrange
    const storage = createMemoryStorage();

    // Act
    const value = await storage.get('missing');

    // Assert
    expect(value).toBeNull();
  });

  it('returns a previously set value', async () => {
    // Arrange
    const storage = createMemoryStorage();

    // Act
    await storage.set('rnrp:v1:doc:default', '{"schemaVersion":1}');
    const value = await storage.get('rnrp:v1:doc:default');

    // Assert
    expect(value).toBe('{"schemaVersion":1}');
  });

  it('overwrites a previously set value for the same key', async () => {
    // Arrange
    const storage = createMemoryStorage();
    await storage.set('key', 'first');

    // Act
    await storage.set('key', 'second');

    // Assert
    expect(await storage.get('key')).toBe('second');
  });

  it('keeps separate instances independent', async () => {
    // Arrange
    const a = createMemoryStorage();
    const b = createMemoryStorage();

    // Act
    await a.set('key', 'from-a');

    // Assert
    expect(await b.get('key')).toBeNull();
  });
});
