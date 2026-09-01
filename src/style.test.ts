import { STYLE_KEYS, sanitizeStyle, toRNStyle } from './style';
import type { Style } from './schema';

describe('STYLE_KEYS', () => {
  it('has no duplicates', () => {
    // Arrange / Act
    const unique = new Set<string>(STYLE_KEYS);

    // Assert
    expect(unique.size).toBe(STYLE_KEYS.length);
  });

  it('covers every key a Style object can carry', () => {
    // Arrange — a Style with every optional key present. Omitting one makes
    // this fail to compile, which is the point: the object is the exhaustive
    // list, checked by tsc rather than by eye.
    const everyKey: Required<Style> = {
      flex: 1,
      alignSelf: 'center',
      width: '100%',
      height: 40,
      minHeight: 10,
      maxWidth: '50%',
      aspectRatio: 1.6,
      margin: 1,
      marginTop: 1,
      marginBottom: 1,
      marginHorizontal: 1,
      marginVertical: 1,
      padding: 1,
      paddingTop: 1,
      paddingBottom: 1,
      paddingHorizontal: 1,
      paddingVertical: 1,
      backgroundColor: '#000',
      borderRadius: 1,
      borderWidth: 1,
      borderColor: '#111',
      opacity: 0.5,
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
      fontFamily: 'Inter',
      textAlign: 'center',
      lineHeight: 20,
      letterSpacing: 0.2,
      textDecorationLine: 'underline',
    };

    // Act
    const survivors = sanitizeStyle(everyKey);

    // Assert
    expect(Object.keys(survivors).sort()).toEqual([...STYLE_KEYS].sort());
  });
});

describe('sanitizeStyle', () => {
  // The allow-list is public contract: it stops a newer document from reaching
  // style props this build never intended to expose. See the forward
  // compatibility section of SCHEMA.md.
  it('drops style keys outside the allow-list', () => {
    // Arrange
    const raw = {
      color: '#fff',
      position: 'absolute',
      transform: 'translateX(10px)',
      zIndex: 99,
      shadowColor: '#000',
    };

    // Act
    const result = sanitizeStyle(raw);

    // Assert
    expect(result).toEqual({ color: '#fff' });
  });

  it('drops values that are neither string nor number', () => {
    // Arrange
    const raw = {
      fontSize: 16,
      margin: { top: 4 },
      padding: [1, 2],
      opacity: null,
      flex: true,
      borderColor: () => '#000',
    };

    // Act
    const result = sanitizeStyle(raw);

    // Assert
    expect(result).toEqual({ fontSize: 16 });
  });

  it('returns a fresh object rather than the input', () => {
    // Arrange
    const raw: Style = { color: '#fff' };

    // Act
    const result = sanitizeStyle(raw);

    // Assert
    expect(result).not.toBe(raw);
    expect(result).toEqual(raw);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an array', ['color']],
    ['a string', 'color: red'],
    ['a number', 42],
  ])('returns an empty style for %s', (_case, raw) => {
    // Arrange / Act
    const result = sanitizeStyle(raw);

    // Assert
    expect(result).toEqual({});
  });

  it('keeps an implausible dimension rather than parsing it', () => {
    // Arrange — documented trade-off: RN ignores a nonsense dimension, and a
    // per-key value parser would be a second schema to keep in sync.
    const raw = { width: 'abc' };

    // Act
    const result = sanitizeStyle(raw);

    // Assert
    expect(result).toEqual({ width: 'abc' });
  });
});

describe('toRNStyle', () => {
  it('passes a sanitized style through untouched', () => {
    // Arrange
    const style = sanitizeStyle({ color: '#fff', fontSize: 16 });

    // Act
    const result = toRNStyle(style);

    // Assert
    expect(result).toBe(style);
  });

  it('passes undefined through, so an unstyled node stays unstyled', () => {
    // Arrange / Act
    const result = toRNStyle(undefined);

    // Assert
    expect(result).toBeUndefined();
  });
});
