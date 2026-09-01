import { render, screen, fireEvent } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';

import { RenderDocument } from './renderDocument';
import type { PaywallDocument, PaywallHost, ResolvedProduct } from './schema';

const annual = {
  id: 'annual',
  productId: 'com.example.app.pro.annual',
  title: 'Annual',
};

const monthly = {
  id: 'monthly',
  productId: 'com.example.app.pro.monthly',
  title: 'Monthly',
};

const products: Record<string, ResolvedProduct> = {
  [annual.productId]: {
    productId: annual.productId,
    price: '$39.99',
    period: 'year',
  },
  [monthly.productId]: {
    productId: monthly.productId,
    price: '$5.99',
    period: 'month',
  },
};

const hostWith = (overrides: Partial<PaywallHost> = {}): PaywallHost => ({
  resolveProducts: jest.fn().mockResolvedValue([]),
  onPurchase: jest.fn().mockResolvedValue(undefined),
  onRestore: jest.fn().mockResolvedValue(undefined),
  onDismiss: jest.fn(),
  ...overrides,
});

const docWith = (
  overrides: Partial<PaywallDocument> = {}
): PaywallDocument => ({
  schemaVersion: 1,
  id: 'default',
  packages: [annual, monthly],
  root: {
    type: 'text',
    text: 'CTA: {{package.price}} per {{package.period}}',
    action: { type: 'purchase' },
  },
  ...overrides,
});

describe('RenderDocument', () => {
  it('selects the package marked selectedByDefault', () => {
    // Arrange
    const doc = docWith({
      packages: [annual, { ...monthly, selectedByDefault: true }],
    });

    // Act
    render(<RenderDocument doc={doc} host={hostWith()} products={products} />);

    // Assert
    expect(screen.getByText('CTA: $5.99 per month')).toBeOnTheScreen();
  });

  it('falls back to the first package when none is marked default', () => {
    // Arrange
    const doc = docWith();

    // Act
    render(<RenderDocument doc={doc} host={hostWith()} products={products} />);

    // Assert
    expect(screen.getByText('CTA: $39.99 per year')).toBeOnTheScreen();
  });

  it('re-resolves the CTA after a packageList row is tapped', () => {
    // Arrange
    const doc = docWith({
      root: {
        type: 'stack',
        children: [
          { type: 'packageList' },
          {
            type: 'text',
            text: 'CTA: {{package.price}} per {{package.period}}',
            action: { type: 'purchase' },
          },
        ],
      },
    });

    // Act
    render(<RenderDocument doc={doc} host={hostWith()} products={products} />);
    fireEvent.press(screen.getAllByRole('radio')[1]!);

    // Assert
    expect(screen.getByText('CTA: $5.99 per month')).toBeOnTheScreen();
  });

  it('dispatches purchase for the currently selected package by default', () => {
    // Arrange
    const onPurchase = jest.fn().mockResolvedValue(undefined);
    const doc = docWith();

    // Act
    render(
      <RenderDocument
        doc={doc}
        host={hostWith({ onPurchase })}
        products={products}
      />
    );
    fireEvent.press(screen.getByText(/CTA:/));

    // Assert
    expect(onPurchase).toHaveBeenCalledWith('annual');
  });

  it('dispatches dismiss to the host', () => {
    // Arrange
    const onDismiss = jest.fn();
    const doc = docWith({
      root: { type: 'text', text: 'Close', action: { type: 'dismiss' } },
    });

    // Act
    render(
      <RenderDocument
        doc={doc}
        host={hostWith({ onDismiss })}
        products={products}
      />
    );
    fireEvent.press(screen.getByText('Close'));

    // Assert
    expect(onDismiss).toHaveBeenCalled();
  });

  it('applies the background color to the root container', () => {
    // Arrange
    const doc = docWith({ background: { color: '#123456' } });

    // Act
    render(<RenderDocument doc={doc} host={hostWith()} products={products} />);

    // Assert — the outermost View is the root container.
    const container = screen.UNSAFE_getAllByType(View)[0]!;
    const style = StyleSheet.flatten(container.props.style);
    expect(style.backgroundColor).toBe('#123456');
  });
});
