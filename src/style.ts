import type { ImageStyle, StyleProp, TextStyle, ViewStyle } from 'react-native';

import type { Style } from './schema';

/**
 * Every key of the schema `Style` type, as a runtime value. Validation keeps
 * only these keys from an incoming document, so a newer document can never
 * reach a React Native style prop this build did not intend to expose.
 *
 * The two type checks below fail to compile if this list drifts from `Style`:
 * `AssertOnlyStyleKeys` rejects an extra key, and the `MissingStyleKeys`
 * conditional collapses `STYLE_KEYS` to `never` (an un-assignable type) if a
 * `Style` key is not listed. `src/style.test.ts` covers it at runtime too.
 */
const STYLE_KEY_LIST = [
  'flex',
  'alignSelf',
  'width',
  'height',
  'minHeight',
  'maxWidth',
  'aspectRatio',
  'margin',
  'marginTop',
  'marginBottom',
  'marginHorizontal',
  'marginVertical',
  'padding',
  'paddingTop',
  'paddingBottom',
  'paddingHorizontal',
  'paddingVertical',
  'backgroundColor',
  'borderRadius',
  'borderWidth',
  'borderColor',
  'opacity',
  'color',
  'fontSize',
  'fontWeight',
  'fontFamily',
  'textAlign',
  'lineHeight',
  'letterSpacing',
  'textDecorationLine',
] as const;

type AssertOnlyStyleKeys<T extends readonly (keyof Style)[]> = T;
type MissingStyleKeys = Exclude<keyof Style, (typeof STYLE_KEY_LIST)[number]>;

export const STYLE_KEYS: AssertOnlyStyleKeys<
  [MissingStyleKeys] extends [never] ? typeof STYLE_KEY_LIST : never
> = STYLE_KEY_LIST;

const STYLE_KEY_SET: ReadonlySet<string> = new Set(STYLE_KEYS);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Keep only known `Style` keys whose value is a string or number. Anything else
 * — unknown keys, nested objects, arrays, functions — is dropped. Returns a
 * fresh object; never throws.
 *
 * Values are checked by primitive type, not by shape: `width: "abc"` survives
 * even though `DimensionValue` only admits `"50%"`. React Native ignores a
 * nonsense dimension, so the cost of being wrong is a layout that looks off,
 * while the cost of a per-key value parser is a second schema to keep in sync.
 */
export const sanitizeStyle = (raw: unknown): Style => {
  if (!isPlainObject(raw)) return {};

  const out: Record<string, string | number> = {};
  for (const key of Object.keys(raw)) {
    if (!STYLE_KEY_SET.has(key)) continue;
    const value = raw[key];
    if (typeof value === 'string' || typeof value === 'number') {
      out[key] = value;
    }
  }
  return out as Style;
};

/**
 * A validated `Style` is already a 1:1 subset of RN style names, so this is a
 * typed pass-through. Text keys on a `View` (or view keys on a `Text`) are
 * harmless — RN ignores what does not apply.
 *
 * The cast is only sound while every `Style` reaching the renderer has passed
 * through `sanitizeStyle` first. `validateDocument` is the single place that
 * has to hold that invariant; if a second path into the renderer ever appears,
 * it sanitizes or this becomes a hole.
 */
export const toRNStyle = (
  style?: Style
): StyleProp<ViewStyle & TextStyle & ImageStyle> | undefined =>
  style as StyleProp<ViewStyle & TextStyle & ImageStyle> | undefined;
