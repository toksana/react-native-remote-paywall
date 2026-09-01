import { loadDocument } from './loadDocument';

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as Response;

describe('loadDocument', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves with the parsed JSON body on a 2xx response', async () => {
    // Arrange
    const doc = { schemaVersion: 1, id: 'default' };
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(doc));

    // Act
    const result = await loadDocument('https://cdn.example.com/default.json', {
      timeoutMs: 1000,
    });

    // Assert
    expect(result).toEqual(doc);
  });

  it('rejects on a non-2xx response', async () => {
    // Arrange
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({}, false, 404));

    // Act / Assert
    await expect(
      loadDocument('https://cdn.example.com/missing.json', { timeoutMs: 1000 })
    ).rejects.toThrow();
  });

  it('rejects when the network request itself fails', async () => {
    // Arrange
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline'));

    // Act / Assert
    await expect(
      loadDocument('https://cdn.example.com/default.json', { timeoutMs: 1000 })
    ).rejects.toThrow('offline');
  });

  it('rejects when the body is not valid JSON', async () => {
    // Arrange
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    });

    // Act / Assert
    await expect(
      loadDocument('https://cdn.example.com/default.json', { timeoutMs: 1000 })
    ).rejects.toThrow(SyntaxError);
  });

  it('aborts and rejects once timeoutMs elapses', async () => {
    // Arrange
    jest.useFakeTimers();
    globalThis.fetch = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('Aborted'))
          );
        })
    ) as unknown as typeof fetch;

    // Act
    const pending = loadDocument('https://cdn.example.com/default.json', {
      timeoutMs: 1000,
    });
    pending.catch(() => {}); // observed for real via the assertion below
    jest.advanceTimersByTime(1000);

    // Assert
    await expect(pending).rejects.toThrow();
  });

  it('aborts when an external signal is aborted', async () => {
    // Arrange
    const controller = new AbortController();
    globalThis.fetch = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('Aborted'))
          );
        })
    ) as unknown as typeof fetch;

    // Act
    const pending = loadDocument('https://cdn.example.com/default.json', {
      timeoutMs: 10_000,
      signal: controller.signal,
    });
    controller.abort();

    // Assert
    await expect(pending).rejects.toThrow();
  });
});
