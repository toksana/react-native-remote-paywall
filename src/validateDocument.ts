import { ALLOWED_URL_SCHEMES } from './constants';
import { sanitizeStyle } from './style';
import { MAX_SUPPORTED_SCHEMA_VERSION } from './schema';
import type {
  Action,
  Background,
  BaseNode,
  ButtonNode,
  DividerNode,
  ImageNode,
  Node,
  PackageDefinition,
  PackageListNode,
  PaywallDocument,
  SpacerNode,
  StackNode,
  Style,
  TextNode,
} from './schema';

export type ValidationResult =
  | { ok: true; doc: PaywallDocument }
  | { ok: false; reason: 'schema-version' | 'malformed' };

/**
 * Pure and total: every branch returns, nothing throws. This is what lets the
 * client swallow a bad document and fall through to cache/bundled instead of
 * crashing the host app. See the forward compatibility section of SCHEMA.md —
 * these rules are public contract, not implementation detail.
 */
export const validateDocument = (input: unknown): ValidationResult => {
  if (!isPlainObject(input)) return { ok: false, reason: 'malformed' };

  const schemaVersion = input.schemaVersion;
  if (typeof schemaVersion !== 'number')
    return { ok: false, reason: 'malformed' };
  if (schemaVersion > MAX_SUPPORTED_SCHEMA_VERSION) {
    return { ok: false, reason: 'schema-version' };
  }

  if (typeof input.id !== 'string') return { ok: false, reason: 'malformed' };
  if (!Array.isArray(input.packages)) return { ok: false, reason: 'malformed' };
  if (!isPlainObject(input.root)) return { ok: false, reason: 'malformed' };

  const root = validateNode(input.root);
  if (root == null) return { ok: false, reason: 'malformed' };

  const doc: PaywallDocument & Record<string, unknown> = {
    ...extraTopLevelFields(input),
    schemaVersion,
    id: input.id,
    packages: validatePackages(input.packages),
    root,
    ...(typeof input.revision === 'string' ? { revision: input.revision } : {}),
    ...maybeField('background', validateBackground(input.background)),
    ...maybeField(
      'meta',
      isPlainObject(input.meta) ? sanitizeMeta(input.meta) : undefined
    ),
  };

  return { ok: true, doc };
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOneOf = <T extends string>(
  value: unknown,
  options: readonly T[]
): value is T =>
  typeof value === 'string' && (options as readonly string[]).includes(value);

/** Spreads `{ [key]: value }` only when `value` is not `undefined`. */
const maybeField = <K extends string, V>(
  key: K,
  value: V | undefined
): Record<K, V> | Record<string, never> =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'schemaVersion',
  'id',
  'revision',
  'packages',
  'root',
  'background',
  'meta',
]);

/** Unknown top-level fields are preserved but ignored — SCHEMA.md's forward compatibility rule. */
const extraTopLevelFields = (
  input: Record<string, unknown>
): Record<string, unknown> => {
  const extra: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) extra[key] = input[key];
  }
  return extra;
};

const sanitizeMeta = (
  raw: Record<string, unknown>
): Record<string, string | number | boolean> => {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[key] = value;
    }
  }
  return out;
};

const validateBackground = (input: unknown): Background | undefined => {
  if (!isPlainObject(input)) return undefined;
  const color = typeof input.color === 'string' ? input.color : undefined;
  const image =
    isPlainObject(input.image) && typeof input.image.uri === 'string'
      ? {
          uri: input.image.uri,
          ...(input.image.prefetch === true ? { prefetch: true } : {}),
        }
      : undefined;
  if (color == null && image == null) return undefined;
  return {
    ...(color != null ? { color } : {}),
    ...(image != null ? { image } : {}),
  };
};

/* -------------------------------------------------------------------------- */
/* Packages                                                                    */
/* -------------------------------------------------------------------------- */

