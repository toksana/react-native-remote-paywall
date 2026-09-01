import { useCallback, useEffect, useRef, useState } from 'react';

import { EVENT, HOST_CALLBACK_TIMEOUT_MS } from './constants';
import type { Action, PaywallHost } from './schema';

export interface ActionDispatcher {
  onAction: (action: Action) => void;
  /** True while a purchase or restore is in flight — disables buttons. */
  busy: boolean;
}

/**
 * Turns a schema `Action` into a host callback, owning the purchase/restore
 * busy latch. `dismiss` and `openURL` are never gated by it — a hung host
 * promise must not trap the user on the screen — only `purchase`/`restore`
 * are, and a watchdog releases the latch after `HOST_CALLBACK_TIMEOUT_MS`
 * even if the host promise never settles. `onEvent` fires for every action,
 * matching the "fired for every action and selection change" contract.
 */
export const useActionDispatcher = (
  host: PaywallHost,
  selectedPackageId: string
): ActionDispatcher => {
  // Synchronous, so a double-tap in the same tick can't fire onPurchase
  // twice — `busy` (state) only drives the re-render that disables the button.
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  // A watchdog left running past unmount would fire `release()` (a no-op
  // `setState` on an unmounted hook) and `onEvent` for a screen nobody is
  // looking at anymore — clear it, the same discipline as the loser side of
  // every other race in this SDK (`raceWithDelay`, `loadDocument`'s abort timer).
  useEffect(
    () => () => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
    },
    []
  );

  const dispatchGated = useCallback(
    (run: () => Promise<void>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);

      let settled = false;
      const release = (): void => {
        if (settled) return;
        settled = true;
        busyRef.current = false;
        setBusy(false);
      };

      watchdogRef.current = setTimeout(() => {
        release();
        host.onEvent?.({ name: EVENT.hostCallbackTimeout });
      }, HOST_CALLBACK_TIMEOUT_MS);

      // A host callback that throws synchronously instead of returning a
      // rejected promise still needs to release the latch the same way.
      let hostPromise: Promise<void>;
      try {
        hostPromise = run();
      } catch (error) {
        hostPromise = Promise.reject(error);
      }

      hostPromise
        .catch(() => {})
        .finally(() => {
          if (watchdogRef.current) clearTimeout(watchdogRef.current);
          release();
        });
    },
    [host]
  );

  const onAction = useCallback(
    (action: Action) => {
      switch (action.type) {
        case 'purchase':
          host.onEvent?.({ name: EVENT.actionPurchase });
          dispatchGated(() =>
            host.onPurchase(action.packageId ?? selectedPackageId)
          );
          break;
        case 'restore':
          host.onEvent?.({ name: EVENT.actionRestore });
          dispatchGated(() => host.onRestore());
          break;
        case 'dismiss':
          host.onEvent?.({ name: EVENT.actionDismiss });
          host.onDismiss();
          break;
        case 'openURL':
          host.onEvent?.({ name: EVENT.actionOpenUrl });
          host.onOpenURL?.(action.url);
          break;
        default:
          host.onEvent?.({ name: EVENT.actionUnknown });
      }
    },
    [host, dispatchGated, selectedPackageId]
  );

  return { onAction, busy };
};
