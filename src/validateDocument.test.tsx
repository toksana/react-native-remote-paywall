import { render, screen } from '@testing-library/react-native';

import { validateDocument, validateNode } from './validateDocument';
import { renderNode } from './renderNode';
import { MAX_SUPPORTED_SCHEMA_VERSION } from './schema';
import type { RenderContext } from './renderContext';
import exampleDoc from '../templates/example.json';
import remoteDoc from '../example/assets/paywalls/default.json';

const validDoc = () => ({
  schemaVersion: 1,
  id: 'default',
  packages: [
    { id: 'annual', productId: 'com.example.app.pro.annual', title: 'Annual' },
  ],
  root: { type: 'text', text: 'Hi' },
});

const omit = <T extends object, K extends keyof T>(
  obj: T,
  key: K
): Omit<T, K> => {
  const copy = { ...obj };
  delete copy[key];
  return copy;
};

describe('validateDocument', () => {
  describe('malformed', () => {
    it.each([
      ['null', null],
      ['a string', 'not a document'],
      ['a number', 42],
      ['an array', []],
      ['undefined', undefined],
    ])('rejects %s as malformed', (_label, input) => {
      // Act
      const result = validateDocument(input);

      // Assert
      expect(result).toEqual({ ok: false, reason: 'malformed' });
    });

    it('rejects a missing schemaVersion', () => {
      // Act / Assert
      expect(validateDocument(omit(validDoc(), 'schemaVersion'))).toEqual({
        ok: false,
        reason: 'malformed',
      });
    });

    it('rejects a missing id', () => {
      // Act / Assert
      expect(validateDocument(omit(validDoc(), 'id'))).toEqual({
        ok: false,
        reason: 'malformed',
      });
    });

    it('rejects a missing packages array', () => {
      // Act / Assert
      expect(validateDocument(omit(validDoc(), 'packages'))).toEqual({
        ok: false,
        reason: 'malformed',
      });
    });

    it('rejects packages that is not an array', () => {
      // Act / Assert
      expect(validateDocument({ ...validDoc(), packages: 'nope' })).toEqual({
        ok: false,
        reason: 'malformed',
      });
    });

    it('rejects a null root', () => {
      // Act / Assert
      expect(validateDocument({ ...validDoc(), root: null })).toEqual({
        ok: false,
        reason: 'malformed',
      });
    });

    it('rejects a missing root', () => {
      // Act / Assert
      expect(validateDocument(omit(validDoc(), 'root'))).toEqual({
        ok: false,
        reason: 'malformed',
      });
    });

    it('rejects a root of unknown type with no fallback — nothing left to render', () => {
      // Act / Assert
      expect(
        validateDocument({ ...validDoc(), root: { type: 'countdownTimer' } })
      ).toEqual({ ok: false, reason: 'malformed' });
    });
  });

  describe('schemaVersion gate', () => {
    it('accepts the maximum supported schemaVersion', () => {
      // Act
      const result = validateDocument({
        ...validDoc(),
        schemaVersion: MAX_SUPPORTED_SCHEMA_VERSION,
      });

      // Assert
      expect(result.ok).toBe(true);
    });

    it('rejects the whole document when schemaVersion exceeds what this build understands', () => {
      // Act
      const result = validateDocument({
        ...validDoc(),
        schemaVersion: MAX_SUPPORTED_SCHEMA_VERSION + 1,
      });

      // Assert
      expect(result).toEqual({ ok: false, reason: 'schema-version' });
    });
  });

  describe('style allow-list', () => {
    it('drops an unknown style key on the root node', () => {
      // Act
      const result = validateDocument({
        ...validDoc(),
        root: {
          type: 'text',
          text: 'Hi',
          style: { color: '#fff', position: 'absolute' },
        },
      });

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect((result.doc.root as { style?: object }).style).toEqual({
          color: '#fff',
        });
      }
    });

    it('drops an unknown style key nested in labelStyle', () => {
      // Act
      const result = validateDocument({
        ...validDoc(),
        root: {
          type: 'button',
          label: 'Continue',
          action: { type: 'purchase' },
          labelStyle: { color: '#fff', transform: 'translateX(1px)' },
        },
      });

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        const root = result.doc.root as {
          labelStyle?: object;
        };
        expect(root.labelStyle).toEqual({ color: '#fff' });
      }
    });

    it('drops an unknown style key nested in packageList itemStyle', () => {
      // Act
      const result = validateDocument({
        ...validDoc(),
        root: {
          type: 'packageList',
          itemStyle: { borderRadius: 8, zIndex: 5 },
        },
      });

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        const root = result.doc.root as { itemStyle?: object };
        expect(root.itemStyle).toEqual({ borderRadius: 8 });
      }
    });
  });

  describe('openURL scheme filter', () => {
    // eslint-disable-next-line no-script-url -- exactly the disallowed scheme under test
    it.each(['javascript:alert(1)', 'app://deep-link', 'tel:+15551234567'])(
      'drops the action for %s but keeps the node',
      (url) => {
        // Act
        const result = validateDocument({
          ...validDoc(),
          root: {
            type: 'text',
            text: 'Terms',
            action: { type: 'openURL', url },
          },
        });

        // Assert
        expect(result.ok).toBe(true);
        if (result.ok) {
          const root = result.doc.root as { text: string; action?: unknown };
          expect(root.text).toBe('Terms');
          expect(root.action).toBeUndefined();
        }
      }
    );

    it.each([
      'https://example.com/terms',
      'http://example.com',
      'mailto:a@b.com',
    ])('keeps an allowed scheme %s', (url) => {
      // Act
      const result = validateDocument({
        ...validDoc(),
        root: { type: 'text', text: 'Terms', action: { type: 'openURL', url } },
      });

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        const root = result.doc.root as { action?: { url?: string } };
        expect(root.action?.url).toBe(url);
      }
    });
  });

  describe('unknown node type', () => {
    it('keeps the validated fallback subtree instead of dropping the node', () => {
      // Act
      const result = validateDocument({
        ...validDoc(),
        root: {
          type: 'countdownTimer',
          endsAt: '2026-09-01T00:00:00Z',
          fallback: { type: 'text', text: 'Offer ends soon' },
        },
      });

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        const root = result.doc.root as {
          type: string;
          fallback?: { type: string; text?: string };
        };
        expect(root.type).toBe('countdownTimer');
        expect(root.fallback).toEqual({
          type: 'text',
          text: 'Offer ends soon',
        });
      }
    });

    it('drops an unknown child with no fallback, keeping its siblings', () => {
      // Act
      const result = validateDocument({
        ...validDoc(),
        root: {
          type: 'stack',
          children: [
            { type: 'text', text: 'Before' },
            { type: 'lottieAnimation', source: 'confetti' },
            { type: 'text', text: 'After' },
          ],
        },
      });

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        const root = result.doc.root as { children: { text: string }[] };
        expect(root.children.map((c) => c.text)).toEqual(['Before', 'After']);
      }
    });
  });

  describe('packages', () => {
    it('keeps only the first selectedByDefault when two are set', () => {
      // Act
      const result = validateDocument({
        ...validDoc(),
        packages: [
          { id: 'a', productId: 'p.a', title: 'A', selectedByDefault: true },
          { id: 'b', productId: 'p.b', title: 'B', selectedByDefault: true },
        ],
      });

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.doc.packages[0]?.selectedByDefault).toBe(true);
        expect(result.doc.packages[1]?.selectedByDefault).toBeUndefined();
      }
    });

    it('drops a package entry missing id or productId', () => {
      // Act
      const result = validateDocument({
        ...validDoc(),
        packages: [
          { id: 'a', productId: 'p.a', title: 'A' },
          { productId: 'p.b', title: 'Missing id' },
          { id: 'c', title: 'Missing productId' },
        ],
      });

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.doc.packages).toEqual([
          { id: 'a', productId: 'p.a', title: 'A' },
        ]);
      }
    });
  });

  describe('top-level fields', () => {
    it('preserves an unknown top-level field', () => {
      // Act
      const result = validateDocument({ ...validDoc(), experimentTag: 'v3' });

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(
          (result.doc as unknown as { experimentTag: string }).experimentTag
        ).toBe('v3');
      }
    });

    it('drops an invalid background and keeps a valid one', () => {
      // Act
      const withInvalidImage = validateDocument({
        ...validDoc(),
        background: { color: '#000', image: { prefetch: true } },
      });

      // Assert
      expect(withInvalidImage.ok).toBe(true);
      if (withInvalidImage.ok) {
        expect(withInvalidImage.doc.background).toEqual({ color: '#000' });
      }
    });
  });

  describe('never throws', () => {
    it.each([
      NaN,
      () => {},
      Symbol('x'),
      { packages: [null, undefined, 1, 'x', []] },
      {
        schemaVersion: 1,
        id: 'x',
        packages: [],
        root: { type: 'stack', children: 'nope' },
      },
      { schemaVersion: 1, id: 'x', packages: [], root: { type: 'button' } },
      { schemaVersion: 1, id: 'x', packages: [], root: { type: 'image' } },
      {
        schemaVersion: 1,
        id: 'x',
        packages: [],
        root: { type: 'text', action: 'nope' },
      },
    ])('does not throw for %p', (input) => {
      // Act / Assert
      expect(() => validateDocument(input)).not.toThrow();
    });
  });

  describe('the example template', () => {
    it('validates successfully', () => {
      // Act
      const result = validateDocument(exampleDoc);

      // Assert
      expect(result.ok).toBe(true);
    });

    it('renders the countdownTimer fallback as "Offer ends soon"', () => {
      // Arrange
      const result = validateDocument(exampleDoc);
      if (!result.ok)
        throw new Error('expected the example template to validate');
      const ctx: RenderContext = {
        packages: result.doc.packages,
        products: {},
        selectedPackageId: result.doc.packages[0]?.id ?? '',
        onSelectPackage: jest.fn(),
        onAction: jest.fn(),
      };

      // Act
      render(<>{renderNode(result.doc.root, ctx)}</>);

      // Assert
      expect(screen.getByText('Offer ends soon')).toBeOnTheScreen();
    });
  });

  // This file is served to the example app over the network from `main`, so an
  // invalid one would not fail loudly — the app would quietly fall back to its
  // bundled copy and the remote path would look like it works.
  describe('the document the example app fetches', () => {
    it('validates successfully', () => {
      // Act
      const result = validateDocument(remoteDoc);

      // Assert
      expect(result.ok).toBe(true);
    });

    it('is visibly distinguishable from the bundled document', () => {
      // Arrange
      const remote = validateDocument(remoteDoc);
      const bundled = validateDocument(exampleDoc);
      if (!remote.ok || !bundled.ok) throw new Error('both should validate');

      // Act / Assert — the demo relies on telling the two apart on screen.
      expect(remote.doc.revision).not.toBe(bundled.doc.revision);
      expect(JSON.stringify(remote.doc)).toContain('Fetched from GitHub');
      expect(JSON.stringify(bundled.doc)).not.toContain('Fetched from GitHub');
    });
  });
});

describe('validateNode', () => {
  it('returns null for a non-object input', () => {
    // Act / Assert
    expect(validateNode('nope')).toBeNull();
  });
});