const validatePackages = (input: unknown[]): PackageDefinition[] => {
  const packages = input
    .filter(isPlainObject)
    .filter(
      (
        raw
      ): raw is Record<string, unknown> & { id: string; productId: string } =>
        typeof raw.id === 'string' && typeof raw.productId === 'string'
    )
    .map((raw): PackageDefinition => ({
      id: raw.id,
      productId: raw.productId,
      title: typeof raw.title === 'string' ? raw.title : '',
      ...(typeof raw.subtitle === 'string' ? { subtitle: raw.subtitle } : {}),
      ...(typeof raw.badge === 'string' ? { badge: raw.badge } : {}),
      ...(raw.selectedByDefault === true ? { selectedByDefault: true } : {}),
    }));

  // At most one `selectedByDefault` may survive — first one in document order wins.
  let seenDefault = false;
  return packages.map((pkg): PackageDefinition => {
    if (!pkg.selectedByDefault) return pkg;
    if (seenDefault) return { ...pkg, selectedByDefault: undefined };
    seenDefault = true;
    return pkg;
  });
};

/* -------------------------------------------------------------------------- */
/* Actions                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A button's `action` is required by the schema, so a missing or malformed
 * one still needs somewhere to go: this sentinel is not a real action type,
 * which routes it through the same "unknown action" path as a genuinely novel
 * type — the node renders, the tap is inert, and an `onEvent` fires.
 */
const MALFORMED_ACTION = { type: 'malformed' } as unknown as Action;

const validateAction = (input: unknown): Action | undefined => {
  if (!isPlainObject(input) || typeof input.type !== 'string') return undefined;

  switch (input.type) {
    case 'purchase':
      return {
        type: 'purchase',
        ...(typeof input.packageId === 'string'
          ? { packageId: input.packageId }
          : {}),
      };
    case 'restore':
      return { type: 'restore' };
    case 'dismiss':
      return { type: 'dismiss' };
    case 'openURL': {
      if (typeof input.url !== 'string') return undefined;
      const lower = input.url.toLowerCase();
      const allowed = ALLOWED_URL_SCHEMES.some((scheme) =>
        lower.startsWith(scheme)
      );
      return allowed ? { type: 'openURL', url: input.url } : undefined;
    }
    default:
      // Unknown action type: preserved verbatim. The dispatcher, not the
      // validator, decides what "renders but taps do nothing" means.
      return input as unknown as Action;
  }
};

/* -------------------------------------------------------------------------- */
/* Nodes                                                                       */
/* -------------------------------------------------------------------------- */

const baseFields = (
  raw: Record<string, unknown>
): Omit<Partial<BaseNode>, 'type'> => ({
  ...(typeof raw.id === 'string' ? { id: raw.id } : {}),
  ...(isPlainObject(raw.style) ? { style: sanitizeStyle(raw.style) } : {}),
  ...(raw.hidden === true ? { hidden: true } : {}),
  ...(typeof raw.accessibilityLabel === 'string'
    ? { accessibilityLabel: raw.accessibilityLabel }
    : {}),
  ...maybeField(
    'fallback',
    isPlainObject(raw.fallback)
      ? (validateNode(raw.fallback) ?? undefined)
      : undefined
  ),
});

const styleEntries = (
  raw: Record<string, unknown>,
  keys: string[]
): Record<string, Style> => {
  const out: Record<string, Style> = {};
  for (const key of keys) {
    if (isPlainObject(raw[key])) out[key] = sanitizeStyle(raw[key]);
  }
  return out;
};

export const validateNode = (input: unknown): Node | null => {
  if (!isPlainObject(input)) return null;

  switch (input.type) {
    case 'stack':
      return validateStack(input);
    case 'text':
      return validateText(input);
    case 'image':
      return validateImage(input);
    case 'button':
      return validateButton(input);
    case 'packageList':
      return validatePackageList(input);
    case 'spacer':
      return validateSpacer(input);
    case 'divider':
      return validateDivider(input);
    default:
      return validateUnknownNode(input);
  }
};

