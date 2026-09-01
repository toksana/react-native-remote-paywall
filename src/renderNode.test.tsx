import { render, screen, fireEvent } from '@testing-library/react-native';
import { View } from 'react-native';

import { renderNode } from './renderNode';
import type { RenderContext } from './renderContext';
import type { Node, PackageDefinition } from './schema';

const annual: PackageDefinition = {
  id: 'annual',
  productId: 'com.example.app.pro.annual',
  title: 'Annual',
};

const contextWith = (
  overrides: Partial<RenderContext> = {}
): RenderContext => ({
  packages: [annual],
  products: {
    [annual.productId]: {
      productId: annual.productId,
      price: '$39.99',
      period: 'year',
      trialLength: '7 days',
    },
  },
  selectedPackageId: annual.id,
  onSelectPackage: jest.fn(),
  onAction: jest.fn(),
  ...overrides,
});

// Wrapped in a host element, because renderNode returns null for a hidden or
// unknown node and a tree that renders to nothing leaves the test renderer
// unmounted. A node always has a parent in real use anyway.
const renderTree = (node: Node, ctx: RenderContext = contextWith()) =>
  render(<View>{renderNode(node, ctx)}</View>);

describe('renderNode', () => {
  it('renders nothing for a hidden node', () => {
    // Arrange
    const node: Node = { type: 'text', text: 'Secret', hidden: true };

    // Act
    const element = renderNode(node, contextWith());

    // Assert
    expect(element).toBeNull();
  });

  it('skips a hidden subtree, not just the node itself', () => {
    // Arrange
    const node: Node = {
      type: 'stack',
      hidden: true,
      children: [{ type: 'text', text: 'Inside' }],
    };

    // Act
    renderTree(node);

    // Assert
    expect(screen.queryByText('Inside')).toBeNull();
  });
});

// Forward compatibility is public contract. See the corresponding section of
// SCHEMA.md — these two cases are the "unknown node type" rule.
describe('unknown node types', () => {
  it('renders the fallback subtree in place of a type it does not know', () => {
    // Arrange — the countdownTimer demo from templates/example.json.
    const node = {
      type: 'countdownTimer',
      endsAt: '2026-09-01T00:00:00Z',
      fallback: { type: 'text', text: 'Offer ends soon' },
    } as unknown as Node;

    // Act
    renderTree(node);

    // Assert
    expect(screen.getByText('Offer ends soon')).toBeOnTheScreen();
  });

  it('skips an unknown node with no fallback and keeps its siblings', () => {
    // Arrange
    const node = {
      type: 'stack',
      children: [
        { type: 'text', text: 'Before' },
        { type: 'lottieAnimation', source: 'confetti' },
        { type: 'text', text: 'After' },
      ],
    } as unknown as Node;

    // Act
    renderTree(node);

    // Assert
    expect(screen.getByText('Before')).toBeOnTheScreen();
    expect(screen.getByText('After')).toBeOnTheScreen();
  });
});

describe('text', () => {
  it('resolves placeholders against the selected package', () => {
    // Arrange
    const node: Node = {
      type: 'text',
      text: 'Then {{package.price}} per {{package.period}}.',
    };

    // Act
    renderTree(node);

    // Assert
    expect(screen.getByText('Then $39.99 per year.')).toBeOnTheScreen();
  });

  it('dispatches its action when tapped', () => {
    // Arrange
    const onAction = jest.fn();
    const node: Node = {
      type: 'text',
      text: 'Restore',
      action: { type: 'restore' },
    };

    // Act
    renderTree(node, contextWith({ onAction }));
    fireEvent.press(screen.getByText('Restore'));

    // Assert
    expect(onAction).toHaveBeenCalledWith({ type: 'restore' });
  });
});

