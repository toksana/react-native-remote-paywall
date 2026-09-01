import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { RemotePaywall } from './RemotePaywall';
import type { PaywallClient, PaywallSnapshot } from './paywallClient';
import type { PaywallDocument, PaywallHost } from './schema';

const doc: PaywallDocument = {
  schemaVersion: 1,
  id: 'default',
  revision: 'v1',
  packages: [{ id: 'annual', productId: 'com.example.p1', title: 'Annual' }],
  root: { type: 'text', text: 'Unlock everything' },
};

const hostWith = (overrides: Partial<PaywallHost> = {}): PaywallHost => ({
  resolveProducts: jest.fn().mockResolvedValue([]),
  onPurchase: jest.fn().mockResolvedValue(undefined),
  onRestore: jest.fn().mockResolvedValue(undefined),
  onDismiss: jest.fn(),
  ...overrides,
});

const clientWith = (snapshot: PaywallSnapshot): PaywallClient => ({
  prefetch: jest.fn().mockResolvedValue(undefined),
  load: jest.fn(),
  subscribe: () => () => () => {},
  getSnapshot: () => () => snapshot,
  host: hostWith(),
});

describe('RemotePaywall', () => {
  it('throws synchronously for an invalid id', () => {
    // Arrange
    const client = clientWith({ status: 'idle', products: {} });

    // Act / Assert
    expect(() =>
      render(<RemotePaywall client={client} id="../nope" />)
    ).toThrow(RangeError);
  });

  it('calls client.load(id) on mount', () => {
    // Arrange
    const client = clientWith({ status: 'idle', products: {} });

    // Act
    render(<RemotePaywall client={client} id="default" />);

    // Assert
    expect(client.load).toHaveBeenCalledWith('default');
  });

  it('renders null with no renderLoading while idle or loading', () => {
    // Arrange
    const client = clientWith({ status: 'loading', products: {} });

    // Act
    render(<RemotePaywall client={client} id="default" />);

    // Assert
    expect(screen.toJSON()).toBeNull();
  });

  it('renders renderLoading while loading', () => {
    // Arrange
    const client = clientWith({ status: 'loading', products: {} });

    // Act
    render(
      <RemotePaywall
        client={client}
        id="default"
        renderLoading={() => <Text>Loading…</Text>}
      />
    );

    // Assert
    expect(screen.getByText('Loading…')).toBeOnTheScreen();
  });

  it('renders renderError with the snapshot error', () => {
    // Arrange
    const error = new Error('no paywall available');
    const client = clientWith({ status: 'error', products: {}, error });

    // Act
    render(
      <RemotePaywall
        client={client}
        id="default"
        renderError={(err) => <Text>Failed: {(err as Error).message}</Text>}
      />
    );

    // Assert
    expect(screen.getByText('Failed: no paywall available')).toBeOnTheScreen();
  });

  it('renders null with no renderError while in the error state', () => {
    // Arrange
    const client = clientWith({
      status: 'error',
      products: {},
      error: new Error('nope'),
    });

    // Act
    render(<RemotePaywall client={client} id="default" />);

    // Assert
    expect(screen.toJSON()).toBeNull();
  });

  it('renders the document via RenderDocument when ready', () => {
    // Arrange
    const client = clientWith({
      status: 'ready',
      doc,
      source: 'cache',
      products: {},
    });

    // Act
    render(<RemotePaywall client={client} id="default" />);

    // Assert
    expect(screen.getByText('Unlock everything')).toBeOnTheScreen();
  });
});