/** Unknown type: keep the validated `fallback` subtree, else drop the node entirely. */
const validateUnknownNode = (raw: Record<string, unknown>): Node | null => {
  if (!isPlainObject(raw.fallback)) return null;
  const fallback = validateNode(raw.fallback);
  return fallback == null ? null : ({ ...raw, fallback } as unknown as Node);
};

const validateStack = (raw: Record<string, unknown>): StackNode => ({
  type: 'stack',
  ...baseFields(raw),
  ...(isOneOf(raw.direction, ['vertical', 'horizontal'] as const)
    ? { direction: raw.direction }
    : {}),
  ...(typeof raw.gap === 'number' ? { gap: raw.gap } : {}),
  ...(isOneOf(raw.align, ['start', 'center', 'end', 'stretch'] as const)
    ? { align: raw.align }
    : {}),
  ...(isOneOf(raw.justify, ['start', 'center', 'end', 'space-between'] as const)
    ? { justify: raw.justify }
    : {}),
  ...(raw.scrollable === true ? { scrollable: true } : {}),
  children: Array.isArray(raw.children)
    ? raw.children.map(validateNode).filter((n): n is Node => n != null)
    : [],
});

const validateText = (raw: Record<string, unknown>): TextNode => ({
  type: 'text',
  ...baseFields(raw),
  text: typeof raw.text === 'string' ? raw.text : '',
  ...(typeof raw.numberOfLines === 'number'
    ? { numberOfLines: raw.numberOfLines }
    : {}),
  ...maybeField('action', validateAction(raw.action)),
});

const validateImage = (raw: Record<string, unknown>): ImageNode => ({
  type: 'image',
  ...baseFields(raw),
  source:
    isPlainObject(raw.source) && typeof raw.source.uri === 'string'
      ? {
          uri: raw.source.uri,
          ...(raw.source.prefetch === true ? { prefetch: true } : {}),
        }
      : { uri: '' },
  ...(isOneOf(raw.resizeMode, [
    'cover',
    'contain',
    'stretch',
    'center',
  ] as const)
    ? { resizeMode: raw.resizeMode }
    : {}),
});

const validateButton = (raw: Record<string, unknown>): ButtonNode => ({
  type: 'button',
  ...baseFields(raw),
  label: typeof raw.label === 'string' ? raw.label : '',
  action: validateAction(raw.action) ?? MALFORMED_ACTION,
  ...styleEntries(raw, ['labelStyle', 'pressedStyle', 'disabledStyle']),
});

const validatePackageList = (
  raw: Record<string, unknown>
): PackageListNode => ({
  type: 'packageList',
  ...baseFields(raw),
  ...(Array.isArray(raw.packageIds)
    ? {
        packageIds: raw.packageIds.filter(
          (id): id is string => typeof id === 'string'
        ),
      }
    : {}),
  ...(isOneOf(raw.direction, ['vertical', 'horizontal'] as const)
    ? { direction: raw.direction }
    : {}),
  ...(typeof raw.gap === 'number' ? { gap: raw.gap } : {}),
  ...styleEntries(raw, [
    'itemStyle',
    'selectedItemStyle',
    'titleStyle',
    'subtitleStyle',
    'badgeStyle',
    'badgeTextStyle',
  ]),
});

const validateSpacer = (raw: Record<string, unknown>): SpacerNode => ({
  type: 'spacer',
  ...baseFields(raw),
  ...(typeof raw.size === 'number' ? { size: raw.size } : {}),
  ...(typeof raw.flex === 'number' ? { flex: raw.flex } : {}),
});

const validateDivider = (raw: Record<string, unknown>): DividerNode => ({
  type: 'divider',
  ...baseFields(raw),
  ...(typeof raw.thickness === 'number' ? { thickness: raw.thickness } : {}),
  ...(typeof raw.color === 'string' ? { color: raw.color } : {}),
});
