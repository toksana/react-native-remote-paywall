export interface LoadDocumentOptions {
  timeoutMs: number;
  signal?: AbortSignal;
}

/**
 * Fetch and JSON-parse a paywall document. Rejects on a non-2xx response, a
 * network failure, malformed JSON, or a timeout — the caller (the client's
 * `getOrStartNetwork`) treats every rejection the same way: swallow and fall
 * back. `timeoutMs` aborts the fetch; an external `signal`, if given, aborts
 * it too, so a caller can cancel independently of the timeout.
 */
export const loadDocument = async (
  url: string,
  { timeoutMs, signal }: LoadDocumentOptions
): Promise<unknown> => {
  const controller = new AbortController();
  const onExternalAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onExternalAbort);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(
        `Paywall document request failed: ${response.status} ${url}`
      );
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }
};
