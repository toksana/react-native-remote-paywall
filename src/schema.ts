/**
 * Paywall schema — v1
 *
 * A declarative description of a paywall screen, rendered into React Native
 * primitives (View / Text / Image / Pressable).
 *
 * Design rules baked into this schema:
 *
 *  1. No executable code. Every node is data. Actions are named intents that
 *     the host app handles via callbacks — the schema can never make a
 *     purchase, only ask the host to make one.
 *  2. No prices. Localized prices come from the store at runtime, never from
 *     the server. The schema references products by id and uses placeholders.
 *  3. Closed node set. Seven node types. Adding a type is a schema change,
 *     not something a config author can do.
 *  4. Forward compatible by default. Unknown node types, style keys and
 *     actions are skipped, never thrown. See SCHEMA.md.
 */

export const SCHEMA_VERSION = 1;

/** Highest schemaVersion this build understands. */
export const MAX_SUPPORTED_SCHEMA_VERSION = 1;

/* -------------------------------------------------------------------------- */
/* Document                                                                    */
/* -------------------------------------------------------------------------- */

export interface PaywallDocument {
  /** Major schema version. Documents above what the build supports are refused. */
  schemaVersion: number;

  /** Stable identifier of this paywall, chosen by the author. */
  id: string;

  /**
   * Opaque revision string, changes on every publish. Used for cache
   * comparison and for reporting which revision a user saw.
   */
  revision?: string;

  /** Products offered on this screen, in display order. */
  packages: PackageDefinition[];

  /** Root node of the layout tree. */
  root: Node;

  /** Screen background. Applied behind the root node. */
  background?: Background;

  /**
   * Free-form metadata. Ignored by the renderer, passed through to the host
   * app. Use for experiment ids, analytics tags, etc.
   */
  meta?: Record<string, string | number | boolean>;
}

export interface Background {
  color?: string;
  /** Optional full-bleed image. Prefetched before the screen is shown. */
  image?: ImageSource;
}

/* -------------------------------------------------------------------------- */
/* Packages                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A purchasable option shown on the paywall.
 *
 * Note what is NOT here: price, currency, trial length. Those are resolved at
 * runtime from the store via the host's `resolveProducts` callback, so the
 * user always sees the correct localized price for their storefront.
 */
export interface PackageDefinition {
  /** Local id, referenced by nodes and actions within this document. */
  id: string;

  /**
   * Store product identifier, e.g. "com.example.app.annual".
   * Passed verbatim to the host app; the SDK never interprets it.
   */
  productId: string;

  /** Display name, e.g. "Annual". Supports placeholders. */
  title: string;

  /** Optional second line, e.g. "{{package.price}} per year". */
  subtitle?: string;

  /** Optional corner badge, e.g. "Save 40%". */
  badge?: string;

