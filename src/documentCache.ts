import { CACHE_PREFIX } from './constants';
import { validateDocument } from './validateDocument';
import type { PaywallDocument, StorageAdapter } from './schema';

const cacheKey = (id: string): string => CACHE_PREFIX + id;

/**
 * Reads and validates the cached document for an id. Never throws — a
 * missing key, malformed JSON, or a document that no longer validates all
 * read the same as "no cache", which is exactly what the fallback chain
 * needs to decide what to render next.
 */
export const readCachedDocument = async (
  storage: StorageAdapter,
  id: string
): Promise<PaywallDocument | null> => {
  try {
    const raw = await storage.get(cacheKey(id));
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as { doc: unknown };
    const result = validateDocument(parsed.doc);
    return result.ok ? result.doc : null;
  } catch {
    return null;
  }
};

/**
 * `revision` is duplicated at the envelope's top level, alongside `doc`, so a
 * future cache-inspection tool can read it without parsing the whole
 * document — the value is otherwise identical to `doc.revision`.
 */
export const writeCachedDocument = (
  storage: StorageAdapter,
  id: string,
  doc: PaywallDocument
): Promise<void> =>
  storage.set(
    cacheKey(id),
    JSON.stringify({ doc, revision: doc.revision ?? null })
  );
