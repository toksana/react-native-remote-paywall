import React, { useCallback, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import type { PaywallDocument, PaywallHost, ResolvedProduct } from './schema';
import type { RenderContext } from './renderContext';
import { renderNode } from './renderNode';
import { useActionDispatcher } from './useActionDispatcher';
import { EVENT } from './constants';

export interface RenderDocumentProps {
  doc: PaywallDocument;
  host: PaywallHost;
  products: Record<string, ResolvedProduct>;
}

/**
 * Owns everything a single paywall screen needs beyond the pure `renderNode`
 * tree: which package is selected, dispatching actions to the host (via
 * `useActionDispatcher`, which also owns the busy latch), and the screen
 * background.
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

  const onSelectPackage = useCallback(
    (packageId: string) => {
      setSelectedPackageId(packageId);
      host.onEvent?.({ name: EVENT.selectPackage, payload: { packageId } });
    },
    [host]
  );

  const { onAction, busy } = useActionDispatcher(host, selectedPackageId);

  const ctx = useMemo<RenderContext>(
    () => ({
      packages: doc.packages,
      products,
      selectedPackageId,
      onSelectPackage,
      onAction,
      busy,
    }),
    [doc.packages, products, selectedPackageId, onSelectPackage, onAction, busy]
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
