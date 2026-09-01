import React, { useCallback, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import type {
  Action,
  PaywallDocument,
  PaywallHost,
  ResolvedProduct,
} from './schema';
import type { RenderContext } from './renderContext';
import { renderNode } from './renderNode';

export interface RenderDocumentProps {
  doc: PaywallDocument;
  host: PaywallHost;
  products: Record<string, ResolvedProduct>;
}

/**
 * Owns everything a single paywall screen needs beyond the pure `renderNode`
 * tree: which package is selected, dispatching actions to the host, and the
 * screen background. `useActionDispatcher` (Phase 2) replaces the body of
 * `onAction` below with the busy-latch/watchdog/`onEvent` version — this
 * component's shape does not change then, only what `onAction` calls.
 */
export const RenderDocument = ({
  doc,
  host,
  products,
}: RenderDocumentProps): React.ReactElement => {
  const [selectedPackageId, setSelectedPackageId] = useState<string>(
    () =>
      doc.packages.find((pkg) => pkg.selectedByDefault)?.id ??
      doc.packages[0]?.id ??
      ''
  );

  const onAction = useCallback(
    (action: Action) => {
      switch (action.type) {
        case 'purchase':
          host.onPurchase(action.packageId ?? selectedPackageId);
          break;
        case 'restore':
          host.onRestore();
          break;
        case 'dismiss':
          host.onDismiss();
          break;
        case 'openURL':
          host.onOpenURL?.(action.url);
          break;
      }
    },
    [host, selectedPackageId]
  );

  const ctx = useMemo<RenderContext>(
    () => ({
      packages: doc.packages,
      products,
      selectedPackageId,
      onSelectPackage: setSelectedPackageId,
      onAction,
    }),
    [doc.packages, products, selectedPackageId, onAction]
  );

  return (
    <View
      style={[styles.container, { backgroundColor: doc.background?.color }]}
    >
      {doc.background?.image != null && (
        <Image
          source={{ uri: doc.background.image.uri }}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
        />
      )}
      {renderNode(doc.root, ctx)}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
