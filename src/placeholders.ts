import type { PackageDefinition, ResolvedProduct } from './schema';
import type { RenderContext } from './renderContext';

/**
 * Any `{{...}}` run, not just the tokens we know. Matching broadly is what
 * makes "never leaks raw `{{...}}` to the user" true: a malformed or foreign
 * token like `{{price}}` has to be consumed and emptied, and a pattern that
 * only matched valid tokens would print it verbatim on the paywall.
 */
const TOKEN = /\{\{([^{}]*)\}\}/g;

/**
 * Resolve `{{package.*}}` tokens in a user-visible string.
 *
 * The token set is closed (see SCHEMA.md). An unknown or unresolvable
 * token becomes an empty string — the raw `{{...}}` is never shown and nothing
 * throws.
 */
export const resolvePlaceholders = (
  input: string,
  pkg: PackageDefinition | undefined,
  product: ResolvedProduct | undefined
): string =>
  input.replace(TOKEN, (_match, token: string) => {
    switch (token.trim()) {
      case 'package.title':
        return pkg?.title ?? '';
      case 'package.price':
        return product?.price ?? '';
      case 'package.period':
        return product?.period ?? '';
      case 'package.pricePerUnit':
        return product?.pricePerUnit ?? '';
      case 'package.introPrice':
        return product?.introPrice ?? '';
      case 'package.trialLength':
        return product?.trialLength ?? '';
      default:
        return '';
    }
  });

/**
 * ctx-bound convenience: resolve a string against the currently selected
 * package. `packageList` rows call `resolvePlaceholders` directly with their
 * own row package instead.
 */
export const resolveText = (text: string, ctx: RenderContext): string => {
  const pkg = ctx.packages.find((p) => p.id === ctx.selectedPackageId);
  const product = pkg ? ctx.products[pkg.productId] : undefined;
  return resolvePlaceholders(text, pkg, product);
};
