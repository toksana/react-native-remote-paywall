import { Image } from 'react-native';

import type { Node, PaywallDocument } from './schema';

/**
 * Every `image` source (and `background.image`) marked `prefetch: true`,
 * walking `fallback` subtrees too so a document that degrades on an older
 * build still gets its fallback image warmed. Deduped, since the same uri can
 * appear more than once (e.g. a hero image repeated behind a fallback).
 */
export const collectPrefetchSources = (doc: PaywallDocument): string[] => {
  const uris = new Set<string>();
  if (doc.background?.image?.prefetch) uris.add(doc.background.image.uri);
  walk(doc.root, uris);
  return [...uris];
};

const walk = (node: Node | undefined, uris: Set<string>): void => {
  if (node == null) return;
  if (node.type === 'image' && node.source.prefetch) uris.add(node.source.uri);
  if (node.type === 'stack')
    node.children.forEach((child) => walk(child, uris));
  walk(node.fallback, uris);
};

export interface PrefetchImagesOptions {
  timeoutMs: number;
}

/**
 * Best-effort image warming: never rejects, regardless of how many uris fail
 * or hang. `Image.prefetch` is feature-detected — a host build without it
 * (or a platform where RN never wired up the native loader) makes this a
 * no-op instead of a crash. The bounded wait matters because `prefetch()`
 * calls have no timeout of their own; without one, a single stuck request
 * would hold `getOrStartNetwork` open indefinitely.
 */
export const prefetchImages = async (
  uris: string[],
  { timeoutMs }: PrefetchImagesOptions
): Promise<void> => {
  if (typeof Image.prefetch !== 'function' || uris.length === 0) return;

  const settled = Promise.allSettled(
    uris.map((uri) => {
      try {
        return Image.prefetch(uri);
      } catch (error) {
        return Promise.reject(error);
      }
    })
  );

  await Promise.race([settled, delay(timeoutMs)]);
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