  /** Preselected when the screen opens. At most one package may set this. */
  selectedByDefault?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Placeholders                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Any user-visible string may contain placeholders in `{{...}}` form.
 * Resolution happens at render time against the currently selected package
 * (or, inside a packageList row, against that row's package).
 *
 * Supported tokens — this list is closed:
 *
 *   {{package.title}}        title from the PackageDefinition
 *   {{package.price}}        localized price string from the store
 *   {{package.period}}       localized billing period, e.g. "month"
 *   {{package.pricePerUnit}} localized per-period price, when available
 *   {{package.introPrice}}   localized introductory price, when available
 *   {{package.trialLength}}  localized trial duration, e.g. "7 days"
 *
 * An unknown or unresolvable token renders as an empty string. It never
 * renders the raw `{{...}}` text to the user and never throws.
 */
export type TemplatedString = string;

/* -------------------------------------------------------------------------- */
/* Actions                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Named intents. The SDK does not implement any of these — it invokes the
 * corresponding host callback and lets the app's existing purchase stack
 * (StoreKit, RevenueCat, Play Billing) do the work.
 */
export type Action =
  PurchaseAction | RestoreAction | DismissAction | OpenURLAction;

export interface PurchaseAction {
  type: 'purchase';
  /** Defaults to the currently selected package. */
  packageId?: string;
}

export interface RestoreAction {
  type: 'restore';
}

export interface DismissAction {
  type: 'dismiss';
}

export interface OpenURLAction {
  type: 'openURL';
  /** Must be http(s) or mailto. Other schemes are dropped during validation. */
  url: string;
}

/* -------------------------------------------------------------------------- */
/* Style                                                                       */
/* -------------------------------------------------------------------------- */

export type DimensionValue = number | `${number}%`;

/**
 * A deliberately small, serializable subset of React Native style props.
 * Unknown keys are dropped during validation rather than passed through, so a
 * newer config cannot inject arbitrary style into an older build.
 */
export interface Style {
  // Layout
  flex?: number;
  alignSelf?: 'auto' | 'flex-start' | 'center' | 'flex-end' | 'stretch';
  width?: DimensionValue;
  height?: DimensionValue;
  minHeight?: number;
  maxWidth?: DimensionValue;
  aspectRatio?: number;

  // Spacing
  margin?: number;
  marginTop?: number;
  marginBottom?: number;
  marginHorizontal?: number;
  marginVertical?: number;
  padding?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingHorizontal?: number;
  paddingVertical?: number;

  // Surface
  backgroundColor?: string;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  opacity?: number;

  // Text — ignored on non-text nodes
  color?: string;
  fontSize?: number;
  fontWeight?:
    | 'normal'
    | 'bold'
    | '100'
    | '200'
    | '300'
    | '400'
    | '500'
    | '600'
    | '700'
    | '800'
    | '900';
  /**
   * Font family name. Must already be registered by the host app — the SDK
   * does not load fonts over the network.
   */
  fontFamily?: string;
  textAlign?: 'auto' | 'left' | 'right' | 'center';
  lineHeight?: number;
  letterSpacing?: number;
  textDecorationLine?: 'none' | 'underline' | 'line-through';
}

export interface ImageSource {
  uri: string;
  /** Fetched during prefetch so the screen never renders a hole. */
  prefetch?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Nodes                                                                       */
/* -------------------------------------------------------------------------- */

export type NodeType =
  'stack' | 'text' | 'image' | 'button' | 'packageList' | 'spacer' | 'divider';

export interface BaseNode {
  type: NodeType | string;
  /** Optional stable id, useful for host-side analytics and tests. */
  id?: string;
  style?: Style;
  /** When true, the node and its subtree are not rendered. */
  hidden?: boolean;
  /**
   * Spoken label, overriding whatever the renderer would infer. Supports
   * placeholders, which is the point: a visible label degrades to "Try free
   * for " when the store returns no trial, where a spoken one should stay a
   * whole sentence.
   *
   * Roles are deliberately not authorable — a document fetched from a server
   * must not be able to tell assistive technology that a purchase button is
   * something else.
   */
  accessibilityLabel?: TemplatedString;
  /**
   * Rendered instead of this node when the SDK does not recognise `type`.
   * This is how a newer paywall degrades gracefully on an older build.
   */
  fallback?: Node;
}

export interface StackNode extends BaseNode {
  type: 'stack';
  direction?: 'vertical' | 'horizontal';
  /** Gap between children, in points. */
  gap?: number;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'space-between';
  /** Makes the stack vertically scrollable. Only valid on vertical stacks. */
  scrollable?: boolean;
  children: Node[];
}

export interface TextNode extends BaseNode {
  type: 'text';
  text: TemplatedString;
  /** Truncate after N lines. Omit for unlimited. */
  numberOfLines?: number;
  /** Optional tap target. */
  action?: Action;
}

export interface ImageNode extends BaseNode {
  type: 'image';
  source: ImageSource;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
}

export interface ButtonNode extends BaseNode {
  type: 'button';
  label: TemplatedString;
  action: Action;
  labelStyle?: Style;
  /** Style merged over the base style while pressed. */
  pressedStyle?: Style;
  /** Style applied while a purchase or restore is in flight. */
  disabledStyle?: Style;
}

export interface PackageListNode extends BaseNode {
  type: 'packageList';
  /** Subset of document packages to show. Defaults to all, in order. */
  packageIds?: string[];
  direction?: 'vertical' | 'horizontal';
  gap?: number;

  /** Per-row styling. */
  itemStyle?: Style;
  selectedItemStyle?: Style;
  titleStyle?: Style;
  subtitleStyle?: Style;
  badgeStyle?: Style;
  badgeTextStyle?: Style;
}

export interface SpacerNode extends BaseNode {
  type: 'spacer';
  /** Fixed size in points. Ignored when `flex` is set. */
  size?: number;
  /** Flexible space that absorbs remaining room. */
  flex?: number;
}

export interface DividerNode extends BaseNode {
  type: 'divider';
  thickness?: number;
  color?: string;
}

export type Node =
  | StackNode
  | TextNode
  | ImageNode
  | ButtonNode
  | PackageListNode
  | SpacerNode
  | DividerNode;

/* -------------------------------------------------------------------------- */
/* Host interface                                                              */
/* -------------------------------------------------------------------------- */

/** Runtime product data supplied by the host app, sourced from the store. */
export interface ResolvedProduct {
  productId: string;
  price: string;
  period?: string;
  pricePerUnit?: string;
  introPrice?: string;
  trialLength?: string;
}

/** Payload passed to {@link PaywallHost.onEvent}. */
export interface PaywallEvent {
  name: string;
  payload?: Record<string, unknown>;
}

/**
 * Everything the SDK needs from the host. Note that none of the purchase
 * primitives are implemented by the SDK: purchases, restores and product
 * lookup all stay in the app's existing stack.
 */
export interface PaywallHost {
  resolveProducts(productIds: string[]): Promise<ResolvedProduct[]>;
  onPurchase(productId: string): Promise<void>;
  onRestore(): Promise<void>;
  onDismiss(): void;
  onOpenURL?(url: string): void;
  /** Fired for every action and selection change. Optional analytics hook. */
  onEvent?(event: PaywallEvent): void;
  /**
   * Called once when a paywall cannot be shown at all — no fresh document, no
   * cache, and no bundled fallback for the requested id. Never fired for a
   * failed background refresh when something is already on screen.
   */
  onError?(error: unknown): void;
}

/** Pluggable persistence. Defaults to in-memory, so the SDK ships with zero deps. */
export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
