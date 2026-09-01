import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useActionDispatcher } from './useActionDispatcher';
import { HOST_CALLBACK_TIMEOUT_MS } from './constants';
import type { PaywallHost } from './schema';

const hostWith = (overrides: Partial<PaywallHost> = {}): PaywallHost => ({
  resolveProducts: jest.fn().mockResolvedValue([]),
  onPurchase: jest.fn().mockResolvedValue(undefined),
  onRestore: jest.fn().mockResolvedValue(undefined),
  onDismiss: jest.fn(),
  ...overrides,
});

describe('useActionDispatcher', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('dispatches purchase to the host, defaulting to the selected package', async () => {
    // Arrange
    const onPurchase = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useActionDispatcher(hostWith({ onPurchase }), 'annual')
    );

    // Act — async act so the latch-releasing microtask settles inside it.
    await act(async () => {
      result.current.onAction({ type: 'purchase' });
    });

    // Assert
    expect(onPurchase).toHaveBeenCalledWith('annual');
  });

  it('prefers an explicit packageId over the selected one', async () => {
    // Arrange
    const onPurchase = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useActionDispatcher(hostWith({ onPurchase }), 'annual')
    );

    // Act — async act so the latch-releasing microtask settles inside it.
    await act(async () => {
      result.current.onAction({ type: 'purchase', packageId: 'monthly' });
    });

    // Assert
    expect(onPurchase).toHaveBeenCalledWith('monthly');
  });

  it('sets busy while purchase is in flight and clears it once it settles', async () => {
    // Arrange
    let resolvePurchase!: () => void;
    const onPurchase = jest.fn(
      () => new Promise<void>((resolve) => (resolvePurchase = resolve))
    );
    const { result } = renderHook(() =>
      useActionDispatcher(hostWith({ onPurchase }), 'annual')
    );

    // Act
    act(() => result.current.onAction({ type: 'purchase' }));

    // Assert
    expect(result.current.busy).toBe(true);

    // Act
    await act(async () => {
      resolvePurchase();
    });

    // Assert
    await waitFor(() => expect(result.current.busy).toBe(false));
  });

  it('ignores a second purchase tap while the first is still in flight', () => {
    // Arrange
    const onPurchase = jest.fn().mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() =>
      useActionDispatcher(hostWith({ onPurchase }), 'annual')
    );

    // Act
    act(() => {
      result.current.onAction({ type: 'purchase' });
      result.current.onAction({ type: 'purchase' });
    });

    // Assert
    expect(onPurchase).toHaveBeenCalledTimes(1);
  });

  it('releases the busy latch via the watchdog when the host promise never settles', async () => {
    // Arrange
    jest.useFakeTimers();
    const onEvent = jest.fn();
    const onPurchase = jest.fn().mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() =>
      useActionDispatcher(hostWith({ onPurchase, onEvent }), 'annual')
    );

    // Act
    act(() => result.current.onAction({ type: 'purchase' }));
    expect(result.current.busy).toBe(true);
    await act(() => jest.advanceTimersByTimeAsync(HOST_CALLBACK_TIMEOUT_MS));

    // Assert
    expect(result.current.busy).toBe(false);
    expect(onEvent).toHaveBeenCalledWith({ name: 'host_callback_timeout' });
  });

  it('turns a synchronous throw into a settled, non-busy state', async () => {
    // Arrange
    const onPurchase = jest.fn(() => {
      throw new Error('boom');
    });
    const { result } = renderHook(() =>
      useActionDispatcher(hostWith({ onPurchase }), 'annual')
    );

    // Act / Assert — the throw is contained; it doesn't propagate to the caller.
    expect(() =>
      act(() => result.current.onAction({ type: 'purchase' }))
    ).not.toThrow();
    await waitFor(() => expect(result.current.busy).toBe(false));
  });

  it('never gates dismiss behind the busy latch', () => {
    // Arrange
    const onPurchase = jest.fn().mockReturnValue(new Promise(() => {}));
    const onDismiss = jest.fn();
    const { result } = renderHook(() =>
      useActionDispatcher(hostWith({ onPurchase, onDismiss }), 'annual')
    );

    // Act — purchase is in flight, busy is true...
    act(() => result.current.onAction({ type: 'purchase' }));
    expect(result.current.busy).toBe(true);

    // Act — ...but dismiss still goes through.
    act(() => result.current.onAction({ type: 'dismiss' }));

    // Assert
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('never gates openURL behind the busy latch', () => {
    // Arrange
    const onPurchase = jest.fn().mockReturnValue(new Promise(() => {}));
    const onOpenURL = jest.fn();
    const { result } = renderHook(() =>
      useActionDispatcher(hostWith({ onPurchase, onOpenURL }), 'annual')
    );

    // Act
    act(() => result.current.onAction({ type: 'purchase' }));
    act(() =>
      result.current.onAction({
        type: 'openURL',
        url: 'https://example.com',
      })
    );

    // Assert
    expect(onOpenURL).toHaveBeenCalledWith('https://example.com');
  });

  it('no-ops an unknown action type and emits onEvent', () => {
    // Arrange
    const onEvent = jest.fn();
    const { result } = renderHook(() =>
      useActionDispatcher(hostWith({ onEvent }), 'annual')
    );
    const unknownAction = { type: 'confetti' } as unknown as Parameters<
      typeof result.current.onAction
    >[0];

    // Act / Assert
    expect(() =>
      act(() => result.current.onAction(unknownAction))
    ).not.toThrow();
    expect(onEvent).toHaveBeenCalledWith({ name: 'action_unknown' });
  });

  it('emits an onEvent for every action type', () => {
    // Arrange
    const onEvent = jest.fn();
    const { result } = renderHook(() =>
      useActionDispatcher(hostWith({ onEvent }), 'annual')
    );

    // Act
    act(() => result.current.onAction({ type: 'dismiss' }));

    // Assert
    expect(onEvent).toHaveBeenCalledWith({ name: 'action_dismiss' });
  });
});
