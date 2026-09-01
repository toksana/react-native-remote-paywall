import React, { useEffect, useSyncExternalStore } from 'react';

import { assertValidId } from './resolveUrl';
import { RenderDocument } from './renderDocument';
import type { PaywallClient } from './paywallClient';

export interface RemotePaywallProps {
  client: PaywallClient;
  id: string;
  renderLoading?: () => React.ReactNode;
  renderError?: (error: unknown) => React.ReactNode;
}

/**
 * The public entry point. Subscribes to `id`'s live state on `client` and
 * triggers `client.load(id)` on mount and whenever `client`/`id` change;
 * everything else — the fetch→validate→cache→bundled fallback chain — lives
 * in the client, not here, so it keeps working across remounts and across
 * concurrent mounts of the same id.
 */
export const RemotePaywall = ({
  client,
  id,
  renderLoading,
  renderError,
}: RemotePaywallProps): React.ReactNode => {
  assertValidId(id);

  const snapshot = useSyncExternalStore(
    client.subscribe(id),
    client.getSnapshot(id)
  );

  useEffect(() => {
    client.load(id);
  }, [client, id]);

  if (snapshot.status === 'ready' && snapshot.doc) {
    return (
      <RenderDocument
        // A revision change resets selection and the busy latch — a fresh
        // document is a fresh screen, not a patch to the one on display.
        key={snapshot.doc.revision ?? id}
        doc={snapshot.doc}
        host={client.host}
        products={snapshot.products}
      />
    );
  }

  if (snapshot.status === 'error') {
    return renderError?.(snapshot.error) ?? null;
  }

  return renderLoading?.() ?? null;
};
