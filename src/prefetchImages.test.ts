import { Image } from 'react-native';

import { collectPrefetchSources, prefetchImages } from './prefetchImages';
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

describe('collectPrefetchSources', () => {
  it('finds an image node marked prefetch: true', () => {
    // Arrange
    const doc = docWith({
      root: {
        type: 'image',
        source: { uri: 'https://cdn.example.com/hero.png', prefetch: true },
      },
    });

    // Act
    const uris = collectPrefetchSources(doc);

    // Assert
    expect(uris).toEqual(['https://cdn.example.com/hero.png']);
  });

  it('ignores an image node without prefetch: true', () => {
    // Arrange
    const doc = docWith({
      root: {
        type: 'image',
        source: { uri: 'https://cdn.example.com/hero.png' },
      },
    });

    // Act
    const uris = collectPrefetchSources(doc);

    // Assert
    expect(uris).toEqual([]);
  });

  it('finds background.image when marked prefetch: true', () => {
    // Arrange
    const doc = docWith({
      background: {
        image: { uri: 'https://cdn.example.com/bg.png', prefetch: true },
      },
    });

    // Act
    const uris = collectPrefetchSources(doc);

    // Assert
    expect(uris).toEqual(['https://cdn.example.com/bg.png']);
  });

  it('walks into stack children', () => {
    // Arrange
    const doc = docWith({
      root: {
        type: 'stack',
        children: [
          { type: 'text', text: 'Title' },
          {
            type: 'image',
            source: { uri: 'https://cdn.example.com/hero.png', prefetch: true },
          },
        ],
      },
    });

    // Act
    const uris = collectPrefetchSources(doc);

    // Assert
    expect(uris).toEqual(['https://cdn.example.com/hero.png']);
  });

  it('walks into a fallback subtree', () => {
    // Arrange
    const doc = docWith({
      root: {
        type: 'text',
        text: 'Unsupported',
        fallback: {
          type: 'image',
          source: {
            uri: 'https://cdn.example.com/fallback.png',
            prefetch: true,
          },
        },
      },
    });

    // Act
    const uris = collectPrefetchSources(doc);

    // Assert
    expect(uris).toEqual(['https://cdn.example.com/fallback.png']);
  });

  it('dedups a uri that appears more than once', () => {
    // Arrange
    const source = { uri: 'https://cdn.example.com/hero.png', prefetch: true };
    const doc = docWith({
      background: { image: source },
      root: { type: 'image', source },
    });

    // Act
    const uris = collectPrefetchSources(doc);

    // Assert
    expect(uris).toEqual(['https://cdn.example.com/hero.png']);
  });
});

describe('prefetchImages', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves without throwing when Image.prefetch is absent', async () => {
    // Arrange — simulate a host build without the native loader.
    const original = Image.prefetch;
    Object.defineProperty(Image, 'prefetch', {
      value: undefined,
      configurable: true,
    });

    // Act / Assert
    await expect(
      prefetchImages(['https://cdn.example.com/hero.png'], { timeoutMs: 1000 })
    ).resolves.toBeUndefined();

    Object.defineProperty(Image, 'prefetch', {
      value: original,
      configurable: true,
    });
  });

  it('resolves when some prefetches reject', async () => {
    // Arrange
    jest
      .spyOn(Image, 'prefetch')
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('network error'));

    // Act / Assert
    await expect(
      prefetchImages(
        ['https://cdn.example.com/a.png', 'https://cdn.example.com/b.png'],
        {
          timeoutMs: 1000,
        }
      )
    ).resolves.toBeUndefined();
  });

  it('resolves within the bounded wait when a prefetch hangs', async () => {
    // Arrange
    jest.useFakeTimers();
    jest.spyOn(Image, 'prefetch').mockReturnValue(new Promise(() => {}));

    // Act
    const pending = prefetchImages(['https://cdn.example.com/a.png'], {
      timeoutMs: 500,
    });
    await jest.advanceTimersByTimeAsync(500);

    // Assert
    await expect(pending).resolves.toBeUndefined();
  });
});