describe('button', () => {
  it('dispatches its action when tapped', () => {
    // Arrange
    const onAction = jest.fn();
    const node: Node = {
      type: 'button',
      label: 'Continue',
      action: { type: 'purchase' },
    };

    // Act
    renderTree(node, contextWith({ onAction }));
    fireEvent.press(screen.getByRole('button'));

    // Assert
    expect(onAction).toHaveBeenCalledWith({ type: 'purchase' });
  });

  it('ignores taps while a purchase is in flight', () => {
    // Arrange
    const onAction = jest.fn();
    const node: Node = {
      type: 'button',
      label: 'Continue',
      action: { type: 'purchase' },
    };

    // Act
    renderTree(node, contextWith({ onAction, busy: true }));
    fireEvent.press(screen.getByRole('button'));

    // Assert
    expect(onAction).not.toHaveBeenCalled();
  });
});

// The accessibility table in SCHEMA.md is contract like any other rule.
describe('accessibility', () => {
  it('announces a button as a button', () => {
    // Arrange
    const node: Node = {
      type: 'button',
      label: 'Continue',
      action: { type: 'purchase' },
    };

    // Act
    renderTree(node);

    // Assert
    expect(screen.getByRole('button')).toBeOnTheScreen();
  });

  it('announces a button as disabled while a purchase is in flight', () => {
    // Arrange
    const node: Node = {
      type: 'button',
      label: 'Continue',
      action: { type: 'purchase' },
    };

    // Act
    renderTree(node, contextWith({ busy: true }));

    // Assert
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('announces text opening a URL as a link', () => {
    // Arrange
    const node: Node = {
      type: 'text',
      text: 'Terms',
      action: { type: 'openURL', url: 'https://example.com/terms' },
    };

    // Act
    renderTree(node);

    // Assert
    expect(screen.getByRole('link')).toBeOnTheScreen();
  });

  it('announces text with a non-navigating action as a button, not a link', () => {
    // Arrange — "Restore" reads as a link but never leaves the app.
    const node: Node = {
      type: 'text',
      text: 'Restore',
      action: { type: 'restore' },
    };

    // Act
    renderTree(node);

    // Assert
    expect(screen.getByRole('button')).toBeOnTheScreen();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('gives untappable text no role', () => {
    // Arrange
    const node: Node = { type: 'text', text: 'Unlock everything' };

    // Act
    renderTree(node);

    // Assert
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('speaks the authored label instead of a visible one left dangling', () => {
    // Arrange — the store returned no trial, so the visible label degrades.
    const node: Node = {
      type: 'button',
      label: 'Try free for {{package.trialLength}}',
      accessibilityLabel:
        'Subscribe for {{package.price}} per {{package.period}}',
      action: { type: 'purchase' },
    };
    const ctx = contextWith({
      products: {
        [annual.productId]: {
          productId: annual.productId,
          price: '$39.99',
          period: 'year',
        },
      },
    });

    // Act
    renderTree(node, ctx);

    // Assert
    expect(screen.getByText('Try free for ')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Subscribe for $39.99 per year')
    ).toBeOnTheScreen();
  });
});

describe('stack', () => {
  it('renders children in document order', () => {
    // Arrange
    const node: Node = {
      type: 'stack',
      children: [
        { type: 'text', text: 'First' },
        { type: 'text', text: 'Second' },
      ],
    };

    // Act
    renderTree(node);

    // Assert
    expect(screen.getByText('First')).toBeOnTheScreen();
    expect(screen.getByText('Second')).toBeOnTheScreen();
  });

  it('keys an id-bearing child apart from an index-keyed sibling', () => {
    // Arrange — a child with id "0" once collided with index 0.
    const node: Node = {
      type: 'stack',
      children: [
        { type: 'text', text: 'Unidentified' },
        { type: 'text', id: '0', text: 'Identified' },
      ],
    };

    // Act / Assert
    expect(() => renderTree(node)).not.toThrow();
    expect(screen.getByText('Identified')).toBeOnTheScreen();
  });
});
