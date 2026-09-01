import type { Action, PackageDefinition, ResolvedProduct } from './schema';

/**
 * Everything `renderNode` needs for a single render pass.
 *
 * Kept in its own file so the renderer and `<RenderDocument>` can share the
 * type without an import cycle.
 */
export interface RenderContext {
  /** All packages from the document, in document order. */
  packages: PackageDefinition[];

  /** Store-resolved product data, keyed by `productId`. */
  products: Record<string, ResolvedProduct>;

  /** id of the currently selected package — drives placeholder resolution and the CTA. */
  selectedPackageId: string;

  /** Selects a package from a `packageList` row tap. */
  onSelectPackage: (packageId: string) => void;

  /** Dispatched for every action: a button tap or a tappable-text tap. */
  onAction: (action: Action) => void;

  /** True while a purchase or restore is in flight — disables buttons. */
  busy?: boolean;
}
